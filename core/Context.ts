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
  cached?: boolean;
  children?: TraceFrame[];
};

export type Ctx = {
  input: any;
  call: (fnName: string, input?: any, options?: { retries?: number }) => Promise<any>;
  parallel: (calls: { fn: string; input?: any }[]) => Promise<any[]>;
  identity?: Identity;
  db?: any;
  kv: StorageAdapter;
  blob: StorageAdapter;
  env: Record<string, string | undefined>;
  getTrace: () => TraceFrame; // Allow introspection for debugging
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
    parallelFn?: (calls: { fn: string; input?: any }[]) => Promise<any[]>
  ): Ctx {
    return {
      input,
      call: callFn,
      parallel: parallelFn || (async (calls) => {
        return Promise.all(calls.map(c => callFn(c.fn, c.input)));
      }),
      getTrace: () => currentFrame,
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
