#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { ChainboxNode } from "../node/Server";
import { MigrationScanner } from "./migrate";
import { Doctor } from "./doctor";
import { Init } from "./init";

const program = new Command();

program
  .name("chainbox")
  .description("Chainbox CLI")
  .version("0.9.3");

program
  .command("init")
  .description("Initialize a new Chainbox project (creates chainbox.config.ts)")
  .action(async () => {
    await Init();
    // Also create the struct if not exists
    const dirs = ["src/app/_chain"];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`  created ${dir}`);
      }
    });
  });

program
  .command("add")
  .argument("<name>", "Function name (e.g., User.Create)")
  .description("Add a new Chainbox function scaffold")
  .action((name) => {
    const parts = name.split(".");
    const fileName = parts.pop() + ".ts";
    const dirPath = path.join("src", "app", "_chain", ...parts);
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const filePath = path.join(dirPath, fileName);
    if (fs.existsSync(filePath)) {
      console.error(`chainbox: Function ${name} already exists at ${filePath}`);
      return;
    }

    const template = `import { Ctx } from "@sddion/chainbox";

/**
 * ${name} - Automatically generated Chainbox function.
 */
export default async function (ctx: Ctx) {
  const { name = "World" } = ctx.input || {};
  
  return {
    message: \`Hello, \${name}!\`,
    timestamp: Date.now(),
  };
}
`;

    fs.writeFileSync(filePath, template);
    console.log(`chainbox: Created function scaffold at ${filePath}`);
  });

program
  .command("serve")
  .option("-p, --port <number>", "Port to listen on", "4000")
  .description("Start a standalone Chainbox mesh node")
  .action((options) => {
    const port = parseInt(options.port);
    ChainboxNode.Start(port);
  });

program
  .command("migrate")
  .description("Scan project for API routes and suggest Chainbox migrations")
  .argument("[dir]", "Directory to scan", ".")
  .action(async (dir) => {
    await MigrationScanner.Scan(dir);
  });

program
  .command("doctor")
  .description("Check your environment for common issues")
  .action(() => {
    Doctor();
  });

program
  .command("trace")
  .description("Inspect an execution trace by ID (Development only)")
  .argument("<traceId>", "Trace ID to locate")
  .action(async (traceId) => {
    const logFile = path.join(process.cwd(), ".chainbox", "trace.log");
    
    if (!fs.existsSync(logFile)) {
      console.error("chainbox: No trace logs found in .chainbox/trace.log");
      return;
    }

    const { createInterface } = await import("readline");
    const fileStream = fs.createReadStream(logFile);
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

    let found = false;
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.traceId === traceId) {
          found = true;
          console.log(`\n🔎 Trace Found: ${traceId}\n`);
          console.log(`Fon: ${entry.function}`);
          console.log(`Status: ${entry.status}`);
          console.log(`Duration: ${entry.durationMs}ms`);
          console.log(`Identity: ${entry.identity || "anonymous"}`);
          if (entry.error) console.log(`Error: ${entry.error}`);
          console.log("\nExecution Tree:");
          console.log(JSON.stringify(entry.trace, null, 2));
          break;
        }
      } catch {}
    }

    if (!found) {
      console.error(`chainbox: Trace ${traceId} not found in logs.`);
    }
  });

program.parse();
