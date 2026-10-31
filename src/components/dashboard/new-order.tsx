"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Heart,
  Info,
  Lock,
  Pencil,
  Repeat,
  Search,
  SearchX,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { PlatformIcon, PlatformTile } from "@/components/brand";
import { CATEGORY_ICONS } from "@/components/site/primitives";
import {
  CATALOG_TOTALS,
  CATEGORY_DELIVERY,
  CATEGORY_FIELDS,
  CATEGORY_META,
  CATEGORY_ORDER,
  isQuantityBased,
  matchesQuery,
  type OrderField,
  type Platform,
  PLATFORM_BY_ID,
  PLATFORMS,
  requirementsOf,
  type Service,
  SERVICE_BY_ID,
  SERVICES,
  type ServiceCategory,
} from "@/lib/catalog";
import { count, DEMO_WALLET, money, usd } from "@/lib/demo-account";
import { formatPrice as formatCatalogPrice, useDisplay } from "@/lib/i18n";
import { isForeignHost, parseLink } from "@/lib/links";
import { cn } from "@/lib/utils";
import {
  clearReorderDraft,
  type LocalOrder,
  readReorderDraft,
  saveReorderDraft,
  useDemoOrders,
  useFavorites,
} from "./demo-store";
import { useLiveAccount } from "./live-account";
import { FavoriteButton } from "./favorite-button";
import { FINDER_QUERY_KEY, FinderPrompt } from "./service-finder";
import { FxNote } from "./region";
import { DemoTag, FINDER_ROUTE, ordersHref, Panel, ROUTES, useHydrated } from "./shared";

/* -------------------------------------------------------------------------- */
/*  Steps, validation & pricing                                               */
/* -------------------------------------------------------------------------- */

const STEPS = ["Platform", "Service", "Configure", "Review"] as const;
type Step = 0 | 1 | 2 | 3;
type Values = Record<string, string>;

const PASSWORD_HINT = /\b(password|passcode|pwd|login code|2fa code)\b/i;

const parseNumber = (value: string) => Number(value.replace(/[,\s]/g, ""));

function fieldError(field: OrderField, raw: string | undefined, service: Service): string | null {
  const value = (raw ?? "").trim();
  if (!value) {
    if (!field.required) return null;
    if (field.kind === "consent") return "Please confirm to continue.";
    if (field.kind === "select") return `Choose a ${field.label.toLowerCase()}.`;
    return `${field.label} is required.`;
  }
  switch (field.kind) {
    case "link":
      return parseLink(value) ? null : "Enter a full link, like https://…";
    case "quantity": {
      const n = parseNumber(value);
      if (!/^[\d,\s]+$/.test(value) || !Number.isInteger(n) || n <= 0) return "Enter a whole number above zero.";
      const limits = service.limits;
      if (limits && n < limits.min) return `The minimum for this service is ${count(limits.min)}.`;
      if (limits && n > limits.max) return `The maximum for this service is ${count(limits.max)}.`;
      return null;
    }
    case "budget": {
      const n = parseNumber(value);
      if (!/^\d[\d,]*(\.\d{1,2})?$/.test(value) || !(n > 0)) return "Enter an amount above zero, like 250 or 250.00.";
      return null;
    }
    case "text":
    case "textarea":
      return value.length < 3 ? "Add a little more detail." : null;
    default:
      return null;
  }
}

function fieldWarning(field: OrderField, raw: string | undefined, platform: Platform): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (PASSWORD_HINT.test(value)) return "Never share passwords or login codes. SociVanta will never ask for them.";
  if (field.kind === "link") {
    const url = parseLink(value);
    if (url && isForeignHost(url, platform.id)) {
      return `This doesn't look like a ${platform.name} link. Double-check it before you continue.`;
    }
  }
  return null;
}

const formErrors = (service: Service, values: Values) =>
  Object.fromEntries(
    CATEGORY_FIELDS[service.category]
      .map((f) => [f.id, fieldError(f, values[f.id], service)] as const)
      .filter(([, e]) => e),
  ) as Record<string, string>;

/** Catalog prices are in USD, so they follow the display currency like every other amount. */
const formatPrice = (amount: number, currency: string) => (currency === "USD" ? money(amount) : formatCatalogPrice(amount, currency));

/** Only computes totals when a real pricing rule exists. Never estimates. */
function pricing(service: Service | null, values: Values) {
  if (!service?.price) return null;
  const { amount, currency, unit } = service.price;
  const qty = parseNumber(values.quantity ?? "");
  const total =
    isQuantityBased(service.category) && unit === "per 1,000" && Number.isInteger(qty) && qty > 0
      ? (amount * qty) / 1000
      : null;
  return { unit: `${formatPrice(amount, currency)} ${unit}`, total: total === null ? null : formatPrice(total, currency) };
}

function displayValue(field: OrderField, raw: string | undefined) {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (field.kind === "quantity") return count(parseNumber(value));
  if (field.kind === "budget") return money(parseNumber(value));
  if (field.kind === "consent") return "Confirmed";
  return value;
}

/* -------------------------------------------------------------------------- */
/*  Flow                                                                      */
/* -------------------------------------------------------------------------- */

/** A reorder in progress: where it came from and anything the customer needs to fix. */
interface ReorderInfo {
  orderId: string;
  /** Null when the order can't be found. */
  order: LocalOrder | null;
  notice: string | null;
  /** Whether choosing a service or completing the details clears the notice. */
  resolvedBy: "service" | "details";
  /** True when details were copied (or restored) for the original service. */
  copied: boolean;
  restored: boolean;
}

interface InitialState {
  step: Step;
  platformId: string | null;
  serviceId: string | null;
  values: Values;
  touched: Record<string, boolean>;
  reorder: ReorderInfo | null;
  /** Opened from a Smart Order Assistant draft (AI-05): service and quantity pre-filled, nothing else. */
  aiDraft: boolean;
}

type BrowseView = "browse" | "favorites";

const BLANK: InitialState = { step: 0, platformId: null, serviceId: null, values: {}, touched: {}, reorder: null, aiDraft: false };

/** Values copied from a previous order: only the target and amount, never free-text notes. */
function copiedValues(order: LocalOrder, service: Service): Values {
  const values: Values = {};
  for (const f of CATEGORY_FIELDS[service.category]) {
    if (f.kind === "link") values[f.id] = order.link;
    if (f.kind === "quantity") values[f.id] = String(order.quantity);
  }
  return values;
}

const listOf = (labels: string[]) =>
  labels.length < 2 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

/** Prepares an editable draft from a previous order, checked against the service's current requirements. */
function reorderState(orderId: string, orders: LocalOrder[]): InitialState {
  const order = orders.find((o) => o.id === orderId) ?? null;
  if (!order) {
    return {
      ...BLANK,
      reorder: { orderId, order: null, restored: false, copied: false, resolvedBy: "service", notice: `We couldn't find order ${orderId}. Choose a service to start a new order.` },
    };
  }
  const draft = readReorderDraft(order.id);
  const service = SERVICE_BY_ID[draft?.serviceId ?? order.serviceId];
  if (!service) {
    return {
      ...BLANK,
      reorder: {
        orderId,
        order,
        restored: false,
        copied: false,
        resolvedBy: "service",
        notice: "The service from this order is no longer available. Choose a service to continue.",
      },
    };
  }

  const fields = CATEGORY_FIELDS[service.category];
  const values = draft ? { ...draft.values } : copiedValues(order, service);
  const errors = formErrors(service, values);
  const invalid = Object.keys(values).filter((id) => errors[id]);
  const missing = fields.filter((f) => errors[f.id] && !values[f.id] && f.kind !== "consent");

  let notice: string | null = null;
  if (!fields.some((f) => f.kind === "quantity") && !draft) {
    notice = "This service no longer uses a quantity. Add the details it needs now.";
  } else if (invalid.length) {
    notice = "Some copied details don't meet this service's current requirements. Update the highlighted fields.";
  } else if (missing.length) {
    notice = `Add ${listOf(missing.map((f) => f.label.toLowerCase()))} to continue. Written details aren't copied from previous orders.`;
  }

  return {
    ...BLANK,
    step: Object.keys(errors).length ? 2 : 3,
    platformId: service.platformId,
    serviceId: service.id,
    values,
    // Show problems with copied values straight away.
    touched: Object.fromEntries(Object.keys(values).map((id) => [id, true])),
    reorder: { orderId, order, notice, restored: Boolean(draft), copied: true, resolvedBy: "details" },
  };
}

function initialState(params: URLSearchParams, orders: LocalOrder[]): InitialState {
  const reorder = params.get("reorder");
  if (reorder) return reorderState(reorder, orders);
  const service = SERVICE_BY_ID[params.get("service") ?? ""];
  if (service) {
    // A Smart Order Assistant draft carries a quantity; it lands on Configure, where the wizard's own checks apply.
    const values: Values = {};
    const quantity = params.get("quantity");
    const field = CATEGORY_FIELDS[service.category].find((f) => f.kind === "quantity");
    if (field && quantity && /^\d{1,9}$/.test(quantity)) values[field.id] = quantity;
    return { ...BLANK, step: 2, platformId: service.platformId, serviceId: service.id, values, touched: Object.fromEntries(Object.keys(values).map((id) => [id, true])), aiDraft: params.get("from") === "ai" };
  }
  const platform = PLATFORM_BY_ID[params.get("platform") ?? ""];
  if (platform) return { ...BLANK, step: 1, platformId: platform.id };
  return BLANK;
}

/** The real balance in live mode (USD, from the ledger); the demo balance otherwise. */
function WalletBalance() {
  const live = useLiveAccount();
  return <>{live ? usd(live.wallet.availableCents / 100) : money(DEMO_WALLET.balance)}</>;
}

export function NewOrderSkeleton() {
  return (
    <div className="mx-auto max-w-[90rem] px-3 pt-4 sm:px-6 sm:pt-7 lg:px-8" aria-busy="true">
      <span className="sr-only">Loading New Order…</span>
      <div className="h-24 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="h-[28rem] animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
        <div className="hidden h-96 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none xl:block" />
      </div>
    </div>
  );
}

export function NewOrder() {
  // Re-render when language, currency, time zone or date format change.
  useDisplay();
  const params = useSearchParams();
  // Favorites and reorder drafts live in this browser, so wait until they can be read.
  const hydrated = useHydrated();
  const key = ["service", "platform", "reorder", "view", "quantity"].map((k) => params.get(k) ?? "").join("|");
  if (!hydrated) return <NewOrderSkeleton />;
  // A new preselection (e.g. picked from the top-bar search) starts a fresh order.
  return <OrderFlow key={key} params={params} />;
}

function OrderFlow({ params }: { params: URLSearchParams }) {
  const router = useRouter();
  const { orders } = useDemoOrders();
  const [initial] = React.useState(() => initialState(params, orders));
  const [step, setStep] = React.useState<Step>(initial.step);
  const [platformId, setPlatformId] = React.useState<string | null>(initial.platformId);
  const [serviceId, setServiceId] = React.useState<string | null>(initial.serviceId);
  const [values, setValues] = React.useState<Values>(initial.values);
  const [touched, setTouched] = React.useState<Record<string, boolean>>(initial.touched);
  const [submitted, setSubmitted] = React.useState(false);
  const reorder = initial.reorder;
  // Coming from the Service Finder, link back to the same answers.
  const [backLink] = React.useState(() => {
    if (params.get("from") !== "finder") return { href: ROUTES.overview, label: "Overview" };
    let query = "";
    try {
      query = sessionStorage.getItem(FINDER_QUERY_KEY) ?? "";
    } catch {}
    return { href: query ? `${FINDER_ROUTE}?${query}` : FINDER_ROUTE, label: "Service Finder" };
  });
  const [initialView] = React.useState<BrowseView>(() => (params.get("view") === "favorites" ? "favorites" : "browse"));
  // Edits to a reorder are kept as a draft so a refresh doesn't lose them.
  const keepDraft = (id: string | null, next: Values) => {
    if (reorder?.order && id) saveReorderDraft(reorder.orderId, id, next);
  };
  const startFresh = () => {
    clearReorderDraft();
    router.replace(ROUTES["new-order"]);
  };
  // Set when the step changes; the next step's heading takes focus once it mounts.
  const focusPending = React.useRef(false);

  const platform = platformId ? PLATFORM_BY_ID[platformId] : null;
  const service = serviceId ? SERVICE_BY_ID[serviceId] : null;
  const errors = React.useMemo(() => (service ? formErrors(service, values) : {}), [service, values]);
  const formValid = Boolean(service) && Object.keys(errors).length === 0;

  const reachable = (s: Step) => s === 0 || (s === 1 && !!platform) || (s === 2 && !!service) || (s === 3 && formValid);

  const choosePlatform = (id: string) => {
    if (id !== platformId && service && service.platformId !== id) setServiceId(null);
    setPlatformId(id);
    changeStep(1);
  };

  const chooseService = (s: Service, advance = false) => {
    setPlatformId(s.platformId);
    setServiceId(s.id);
    if (s.id !== serviceId) keepDraft(s.id, values);
    if (advance) changeStep(2);
  };

  const setValue = (id: string, value: string) => {
    const next = { ...values, [id]: value };
    setValues(next);
    keepDraft(serviceId, next);
  };

  const next = () => {
    if (step === 0 && platform) changeStep(1);
    else if (step === 1 && service) changeStep(2);
    else if (step === 2 && service) {
      if (formValid) changeStep(3);
      else {
        setSubmitted(true);
        const first = CATEGORY_FIELDS[service.category].find((f) => errors[f.id]);
        if (first) document.getElementById(`field-${first.id}`)?.focus();
      }
    }
  };
  const back = () => changeStep(Math.max(0, step - 1) as Step);

  /** True once after a step change, so only the new heading takes focus. */
  const claimFocus = React.useCallback(() => {
    const pending = focusPending.current;
    focusPending.current = false;
    return pending;
  }, []);

  const changeStep = (s: Step) => {
    focusPending.current = true;
    setStep(s);
  };

  const ctx: FlowContext = {
    claimFocus,
    step,
    platform,
    service,
    values,
    errors,
    showError: (id) => Boolean(errors[id] && (submitted || touched[id])),
    setValue,
    touch: (id) => setTouched((t) => ({ ...t, [id]: true })),
    choosePlatform,
    chooseService,
    goTo: (s) => reachable(s) && changeStep(s),
    next,
    back,
    formValid,
    reorder,
    initialView,
  };

  return (
    <div className="mx-auto max-w-[90rem] px-3 pt-4 pb-6 sm:px-6 sm:pt-7 lg:px-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href={backLink.href}
            className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden /> {backLink.label}
          </Link>
          <h1 className="mt-2 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">New Order</h1>
          <p className="mt-1 text-[0.95rem] text-muted-foreground">
            Choose from {CATALOG_TOTALS.services} services across {CATALOG_TOTALS.platforms} platforms.
          </p>
        </div>
        <Stepper ctx={ctx} reachable={reachable} />
      </header>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 sm:mt-7 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-6">
        <section aria-labelledby="step-title" className="min-w-0">
          {reorder ? <ReorderBanner ctx={ctx} reorder={reorder} onStartFresh={startFresh} /> : null}
          {initial.aiDraft && serviceId === initial.serviceId ? <AiDraftNotice /> : null}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {step === 0 ? <PlatformStep ctx={ctx} /> : null}
              {step === 1 && platform ? <ServiceStep ctx={ctx} platform={platform} /> : null}
              {step === 2 && service ? <ConfigureStep ctx={ctx} service={service} /> : null}
              {step === 3 && service ? <ReviewStep ctx={ctx} service={service} /> : null}
            </motion.div>
          </AnimatePresence>
        </section>

        <aside className="sticky top-24 hidden xl:block" aria-label="Order summary">
          <SummaryCard ctx={ctx} />
        </aside>
      </div>

      <MobileActionBar ctx={ctx} />
    </div>
  );
}

interface FlowContext {
  claimFocus: () => boolean;
  step: Step;
  platform: Platform | null;
  service: Service | null;
  values: Values;
  errors: Record<string, string>;
  showError: (id: string) => boolean;
  setValue: (id: string, value: string) => void;
  touch: (id: string) => void;
  choosePlatform: (id: string) => void;
  chooseService: (s: Service, advance?: boolean) => void;
  goTo: (s: Step) => void;
  next: () => void;
  back: () => void;
  formValid: boolean;
  reorder: ReorderInfo | null;
  /** Which list the platform step opens on. */
  initialView: BrowseView;
}

type StepProps = { ctx: FlowContext };

/* -------------------------------------------------------------------------- */
/*  Reorder                                                                   */
/* -------------------------------------------------------------------------- */

/** Shown when the order was prepared by the Smart Order Assistant (AI-05). Informational only. */
function AiDraftNotice() {
  return (
    <div role="note" aria-label="Prepared with Smart Order Assistant" className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/25 bg-secondary/40 p-3.5 sm:mb-5 sm:p-4 dark:bg-secondary/25">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden>
        <ShieldCheck className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Prepared with Smart Order Assistant</p>
        <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted-foreground">
          The service and quantity are filled in from your draft. Add the remaining details and check everything — nothing is ordered or charged until you confirm on the Review step.
        </p>
      </div>
    </div>
  );
}

function ReorderBanner({ ctx, reorder, onStartFresh }: { ctx: FlowContext; reorder: ReorderInfo; onStartFresh: () => void }) {
  const { order } = reorder;
  const editable = reorder.copied && Boolean(ctx.service);
  const notice = (reorder.resolvedBy === "service" ? !ctx.service : !ctx.formValid) ? reorder.notice : null;
  return (
    <div
      role="region"
      aria-label="Reorder"
      className={cn(
        "mb-4 flex items-start gap-3 rounded-2xl border p-3.5 sm:mb-5 sm:p-4",
        order ? "border-primary/25 bg-secondary/40 dark:bg-secondary/25" : "border-soon/30 bg-soon-soft/50",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl",
          order ? "bg-primary text-primary-foreground" : "bg-soon-soft text-soon",
        )}
        aria-hidden
      >
        {order ? <Repeat className="size-4" /> : <TriangleAlert className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        {order ? (
          <p className="text-sm font-semibold">
            Reordering from{" "}
            <Link
              href={ordersHref({ order: order.id })}
              className="font-mono text-[0.82rem] text-primary underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              {order.id}
            </Link>
          </p>
        ) : (
          <p className="text-sm font-semibold">Order not found</p>
        )}
        {editable ? (
          <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted-foreground">
            {reorder.restored ? "Your draft was restored. " : "Service, link and quantity are copied from that order. "}
            Review or change anything before placing it. Pricing comes from the current catalog, not your previous order.
          </p>
        ) : null}
        {notice ? (
          <p role="status" className={cn("flex items-start gap-1.5 text-[0.8rem] font-medium", order ? "mt-2 text-soon" : "mt-0.5 text-muted-foreground")}>
            {order ? <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : null}
            {notice}
          </p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {editable && ctx.step === 3 ? (
            <button
              type="button"
              onClick={() => ctx.goTo(2)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <Pencil className="size-3.5" aria-hidden /> Edit Order Details
            </button>
          ) : null}
          <button
            type="button"
            onClick={onStartFresh}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <X className="size-3.5" aria-hidden /> Start a fresh order
          </button>
        </div>
      </div>
      <DemoTag className="hidden shrink-0 text-muted-foreground sm:inline-flex">Draft</DemoTag>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stepper                                                                   */
/* -------------------------------------------------------------------------- */

function Stepper({ ctx, reachable }: { ctx: FlowContext; reachable: (s: Step) => boolean }) {
  const detail = [ctx.platform?.short, ctx.service?.name, ctx.formValid ? "Details added" : null, null];
  const stepLabel = (i: number) => {
    const state = i < ctx.step ? ", completed" : i === ctx.step ? ", current step" : "";
    return `Step ${i + 1}: ${STEPS[i]}${state}`;
  };

  return (
    <nav aria-label="Order progress" className="w-full lg:w-auto">
      {/* Phones: a segmented bar with the current step named above it */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">{STEPS[ctx.step]}</p>
          <p className="text-xs font-medium text-muted-foreground">
            Step {ctx.step + 1} of {STEPS.length}
          </p>
        </div>
        <ol className="mt-1 grid grid-cols-4 gap-1.5">
          {STEPS.map((label, i) => {
            const s = i as Step;
            const canGo = ctx.step !== s && reachable(s);
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => ctx.goTo(s)}
                  disabled={!canGo}
                  aria-current={ctx.step === s ? "step" : undefined}
                  aria-label={stepLabel(i)}
                  className="block w-full rounded-full py-2 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:cursor-default"
                >
                  <span className={cn("block h-1.5 rounded-full transition-colors", i <= ctx.step ? "bg-primary" : "bg-border")} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Tablet & desktop: labelled steps */}
      <ol className="hidden items-center sm:flex">
        {STEPS.map((label, i) => {
          const s = i as Step;
          const current = ctx.step === s;
          const done = ctx.step > s;
          const canGo = !current && reachable(s);
          return (
            <li key={label} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1 lg:flex-none")}>
              <button
                type="button"
                onClick={() => ctx.goTo(s)}
                disabled={!canGo}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-full p-1 pe-1 text-start transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none md:pe-3",
                  canGo ? "hover:bg-muted" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-[0.8rem] font-bold tabular-nums transition-all",
                    current && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                    done && "bg-primary/12 text-primary ring-1 ring-primary/30 ring-inset dark:bg-primary/20",
                    !current && !done && "border bg-card text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <span className={cn("min-w-0", !current && "max-md:sr-only")}>
                  <span
                    className={cn(
                      "block text-sm leading-tight",
                      current ? "font-semibold text-foreground" : done ? "font-medium text-foreground" : "font-medium text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                  {done && detail[i] ? (
                    <span className="block max-w-28 truncate text-[0.7rem] leading-tight text-muted-foreground">{detail[i]}</span>
                  ) : null}
                </span>
                {current || done ? <span className="sr-only">{current ? ", current step" : ", completed"}</span> : null}
              </button>
              {i < STEPS.length - 1 ? (
                <span
                  className={cn("mx-1.5 h-0.5 min-w-4 flex-1 rounded-full transition-colors lg:w-8 lg:flex-none", done ? "bg-primary/60" : "bg-border")}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

function StepHeading({
  ctx,
  title,
  description,
  action,
}: {
  ctx: FlowContext;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}) {
  const ref = React.useRef<HTMLHeadingElement>(null);
  const { claimFocus } = ctx;

  // Land keyboard and screen-reader users on the new step.
  React.useEffect(() => {
    if (!claimFocus()) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    ref.current?.focus({ preventScroll: true });
  }, [claimFocus]);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id="step-title" ref={ref} tabIndex={-1} className="text-xl font-bold outline-none sm:text-[1.35rem]">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function SearchField({
  id,
  value,
  onChange,
  placeholder,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute top-1/2 start-4 size-[1.1rem] -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-12 w-full scroll-mt-24 scroll-mb-36 rounded-2xl border bg-card pe-11 ps-11 text-[0.95rem] shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 end-3 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function Empty({ title, hint, onReset }: { title: string; hint: string; onReset: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed px-6 py-12 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <SearchX className="size-5" aria-hidden />
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-3 inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold text-primary hover:bg-secondary"
      >
        Clear search
      </button>
    </div>
  );
}

function PricingPending({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 text-[0.7rem] font-semibold whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      <Clock3 className="size-3" strokeWidth={2.5} aria-hidden />
      Pricing pending
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 1 · Platform                                                         */
/* -------------------------------------------------------------------------- */

const SERVICE_COUNT = Object.fromEntries(PLATFORMS.map((p) => [p.id, SERVICES.filter((s) => s.platformId === p.id).length]));
const POPULAR = SERVICES.filter((s) => s.featured);

/** Favorites first, in the order they were when the list opened, so cards don't jump when a heart is toggled. */
function useFavoritesFirst() {
  const favorites = useFavorites();
  const [pinned] = React.useState(() => new Set(favorites.ids));
  return React.useCallback(
    (list: Service[]) => (pinned.size ? [...list].sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id))) : list),
    [pinned],
  );
}

const chipClass =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium whitespace-nowrap transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";
const chipOnClass = "border-foreground bg-foreground text-background hover:border-foreground";

function FavoritesEmpty({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed px-6 py-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-secondary text-primary">
        <Heart className="size-5" aria-hidden />
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{hint}</p>
      {action}
    </div>
  );
}

function PlatformStep({ ctx }: StepProps) {
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<BrowseView>(ctx.initialView);
  const favorites = useFavorites();
  const favoritesFirst = useFavoritesFirst();
  const q = query.trim().toLowerCase();
  const browsing = view === "browse";
  const platforms = !browsing
    ? []
    : q
      ? PLATFORMS.filter((p) => [p.name, p.short, ...p.aliases].some((t) => t.toLowerCase().includes(q)))
      : PLATFORMS;
  const services = browsing && q ? favoritesFirst(SERVICES.filter((s) => matchesQuery(s, q))) : [];
  const saved = favorites.ids.map((id) => SERVICE_BY_ID[id]).filter((s): s is Service => Boolean(s));
  const savedShown = saved.filter((s) => matchesQuery(s, q));

  return (
    <Panel className="@container p-4 sm:p-6">
      <StepHeading
        ctx={ctx}
        title="Choose a platform"
        description="Where would you like to grow? Or search for a service directly."
      />
      <div className="mt-5">
        <SearchField
          id="platform-search"
          label={browsing ? "Search platforms or services" : "Search your favorites"}
          value={query}
          onChange={setQuery}
          placeholder={browsing ? "Search platforms or services, e.g. “YouTube views”" : "Search your favorites"}
        />
      </div>

      <div className="mt-3 flex gap-2" role="group" aria-label="Show">
        <button type="button" aria-pressed={browsing} onClick={() => setView("browse")} className={cn(chipClass, browsing && chipOnClass)}>
          All services
        </button>
        <button type="button" aria-pressed={!browsing} onClick={() => setView("favorites")} className={cn(chipClass, !browsing && chipOnClass)}>
          <Heart className={cn("size-3.5", saved.length && "fill-current", browsing && saved.length && "text-primary")} aria-hidden />
          Favorites <span className="text-xs tabular-nums">{saved.length}</span>
        </button>
      </div>

      {!browsing ? (
        <div className="mt-5">
          {savedShown.length ? (
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2" aria-label="Favorite services">
              {savedShown.map((s) => (
                <li key={s.id}>
                  <CompactService service={s} onSelect={() => ctx.chooseService(s, true)} />
                </li>
              ))}
            </ul>
          ) : saved.length ? (
            <Empty title={`No favorites match “${query.trim()}”`} hint="Try another word." onReset={() => setQuery("")} />
          ) : (
            <FavoritesEmpty
              title="Your favorites will appear here."
              hint="Save services you use often for faster ordering."
              action={
                <button
                  type="button"
                  onClick={() => setView("browse")}
                  className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
                >
                  Explore Services <ArrowRight className="size-4" aria-hidden />
                </button>
              }
            />
          )}
        </div>
      ) : null}

      {browsing && !q ? <FinderPrompt className="mt-4" /> : null}

      {browsing && !q ? (
        <div className="mt-4">
          <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Popular services</p>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
            {POPULAR.map((s) => {
              const p = PLATFORM_BY_ID[s.platformId];
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => ctx.chooseService(s, true)}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border bg-card pe-3.5 ps-1.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-secondary/40 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
                >
                  <span className="grid size-6 place-items-center rounded-full" style={{ backgroundColor: p.color, color: p.ink }}>
                    <PlatformIcon icon={p.icon} className="size-3.5" />
                  </span>
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {platforms.length ? (
        <>
          {q ? <p className="mt-6 text-xs font-bold tracking-wider text-muted-foreground uppercase">Platforms</p> : null}
          {/* Columns follow the panel width, so they adapt when the checkout panel or sidebar takes space */}
          <ul className={cn("grid grid-cols-2 gap-2 @xl:grid-cols-3 @xl:gap-3 @4xl:grid-cols-4", q ? "mt-2" : "mt-6")}>
            {platforms.map((p) => (
              <li key={p.id}>
                <PlatformCard platform={p} selected={ctx.platform?.id === p.id} onSelect={() => ctx.choosePlatform(p.id)} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {q && services.length ? (
        <>
          <p className="mt-6 text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Services · {services.length} match{services.length === 1 ? "" : "es"}
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {services.slice(0, 8).map((s) => (
              <li key={s.id}>
                <CompactService service={s} onSelect={() => ctx.chooseService(s, true)} />
              </li>
            ))}
          </ul>
          {services.length > 8 ? (
            <p className="mt-3 text-xs text-muted-foreground">Showing 8 of {services.length}. Add a word to narrow it down.</p>
          ) : null}
        </>
      ) : null}

      {browsing && q && !platforms.length && !services.length ? (
        <div className="mt-6">
          <Empty title={`Nothing matches “${query.trim()}”`} hint="Try a platform name or a service like “followers”." onReset={() => setQuery("")} />
        </div>
      ) : null}
    </Panel>
  );
}

/** Near-black brand colours glow violet instead, so the accent stays visible. */
const accentOf = (p: Platform) => (/^#(0|1|2)[0-9a-f]{5}$/i.test(p.color) ? "#7047EB" : p.color);

function PlatformCard({ platform, selected, onSelect }: { platform: Platform; selected: boolean; onSelect: () => void }) {
  const total = SERVICE_COUNT[platform.id];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ "--brand": accentOf(platform) } as React.CSSProperties}
      className={cn(
        "group relative isolate flex h-full min-h-[4.25rem] w-full items-center gap-3 overflow-hidden rounded-2xl border bg-card p-2.5 pe-3 text-start transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--brand)_40%,var(--border))] hover:shadow-soft focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:min-h-[4.75rem] sm:gap-3.5 sm:p-3 sm:pe-3.5",
        selected && "border-primary bg-secondary/50 ring-1 ring-primary hover:border-primary",
      )}
    >
      {/* Soft brand-coloured light that appears on hover */}
      <span
        className={cn(
          "pointer-events-none absolute -top-10 -start-10 -z-10 size-28 rounded-full bg-(--brand) opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-[0.14]",
          selected && "opacity-[0.1]",
        )}
        aria-hidden
      />
      <PlatformTile
        platform={platform}
        size="md"
        className="size-10 rounded-xl transition-transform duration-200 group-hover:scale-105 motion-reduce:group-hover:scale-100 sm:size-11"
      />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[0.88rem] leading-tight font-semibold text-balance break-words sm:text-[0.95rem]">
          {platform.name}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          {total} service{total === 1 ? "" : "s"}
        </span>
      </span>
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full transition-all duration-200",
          selected
            ? "bg-primary text-primary-foreground"
            : "-translate-x-1 text-muted-foreground opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 max-sm:hidden",
        )}
        aria-hidden
      >
        {selected ? <Check className="size-3" strokeWidth={3.5} /> : <ArrowRight className="size-4" />}
      </span>
    </button>
  );
}

function CompactService({ service, onSelect }: { service: Service; onSelect: () => void }) {
  const p = PLATFORM_BY_ID[service.platformId];
  const Icon = CATEGORY_ICONS[service.category];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onSelect}
        className="group flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-start transition-colors hover:border-primary/35 hover:bg-secondary/30 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
      >
        <PlatformTile platform={p} size="sm" className="size-9" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{service.name}</span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Icon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {p.short} · {CATEGORY_META[service.category].label}
            </span>
          </span>
        </span>
        <ArrowRight className="ms-9 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
      </button>
      <FavoriteButton service={service} className="absolute top-1/2 end-9 -translate-y-1/2" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 2 · Service                                                          */
/* -------------------------------------------------------------------------- */

function ServiceStep({ ctx, platform }: StepProps & { platform: Platform }) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<ServiceCategory | "all" | "favorites">("all");
  const favorites = useFavorites();
  const favoritesFirst = useFavoritesFirst();
  const all = React.useMemo(() => favoritesFirst(SERVICES.filter((s) => s.platformId === platform.id)), [platform.id, favoritesFirst]);
  const categories = CATEGORY_ORDER.filter((c) => all.some((s) => s.category === c));
  const favoriteCount = all.filter((s) => favorites.has.has(s.id)).length;
  const inCategory = (s: Service) =>
    category === "all" || (category === "favorites" ? favorites.has.has(s.id) : s.category === category);
  const list = all.filter((s) => inCategory(s) && matchesQuery(s, query));

  const chip = chipClass;
  const chipOn = chipOnClass;

  return (
    <Panel className="p-4 sm:p-6">
      <StepHeading
       
        ctx={ctx}
       
        title="Choose a service"
        description={
          <span className="inline-flex items-center gap-2">
            <PlatformTile platform={platform} size="xs" />
            {all.length} {platform.name} services
          </span>
        }
        action={
          <button
            type="button"
            onClick={() => ctx.goTo(0)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            Change platform
          </button>
        }
      />

      <div className="mt-5">
        <SearchField
          id="service-search"
          label={`Search ${platform.name} services`}
          value={query}
          onChange={setQuery}
          placeholder={`Search ${platform.name} services`}
        />
      </div>

      {categories.length > 1 ? (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by type">
          <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")} className={cn(chip, category === "all" && chipOn)}>
            All <span className="text-xs opacity-60">{all.length}</span>
          </button>
          <button
            type="button"
            aria-pressed={category === "favorites"}
            onClick={() => setCategory(category === "favorites" ? "all" : "favorites")}
            className={cn(chip, category === "favorites" && chipOn)}
          >
            <Heart className={cn("size-3.5", favoriteCount && "fill-current", category !== "favorites" && favoriteCount && "text-primary")} aria-hidden />
            Favorites
            <span className="text-xs opacity-60">{favoriteCount}</span>
          </button>
          {categories.map((c) => {
            const Icon = CATEGORY_ICONS[c];
            const on = category === c;
            return (
              <button key={c} type="button" aria-pressed={on} onClick={() => setCategory(on ? "all" : c)} className={cn(chip, on && chipOn)}>
                <Icon className="size-3.5" aria-hidden />
                {CATEGORY_META[c].short}
                <span className="text-xs opacity-60">{all.filter((s) => s.category === c).length}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {list.length && list.every((s) => !s.price) ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0" aria-hidden />
          Pricing for these services is pending verification. You can still set up your order.
        </p>
      ) : null}

      {list.length ? (
        <ul className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3" aria-label={`${platform.name} services`}>
          {list.map((s) => (
            <li key={s.id}>
              <ServiceOption service={s} selected={ctx.service?.id === s.id} onSelect={() => ctx.chooseService(s)} onConfirm={() => ctx.chooseService(s, true)} />
            </li>
          ))}
        </ul>
      ) : category === "favorites" && !query.trim() ? (
        <div className="mt-5">
          <FavoritesEmpty
            title={`No ${platform.short} favorites yet`}
            hint="Tap the heart on a service to save it here for faster ordering."
            action={
              <button
                type="button"
                onClick={() => setCategory("all")}
                className="mt-3 inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold text-primary hover:bg-secondary"
              >
                Show all services
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-5">
          <Empty
            title="No services match"
            hint="Try another word or show every type."
            onReset={() => {
              setQuery("");
              setCategory("all");
            }}
          />
        </div>
      )}
    </Panel>
  );
}

function ServiceOption({
  service,
  selected,
  onSelect,
  onConfirm,
}: {
  service: Service;
  selected: boolean;
  onSelect: () => void;
  onConfirm: () => void;
}) {
  const Icon = CATEGORY_ICONS[service.category];
  const price = pricing(service, {});
  return (
    <div className="relative h-full">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onConfirm}
        className={cn(
          "group flex h-full w-full flex-col rounded-2xl border bg-card p-4 text-start transition-all hover:border-primary/40 hover:bg-secondary/20 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
          selected && "border-primary bg-secondary/50 ring-1 ring-primary hover:border-primary hover:bg-secondary/50",
        )}
      >
        <span className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
              selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/75",
            )}
            title={CATEGORY_META[service.category].label}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.95rem] leading-snug font-semibold">{service.name}</span>
            <span className="mt-1 line-clamp-2 block text-[0.82rem] leading-relaxed text-muted-foreground">{service.description}</span>
          </span>
          <span
            className={cn(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
              selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent group-hover:border-primary/50",
            )}
            aria-hidden
          >
            <Check className="size-3" strokeWidth={3.5} />
          </span>
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-3.5 pe-9 ps-12">
          <span className="sr-only">You&apos;ll provide:</span>
          {requirementsOf(service).map((r) => (
            <span key={r} className="rounded-md bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
              {r}
            </span>
          ))}
          {price ? (
            <span className="ms-auto text-xs font-semibold">{price.unit}</span>
          ) : (
            <span className="sr-only">. Pricing pending.</span>
          )}
        </span>
      </button>
      <FavoriteButton service={service} className="absolute end-2.5 bottom-2.5" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 3 · Configure                                                        */
/* -------------------------------------------------------------------------- */

function ConfigureStep({ ctx, service }: StepProps & { service: Service }) {
  const platform = PLATFORM_BY_ID[service.platformId];
  const fields = CATEGORY_FIELDS[service.category];
  const visibleErrors = fields.filter((f) => ctx.showError(f.id));

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5">
      <Panel className="p-4 sm:p-6">
        <StepHeading ctx={ctx} title="Add your details" description="Only what this service needs. Required fields are marked." />

        {/* On narrow screens the actions wrap below the name so long names stay readable */}
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border bg-muted/40 p-3 sm:flex-nowrap sm:p-3.5">
          <PlatformTile platform={platform} size="md" className="size-10 rounded-xl" />
          <div className="min-w-0 flex-1 basis-40">
            <p className="text-sm leading-snug font-semibold text-balance break-words sm:truncate">{service.name}</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground sm:mt-0 sm:truncate">
              {platform.name} · {CATEGORY_META[service.category].label}
            </p>
          </div>
          <div className="ms-auto flex shrink-0 items-center gap-3 max-sm:-me-1 max-sm:-mb-1">
            <FavoriteButton service={service} />
            <button
              type="button"
              onClick={() => ctx.goTo(1)}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              Change
            </button>
          </div>
        </div>

        {visibleErrors.length > 1 ? (
          <div role="alert" className="mt-4 flex gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/5 p-3.5 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <p>
              <span className="font-semibold">Please fix {visibleErrors.length} fields</span>{" "}
              <span className="text-muted-foreground">before reviewing your order.</span>
            </p>
          </div>
        ) : null}

        <form
          noValidate
          className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            ctx.next();
          }}
        >
          {fields.map((f) => (
            <FormField key={f.id} field={f} ctx={ctx} service={service} platform={platform} />
          ))}
          <button type="submit" className="sr-only">
            Review order
          </button>
        </form>
      </Panel>

      <ServiceNotes service={service} />
    </div>
  );
}

const inputClass =
  "w-full scroll-mt-24 scroll-mb-36 rounded-xl border bg-card px-3.5 text-[0.95rem] shadow-xs transition-colors outline-none placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/15";

function FormField({ field, ctx, service, platform }: { field: OrderField; ctx: FlowContext; service: Service; platform: Platform }) {
  const id = `field-${field.id}`;
  const value = ctx.values[field.id] ?? "";
  const error = ctx.showError(field.id) ? ctx.errors[field.id] : null;
  const warning = error ? null : fieldWarning(field, value, platform);
  const describedBy = [field.help && `${id}-help`, (error || warning) && `${id}-msg`].filter(Boolean).join(" ") || undefined;
  const wide = field.kind === "textarea" || field.kind === "link" || field.kind === "consent" || field.kind === "text";
  const common = {
    id,
    name: field.id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": field.required || undefined,
    onBlur: () => ctx.touch(field.id),
  } as const;

  if (field.kind === "consent") {
    return (
      <div className="sm:col-span-2">
        <label
          htmlFor={id}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-2xl border bg-card p-3.5 text-sm transition-colors hover:border-foreground/20",
            value && "border-primary/50 bg-secondary/30",
            error && "border-destructive",
          )}
        >
          <input
            {...common}
            type="checkbox"
            checked={value === "yes"}
            onChange={(e) => {
              ctx.setValue(field.id, e.target.checked ? "yes" : "");
              ctx.touch(field.id);
            }}
            className="mt-0.5 size-4 shrink-0 scroll-mb-36 accent-[var(--primary)]"
          />
          <span className="leading-relaxed">{field.label}</span>
        </label>
        <FieldMessage id={`${id}-msg`} error={error} warning={null} />
      </div>
    );
  }

  const control = (() => {
    switch (field.kind) {
      case "textarea":
        return (
          <textarea
            {...common}
            rows={3}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => ctx.setValue(field.id, e.target.value)}
            className={cn(inputClass, "min-h-24 resize-y py-3 leading-relaxed")}
          />
        );
      case "select":
        return (
          <div className="relative">
            <select
              {...common}
              value={value}
              onChange={(e) => {
                ctx.setValue(field.id, e.target.value);
                ctx.touch(field.id);
              }}
              className={cn(inputClass, "h-12 appearance-none pe-10", !value && "text-muted-foreground")}
            >
              <option value="">Select…</option>
              {field.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 end-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          </div>
        );
      case "budget":
        return (
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 start-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden>
              $
            </span>
            <input
              {...common}
              type="text"
              inputMode="decimal"
              value={value}
              placeholder={field.placeholder}
              onChange={(e) => ctx.setValue(field.id, e.target.value)}
              className={cn(inputClass, "h-12 ps-7 tabular-nums")}
            />
          </div>
        );
      case "quantity":
        return (
          <input
            {...common}
            type="text"
            inputMode="numeric"
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => ctx.setValue(field.id, e.target.value)}
            className={cn(inputClass, "h-12 tabular-nums")}
          />
        );
      default:
        return (
          <input
            {...common}
            type={field.kind === "link" ? "url" : field.kind === "date" ? "date" : "text"}
            inputMode={field.kind === "link" ? "url" : undefined}
            autoCapitalize={field.kind === "link" ? "none" : undefined}
            spellCheck={field.kind === "link" ? false : undefined}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => ctx.setValue(field.id, e.target.value)}
            className={cn(inputClass, "h-12")}
          />
        );
    }
  })();

  const limits = field.kind === "quantity" ? service.limits : null;

  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {field.label}
        </label>
        <span className="text-[0.7rem] font-medium text-muted-foreground">{field.required ? "Required" : "Optional"}</span>
      </div>
      {control}
      {field.help || limits ? (
        <p id={`${id}-help`} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {limits ? `Between ${count(limits.min)} and ${count(limits.max)}. ` : ""}
          {field.help}
        </p>
      ) : null}
      <FieldMessage id={`${id}-msg`} error={error} warning={warning} />
    </div>
  );
}

function FieldMessage({ id, error, warning }: { id: string; error: string | null; warning: string | null }) {
  if (!error && !warning) return null;
  return (
    <p id={id} role={error ? "alert" : undefined} className={cn("mt-1.5 flex items-start gap-1.5 text-xs font-medium", error ? "text-destructive" : "text-soon")}>
      {error ? <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> : <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
      {error ?? warning}
    </p>
  );
}

/** Delivery notes without the pricing line, which the checkout status already covers. */
const deliveryNotes = (s: Service) => CATEGORY_DELIVERY[s.category].filter((n) => !n.startsWith("Ordering opens"));

function NotesList({ service }: { service: Service }) {
  return (
    <ul className="space-y-2 text-sm text-muted-foreground">
      {deliveryNotes(service).map((n) => (
        <li key={n} className="flex gap-2.5">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
          {n}
        </li>
      ))}
      <li className="flex gap-2.5">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-foreground/70" aria-hidden />
        <span>
          <span className="font-semibold text-foreground">We never ask for your password.</span> Only share public links.
        </span>
      </li>
    </ul>
  );
}

function ServiceNotes({ service, className }: { service: Service; className?: string }) {
  return (
    <Panel className={cn("p-4 sm:p-5", className)} aria-labelledby="notes-title">
      <h3 id="notes-title" className="mb-3 flex items-center gap-2 text-sm font-bold">
        <ShieldCheck className="size-4 text-primary" aria-hidden /> Before you order
      </h3>
      <NotesList service={service} />
    </Panel>
  );
}

function ReviewStep({ ctx, service }: StepProps & { service: Service }) {
  const platform = PLATFORM_BY_ID[service.platformId];
  const fields = CATEGORY_FIELDS[service.category];
  const price = pricing(service, ctx.values);

  const editBtn = (to: Step, label: string) => (
    <button
      type="button"
      onClick={() => ctx.goTo(to)}
      aria-label={label}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
    >
      <Pencil className="size-3.5" aria-hidden /> Edit
    </button>
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5">
      <Panel className="overflow-hidden">
        <div className="p-4 sm:p-6">
          <StepHeading ctx={ctx} title="Review your order" description="Check everything before you place it." />
        </div>

        <section className="border-t px-4 py-4 sm:px-6" aria-labelledby="review-service">
          <div className="flex items-center justify-between gap-3">
            <h3 id="review-service" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Service
            </h3>
            {editBtn(1, "Edit service")}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <PlatformTile platform={platform} size="md" className="size-10 rounded-xl" />
            <div className="min-w-0">
              <p className="font-semibold">{service.name}</p>
              <p className="text-sm text-muted-foreground">
                {platform.name} · {CATEGORY_META[service.category].label}
              </p>
            </div>
          </div>
        </section>

        <section className="border-t px-4 py-4 sm:px-6" aria-labelledby="review-details">
          <div className="flex items-center justify-between gap-3">
            <h3 id="review-details" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Details
            </h3>
            {editBtn(2, "Edit details")}
          </div>
          <dl className="mt-2 divide-y">
            {fields.map((f) => {
              const v = displayValue(f, ctx.values[f.id]);
              if (!v && !f.required) return null;
              return (
                <div key={f.id} className="grid grid-cols-1 gap-0.5 py-2.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-sm text-muted-foreground">{f.kind === "consent" ? "Confirmation" : f.label}</dt>
                  <dd className={cn("text-sm font-medium break-words whitespace-pre-line", f.kind === "link" && "font-mono text-[0.8rem]")}>{v}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        <section className="border-t bg-muted/30 px-4 py-4 sm:px-6" aria-labelledby="review-price">
          <h3 id="review-price" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Price
          </h3>
          <PriceRows service={service} values={ctx.values} className="mt-2" />
        </section>
      </Panel>

      {/* One consolidated notice: checkout status first, then what to know about the service */}
      <Panel className="overflow-hidden" aria-labelledby="before-title">
        <div className="flex gap-3 border-b border-soon/20 bg-soon-soft/50 p-4 sm:p-5">
          <Info className="mt-0.5 size-5 shrink-0 text-soon" aria-hidden />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">
              {price ? "Checkout isn't open yet" : "Pricing pending — ordering isn't open for this service yet"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {price ? "" : "Pricing, fulfilment and compliance are still being verified. "}
              No order will be created and your balance won&apos;t change.
            </p>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <h3 id="before-title" className="mb-3 flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="size-4 text-primary" aria-hidden /> Before you place this order
          </h3>
          <NotesList service={service} />
        </div>
      </Panel>
    </div>
  );
}

function PriceRows({ service, values, className }: { service: Service | null; values: Values; className?: string }) {
  const price = pricing(service, values);
  const qtyBased = service ? isQuantityBased(service.category) : true;
  const amountLabel = qtyBased ? "Quantity" : "Campaign budget";
  const amountValue = qtyBased
    ? displayValue({ id: "quantity", label: "", kind: "quantity", required: true }, values.quantity)
    : displayValue({ id: "budget", label: "", kind: "budget", required: true }, values.budget);

  return (
    <dl className={cn("space-y-2 text-sm", className)}>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">{amountLabel}</dt>
        <dd className="font-medium tabular-nums">{amountValue ?? "—"}</dd>
      </div>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">Unit price</dt>
        <dd>{service ? price ? <span className="font-medium">{price.unit}</span> : <PricingPending /> : "—"}</dd>
      </div>
      <div className="flex items-center justify-between gap-3 border-t pt-2.5">
        <dt className="font-semibold">Total</dt>
        <dd className="font-heading text-base font-extrabold tabular-nums">
          {service ? price?.total ?? <PricingPending /> : "—"}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-3">
        <dt className="flex items-center gap-1.5 text-muted-foreground">
          Available balance <DemoTag className="h-4 px-1.5 text-[0.55rem] text-muted-foreground">Demo</DemoTag>
        </dt>
        <dd className="font-medium tabular-nums"><WalletBalance /></dd>
      </div>
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/*  Summary & actions                                                         */
/* -------------------------------------------------------------------------- */

const ACTION_LABEL = ["Continue", "Continue to details", "Review order", "Place order"] as const;
const COMPACT_LABEL = ["Continue", "Continue", "Review", "Place order"] as const;

function actionState(ctx: FlowContext) {
  switch (ctx.step) {
    case 0:
      return { disabled: !ctx.platform, hint: ctx.platform ? null : "Select a platform to continue." };
    case 1:
      return { disabled: !ctx.service, hint: ctx.service ? null : "Select a service to continue." };
    case 2:
      return { disabled: false, hint: null };
    default:
      return {
        disabled: true,
        hint: ctx.service?.price ? "Checkout isn't open yet — nothing is charged." : "Pricing pending — ordering opens once this service is verified.",
      };
  }
}

function PrimaryAction({ ctx, compact, className }: { ctx: FlowContext; compact?: boolean; className?: string }) {
  const { disabled } = actionState(ctx);
  const review = ctx.step === 3;
  return (
    <button
      type="button"
      onClick={ctx.next}
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[0.95rem] font-semibold whitespace-nowrap text-primary-foreground shadow-[0_10px_28px_-12px_rgb(112_71_235/0.8)] transition-all hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
        className,
      )}
    >
      {review ? <Lock className="size-4" aria-hidden /> : null}
      {(compact ? COMPACT_LABEL : ACTION_LABEL)[ctx.step]}
      {review ? null : <ArrowRight className="size-4" aria-hidden />}
    </button>
  );
}

function SelectionLine({ ctx }: { ctx: FlowContext }) {
  if (!ctx.platform) {
    return (
      <div className="flex items-center gap-3">
        <span className="size-9 shrink-0 rounded-xl border-2 border-dashed" aria-hidden />
        <p className="text-sm text-muted-foreground">Pick a platform and service to begin.</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <PlatformTile platform={ctx.platform} size="sm" className="size-9 rounded-xl" />
      <div className="min-w-0">
        <p className={cn("truncate text-sm font-semibold", !ctx.service && "text-muted-foreground")}>
          {ctx.service?.name ?? "Choose a service"}
        </p>
        <p className="truncate text-xs text-muted-foreground">{ctx.platform.name}</p>
      </div>
    </div>
  );
}

/** Compact checkout status. The Review step holds the full summary. */
function SummaryCard({ ctx }: { ctx: FlowContext }) {
  const { hint } = actionState(ctx);
  const price = pricing(ctx.service, ctx.values);
  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-bold">Checkout</h2>
        <span className="text-xs text-muted-foreground">
          Step {ctx.step + 1} of {STEPS.length}
        </span>
      </div>

      <div className="mt-4 rounded-2xl bg-muted/50 p-3">
        <SelectionLine ctx={ctx} />
      </div>

      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="font-semibold">Total</dt>
          <dd className="font-heading font-extrabold tabular-nums">
            {ctx.service ? price?.total ?? <PricingPending /> : <span className="font-sans font-medium text-muted-foreground">—</span>}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            Balance <DemoTag className="h-4 px-1.5 text-[0.55rem] text-muted-foreground">Demo</DemoTag>
          </dt>
          <dd className="font-medium tabular-nums"><WalletBalance /></dd>
        </div>
      </dl>

      <div className="mt-5 flex gap-2">
        {ctx.step > 0 ? (
          <button
            type="button"
            onClick={ctx.back}
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            Back
          </button>
        ) : null}
        <PrimaryAction ctx={ctx} className="flex-1" />
      </div>
      {hint ? <p className="mt-2.5 text-center text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      <p className="mt-3 flex items-center justify-center gap-1.5 border-t pt-3 text-[0.7rem] text-muted-foreground">
        <Lock className="size-3" aria-hidden /> No payment is taken in this preview.
      </p>
      <FxNote className="mt-1.5 justify-center" />
    </Panel>
  );
}

const FIELD_SELECTOR = "input:not([type=checkbox]):not([type=radio]), textarea, select";

/** True while a text field has focus on a touch device, when the on-screen keyboard is likely open. */
function useEditingOnTouch() {
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const check = () =>
      // Wait a frame so moving between fields doesn't flicker the bar.
      requestAnimationFrame(() => {
        const el = document.activeElement;
        setEditing(coarse.matches && el instanceof HTMLElement && el.matches(FIELD_SELECTOR));
      });
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
    };
  }, []);
  return editing;
}

function MobileActionBar({ ctx }: { ctx: FlowContext }) {
  const { hint } = actionState(ctx);
  const editing = useEditingOnTouch();
  const line = ctx.service ? ctx.service.name : ctx.platform ? ctx.platform.name : "Nothing selected yet";
  return (
    <>
      {/* Keeps the last card clear of the fixed bar */}
      <div className="h-28 xl:hidden" aria-hidden />
      <div
        inert={editing}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl transition-transform duration-200 motion-reduce:transition-none lg:left-(--sidebar) xl:hidden rtl:lg:left-0! rtl:lg:right-(--sidebar)!",
          editing && "translate-y-full",
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {ctx.step > 0 ? (
            <button
              type="button"
              onClick={ctx.back}
              aria-label="Back"
              className="grid size-12 shrink-0 place-items-center rounded-full border bg-card transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{line}</p>
            <p className="truncate text-xs text-muted-foreground">
              {hint ?? (ctx.service && !ctx.service.price ? "Pricing pending" : `Step ${ctx.step + 1} of ${STEPS.length}`)}
            </p>
          </div>
          <PrimaryAction ctx={ctx} compact className="px-5" />
        </div>
      </div>
    </>
  );
}
