import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { EnvError, getEnv } from "./env";
import { errors, toAppError } from "./errors";
import { logger } from "./log";

/**
 * Consistent JSON error responses for Route Handlers:
 *   { error: { code, message, requestId, issues? } }
 * Unexpected errors are logged with the request id and returned as a generic 500.
 */

export interface ErrorBody {
  error: { code: string; message: string; requestId: string; field?: string; issues?: { path: string; message: string }[] };
}

const NO_STORE = { "cache-control": "no-store" };

export function errorResponse(e: unknown, requestId: string): Response {
  if (e instanceof ZodError) {
    const body: ErrorBody = {
      // Paths and messages only — never the submitted values.
      error: { code: "VALIDATION_FAILED", message: "Some details aren't valid.", requestId, issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
    };
    return Response.json(body, { status: 400, headers: { ...NO_STORE, "x-request-id": requestId } });
  }
  const app = toAppError(e);
  if (app) {
    if (app.status >= 500) logger().warn({ requestId, code: app.code, details: app.details }, "request refused");
    // A field name (never its value) lets forms point at the input that needs fixing.
    const field = app.code === "VALIDATION_FAILED" && typeof app.details?.field === "string" ? app.details.field : undefined;
    const body: ErrorBody = { error: { code: app.code, message: app.publicMessage, requestId, ...(field ? { field } : {}) } };
    return Response.json(body, { status: app.status, headers: { ...NO_STORE, "x-request-id": requestId } });
  }
  if (e instanceof EnvError) {
    logger().error({ requestId, problems: e.problems }, "server configuration invalid");
    const body: ErrorBody = { error: { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable.", requestId } };
    return Response.json(body, { status: 503, headers: { ...NO_STORE, "x-request-id": requestId } });
  }
  logger().error({ requestId, err: e }, "unhandled error");
  const body: ErrorBody = { error: { code: "INTERNAL", message: "Something went wrong. Please try again.", requestId } };
  return Response.json(body, { status: 500, headers: { ...NO_STORE, "x-request-id": requestId } });
}

/**
 * Route handlers take small JSON documents (every schema is length-bounded), so a body
 * declared larger than this is refused before anything reads it (5I-B, H-02). Bodies sent
 * without a Content-Length (chunked) still need the reverse proxy's limit in production.
 */
export const MAX_BODY_BYTES = 1_048_576;

type Handler<C> = (request: Request, context: C & { requestId: string }) => Promise<Response>;

/** Wraps a Route Handler with a request id and the shared error format. */
export function route<C = unknown>(handler: Handler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw errors.payloadTooLarge();
      const res = await handler(request, { ...context, requestId });
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (e) {
      // Let Next.js control flow (prerender bail-outs, redirects, notFound) pass through untouched.
      unstable_rethrow(e);
      return errorResponse(e, requestId);
    }
  };
}

/**
 * CSRF defence for state-changing route handlers: the request must come from
 * this app's own origin (browsers send Origin on cross-site POST/PATCH/DELETE).
 * Server actions get the same check from Next.js.
 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new Set([new URL(getEnv().APP_URL).origin, new URL(request.url).origin]);
  if (!origin || !allowed.has(origin)) throw errors.forbidden("make this request");
}

/** JSON for signed-in users: never cached by browsers or shared caches. */
export const privateJson = (body: unknown, init: ResponseInit = {}) => Response.json(body, { ...init, headers: { "cache-control": "private, no-store", ...(init.headers ?? {}) } });
