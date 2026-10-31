import { NextResponse } from "next/server";
import { isSocialProvider, SOCIAL_ROUTES } from "@/lib/social/platforms";
import { getCustomerSession } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { logger } from "@/server/log";
import { completeConnection } from "@/server/social/service";

/**
 * OAuth redirect target, registered with each platform as
 * <APP_URL>/api/social/callback/<platform>. It only ever redirects back to
 * the Social accounts page with an outcome code — never a token, code or
 * provider message — and the platform's `code`/`state` aren't echoed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const env = getEnv();
  const back = (q: Record<string, string>) => {
    const res = NextResponse.redirect(new URL(`${SOCIAL_ROUTES.accounts}?${new URLSearchParams(q)}`, env.APP_URL), 303);
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  };
  if (!isSocialProvider(provider)) return back({ result: "failed" });

  const ctx = await getCustomerSession().catch(() => null);
  if (!ctx || !ctx.session.user.emailVerifiedAt) {
    // The state stays unused; it simply expires. Signing in and starting again is safe.
    const res = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(SOCIAL_ROUTES.accounts)}`, env.APP_URL), 303);
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  }
  try {
    const { outcome, accounts } = await completeConnection(getDb(), { customerId: ctx.customer.id, provider, params: new URL(request.url).searchParams }, { env });
    return back({ result: outcome, provider, ...(accounts > 1 ? { count: String(accounts) } : {}) });
  } catch (e) {
    logger().error({ provider, err: e instanceof Error ? e.name : "error" }, "social callback failed");
    return back({ result: "failed", provider });
  }
}
