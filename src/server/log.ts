import "server-only";
import pino, { type DestinationStream, type Logger } from "pino";

/**
 * Structured JSON logging with secret redaction. Never log raw request bodies,
 * tokens, passwords, keys, card data or connection strings.
 */

const SECRET_KEYS = [
  "password",
  "passwordHash",
  "token",
  "tokenHash",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "ciphertext",
  "databaseUrl",
  "DATABASE_URL",
  "connectionString",
  "set-cookie",
];

export const REDACT_PATHS = [...SECRET_KEYS, ...SECRET_KEYS.map((k) => `*.${k}`), ...SECRET_KEYS.map((k) => `*.*.${k}`), 'req.headers["authorization"]', 'req.headers["cookie"]'];

/** Masks the password part of any `scheme://user:password@host` URL, and bearer tokens. */
export function scrub(text: string) {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/[^:/@\s]+):[^@\s]+@/gi, "$1:***@").replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/g, "$1 ***");
}

export function createLogger(options: { level?: string; destination?: DestinationStream } = {}): Logger {
  return pino(
    {
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      base: { service: "socivanta" },
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
      serializers: {
        err: (e: unknown) => {
          const s = pino.stdSerializers.err(e as Error);
          return { ...s, message: scrub(String(s.message ?? "")), stack: s.stack ? scrub(s.stack) : undefined };
        },
      },
      formatters: { level: (label) => ({ level: label }) },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    options.destination,
  );
}

let root: Logger | null = null;

export function logger(): Logger {
  if (!root) root = createLogger();
  return root;
}
