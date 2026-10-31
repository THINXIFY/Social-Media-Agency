import "server-only";
import type { PgBoss } from "pg-boss";
import type { Db } from "../db/client";
import { verifyLedger } from "../ledger/ledger";
import { expireDeposits } from "../payments/deposits";
import { reconcile } from "../payments/reconcile";
import { getEnv } from "../env";
import { runPublishingTick } from "../social/publishing";
import { runAutomationTick } from "../social/automations";
import { logger } from "../log";
import { type JobName, JOBS } from "./definitions";

type Handler = (db: Db, data: unknown) => Promise<unknown>;

/** Handlers for enabled jobs only. Each must be idempotent. */
export const HANDLERS: Partial<Record<JobName, Handler>> = {
  "maintenance.verify-ledger": async (db) => {
    const result = await verifyLedger(db);
    if (!result.ok) {
      logger().error({ result }, "ledger verification failed");
      // Throwing marks the job failed so it retries and shows up in monitoring.
      throw new Error(`Ledger verification failed: ${result.unbalancedEntries} unbalanced entries, ${result.balanceMismatches.length} balance mismatches`);
    }
    return result;
  },
  "deposits.expire": async (db) => expireDeposits(db),
  // Each pass claims due targets itself, so overlapping runs are safe.
  "social.publish-due": async (db) => runPublishingTick(db, { env: getEnv() }),
  "automations.run-due": async (db) => runAutomationTick(db),
  "deposits.reconcile": async (db) => {
    const result = await reconcile(db);
    if (!result.ok) {
      // Report, never repair: a person investigates. Balances are not touched.
      logger().error({ exceptions: result.exceptions }, "financial reconciliation found exceptions");
      throw new Error(`Reconciliation found ${result.exceptions.length} exception(s): ${result.exceptions.map((e) => e.code).join(", ")}`);
    }
    return { ok: true, checkedAt: result.checkedAt };
  },
};

/** Recurring work, queued by the worker with time-bucketed keys so each run is queued once. */
export const SCHEDULE: { name: JobName; everySeconds: number }[] = [
  { name: "deposits.expire", everySeconds: 15 * 60 },
  { name: "social.publish-due", everySeconds: 60 },
  { name: "automations.run-due", everySeconds: 60 },
  { name: "maintenance.verify-ledger", everySeconds: 6 * 3600 },
  { name: "deposits.reconcile", everySeconds: 24 * 3600 },
];

export async function registerWorkers(boss: PgBoss, db: Db) {
  for (const [name, handler] of Object.entries(HANDLERS) as [JobName, Handler][]) {
    if (!JOBS[name].enabled) continue;
    await boss.work(name, async (jobs) => {
      const results = [];
      for (const job of jobs) results.push(await handler(db, job.data));
      return results;
    });
    logger().info({ job: name }, "worker registered");
  }
}
