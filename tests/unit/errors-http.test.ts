import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EnvError } from "@/server/env";
import { AppError, errors, fromDatabaseError } from "@/server/errors";
import { errorResponse, route } from "@/server/http";

const body = async (r: Response) => (await r.json()) as { error: { code: string; message: string; requestId: string; issues?: { path: string; message: string }[] } };

describe("API error handling", () => {
  it("returns AppErrors with their status and safe message", async () => {
    const r = errorResponse(errors.forbidden("refund orders"), "req-1");
    expect(r.status).toBe(403);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-request-id")).toBe("req-1");
    expect(await body(r)).toEqual({ error: { code: "FORBIDDEN", message: "You don't have permission to refund orders.", requestId: "req-1" } });
  });

  it("returns validation issues without echoing submitted values", async () => {
    const parsed = z.object({ email: z.string().email() }).safeParse({ email: "leak-me-not@@" });
    const r = errorResponse(parsed.error, "req-2");
    const b = await body(r);
    expect(r.status).toBe(400);
    expect(b.error.issues?.[0].path).toBe("email");
    expect(JSON.stringify(b)).not.toContain("leak-me-not");
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const r = errorResponse(new Error("select * from users where password = 'x' at postgres://a:b@h/db"), "req-3");
    const b = await body(r);
    expect(r.status).toBe(500);
    expect(b.error.code).toBe("INTERNAL");
    expect(JSON.stringify(b)).not.toMatch(/select|postgres:|password/);
  });

  it("reports configuration problems as 503 without details", async () => {
    const r = errorResponse(new EnvError(["DATABASE_URL must use sslmode"]), "req-4");
    expect(r.status).toBe(503);
    expect(JSON.stringify(await body(r))).not.toContain("DATABASE_URL");
  });

  it("maps Postgres and safeguard errors (including wrapped ones)", () => {
    const wrap = (code: string, constraint?: string) => ({ message: "Failed query", cause: Object.assign(new Error("db"), { code, constraint }) });
    expect(fromDatabaseError(wrap("23505", "users_email_lower_key"))?.code).toBe("CONFLICT");
    expect(fromDatabaseError(wrap("23503"))?.code).toBe("CONFLICT");
    expect(fromDatabaseError(wrap("23514"))?.code).toBe("VALIDATION_FAILED");
    expect(fromDatabaseError(wrap("SV003"))?.code).toBe("INSUFFICIENT_FUNDS");
    expect(fromDatabaseError(wrap("SV001"))?.code).toBe("LEDGER_INVARIANT");
    expect(fromDatabaseError(wrap("SV009"))?.code).toBe("FEATURE_DISABLED");
    expect(fromDatabaseError(new Error("plain"))).toBeNull();
  });

  it("route() adds a request id and converts thrown errors", async () => {
    const ok = await route(async () => Response.json({ ok: true }))(new Request("http://x/api"), {});
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const bad = await route(async () => {
      throw new AppError("NOT_FOUND", "That order wasn't found.");
    })(new Request("http://x/api"), {});
    expect(bad.status).toBe(404);
    expect((await body(bad)).error.requestId).toBe(bad.headers.get("x-request-id"));
  });
});
