/**
 * Payment configuration for Add Funds and Transactions.
 *
 * Nothing here talks to a payment provider. Limits, fees, quotes and method
 * availability are plain data so a real integration can switch them on later
 * without changing the UI. A value of `null` means "not configured" and the
 * interface says so instead of showing a number.
 */

export const DEPOSIT_LIMITS = { min: 10, max: 5000 };

export const QUICK_AMOUNTS = [10, 25, 50, 100, 250, 500];

/** Live deposits are off until a provider is approved and connected. */
export const PAYMENTS_LIVE = false;

/* -------------------------------------------------------------------------- */
/*  Networks                                                                  */
/* -------------------------------------------------------------------------- */

export interface Network {
  id: string;
  name: string;
  /** Compact label for badges. */
  short: string;
  /** Token standard on this chain, e.g. ERC-20. */
  standard?: string;
  color: string;
}

export const NETWORKS: Record<string, Network> = {
  ethereum: { id: "ethereum", name: "Ethereum", short: "ERC-20", standard: "ERC-20", color: "#627EEA" },
  tron: { id: "tron", name: "TRON", short: "TRC-20", standard: "TRC-20", color: "#EB0029" },
  bsc: { id: "bsc", name: "BNB Smart Chain", short: "BEP-20", standard: "BEP-20", color: "#F0B90B" },
  solana: { id: "solana", name: "Solana", short: "Solana", standard: "SPL", color: "#9945FF" },
  polygon: { id: "polygon", name: "Polygon", short: "Polygon", color: "#7B3FE4" },
  base: { id: "base", name: "Base", short: "Base", color: "#0052FF" },
  arbitrum: { id: "arbitrum", name: "Arbitrum One", short: "Arbitrum", color: "#28A0F0" },
  avalanche: { id: "avalanche", name: "Avalanche C-Chain", short: "Avalanche", color: "#E84142" },
  ton: { id: "ton", name: "TON", short: "TON", color: "#0098EA" },
  bitcoin: { id: "bitcoin", name: "Bitcoin", short: "Bitcoin", color: "#F7931A" },
  litecoin: { id: "litecoin", name: "Litecoin", short: "Litecoin", color: "#345D9D" },
  xrpl: { id: "xrpl", name: "XRP Ledger", short: "XRPL", color: "#23292F" },
  dogecoin: { id: "dogecoin", name: "Dogecoin", short: "Dogecoin", color: "#C2A633" },
  "bitcoin-cash": { id: "bitcoin-cash", name: "Bitcoin Cash", short: "BCH", color: "#0AC18E" },
  cardano: { id: "cardano", name: "Cardano", short: "Cardano", color: "#0033AD" },
};

/* -------------------------------------------------------------------------- */
/*  Crypto assets                                                             */
/* -------------------------------------------------------------------------- */

export type AssetGroup = "stablecoin" | "major" | "altcoin";

export interface CryptoAsset {
  symbol: string;
  name: string;
  group: AssetGroup;
  popular: boolean;
  color: string;
  /** The only networks we'd accept this asset on. Never assume others. */
  networks: string[];
  /** The asset's own chain, where it's the native coin. */
  native?: string;
}

export const CRYPTO_ASSETS: CryptoAsset[] = [
  { symbol: "USDT", name: "Tether", group: "stablecoin", popular: true, color: "#26A17B", networks: ["tron", "ethereum", "bsc", "solana", "polygon", "arbitrum", "avalanche", "ton"] },
  { symbol: "USDC", name: "USD Coin", group: "stablecoin", popular: true, color: "#2775CA", networks: ["ethereum", "solana", "base", "polygon", "arbitrum", "avalanche"] },
  { symbol: "BTC", name: "Bitcoin", group: "major", popular: true, color: "#F7931A", networks: ["bitcoin"], native: "bitcoin" },
  { symbol: "ETH", name: "Ethereum", group: "major", popular: true, color: "#627EEA", networks: ["ethereum", "base", "arbitrum"], native: "ethereum" },
  { symbol: "SOL", name: "Solana", group: "major", popular: true, color: "#9945FF", networks: ["solana"], native: "solana" },
  { symbol: "BNB", name: "BNB", group: "major", popular: true, color: "#F0B90B", networks: ["bsc"], native: "bsc" },
  { symbol: "TRX", name: "TRON", group: "altcoin", popular: false, color: "#EB0029", networks: ["tron"], native: "tron" },
  { symbol: "LTC", name: "Litecoin", group: "altcoin", popular: false, color: "#345D9D", networks: ["litecoin"], native: "litecoin" },
  { symbol: "XRP", name: "XRP", group: "altcoin", popular: false, color: "#23292F", networks: ["xrpl"], native: "xrpl" },
  { symbol: "DOGE", name: "Dogecoin", group: "altcoin", popular: false, color: "#C2A633", networks: ["dogecoin"], native: "dogecoin" },
  { symbol: "BCH", name: "Bitcoin Cash", group: "altcoin", popular: false, color: "#0AC18E", networks: ["bitcoin-cash"], native: "bitcoin-cash" },
  { symbol: "POL", name: "Polygon", group: "altcoin", popular: false, color: "#7B3FE4", networks: ["polygon", "ethereum"], native: "polygon" },
  { symbol: "AVAX", name: "Avalanche", group: "altcoin", popular: false, color: "#E84142", networks: ["avalanche"], native: "avalanche" },
  { symbol: "ADA", name: "Cardano", group: "altcoin", popular: false, color: "#0033AD", networks: ["cardano"], native: "cardano" },
  { symbol: "TON", name: "Toncoin", group: "altcoin", popular: false, color: "#0098EA", networks: ["ton"], native: "ton" },
  { symbol: "LINK", name: "Chainlink", group: "altcoin", popular: false, color: "#2A5ADA", networks: ["ethereum", "arbitrum"] },
  { symbol: "DAI", name: "Dai", group: "stablecoin", popular: false, color: "#F5AC37", networks: ["ethereum", "polygon", "arbitrum"] },
];

export const ASSET_BY_SYMBOL: Record<string, CryptoAsset> = Object.fromEntries(CRYPTO_ASSETS.map((a) => [a.symbol, a]));

export const ASSET_GROUP_LABELS: Record<AssetGroup | "all", string> = {
  all: "All",
  stablecoin: "Stablecoins",
  major: "Major coins",
  altcoin: "Altcoins",
};

/** The token standard for an asset on a network, e.g. "TRC-20", "Native coin", or null when there's nothing to add. */
export function networkLabel(asset: CryptoAsset, networkId: string) {
  if (asset.native === networkId) return "Native coin";
  return NETWORKS[networkId]?.standard ?? null;
}

/**
 * Demo quotes, USD per unit. Only stablecoins are configured, and every
 * screen labels them as demo quotes. Other assets show no estimate.
 */
export const DEMO_QUOTES: Partial<Record<string, number>> = { USDT: 1, USDC: 1, DAI: 1 };

/** Fees, in percent or USD. `null` = not configured yet; shown as such, never guessed. */
export const CRYPTO_FEES: { processingPct: number | null; networkUsd: number | null } = {
  processingPct: null,
  networkUsd: null,
};

/* -------------------------------------------------------------------------- */
/*  Payment categories & other methods                                        */
/* -------------------------------------------------------------------------- */

export type PaymentCategory = "crypto" | "card" | "bank" | "other";

export const PAYMENT_CATEGORIES: { id: PaymentCategory; label: string; short: string }[] = [
  { id: "crypto", label: "Cryptocurrency", short: "Crypto" },
  { id: "card", label: "Credit / Debit Card", short: "Card" },
  { id: "bank", label: "Bank Transfer", short: "Bank" },
  { id: "other", label: "Other Methods", short: "Other" },
];

export type MethodStatus = "awaiting" | "planned";

export interface PaymentMethod {
  id: string;
  category: Exclude<PaymentCategory, "crypto">;
  name: string;
  description: string;
  /** What the customer would see once the method is live. */
  steps: string[];
  status: MethodStatus;
  feeUsd: number | null;
}

export const METHOD_STATUS_LABELS: Record<MethodStatus, string> = {
  awaiting: "Awaiting integration",
  planned: "Planned",
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "card",
    category: "card",
    name: "Visa / Mastercard",
    description: "Pay with a credit or debit card on our payment provider's secure page.",
    steps: [
      "You'll be sent to the provider's secure checkout to enter card details.",
      "Your bank may ask you to confirm the payment.",
      "SociVanta never asks for or stores your card number.",
    ],
    status: "awaiting",
    feeUsd: null,
  },
  {
    id: "bank",
    category: "bank",
    name: "Bank Transfer",
    description: "Send a transfer from your bank using the details and reference we give you.",
    steps: [
      "Create a deposit to receive our bank details and a unique reference.",
      "Send the exact amount with the reference from your bank.",
      "Your balance updates once the transfer is received and matched.",
    ],
    status: "awaiting",
    feeUsd: null,
  },
  {
    id: "paypal",
    category: "other",
    name: "PayPal",
    description: "Pay from your PayPal balance or linked accounts.",
    steps: ["You'll be sent to PayPal to log in and approve the payment there.", "You return here once PayPal confirms."],
    status: "awaiting",
    feeUsd: null,
  },
  {
    id: "wallets",
    category: "other",
    name: "Apple Pay & Google Pay",
    description: "One-tap payments from a supported device.",
    steps: ["Available on supported devices once card payments are live."],
    status: "planned",
    feeUsd: null,
  },
  {
    id: "local",
    category: "other",
    name: "Local payment methods",
    description: "Regional wallets and bank apps, added country by country.",
    steps: ["We'll list the methods available in your country here as they're approved."],
    status: "planned",
    feeUsd: null,
  },
];

export const METHOD_BY_ID: Record<string, PaymentMethod> = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, m]));
