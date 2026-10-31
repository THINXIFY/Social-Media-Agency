import "server-only";
import { type PostContent, PUBLISH_RULES } from "@/lib/social/publishing";
import type { SocialProviderId } from "@/lib/social/platforms";
import { type HttpDeps, ProviderError } from "./http";

/**
 * Publishing adapter contract (AI-07). One small adapter per platform turns a
 * validated post into the platform's official publishing calls and reports
 * exactly one of three outcomes:
 *
 *  - published:  the platform confirmed the post (with its id/url);
 *  - rejected:   the platform definitely did NOT publish it (validation,
 *                permission or rate-limit errors) — safe to retry only when
 *                `retryable`;
 *  - uncertain:  the request may have succeeded but no confirmation arrived
 *                (timeouts, 5xx after sending, unreadable responses). The
 *                engine never retries these: a person reviews them.
 *
 * No adapter is activated in this build: every platform awaits app review for
 * its posting permission, so `ADAPTERS` is empty and the engine refuses to
 * publish. Adapters must use `requestJson(..., { retries: 0 })` for any call
 * that creates content, and pass the target's idempotency key wherever the
 * platform supports one.
 */

export type PublishOutcome =
  | { kind: "published"; externalId: string; url: string | null }
  | { kind: "rejected"; code: string; retryable: boolean; retryAfterSeconds?: number | null }
  | { kind: "uncertain"; code: string };

export interface PublishInput {
  idempotencyKey: string;
  content: PostContent;
  /** Decrypted only inside the worker, immediately before the call. */
  accessToken: string;
  externalAccountId: string;
}

export interface PublishAdapter {
  provider: SocialProviderId;
  publish(input: PublishInput, ctx: { http: HttpDeps }): Promise<PublishOutcome>;
}

/** Activated adapters. Empty until a platform's posting permission is approved and verified live. */
export const ADAPTERS: Partial<Record<SocialProviderId, PublishAdapter>> = {};

/**
 * Maps a provider error thrown while CREATING content to an outcome. Anything
 * that might have reached the platform is uncertain, never retryable.
 */
export function classifyPublishError(e: unknown): PublishOutcome {
  if (e instanceof ProviderError) {
    switch (e.kind) {
      case "rate_limited":
        return { kind: "rejected", code: "rate_limited", retryable: true, retryAfterSeconds: e.retryAfter };
      case "unauthorized":
        return { kind: "rejected", code: "unauthorized", retryable: false };
      case "forbidden":
        return { kind: "rejected", code: "forbidden", retryable: false };
      case "no_accounts":
        return { kind: "rejected", code: "account_unavailable", retryable: false };
      // 5xx, network failures and unreadable bodies: the post may exist.
      case "unavailable":
      case "bad_response":
        return { kind: "uncertain", code: e.kind };
    }
  }
  return { kind: "uncertain", code: "unknown" };
}

/** Whether a connection's granted scopes include everything publishing on its platform needs. */
export const hasPublishScopes = (provider: SocialProviderId, granted: string[]) => PUBLISH_RULES[provider].publishScopes.every((s) => granted.includes(s));
