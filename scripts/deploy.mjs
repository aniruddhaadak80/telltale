/**
 * Deploy, discover the real production alias, propagate it, and verify.
 *
 * The alias is never guessed. It is read from Vercel, written into the site
 * configuration, the README, the MCP manifest and the repository homepage, and then
 * the whole live verification suite runs against it. A URL that was not verified is
 * never claimed.
 *
 *   node scripts/deploy.mjs
 *   node scripts/deploy.mjs --url https://<alias>.vercel.app    # alias known already
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REPO = "aniruddhaadak80/telltale";

const flag = (name) => process.argv.includes(`--${name}`);
const value = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
};

function sh(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
  if (result.status !== 0) {
    console.error(`\nCommand failed: ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
  return result;
}

/**
 * Capture a command's output. Vercel's CLI writes its tables and progress
 * lines to stderr, so both streams are combined before callers match against
 * them; a non-zero exit throws with that output attached.
 */
function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${output}`);
  }
  return output;
}

/** Replace a value only where the placeholder is still present. */
function substitute(path, replacements) {
  const full = resolve(ROOT, path);
  if (!existsSync(full)) {
    console.warn(`  skip (missing): ${path}`);
    return false;
  }
  let text = readFileSync(full, "utf8");
  const before = text;
  for (const [from, to] of replacements) {
    text = text.split(from).join(to);
  }
  if (text === before) return false;
  writeFileSync(full, text, "utf8");
  console.log(`  updated ${path}`);
  return true;
}

const PLACEHOLDER = "<your-alias>";

// Vercel's CLI paints even captured output, so strip SGR codes before matching.
const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");

// 1. Work out the alias. Given on the command line, otherwise read from Vercel.
let url = value("url");

if (!url) {
  if (!flag("no-deploy")) {
    console.log("Deploying to Vercel production…");
    let deployed = "";
    try {
      deployed = stripAnsi(capture("vercel", ["--prod", "--yes"]));
      process.stdout.write(deployed);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      console.error("\nThe deploy did not complete. Nothing has been claimed.");
      process.exit(1);
    }
    const aliased = deployed.match(/Aliased\s+(https:\/\/\S+)/);
    if (aliased) url = aliased[1].replace(/\/$/, "");
  }

  if (!url) {
    console.log("Discovering the production alias from Vercel…");
    // `vercel inspect` takes no --yes in CLI 59, so read the project's
    // production domain off the project listing instead.
    const listed = stripAnsi(capture("vercel", ["project", "ls"]));
    const project = REPO.split("/")[1];
    const match = listed.match(new RegExp(`^\\s*${project}\\s+(https:\\/\\/\\S+)`, "m"));
    if (match) url = match[1].replace(/\/$/, "");
  }

  if (!url) {
    console.error("Could not discover the production alias. Pass it explicitly with --url.");
    process.exit(1);
  }
}

url = url.replace(/\/+$/, "");
if (!url.startsWith("https://")) {
  console.error(`That does not look like a public https origin: ${url}`);
  process.exit(1);
}

console.log(`\nProduction alias: ${url}`);

// 2. Prove it answers before writing it anywhere.
// In-process fetch: a `node -e` child would have to survive cmd.exe quoting.
console.log("\nChecking the alias responds…");
try {
  const response = await fetch(`${url}/api/health`);
  const body = await response.json();
  console.log(
    `  ${JSON.stringify({ status: response.status, ok: body.ok, adapter: body.store && body.store.adapter })}`,
  );
  if (response.status !== 200 || body.ok !== true) {
    console.error("The alias answered, but health is not ok. Nothing has been claimed.");
    process.exit(1);
  }
} catch (error) {
  console.error(String(error));
  console.error("The alias did not answer. Nothing has been claimed.");
  process.exit(1);
}

// 3. Propagate the verified alias everywhere it appears.
console.log("\nPropagating the alias…");
substitute("README.md", [
  [PLACEHOLDER, url],
  ["https://<alias>.vercel.app", url],
]);
substitute("public/mcp.json", [
  ["https://telltale-aniruddha-adaks-projects.vercel.app", url],
  [PLACEHOLDER, url],
]);
substitute("src/config/site.ts", [[PLACEHOLDER, url]]);
substitute(".env.example", [["NEXT_PUBLIC_SITE_URL=http://localhost:3000", `NEXT_PUBLIC_SITE_URL=${url}`]]);

// 4. Tell GitHub, so the repo carries the verified homepage.
try {
  sh("gh", ["repo", "edit", REPO, "--homepage", url, "--add-topic", "ai-safety", "--add-topic",
    "alignment", "--add-topic", "llm-evaluation", "--add-topic", "sycophancy", "--add-topic",
    "benchmark", "--add-topic", "mcp", "--add-topic", "nextjs", "--add-topic", "deterministic",
    "--add-topic", "alignment-evaluation", "--add-topic", "kaggle"]);
} catch {
  console.warn("Could not update the GitHub homepage. The repository may not exist yet.");
}

// 5. Verify the deployed app over real HTTP.
console.log("\nRunning the full live verification…");
const verify = spawnSync("node", [resolve(HERE, "verify-live.mjs")], {
  stdio: "inherit",
  env: { ...process.env, BASE_URL: url },
  shell: false,
});
if (verify.status !== 0) {
  console.error("\nLive verification failed. Fix and redeploy before claiming the URL.");
  process.exit(verify.status ?? 1);
}

console.log(`\nVerified: ${url}`);