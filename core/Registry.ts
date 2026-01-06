import path from "path";
import jiti from "jiti";

export type CodeSource = {
  type: "ts" | "js" | "wasm";
  content: string | Buffer;
  handler?: any;
  permissions?: { allow: string[] };
};

/**
 * Registry handles the discovery and resolution of Chainbox functions.
 */
export class Registry {
  private static functionsDir = path.join(process.cwd(), "src", "app", "_chain");

  private static cache = new Map<string, CodeSource & { permissions?: { allow: string[] } }>();

  public static SetRoot(dir: string) {
    this.functionsDir = path.resolve(process.cwd(), dir);
    this.cache.clear(); // Clear cache on root change
  }

  // ...

  public static async Resolve(fnName: string): Promise<CodeSource & { permissions?: { allow: string[] } }> {
    if (this.cache.has(fnName)) {
      return this.cache.get(fnName)!;
    }

    // ...
    const parts = fnName.split(".");
    let targetPath = path.join(this.functionsDir, ...parts);
    
    // Check various extensions: .ts, .js, .mjs, .cjs
    const extensions = [".ts", ".js", ".mjs", ".cjs"];
    let filePath = "";
    
    for (const ext of extensions) {
      if (require('fs').existsSync(targetPath + ext)) {
        filePath = targetPath + ext;
        break;
      }
    }
    
    const wasmPath = targetPath + ".wasm";
    
    // 1. Try TS/JS
    if (filePath) {
       try {
        const loader = jiti(process.cwd(), { cache: false, interopDefault: true });
        const module = loader(filePath);
        const handler = module.default || module;
        const result = {
          type: "js" as const, // Explicit const assertion for type safety
          content: "",
          handler: handler, 
          permissions: module.permissions,
        };
        this.cache.set(fnName, result);
        return result;
       } catch (error: any) {
        console.error(`chainbox: Error loading function "${fnName}" at ${filePath}`, error);
        throw new Error("FUNCTION_LOAD_ERROR");
       }
    }

    // 2. Try WASM
    if (require('fs').existsSync(wasmPath)) {
      try {
        const content = require('fs').readFileSync(wasmPath);
        const result = {
          type: "wasm" as const,
          content: content,
          permissions: { allow: [] } // Metadata sidecar could supply permissions later
        };
        this.cache.set(fnName, result);
        return result;
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

    console.error(`chainbox: Function not found: ${fnName} (checked ${filePath || targetPath}, ${wasmPath})`);
    throw new Error("FUNCTION_NOT_FOUND");
  }
}
