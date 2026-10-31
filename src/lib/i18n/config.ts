/**
 * Languages, display currencies and demo exchange rates.
 *
 * USD is the only accounting currency: balances, prices, deposits and
 * transactions are stored and charged in USD. Other currencies are display
 * conversions using the fixed demo rates below. They are not live market
 * rates and must always be labelled as estimates.
 */

export type LanguageCode = "en" | "ur" | "ar" | "es" | "fr" | "de";

export interface Language {
  code: LanguageCode;
  /** Name in the language itself. */
  native: string;
  english: string;
  dir: "ltr" | "rtl";
  /** BCP 47 locale for Intl. Arabic keeps Latin digits so IDs, inputs and amounts read consistently. */
  intl: string;
  /**
   * "complete" only when every dashboard page is translated. Partial
   * languages are labelled in the picker, and untranslated pages say so.
   */
  coverage: "complete" | "partial";
}

export const LANGUAGES: Language[] = [
  { code: "en", native: "English", english: "English", dir: "ltr", intl: "en-US", coverage: "complete" },
  { code: "ur", native: "اردو", english: "Urdu", dir: "rtl", intl: "ur-PK", coverage: "partial" },
  { code: "ar", native: "العربية", english: "Arabic", dir: "rtl", intl: "ar-u-nu-latn", coverage: "partial" },
  { code: "es", native: "Español", english: "Spanish", dir: "ltr", intl: "es-ES", coverage: "partial" },
  { code: "fr", native: "Français", english: "French", dir: "ltr", intl: "fr-FR", coverage: "partial" },
  { code: "de", native: "Deutsch", english: "German", dir: "ltr", intl: "de-DE", coverage: "partial" },
];

export const LANGUAGE_BY_CODE = Object.fromEntries(LANGUAGES.map((l) => [l.code, l])) as Record<LanguageCode, Language>;

/**
 * Languages customers can choose. English only for now; the others stay
 * defined (with dictionaries and RTL support) and can be re-enabled here
 * once their translations are complete.
 */
export const ENABLED_LANGUAGES: LanguageCode[] = ["en"];

/**
 * Dashboard pages whose text is fully translated in every partial language.
 * Other pages show a notice in the selected language and stay in English.
 */
export const TRANSLATED_PATHS = ["/dashboard/settings"];

export type CurrencyCode = "USD" | "EUR" | "GBP" | "PKR" | "AED" | "SAR" | "INR" | "CAD";

export const CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP", "PKR", "AED", "SAR", "INR", "CAD"];

/**
 * Demo exchange rates: units of each currency per 1 USD.
 * Fixed example values for display only — not live, not used for charging.
 */
export const DEMO_FX = {
  /** When these demo values were set. */
  asOf: "2026-10-01T00:00:00Z",
  rates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    PKR: 280,
    AED: 3.6725,
    SAR: 3.75,
    INR: 84,
    CAD: 1.37,
  } satisfies Record<CurrencyCode, number>,
};
