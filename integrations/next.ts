import { Executor } from "../core/Executor";
import { RequestSigner } from "../core/RequestSigner";
import { ChainboxError } from "../core/Context";
import { ChainboxMiddlewareOptions } from "./express";

/**
 * Next.js App Router Helper.
 * 
 * @example
 * // app/api/chain/route.ts
 * import { ChainboxRoute } from '@sddion/chainbox/next';
 * 
 * export const { POST } = ChainboxRoute();
 */
export function ChainboxRoute(options: ChainboxMiddlewareOptions = {}) {
  const POST = async (req: Request) => {
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "INVALID_REQUEST", message: "Invalid JSON body" }, { status: 400 });
    }

    try {
      // Security
      const sig = req.headers.get("x-chainbox-signature");
      if (sig) {
        // Convert headers to record
        const headers: Record<string, string> = {};
        req.headers.forEach((v, k) => (headers[k] = v));
        
        const verification = RequestSigner.VerifyHeaders(body, headers);
        if (!verification.valid) {
          return Response.json({ error: "FORBIDDEN", message: verification.error }, { status: 403 });
        }
      }

      // Execution
      const result = await Executor.Execute(
        body.fn,
        body.input,
        [],
        undefined,
        undefined,
        true
      );

      return Response.json(result);

    } catch (error: any) {
      const code = error instanceof ChainboxError ? error.code : "EXECUTION_ERROR";
      return Response.json({ error: code, message: error.message }, { status: 500 });
    }
  };

  return { POST };
}
