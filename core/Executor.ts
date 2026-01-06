import { Registry } from "./Registry";
import { Env } from "./Env";
import { Context, Identity, TraceFrame, ExecutionFrame, ExecutionTarget, ExecutionPlan, Ctx, ChainboxError } from "./Context";
import { IDbAdapter, DbAdapterFactory } from "./DbAdapter";
import { ExecutionPlanner } from "./ExecutionPlanner";
import { Mesh, MeshPayload, MeshBatchPayload } from "../transport/Mesh";
import { StorageAdapter, FileSystemStorage } from "./Storage";
import { WasmRuntime } from "./WasmRuntime";
import { RateLimiter } from "./RateLimiter";
import { AuditLog } from "./AuditLog";
import { Telemetry } from "./Telemetry";
import { TenantManager } from "./TenantManager";
import { Cache as ChainboxCache } from "./Cache";
import { Authenticator } from "./Authenticator";
import { PolicyEngine } from "./Policy";
import { AdapterRegistry } from "./Adapter";
import { loadConfig } from "../tools/Config";
import { randomUUID } from "crypto";

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
    // Zero-Surface Security: Default-Deny Network
    // We strictly limit egress to enforce "Library-First" architecture.
    const originalFetch = global.fetch;
    
    try {
      // @ts-ignore
      global.fetch = async (url: string, init?: any) => {
        // Network Block: Deny all arbitrary HTTP calls
        throw new Error("NETWORK_ACCESS_DENIED: Use ctx.adapter() for external I/O.");
      };

      return await handler(ctx);
    } finally {
      // Restore access
      global.fetch = originalFetch;
    }
  }
}

/**
 * Executor handles the actual execution of Chainbox functions with safety controls and distribution.
 */
export class Executor {
  private static provider: "supabase" | "firebase" | undefined;
  private static db: IDbAdapter | undefined;
  private static kv: StorageAdapter = new FileSystemStorage("kv");
  private static blob: StorageAdapter = new FileSystemStorage("blob");

  private static runtime: ExecutionRuntime = new NodeRuntime();
  private static wasmRuntime: ExecutionRuntime = new WasmRuntime();

  private static async ensureInitialized() {
    if (this.db) return;
    
    const config = await loadConfig();
    this.provider = config.database || "supabase";
    
    this.db = DbAdapterFactory.Create(this.provider, 
      this.provider === "firebase" ? Env.DetectFirebaseConfig() : Env.DetectSupabaseConfig()
    );

    // Sync functionsDir to Registry if it changed
    if (config.functionsDir) {
      Registry.SetRoot(config.functionsDir);
    }
  }



  /**
   * Default execution limits.
   */
  private static DEFAULTS = {
    maxDepth: 20,
    timeoutMs: 3000,
  };

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
    options: { retries?: number; traceId?: string } = {}
  ): Promise<any> {
    let attempts = 0;
    const maxAttempts = (options.retries || 0) + 1;

    // 0. Resolve Identity if not provided (e.g., from a token in options)
    const resolvedIdentity = identity || ((options as any).token ? await Authenticator.Authenticate((options as any).token) : undefined);
    
    // 0.1 TraceId Generation
    const traceId = (options as any).traceId || randomUUID();
    
    // 0. Ensure initialization (lazy config load)
    await this.ensureInitialized();

    while (attempts < maxAttempts) {
      attempts++;
      try {
        return await this._InternalExecute(fnName, input, parentTrace, resolvedIdentity, parentFrame, forceLocal, traceId);
      } catch (error: any) {
        const cbError = error instanceof ChainboxError ? error : new ChainboxError("EXECUTION_ERROR", error.message || "Unknown error", fnName, traceId, { original: error });

        if (attempts >= maxAttempts || (cbError.code === "FORBIDDEN") || (cbError.code === "MAX_CALL_DEPTH_EXCEEDED") || (cbError.code === "ACCESS_DENIED")) {
          throw cbError;
        }
        console.warn(`chainbox: Retrying ${fnName} (attempt ${attempts}/${maxAttempts})`);
      }
    }
  }

  /**
   * Lifecycle Hook: Execution Start
   * Handles Telemetry, Rate Limiting, and Tenant Enforcement.
   */
  private static async onStart(
    fnName: string,
    identity: Identity | undefined,
    frame: ExecutionFrame,
    parentFrame: ExecutionFrame | undefined
  ): Promise<{ spanContext: any }> {
    // 1. Telemetry Start
    const spanContext = Telemetry.StartSpan(`chainbox.execute.${fnName}`, undefined, {
      "chainbox.function": fnName,
      "chainbox.identity": identity?.id || "anonymous",
      "chainbox.depth": frame.depth,
    });
    Telemetry.IncrementCounter("chainbox_execution_total", { function: fnName });

    // 2. Policy Enforcement (Rate Limit & Tenant) - Only at root
    if (!parentFrame) {
      await RateLimiter.Enforce(fnName, identity?.id);
      await TenantManager.Enforce(identity);
    }

    return { spanContext };
  }

  /**
   * Lifecycle Hook: Execution End (Success)
   * Handles Telemetry (Success), Audit Log (Success), and Metrics.
   */
  private static async onEnd(
    fnName: string,
    identity: Identity | undefined,
    currentTrace: TraceFrame,
    spanContext: any,
    parentFrame: ExecutionFrame | undefined,
    startTime: number,
    effectiveTraceId: string
  ) {
    const duration = Date.now() - startTime;
    currentTrace.durationMs = duration;
    currentTrace.status = "success";
    
    // Outcome Integrity: Fail responsibly if outcome is missing (Never infer)
    if (!currentTrace.outcome) {
       console.error(`chainbox: INVARIANT VIOLATION - Function ${fnName} completed without an outcome tag.`);
       // In production, we might want to be safer, but for v1 strictness, we count this as a system failure.
       // However, to avoid crashing the request flow for metering, we set it to FAILURE but log heavily.
       currentTrace.outcome = "FAILURE"; 
       Telemetry.IncrementCounter("chainbox_invariant_violation", { Type: "MissingOutcome", Function: fnName });
    }

    // 1. Telemetry End
    Telemetry.EndSpan(spanContext, { "chainbox.status": "success", "chainbox.outcome": currentTrace.outcome });
    Telemetry.RecordHistogram("chainbox_execution_duration_ms", duration, { function: fnName });

    // 2. Audit Log - Only at root
    if (!parentFrame) {
      AuditLog.LogSuccess(fnName, identity, duration, undefined, effectiveTraceId, currentTrace);
    }

    // 3. Tenant Usage
    await TenantManager.RecordCall(identity, true);
  }

  /**
   * Lifecycle Hook: Execution Failure
   * Handles Error Normalization, Telemetry (Error), and Audit Log (Error).
   */
  private static async onFailure(
    fnName: string,
    error: any,
    identity: Identity | undefined,
    currentTrace: TraceFrame,
    spanContext: any,
    parentFrame: ExecutionFrame | undefined,
    startTime: number,
    effectiveTraceId: string
  ): Promise<ChainboxError> {
    const duration = Date.now() - startTime;
    
    // 1. Error Normalization
    const normalizedError = error instanceof ChainboxError ? error : new ChainboxError(
      error.code || error.error || "EXECUTION_ERROR",
      error.message || "Unknown execution error",
      fnName,
      effectiveTraceId,
      { originalError: error }
    );

    if (normalizedError.code === "EXECUTION_ERROR") {
      console.error(`chainbox: Execution error in "${fnName}"`, error);
    }

    // 2. Trace Update
    currentTrace.status = "error";
    currentTrace.durationMs = duration;
    // Map error codes to outcomes if not already set
    if (!currentTrace.outcome) {
      switch (normalizedError.code) {
        case "EXECUTION_TIMEOUT": currentTrace.outcome = "TIMEOUT"; break;
        case "CIRCUIT_OPEN": currentTrace.outcome = "CIRCUIT_OPEN"; break;
        case "FORBIDDEN": currentTrace.outcome = "FORBIDDEN"; break;
        default: currentTrace.outcome = "FAILURE";
      }
    }

    // 3. Telemetry End
    Telemetry.EndSpanWithError(spanContext, normalizedError.code);
    Telemetry.IncrementCounter("chainbox_execution_errors_total", { function: fnName, error: normalizedError.code });

    // 4. Audit Log - Only at root
    if (!parentFrame) {
      AuditLog.LogError(fnName, normalizedError.code, identity, duration, undefined, effectiveTraceId, currentTrace);
    }
    
    return normalizedError;
  }

  private static async _InternalExecute(
    fnName: string, 
    input: any, 
    parentTrace: TraceFrame[] = [],
    identity?: Identity,
    parentFrame?: ExecutionFrame,
    forceLocal: boolean = false,
    traceId?: string
  ): Promise<any> {
    const startTime = Date.now();
    const effectiveTraceId = traceId || randomUUID();

    
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

    // --- LIFECYCLE: START ---
    // Note: We create context *before* checking cache to ensure consistent telemetry even for cache hits (optional choice, but cleaner)
    // However, rate limits should probably strictly apply.
    const { spanContext } = await this.onStart(fnName, identity, frame, parentFrame);
    
    try {
      // 1. Safety Checks: Recursion Depth
      if (frame.depth > frame.maxDepth) {
        currentTrace.status = "error";
        currentTrace.outcome = "FAILURE";
        throw new ChainboxError("MAX_CALL_DEPTH_EXCEEDED", `Recursion depth exceeded (${frame.depth})`, fnName, effectiveTraceId, { limit: frame.maxDepth });
      }

      // 1.6 Cache Check (before execution)
      const cachedResult = ChainboxCache.Get(fnName, input);
      if (cachedResult !== undefined) {
        currentTrace.status = "success";
        currentTrace.outcome = "SUCCESS";
        currentTrace.cached = true;
        Telemetry.IncrementCounter("chainbox_cache_hits", { function: fnName });
        
        // --- LIFECYCLE: END (Cache Hit) ---
        // We artificially call onEnd to record the 'success' of a cache hit, though duration is negligible
        await this.onEnd(fnName, identity, currentTrace, spanContext, parentFrame, startTime, effectiveTraceId);
        
        return { ...cachedResult, trace: [currentTrace] };
      }

      // 2. Safety Checks: Timeout Check (Pre-execution)
      const elapsed = Date.now() - frame.startTime;
      if (elapsed > frame.timeoutMs) {
        currentTrace.status = "error";
        currentTrace.outcome = "TIMEOUT";
        throw new ChainboxError("EXECUTION_TIMEOUT", "Execution timed out before starting", fnName, effectiveTraceId, { timeoutMs: frame.timeoutMs });
      }

      // 3. Execution Planning (MESH)
      const plan: ExecutionPlan = (forceLocal || isRemoteNode) ? { target: "local" } : ExecutionPlanner.Plan(fnName, { 
        identity,
        _internal: { trace: traceArray, frame } 
      } as any);
      
      currentTrace.target = plan.target;
      currentTrace.nodeId = plan.nodeId || (isRemoteNode ? "remote-node" : "local-host");

      if (plan.target === "remote" && !forceLocal && !isRemoteNode) {
        if (!plan.nodeId) throw new Error("REMOTE_NODE_NOT_SPECIFIED");
        
        const payload: MeshPayload = {
          fn: fnName,
          input,
          identity,
          frame,
          trace: traceArray,
          traceId: effectiveTraceId,
        };

        const result = await Mesh.Call(plan.nodeId, payload);
        
        // Merge remote trace into local tree if available
        if (result.trace && result.trace.length > 0) {
          const remoteRoot = result.trace[result.trace.length - 1];
          currentTrace.children = remoteRoot.children;
          currentTrace.durationMs = remoteRoot.durationMs;
          currentTrace.durationMs = remoteRoot.durationMs;
          currentTrace.status = remoteRoot.status;
          currentTrace.outcome = remoteRoot.outcome;
        }

        // --- LIFECYCLE: END (Remote) ---
        await this.onEnd(fnName, identity, currentTrace, spanContext, parentFrame, startTime, effectiveTraceId);
        return result;
      }

      const source = await Registry.Resolve(fnName);

      // 4. Authorization Check
      PolicyEngine.Enforce(fnName, identity, source, effectiveTraceId);

      const handler = source.handler;
      if (!handler && source.type !== "wasm") {
          throw new ChainboxError("INTERNAL_ERROR", "Dynamic execution from strings is not supported", fnName, effectiveTraceId);
      }
      
      const ctx: Ctx = Context.Build(
        input,
        async (nextFn, nextInput, opt) => {
            const res = await this._InternalExecute(nextFn, nextInput, [currentTrace], identity, frame, forceLocal, effectiveTraceId);
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
        effectiveTraceId,
        (name: string) => AdapterRegistry.Get(name),
        async (calls) => {
          return await this._ParallelExecute(calls, traceArray, identity, frame, currentTrace, forceLocal, effectiveTraceId);
        }
      );
      
      // Inject DB with identity for RLS
      ctx.db = {
        from: (table: string) => this.db!.from(table, identity)
      };

      // 5. Execution Boundary (Runtime abstraction) with actual timeout enforcement
      let timer: any;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          currentTrace.outcome = "TIMEOUT";
          reject(new ChainboxError("EXECUTION_TIMEOUT", `Execution timed out after ${frame.timeoutMs}ms`, fnName, effectiveTraceId, { timeoutMs: frame.timeoutMs }));
        }, frame.timeoutMs - elapsed);
      });

      const result = await Promise.race([
        source.type === "wasm" 
          ? this.wasmRuntime.run(source.content, ctx)
          : this.runtime.run(handler, ctx),
        timeoutPromise
      ]);

      if (timer) clearTimeout(timer);
      
      // Cache: Store result for cacheable functions
      ChainboxCache.Set(fnName, input, result);

      // --- LIFECYCLE: END (Local) ---
      await this.onEnd(fnName, identity, currentTrace, spanContext, parentFrame, startTime, effectiveTraceId);

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
      if (error instanceof ChainboxError && parentFrame) throw error; // Re-throw ChainboxErrors up the stack

      // --- LIFECYCLE: FAILURE ---
      const normalized = await this.onFailure(fnName, error, identity, currentTrace, spanContext, parentFrame, startTime, effectiveTraceId);
      
      throw normalized;
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
    forceLocal: boolean = false,
    traceId: string
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

    // 2. Concurrent execution of batches and locals
    const remoteExecution = Array.from(batches.entries()).map(async ([nodeId, list]) => {
      const payload: MeshBatchPayload = {
        calls: list.map(l => ({ fn: l.fn, input: l.input })),
        identity,
        frame, // Propagate existing frame, sub-calls will increment depth
        trace: [currentFrame],
        traceId: traceId,
      };

      try {
        const batchResults = await Mesh.BatchCall(nodeId, payload);
        batchResults.forEach((res, i) => {
          const task = list[i];
          if (res && res._trace) {
            currentFrame.children!.push(res._trace);
            delete res._trace;
          }
          results[task.index] = res;
        });
      } catch (error: any) {
        list.forEach(task => {
          results[task.index] = new ChainboxError("MESH_CALL_FAILED", error.message || "Batch call failed", task.fn, traceId, { nodeId });
        });
      }
    });

    const localExecution = locals.map(async (l) => {
      try {
        const res = await this._InternalExecute(l.fn, l.input, [currentFrame], identity, frame, true, traceId);
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
