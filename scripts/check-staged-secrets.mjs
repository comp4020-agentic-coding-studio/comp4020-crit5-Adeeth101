import { execFileSync } from "node:child_process";

const pattern = /sk-[A-Za-z0-9_-]{20,}/;
let output = "";
try {
  output = execFileSync("git", ["grep", "--cached", "-nE", pattern.source], { encoding: "utf8" });
} catch (error) {
  // git grep exits 1 when nothing matches; that is the safe, clean result.
  if (error?.status !== 1) throw error;
}

const hits = output
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((line) => /[A-Z]/.test(line.slice(line.indexOf(":", line.indexOf(":") + 1) + 1)));

if (hits.length > 0) {
  console.error("commit blocked: something staged looks like an API key");
  for (const hit of hits) console.error(`  ${hit}`);
  console.error("Remove the key, re-stage, and commit again.");
  process.exit(1);
}
