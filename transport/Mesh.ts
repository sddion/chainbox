import { Identity, ExecutionFrame, TraceFrame } from "../core/Context";
import { ExecutionPlanner } from "../core/ExecutionPlanner";
import { Client, Pool } from "undici";
import { RequestSigner } from "../core/RequestSigner";

/**
 * MeshPayload is the serializable data sent between nodes.
 */
export type MeshPayload = {
  fn: string;
  input: any;
  identity?: Identity;
  frame: ExecutionFrame;
  trace: TraceFrame[];
};

/**
 * MeshBatchPayload groups multiple calls to the same node.
 */
export type MeshBatchPayload = {
  calls: { fn: string; input: any }[];
  identity?: Identity;
  frame: ExecutionFrame;
  trace: TraceFrame[];
};

/**
 * CircuitState represents the state of the circuit breaker.
 */
type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * CircuitBreakerStats tracks per-node circuit breaker state.
 */
type CircuitBreakerStats = {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number;
  lastStateChange: number;
};

/**
 * CircuitBreaker configuration from environment.
 */
const CIRCUIT_CONFIG = {
  // Number of failures before opening the circuit
  threshold: parseInt(process.env.CHAINBOX_CIRCUIT_THRESHOLD || "5"),
  // Time in ms before attempting to half-open
  timeoutMs: parseInt(process.env.CHAINBOX_CIRCUIT_TIMEOUT_MS || "30000"),
  // Number of successes in half-open before closing
  successThreshold: parseInt(process.env.CHAINBOX_CIRCUIT_SUCCESS_THRESHOLD || "2"),
};

/**
 * CircuitBreaker manages per-node circuit states.
 */
export class CircuitBreaker {
  private static circuits: Map<string, CircuitBreakerStats> = new Map();

  /**
   * Get or initialize circuit state for a node.
   */
  private static GetCircuit(nodeId: string): CircuitBreakerStats {
    if (!this.circuits.has(nodeId)) {
      this.circuits.set(nodeId, {
        state: "CLOSED",
        failures: 0,
        successes: 0,
        lastFailure: 0,
        lastStateChange: Date.now(),
      });
    }
    return this.circuits.get(nodeId)!;
  }

  /**
   * Check if requests to this node are allowed.
   */
  public static IsAllowed(nodeId: string): boolean {
    const circuit = this.GetCircuit(nodeId);

    switch (circuit.state) {
      case "CLOSED":
        return true;

      case "OPEN":
        // Check if timeout has passed to allow half-open
        if (Date.now() - circuit.lastStateChange > CIRCUIT_CONFIG.timeoutMs) {
          circuit.state = "HALF_OPEN";
          circuit.lastStateChange = Date.now();
          circuit.successes = 0;
          console.log(`chainbox: Circuit for ${nodeId} is now HALF_OPEN (testing)`);
          return true;
        }
        return false;

      case "HALF_OPEN":
        return true;

      default:
        return true;
    }
  }

  /**
   * Record a successful call.
   */
  public static RecordSuccess(nodeId: string) {
    const circuit = this.GetCircuit(nodeId);

    if (circuit.state === "HALF_OPEN") {
      circuit.successes++;
      if (circuit.successes >= CIRCUIT_CONFIG.successThreshold) {
        circuit.state = "CLOSED";
        circuit.failures = 0;
        circuit.lastStateChange = Date.now();
        console.log(`chainbox: Circuit for ${nodeId} is now CLOSED (recovered)`);
      }
    } else if (circuit.state === "CLOSED") {
      // Reset failure count on success
      circuit.failures = 0;
    }
  }

  /**
   * Record a failed call.
   */
  public static RecordFailure(nodeId: string) {
    const circuit = this.GetCircuit(nodeId);
    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === "HALF_OPEN") {
      // Immediate open on failure during half-open
      circuit.state = "OPEN";
      circuit.lastStateChange = Date.now();
      console.log(`chainbox: Circuit for ${nodeId} is now OPEN (half-open test failed)`);
    } else if (circuit.state === "CLOSED" && circuit.failures >= CIRCUIT_CONFIG.threshold) {
      circuit.state = "OPEN";
      circuit.lastStateChange = Date.now();
      console.log(`chainbox: Circuit for ${nodeId} is now OPEN (threshold reached: ${circuit.failures} failures)`);
    }
  }

  /**
   * Get current state of a circuit.
   */
  public static GetState(nodeId: string): CircuitState {
    return this.GetCircuit(nodeId).state;
  }

  /**
   * Get all circuit states (for monitoring).
   */
  public static GetAllStates(): Record<string, CircuitBreakerStats> {
    return Object.fromEntries(this.circuits);
  }
}

/**
 * Mesh transport calls functions on remote Chainbox nodes with circuit breaker protection.
 */
export class Mesh {
  private static MAX_RETRIES = 3;
  private static BASE_DELAY_MS = 100;
  private static pools: Map<string, Pool> = new Map();

  /**
   * Get or create a high-performance connection pool for a node.
   */
  private static GetPool(nodeUrl: string): Pool {
    const origin = new URL(nodeUrl).origin;
    if (!this.pools.has(origin)) {
      this.pools.set(origin, new Pool(origin, {
        connections: parseInt(process.env.CHAINBOX_MESH_CONNECTIONS || "100"),
        keepAliveTimeout: 60000,
        pipelining: 10,
      }));
    }
    return this.pools.get(origin)!;
  }

  /**
   * Call a remote Chainbox node with retry logic and circuit breaker.
   */
  public static async Call(nodeUrl: string, payload: MeshPayload): Promise<any> {
    const nodeId = this.GetNodeIdFromUrl(nodeUrl);

    // Circuit Breaker Check
    if (!CircuitBreaker.IsAllowed(nodeId)) {
      throw {
        error: "CIRCUIT_OPEN",
        nodeUrl,
        function: payload.fn,
        message: `Circuit breaker is OPEN for node ${nodeId}. Try again later.`,
      };
    }

    const pool = this.GetPool(nodeUrl);
    const urlObj = new URL(nodeUrl);
    const path = (urlObj.pathname === "/" ? "" : urlObj.pathname) + "/execute";
    let lastError: any;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const headers = {
          "Content-Type": "application/json",
          ...RequestSigner.CreateHeaders(payload),
        };

        const { statusCode, body } = await pool.request({
          path,
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        const data = await body.json() as any;

        if (statusCode >= 400) {
          throw data;
        }

        // Success - record and mark healthy
        CircuitBreaker.RecordSuccess(nodeId);
        ExecutionPlanner.MarkHealthy(nodeId);
        
        return data;
      } catch (error: any) {
        lastError = error;
        
        // Network failures trigger circuit breaker
        if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT" || error.name === "TypeError" || error.code === "UND_ERR_SOCKET") {
          CircuitBreaker.RecordFailure(nodeId);
          ExecutionPlanner.MarkUnhealthy(nodeId);
        }

        // Check if circuit is now open
        if (!CircuitBreaker.IsAllowed(nodeId)) {
          break; // Don't retry if circuit just opened
        }

        // Exponential backoff before retry
        if (attempt < this.MAX_RETRIES - 1) {
          const delay = this.BASE_DELAY_MS * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    throw {
      error: "MESH_CALL_FAILED",
      nodeUrl,
      function: payload.fn,
      attempts: this.MAX_RETRIES,
      circuitState: CircuitBreaker.GetState(nodeId),
      lastError: lastError?.message || lastError,
    };
  }

  /**
   * Call a remote Chainbox node with a batch of functions.
   */
  public static async BatchCall(nodeUrl: string, payload: MeshBatchPayload): Promise<any[]> {
    const nodeId = this.GetNodeIdFromUrl(nodeUrl);

    if (!CircuitBreaker.IsAllowed(nodeId)) {
      throw {
        error: "CIRCUIT_OPEN",
        nodeUrl,
        batch: true,
        message: `Circuit breaker is OPEN for node ${nodeId}.`,
      };
    }

    const pool = this.GetPool(nodeUrl);
    const urlObj = new URL(nodeUrl);
    const path = (urlObj.pathname === "/" ? "" : urlObj.pathname) + "/execute/batch";

    try {
      const headers = {
        "Content-Type": "application/json",
        ...RequestSigner.CreateHeaders(payload),
      };

      const { statusCode, body } = await pool.request({
        path,
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await body.json() as any;

      if (statusCode >= 400) {
        throw data;
      }

      CircuitBreaker.RecordSuccess(nodeId);
      ExecutionPlanner.MarkHealthy(nodeId);

      return data.results;
    } catch (error: any) {
      CircuitBreaker.RecordFailure(nodeId);
      ExecutionPlanner.MarkUnhealthy(nodeId);
      throw error;
    }
  }

  /**
   * Extract node ID from URL by finding it in registered nodes.
   */
  private static GetNodeIdFromUrl(url: string): string {
    const nodes = ExecutionPlanner.GetNodes();
    const node = nodes.find(n => n.url === url);
    return node?.id || url;
  }
}
