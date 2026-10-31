import "server-only";
import { createDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { registerWorkers, SCHEDULE } from "@/server/jobs/handlers";
import { enqueue, startQueue } from "@/server/jobs/queue";
import { logger } from "@/server/log";

/**
 * Background worker: a separate long-running process from the same codebase
 * (`npm run worker`). Phase 5A runs only internal, read-only maintenance jobs;
 * no external provider, processor or email calls exist yet.
 */
async function main() {
  const env = getEnv();
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required to run the worker.");
  const db = createDb(env.DATABASE_URL, { max: 5 });
  const boss = await startQueue(env.DATABASE_URL);
  await registerWorkers(boss, db);
  logger().info({ appEnv: env.APP_ENV }, "worker started");

  // Recurring jobs: one queued run per time bucket, however many workers run.
  const tick = () =>
    Promise.all(
      SCHEDULE.map((s) => enqueue(boss, s.name, {}, { idempotencyKey: `${s.name}:${Math.floor(Date.now() / 1000 / s.everySeconds)}` }).catch((err) => logger().error({ err, job: s.name }, "could not queue job"))),
    );
  void tick();
  const timer = setInterval(() => void tick(), 60_000);

  // Shut down once: a second signal doesn't start a second shutdown, and a job that won't finish
  // can't keep the process alive forever (its lease expires and pg-boss retries it elsewhere).
  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger().info({ signal }, "worker stopping");
    clearInterval(timer);
    setTimeout(() => {
      logger().error({ signal }, "worker did not stop within 30s; exiting");
      process.exit(1);
    }, 30_000).unref();
    try {
      await boss.stop({ graceful: true, timeout: 25_000 });
      await db.$client.end();
    } catch (err) {
      logger().error({ err }, "worker shutdown error");
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("unhandledRejection", (err) => logger().error({ err }, "unhandled rejection in worker"));
}

main().catch((err) => {
  logger().fatal({ err }, "worker failed to start");
  process.exit(1);
});
