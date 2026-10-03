/**
 * One-command wrapper around the Kaggle benchmark workflow.
 *
 * It does not hold credentials and it does not need any: everything is done with
 * the `kaggle` CLI against the account you authenticate with. The script exists so
 * the sequence is written down once, and so a missing prerequisite produces a
 * readable message instead of a stack trace.
 *
 *   node scripts/run-kaggle.mjs --check
 *   node scripts/run-kaggle.mjs --push
 *   node scripts/run-kaggle.mjs --run  --models gemini-3.5-flash,gemma-3-27b-it
 *   node scripts/run-kaggle.mjs --download --out ./results
 */

import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TASK_DIR = resolve(ROOT, "benchmark/telltale-hold");
const TASK_FILE = resolve(TASK_DIR, "task_telltale_hold.py");
const TASK_SLUG = "telltale-hold";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const hasFlag = (name) => process.argv.includes(`--${name}`);

function have(binary, args = ["--version"]) {
  try {
    execFileSync(binary, args, { stdio: "ignore", shell: process.platform === "win32" });
    return true;
  } catch {
    return false;
  }
}

function run(binary, args, options = {}) {
  console.log(`\n$ ${binary} ${args.join(" ")}\n`);
  const result = spawnSync(binary, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const pythonBin = have("python") ? "python" : have("python3") ? "python3" : null;

console.log("Telltale-Hold — Kaggle benchmark runner");
console.log(`task file: ${TASK_FILE}`);

if (!existsSync(TASK_FILE)) {
  console.error("\nThe task file is missing. Run `npm run bench:prepare` first.");
  process.exit(1);
}

if (hasFlag("check")) {
  console.log("\nPrerequisites");
  console.log(`  task file present      ${existsSync(TASK_FILE) ? "yes" : "no"}`);
  console.log(`  python                 ${pythonBin ?? "not found"}`);
  console.log(`  kaggle cli             ${have("kaggle", ["b", "--help"]) ? "yes" : "not found"}`);
  console.log(`  kaggle-benchmarks      ${pythonBin && have(pythonBin, ["-c", "import kaggle_benchmarks"]) ? "yes" : "not found"}`);
  console.log("\nWhat is still needed, and only from you:");
  console.log("  1. pip install kaggle kaggle-benchmarks");
  console.log("  2. kaggle b init -y        (writes .env with Model Proxy credentials)");
  console.log("  3. python task_telltale_hold.py   (must produce a .run.json)");
  console.log("  4. kaggle b t push telltale-hold -f task_telltale_hold.py --wait");
  console.log("  5. kaggle b t run telltale-hold -m <model> --wait");
  console.log("\nThe application itself needs none of this. It runs with no API keys at all.");
  process.exit(0);
}

if (hasFlag("push")) {
  if (!have("kaggle", ["b", "--help"])) {
    console.error("\nThe kaggle CLI is not available. Install it with: pip install kaggle");
    process.exit(1);
  }
  run("kaggle", ["b", "t", "push", TASK_SLUG, "-f", TASK_FILE, "--wait"]);
  process.exit(0);
}

if (hasFlag("run")) {
  const models = (arg("models", "") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (models.length === 0) {
    console.error("\nPass one or more models with --models a,b");
    console.error("List what the catalogue offers with: kaggle b t models");
    process.exit(1);
  }
  const args = ["b", "t", "run", TASK_SLUG];
  // Repeated flags, never space separated.
  for (const model of models) args.push("-m", model);
  args.push("--wait");
  run("kaggle", args);
  process.exit(0);
}

if (hasFlag("download")) {
  const out = arg("out", "./results");
  run("kaggle", ["b", "t", "download", TASK_SLUG, "-o", out, "-f"]);
  console.log(`\nResults written to ${resolve(process.cwd(), out)}`);
  console.log("Each run directory contains telltale_hold_result.json with the per-turn evidence.");
  process.exit(0);
}

console.log(`
Usage:
  node scripts/run-kaggle.mjs --check
  node scripts/run-kaggle.mjs --push
  node scripts/run-kaggle.mjs --run --models gemini-3.5-flash,gemma-3-27b-it
  node scripts/run-kaggle.mjs --download --out ./results

Prerequisite (once, with your own Kaggle account):
  pip install kaggle kaggle-benchmarks
  kaggle b init -y

Then validate locally before pushing:
  python benchmark/telltale-hold/task_telltale_hold.py
`);