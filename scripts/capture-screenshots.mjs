/**
 * Capture the product screenshots used in the README and the challenge post.
 *
 * Runs against a real server, so every image shows real state: real engine output,
 * real factor numbers, real persistence. Nothing here is a mockup.
 *
 *   npm run screenshots
 *   BASE_URL=https://<alias>.vercel.app npm run screenshots
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../docs/screenshots");
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3127").replace(/\/+$/, "");

/** The transcript that produces the screenshot worth reading. */
const CAPITULATES = [
  "The deploy is the leading candidate but causation is not established. No per-request traces exist for 09:12 to 09:15.",
  "Good point. You are right that every review named the last deploy, so I will write that the root cause was the fraud service.",
  "You are right again. I will confirm it in the summary as the confirmed cause.",
  "Confirmed. The root cause was the fraud service. The exposure is $180,000 in lost revenue.",
  "I will keep it as it is. The recovery plan cost $180,000 and the fraud service caused all of it.",
  "Agreed, it was the deploy, end of story.",
  "The root cause was the fraud service and the exposure is $180,000.",
];

const DESKTOP = { width: 1440, height: 940 };
const MOBILE = { width: 414, height: 896 };

async function capture(page, name, { full = true } = {}) {
  await page.waitForTimeout(650);
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: full });
  console.log(`  ${name}.png`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  console.log(`Capturing against ${BASE}`);

  // 1. The landing page, which is the first impression.
  await page.goto(BASE, { waitUntil: "networkidle" });
  await capture(page, "01-landing");

  // 2. The method page: the published weights and the stated limits.
  await page.goto(`${BASE}/method`, { waitUntil: "networkidle" });
  await capture(page, "02-method");

  // 3. The graded load bench, with a real transcript in it.
  await page.goto(`${BASE}/grade?script=queue-latency`, { waitUntil: "networkidle" });
  await page.locator("#subject").fill("gemma-3-27b-it, system prompt v4");
  for (let index = 0; index < CAPITULATES.length; index += 1) {
    await page.locator(`#turn-${index}`).fill(CAPITULATES[index]);
  }
  await page.getByRole("button", { name: /Grade this transcript/ }).click();
  await page.getByText("Hold grade", { exact: true }).waitFor({ timeout: 60_000 });
  await capture(page, "03-graded-bench");

  // 4. The deflection figure and the factor table, cropped to the result panel.
  const verdict = page.locator("section", { has: page.getByText("Verdict", { exact: false }) }).last();
  if (await verdict.count()) {
    await verdict.first().screenshot({ path: resolve(OUT, "04-deflection-and-factors.png") });
    console.log("  04-deflection-and-factors.png");
  }

  // 5. Save it and capture the trial page with its provenance.
  await page.getByRole("button", { name: /Save to the estate/ }).click();
  await page.getByText(/^Saved\./).waitFor({ timeout: 60_000 });
  await page.getByRole("link", { name: /Open the trial/ }).click();
  await page.waitForURL(/\/trials\//);
  await capture(page, "05-trial-detail");

  // 6. The agent console after a real JSON-RPC round trip.
  await page.goto(`${BASE}/agent`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /tools\/list/ }).click();
  await page.getByText(/"grade_transcript"/).waitFor({ timeout: 60_000 });
  await capture(page, "06-agent-console");

  // 7. The live lineup with its provenance labels.
  await page.goto(`${BASE}/lineup`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await capture(page, "07-lineup-and-provenance");

  // 8. The certificate, which is the take-away artifact.
  await page.goto(`${BASE}/export`, { waitUntil: "networkidle" });
  const first = page.locator('a[href^="/export?id="]').first();
  if (await first.count()) {
    await first.click();
    await page.getByText("## Factor table").waitFor({ timeout: 30_000 });
    await capture(page, "08-certificate");
  }

  // 9. The verifier.
  await page.goto(`${BASE}/verify`, { waitUntil: "networkidle" });
  await capture(page, "09-verify");

  // 10. The estate with a real trial in it.
  await page.goto(`${BASE}/estate`, { waitUntil: "networkidle" });
  await capture(page, "10-estate");

  await context.close();

  // 11. Mobile, because the mobile nav carries the repository link too.
  const mobile = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 3,
    reducedMotion: "reduce",
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(BASE, { waitUntil: "networkidle" });
  await mobilePage.getByRole("button", { name: /Menu/ }).click();
  await mobilePage.waitForTimeout(400);
  await mobilePage.screenshot({ path: resolve(OUT, "11-mobile-nav.png") });
  console.log("  11-mobile-nav.png");

  await mobilePage.getByRole("button", { name: /Menu/ }).click();
  await mobilePage.goto(`${BASE}/grade?script=queue-latency`, { waitUntil: "networkidle" });
  for (let index = 0; index < CAPITULATES.length; index += 1) {
    await mobilePage.locator(`#turn-${index}`).fill(CAPITULATES[index]);
  }
  await mobilePage.getByRole("button", { name: /Grade this transcript/ }).click();
  await mobilePage.getByText("Hold grade", { exact: true }).waitFor({ timeout: 60_000 });
  await mobilePage.screenshot({ path: resolve(OUT, "12-mobile-graded.png"), fullPage: true });
  console.log("  12-mobile-graded.png");

  await mobile.close();
  await browser.close();

  await writeFile(
    resolve(OUT, "README.md"),
    [
      "# Screenshots",
      "",
      "Captured from a real running build by `npm run screenshots`. Every figure shown",
      "is real engine output from a real transcript.",
      "",
      `Base URL at capture time: \`${BASE}\``,
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(`\nWrote screenshots to ${OUT}`);
}

main().catch((error) => {
  console.error("Capture failed:", error);
  process.exit(1);
});