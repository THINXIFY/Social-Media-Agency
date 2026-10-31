import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load the same env file Next would.
for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  // Only needed for `drizzle-kit studio`/`check`; `generate` works offline.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
