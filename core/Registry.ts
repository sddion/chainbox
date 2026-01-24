// Safe imports
const path = (typeof process !== 'undefined' && process.versions && process.versions.node) ? require('path') : undefined;
// jiti is lazy loaded

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
  
  /**
   * Manual registry for environments without filesystem access (e.g. React Native).
   */
  public static Register(fnName: string, handler: any, metadata?: { permissions?: { allow: string[] } }) {
      this.cache.set(fnName, {
          type: "js",
          content: "native-code",
          handler,
          permissions: metadata?.permissions
      });
  }

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
    
    // 0. Manual Check (Always safe)
    // If registered via Register()
    // Already handled by cache check above? Yes.
    
    // 1. Filesystem Check (Node.js only)
    let filePath = "";
    
    // Safety check for Node.js environment
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fs = require('fs');
        
        // Check various extensions: .ts, .js, .mjs, .cjs
        const extensions = [".ts", ".js", ".mjs", ".cjs"];
        
        for (const ext of extensions) {
          if (fs.existsSync(targetPath + ext)) {
            filePath = targetPath + ext;
            break;
          }
        }
    } else {
        // In RN, if not in cache, we cannot look it up dynamically via FS.
        // We must error out or assume user registered it.
        console.warn(`chainbox: Registry lookup failed for "${fnName}" in non-Node environment. Ensure it is manually registered.`);
    }
    
    const wasmPath = targetPath + ".wasm";
    
    // 1. Try TS/JS
    if (filePath) {
       try {
        const jiti = require("jiti");
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
    const fs = (typeof process !== 'undefined' && process.versions && process.versions.node) ? require('fs') : undefined;

    if (fs && fs.existsSync(wasmPath)) {
      try {
        const content = fs.readFileSync(wasmPath);
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
