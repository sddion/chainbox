import fs from "fs";
import path from "path";
import { promisify } from "util";

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

type ScanResult = {
  file: string;
  type: "fetch" | "axios" | "api-route" | "server-action";
  line: number;
  match: string;
  suggestion: string;
};

export class MigrationScanner {
  private static results: ScanResult[] = [];

  public static async Scan(dir: string) {
    console.log(`\nScanning ${dir} for migration opportunities...\n`);
    this.results = [];
    await this.walk(dir);
    this.report();
  }

  private static async walk(dir: string) {
    const files = await readdir(dir);
    for (const file of files) {
      if (file.startsWith(".") || file === "node_modules" || file === "dist") continue;
      
      const fullPath = path.join(dir, file);
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        await this.walk(fullPath);
      } else if (file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".jsx")) {
        await this.analyzeFile(fullPath);
      }
    }
  }

  private static async analyzeFile(filePath: string) {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      // 1. Detect fetch("/api/...")
      const fetchMatch = line.match(/fetch\s*\(['"`]\/api\/([^'"`]+)['"`]\)/);
      if (fetchMatch) {
        this.results.push({
          file: filePath,
          type: "fetch",
          line: index + 1,
          match: fetchMatch[0],
          suggestion: `Replace with: await Call("${this.toPascalCase(fetchMatch[1])}")`
        });
      }

      // 2. Detect axios.get/post("/api/...")
      const axiosMatch = line.match(/axios\.(get|post|put|delete)\s*\(['"`]\/api\/([^'"`]+)['"`]/);
      if (axiosMatch) {
         this.results.push({
          file: filePath,
          type: "axios",
          line: index + 1,
          match: axiosMatch[0],
          suggestion: `Replace with: await Call("${this.toPascalCase(axiosMatch[2])}")`
        });
      }

      // 3. Detect API Routes (pages/api or app/api)
      if (filePath.includes("/api/") && (line.includes("export default function handler") || line.includes("export async function GET"))) {
         this.results.push({
          file: filePath,
          type: "api-route",
          line: index + 1,
          match: "API Route Handler",
          suggestion: `Move logic to: src/app/_chain/${this.suggestChainPath(filePath)}.ts`
        });
      }
    });
  }

  private static toPascalCase(str: string): string {
    return str.split(/[\/-]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(".");
  }

  private static suggestChainPath(filePath: string): string {
    // raw: src/pages/api/users/create.ts -> Users/Create
    const parts = filePath.split("/api/")[1].split(".")[0].split("/");
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("/");
  }

  private static report() {
    if (this.results.length === 0) {
      console.log("  No legacy API patterns found! Your code looks Chainbox-ready.");
      return;
    }

    console.log(`  Found ${this.results.length} migration opportunities:\n`);
    
    this.results.forEach(r => {
      console.log(`  ${r.file}:${r.line}`);
      console.log(`     Found: ${r.match}`);
      console.log(`     Suggestion: ${r.suggestion}`);
      console.log("");
    });

    console.log("  Tip: Logical Functions allow you to delete this boilerplate entirely.");
  }
}
