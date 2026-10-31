"use server";

import { redirect } from "next/navigation";
import { clientInfo, getCustomerSession, getStaffSession, requireStaffSession } from "@/server/auth";
import { changePassword } from "@/server/auth/accounts";
import { type ActionState, clearSessionCookie, formString, setSessionCookie, toActionState } from "@/server/auth/cookies";
import { revokeAllSessions, revokeSession, type SessionKind } from "@/server/auth/sessions";
import { reauthenticate, regenerateRecoveryCodes } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";

/**
 * Account-security actions shared by the customer dashboard and the admin
 * panel. Each re-reads the session from the cookie; nothing is trusted from
 * the form except the values being changed.
 */

async function current(kind: SessionKind) {
  if (kind === "staff") {
    const ctx = await requireStaffSession();
    return ctx.session;
  }
  const ctx = await getCustomerSession();
  if (!ctx) redirect("/login?expired=1");
  return ctx.session;
}

const kindOf = (fd: FormData): SessionKind => (fd.get("kind") === "staff" ? "staff" : "customer");

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const kind = kindOf(fd);
  const next = formString(fd, "newPassword", 200);
  if (next !== formString(fd, "confirmPassword", 200)) return { fieldErrors: { confirmPassword: "The passwords don't match." } };
  try {
    const session = await current(kind);
    const rotated = await changePassword(getDb(), session, formString(fd, "currentPassword", 200), next, await clientInfo());
    await setSessionCookie(kind, rotated.token, rotated.expiresAt);
    return { done: true, message: "Password changed. Your other sessions were signed out." };
  } catch (e) {
    return toActionState(e);
  }
}

export async function revokeSessionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const kind = kindOf(fd);
  try {
    const session = await current(kind);
    const id = formString(fd, "sessionId", 40);
    if (id === session.id) return { error: "Use “Sign out” to end this session." };
    // Scoped to the signed-in user: another person's session id simply isn't found.
    const ok = await revokeSession(getDb(), id, session.userId);
    return ok ? { message: "Session signed out." } : { error: "That session has already ended." };
  } catch (e) {
    return toActionState(e);
  }
}

export async function revokeOtherSessionsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const kind = kindOf(fd);
  try {
    const session = await current(kind);
    const n = await revokeAllSessions(getDb(), session.userId, { except: session.id });
    return { message: n ? `Signed out ${n} other session${n === 1 ? "" : "s"}.` : "No other sessions were active." };
  } catch (e) {
    return toActionState(e);
  }
}

export async function signOutEverywhereAction(fd: FormData): Promise<void> {
  const kind = kindOf(fd);
  const ctx = kind === "staff" ? await getStaffSession().catch(() => null) : await getCustomerSession().catch(() => null);
  // A staff session that hasn't passed MFA proves only the password: it may end itself, not every session (5I-A, SEC-03).
  if (ctx && "mfaComplete" in ctx && !ctx.mfaComplete) await revokeSession(getDb(), ctx.session.id, ctx.session.userId);
  else if (ctx) await revokeAllSessions(getDb(), ctx.session.userId);
  await clearSessionCookie("customer");
  await clearSessionCookie("staff");
  redirect(kind === "staff" ? "/admin/login?signedOut=1" : "/login?signedOut=1");
}

export async function staffReauthAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireStaffSession();
    await reauthenticate(getDb(), ctx.session, { password: formString(fd, "password", 200), code: formString(fd, "code", 20) }, await clientInfo());
    const fresh = await requireStaffSession();
    const codes = await regenerateRecoveryCodes(getDb(), fresh.session, await clientInfo());
    return { done: true, data: { codes } };
  } catch (e) {
    return toActionState(e);
  }
}
