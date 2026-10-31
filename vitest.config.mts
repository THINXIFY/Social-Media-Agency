import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * unit:        pure logic, no database (fast, parallel).
 * integration: real PostgreSQL. tests/setup/postgres.ts starts a throwaway
 *              embedded server (or uses TEST_DATABASE_URL) and migrates it.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": r("./src"),
      // `server-only` throws outside React Server Components; tests run server code directly.
      "server-only": r("./tests/setup/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    // Throwaway keys generated for each run — never real secrets.
    env: { APP_ENV: "test", LOG_LEVEL: "silent", AUTH_SECRET: randomBytes(32).toString("base64"), DATA_ENCRYPTION_KEY: randomBytes(32).toString("base64"), APP_URL: "http://localhost:3000" },
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/setup/postgres.ts"],
          // One database, so files run one at a time; each test uses unique data.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
