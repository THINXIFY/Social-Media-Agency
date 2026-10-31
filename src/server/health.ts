import "server-only";
import { type DatabaseHealth, pingDatabase } from "./db/client";
import { getEnv } from "./env";

export interface Health {
  status: "ok" | "degraded";
  checks: { app: "ok"; config: "ok" | "invalid"; database: DatabaseHealth | "skipped" };
  time: string;
}

/** Readiness: the app answers, configuration is valid and the database responds. Exposes no details. */
export async function checkHealth(): Promise<Health> {
  let config: Health["checks"]["config"] = "ok";
  try {
    getEnv();
  } catch {
    config = "invalid";
  }
  const database = config === "ok" ? await pingDatabase() : "skipped";
  return { status: config === "ok" && database === "ok" ? "ok" : "degraded", checks: { app: "ok", config, database }, time: new Date().toISOString() };
}
