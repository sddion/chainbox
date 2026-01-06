import { createJiti } from "jiti";
import path from "path";
import fs from "fs";

export interface ChainboxConfig {
  /**
   * Root directory where chain functions are located.
   * Relative to project root.
   * @default "src/app/_chain"
   */
  functionsDir?: string;
}

export const defaultConfig: ChainboxConfig = {
  functionsDir: "src/app/_chain",
};

/**
 * Helper to define config with type safety.
 */
export function Config(config: ChainboxConfig): ChainboxConfig {
  return config;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<ChainboxConfig> {
  // Support .ts, .js
  const files = ["chainbox.config.ts", "chainbox.config.js"];
  
  for (const file of files) {
    const filePath = path.join(cwd, file);
    if (fs.existsSync(filePath)) {
      try {
        const jiti = createJiti(__filename);
        const mod = await jiti.import(filePath, { default: true }) as any;
        // Merge with defaults
        // If mod is the config object (default export)
        return { ...defaultConfig, ...(mod.default || mod) };
      } catch (error) {
        console.error(`  Failed to load ${file}:`, error);
        return defaultConfig;
      }
    }
  }

  return defaultConfig;
}
