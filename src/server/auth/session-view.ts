import "server-only";
import { getDb } from "../db/client";
import { listSessions, type SessionKind } from "./sessions";

/** Readable session rows for the security pages (no IPs or tokens shown). */

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  const mobile = /Mobile|iPhone|Android/.test(ua) ? " (mobile)" : "";
  return `${browser}${os ? ` on ${os}` : ""}${mobile}`;
}

function ago(d: Date) {
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
}

export async function sessionRows(userId: string, kind: SessionKind, currentId: string) {
  const rows = await listSessions(getDb(), userId, kind);
  return rows.map((r) => ({ id: r.id, current: r.id === currentId, device: device(r.userAgent), lastSeen: ago(r.lastSeenAt), started: ago(r.createdAt) }));
}
