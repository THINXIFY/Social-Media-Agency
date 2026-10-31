import { randomBytes } from "node:crypto";

/** Prints fresh random values for AUTH_SECRET and DATA_ENCRYPTION_KEY. Paste them into .env.local or your host's secret store. */
console.log(`AUTH_SECRET=${randomBytes(32).toString("base64")}`);
console.log(`DATA_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
