import { Executor } from "../core/Executor";
import { RequestSigner } from "../core/RequestSigner";
import { ChainboxError } from "../core/Context";
import { ChainboxMiddlewareOptions } from "./express";

/**
 * Fastify Plugin for Chainbox.
 * 
 * @example
 * import Fastify from 'fastify';
 * import { ChainboxPlugin } from '@sddion/chainbox/fastify';
 * 
 * const fastify = Fastify();
 * fastify.register(ChainboxPlugin, { path: '/api/chain' });
 */
export async function ChainboxPlugin(fastify: any, options: ChainboxMiddlewareOptions) {
  const mountPath = options.path || "/api/chain";

  fastify.post(mountPath, async (req: any, reply: any) => {
    const body = req.body;
    
    // Fastify handles body parsing, but ensure it's there
    if (!body || typeof body !== "object") {
        return reply.code(400).send({ error: "INVALID_REQUEST", message: "Missing request body" });
    }

    try {
      // Security
      if (req.headers["x-chainbox-signature"]) {
        const verification = RequestSigner.VerifyHeaders(body, req.headers);
        if (!verification.valid) {
          return reply.code(403).send({ error: "FORBIDDEN", message: verification.error });
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

      return reply.code(200).send(result);

    } catch (error: any) {
      const code = error instanceof ChainboxError ? error.code : "EXECUTION_ERROR";
      return reply.code(500).send({ error: code, message: error.message });
    }
  });
}
