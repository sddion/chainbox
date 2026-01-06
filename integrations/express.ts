import { Executor } from "../core/Executor";
import { RequestSigner } from "../core/RequestSigner";
import { ChainboxError } from "../core/Context";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * Minimal type definition for Express Request/Response to avoid hard dependency.
 */
type ExpressRequest = IncomingMessage & { 
  method?: string;
  url?: string;
  headers: any;
  body?: any; 
};
type ExpressResponse = ServerResponse & {
  status: (code: number) => ExpressResponse;
  json: (body: any) => ExpressResponse;
  send: (body: any) => ExpressResponse;
};
type NextFunction = (err?: any) => void;

export interface ChainboxMiddlewareOptions {
  /**
   * Path to mount the chainbox API.
   * @default "/api/chain"
   */
  path?: string;
}

/**
 * Creates an Express middleware for Chainbox.
 * 
 * @example
 * app.use(express.json());
 * app.use(ChainboxMiddleware());
 */
export function ChainboxMiddleware(options: ChainboxMiddlewareOptions = {}) {
  const mountPath = options.path || "/api/chain";

  return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    // 1. Path check
    if (req.url !== mountPath || req.method !== "POST") {
      return next();
    }

    // 2. Body check
    const body = req.body;
    if (!body || typeof body !== "object") {
       console.error("chainbox-express: Missing body. Ensure app.use(express.json()) is used before Chainbox middleware.");
       res.status(400).json({ error: "INVALID_REQUEST", message: "Missing request body" });
       return;
    }

    try {
      // 3. Signature Verification (Optional but recommended)
      if (req.headers["x-chainbox-signature"]) {
        const verification = RequestSigner.VerifyHeaders(body, req.headers);
        if (!verification.valid) {
          res.status(403).json({ error: "FORBIDDEN", message: verification.error });
          return;
        }
      }

      // 4. Execution
      const token = req.headers["authorization"]?.replace("Bearer ", "");
      
      const result = await Executor.Execute(
        body.fn,
        body.input,
        [], // trace
        undefined, // identity (resolved via token option)
        undefined, // frame
        true, // forceLocal
        { token } as any // Pass token for internal resolution
      );

      res.status(200).json(result);

    } catch (error: any) {
      const code = error instanceof ChainboxError ? error.code : "EXECUTION_ERROR";
      res.status(500).json({ error: code, message: error.message });
    }
  };
}
