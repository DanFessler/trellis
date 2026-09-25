// Typecheck every example and the site that has a tsconfig.json.
import { existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const dirs = [...readdirSync("examples").map((d) => `examples/${d}`), "site", "e2e/app"].filter((d) =>
  existsSync(`${d}/tsconfig.json`),
);
let failed = false;
for (const dir of dirs) {
  try {
    execSync(`npx tsc -p ${dir}`, { stdio: "inherit" });
    console.log(`✓ ${dir}`);
  } catch {
    failed = true;
    console.error(`✗ ${dir}`);
  }
}
process.exit(failed ? 1 : 0);
