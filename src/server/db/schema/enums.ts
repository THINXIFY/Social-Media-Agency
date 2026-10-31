/**
 * Allowed values for every status-like column. Stored as `text` with a CHECK
 * constraint (easier to evolve than Postgres enum types) and reused by Zod.
 *
 * Module and permission lists mirror `src/lib/admin-staff.ts`; a test keeps
 * them in sync.
 */

export const USER_STATUS = ["active", "locked", "disabled"] as const;
export const SESSION_KIND = ["customer", "staff"] as const;
export const AUTH_TOKEN_PURPOSE = ["verify_email", "reset_password", "staff_invite"] as const;
export const MFA_TYPE = ["totp"] as const;
export const ACCOUNT_TYPE = ["personal", "business"] as const;
export const DATE_FORMAT = ["mdy", "dmy", "iso"] as const;
export const DISPLAY_CURRENCY = ["USD", "EUR", "GBP", "PKR", "AED", "SAR", "INR", "CAD"] as const;

export const STAFF_STATUS = ["invited", "active", "disabled"] as const;
export const ACCESS_LEVEL = ["none", "view", "manage"] as const;
export const MODULE = ["overview", "orders", "customers", "services", "payments", "providers", "support", "referrals", "settings", "staff"] as const;
export const SENSITIVE_PERMISSION = [
  "approveDeposits",
  "issueRefunds",
  "adjustWallets",
  "changePrices",
  "configureProviders",
  "approveRewards",
  "manageStaff",
  "securitySettings",
] as const;

export const SERVICE_CATEGORY = ["audience", "engagement", "views", "comments", "promotion", "advertising", "messaging", "seo", "community", "music"] as const;
export const SERVICE_ORIGIN = ["catalog", "custom"] as const;
export const PRICING_MODEL = ["per1000", "unit", "fixed", "fee"] as const;
export const ORDER_FIELD_KIND = ["link", "quantity", "budget", "text", "textarea", "date", "select", "consent"] as const;

/** Canonical order states (DATABASE.md §4). */
export const ORDER_STATUS = ["pending_review", "queued", "in_progress", "partial", "needs_customer_action", "completed", "cancelled", "failed", "refunded", "rejected"] as const;
/** Money side of an order, kept apart from its operational status (Phase 5E). */
export const ORDER_PAYMENT_STATUS = ["charged", "released", "refund_review", "refunded"] as const;
/** Revenue side: deferred until the recognition policy (decision D5) says otherwise. */
export const ORDER_REVENUE_STATUS = ["deferred", "recognized", "reversed"] as const;
/** What customers see — the dashboard's existing vocabulary. */
export const CUSTOMER_ORDER_STATUS = ["pending", "processing", "attention", "completed", "cancelled"] as const;
export const ACTOR_TYPE = ["customer", "staff", "system", "provider"] as const;
export const REVIEW_DECISION = ["approved", "rejected"] as const;
/** `unknown` (5F): a submission whose outcome wasn't confirmed; it blocks a new attempt until reconciled. */
export const FULFILLMENT_STATUS = ["queued", "submitted", "in_progress", "partial", "completed", "failed", "cancelled", "unknown"] as const;
export const ACTIVE_FULFILLMENT_STATUS = ["queued", "submitted", "in_progress", "unknown"] as const;
export const PROVIDER_EVENT_TYPE = ["created", "updated", "archived", "credential_set", "credential_removed", "health_checked", "mapping_saved", "mapping_activated", "mapping_deactivated", "mapping_removed", "attempt_prepared", "attempt_submitted", "attempt_failed", "attempt_unknown", "attempt_reconciled", "attempt_resolved", "attempt_cancelled"] as const;

export const PROVIDER_TYPE = ["manual", "api"] as const;
export const PROVIDER_AUTH = ["api_key", "oauth", "basic", "none"] as const;

export const LEDGER_ACCOUNT_TYPE = ["asset", "liability", "revenue", "contra_revenue", "expense"] as const;
export const JOURNAL_KIND = ["deposit_credit", "order_debit", "order_revenue", "order_cancel", "refund", "reward_credit", "provider_cost", "adjustment", "reversal"] as const;

export const DEPOSIT_METHOD = ["crypto", "card", "bank", "paypal"] as const;
export const DEPOSIT_STATUS = ["created", "awaiting_payment", "settling", "settled", "under_review", "credited", "rejected", "expired", "failed", "cancelled"] as const;
export const REVIEW_STEP = ["first", "second"] as const;
export const DEPOSIT_DECISION = ["approve", "reject"] as const;

export const TICKET_CATEGORY = ["order", "payment", "refund", "service", "account", "technical", "other"] as const;
export const TICKET_PRIORITY = ["low", "normal", "high", "urgent"] as const;
/** awaiting = open, waiting on staff; in_progress = staff working on it; waiting = waiting for the customer (5G-A). */
export const TICKET_STATUS = ["awaiting", "in_progress", "waiting", "resolved", "closed"] as const;
export const TICKET_EVENT = ["created", "customer_replied", "staff_replied", "status_changed", "priority_changed", "assigned", "closed_by_customer", "reopened"] as const;
export const MESSAGE_AUTHOR = ["customer", "staff", "system"] as const;
export const ATTACHMENT_OWNER = ["ticket_message", "customer_avatar"] as const;
export const ATTACHMENT_MIME = ["image/png", "image/jpeg", "application/pdf"] as const;
export const SCAN_STATUS = ["pending", "clean", "infected"] as const;

export const REFERRAL_VIA = ["link", "code"] as const;
export const REFERRAL_STATUS = ["signed_up", "pending", "qualified", "ineligible"] as const;
export const REWARD_TYPE = ["fixed", "percent"] as const;
export const REWARD_DESTINATION = ["rewards", "wallet"] as const;
export const REWARD_DISTRIBUTION = ["manual", "auto"] as const;
export const POLICY_STATUS = ["draft", "active", "retired"] as const;
export const REWARD_STATUS = ["pending", "holding", "awaiting_approval", "approved", "credited", "reversed"] as const;

export const NOTIFICATION_CHANNEL = ["in_app", "email"] as const;
export const OUTBOX_STATUS = ["queued", "sending", "sent", "failed"] as const;
export const NOTE_TARGET = ["order", "customer", "deposit", "ticket", "referral", "referrer"] as const;
export const AUDIT_ACTOR = ["customer", "staff", "system"] as const;
