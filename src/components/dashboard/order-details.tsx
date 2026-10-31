"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Ban,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  Copy,
  FlaskConical,
  Info,
  LifeBuoy,
  Lock,
  Repeat,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { CATEGORY_META } from "@/lib/catalog";
import {
  count,
  deliveryProgress,
  formatDateTime,
  money,
  ORDER_STATUS_META,
  orderService,
} from "@/lib/demo-account";
import { isForeignHost, parseLink } from "@/lib/links";
import { cn } from "@/lib/utils";
import { type LocalOrder, type OrderEvent, saveDemoFix } from "./demo-store";
import { FavoriteButton } from "./favorite-button";
import { newOrderHref, OrderStatusBadge, reorderHref, supportHref } from "./shared";

/* -------------------------------------------------------------------------- */
/*  Derived history & milestones                                              */
/* -------------------------------------------------------------------------- */

const plusMinutes = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60_000).toISOString();

/** Activity history from the demo record, newest first. */
function eventsOf(o: LocalOrder): OrderEvent[] {
  const list: OrderEvent[] = [{ at: o.placedAt, title: "Order placed" }];
  if (o.status === "cancelled") {
    if (o.cancelledAt) list.push({ at: o.cancelledAt, title: "Order cancelled", detail: o.cancelReason, tone: "muted" });
  } else {
    list.push({ at: plusMinutes(o.placedAt, 1), title: "Paid from your balance", detail: `${money(o.price)} · demo` });
  }
  if (o.status === "attention" || (o.demoUpdated && o.attention)) {
    list.push({ at: plusMinutes(o.placedAt, 18), title: "Order paused", detail: o.attention?.reason, tone: "attention" });
  }
  if (o.status === "processing" || o.status === "completed") {
    list.push({ at: plusMinutes(o.placedAt, 12), title: "Target checked", detail: "The link was public and matched the service." });
    list.push({ at: plusMinutes(o.placedAt, 35), title: "Delivery started" });
  }
  const progress = deliveryProgress(o);
  if (o.status === "processing" && o.updatedAt && progress) {
    list.push({ at: o.updatedAt, title: "Delivery update", detail: `${count(progress.delivered)} of ${count(progress.total)} delivered` });
  }
  if (o.status === "completed" && o.completedAt) {
    list.push({
      at: o.completedAt,
      title: "Order completed",
      detail: progress ? `${count(progress.delivered)} of ${count(progress.total)} delivered` : undefined,
      tone: "done",
    });
  }
  list.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return [...o.localEvents, ...list];
}

type MilestoneState = "done" | "current" | "blocked" | "upcoming" | "cancelled";

const MILESTONES = ["Placed", "Paid", "Checked", "Delivering", "Completed"] as const;

function milestonesOf(o: LocalOrder): { label: string; state: MilestoneState }[] {
  if (o.status === "cancelled") {
    return [
      { label: "Placed", state: "done" },
      { label: "Cancelled", state: "cancelled" },
    ];
  }
  const current = { pending: 2, attention: 2, processing: 3, completed: 5 }[o.status];
  return MILESTONES.map((label, i) => ({
    label,
    state: i < current ? "done" : i === current ? (o.status === "attention" ? "blocked" : "current") : "upcoming",
  }));
}

/* -------------------------------------------------------------------------- */
/*  Drawer                                                                    */
/* -------------------------------------------------------------------------- */

export function OrderDetails({
  order,
  startWithAction,
  onClose,
}: {
  order: LocalOrder | null;
  startWithAction: boolean;
  onClose: () => void;
}) {
  // Keep the last order rendered while the drawer animates closed.
  const [shown, setShown] = React.useState(order);
  if (order && order !== shown) setShown(order);
  const o = order ?? shown;

  return (
    <Sheet open={Boolean(order)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[34rem]"
      >
        {o ? <DetailsBody key={o.id} order={o} startWithAction={startWithAction} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailsBody({
  order,
  startWithAction,
  onClose,
}: {
  order: LocalOrder;
  startWithAction: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { service, platform } = orderService(order);
  const [copied, setCopied] = React.useState<"idle" | "done" | "failed">("idle");

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 2000);
  };

  // My Orders closes this drawer once its page is left; closing it first would rewrite the URL mid-navigation.
  const contactSupport = () => router.push(supportHref({ new: true, order: order.id }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-b px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <PlatformTile platform={platform} size="md" className="size-11 rounded-xl" />
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-tight font-bold">{service.name}</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm">
              {platform.name} · {CATEGORY_META[service.category].label}
            </SheetDescription>
          </div>
          <FavoriteButton service={service} className="size-9" />
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            aria-label="Close order details"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <button
            type="button"
            onClick={copyId}
            className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2 font-mono text-[0.72rem] font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            aria-label={`Copy order ID ${order.id}`}
          >
            {order.id}
            {copied === "done" ? <Check className="size-3 text-ok" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          </button>
          <span className="text-xs text-muted-foreground">Placed {formatDateTime(order.placedAt)}</span>
          <span className="sr-only" aria-live="polite">
            {copied === "done" ? "Order ID copied" : copied === "failed" ? "Couldn't copy. Select the ID to copy it." : ""}
          </span>
          {copied === "failed" ? <span className="text-xs text-destructive">Couldn&apos;t copy</span> : null}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
        <StatusPanel order={order} startWithAction={startWithAction} />
        <Milestones order={order} />

        <section aria-labelledby="details-title">
          <h3 id="details-title" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Order details
          </h3>
          <dl className="mt-2 divide-y rounded-2xl border text-sm">
            <Row label="Target link">
              <span className="font-mono text-[0.78rem] break-all">{order.link}</span>
            </Row>
            <Row label="Quantity">{count(order.quantity)}</Row>
            <Row label="Price">
              {money(order.price)} <span className="text-xs text-muted-foreground">· demo</span>
            </Row>
            <Row label="Paid from">Balance (demo)</Row>
          </dl>
        </section>

        <Activity order={order} />
      </div>

      {/* Footer actions */}
      <div className="grid grid-cols-2 gap-2 border-t bg-card px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <Link
          href={reorderHref(order.id)}
          className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_10px_28px_-12px_rgb(112_71_235/0.8)] transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
        >
          <Repeat className="size-4" aria-hidden /> Review &amp; Reorder
        </Link>
        <button
          type="button"
          onClick={contactSupport}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border bg-card text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <LifeBuoy className="size-4" aria-hidden /> Contact Support
        </button>
        <Link
          href={newOrderHref(service.id)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border bg-card text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          View Service <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-3.5 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Status panel                                                              */
/* -------------------------------------------------------------------------- */

function StatusPanel({
  order,
  startWithAction,
}: {
  order: LocalOrder;
  startWithAction: boolean;
}) {
  const progress = deliveryProgress(order);

  if (order.status === "attention" && order.attention) {
    return <ActionNeeded order={order} startOpen={startWithAction} />;
  }

  if (order.status === "pending") {
    return (
      <div className="space-y-3">
        {order.demoUpdated ? <DemoFeedback /> : null}
        <Callout tone="info" icon={Clock3} title="What happens next">
          We check that your link is public and matches the service before delivery starts. You&apos;ll get a notification
          when delivery begins.
        </Callout>
      </div>
    );
  }

  if (order.status === "processing") {
    return (
      <Callout tone="info" icon={Sparkles} title="What happens next">
        {progress ? (
          <span className="mb-3 block rounded-xl bg-card/70 p-3">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-foreground tabular-nums">
                {count(progress.delivered)} of {count(progress.total)} delivered
              </span>
              <span className="font-heading font-extrabold text-foreground tabular-nums">{progress.pct}%</span>
            </span>
            <span className="mt-2 block h-2 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${progress.pct}%` }} />
            </span>
            {order.updatedAt ? (
              <span className="mt-1.5 block text-xs text-muted-foreground">Last update {formatDateTime(order.updatedAt)}</span>
            ) : null}
          </span>
        ) : null}
        Delivery continues in stages and we&apos;ll notify you when it completes. Results and timing aren&apos;t guaranteed.
      </Callout>
    );
  }

  if (order.status === "completed") {
    return (
      <Callout tone="done" icon={CircleCheck} title="Order completed">
        {progress ? (
          <span className="block font-semibold text-foreground tabular-nums">
            {count(progress.delivered)} of {count(progress.total)} delivered
          </span>
        ) : null}
        {order.completedAt ? <span className="block">Completed {formatDateTime(order.completedAt)}</span> : null}
        <span className="mt-1.5 block">Nothing else to do. You can order this service again any time.</span>
      </Callout>
    );
  }

  return (
    <Callout tone="muted" icon={Ban} title="Order cancelled">
      {order.cancelledAt ? <span className="block">Cancelled {formatDateTime(order.cancelledAt)}</span> : null}
      {order.cancelReason ? <span className="mt-1 block text-foreground">{order.cancelReason}</span> : null}
    </Callout>
  );
}

const CALLOUT_TONES = {
  info: { box: "border-primary/20 bg-secondary/50", icon: "bg-primary text-primary-foreground" },
  done: { box: "border-ok/20 bg-ok-soft/60", icon: "bg-ok text-white dark:text-graphite" },
  muted: { box: "bg-muted/60", icon: "bg-off text-white dark:text-graphite" },
  attention: { box: "border-soon/30 bg-soon-soft/60", icon: "bg-soon text-white dark:text-graphite" },
} as const;

function Callout({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: keyof typeof CALLOUT_TONES;
  icon: typeof Info;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border p-4", CALLOUT_TONES[tone].box)} aria-label={title}>
      <h3 className="flex items-center gap-2.5 text-[0.95rem] font-bold">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", CALLOUT_TONES[tone].icon)}>
          <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
        </span>
        {title}
      </h3>
      <div className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function DemoFeedback() {
  return (
    <div role="status" className="flex gap-3 rounded-2xl border border-dashed border-primary/40 bg-card p-3.5 text-sm">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p className="leading-relaxed">
        <span className="font-semibold">Saved in this demo only.</span>{" "}
        <span className="text-muted-foreground">
          In the live product our team would re-check the target before delivery resumes. Nothing was sent and delivery
          hasn&apos;t resumed.
        </span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Action needed                                                             */
/* -------------------------------------------------------------------------- */

function ActionNeeded({
  order,
  startOpen,
}: {
  order: LocalOrder;
  startOpen: boolean;
}) {
  const attention = order.attention!;
  const { platform } = orderService(order);
  const [editing, setEditing] = React.useState(startOpen);
  const [choice, setChoice] = React.useState<"public" | "new">("public");
  const [link, setLink] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const needsLink = attention.kind === "link" || choice === "new";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let next = order.link;
    if (needsLink) {
      const url = parseLink(link);
      if (!link.trim()) return fail("Enter the new link.");
      if (!url) return fail("Enter a full link, like https://…");
      if (isForeignHost(url, platform.id)) return fail(`This doesn't look like a ${platform.name} link.`);
      if (url.href.replace(/\/$/, "") === (parseLink(order.link)?.href ?? "").replace(/\/$/, "")) {
        return fail("That's the link we couldn't access. Make it public or use a different one.");
      }
      next = url.href;
    }
    saveDemoFix(order.id, { kind: needsLink ? "link" : "recheck", link: next });
  };

  const fail = (message: string) => {
    setError(message);
    inputRef.current?.focus();
  };

  return (
    <section className="rounded-2xl border border-soon/35 bg-soon-soft/60 p-4" aria-labelledby="action-needed-title">
      <p className="flex items-center gap-1.5 text-[0.7rem] font-bold tracking-wider text-soon uppercase">
        <TriangleAlert className="size-3.5" aria-hidden /> Action needed
      </p>
      <h3 id="action-needed-title" className="mt-1.5 font-heading text-lg leading-snug font-bold">
        {attention.title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{attention.reason}</p>

      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-85 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          {attention.action} <ArrowRight className="size-4" aria-hidden />
        </button>
      ) : (
        <form onSubmit={submit} noValidate className="mt-4 space-y-3 rounded-xl border bg-card p-3.5">
          {attention.kind === "target" ? (
            <fieldset>
              <legend className="text-sm font-semibold">Current target</legend>
              <p className="mt-1 font-mono text-[0.78rem] break-all text-muted-foreground">{order.link}</p>
              <div className="mt-3 space-y-2">
                {(
                  [
                    ["public", "I've switched this account to public", "We'll check it again before anything continues."],
                    ["new", "Use a different account", "Provide the public link to the account you want."],
                  ] as const
                ).map(([id, label, hint]) => (
                  <label
                    key={id}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors hover:border-foreground/20",
                      choice === id && "border-primary bg-secondary/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="target-choice"
                      value={id}
                      checked={choice === id}
                      onChange={() => {
                        setChoice(id);
                        setError(null);
                      }}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span>
                      <span className="block font-semibold">{label}</span>
                      <span className="block text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {needsLink ? (
            <div>
              <label htmlFor={`fix-${order.id}`} className="text-sm font-semibold">
                {attention.kind === "link" ? "New public video link" : "New account link"}
              </label>
              <input
                ref={inputRef}
                id={`fix-${order.id}`}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus={attention.kind === "link"}
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setError(null);
                }}
                placeholder="https://"
                aria-invalid={error ? true : undefined}
                aria-describedby={`fix-${order.id}-help${error ? ` fix-${order.id}-error` : ""}`}
                className="mt-1.5 h-11 w-full scroll-mb-24 rounded-xl border bg-card px-3.5 text-sm shadow-xs outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive"
              />
              <p id={`fix-${order.id}-help`} className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3 shrink-0" aria-hidden /> Make sure it&apos;s public. We never ask for your password.
              </p>
              {error ? (
                <p id={`fix-${order.id}-error`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <CircleAlert className="size-3.5 shrink-0" aria-hidden /> {error}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
            >
              {needsLink ? "Save link" : "Request re-check"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <span className="ms-auto inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground">
              <FlaskConical className="size-3" aria-hidden /> Demo — stays in this browser
            </span>
          </div>
        </form>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Milestones & activity                                                     */
/* -------------------------------------------------------------------------- */

const STATE_TEXT: Record<MilestoneState, string> = {
  done: "completed",
  current: "current step",
  blocked: "paused, action needed",
  upcoming: "upcoming",
  cancelled: "cancelled",
};

function Milestones({ order }: { order: LocalOrder }) {
  const steps = milestonesOf(order);
  return (
    <section aria-labelledby="milestones-title">
      <h3 id="milestones-title" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Progress
      </h3>
      <ol className="mt-3 flex items-start">
        {steps.map((step, i) => (
          <li key={step.label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 ? (
              <span
                className={cn(
                  "absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2",
                  step.state === "done" || step.state === "current" || step.state === "blocked" ? "bg-primary/50" : "bg-border",
                  step.state === "cancelled" && "bg-off/40",
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "relative grid size-7 place-items-center rounded-full",
                step.state === "done" && "bg-primary text-primary-foreground",
                step.state === "current" && "bg-card text-primary ring-2 ring-primary",
                step.state === "blocked" && "bg-soon text-white dark:text-graphite",
                step.state === "upcoming" && "border-2 border-dashed bg-card",
                step.state === "cancelled" && "bg-off text-white dark:text-graphite",
              )}
              aria-hidden
            >
              {step.state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : null}
              {step.state === "current" ? <span className="size-2 rounded-full bg-primary" /> : null}
              {step.state === "blocked" ? <TriangleAlert className="size-3.5" strokeWidth={2.5} /> : null}
              {step.state === "cancelled" ? <Ban className="size-3.5" strokeWidth={2.5} /> : null}
            </span>
            <span
              className={cn(
                "mt-1.5 text-[0.7rem] leading-tight font-semibold",
                step.state === "upcoming" && "font-medium text-muted-foreground",
                step.state === "blocked" && "text-soon",
                step.state === "current" && "text-primary",
              )}
            >
              {step.label}
              <span className="sr-only">, {STATE_TEXT[step.state]}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const EVENT_DOT: Record<NonNullable<OrderEvent["tone"]>, string> = {
  default: "bg-primary",
  attention: "bg-soon",
  done: "bg-ok",
  demo: "bg-card ring-2 ring-primary",
  muted: "bg-off",
};

function Activity({ order }: { order: LocalOrder }) {
  const events = eventsOf(order);
  return (
    <section aria-labelledby="activity-title">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="activity-title" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
          Activity
        </h3>
        <span className="text-[0.7rem] text-muted-foreground">Newest first · times in UTC</span>
      </div>
      <ol className="relative mt-3 space-y-4 before:absolute before:top-1.5 before:bottom-1.5 before:start-[0.3125rem] before:w-px before:bg-border">
        {events.map((ev, i) => (
          <li key={`${ev.title}-${i}`} className="relative flex gap-3.5">
            <span className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-card", EVENT_DOT[ev.tone ?? "default"])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-semibold">{ev.title}</span>
                <time className="text-[0.72rem] text-muted-foreground" dateTime={ev.at ?? undefined}>
                  {ev.at ? formatDateTime(ev.at) : "Just now"}
                </time>
              </p>
              {ev.detail ? <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted-foreground">{ev.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[0.7rem] text-muted-foreground">
        Status: {ORDER_STATUS_META[order.status].label}. Demo history, generated from sample data.
      </p>
    </section>
  );
}
