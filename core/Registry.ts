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

  public static SetRoot(dir: string) {
    this.functionsDir = path.resolve(process.cwd(), dir);
  }

  // ...

  public static async Resolve(fnName: string): Promise<CodeSource & { permissions?: { allow: string[] } }> {
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
        return {
          type: "js",
          content: "",
          handler: handler, 
          permissions: module.permissions,
        };
       } catch (error: any) {
        console.error(`chainbox: Error loading function "${fnName}" at ${filePath}`, error);
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

    console.error(`chainbox: Function not found: ${fnName} (checked ${filePath || targetPath}, ${wasmPath})`);
    throw new Error("FUNCTION_NOT_FOUND");
  }
}
