import fs from "fs";
import path from "path";
import { loadConfig, ChainboxConfig } from "../tools/Config";

export async function ListFunctions() {
  const config: ChainboxConfig = await loadConfig();
  const rootDir = path.resolve(process.cwd(), config.functionsDir || "src/app/_chain");

  if (!fs.existsSync(rootDir)) {
    console.error(`chainbox: Functions directory not found at ${rootDir}`);
    return;
  }

  console.log(`\n Chainbox Registry (${rootDir})\n`);

  const functions: string[] = [];

  function scan(dir: string, prefix = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
         scan(path.join(dir, entry.name), prefix + entry.name + ".");
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
         if (entry.name.startsWith("_")) continue; // Skip private files
         
         const fnName = prefix + entry.name.replace(/\.(ts|js|mjs)$/, "");
         functions.push(fnName);
      }
    }
  }

  scan(rootDir);

  if (functions.length === 0) {
    console.log("  No functions found.");
    console.log("  Run 'npx chainbox add User.Create' to get started.");
  } else {
    functions.sort().forEach(fn => {
        console.log(`  - ${fn}`);
    });
    console.log(`\n  Total: ${functions.length} capabilities\n`);
  }
}
