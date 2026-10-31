import "server-only";
import type { ProviderAdapter } from "./adapter";

/**
 * Installed provider integrations, keyed by `providers.adapter`.
 *
 * Deliberately empty in Phase 5F: no vendor has passed supplier review, so no
 * integration exists and no provider can be enabled (CHECK providers_enable_check).
 * Adding one requires an approved supplier, a reviewed adapter with tests, and
 * the launch steps in docs/backend/PHASE_5F_REPORT.md.
 */
export const ADAPTERS: Record<string, ProviderAdapter> = {};

/**
 * The platform-wide submission switch. Off in this phase and not configurable:
 * turning it on is a code change made with the launch steps, never a setting.
 */
export const SUBMISSIONS_ENABLED = false;
