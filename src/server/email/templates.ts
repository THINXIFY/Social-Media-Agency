import "server-only";
import type { Email } from "./index";

/** Transactional email templates. Every user-supplied value is HTML-escaped. */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, body: string, action?: { label: string; url: string }, footnote?: string) {
  const button = action
    ? `<p style="margin:28px 0"><a href="${esc(action.url)}" style="background:#7047EB;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;display:inline-block">${esc(action.label)}</a></p>
       <p style="font-size:12px;color:#6b6d76;word-break:break-all">Or paste this link into your browser:<br>${esc(action.url)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#202127">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
  <p style="margin:0 0 24px;font-weight:800;font-size:18px">Socio<span style="color:#7047EB">tix</span></p>
  <h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>
  <div style="font-size:14px;line-height:1.6;color:#3d3f47">${body}</div>
  ${button}
  ${footnote ? `<p style="margin-top:24px;font-size:12px;color:#6b6d76">${footnote}</p>` : ""}
  </td></tr></table></td></tr></table></body></html>`;
}

const text = (...lines: string[]) => lines.filter(Boolean).join("\n\n");

export function verifyEmailMessage(to: string, name: string, url: string): Email {
  return {
    kind: "verify_email",
    to,
    subject: "Confirm your email for Sociotix",
    html: layout(`Welcome, ${name}`, "<p>Confirm your email address to finish creating your Sociotix account.</p>", { label: "Confirm email", url }, "This link expires in 24 hours. If you didn't create an account, you can ignore this email."),
    text: text(`Welcome, ${name}`, "Confirm your email address to finish creating your Sociotix account:", url, "This link expires in 24 hours. If you didn't create an account, ignore this email."),
  };
}

export function existingAccountMessage(to: string, loginUrl: string, resetUrl: string): Email {
  return {
    kind: "existing_account",
    to,
    subject: "You already have a Sociotix account",
    html: layout("You already have an account", `<p>Someone tried to register with this email. If that was you, sign in instead — or <a href="${esc(resetUrl)}">reset your password</a>.</p>`, { label: "Sign in", url: loginUrl }, "If it wasn't you, no action is needed; your account hasn't changed."),
    text: text("You already have a Sociotix account.", `Sign in: ${loginUrl}`, `Forgot your password? ${resetUrl}`, "If it wasn't you, no action is needed."),
  };
}

export function resetPasswordMessage(to: string, url: string): Email {
  return {
    kind: "reset_password",
    to,
    subject: "Reset your Sociotix password",
    html: layout("Reset your password", "<p>Use the button below to choose a new password. For your security, every device will be signed out.</p>", { label: "Choose a new password", url }, "This link expires in 1 hour and works once. If you didn't ask for this, ignore this email — your password won't change."),
    text: text("Reset your Sociotix password:", url, "This link expires in 1 hour and works once. If you didn't ask for this, ignore this email."),
  };
}

export function passwordChangedMessage(to: string): Email {
  return {
    kind: "password_changed",
    to,
    subject: "Your Sociotix password was changed",
    html: layout("Your password was changed", "<p>Your password was just changed and your other sessions were signed out.</p>", undefined, "If this wasn't you, reset your password immediately and contact support."),
    text: text("Your Sociotix password was changed and other sessions were signed out.", "If this wasn't you, reset your password immediately and contact support."),
  };
}

export function staffSetupMessage(to: string, name: string, role: string, url: string, hours: number): Email {
  return {
    kind: "staff_setup",
    to,
    subject: `Set up your Sociotix ${role} access`,
    html: layout(`Hi ${name}`, `<p>You've been given <strong>${esc(role)}</strong> access to the Sociotix admin panel. Set a password and an authenticator app to finish.</p>`, { label: "Set up access", url }, `This link expires in ${hours} hours and works once. If you weren't expecting it, ignore this email.`),
    text: text(`Hi ${name}`, `You've been given ${role} access to the Sociotix admin panel. Set up your password and authenticator app:`, url, `This link expires in ${hours} hours and works once.`),
  };
}

export function recoveryCodeUsedMessage(to: string, remaining: number): Email {
  return {
    kind: "recovery_code_used",
    to,
    subject: "A Sociotix recovery code was used",
    html: layout("A recovery code was used", `<p>A one-time recovery code was just used to sign in to the admin panel. You have <strong>${remaining}</strong> left.</p>`, undefined, "If this wasn't you, contact the platform owner immediately."),
    text: text(`A recovery code was used to sign in to the Sociotix admin panel. ${remaining} remaining.`, "If this wasn't you, contact the platform owner immediately."),
  };
}
