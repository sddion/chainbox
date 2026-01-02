import { Registry } from "./Registry";
import { Context, Ctx, Identity, ExecutionFrame, TraceFrame } from "./Context";
import { DbAdapter } from "./DbAdapter";
import { ExecutionPlanner } from "./ExecutionPlanner";
import { Mesh, MeshPayload, MeshBatchPayload } from "../transport/Mesh";
import { StorageAdapter, InMemoryStorage } from "./Storage";
import { WasmRuntime } from "./WasmRuntime";
import { RateLimiter } from "./RateLimiter";
import { AuditLog } from "./AuditLog";
import { Telemetry, SpanContext } from "./Telemetry";
import { TenantManager } from "./TenantManager";
import { Cache } from "./Cache";
import { Authenticator } from "./Authenticator";

/**
 * ExecutionRuntime interface for future-proofing (WASM prep).
 */
export interface ExecutionRuntime {
  run(handler: any, ctx: Ctx): Promise<any>;
}

/**
 * Default Node.js runtime.
 */
export class NodeRuntime implements ExecutionRuntime {
  public async run(handler: any, ctx: Ctx): Promise<any> {
    return await handler(ctx);
  }
}

/**
 * Executor handles the actual execution of Chainbox functions with safety controls and distribution.
 */
export class Executor {
  private static db = new DbAdapter({
    url: process.env.CHAINBOX_SUPABASE_URL || process.env.NEXT_PUBLIC_CHAINBOX_SUPABASE_URL || process.env.SUPABASE_URL,
    secretKey: process.env.CHAINBOX_SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  });

  private static kv: StorageAdapter = new InMemoryStorage();
  private static blob: StorageAdapter = new InMemoryStorage();

  private static runtime: ExecutionRuntime = new NodeRuntime();
  private static wasmRuntime: ExecutionRuntime = new WasmRuntime();

  /**
   * Default execution limits.
   */
  private static DEFAULTS = {
    maxDepth: 20,
    timeoutMs: 3000,
  };

  /**
   * Internal Observability Hooks.
   */
  private static onExecutionStart(fn: string, target: string) {
    // console.log(`[CB-OBS] START: ${fn} (target: ${target})`);
  }

  private static onExecutionEnd(fn: string, target: string, duration: number) {
    // console.log(`[CB-OBS] END: ${fn} (target: ${target}, took: ${duration}ms)`);
  }

  /**
   * Executes a Chainbox function with isolation, safety, and mesh support.
   */
  public static async Execute(
    fnName: string, 
    input: any, 
    parentTrace: TraceFrame[] = [],
    identity?: Identity,
    parentFrame?: ExecutionFrame,
    forceLocal: boolean = false,
    options: { retries?: number } = {}
  ): Promise<any> {
    let attempts = 0;
    const maxAttempts = (options.retries || 0) + 1;

    // 0. Resolve Identity if not provided (e.g., from a token in options)
    const resolvedIdentity = identity || ((options as any).token ? await Authenticator.Authenticate((options as any).token) : undefined);

    while (attempts < maxAttempts) {
      attempts++;
      try {
        return await this._InternalExecute(fnName, input, parentTrace, resolvedIdentity, parentFrame, forceLocal);
      } catch (error: any) {
        if (attempts >= maxAttempts || (error.error === "FORBIDDEN") || (error.error === "MAX_CALL_DEPTH_EXCEEDED")) {
          throw error;
        }
        console.warn(`chainbox: Retrying ${fnName} (attempt ${attempts}/${maxAttempts})`);
      }
    }
  }

  private static async _InternalExecute(
    fnName: string, 
    input: any, 
    parentTrace: TraceFrame[] = [],
    identity?: Identity,
    parentFrame?: ExecutionFrame,
    forceLocal: boolean = false
  ): Promise<any> {
    const startTime = Date.now();
    
    // 0. Initialize or update execution frame
    // If this is a mesh node, reset startTime to avoid stale timestamps from remote calls
    const isRemoteNode = process.env.CHAINBOX_IS_NODE === "true";
    const frame: ExecutionFrame = parentFrame ? {
      ...parentFrame,
      depth: parentFrame.depth + 1,
      // Reset startTime on mesh nodes to avoid stale elapsed time calculations
      startTime: isRemoteNode ? startTime : parentFrame.startTime,
    } : {
      depth: 1,
      maxDepth: this.DEFAULTS.maxDepth,
      startTime: startTime,
      timeoutMs: this.DEFAULTS.timeoutMs,
    };

    // Create current trace frame (the node in the execution tree)
    const currentTrace: TraceFrame = { 
      fn: fnName, 
      identity: identity?.id,
      children: [] 
    };
    
    // Keep parentTrace as a flat array of current-sibling-level frames for compatibility if needed,
    // but the real data is in the tree.
    const traceArray: TraceFrame[] = [...parentTrace, currentTrace];

    // Telemetry: Start span for this execution
    const spanContext = Telemetry.StartSpan(`chainbox.execute.${fnName}`, undefined, {
      "chainbox.function": fnName,
      "chainbox.identity": identity?.id || "anonymous",
      "chainbox.depth": frame.depth,
    });
    Telemetry.IncrementCounter("chainbox_execution_total", { function: fnName });
    
    try {
      // 1. Safety Checks: Recursion Depth
      if (frame.depth > frame.maxDepth) {
        currentTrace.status = "error";
        throw {
          error: "MAX_CALL_DEPTH_EXCEEDED",
          limit: frame.maxDepth,
          trace: traceArray
        };
      }

      // 1.5 Rate Limiting (only at root level to avoid double-counting)
      if (!parentFrame) {
        RateLimiter.Enforce(fnName, identity?.id);
        TenantManager.Enforce(identity);
      }

      // 1.6 Cache Check (before execution)
      const cachedResult = Cache.Get(fnName, input);
      if (cachedResult !== undefined) {
        currentTrace.status = "success";
        currentTrace.cached = true;
        Telemetry.IncrementCounter("chainbox_cache_hits", { function: fnName });
        return { ...cachedResult, trace: [currentTrace] };
      }

      // 2. Safety Checks: Timeout
      const elapsed = Date.now() - frame.startTime;
      if (elapsed > frame.timeoutMs) {
        currentTrace.status = "error";
        throw {
          error: "EXECUTION_TIMEOUT",
          timeoutMs: frame.timeoutMs,
          trace: traceArray
        };
      }

      // 3. Execution Planning (MESH)
      const plan = (forceLocal || isRemoteNode) ? { target: "local" as const } : ExecutionPlanner.Plan(fnName, { 
        identity,
        _internal: { trace: traceArray, frame } 
      } as any);
      
      currentTrace.target = plan.target;
      currentTrace.nodeId = plan.nodeId || (isRemoteNode ? "remote-node" : "local-host");

      this.onExecutionStart(fnName, plan.target);

      if (plan.target === "remote" && !forceLocal && !isRemoteNode) {
        if (!plan.nodeId) throw new Error("REMOTE_NODE_NOT_SPECIFIED");
        
        const payload: MeshPayload = {
          fn: fnName,
          input,
          identity,
          frame,
          trace: traceArray
        };

        const result = await Mesh.Call(plan.nodeId, payload);
        
        // Merge remote trace into local tree if available
        if (result.trace && result.trace.length > 0) {
          const remoteRoot = result.trace[result.trace.length - 1];
          currentTrace.children = remoteRoot.children;
          currentTrace.durationMs = remoteRoot.durationMs;
          currentTrace.status = remoteRoot.status;
        }

        this.onExecutionEnd(fnName, "remote", Date.now() - startTime);
        return result;
      }

      const source = await Registry.Resolve(fnName);

      // 4. Authorization Check
      if (source.permissions && source.permissions.allow.length > 0) {
        if (!identity || !identity.role || !source.permissions.allow.includes(identity.role)) {
          currentTrace.status = "error";
          throw {
            error: "FORBIDDEN",
            function: fnName,
            required: source.permissions.allow,
            trace: traceArray
          };
        }
      }

      const handler = source.handler;
      if (!handler && source.type !== "wasm") {
          // Future: Implement DynamicRuntime for source.content
          throw new Error("DYNAMIC_EXECUTION_NOT_YET_IMPLEMENTED");
      }
      
      const ctx: Ctx = Context.Build(
        input,
        async (nextFn, nextInput, opt) => {
            const res = await this._InternalExecute(nextFn, nextInput, [currentTrace], identity, frame, forceLocal);
            // After sub-call, we can extract the trace from the result if we want to build the tree
            if (res && res._trace) {
                currentTrace.children!.push(res._trace);
                delete res._trace;
            }
            return res;
        },
        traceArray,
        identity,
        frame,
        this.kv,
        this.blob,
        currentTrace,
        async (calls) => {
          return await this._ParallelExecute(calls, traceArray, identity, frame, currentTrace, forceLocal);
        }
      );
      
      // Inject DB with identity for RLS
      ctx.db = {
        from: (table: string) => this.db.from(table, identity)
      };

      // 5. Execution Boundary (Runtime abstraction) with actual timeout enforcement
      let timer: any;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject({ 
          error: "EXECUTION_TIMEOUT", 
          timeoutMs: frame.timeoutMs,
          trace: traceArray 
        }), frame.timeoutMs - elapsed);
      });

      const result = await Promise.race([
        source.type === "wasm" 
          ? this.wasmRuntime.run(source.content, ctx)
          : this.runtime.run(handler, ctx),
        timeoutPromise
      ]);

      if (timer) clearTimeout(timer);
      
      currentTrace.status = "success";
      currentTrace.durationMs = Date.now() - startTime;
      this.onExecutionEnd(fnName, "local", currentTrace.durationMs);

      // Audit: Log success (only at root level)
      if (!parentFrame) {
        AuditLog.LogSuccess(fnName, identity, currentTrace.durationMs);
      }

      // Telemetry: End span and record latency
      Telemetry.EndSpan(spanContext, { "chainbox.status": "success" });
      Telemetry.RecordHistogram("chainbox_execution_duration_ms", currentTrace.durationMs!, { function: fnName });

      // Cache: Store result for cacheable functions
      Cache.Set(fnName, input, result);

      // Tenant: Record call for quota tracking
      TenantManager.RecordCall(identity, true);

      // Final result includes the _trace hiddenly for internal tree building
      const finalResult = {
        ...result,
        _trace: currentTrace
      };

      // 6. Zero-Surface Redaction (Strict)
      // Internal traces and frames must NEVER leak to the client/transport in production.
      if (process.env.NODE_ENV === 'production' && !parentFrame) {
        // Delete all hidden metadata
        delete (finalResult as any)._trace;
        
        // Return only the data specified by the function
        return result;
      }

      // If it's the absolute root call, attach the full tree to the 'trace' key (Dev only)
      if (!parentFrame) {
        return {
          ...result,
          trace: [currentTrace] // Return as array for compatibility
        };
      }

      return finalResult;

    } catch (error: any) {
      if (error.error && parentFrame) throw error;

      // 6. Error Normalization
      const normalizedError = {
        error: error.error || "EXECUTION_ERROR",
        message: error.message || (typeof error === 'string' ? error : undefined),
        function: error.function || fnName,
        trace: process.env.NODE_ENV === 'production' ? [] : (error.trace || traceArray),
        ...(error.limit && { limit: error.limit }),
        ...(error.timeoutMs && { timeoutMs: error.timeoutMs }),
        ...(error.required && { required: error.required })
      };

      if (normalizedError.error === "EXECUTION_ERROR") {
        console.error(`chainbox: Execution error in "${fnName}"`, error);
      }

      // Audit: Log error (only at root level)
      if (!parentFrame) {
        AuditLog.LogError(fnName, normalizedError.error, identity, Date.now() - startTime);
      }

      // Telemetry: End span with error and increment error counter
      Telemetry.EndSpanWithError(spanContext, normalizedError.error);
      Telemetry.IncrementCounter("chainbox_execution_errors_total", { function: fnName, error: normalizedError.error });

      throw normalizedError;
    }
  }

  /**
   * Optimized parallel execution with remote batching.
   */
  private static async _ParallelExecute(
    calls: { fn: string; input?: any }[],
    parentTrace: TraceFrame[],
    identity: Identity | undefined,
    frame: ExecutionFrame,
    currentFrame: TraceFrame,
    forceLocal: boolean = false
  ): Promise<any[]> {
    const isRemoteNode = process.env.CHAINBOX_IS_NODE === "true";

    // 1. Planning phase
    const tasks = calls.map((c, index) => {
      const plan = (forceLocal || isRemoteNode) ? { target: "local" as const } : ExecutionPlanner.Plan(c.fn, { _internal: { trace: parentTrace, frame } } as any);
      return { ...c, plan, index };
    });

    const results: any[] = new Array(calls.length);
    const batches: Map<string, typeof tasks> = new Map();
    const locals: typeof tasks = [];

    for (const t of tasks) {
      if (t.plan.target === "remote" && t.plan.nodeId) {
        const list = batches.get(t.plan.nodeId) || [];
        list.push(t);
        batches.set(t.plan.nodeId, list);
      } else {
        locals.push(t);
      }
    }

    console.log(`chainbox: _ParallelExecute - Grouped into ${batches.size} batches and ${locals.length} locals`);

    // 2. Concurrent execution of batches and locals
    const remoteExecution = Array.from(batches.entries()).map(async ([nodeId, list]) => {
      console.log(`chainbox: Sending batch of ${list.length} calls to ${nodeId}`);
      const payload: MeshBatchPayload = {
        calls: list.map(l => ({ fn: l.fn, input: l.input })),
        identity,
        frame, // Propagate existing frame, sub-calls will increment depth
        trace: [currentFrame]
      };

      try {
        const batchResults = await Mesh.BatchCall(nodeId, payload);
        console.log(`chainbox: Received batch response with ${batchResults.length} results`);
        batchResults.forEach((res, i) => {
          const task = list[i];
          if (res && res._trace) {
            currentFrame.children!.push(res._trace);
            delete res._trace;
          }
          results[task.index] = res;
        });
      } catch (error: any) {
        console.error(`chainbox: Batch call to ${nodeId} failed`, error);
        list.forEach(task => {
          results[task.index] = { error: error.error || "BATCH_FAILED", message: error.message };
        });
      }
    });

    const localExecution = locals.map(async (l) => {
      try {
        const res = await this._InternalExecute(l.fn, l.input, [currentFrame], identity, frame, true);
        if (res && res._trace) {
          currentFrame.children!.push(res._trace);
          delete res._trace;
        }
        results[l.index] = res;
      } catch (error: any) {
        results[l.index] = error;
      }
    });

    await Promise.all([...remoteExecution, ...localExecution]);
    return results;
  }
}
