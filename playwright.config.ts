import { defineConfig, devices } from "@playwright/test";

/**
 * The browser journey runs against a real server.
 *
 * By default it starts `next start` against the zero-config embedded store, so the
 * suite is runnable on a clean clone with no environment variables. To run the same
 * journey against a deployment:
 *
 *   SKIP_WEBSERVER=1 BASE_URL=https://<alias>.vercel.app npm run test:e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 3211);
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  webServer:
    process.env.SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: `cross-env-less node node_modules/next/dist/bin/next start --port ${PORT}`,
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          env: {
            // The embedded store is allowed here because this is an explicit local
            // verification, never a deployment. A real deployment sets DATABASE_URL.
            TELLTALE_ALLOW_EMBEDDED_STORE: "1",
            NEXT_TELEMETRY_DISABLED: "1",
          },
        },
});