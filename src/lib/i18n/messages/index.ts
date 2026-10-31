import type { LanguageCode } from "../config";
import { ar } from "./ar";
import { de } from "./de";
import { en, type Messages } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ur } from "./ur";

export type { MessageKey, Messages } from "./en";

/** Every language must provide every key; TypeScript rejects incomplete dictionaries. */
export const MESSAGES: Record<LanguageCode, Messages> = { en, ur, ar, es, fr, de };
