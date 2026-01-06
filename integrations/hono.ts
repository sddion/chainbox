import { Executor } from "../core/Executor";
import { RequestSigner } from "../core/RequestSigner";
import { ChainboxError } from "../core/Context";
import { ChainboxMiddlewareOptions } from "./express";

/**
 * Hono Middleware for Chainbox.
 * 
 * @example
 * import { Hono } from 'hono';
 * import { ChainboxMiddleware } from '@sddion/chainbox/hono';
 * 
 * const app = new Hono();
 * app.post('/api/chain', ChainboxMiddleware());
 */
export function ChainboxMiddleware(options: ChainboxMiddlewareOptions = {}) {
  return async (c: any) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "INVALID_REQUEST", message: "Invalid JSON body" }, 400);
    }

    try {
      // Security
      if (c.req.header("x-chainbox-signature")) {
        const headers = c.req.header();
        const verification = RequestSigner.VerifyHeaders(body, headers);
        if (!verification.valid) {
          return c.json({ error: "FORBIDDEN", message: verification.error }, 403);
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

      return c.json(result);

    } catch (error: any) {
      const code = error instanceof ChainboxError ? error.code : "EXECUTION_ERROR";
      return c.json({ error: code, message: error.message }, 500);
    }
  };
}
