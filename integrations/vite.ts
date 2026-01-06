import type { Plugin, ViteDevServer } from "vite";
import { ChainboxMiddleware, ChainboxMiddlewareOptions } from "./express";

/**
 * Chainbox Vite Plugin.
 * Injects the Chainbox middleware into the Vite Dev Server.
 * 
 * @example
 * // vite.config.ts
 * import { ChainboxVite } from "@sddion/chainbox/vite";
 * 
 * export default defineConfig({
 *   plugins: [ChainboxVite()]
 * });
 */
export function ChainboxVite(options: ChainboxMiddlewareOptions = {}): Plugin {
  return {
    name: "chainbox-vite",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        (req, res, next) => {
            // Need to wrap in promise because our middleware is async
            const middleware = ChainboxMiddleware(options);
            // @ts-ignore - Vite uses Connect types which are compatible with Http
            middleware(req, res, next).catch(next);
        }
      );
    },
  };
}
