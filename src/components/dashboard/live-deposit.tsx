"use client";

import * as React from "react";
import Link from "next/link";
import { Check, CircleAlert, CircleCheck, Clock3, Copy, Landmark, LoaderCircle, Lock, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usd } from "@/lib/demo-account";
import { type BankInstructions, type CustomerDeposit, DEPOSIT_STATUS_META, type DepositMethodId, type DepositStatus, type MethodReadiness } from "@/lib/deposits";
import { formatDateTime } from "@/lib/i18n";
import { api } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import { useLiveAccount } from "./live-account";
import { transactionsHref } from "./shared";

/*
 * Live-mode (DEMO_MODE off) deposit pieces for Add Funds and Transactions.
 * Availability comes from the server's payment-method registry; a request is
 * never a payment and never changes the balance.
 */

export type MethodsState = { methods: MethodReadiness[] | null; error: string | null; retry: () => void };

const LiveMethodsContext = React.createContext<MethodsState | null>(null);
export const LiveMethodsProvider = LiveMethodsContext;
/** Readiness in live mode; null in demo mode. */
export const useLiveMethods = () => React.use(LiveMethodsContext);

export function useMethodReadiness(enabled: boolean): MethodsState {
  const [attempt, setAttempt] = React.useState(0);
  const [state, setState] = React.useState<{ key?: number; methods?: MethodReadiness[]; error?: string }>({});
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api<{ methods: MethodReadiness[] }>("/api/payments/methods").then(
      ({ methods }) => !cancelled && setState({ key: attempt, methods }),
      (e: Error) => !cancelled && setState({ key: attempt, error: e.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);
  return { methods: state.methods ?? null, error: state.key === attempt ? (state.error ?? null) : null, retry: () => setAttempt((n) => n + 1) };
}

/** Maps an Add Funds choice to a registry method (planned methods have none). */
export function registryId(category: string, methodId: string | null): DepositMethodId | null {
  if (category === "crypto") return "crypto";
  return methodId === "card" || methodId === "bank" || methodId === "paypal" ? methodId : null;
}

const TONE: Record<string, string> = {
  pending: "bg-soon-soft text-soon",
  review: "bg-secondary text-secondary-foreground",
  ok: "bg-lime/25 text-graphite dark:text-lime",
  closed: "bg-muted text-muted-foreground",
  bad: "bg-destructive/10 text-destructive",
};

export function DepositStatusBadge({ status, className }: { status: DepositStatus; className?: string }) {
  const m = DEPOSIT_STATUS_META[status];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[0.7rem] font-bold whitespace-nowrap", TONE[m.tone], className)} title={m.explain}>
      {m.label}
    </span>
  );
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        <span className={cn("min-w-0 truncate text-sm font-semibold", mono && "font-mono text-[0.82rem]")}>{value}</span>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(value).then(() => (setCopied(true), window.setTimeout(() => setCopied(false), 1500)), () => {})}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          {copied ? <Check className="size-3.5 text-primary" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        </button>
      </dd>
    </div>
  );
}

/** The business's configured receiving account and this request's reference. */
export function BankInstructionsPanel({ instructions, amountCents }: { instructions: BankInstructions; amountCents: number }) {
  return (
    <section aria-label="Bank transfer details" className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
        <Landmark className="size-3.5" aria-hidden /> Send your transfer to
      </h3>
      <dl className="divide-y rounded-2xl border">
        <CopyRow label="Account name" value={instructions.accountName} />
        <CopyRow label="Bank" value={instructions.bankName} />
        <CopyRow label="Account / IBAN" value={instructions.account} mono />
        {instructions.routing ? <CopyRow label="SWIFT / routing" value={instructions.routing} mono /> : null}
        <CopyRow label="Amount (USD)" value={usd(amountCents / 100)} />
        <CopyRow label="Reference" value={instructions.reference} mono />
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">Include the reference exactly, or we can&apos;t match your transfer. Your balance updates only after the transfer arrives and our team verifies it.</p>
    </section>
  );
}

/** Live replacement for the inactive checkout preview: creates a real deposit request. */
export function LiveDepositDialog({
  open,
  onOpenChange,
  amount,
  method,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  method: MethodReadiness;
}) {
  const live = useLiveAccount();
  // One key per review: retries (double clicks, network errors) can't create a second request.
  const [requestKey, setRequestKey] = React.useState(() => crypto.randomUUID().replace(/-/g, ""));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<CustomerDeposit | null>(null);
  const amountCents = Math.round(amount * 100);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ deposit: CustomerDeposit }>("/api/account/deposits", {
        method: "POST",
        headers: { "idempotency-key": requestKey },
        body: JSON.stringify({ amountCents, currency: "USD", method: method.id }),
      });
      setCreated(res.deposit);
      void live?.refreshWallet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your request wasn't created. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      if (created) setRequestKey(crypto.randomUUID().replace(/-/g, ""));
      setCreated(null);
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-md">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative isolate overflow-hidden bg-graphite px-5 pt-5 pb-6 text-white dark:bg-[#17181e]">
            <div className="pointer-events-none absolute -top-20 -end-16 -z-10 size-56 rounded-full bg-primary/40 blur-3xl" aria-hidden />
            <DialogTitle className="font-heading text-lg font-bold text-white">{created ? "Deposit request created" : "Review deposit request"}</DialogTitle>
            <DialogDescription className="text-sm text-white/65">
              {created ? "Send your transfer using the details below." : "Creating a request doesn't charge you or change your balance."}
            </DialogDescription>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-white/55">Deposit</p>
                <p className="font-heading text-3xl font-extrabold tabular-nums">{usd(amount)}</p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">{method.name}</span>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {created ? (
              <>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border text-sm">
                  <div className="bg-card p-3">
                    <dt className="text-xs text-muted-foreground">Reference</dt>
                    <dd className="mt-0.5 font-mono font-semibold">{created.reference}</dd>
                  </div>
                  <div className="bg-card p-3">
                    <dt className="text-xs text-muted-foreground">Status</dt>
                    <dd className="mt-1">
                      <DepositStatusBadge status={created.status} />
                    </dd>
                  </div>
                  <div className="bg-card p-3">
                    <dt className="text-xs text-muted-foreground">Created</dt>
                    <dd className="mt-0.5 font-medium">{formatDateTime(created.requestedAt)}</dd>
                  </div>
                  <div className="bg-card p-3">
                    <dt className="text-xs text-muted-foreground">Expires</dt>
                    <dd className="mt-0.5 font-medium">{created.expiresAt ? formatDateTime(created.expiresAt) : "—"}</dd>
                  </div>
                </dl>
                {created.instructions ? <BankInstructionsPanel instructions={created.instructions} amountCents={created.amountCents} /> : null}
              </>
            ) : (
              <>
                <section aria-labelledby="dep-req" className="rounded-2xl border border-dashed p-4">
                  <h3 id="dep-req" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    Before you continue
                  </h3>
                  <ul className="mt-2.5 space-y-2">
                    {method.requiredCustomerInfo.map((r) => (
                      <li key={r} className="flex gap-2.5 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {r}
                      </li>
                    ))}
                  </ul>
                </section>
                <section aria-labelledby="dep-steps">
                  <h3 id="dep-steps" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    What happens next
                  </h3>
                  <ol className="mt-2.5 space-y-2 text-sm">
                    {["You receive SociVanta's bank details and your reference.", "You send the transfer from your bank.", "Our team matches it on our bank statement and a second person verifies it.", "Only then is it added to your balance."].map((s, i) => (
                      <li key={s} className="flex gap-2.5">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[0.68rem] font-bold" aria-hidden>
                          {i + 1}
                        </span>
                        {s}
                      </li>
                    ))}
                  </ol>
                  {method.expiresInHours ? <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" aria-hidden /> Requests stay open for {Math.round(method.expiresInHours / 24)} days.</p> : null}
                </section>
              </>
            )}
            <div role="status" aria-live="polite">
              {error ? (
                <p role="alert" className="flex gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  {error}
                </p>
              ) : created ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-dashed border-primary/40 p-3 text-sm">
                  <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">Nothing has been charged or added yet.</span>
                  <Link href={transactionsHref()} className="font-semibold text-primary hover:underline">
                    View in Transactions
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {created ? null : (
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              aria-busy={busy || undefined}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Lock className="size-4" aria-hidden />}
              {busy ? "Creating request…" : error ? "Try again" : "Create deposit request"}
            </button>
          )}
          <button
            type="button"
            onClick={() => close(false)}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden /> {created ? "Done" : "Cancel"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
