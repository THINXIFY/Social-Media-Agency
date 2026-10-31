import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { capturedEmails } from "@/server/email";
import { getEnv } from "@/server/env";

export const metadata: Metadata = { title: "Dev mailbox", robots: { index: false, follow: false } };

/**
 * Development only: emails captured instead of sent (EMAIL_TRANSPORT=capture).
 * Returns 404 in every other environment.
 */
async function Mailbox() {
  await connection();
  let env;
  try {
    env = getEnv();
  } catch {
    notFound();
  }
  if (env.APP_ENV !== "development") notFound();
  const mail = capturedEmails();
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-xs font-bold tracking-wider text-soon uppercase">Development only · never sent</p>
      <h1 className="mt-1 font-heading text-2xl font-extrabold">Captured emails</h1>
      <p className="mt-1 text-sm text-muted-foreground">Newest first. Stored in .local/mail (git-ignored).</p>
      {mail.length ? (
        <ul className="mt-6 space-y-4">
          {mail.map((m) => (
            <li key={m.id} className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 text-sm">
                <span className="font-semibold">{m.subject}</span>
                <span className="text-xs text-muted-foreground">
                  to {m.to} · {new Date(m.at).toLocaleString()}
                </span>
              </div>
              <pre className="px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap" data-kind={m.kind}>
                {m.text}
              </pre>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No emails captured yet.</p>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Mailbox />
    </Suspense>
  );
}
