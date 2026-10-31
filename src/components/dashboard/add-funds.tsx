"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bitcoin,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  CreditCard,
  FlaskConical,
  Info,
  Landmark,
  LayoutGrid,
  Lock,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usd } from "@/lib/demo-account";
import {
  ASSET_BY_SYMBOL,
  ASSET_GROUP_LABELS,
  type AssetGroup,
  CRYPTO_ASSETS,
  CRYPTO_FEES,
  type CryptoAsset,
  DEMO_QUOTES,
  DEPOSIT_LIMITS,
  METHOD_BY_ID,
  METHOD_STATUS_LABELS,
  NETWORKS,
  networkLabel,
  PAYMENT_CATEGORIES,
  PAYMENT_METHODS,
  type PaymentCategory,
  type PaymentMethod,
  QUICK_AMOUNTS,
} from "@/lib/payments";
import { useDisplay } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { savePaymentPreview } from "./demo-store";
import { useLiveAccount } from "./live-account";
import { LiveDepositDialog, LiveMethodsProvider, registryId, useLiveMethods, useMethodReadiness } from "./live-deposit";
import { DemoTag, enter, Panel, transactionsHref } from "./shared";
import { BalanceCard, CryptoIcon, MethodMark, NetworkBadge, VisaMark } from "./wallet-ui";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const CATEGORY_ICONS: Record<PaymentCategory, typeof Bitcoin> = {
  crypto: Bitcoin,
  card: CreditCard,
  bank: Landmark,
  other: LayoutGrid,
};

function parseAmount(raw: string) {
  const v = raw.trim();
  return /^\d+(\.\d{1,2})?$/.test(v) ? Number(v) : NaN;
}

function amountError(raw: string) {
  if (!raw.trim()) return "Enter an amount.";
  const n = parseAmount(raw);
  if (Number.isNaN(n)) return "Enter a valid amount, like 50 or 49.99.";
  if (n < DEPOSIT_LIMITS.min) return `The minimum deposit is ${usd(DEPOSIT_LIMITS.min)}.`;
  if (n > DEPOSIT_LIMITS.max) return `The maximum per deposit is ${usd(DEPOSIT_LIMITS.max)}.`;
  return null;
}

const formatCrypto = (n: number, symbol: string) =>
  `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n)} ${symbol}`;

/** Card-style radio: a real radio input, so arrow keys and screen readers work as expected. */
function RadioCard({
  name,
  value,
  checked,
  onChange,
  className,
  children,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  className?: string;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 transition-[border-color,box-shadow,background-color] duration-150 select-none hover:border-foreground/25 has-focus-visible:ring-3 has-focus-visible:ring-primary/25 motion-reduce:transition-none",
        checked && "border-primary bg-secondary/40 shadow-[0_0_0_1px_var(--color-primary)] hover:border-primary",
        className,
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" aria-label={label} />
      {children}
      <span
        className={cn(
          "absolute top-2.5 end-2.5 grid size-4.5 place-items-center rounded-full border-2 transition-colors",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
        )}
        aria-hidden
      >
        {checked ? <Check className="size-2.5" strokeWidth={4} /> : null}
      </span>
    </label>
  );
}

function StepTitle({ n, id, children, hint }: { n: number; id: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 id={id} className="flex items-center gap-2.5 text-base font-bold sm:text-[1.05rem]">
        <span className="grid size-6 place-items-center rounded-full bg-foreground text-[0.72rem] font-bold text-background" aria-hidden>
          {n}
        </span>
        {children}
      </h2>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AddFunds() {
  // Re-render when language, currency, time zone or date format change.
  useDisplay();
  const [amountText, setAmountText] = React.useState("50");
  const [amountTouched, setAmountTouched] = React.useState(false);
  const [category, setCategory] = React.useState<PaymentCategory>("crypto");
  const [asset, setAsset] = React.useState<string | null>(null);
  const [network, setNetwork] = React.useState<string | null>(null);
  const [methods, setMethods] = React.useState<Partial<Record<PaymentCategory, string>>>({ card: "card", bank: "bank" });
  const [allOpen, setAllOpen] = React.useState(false);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const amountRef = React.useRef<HTMLInputElement>(null);

  const amount = parseAmount(amountText);
  const error = amountError(amountText);
  const showError = amountTouched && error;
  const selectedAsset = asset ? ASSET_BY_SYMBOL[asset] : null;
  const method = category === "crypto" ? null : (methods[category] ? METHOD_BY_ID[methods[category]!] : null);

  // Live mode: what's usable comes from the server's payment-method registry, never from this page.
  const live = useLiveAccount();
  const methodsState = useMethodReadiness(Boolean(live));
  const liveMethod = live ? (methodsState.methods?.find((m) => m.id === registryId(category, method?.id ?? null)) ?? null) : null;
  const liveBlocker = !live
    ? null
    : methodsState.error
      ? methodsState.error
      : !methodsState.methods
        ? "Checking which payment methods are available…"
        : !liveMethod
          ? "This payment method isn't available yet."
          : !liveMethod.acceptingRequests
            ? (liveMethod.blockers[0] ?? "This payment method isn't available yet.")
            : null;

  const pickAsset = (symbol: string) => {
    setAsset(symbol);
    const a = ASSET_BY_SYMBOL[symbol];
    // A coin on a single chain has nothing to choose; otherwise the customer picks explicitly.
    setNetwork(a.networks.length === 1 ? a.networks[0] : null);
  };

  const missing = error
    ? "Enter an amount"
    : category === "crypto"
      ? !asset
        ? "Choose a coin"
        : !network
          ? "Choose a network"
          : null
      : !method
        ? "Choose a payment method"
        : null;

  const review = () => {
    if (error) {
      setAmountTouched(true);
      amountRef.current?.focus();
      return;
    }
    if (!missing && !liveBlocker) setCheckoutOpen(true);
  };

  const e = [0, 1, 2, 3].map(enter);

  return (
    <LiveMethodsProvider value={live ? methodsState : null}>
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className={cn("flex flex-wrap items-end justify-between gap-3", e[0].className)} style={e[0].style}>
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Add Funds</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">
            Choose how you&apos;d like to fund your account. Simple, flexible, and easy to manage.
          </p>
        </div>
        {live ? null : <DemoTag className="text-primary">Payments not live yet</DemoTag>}
      </header>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <BalanceCard className={e[1].className} />

          {/* 1 · Amount */}
          <Panel className={cn("p-4 sm:p-6", e[2].className)} style={e[2].style} aria-labelledby="amount-title">
            <StepTitle n={1} id="amount-title" hint={`${usd(DEPOSIT_LIMITS.min)} – ${usd(DEPOSIT_LIMITS.max)} per deposit`}>
              Choose amount
            </StepTitle>

            <fieldset className="mt-4">
              <legend className="sr-only">Quick amounts</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {QUICK_AMOUNTS.map((q) => {
                  const on = amount === q;
                  return (
                    <label
                      key={q}
                      className={cn(
                        "grid h-12 cursor-pointer place-items-center rounded-xl border bg-card font-heading text-[0.95rem] font-bold tabular-nums transition-colors select-none hover:border-foreground/25 has-focus-visible:ring-3 has-focus-visible:ring-primary/25",
                        on && "border-foreground bg-foreground text-background hover:border-foreground",
                      )}
                    >
                      <input
                        type="radio"
                        name="quick-amount"
                        value={q}
                        checked={on}
                        onChange={() => {
                          setAmountText(String(q));
                          setAmountTouched(true);
                        }}
                        className="sr-only"
                      />
                      ${q}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-4">
              <label htmlFor="amount" className="text-sm font-semibold">
                Or enter an amount
              </label>
              <div
                className={cn(
                  "mt-1.5 flex h-14 items-center gap-2 rounded-2xl border bg-card px-4 shadow-xs transition-colors focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-primary/15",
                  showError && "border-destructive/60 focus-within:border-destructive/60 focus-within:ring-destructive/15",
                )}
              >
                <span className="font-heading text-xl font-bold text-muted-foreground" aria-hidden>
                  $
                </span>
                <input
                  ref={amountRef}
                  id="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amountText}
                  onChange={(ev) => setAmountText(ev.target.value.replace(/[^\d.]/g, ""))}
                  onBlur={() => setAmountTouched(true)}
                  placeholder="0.00"
                  aria-invalid={Boolean(showError)}
                  aria-describedby="amount-help"
                  className="min-w-0 flex-1 bg-transparent font-heading text-2xl font-extrabold tabular-nums outline-none placeholder:text-muted-foreground/50"
                />
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">USD</span>
              </div>
              <p id="amount-help" className={cn("mt-1.5 text-xs", showError ? "font-medium text-destructive" : "text-muted-foreground")} aria-live="polite">
                {showError ? error : `Minimum ${usd(DEPOSIT_LIMITS.min)} · maximum ${usd(DEPOSIT_LIMITS.max)}.`}
              </p>
            </div>
          </Panel>

          {/* 2 · Method */}
          <Panel className={cn("p-4 sm:p-6", e[3].className)} style={e[3].style} aria-labelledby="method-title">
            <StepTitle n={2} id="method-title">
              Choose payment method
            </StepTitle>
            <MethodTabs value={category} onChange={setCategory} />

            <div
              role="tabpanel"
              id={`panel-${category}`}
              aria-labelledby={`tab-${category}`}
              tabIndex={0}
              className="mt-5 rounded-2xl focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
            >
              {category === "crypto" ? (
                <CryptoPicker
                  asset={selectedAsset}
                  network={network}
                  onAsset={pickAsset}
                  onNetwork={setNetwork}
                  onBrowse={() => setAllOpen(true)}
                />
              ) : (
                <MethodPicker
                  category={category}
                  value={methods[category] ?? null}
                  onChange={(id) => setMethods((m) => ({ ...m, [category]: id }))}
                />
              )}
            </div>
          </Panel>
        </div>

        <aside className="xl:sticky xl:top-24" aria-label="Payment summary">
          <Summary
            amount={error ? null : amount}
            category={category}
            asset={selectedAsset}
            network={network}
            method={method}
            missing={missing}
            onReview={review}
            live={Boolean(live)}
            blocker={liveBlocker}
          />
        </aside>
      </div>

      <AllCryptoDialog
        open={allOpen}
        onOpenChange={setAllOpen}
        selected={asset}
        onSelect={(s) => {
          pickAsset(s);
          setAllOpen(false);
        }}
      />

      {live && !error && !missing && liveMethod?.acceptingRequests ? (
        <LiveDepositDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} amount={amount} method={liveMethod} />
      ) : null}
      {!live && !error && !missing ? (
        <CheckoutPreview
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          amount={amount}
          category={category}
          asset={selectedAsset}
          network={network}
          method={method}
        />
      ) : null}
    </div>
    </LiveMethodsProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Method tabs                                                               */
/* -------------------------------------------------------------------------- */

function MethodTabs({ value, onChange }: { value: PaymentCategory; onChange: (c: PaymentCategory) => void }) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const onKeyDown = (ev: React.KeyboardEvent, i: number) => {
    const n = PAYMENT_CATEGORIES.length;
    const next = ev.key === "ArrowRight" ? (i + 1) % n : ev.key === "ArrowLeft" ? (i - 1 + n) % n : ev.key === "Home" ? 0 : ev.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    ev.preventDefault();
    const id = PAYMENT_CATEGORIES[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  return (
    <div role="tablist" aria-label="Payment method" className="mt-5 grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1">
      {PAYMENT_CATEGORIES.map((c, i) => {
        const on = value === c.id;
        const Icon = CATEGORY_ICONS[c.id];
        return (
          <button
            key={c.id}
            ref={(el) => {
              refs.current[c.id] = el;
            }}
            id={`tab-${c.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`panel-${c.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(c.id)}
            onKeyDown={(ev) => onKeyDown(ev, i)}
            className={cn(
              "relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[0.72rem] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none sm:flex-row sm:gap-2 sm:text-sm",
              on && "bg-card text-foreground shadow-sm",
            )}
          >
            <Icon className={cn("size-4 shrink-0", on && c.id === "crypto" && "text-primary")} aria-hidden />
            <span className="sm:hidden">{c.short}</span>
            <span className="hidden truncate sm:inline">{c.label}</span>
            {c.id === "crypto" ? (
              <span className="absolute -top-2 end-1 rounded-full bg-lime px-1.5 py-px text-[0.55rem] font-bold tracking-wide text-graphite uppercase ring-2 ring-muted sm:end-2">
                Featured
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Crypto                                                                    */
/* -------------------------------------------------------------------------- */

const POPULAR = CRYPTO_ASSETS.filter((a) => a.popular);

function CryptoPicker({
  asset,
  network,
  onAsset,
  onNetwork,
  onBrowse,
}: {
  asset: CryptoAsset | null;
  network: string | null;
  onAsset: (symbol: string) => void;
  onNetwork: (id: string) => void;
  onBrowse: () => void;
}) {
  const shown = asset && !asset.popular ? [asset, ...POPULAR] : POPULAR;

  return (
    <div className="space-y-6">
      <fieldset>
        <div className="flex items-center justify-between gap-3">
          <legend className="text-sm font-semibold">Coin</legend>
          <button
            type="button"
            onClick={onBrowse}
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            All cryptocurrencies <span className="text-muted-foreground tabular-nums">({CRYPTO_ASSETS.length})</span>
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">Popular coins first. Search the full list for more.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.map((a) => (
            <RadioCard key={a.symbol} name="coin" value={a.symbol} checked={asset?.symbol === a.symbol} onChange={() => onAsset(a.symbol)} className="pe-8">
              <CryptoIcon symbol={a.symbol} />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{a.symbol}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.name}</span>
              </span>
            </RadioCard>
          ))}
        </div>
      </fieldset>

      <NetworkPicker asset={asset} network={network} onNetwork={onNetwork} />
    </div>
  );
}

function NetworkPicker({
  asset,
  network,
  onNetwork,
}: {
  asset: CryptoAsset | null;
  network: string | null;
  onNetwork: (id: string) => void;
}) {
  const chosen = network ? NETWORKS[network] : null;

  return (
    <fieldset className="border-t pt-5">
      <legend className="sr-only">Network</legend>
      <p className="text-sm font-semibold" aria-hidden>
        Network
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {asset
          ? asset.networks.length === 1
            ? `${asset.symbol} only runs on ${NETWORKS[asset.networks[0]].name}, so there's nothing to choose.`
            : `${asset.symbol} is available on ${asset.networks.length} networks. Pick the one your wallet or exchange sends on.`
          : "Choose a coin first, then the blockchain you'll send it on."}
      </p>

      {asset ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {asset.networks.map((id) => {
            const n = NETWORKS[id];
            const label = networkLabel(asset, id);
            return (
              <RadioCard key={id} name="network" value={id} checked={network === id} onChange={() => onNetwork(id)} className="min-h-14 gap-2.5 py-2.5 pe-8 ps-2.5 sm:gap-3 sm:ps-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full font-heading text-[0.68rem] font-extrabold text-white sm:size-8" style={{ background: n.color }} aria-hidden>
                  {n.name.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.8rem] leading-tight font-semibold sm:truncate sm:text-sm">{n.name}</span>
                  {label ? <span className="block truncate text-xs text-muted-foreground">{label}</span> : null}
                </span>
              </RadioCard>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 grid h-16 place-items-center rounded-2xl border border-dashed text-sm text-muted-foreground">
          Networks appear after you choose a coin
        </div>
      )}

      {asset && chosen ? (
        <p className="mt-3 flex gap-2.5 rounded-2xl bg-soon-soft/60 p-3 text-[0.8rem] leading-relaxed">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-soon" aria-hidden />
          <span>
            Send <strong>{asset.symbol}</strong> only on <strong>{chosen.name}</strong>
            {asset.native !== chosen.id && chosen.standard ? ` (${chosen.standard})` : ""}. Coins sent on any other network
            can be lost permanently.
          </span>
        </p>
      ) : asset && asset.networks.length > 1 ? (
        <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          Networks are separate blockchains. Your wallet and our deposit must use the same one.
        </p>
      ) : null}
    </fieldset>
  );
}

function AllCryptoDialog({
  open,
  onOpenChange,
  selected,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string | null;
  onSelect: (symbol: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [group, setGroup] = React.useState<AssetGroup | "all">("all");
  const q = query.trim().toLowerCase();
  const list = CRYPTO_ASSETS.filter(
    (a) =>
      (group === "all" || a.group === group) &&
      (!q || a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.networks.some((n) => NETWORKS[n].name.toLowerCase().includes(q))),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setQuery("");
          setGroup("all");
        }
      }}
    >
      <DialogContent className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="border-b p-4 pb-3 sm:p-5 sm:pb-4">
          <DialogTitle className="font-heading text-lg font-bold">All cryptocurrencies</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Search by name, ticker or network.</DialogDescription>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="e.g. USDT, Solana, TRC-20"
              aria-label="Search cryptocurrencies"
              autoComplete="off"
              className="h-11 w-full rounded-xl border bg-card pe-3 ps-10 text-sm outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15"
            />
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto no-scrollbar" role="group" aria-label="Filter coins">
            {(Object.keys(ASSET_GROUP_LABELS) as (AssetGroup | "all")[]).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className={cn(
                  "h-8 shrink-0 rounded-full border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                  group === g && "border-foreground bg-foreground text-background hover:text-background",
                )}
              >
                {ASSET_GROUP_LABELS[g]}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <p className="sr-only" aria-live="polite">
            {list.length} {list.length === 1 ? "coin" : "coins"}
          </p>
          {list.length ? (
            <ul className="space-y-0.5">
              {list.map((a) => {
                const on = selected === a.symbol;
                return (
                  <li key={a.symbol}>
                    <button
                      type="button"
                      onClick={() => onSelect(a.symbol)}
                      aria-current={on ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                        on && "bg-secondary/60",
                      )}
                    >
                      <CryptoIcon symbol={a.symbol} className="size-8" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-bold">
                          {a.symbol}
                          <span className="truncate font-normal text-muted-foreground">{a.name}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {a.networks.slice(0, 3).map((n) => (
                            <NetworkBadge key={n} networkId={n} asset={a.symbol} />
                          ))}
                          {a.networks.length > 3 ? (
                            <span className="inline-flex h-5 items-center rounded-full bg-muted px-1.5 text-[0.68rem] font-semibold text-muted-foreground">
                              +{a.networks.length - 3}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      {on ? <Check className="size-4 shrink-0 text-primary" strokeWidth={2.6} aria-label="Selected" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="font-semibold">No coins match &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a ticker like BTC, or a network like Polygon.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setGroup("all");
                }}
                className="mt-3 text-sm font-semibold text-primary hover:underline"
              >
                Clear search
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card, bank & other methods                                                */
/* -------------------------------------------------------------------------- */

function MethodStatus({ method }: { method: PaymentMethod }) {
  const live = useLiveMethods();
  if (live) {
    const r = live.methods?.find((m) => m.id === registryId(method.category, method.id));
    const on = Boolean(r?.acceptingRequests);
    return (
      <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[0.65rem] font-bold whitespace-nowrap", on ? "bg-lime/25 text-graphite dark:text-lime" : "bg-muted text-muted-foreground")}>
        {on ? null : <Clock3 className="size-3" aria-hidden />}
        {!live.methods ? "Checking…" : on ? "Available" : r ? "Not available yet" : "Planned"}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[0.65rem] font-bold whitespace-nowrap",
        method.status === "awaiting" ? "bg-soon-soft text-soon" : "bg-muted text-muted-foreground",
      )}
    >
      <Clock3 className="size-3" aria-hidden />
      {METHOD_STATUS_LABELS[method.status]}
    </span>
  );
}

function MethodPicker({
  category,
  value,
  onChange,
}: {
  category: Exclude<PaymentCategory, "crypto">;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const list = PAYMENT_METHODS.filter((m) => m.category === category);
  const selected = list.find((m) => m.id === value) ?? null;

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="sr-only">{PAYMENT_CATEGORIES.find((c) => c.id === category)?.label}</legend>
        <div className={cn("grid grid-cols-1 gap-2", list.length > 1 && "sm:grid-cols-2")}>
          {list.map((m) => (
            <RadioCard key={m.id} name={`method-${category}`} value={m.id} checked={value === m.id} onChange={() => onChange(m.id)} className="items-start pe-9">
              <span className="flex shrink-0 gap-1">
                {m.id === "card" ? <VisaMark /> : null}
                <MethodMark id={m.id} />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
                  {m.name}
                  <MethodStatus method={m} />
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{m.description}</span>
              </span>
            </RadioCard>
          ))}
        </div>
      </fieldset>

      {selected ? (
        <div className="rounded-2xl border border-dashed p-4">
          <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">How it will work</p>
          <ol className="mt-2.5 space-y-2">
            {selected.steps.map((s, i) => (
              <li key={s} className="flex gap-2.5 text-sm">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[0.68rem] font-bold" aria-hidden>
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
            <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
            We never ask for card numbers, bank logins or passwords on this page.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Choose a method to see how it will work.</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Summary                                                                   */
/* -------------------------------------------------------------------------- */

interface PaymentChoice {
  category: PaymentCategory;
  asset: CryptoAsset | null;
  network: string | null;
  method: PaymentMethod | null;
}

/** Fees that are configured for this choice. `null` entries mean "not configured". */
function feesFor({ category, method }: PaymentChoice, amount: number) {
  if (category === "crypto") {
    return [
      { label: "Processing fee", value: CRYPTO_FEES.processingPct === null ? null : (amount * CRYPTO_FEES.processingPct) / 100 },
      { label: "Network fee", value: CRYPTO_FEES.networkUsd },
    ];
  }
  return [{ label: "Processing fee", value: method?.feeUsd ?? null }];
}

function quoteFor(asset: CryptoAsset | null, amount: number | null) {
  const rate = asset ? DEMO_QUOTES[asset.symbol] : undefined;
  return rate && amount ? amount / rate : null;
}

function PayWith({ category, asset, network, method }: PaymentChoice) {
  if (category === "crypto") {
    if (!asset) return <span className="text-muted-foreground">Not chosen</span>;
    return (
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        <CryptoIcon symbol={asset.symbol} className="size-5" />
        <span className="font-semibold">{asset.symbol}</span>
        {network ? <NetworkBadge networkId={network} asset={asset.symbol} /> : <span className="text-xs text-soon">Network needed</span>}
      </span>
    );
  }
  return method ? <span className="font-semibold">{method.name}</span> : <span className="text-muted-foreground">Not chosen</span>;
}

function Summary({
  amount,
  missing,
  onReview,
  live = false,
  blocker = null,
  ...choice
}: PaymentChoice & { amount: number | null; missing: string | null; onReview: () => void; live?: boolean; blocker?: string | null }) {
  const fees = feesFor(choice, amount ?? 0);
  const known = fees.every((f) => f.value !== null);
  const total = amount === null ? null : amount + fees.reduce((s, f) => s + (f.value ?? 0), 0);
  // Live mode never shows the illustrative quotes: there's no live rate source.
  const estimate = live ? null : quoteFor(choice.asset, amount);
  const blocked = Boolean(missing) || Boolean(blocker);

  return (
    <Panel className="overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">{live ? "Deposit summary" : "Payment summary"}</h2>
          {live ? null : <DemoTag className="text-muted-foreground">Preview</DemoTag>}
        </div>

        <p className="mt-4 text-xs font-medium text-muted-foreground">You deposit</p>
        <p className="font-heading text-[2.25rem] leading-tight font-extrabold tracking-tight tabular-nums" aria-live="polite">
          {amount === null ? <span className="text-muted-foreground/50">$0.00</span> : usd(amount)}
        </p>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Pay with</dt>
            <dd className="min-w-0 text-end">
              <PayWith {...choice} />
            </dd>
          </div>
          {choice.category === "crypto" && choice.network ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Network</dt>
              <dd className="text-end font-medium">{NETWORKS[choice.network].name}</dd>
            </div>
          ) : null}
          {choice.category === "crypto" && choice.asset ? (
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">You send (est.)</dt>
              <dd className="text-end">
                {estimate !== null ? (
                  <>
                    <span className="font-semibold tabular-nums">{formatCrypto(estimate, choice.asset.symbol)}</span>
                    <span className="block text-[0.7rem] text-muted-foreground">Demo quote, not a live rate</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{live ? "No rate available" : "Quoted at checkout"}</span>
                )}
              </dd>
            </div>
          ) : null}
          {fees.map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className={cn("text-end", f.value === null ? "text-muted-foreground" : "font-medium tabular-nums")}>
                {f.value === null ? "Not set yet" : usd(f.value)}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex items-baseline justify-between gap-3 border-t pt-4">
          <span className="text-sm font-semibold">Total payable</span>
          <span className="text-end">
            <span className="font-heading text-xl font-extrabold tabular-nums">{total === null ? "—" : usd(total)}</span>
            {!known && total !== null ? <span className="block text-[0.7rem] text-muted-foreground">Plus any fees, shown before you pay</span> : null}
          </span>
        </div>

        <button
          type="button"
          onClick={onReview}
          aria-describedby="summary-next"
          className={cn(
            "mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[0.95rem] font-semibold text-primary-foreground shadow-[0_10px_28px_-12px_rgb(112_71_235/0.8)] transition-all hover:-translate-y-px hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none active:translate-y-0",
            blocked && "bg-primary/45 shadow-none hover:translate-y-0 hover:bg-primary/45",
          )}
          aria-disabled={blocked}
        >
          {live ? "Review deposit request" : "Review payment"} <ArrowRight className="size-4" aria-hidden />
        </button>
        <p id="summary-next" className="mt-2 text-center text-xs text-muted-foreground" aria-live="polite">
          {missing ? `Next: ${missing.toLowerCase()}` : blocker ? blocker : "Ready to review"}
        </p>
      </div>

      <p className="flex gap-2 border-t bg-muted/40 px-5 py-3.5 text-xs leading-relaxed text-muted-foreground sm:px-6">
        <FlaskConical className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
        {live
          ? "A deposit request isn't a payment. Your balance changes only after the money arrives and two of our team verify it."
          : choice.category === "crypto"
            ? "Payment preview — live crypto deposits are not enabled yet. Your balance won't change."
            : "Payment preview — this method is awaiting integration. Your balance won't change."}
      </p>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inactive checkout preview                                                 */
/* -------------------------------------------------------------------------- */

function CheckoutPreview({
  open,
  onOpenChange,
  amount,
  ...choice
}: PaymentChoice & { open: boolean; onOpenChange: (open: boolean) => void; amount: number }) {
  const [saved, setSaved] = React.useState<string | null>(null);
  const { category, asset, network, method } = choice;
  const net = network ? NETWORKS[network] : null;
  const estimate = quoteFor(asset, amount);
  const steps = category === "crypto" && net ? ["Waiting for payment", `Confirming on ${net.name}`, "Added to balance"] : ["Waiting for payment", "Payment received", "Added to balance"];

  const save = () => {
    const id = savePaymentPreview(
      category === "crypto" ? { amount, category, asset: asset!.symbol, network: network! } : { amount, category, methodId: method!.id },
    );
    setSaved(id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setSaved(null);
      }}
    >
      <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-md">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative isolate overflow-hidden bg-graphite px-5 pt-5 pb-6 text-white dark:bg-[#17181e]">
            <div className="pointer-events-none absolute -top-20 -end-16 -z-10 size-56 rounded-full bg-primary/40 blur-3xl" aria-hidden />
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/10 px-2.5 text-[0.68rem] font-bold tracking-wider text-lime uppercase">
              <span className="size-1.5 rounded-full bg-lime" aria-hidden /> Inactive preview
            </span>
            <DialogTitle className="mt-3 font-heading text-lg font-bold text-white">Checkout preview</DialogTitle>
            <DialogDescription className="text-sm text-white/65">
              {category === "crypto"
                ? "Payment preview — live crypto deposits are not enabled yet."
                : `${method?.name} is awaiting integration. This is how checkout will look.`}
            </DialogDescription>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-white/55">Deposit</p>
                <p className="font-heading text-3xl font-extrabold tabular-nums">{usd(amount)}</p>
              </div>
              {category === "crypto" && asset ? (
                <div className="flex items-center gap-2 rounded-full bg-white/10 py-1 pe-3 ps-1">
                  <CryptoIcon symbol={asset.symbol} className="size-7" />
                  <span className="text-sm font-semibold">{asset.symbol}</span>
                  {net ? <span className="text-xs text-white/60">· {net.short}</span> : null}
                </div>
              ) : method ? (
                <MethodMark id={method.id} className="border-white/15 bg-white" />
              ) : null}
            </div>
          </div>

          <div className="space-y-4 p-5">
            {category === "crypto" && asset && net ? (
              <>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border text-sm">
                  <div className="bg-card p-3">
                    <dt className="text-xs text-muted-foreground">You send</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      {estimate !== null ? formatCrypto(estimate, asset.symbol) : "Quoted at checkout"}
                    </dd>
                    {estimate !== null ? <dd className="text-[0.68rem] text-muted-foreground">Demo quote</dd> : null}
                  </div>
                  <div className="bg-card p-3">
                    <dt className="text-xs text-muted-foreground">Network</dt>
                    <dd className="mt-0.5 font-semibold">{net.name}</dd>
                    {networkLabel(asset, net.id) ? <dd className="text-[0.68rem] text-muted-foreground">{networkLabel(asset, net.id)}</dd> : null}
                  </div>
                </dl>

                <div className="grid place-items-center gap-2 rounded-2xl border border-dashed bg-muted/40 px-5 py-6 text-center">
                  <span className="grid size-11 place-items-center rounded-xl bg-card text-muted-foreground shadow-xs">
                    <Lock className="size-5" aria-hidden />
                  </span>
                  <p className="text-sm font-semibold">Deposit address not available</p>
                  <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                    A unique address and QR code are only created once live crypto deposits are enabled. None has been
                    generated.
                  </p>
                </div>

                <p className="flex gap-2.5 rounded-2xl bg-soon-soft/60 p-3 text-[0.8rem] leading-relaxed">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-soon" aria-hidden />
                  <span>
                    When live, send only <strong>{asset.symbol}</strong> on <strong>{net.name}</strong>. Other coins or networks
                    can&apos;t be recovered.
                  </span>
                </p>
              </>
            ) : method ? (
              <div className="rounded-2xl border border-dashed p-4">
                <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Once {method.name} is live</p>
                <ol className="mt-2.5 space-y-2">
                  {method.steps.map((s, i) => (
                    <li key={s} className="flex gap-2.5 text-sm">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[0.68rem] font-bold" aria-hidden>
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <section aria-labelledby="pay-status">
              <h3 id="pay-status" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Payment status
              </h3>
              <ol className="mt-2.5 space-y-2">
                {steps.map((s) => (
                  <li key={s} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="size-2.5 rounded-full border-2 border-dashed border-muted-foreground/50" aria-hidden />
                    <span className="flex-1">{s}</span>
                    <span className="text-xs">Not started</span>
                  </li>
                ))}
              </ol>
            </section>

            <div role="status">
              {saved ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-dashed border-primary/40 p-3 text-sm">
                  <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    Preview <strong>{saved}</strong> saved. Nothing was charged or added to your balance.
                  </span>
                  <Link href={transactionsHref({ tx: saved })} className="font-semibold text-primary hover:underline">
                    View in Transactions
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled
            className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-muted text-sm font-semibold text-muted-foreground"
          >
            <Lock className="size-4" aria-hidden /> Payments unavailable — not enabled yet
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden /> Close
            </button>
            <button
              type="button"
              onClick={save}
              disabled={Boolean(saved)}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-primary/40 text-sm font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:border-border disabled:text-muted-foreground"
            >
              {saved ? <Check className="size-4" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
              {saved ? "Saved" : "Save preview"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
