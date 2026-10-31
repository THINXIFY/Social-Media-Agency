"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, CircleCheck, FlaskConical, Info, Lock, Search, Undo2, X } from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  formatDate,
  money,
  ORDER_STATUS_META,
  orderService,
  TRANSACTIONS,
  TX_METHOD_LABELS,
  TX_STATUS_LABELS,
  TX_TYPE_LABELS,
} from "@/lib/demo-account";
import {
  sensitiveIssue,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_IDS,
  type TicketAttachment,
  type TicketCategory,
  type TicketPriority,
} from "@/lib/demo-support";
import { cn } from "@/lib/utils";
import { createDemoTicket, useDemoOrders } from "./demo-store";
import { CATEGORY_ICONS, DemoAttachments } from "./support-ui";

export interface TicketPreset {
  orderId?: string;
  txId?: string;
}

/* -------------------------------------------------------------------------- */
/*  Searchable reference picker                                               */
/* -------------------------------------------------------------------------- */

interface RefItem {
  id: string;
  title: string;
  meta: string;
  icon: React.ReactNode;
  search: string;
}

function ReferencePicker({
  id,
  label,
  items,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  items: RefItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const selected = items.find((i) => i.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const list = (q ? items.filter((i) => i.search.includes(q)) : items).slice(0, 30);
  const listId = `${id}-list`;

  const pick = (item: RefItem) => {
    onChange(item.id);
    setQuery("");
    setOpen(false);
  };

  if (selected) {
    return (
      <div>
        <p className="text-sm font-semibold" id={`${id}-label`}>
          {label}
        </p>
        <div className="mt-1.5 flex items-center gap-3 rounded-2xl border bg-card p-2.5 pe-2" aria-labelledby={`${id}-label`}>
          {selected.icon}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{selected.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{selected.meta}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            aria-label={`Remove ${label.toLowerCase()} ${selected.id}`}
          >
            <X className="size-3.5" aria-hidden /> Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="text-sm font-semibold">
        {label} <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && list[active] ? `${id}-opt-${list[active].id}` : undefined}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, list.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open && list[active]) {
              e.preventDefault();
              pick(list[active]);
            } else if (e.key === "Escape" && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="h-11 w-full rounded-xl border bg-card pe-3 ps-10 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15"
        />
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-60 overflow-y-auto rounded-2xl border bg-popover p-1.5 shadow-float"
        >
          {list.length ? (
            list.map((item, i) => (
              <li
                key={item.id}
                id={`${id}-opt-${item.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2", i === active && "bg-muted")}
              >
                {item.icon}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.meta}</span>
                </span>
              </li>
            ))
          ) : (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">Nothing matches &ldquo;{query}&rdquo;</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Form                                                                      */
/* -------------------------------------------------------------------------- */

const inputClass =
  "w-full rounded-xl border bg-card px-3.5 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive/60";

const PRIORITIES: { id: TicketPriority; label: string; hint: string }[] = [
  { id: "normal", label: "Normal", hint: "Most questions about orders, services and your account." },
  { id: "urgent", label: "Urgent", hint: "Money-related problems, like a payment taken but not showing in your balance." },
];

function categoryFor(preset: TicketPreset): TicketCategory | null {
  if (preset.txId) return preset.txId.startsWith("REF-") ? "refund" : "payment";
  if (preset.orderId) return "order";
  return null;
}

export function NewTicketSheet({
  open,
  preset,
  onClose,
  onView,
}: {
  open: boolean;
  preset: TicketPreset;
  onClose: () => void;
  onView: (id: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[36rem]">
        {open ? <TicketForm key={`${preset.orderId}-${preset.txId}`} preset={preset} onClose={onClose} onView={onView} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function TicketForm({ preset, onClose, onView }: { preset: TicketPreset; onClose: () => void; onView: (id: string) => void }) {
  const { orders } = useDemoOrders();
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState<TicketCategory | null>(() => categoryFor(preset));
  const [orderId, setOrderId] = React.useState<string | null>(preset.orderId && orders.some((o) => o.id === preset.orderId) ? preset.orderId : null);
  const [txId, setTxId] = React.useState<string | null>(preset.txId && TRANSACTIONS.some((t) => t.id === preset.txId) ? preset.txId : null);
  const [priority, setPriority] = React.useState<TicketPriority>("normal");
  const [message, setMessage] = React.useState("");
  const [files, setFiles] = React.useState<TicketAttachment[]>([]);
  const [showRefs, setShowRefs] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [created, setCreated] = React.useState<string | null>(null);
  const subjectRef = React.useRef<HTMLInputElement>(null);
  const messageRef = React.useRef<HTMLTextAreaElement>(null);
  const categoryRef = React.useRef<HTMLFieldSetElement>(null);

  const meta = category ? TICKET_CATEGORIES[category] : null;
  const wantsOrder = Boolean(orderId) || showRefs || Boolean(meta?.refs.includes("order"));
  const wantsTx = Boolean(txId) || showRefs || Boolean(meta?.refs.includes("transaction"));

  const errors = {
    subject: !subject.trim() ? "Add a short subject." : subject.trim().length < 4 ? "Make the subject a little longer." : sensitiveIssue(subject),
    category: !category ? "Choose a category." : null,
    message: !message.trim() ? "Write a message." : message.trim().length < 15 ? "Add a bit more detail (at least 15 characters)." : sensitiveIssue(message),
  };
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : k === "message" || k === "subject" ? sensitiveIssue(k === "message" ? message : subject) : null);

  const orderItems = React.useMemo<RefItem[]>(
    () =>
      orders.map((o) => {
        const { service, platform } = orderService(o);
        return {
          id: o.id,
          title: service.name,
          meta: `${o.id} · ${ORDER_STATUS_META[o.status].label} · ${formatDate(o.placedAt)}`,
          icon: <PlatformTile platform={platform} size="sm" className="size-9 rounded-xl" />,
          search: `${o.id} ${service.name} ${platform.name}`.toLowerCase(),
        };
      }),
    [orders],
  );

  const txItems = React.useMemo<RefItem[]>(
    () =>
      TRANSACTIONS.map((t) => {
        const Icon = t.type === "refund" ? Undo2 : t.amount > 0 ? ArrowDownLeft : ArrowUpRight;
        const what = t.type === "payment" ? `Payment for ${t.orderId}` : t.type === "deposit" ? `${t.asset ?? TX_METHOD_LABELS[t.method]} deposit` : (t.title ?? TX_TYPE_LABELS[t.type]);
        return {
          id: t.id,
          title: `${what} · ${money(Math.abs(t.amount))}`,
          meta: `${t.id} · ${TX_STATUS_LABELS[t.status]} · ${formatDate(t.createdAt)}`,
          icon: (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground/70" aria-hidden>
              <Icon className="size-4" />
            </span>
          ),
          search: `${t.id} ${t.orderId ?? ""} ${what} ${TX_STATUS_LABELS[t.status]}`.toLowerCase(),
        };
      }),
    [],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.subject) return subjectRef.current?.focus();
    if (errors.category) return categoryRef.current?.querySelector("input")?.focus();
    if (errors.message) return messageRef.current?.focus();
    const id = createDemoTicket({
      subject: subject.trim(),
      category: category!,
      priority,
      body: message.trim(),
      orderId: orderId ?? undefined,
      txId: txId ?? undefined,
      attachments: files,
    });
    setCreated(id);
  };

  if (created) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex justify-end p-3">
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid flex-1 place-items-center px-6 pb-10 text-center" role="status">
          <div className="max-w-sm">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ok-soft text-ok">
              <CircleCheck className="size-7" aria-hidden />
            </span>
            <SheetTitle className="mt-4 font-heading text-xl font-bold">Ticket {created} created</SheetTitle>
            <SheetDescription className="mt-2 text-sm leading-relaxed">
              Saved in demo mode — no support request was sent. You&apos;ll find it at the top of your tickets.
            </SheetDescription>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-full border text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                Back to Tickets
              </button>
              <button
                type="button"
                onClick={() => onView(created)}
                autoFocus
                className="inline-flex h-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
              >
                View Ticket
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <SheetTitle className="font-heading text-lg font-bold">New support ticket</SheetTitle>
          <SheetDescription className="mt-0.5 text-sm">Tell us what&apos;s happening and we&apos;ll take it from there.</SheetDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          aria-label="Close new ticket"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
        <Field id="t-subject" label="Subject" error={show("subject")}>
          <input
            ref={subjectRef}
            id="t-subject"
            value={subject}
            maxLength={120}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. My Instagram order needs assistance"
            aria-invalid={Boolean(show("subject"))}
            aria-describedby={show("subject") ? "t-subject-error" : undefined}
            className={cn(inputClass, "h-11")}
          />
        </Field>

        <fieldset ref={categoryRef}>
          <legend className="text-sm font-semibold">Category</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TICKET_CATEGORY_IDS.map((c) => {
              const Icon = CATEGORY_ICONS[c];
              const on = category === c;
              return (
                <label
                  key={c}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-card px-3 py-2 text-[0.8rem] font-semibold transition-colors select-none hover:border-foreground/25 has-focus-visible:ring-3 has-focus-visible:ring-primary/25",
                    on && "border-primary bg-secondary/50 text-foreground shadow-[0_0_0_1px_var(--color-primary)] hover:border-primary",
                  )}
                >
                  <input type="radio" name="t-category" value={c} checked={on} onChange={() => setCategory(c)} className="sr-only" />
                  <Icon className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  {TICKET_CATEGORIES[c].label}
                </label>
              );
            })}
          </div>
          {show("category") ? (
            <p className="mt-1.5 text-xs font-medium text-destructive" role="alert">
              {show("category")}
            </p>
          ) : null}
          {meta ? (
            <p className="mt-3 flex gap-2.5 rounded-2xl bg-secondary/50 p-3 text-[0.8rem] leading-relaxed" aria-live="polite">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {meta.guidance}
            </p>
          ) : null}
        </fieldset>

        {wantsOrder || wantsTx ? (
          <div className="space-y-4">
            {wantsOrder ? (
              <ReferencePicker id="t-order" label="Related order" items={orderItems} value={orderId} onChange={setOrderId} placeholder="Search by order ID or service" />
            ) : null}
            {wantsTx ? (
              <ReferencePicker id="t-tx" label="Related transaction" items={txItems} value={txId} onChange={setTxId} placeholder="Search by transaction ID or order" />
            ) : null}
          </div>
        ) : category ? (
          <button type="button" onClick={() => setShowRefs(true)} className="text-sm font-semibold text-primary hover:underline">
            + Add an order or transaction
          </button>
        ) : null}

        <fieldset>
          <legend className="text-sm font-semibold">Priority</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {PRIORITIES.map((p) => {
              const on = priority === p.id;
              return (
                <label
                  key={p.id}
                  className={cn(
                    "cursor-pointer rounded-xl border bg-card p-3 transition-colors select-none hover:border-foreground/25 has-focus-visible:ring-3 has-focus-visible:ring-primary/25",
                    on && (p.id === "urgent" ? "border-destructive/60 bg-destructive/5" : "border-primary bg-secondary/50"),
                  )}
                >
                  <input type="radio" name="t-priority" value={p.id} checked={on} onChange={() => setPriority(p.id)} className="sr-only" />
                  <span className={cn("block text-sm font-bold", on && p.id === "urgent" && "text-destructive")}>{p.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{p.hint}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <Field id="t-message" label="Message" error={show("message")}>
          <textarea
            ref={messageRef}
            id="t-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="I'd like help with order SV-10530. Please review its current status and let me know what information you need."
            aria-invalid={Boolean(show("message"))}
            aria-describedby={show("message") ? "t-message-error" : "t-message-hint"}
            className={cn(inputClass, "resize-y py-3 leading-relaxed")}
          />
          {!show("message") ? (
            <p id="t-message-hint" className="mt-1.5 flex justify-between gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Lock className="size-3" aria-hidden /> Never include passwords, sign-in codes, API keys or card details.
              </span>
              <span className="shrink-0 tabular-nums">{message.length}/2000</span>
            </p>
          ) : null}
        </Field>

        <div>
          <p className="text-sm font-semibold">
            Attachments <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <div className="mt-1.5 rounded-2xl border border-dashed p-3.5">
            <p className="mb-2.5 text-xs text-muted-foreground">File uploads aren&apos;t enabled yet. Add sample file details to see how attachments will look.</p>
            <DemoAttachments files={files} onChange={setFiles} />
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t bg-card px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
          >
            Create Ticket
          </button>
        </div>
        <p className="flex items-center justify-center gap-1.5 text-[0.7rem] text-muted-foreground">
          <FlaskConical className="size-3" aria-hidden /> Demo mode — saved in this browser, nothing is sent.
        </p>
      </div>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error: string | null; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
