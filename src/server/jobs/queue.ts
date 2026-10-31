import "server-only";
import { PgBoss } from "pg-boss";
import { errors } from "../errors";
import { logger } from "../log";
import { JOB_NAMES, type JobName, JOBS } from "./definitions";

/**
 * PostgreSQL-backed queue (pg-boss) in its own `pgboss` schema, so jobs live
 * in the same database as the data they act on. No Redis.
 */

export const QUEUE_SCHEMA = "pgboss";

export async function startQueue(connectionString: string, options: { supervise?: boolean } = {}): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString, schema: QUEUE_SCHEMA, supervise: options.supervise ?? true, schedule: false });
  boss.on("error", (err) => logger().error({ err }, "job queue error"));
  await boss.start();
  for (const name of JOB_NAMES) {
    const def = JOBS[name];
    if (!(await boss.getQueue(name))) {
      await boss.createQueue(name, { policy: "standard", retryLimit: def.retryLimit, retryBackoff: true, retryDelay: 15, expireInSeconds: def.expireInSeconds });
    }
  }
  return boss;
}

/**
 * Queue a job. `idempotencyKey` deduplicates the same logical work while it is
 * queued (pg-boss singletonKey). Disabled jobs are refused.
 */
export async function enqueue(boss: PgBoss, name: JobName, data: Record<string, unknown>, options: { idempotencyKey: string; startAfterSeconds?: number }): Promise<string | null> {
  if (!JOBS[name].enabled) throw errors.featureDisabled(`The ${name} job`);
  if (!/^[\w:.-]{8,200}$/.test(options.idempotencyKey)) throw errors.conflict("A job idempotency key is required.");
  return boss.send(name, data, { singletonKey: options.idempotencyKey, startAfter: options.startAfterSeconds });
}
