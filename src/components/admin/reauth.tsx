"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/live-account";
import { TextInput } from "./form";

/* -------------------------------------------------------------------------- */
/*  Re-authentication                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Runs a sensitive action. If the server asks for re-authentication, asks for
 * password + authenticator code, then retries. The returned promise settles
 * with the action's final outcome, so its errors reach the caller's UI.
 */
export function useReauth() {
  const [pending, setPending] = React.useState<null | { retry: () => void; cancel: () => void }>(null);
  const guard = React.useCallback(
    (run: () => Promise<void>) =>
      new Promise<void>((resolve, reject) => {
        const attempt = () =>
          run().then(resolve, (e) => {
            if (e instanceof ApiError && e.code === "REAUTH_REQUIRED")
              setPending({ retry: attempt, cancel: () => reject(new ApiError(403, "REAUTH_CANCELLED", "Confirmation cancelled. Nothing was changed.")) });
            else reject(e);
          });
        attempt();
      }),
    [],
  );
  const dialog = (
    <ReauthDialog
      open={Boolean(pending)}
      onClose={() => {
        pending?.cancel();
        setPending(null);
      }}
      onConfirmed={() => {
        const p = pending;
        setPending(null);
        p?.retry();
      }}
    />
  );
  return { guard, dialog };
}

function ReauthDialog({ open, onClose, onConfirmed }: { open: boolean; onClose: () => void; onConfirmed: () => void }) {
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/reauth", { method: "POST", body: JSON.stringify({ password, code: code.replace(/\s/g, "") }) });
      setPassword("");
      setCode("");
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't confirm. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <DialogTitle className="flex items-center gap-2 font-heading text-lg font-bold">
              <KeyRound className="size-5 text-primary" aria-hidden /> Confirm it&apos;s you
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">Financial actions need your password and authenticator code. This unlocks them for 10 minutes.</DialogDescription>
          </div>
          <label className="block text-sm font-semibold">
            Password
            <TextInput type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
          </label>
          <label className="block text-sm font-semibold">
            Authenticator code
            <TextInput inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} className="mt-1.5 font-mono tracking-widest" />
          </label>
          {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-full border px-4 text-sm font-semibold hover:bg-muted">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {busy ? "Confirming…" : "Confirm"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

