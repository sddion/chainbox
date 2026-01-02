import http from "http";
import { Executor } from "../core/Executor";
import { MeshPayload, MeshBatchPayload } from "../transport/Mesh";
import { RequestSigner } from "../core/RequestSigner";

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
  public static Start(port: number = 4000) {
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
        req.on("data", chunk => bodyBytes.push(chunk));
        
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
            console.log(`chainbox-node: Batch execution of ${batch.calls.length} functions`);
            
            try {
              const results = await Promise.all(batch.calls.map(call => 
                Executor.Execute(call.fn, call.input, batch.trace, batch.identity, batch.frame, true)
              ));
              
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ results }));
            } catch (error: any) {
              this.SendError(res, error.error || "BATCH_EXECUTION_ERROR", error.message);
            }
          } else {
            const single = payload as MeshPayload;
            try {
              console.log(`chainbox-node: Executing "${single.fn}" (identity: ${single.identity?.id || "anonymous"})`);
              const result = await Executor.Execute(
                single.fn,
                single.input,
                single.trace,
                single.identity,
                single.frame,
                true
              );
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(result));
            } catch (error: any) {
              this.SendError(res, error.error || "EXECUTION_ERROR", error.message, 500, single.fn);
            }
          }
        });
        return;
      }

      // 404 for unknown routes
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "NOT_FOUND" }));
    });


    server.listen(port, () => {
      console.log(`chainbox-node: Mesh node started on port ${port}`);
      console.log(`chainbox-node: Health check available at http://localhost:${port}/health`);
    });

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
