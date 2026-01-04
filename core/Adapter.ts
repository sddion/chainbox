import { ChainboxError } from "./Context";

/**
 * Adapter interface for external I/O providers.
 */
export interface Adapter {
  name: string;
  config?: any;
  client: any;
}

/**
 * AdapterRegistry manages allowed external integrations.
 * Only registered adapters can be used by functions.
 */
export class AdapterRegistry {
  private static adapters: Map<string, Adapter> = new Map();

  /**
   * Register a new adapter.
   */
  public static Register(name: string, client: any, config?: any) {
    this.adapters.set(name, { name, client, config });
  }

  /**
   * Get an adapter client by name.
   */
  public static Get(name: string): any {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new ChainboxError(
        "ADAPTER_NOT_FOUND",
        `Adapter '${name}' is not registered.`,
        "AdapterRegistry",
        "system" // Trace ID unavailable here, usually called within context context
      );
    }
    return adapter.client;
  }
  
  /**
   * Initialize default adapters (e.g. system adapters).
   * In a real app, users would register these in chainbox.config.ts or similar.
   */
  public static Init() {
     // Example: Register a basic HTTP client if explicitly allowed
     // For now, we remain strict and empty.
  }
}

/**
 * Standard HTTP Adapter for controlled external access.
 */
export class HttpAdapter {
  constructor(private baseUrl: string, private options: any = {}) {}

  public async get(path: string) { return this.request("GET", path); }
  public async post(path: string, body: any) { return this.request("POST", path, body); }

  private async request(method: string, path: string, body?: any) {
    const url = `${this.baseUrl}${path}`;
    
    // Uses undici to bypass patched global.fetch in the runtime
    const { request } = require("undici");
    const { statusCode, body: resBody } = await request(url, {
      method,
      headers: { "Content-Type": "application/json", ...this.options.headers },
      body: body ? JSON.stringify(body) : undefined
    });
    
    if (statusCode >= 400) throw new Error(`HTTP Error ${statusCode}`);
    return await resBody.json();
  }
}
