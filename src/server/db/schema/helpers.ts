import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, timestamp } from "drizzle-orm/pg-core";

/** `col IN ('a','b')` for a constant list. Values come from enums.ts, never from input. */
export const oneOf = (col: AnyPgColumn, values: readonly string[]): SQL => sql`${col} in (${sql.raw(values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", "))})`;

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
export const ts = (name: string) => timestamp(name, { withTimezone: true });
