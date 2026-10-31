/**
 * Database schema (Drizzle). Plain table definitions only: no connections or
 * secrets, so drizzle-kit can load it. Everything that touches the database
 * lives behind `server-only` in `src/server/db/client.ts`.
 */
export * from "./ai";
export * from "./catalog";
export * from "./commerce";
export * from "./engagement";
export * from "./identity";
export * from "./ledger";
export * from "./social";
export * from "./publishing";
export * from "./automations";
