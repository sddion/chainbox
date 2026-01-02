import path from "path";
import jiti from "jiti";

export type CodeSource = {
  type: "ts" | "js" | "wasm";
  content: string | Buffer;
  handler?: any;
};

/**
 * Registry handles the discovery and resolution of Chainbox functions.
 */
export class Registry {
  private static functionsDir = path.join(process.cwd(), "src", "app", "_chain");

  // In a real system, this would be backed by a CAS (Content Addressed Storage)
  private static hashMap: Record<string, string | CodeSource> = {};

  /**
   * Registers a function hash to a logical path or raw code.
   */
  public static RegisterHash(hash: string, target: string | CodeSource) {
    this.hashMap[hash] = target;
  }

  /**
   * Resolves a logical function name to its handler or source.
   */
  public static async Resolve(fnName: string): Promise<CodeSource & { permissions?: { allow: string[] } }> {
    // If it's a hash, resolve via hashMap
    if (/^[a-f0-9]{64}$/.test(fnName)) {
      const target = this.hashMap[fnName];
      if (!target) throw new Error("HASH NOT RESOLVED");
      
      if (typeof target === "string") {
        return this.Resolve(target);
      }
      return { ...target };
    }

    const parts = fnName.split(".");
    let targetPath = path.join(this.functionsDir, ...parts);
    
    // Try resolving as file
    const tsPath = targetPath + ".ts";
    const wasmPath = targetPath + ".wasm";
    
    // Check for WASM first (prefer implementation if mixed, or strict priority)
    // Actually standard is TS/JS first for ease, but logic needs to support both.
    
    // 1. Try TS/JS
    if (require('fs').existsSync(tsPath)) {
       try {
        const loader = jiti(process.cwd(), { cache: false, interopDefault: true });
        const module = loader(tsPath);
        const handler = module.default || module;
        return {
          type: "js",
          content: "",
          handler: handler, 
          permissions: module.permissions,
        };
       } catch (error: any) {
        console.error(`chainbox: Error loading function "${fnName}" at ${tsPath}`, error);
        throw new Error("FUNCTION_LOAD_ERROR");
       }
    }

    // 2. Try WASM
    if (require('fs').existsSync(wasmPath)) {
      try {
        const content = require('fs').readFileSync(wasmPath);
        return {
          type: "wasm",
          content: content,
          permissions: { allow: [] } // Metadata sidecar could supply permissions later
        };
      } catch (error: any) {
        console.error(`chainbox: Error loading WASM function "${fnName}" at ${wasmPath}`, error);
        throw new Error("WASM_LOAD_ERROR");
      }
    }

    // Fallback for .Cached extension handling for TS files
    if (fnName.endsWith(".Cached")) {
      const fallbackName = fnName.slice(0, -7);
      return this.Resolve(fallbackName);
    }

    console.error(`chainbox: Function not found: ${fnName} (checked ${tsPath}, ${wasmPath})`);
    throw new Error("FUNCTION_NOT_FOUND");
  }
}
