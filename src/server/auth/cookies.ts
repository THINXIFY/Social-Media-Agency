import "server-only";
import { cookies } from "next/headers";
import { EnvError } from "../env";
import { AppError } from "../errors";
import { logger } from "../log";
import { ALL_COOKIE_NAMES, cookieName, cookieOptions, type SessionKind } from "./sessions";

/** Sets the HttpOnly session cookie (server actions / route handlers only). */
export async function setSessionCookie(kind: SessionKind, token: string, expires: Date) {
  const jar = await cookies();
  for (const n of ALL_COOKIE_NAMES[kind]) if (n !== cookieName(kind)) jar.delete(n);
  jar.set(cookieName(kind), token, cookieOptions(expires));
}

export async function clearSessionCookie(kind: SessionKind) {
  const jar = await cookies();
  for (const n of ALL_COOKIE_NAMES[kind]) jar.delete(n);
}

/** Only same-site, in-app destinations (prevents open redirects). */
export function safeNext(raw: unknown, prefix: "/dashboard" | "/admin", fallback: string = prefix) {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith(prefix) && !v.startsWith("//") && !/[\\\r\n]/.test(v) ? v : fallback;
}

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  done?: boolean;
  message?: string;
  email?: string;
  data?: Record<string, unknown>;
}

/** Converts any error into a safe state for the form. Unexpected errors are logged and shown generically. */
export function toActionState(e: unknown, extra: Partial<ActionState> = {}): ActionState {
  if (e instanceof AppError) {
    const field = e.details?.field;
    if (e.code === "VALIDATION_FAILED" && typeof field === "string") return { ...extra, fieldErrors: { [field]: e.publicMessage } };
    return { ...extra, error: e.publicMessage };
  }
  if (e instanceof EnvError) {
    logger().error({ problems: e.problems }, "auth unavailable: configuration invalid");
    return { ...extra, error: "Sign-in isn't available right now. Please try again later." };
  }
  logger().error({ err: e }, "auth action failed");
  return { ...extra, error: "Something went wrong. Please try again." };
}

export const formString = (fd: FormData, key: string, max = 300) => String(fd.get(key) ?? "").slice(0, max);
