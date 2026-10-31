"use server";

import { redirect } from "next/navigation";
import { clientInfo, getStaffSession } from "@/server/auth";
import { type ActionState, clearSessionCookie, formString, safeNext, setSessionCookie, toActionState } from "@/server/auth/cookies";
import { revokeSession } from "@/server/auth/sessions";
import { completeStaffSetup, confirmMfaEnrollment, loginStaff, verifyMfa } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";

/** Staff sign-in, setup and MFA server actions. */

const SESSION_ENDED = "Your sign-in expired. Please sign in again.";

export async function staffLoginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = formString(fd, "email", 254);
  let destination: string;
  try {
    const s = await loginStaff(getDb(), { email, password: formString(fd, "password", 200) }, await clientInfo());
    await setSessionCookie("staff", s.token, s.expiresAt);
    destination = s.hasAuthenticator ? `/admin/mfa?next=${encodeURIComponent(safeNext(fd.get("next"), "/admin"))}` : "/admin/mfa/setup";
  } catch (e) {
    return toActionState(e, { email });
  }
  redirect(destination);
}

export async function staffSetupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const password = formString(fd, "password", 200);
  if (password !== formString(fd, "confirm", 200)) return { fieldErrors: { confirm: "The passwords don't match." } };
  try {
    const s = await completeStaffSetup(getDb(), formString(fd, "token", 120), password, await clientInfo());
    await setSessionCookie("staff", s.token, s.expiresAt);
  } catch (e) {
    return toActionState(e);
  }
  redirect("/admin/mfa/setup");
}

export async function confirmEnrollmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getStaffSession();
    if (!ctx) return { error: SESSION_ENDED };
    const r = await confirmMfaEnrollment(getDb(), ctx.session, formString(fd, "code", 20), await clientInfo());
    await setSessionCookie("staff", r.session.token, r.session.expiresAt);
    // Shown once on this response only; never stored in plain text.
    return { done: true, data: { codes: r.recoveryCodes } };
  } catch (e) {
    return toActionState(e);
  }
}

export async function verifyMfaAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const ctx = await getStaffSession();
    if (!ctx) return { error: SESSION_ENDED };
    const mode = fd.get("mode") === "recovery" ? "recovery" : "code";
    const input = mode === "recovery" ? { recoveryCode: formString(fd, "recoveryCode", 40) } : { code: formString(fd, "code", 20) };
    const r = await verifyMfa(getDb(), ctx.session, input, await clientInfo());
    await setSessionCookie("staff", r.session.token, r.session.expiresAt);
    destination = r.recoveryCodesLeft !== null && r.recoveryCodesLeft <= 3 ? "/admin/account?codes=low" : safeNext(fd.get("next"), "/admin");
  } catch (e) {
    return toActionState(e);
  }
  redirect(destination);
}

export async function staffSignOutAction(): Promise<void> {
  const ctx = await getStaffSession().catch(() => null);
  if (ctx) await revokeSession(getDb(), ctx.session.id, ctx.session.userId);
  await clearSessionCookie("staff");
  redirect("/admin/login?signedOut=1");
}
