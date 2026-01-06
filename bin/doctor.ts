import fs from "fs";
import path from "path";
import { loadConfig } from "../tools/Config";

export async function Doctor() {
  console.log("\nChainbox Doctor\n");

  let issues = 0;

  // 1. Check Node.js Version
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split(".")[0]);
  if (major < 18) {
    console.error(`Node.js Version: ${nodeVersion} (Required: >= 18)`);
    issues++;
  } else {
    console.log(`Node.js Version: ${nodeVersion}`);
  }

  // 2. Check Environment Variables
  const requiredEnv = ["CHAINBOX_SUPABASE_URL", "CHAINBOX_SUPABASE_SECRET_KEY"];
  const optionalEnv = ["CHAINBOX_MESH_SECRET", "CHAINBOX_MESH_NODES"];
  
  // Try to load .env if not loaded (simple check)
  if (fs.existsSync(".env")) {
     console.log(".env file found");
  } else {
     console.log("No .env file found (checking process.env)");
  }

  requiredEnv.forEach(key => {
    if (!process.env[key]) {
      console.warn(`Missing Env: ${key} (Required for DB access)`);
    } else {
      console.log(`Env: ${key} is set`);
    }
  });

  if (process.env.NODE_ENV === "production" && !process.env.CHAINBOX_MESH_SECRET) {
    console.error("Configure CHAINBOX_MESH_SECRET in production!");
    issues++;
  }

  // 3. Check Project Structure
  const config = await loadConfig();
  if (config.functionsDir !== "src/app/_chain") {
    console.log(`Using custom chain directory: ${config.functionsDir}`);
  }

  const chainDir = path.join(process.cwd(), config.functionsDir || "src/app/_chain");
  if (!fs.existsSync(chainDir)) {
    console.error(`Missing Function Directory: src/app/_chain`);
    issues++;
  } else {
    console.log(`Function Directory: Found`);
  }

  // 4. Check TypeScript Config
  const tsConfigPath = path.join(process.cwd(), "tsconfig.json");
  if (fs.existsSync(tsConfigPath)) {
    console.log(`tsconfig.json: Found`);
  } else {
    console.warn(`tsconfig.json not found (Typescript is recommended)`);
  }

  console.log("\n---");
  if (issues > 0) {
    console.log(`\nDoctor found ${issues} issue(s). Please fix them.`);
    process.exit(1);
  } else {
    console.log("\nAll systems go. You are ready to build.");
  }
}
