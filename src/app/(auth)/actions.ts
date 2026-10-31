"use server";

import { redirect } from "next/navigation";
import { clientInfo, getCustomerSession } from "@/server/auth";
import { loginCustomer, registerCustomer, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from "@/server/auth/accounts";
import { type ActionState, clearSessionCookie, formString, safeNext, setSessionCookie, toActionState } from "@/server/auth/cookies";
import { revokeSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";

/**
 * Customer auth server actions. Next.js checks the Origin of every server
 * action (CSRF); sessions live only in HttpOnly cookies set here.
 */

export async function registerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = formString(fd, "email", 254);
  const name = formString(fd, "name", 80);
  const password = formString(fd, "password", 200);
  const ref = formString(fd, "ref", 40);
  const referral = ref ? { code: ref, via: fd.get("refVia") === "link" ? ("link" as const) : ("code" as const) } : undefined;
  try {
    await registerCustomer(getDb(), { name, email, password, referral }, await clientInfo());
    return { done: true, email };
  } catch (e) {
    return toActionState(e, { email, data: { name, ref } });
  }
}

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = formString(fd, "email", 254);
  let destination: string;
  try {
    const session = await loginCustomer(getDb(), { email, password: formString(fd, "password", 200) }, await clientInfo());
    await setSessionCookie("customer", session.token, session.expiresAt);
    destination = safeNext(fd.get("next"), "/dashboard");
  } catch (e) {
    return toActionState(e, { email });
  }
  redirect(destination);
}

export async function forgotPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = formString(fd, "email", 254);
  try {
    await requestPasswordReset(getDb(), email, await clientInfo());
    return { done: true, email };
  } catch (e) {
    return toActionState(e, { email });
  }
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const password = formString(fd, "password", 200);
  if (password !== formString(fd, "confirm", 200)) return { fieldErrors: { confirm: "The passwords don't match." } };
  try {
    const r = await resetPassword(getDb(), formString(fd, "token", 120), password, await clientInfo());
    if (r.status === "invalid") return { error: "This reset link is invalid or has expired. Request a new one." };
    await clearSessionCookie("customer");
  } catch (e) {
    return toActionState(e);
  }
  redirect("/login?reset=1");
}

export async function verifyEmailAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await verifyEmail(getDb(), formString(fd, "token", 120), await clientInfo());
    if (r.status !== "verified") return { error: "This link is invalid, expired or already used. Sign in to get a new one." };
  } catch (e) {
    return toActionState(e);
  }
  redirect("/login?verified=1");
}

export async function resendVerificationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = formString(fd, "email", 254);
  try {
    await resendVerification(getDb(), email, await clientInfo());
    return { message: "If that account still needs confirming, a new link is on its way.", email };
  } catch (e) {
    return toActionState(e, { email });
  }
}

export async function signOutAction(): Promise<void> {
  const ctx = await getCustomerSession().catch(() => null);
  if (ctx) await revokeSession(getDb(), ctx.session.id, ctx.session.userId);
  await clearSessionCookie("customer");
  redirect("/login?signedOut=1");
}
