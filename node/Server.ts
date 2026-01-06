import http from "http";
import { Executor } from "../core/Executor";
import { MeshPayload, MeshBatchPayload } from "../transport/Mesh";
import { RequestSigner } from "../core/RequestSigner";
import { ChainboxError } from "../core/Context";

// Automatically mark this process as a mesh node
process.env.CHAINBOX_IS_NODE = "true";

/**
 * Standalone Chainbox Mesh Node Server.
 * Receives MeshPayload and executes functions via the Executor.
 */
export class ChainboxNode {
  private static startTime = Date.now();
  private static requestCount = 0;

  /**
   * Start the mesh node server.
   */
  public static Start(port: number = 4000, staticDir?: string) {
    const server = http.createServer(async (req, res) => {
      // Health check endpoint
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "healthy",
          uptime: Date.now() - this.startTime,
          requests: this.requestCount,
        }));
        return;
      }

      // Execute endpoint
      if (req.method === "POST" && (req.url === "/execute" || req.url === "/execute/batch")) {
        const isBatch = req.url === "/execute/batch";
        this.requestCount++;
        
        let bodyBytes: Buffer[] = [];
        let currentSize = 0;
        const maxBodySize = parseInt(process.env.CHAINBOX_MAX_BODY_SIZE || "5242880"); // 5MB

        req.on("data", chunk => {
          currentSize += chunk.length;
          if (currentSize > maxBodySize) {
             console.error(`chainbox-node: Payload too large (${currentSize} bytes)`);
             res.writeHead(413, { "Content-Type": "application/json" });
             res.end(JSON.stringify({ error: "PAYLOAD_TOO_LARGE", message: "Request body exceeds limit" }));
             req.destroy();
             return;
          }
          bodyBytes.push(chunk);
        });
        
        req.on("end", async () => {
          const body = Buffer.concat(bodyBytes).toString();
          let payload: any;
          try {
            payload = JSON.parse(body);
          } catch {
            return this.SendError(res, "INVALID_JSON", "Failed to parse request body");
          }

          // Security: Verify Request Signature
          const verification = RequestSigner.VerifyHeaders(payload, req.headers as any);
          if (!verification.valid) {
            console.warn(`chainbox-node: Security violation - ${verification.error}`);
            return this.SendError(res, "FORBIDDEN", verification.error || "INVALID_SIGNATURE", 403);
          }

          if (isBatch) {
            const batch = payload as MeshBatchPayload;
            // console.log(`chainbox-node: Batch execution of ${batch.calls.length} functions`);
            
            try {
              const results = await Promise.all(batch.calls.map(call => 
                Executor.Execute(call.fn, call.input, batch.trace, batch.identity, batch.frame, true, { traceId: batch.traceId })
              ));
              
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ results }));
            } catch (error: any) {
              const code = error instanceof ChainboxError ? error.code : "BATCH_EXECUTION_ERROR";
              this.SendError(res, code, error.message);
            }
          } else {
            const single = payload as MeshPayload;
            try {
              // console.log(`chainbox-node: Executing "${single.fn}" (identity: ${single.identity?.id || "anonymous"})`);
              const result = await Executor.Execute(
                single.fn,
                single.input,
                single.trace,
                single.identity,
                single.frame,
                true,
                { traceId: single.traceId }
              );
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(result));
            } catch (error: any) {
              const code = error instanceof ChainboxError ? error.code : (error.error || "EXECUTION_ERROR");
              this.SendError(res, code, error.message, 500, single.fn);
            }
          }
        });
        return;
      }

      // 404 / Static File Serving
      if (staticDir) {
        const fs = require("fs");
        const path = require("path");
        
        let filePath = path.join(staticDir, req.url === "/" ? "index.html" : req.url || "");
        
        // Prevent directory traversal
        if (!filePath.startsWith(path.resolve(staticDir))) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
           const ext = path.extname(filePath).toLowerCase();
           const mimePromise = import("mime"); // Lazy load specific MIME if needed, simple map for now
           const map: any = {
             ".html": "text/html",
             ".js": "application/javascript",
             ".css": "text/css",
             ".json": "application/json",
             ".png": "image/png",
             ".jpg": "image/jpeg",
             ".svg": "image/svg+xml",
             ".ico": "image/x-icon",
           };
           res.writeHead(200, { "Content-Type": map[ext] || "application/octet-stream" });
           fs.createReadStream(filePath).pipe(res);
           return;
        }

        // SPA Fallback for HTML requests
        if (req.headers.accept?.includes("text/html")) {
            const index = path.join(staticDir, "index.html");
            if (fs.existsSync(index)) {
                res.writeHead(200, { "Content-Type": "text/html" });
                fs.createReadStream(index).pipe(res);
                return;
            }
        }
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "NOT_FOUND" }));
    });


    server.listen(port, () => {
      console.log(`chainbox-node: Mesh node started on port ${port}`);
      console.log(`chainbox-node: Health check available at http://localhost:${port}/health`);
    });

    // Industry Standard: Graceful Shutdown
    const shutdown = (signal: string) => {
      console.log(`chainbox-node: Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log("chainbox-node: Server closed.");
        process.exit(0);
      });

      // Force shutdown after 10s
      setTimeout(() => {
        console.error("chainbox-node: Could not close connections in time, forceful shutdown.");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    return server;
  }

  /**
   * Helper to send JSON error responses.
   */
  private static SendError(res: http.ServerResponse, error: string, message?: string, code: number = 500, fn?: string) {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error, message, function: fn }));
  }
}
