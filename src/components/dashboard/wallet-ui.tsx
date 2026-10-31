"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, Clock3, Eye, EyeOff, Globe, Landmark, Plus, Smartphone, Wallet } from "lucide-react";
import { DEMO_WALLET, money, usd, WALLET_SUMMARY } from "@/lib/demo-account";
import { formatMoneyParts } from "@/lib/i18n";
import { useLiveAccount } from "./live-account";
import { FxNote } from "./region";
import { ASSET_BY_SYMBOL, NETWORKS } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { DemoTag, newOrderHref, ROUTES, transactionsHref } from "./shared";

/* -------------------------------------------------------------------------- */
/*  Coin marks — simplified, drawn in white on each asset's brand colour      */
/* -------------------------------------------------------------------------- */

const glyph = { fill: "none", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Letter({ children, size = 12 }: { children: string; size?: number }) {
  return (
    <text x="16" y="16.5" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={size} fontWeight={800} fontFamily="var(--font-heading), system-ui, sans-serif">
      {children}
    </text>
  );
}

const GLYPHS: Record<string, React.ReactNode> = {
  BTC: (
    <>
      <Letter size={15}>B</Letter>
      <path d="M14 7.5v2.2M17.5 7.5v2.2M14 22.3v2.2M17.5 22.3v2.2" {...glyph} strokeWidth={1.8} />
    </>
  ),
  ETH: (
    <>
      <path d="M16 6 9.8 16.3 16 20l6.2-3.7Z" fill="#fff" fillOpacity={0.9} />
      <path d="M16 21.4 9.8 17.6 16 26l6.2-8.4Z" fill="#fff" fillOpacity={0.65} />
    </>
  ),
  USDT: (
    <>
      <path d="M10 9.5h12M16 9.5v13" {...glyph} strokeWidth={2.6} />
      <ellipse cx="16" cy="15" rx="7.2" ry="2.1" {...glyph} strokeWidth={1.6} />
    </>
  ),
  USDC: (
    <>
      <path d="M11.5 9.5a8 8 0 0 0 0 13M20.5 9.5a8 8 0 0 1 0 13" {...glyph} strokeWidth={1.7} />
      <Letter size={11}>$</Letter>
    </>
  ),
  SOL: (
    <path d="M11 10.5h11.5L21 12.5H9.5ZM11 15h11.5L21 17H9.5ZM9.5 19.5H21l1.5 2H11Z" fill="#fff" transform="translate(0 -0.5)" />
  ),
  BNB: (
    <path
      d="m16 8.5 2.4 2.4-2.4 2.4-2.4-2.4Zm-4.7 4.7 2.4 2.4-2.4 2.4-2.4-2.4Zm9.4 0 2.4 2.4-2.4 2.4-2.4-2.4ZM16 17.9l2.4 2.4-2.4 2.4-2.4-2.4Zm0-4.6 2.3 2.3-2.3 2.3-2.3-2.3Z"
      fill="#fff"
    />
  ),
  TRX: <path d="M9 9.5 23 12l-8 11.5Zm0 0 6 14M23 12l-8 3.5" {...glyph} strokeWidth={1.6} />,
  LTC: <Letter size={15}>Ł</Letter>,
  XRP: <path d="M10 9.5c2 2 4 3.5 6 3.5s4-1.5 6-3.5M10 22.5c2-2 4-3.5 6-3.5s4 1.5 6 3.5" {...glyph} strokeWidth={2.2} />,
  DOGE: <Letter size={15}>Ð</Letter>,
  BCH: (
    <g transform="rotate(-14 16 16)">
      <Letter size={15}>B</Letter>
      <path d="M14 7.5v2.2M17.5 7.5v2.2M14 22.3v2.2M17.5 22.3v2.2" {...glyph} strokeWidth={1.8} />
    </g>
  ),
  POL: <path d="m12.5 11.2-3.5 2v4.2l3.5 2 3.5-2v-4.2Zm7 1.4-3.5 2v4.2l3.5 2 3.5-2v-4.2Z" {...glyph} strokeWidth={1.7} />,
  AVAX: <path d="M16 8.5 23.5 22h-5l-2.5-4.6L13.5 22h-5Z" fill="#fff" />,
  ADA: (
    <g fill="#fff">
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle key={a} cx={16 + 6.5 * Math.cos((a * Math.PI) / 180)} cy={16 + 6.5 * Math.sin((a * Math.PI) / 180)} r="1.7" />
      ))}
      <circle cx="16" cy="16" r="2.4" />
    </g>
  ),
  TON: <path d="M9.5 10.5h13L16 23.5Zm6.5 0v13" {...glyph} strokeWidth={1.9} />,
  LINK: <path d="m16 7.8 7 4.1v8.2l-7 4.1-7-4.1v-8.2Z" {...glyph} strokeWidth={2.4} />,
  DAI: (
    <>
      <path d="M12 10h4.5a6 6 0 0 1 0 12H12Z" {...glyph} strokeWidth={2} />
      <path d="M9.5 14.5h13M9.5 17.5h13" {...glyph} strokeWidth={1.4} />
    </>
  ),
};

export function CryptoIcon({ symbol, className }: { symbol: string; className?: string }) {
  const asset = ASSET_BY_SYMBOL[symbol];
  return (
    <svg viewBox="0 0 32 32" className={cn("size-9 shrink-0", className)} aria-hidden>
      <circle cx="16" cy="16" r="16" fill={asset?.color ?? "#6b7280"} />
      {GLYPHS[symbol] ?? <Letter>{symbol.slice(0, 1)}</Letter>}
    </svg>
  );
}

/** Compact network label. For a coin's own chain it shows the chain name rather than a token standard. */
export function NetworkBadge({ networkId, asset, className }: { networkId: string; asset?: string; className?: string }) {
  const network = NETWORKS[networkId];
  if (!network) return null;
  const label = asset && ASSET_BY_SYMBOL[asset]?.native === networkId ? network.name : network.short;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border bg-card px-1.5 text-[0.68rem] font-semibold whitespace-nowrap text-foreground/80",
        className,
      )}
    >
      <span className="size-1.5 rounded-full" style={{ background: network.color }} aria-hidden />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Payment method marks                                                      */
/* -------------------------------------------------------------------------- */

export function MethodMark({ id, className }: { id: string; className?: string }) {
  const box = cn("grid h-9 w-12 shrink-0 place-items-center rounded-lg border bg-card", className);
  if (id === "card") {
    return (
      <span className={box} aria-hidden>
        <svg viewBox="0 0 36 22" className="h-5 w-8">
          <circle cx="13" cy="11" r="8" fill="#EB001B" />
          <circle cx="23" cy="11" r="8" fill="#F79E1B" fillOpacity={0.9} />
          <path d="M18 4.8a8 8 0 0 1 0 12.4 8 8 0 0 1 0-12.4Z" fill="#FF5F00" />
        </svg>
      </span>
    );
  }
  if (id === "paypal") {
    return (
      <span className={cn(box, "font-heading text-[0.7rem] font-extrabold italic")} aria-hidden>
        <span>
          <span className="text-[#003087] dark:text-[#6c9cff]">Pay</span>
          <span className="text-[#009CDE]">Pal</span>
        </span>
      </span>
    );
  }
  const Icon = id === "bank" ? Landmark : id === "wallets" ? Smartphone : id === "balance" ? Wallet : Globe;
  return (
    <span className={cn(box, "text-foreground/70")} aria-hidden>
      <Icon className="size-[1.05rem]" />
    </span>
  );
}

/** Small Visa wordmark used next to the card mark. */
export function VisaMark() {
  return (
    <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg border bg-card" aria-hidden>
      <span className="font-heading text-[0.78rem] font-extrabold tracking-tight text-[#1A1F71] italic dark:text-[#8ea2ff]">VISA</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Balance card                                                              */
/* -------------------------------------------------------------------------- */

/** Compact wallet card for Add Funds. Same graphite language as the Overview wallet. */
export function BalanceCard({ className }: { className?: string }) {
  const [hidden, setHidden] = React.useState(false);
  // Live mode: the real ledger balance, always in USD (no display conversion for real money).
  const live = useLiveAccount();
  const demoParts = formatMoneyParts(DEMO_WALLET.balance);
  const liveText = live ? usd(live.wallet.availableCents / 100) : "";
  const { main: whole, rest: cents } = live ? { main: liveText.replace(/.d+$/, ""), rest: liveText.match(/.d+$/)?.[0] ?? "" } : demoParts;
  const pendingAmount = live ? live.wallet.pendingCents / 100 : WALLET_SUMMARY.pending.count ? WALLET_SUMMARY.pending.amount : 0;
  const link =
    "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:outline-none";

  return (
    <section
      aria-labelledby="balance-title"
      className={cn(
        "relative isolate overflow-hidden rounded-3xl bg-graphite p-5 text-white shadow-float sm:p-6 dark:bg-[#17181e] dark:ring-1 dark:ring-white/10",
        className,
      )}
    >
      <div className="pointer-events-none absolute -end-16 -bottom-28 -z-10 size-64 rounded-full bg-lime/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -top-28 -start-12 -z-10 size-56 rounded-full bg-primary/35 blur-3xl" aria-hidden />
      <svg className="pointer-events-none absolute -top-20 -end-10 -z-10 size-56 text-white/[0.07]" viewBox="0 0 200 200" aria-hidden>
        {[30, 50, 70, 90].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="1" />
        ))}
      </svg>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 id="balance-title" className="flex items-center gap-2 text-sm font-semibold text-white/75">
              <span className="grid size-7 place-items-center rounded-lg bg-white/10">
                <Wallet className="size-4 text-lime" aria-hidden />
              </span>
              Available balance
            </h2>
            <button
              type="button"
              onClick={() => setHidden((h) => !h)}
              aria-pressed={hidden}
              aria-label={hidden ? "Show balance" : "Hide balance"}
              className="grid size-8 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-lime/50 focus-visible:outline-none"
            >
              {hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
            </button>
          </div>
          <p className="mt-3 font-heading leading-none font-extrabold tracking-tight tabular-nums" aria-live="polite">
            {hidden ? (
              <span className="text-[2.4rem] text-white/80">
                <span className="sr-only">Balance hidden</span>
                <span aria-hidden>$•••••</span>
              </span>
            ) : (
              <>
                <span className="text-[2.4rem] sm:text-[2.75rem]">{whole}</span>
                <span className="text-xl text-white/55">{cents}</span>
              </>
            )}
          </p>
          {live ? (
            <p className="mt-2.5 text-xs text-white/55">USD · calculated from your account ledger</p>
          ) : (
            <>
              <p className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-white/55">
                <DemoTag className="text-white/60">Demo balance</DemoTag>
                No real funds are held.
              </p>
              <FxNote tone="inverse" className="mt-1.5" />
            </>
          )}
          {pendingAmount ? (
            <Link
              href={transactionsHref({ type: "deposit" })}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-dashed border-white/25 py-1 pe-3 ps-2.5 text-xs text-white/70 transition-colors hover:border-white/45 hover:text-white focus-visible:ring-2 focus-visible:ring-lime/50 focus-visible:outline-none"
            >
              <Clock3 className="size-3.5" aria-hidden />
              <span className="font-semibold text-white tabular-nums">{hidden ? "•••" : live ? usd(pendingAmount) : money(pendingAmount)}</span>
              Pending · Not credited
            </Link>
          ) : null}
        </div>

        <div className={cn("grid w-full gap-2 sm:w-auto sm:flex", live ? "grid-cols-1" : "grid-cols-2")}>
          <Link href={ROUTES.transactions!} className={cn(link, "bg-white/10 text-white hover:bg-white/15 focus-visible:ring-white/30")}>
            <ArrowLeftRight className="size-4" aria-hidden /> Transactions
          </Link>
          {live ? null : (
            <Link href={newOrderHref()} className={cn(link, "bg-lime text-graphite hover:bg-lime/90 focus-visible:ring-lime/50")}>
              <Plus className="size-4" strokeWidth={2.6} aria-hidden /> New Order
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
