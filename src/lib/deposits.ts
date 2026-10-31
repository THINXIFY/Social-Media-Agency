/**
 * Shared, client-safe shapes for real deposits and payment-method readiness
 * (Phase 5D). Amounts are integer USD cents. Nothing here is illustrative.
 */

export type DepositMethodId = "bank" | "crypto" | "card" | "paypal";

export type DepositStatus =
  | "created"
  | "awaiting_payment"
  | "settling"
  | "settled"
  | "under_review"
  | "credited"
  | "rejected"
  | "expired"
  | "failed"
  | "cancelled";

/** Customer- and staff-facing names for each stored status. */
export const DEPOSIT_STATUS_META: Record<DepositStatus, { label: string; tone: "pending" | "review" | "ok" | "closed" | "bad"; explain: string }> = {
  created: { label: "Pending", tone: "pending", explain: "Request created." },
  awaiting_payment: { label: "Pending", tone: "pending", explain: "Waiting for your payment. Nothing is added to your balance until it's received and verified." },
  settling: { label: "Confirming", tone: "review", explain: "The payment processor is confirming the payment." },
  settled: { label: "Awaiting verification", tone: "review", explain: "Payment received; awaiting verification." },
  under_review: { label: "Awaiting verification", tone: "review", explain: "Payment received and recorded; a second reviewer must verify it before it's added to your balance." },
  credited: { label: "Verified", tone: "ok", explain: "Verified and added to your balance." },
  rejected: { label: "Rejected", tone: "bad", explain: "This request was rejected. Nothing was added to your balance." },
  expired: { label: "Expired", tone: "closed", explain: "No payment was received before the request expired." },
  failed: { label: "Failed", tone: "bad", explain: "The payment failed. Nothing was added to your balance." },
  cancelled: { label: "Cancelled", tone: "closed", explain: "You cancelled this request. Nothing was added to your balance." },
};

/** Requests that are still open (money may still arrive or be verified). Never spendable. */
export const OPEN_DEPOSIT_STATUSES: DepositStatus[] = ["created", "awaiting_payment", "settling", "settled", "under_review"];

export interface MethodReadiness {
  id: DepositMethodId;
  name: string;
  category: "bank" | "crypto" | "card" | "other";
  /** The operator has supplied everything this method needs. */
  configured: boolean;
  /** Customers may create deposit requests with this method. */
  acceptingRequests: boolean;
  verification: { kind: "bank_statement_review" | "processor_webhook"; available: boolean; description: string };
  currencies: "USD"[];
  /** Networks a configured crypto processor supports (none until one is approved). */
  networks: string[];
  requiredCustomerInfo: string[];
  limits: { minCents: number; maxCents: number };
  /** How long a request stays open, in hours. */
  expiresInHours: number | null;
  /** Why the method isn't available, in plain language. Empty when available. */
  blockers: string[];
}

export interface BankInstructions {
  accountName: string;
  bankName: string;
  account: string;
  routing: string | null;
  /** The deposit reference the customer must include. */
  reference: string;
}

export interface CustomerDeposit {
  reference: string;
  amountCents: number;
  currency: "USD";
  method: DepositMethodId;
  methodName: string;
  status: DepositStatus;
  statusReason: string | null;
  requestedAt: string;
  expiresAt: string | null;
  creditedAt: string | null;
  /** Present only while the customer still needs to pay (bank transfer). */
  instructions: BankInstructions | null;
}

export const DEPOSIT_LIMITS_CENTS = { min: 1_000, max: 500_000 };
