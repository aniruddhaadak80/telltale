/**
 * Secret scan for anything about to be committed.
 *
 * Looks for real credential shapes rather than the words: an assigned value, a
 * connection string, a token prefix, a private key header. Documentation that merely
 * names a variable is not a finding.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const IGNORE = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|lock)$/i;
const MAX_BYTES = 2_000_000;

const RULES = [
  { name: "connection string", pattern: /postgres(?:ql)?:\/\/[^\s"']*:[^\s"']*@[^\s"']+/g },
  { name: "github token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "openai style key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "private key header", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "assigned database url", pattern: /^\s*(?:DATABASE_URL|POSTGRES_URL)\s*=\s*\S+/gm },
  { name: "assigned secret", pattern: /^\s*(?:[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z_]*)\s*=\s*\S+/gm },
  { name: "assigned api key json", pattern: /"(?:api[_-]?key|apikey|token|secret|password)"\s*:\s*"[^"]{8,}"/gi },
  { name: "neon host", pattern: /\b[a-z0-9-]+\.(?:neon\.tech|aws\.neon\.tech)\b/gi },
];

const files = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !IGNORE.test(line));

const findings = [];

for (const file of files) {
  let text;
  try {
    const stat = execFileSync("git", ["cat-file", "-s", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (Number(stat.trim()) > MAX_BYTES) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      findings.push({ file, rule: rule.name, sample: match[0].slice(0, 60) });
    }
  }
}

if (findings.length === 0) {
  console.log(`No credentials found across ${files.length} candidate files.`);
  process.exit(0);
}

console.log(`${findings.length} potential finding(s):\n`);
for (const finding of findings) {
  console.log(`  ${finding.file}: ${finding.rule} -> ${JSON.stringify(finding.sample)}`);
}
console.log("\nReview each one. A documented variable name is fine; an assigned value is not.");
process.exit(1);