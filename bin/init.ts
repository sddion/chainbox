import fs from "fs";
import path from "path";

export async function Init() {
  const target = "chainbox.config.ts";
  const targetPath = path.join(process.cwd(), target);

  if (fs.existsSync(targetPath)) {
    console.log(`  ${target} already exists.`);
    return;
  }

  const content = `import { Config } from "@sddion/chainbox";

export default Config({
  /**
   * Root directory where chain functions are located.
   * By default, Chainbox looks in 'src/app/_chain'.
   * 
   * Change this if you want to store your capabilities elsewhere.
   * Example: "lib/functions"
   */
  functionsDir: "src/app/_chain",

  /**
   * (Future) Strict Policy Mode
   * If true, denies all anonymous access by default.
   * 
   * policy: {
   *   strict: true
   * }
   */
});
`;

  fs.writeFileSync(targetPath, content);
  console.log(`  Created ${target} with default settings.`);
}
