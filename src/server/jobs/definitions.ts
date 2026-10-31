import "server-only";

/**
 * Every background job the platform will run. Jobs for features that don't
 * exist yet are declared but disabled: enqueueing them fails closed.
 *
 * Retry & idempotency rules for every handler:
 *  - handlers must be safe to run twice (use ledger idempotency keys, unique
 *    constraints and "already done?" checks before side effects);
 *  - callers pass an idempotency key, used as pg-boss's singletonKey so the
 *    same logical job is queued once;
 *  - external calls (processors, providers, email) happen only in the worker.
 */
export const JOBS = {
  "maintenance.verify-ledger": {
    enabled: true,
    phase: "5A",
    description: "Recompute balances from journal lines and alert on any mismatch (read-only).",
    retryLimit: 3,
    expireInSeconds: 300,
  },
  "deposits.reconcile": { enabled: true, phase: "5D", description: "Check deposits against the ledger and wallet liabilities; report exceptions (read-only).", retryLimit: 3, expireInSeconds: 600 },
  "deposits.expire": { enabled: true, phase: "5D", description: "Expire deposit requests past their expiry with no payment recorded.", retryLimit: 3, expireInSeconds: 120 },
  "social.publish-due": { enabled: true, phase: "AI-07", description: "Publish due, approved social posts (claimed atomically; uncertain outcomes go to review, never retried). Makes no external calls until a platform's publishing is activated.", retryLimit: 0, expireInSeconds: 300 },
  "automations.run-due": { enabled: true, phase: "AI-08", description: "Run due Automation Studio workflows (internal reminders, checklists and checks only; claimed atomically, one run per trigger slot).", retryLimit: 0, expireInSeconds: 300 },
  "orders.sync-status": { enabled: false, phase: "5E", description: "Project fulfilment progress onto orders.", retryLimit: 5, expireInSeconds: 300 },
  "providers.poll-fulfillment": { enabled: false, phase: "5F", description: "Reconcile sent provider attempts (reconcileDue: claimed with SKIP LOCKED, read-only provider calls). Stays off until a provider integration is approved.", retryLimit: 0, expireInSeconds: 120 },
  "referrals.qualify": { enabled: false, phase: "5G", description: "Qualify referrals and release rewards after their hold.", retryLimit: 3, expireInSeconds: 300 },
  "notifications.send": { enabled: false, phase: "5G", description: "Deliver queued emails from the outbox.", retryLimit: 6, expireInSeconds: 120 },
} as const satisfies Record<string, { enabled: boolean; phase: string; description: string; retryLimit: number; expireInSeconds: number }>;

export type JobName = keyof typeof JOBS;
export const JOB_NAMES = Object.keys(JOBS) as JobName[];
