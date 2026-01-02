import { Ctx, ExecutionPlan } from "./Context";

/**
 * MeshNode represents a registered remote execution node.
 */
type MeshNode = {
  id: string;
  url: string;
  healthy: boolean;
  lastCheck: number;
};

/**
 * ExecutionPlanner decides where a function should execute.
 * Configuration via environment variables:
 * - CHAINBOX_MESH_NODES: node definitions (compute=http://host:port,wasm=http://host2:port)
 * - CHAINBOX_MESH_ROUTES: routing rules (Heavy.*:compute,Sandbox.*:wasm)
 * - CHAINBOX_MESH_DEFAULT: default target (local|random)
 */
export class ExecutionPlanner {
  private static nodes: Map<string, MeshNode> = new Map();
  private static routes: Array<{ pattern: RegExp; nodeIds: string[] }> = [];
  private static initialized = false;

  /**
   * Initialize from environment variables (lazy, once).
   */
  private static Init() {
    if (this.initialized) return;
    this.initialized = true;

    // Parse CHAINBOX_MESH_NODES: "compute=http://host:4000,wasm=http://host2:4001"
    const nodesEnv = process.env.CHAINBOX_MESH_NODES || "";
    if (nodesEnv) {
      nodesEnv.split(",").forEach(entry => {
        const [id, url] = entry.split("=");
        if (id && url) {
          this.nodes.set(id.trim(), {
            id: id.trim(),
            url: url.trim(),
            healthy: true,
            lastCheck: 0,
          });
        }
      });
    }

    // Parse CHAINBOX_MESH_ROUTES: "Heavy.*:compute,Sandbox.*:wasm,node1|node2"
    const routesEnv = process.env.CHAINBOX_MESH_ROUTES || "";
    if (routesEnv) {
      routesEnv.split(",").forEach(entry => {
        const [pattern, nodeIdsStr] = entry.split(":");
        if (pattern && nodeIdsStr) {
          const regexPattern = pattern.trim()
            .replace(/\./g, "\\.")
            .replace(/\*/g, ".*");
          
          const nodeIds = nodeIdsStr.split("|").map(id => id.trim());
          
          this.routes.push({
            pattern: new RegExp(`^${regexPattern}$`),
            nodeIds,
          });
        }
      });
    }
  }

  /**
   * Get all registered nodes.
   */
  public static GetNodes(): MeshNode[] {
    this.Init();
    return Array.from(this.nodes.values());
  }

  /**
   * Get a specific node by ID.
   */
  public static GetNode(nodeId: string): MeshNode | undefined {
    this.Init();
    return this.nodes.get(nodeId);
  }

  /**
   * Mark a node as unhealthy (called on connection failure).
   */
  public static MarkUnhealthy(nodeId: string) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.healthy = false;
      node.lastCheck = Date.now();
    }
  }

  /**
   * Mark a node as healthy (called on successful connection).
   */
  public static MarkHealthy(nodeId: string) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.healthy = true;
      node.lastCheck = Date.now();
    }
  }

  /**
   * Plans the execution of a function.
   * Matches fnName against configured routes, returns target node or local.
   */
  public static Plan(fnName: string, ctx: Ctx): ExecutionPlan {
    this.Init();

    // 1. Multi-Tenant Isolation: Check if tenant has a dedicated node pool
    const tenantPool = require("./TenantManager").TenantManager.GetNodePool(ctx.identity);
    if (tenantPool) {
      const poolNodes = Array.from(this.nodes.values())
        .filter(n => n.id.startsWith(tenantPool) && n.healthy);
      
      if (poolNodes.length > 0) {
        const selected = poolNodes[Math.floor(Math.random() * poolNodes.length)];
        return { target: "remote", nodeId: selected.url };
      }
      // If pool specified but no healthy nodes, fall back to global routes or local
    }

    console.log(`chainbox: Planning execution for "${fnName}". Nodes: ${this.nodes.size}, Routes: ${this.routes.length}`);

    // Find matching route
    for (const route of this.routes) {
      console.log(`chainbox: Checking route ${route.pattern} against ${fnName}`);
      if (route.pattern.test(fnName)) {
        console.log(`chainbox: Match found! Targets: ${route.nodeIds.join(", ")}`);
        // Collect all healthy nodes for this route
        const healthyNodes = route.nodeIds
          .map(id => {
            const node = this.nodes.get(id);
            if (!node) console.log(`chainbox: Node ID "${id}" not found in registry`);
            return node;
          })
          .filter(node => node && node.healthy) as MeshNode[];

        console.log(`chainbox: Healthy nodes for route: ${healthyNodes.length}`);

        if (healthyNodes.length > 0) {
          // Load balancing: Random selection
          const selected = healthyNodes[Math.floor(Math.random() * healthyNodes.length)];
          return {
            target: "remote",
            nodeId: selected.url,
          };
        }
      }
    }

    // Default: local execution
    return { target: "local" };
  }
}
