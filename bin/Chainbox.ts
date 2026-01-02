#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { ChainboxNode } from "../node/Server";

const program = new Command();

program
  .name("chainbox")
  .description("CLI for Chainbox - Execution-first backend framework")
  .version("0.8.0");

program
  .command("init")
  .description("Initialize a new Chainbox project")
  .action(() => {
    console.log("chainbox: Initializing project...");
    const dirs = ["src/app/_chain"];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`  created ${dir}`);
      }
    });
    console.log("chainbox: Done! Create your first function in src/app/_chain/Hello.ts");
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

program.parse();
