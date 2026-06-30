import { copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

for (const entry of readdirSync("dist")) {
  if (entry.endsWith(".mjs")) {
    copyFileSync(join("dist", entry), entry);
  }
}
