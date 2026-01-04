import { StorageAdapter } from "./Storage";

export type Identity = {
  id: string;
  email?: string;
  role?: string;
  token?: string; // Original JWT for DB/Mesh forwarding
  claims?: Record<string, any>;
};

export type ExecutionFrame = {
  depth: number;
  maxDepth: number;
  startTime: number;
  timeoutMs: number;
};

export type ExecutionTarget = "local" | "remote";

export type ExecutionPlan = {
  target: ExecutionTarget;
  nodeId?: string;
};

export type TraceFrame = {
  fn: string;
  identity?: string;
  target?: ExecutionTarget;
  nodeId?: string;
  durationMs?: number;
  status?: "success" | "error";
  outcome?: "SUCCESS" | "FAILURE" | "TIMEOUT" | "CIRCUIT_OPEN" | "ABORTED" | "FORBIDDEN" | "NOT_FOUND";
  cached?: boolean;
  children?: TraceFrame[];
};

export type ChainboxErrorType = 
  | "EXECUTION_ERROR"
  | "EXECUTION_TIMEOUT" 
  | "MAX_CALL_DEPTH_EXCEEDED"
  | "FORBIDDEN"
  | "FUNCTION_NOT_FOUND" 
  | "CIRCUIT_OPEN"
  | "MESH_CALL_FAILED"
  | "INVALID_SIGNATURE"
  | "ADAPTER_NOT_FOUND"
  | "INTERNAL_ERROR";

export class ChainboxError extends Error {
  public readonly isChainboxError = true;
  
  constructor(
    public code: ChainboxErrorType,
    message: string,
    public functionName?: string,
    public traceId?: string,
    public meta?: Record<string, any>
  ) {
    super(message);
    this.name = "ChainboxError";
  }
}

export type ExecutionResult<T = any> = {
  data: T;
  meta: {
    duration: number;
    traceId: string;
    cached?: boolean;
    node?: string;
  };
};

export type Ctx = {
  input: any;
  call: <T = any>(fnName: string, input?: any, options?: { retries?: number }) => Promise<T>;
  parallel: <T = any>(calls: { fn: string; input?: any }[]) => Promise<T[]>;
  adapter: <T>(name: string) => T;
  identity?: Identity;
  db?: any;
  kv: StorageAdapter;
  blob: StorageAdapter;
  env: Record<string, string | undefined>;
  // Introspection & Debugging
  getTrace: () => TraceFrame;
  traceId: string;
  _internal: {
    frame: ExecutionFrame;
    trace: TraceFrame[];
  };
};

export class Context {
  public static Build(
    input: any,
    callFn: (fn: string, inp: any, opt?: any) => Promise<any>,
    trace: TraceFrame[] = [],
    identity: Identity | undefined,
    frame: ExecutionFrame,
    kv: StorageAdapter,
    blob: StorageAdapter,
    currentFrame: TraceFrame,
    traceId: string, // New required param
    adapterFn: <T>(name: string) => T,
    parallelFn?: (calls: { fn: string; input?: any }[]) => Promise<any[]>
  ): Ctx {
    return {
      input,
      call: callFn,
      parallel: parallelFn || (async (calls) => {
        return Promise.all(calls.map(c => callFn(c.fn, c.input)));
      }),
      adapter: adapterFn,
      getTrace: () => currentFrame,
      traceId,
      identity,
      db: undefined, // Injected by Executor
      kv,
      blob,
      env: process.env,
      _internal: {
        frame,
        trace
      }
    };
  }
}
