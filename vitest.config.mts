import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // PGlite writes to ./.pglite; tests use a throwaway directory so a test run
    // never touches a developer's local data.
    env: {
      TELLTALE_PGLITE_DIR: "./.pglite-test",
    },
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
