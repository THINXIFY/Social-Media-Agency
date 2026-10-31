"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  FlaskConical,
  LifeBuoy,
  RotateCcw,
  Send,
  ShieldAlert,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  formatDateTime,
  money,
  ORDER_STATUS_META,
  orderService,
  TRANSACTIONS,
  TX_STATUS_LABELS,
  TX_TYPE_LABELS,
} from "@/lib/demo-account";
import { type DemoTicket, isOpenTicket, sensitiveIssue, type TicketAttachment, TICKET_CATEGORIES } from "@/lib/demo-support";
import { cn } from "@/lib/utils";
import { markTicketRead, replyToTicket, setTicketStatus, useDemoOrders, useProfile } from "./demo-store";
import { ordersHref, OrderStatusBadge, transactionsHref } from "./shared";
import { AttachmentChip, CategoryIcon, DemoAttachments, PriorityBadge, TicketStatusBadge } from "./support-ui";

export function TicketThreadSheet({ ticket, onClose }: { ticket: DemoTicket | null; onClose: () => void }) {
  // Keep the last ticket rendered while the sheet animates closed.
  const [shown, setShown] = React.useState(ticket);
  if (ticket && ticket !== shown) setShown(ticket);
  const t = ticket ?? shown;

  return (
    <Sheet open={Boolean(ticket)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[40rem]">
        {t ? <Thread key={t.id} ticket={t} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

const actionBtn =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

function Thread({ ticket, onClose }: { ticket: DemoTicket; onClose: () => void }) {
  const { orders } = useDemoOrders();
  const [copied, setCopied] = React.useState<"idle" | "done" | "failed">("idle");
  const [note, setNote] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const open = isOpenTicket(ticket.status);
  const order = ticket.orderId ? orders.find((o) => o.id === ticket.orderId) : undefined;
  const tx = ticket.txId ? TRANSACTIONS.find((t) => t.id === ticket.txId) : undefined;

  React.useEffect(() => {
    if (ticket.unread) markTicketRead(ticket.id);
  }, [ticket.id, ticket.unread]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [ticket.messages.length]);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(ticket.id);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  const changeStatus = (status: "resolved" | "awaiting") => {
    setTicketStatus(ticket.id, status);
    setNote(status === "resolved" ? "Marked resolved. Saved in demo mode — no support request was sent." : "Ticket reopened. Saved in demo mode — no support request was sent.");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-b px-4 pt-3 pb-4 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          className="-ms-2 inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to Tickets
        </button>
        <div className="mt-2 flex items-start gap-3">
          <CategoryIcon category={ticket.category} className="size-11" />
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-snug font-bold">{ticket.subject}</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm">
              {TICKET_CATEGORIES[ticket.category].label} · {ticket.priority === "urgent" ? "Urgent" : "Normal"} priority · Opened {formatDateTime(ticket.createdAt)} UTC
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TicketStatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <button type="button" onClick={copyId} className={cn(actionBtn, "h-6 px-2 font-mono text-[0.72rem]")} aria-label={`Copy ticket ID ${ticket.id}`}>
            {ticket.id}
            {copied === "done" ? <Check className="size-3 text-ok" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          </button>
          {ticket.demo ? <span className="text-[0.7rem] font-semibold text-primary">Created in demo</span> : <span className="text-[0.7rem] text-muted-foreground">Demo conversation</span>}
          <span className="sr-only" aria-live="polite">
            {copied === "done" ? "Ticket ID copied" : copied === "failed" ? "Couldn't copy. Select the ID to copy it." : ""}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copyId} className={actionBtn}>
            {copied === "done" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied === "done" ? "Copied" : "Copy Ticket ID"}
          </button>
          {order ? (
            <Link href={ordersHref({ order: order.id })} className={actionBtn}>
              View Related Order <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
          {open ? (
            <button type="button" onClick={() => changeStatus("resolved")} className={actionBtn}>
              <CircleCheck className="size-3.5" aria-hidden /> Mark Resolved
            </button>
          ) : (
            <button type="button" onClick={() => changeStatus("awaiting")} className={actionBtn}>
              <RotateCcw className="size-3.5" aria-hidden /> Reopen Ticket
            </button>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-muted/30 px-4 py-5 sm:px-5">
        {order || tx ? (
          <section aria-label="Linked records" className="grid gap-2">
            {order ? <LinkedOrder order={order} /> : null}
            {tx ? (
              <Link
                href={transactionsHref({ tx: tx.id })}
                className="group flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted font-mono text-[0.6rem] font-bold text-muted-foreground" aria-hidden>
                  TX
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {TX_TYPE_LABELS[tx.type]} · {money(Math.abs(tx.amount))}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {tx.id} · {TX_STATUS_LABELS[tx.status]}
                  </span>
                </span>
                <span className="text-xs font-semibold text-primary group-hover:underline">View transaction</span>
              </Link>
            ) : null}
          </section>
        ) : null}

        {ticket.status === "waiting" ? (
          <p className="flex gap-2.5 rounded-2xl border border-soon/30 bg-soon-soft/60 p-3.5 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-soon" aria-hidden />
            <span>
              <span className="font-semibold">Waiting on you.</span>{" "}
              <span className="text-muted-foreground">Support asked for something in their last reply. Reply here when you&apos;re ready.</span>
            </span>
          </p>
        ) : null}

        <ol className="space-y-4" aria-label="Messages">
          {ticket.messages.map((m) => (
            <Message key={m.id} message={m} />
          ))}
        </ol>

        <Timeline ticket={ticket} />
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t bg-card px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5">
        <div role="status" className="empty:hidden">
          {note ? (
            <p className="mb-2.5 flex items-center gap-2 rounded-xl border border-dashed border-primary/40 px-3 py-2 text-xs">
              <FlaskConical className="size-3.5 shrink-0 text-primary" aria-hidden />
              {note}
            </p>
          ) : null}
        </div>
        {open ? (
          <Composer ticketId={ticket.id} onSent={() => setNote("Reply saved in demo mode — no support request was sent.")} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <p className="text-sm text-muted-foreground">This ticket is {ticket.status}. Reopen it to send a reply.</p>
            <button
              type="button"
              onClick={() => changeStatus("awaiting")}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
            >
              <RotateCcw className="size-4" aria-hidden /> Reopen Ticket
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LinkedOrder({ order }: { order: ReturnType<typeof useDemoOrders>["orders"][number] }) {
  const { service, platform } = orderService(order);
  return (
    <Link
      href={ordersHref({ order: order.id })}
      className="group flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
      aria-label={`Related order ${order.id}: ${service.name}, ${ORDER_STATUS_META[order.status].label}. View order`}
    >
      <PlatformTile platform={platform} size="sm" className="size-9 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{service.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{order.id}</span>
      </span>
      <OrderStatusBadge status={order.status} className="max-sm:hidden" />
      <span className="text-xs font-semibold text-primary group-hover:underline">View order</span>
    </Link>
  );
}

function Message({ message: m }: { message: DemoTicket["messages"][number] }) {
  const mine = m.from === "customer";
  const { initials } = useProfile();
  return (
    <li className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
      {mine ? (
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#7047eb] to-[#5a35d8] font-heading text-[0.65rem] font-bold text-white" aria-hidden>
          {initials}
        </span>
      ) : (
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-graphite text-lime ring-1 ring-white/10" aria-hidden>
          <LifeBuoy className="size-4" />
        </span>
      )}
      <div className={cn("flex max-w-[85%] min-w-0 flex-col gap-1", mine && "items-end")}>
        <p className={cn("flex items-baseline gap-2 text-xs", mine && "flex-row-reverse")}>
          <span className="font-semibold">{mine ? "You" : "Sociotix Support"}</span>
          <time dateTime={m.at} className="text-muted-foreground">
            {formatDateTime(m.at)} UTC
          </time>
          {m.demo ? <span className="font-semibold text-primary">Demo</span> : null}
        </p>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line",
            mine ? "rounded-se-md bg-primary text-primary-foreground" : "rounded-ss-md border bg-card shadow-xs",
          )}
        >
          {m.body}
        </div>
        {m.attachments?.length ? (
          <div className={cn("flex flex-wrap gap-1.5", mine && "justify-end")}>
            {m.attachments.map((a) => (
              <AttachmentChip key={a.name} file={a} />
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Timeline({ ticket }: { ticket: DemoTicket }) {
  const events = [...ticket.events].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <details className="group rounded-2xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-bold tracking-wider text-muted-foreground uppercase [&::-webkit-details-marker]:hidden">
        Status &amp; activity
        <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <ol className="space-y-3 border-t px-4 py-3.5">
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              {e.label}
              {e.demo ? <span className="ms-1.5 text-xs font-semibold text-primary">Demo</span> : null}
            </span>
            <time dateTime={e.at} className="shrink-0 text-xs text-muted-foreground">
              {formatDateTime(e.at)}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Composer({ ticketId, onSent }: { ticketId: string; onSent: () => void }) {
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<TicketAttachment[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const live = sensitiveIssue(body);

  const send = () => {
    const issue = !body.trim() ? "Write a reply first." : live;
    if (issue) {
      setError(issue);
      ref.current?.focus();
      return;
    }
    replyToTicket(ticketId, body.trim(), files);
    setBody("");
    setFiles([]);
    setError(null);
    onSent();
  };

  const shown = error ?? live;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      noValidate
    >
      <label htmlFor="reply" className="sr-only">
        Your reply
      </label>
      <div
        className={cn(
          "rounded-2xl border bg-background transition-colors focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-primary/15",
          shown && "border-destructive/60",
        )}
      >
        <textarea
          ref={ref}
          id="reply"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Write a reply…"
          aria-invalid={Boolean(shown)}
          aria-describedby="reply-hint"
          className="block max-h-40 min-h-16 w-full resize-y bg-transparent px-3.5 pt-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 pt-1 pb-2.5">
          <DemoAttachments files={files} onChange={setFiles} />
          <button
            type="submit"
            className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
          >
            Send <Send className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <p id="reply-hint" className={cn("mt-1.5 text-xs", shown ? "font-medium text-destructive" : "text-muted-foreground")} role={shown ? "alert" : undefined}>
        {shown ?? "Ctrl + Enter to send · Never share passwords, codes or card details."}
      </p>
    </form>
  );
}
