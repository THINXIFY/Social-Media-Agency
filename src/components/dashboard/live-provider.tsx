"use client";

import * as React from "react";
import { CloudOff, X } from "lucide-react";
import { saveDisplay, savedDisplay, useDisplaySettings } from "@/lib/i18n";
import type { LiveAccountSnapshot } from "@/lib/live-account";
import { savePreferences as saveLocalPreferences, usePreferences } from "./demo-store";
import { LiveAccountProvider, useLiveAccount } from "./live-account";

/**
 * Live-mode wrapper for the dashboard: the real account for every page, and
 * display preferences kept in step with the customer's stored preferences.
 */
export function LiveDashboard({ initial, children }: { initial: LiveAccountSnapshot; children: React.ReactNode }) {
  return (
    <LiveAccountProvider initial={initial}>
      <PreferencesSync />
      {children}
    </LiveAccountProvider>
  );
}

/**
 * Applies the stored currency, time zone, date format and motion setting on
 * load, then saves later changes (from Settings or the currency picker) to
 * the account. A failed save is shown, never silently ignored.
 */
function PreferencesSync() {
  const live = useLiveAccount()!;
  const display = useDisplaySettings();
  const { reduceMotion } = usePreferences();
  const [failed, setFailed] = React.useState<string | null>(null);
  const synced = React.useRef<string | null>(null);
  // The first pass of the sync effect sees values from before the server's were applied; skip it.
  const skipFirst = React.useRef(true);
  const save = live.savePreferences;

  // Server → browser, once.
  React.useEffect(() => {
    const p = live.preferences;
    saveDisplay({ currency: p.displayCurrency, timezone: p.timezone, dateFormat: p.dateFormat });
    saveLocalPreferences({ reduceMotion: p.reduceMotion });
    synced.current = JSON.stringify({ displayCurrency: p.displayCurrency, timezone: p.timezone, dateFormat: p.dateFormat, reduceMotion: p.reduceMotion });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser → server, whenever the customer changes something.
  React.useEffect(() => {
    if (synced.current === null) return;
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    // Read what's actually saved: before hydration the hook reports defaults.
    const d = savedDisplay();
    const next = { displayCurrency: d.currency, timezone: d.timezone, dateFormat: d.dateFormat, reduceMotion };
    const key = JSON.stringify(next);
    if (key === synced.current) return;
    const timer = window.setTimeout(() => {
      save(next).then(
        () => {
          synced.current = key;
          setFailed(null);
        },
        (e: Error) => setFailed(e.message),
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [display, reduceMotion, save]);

  if (!failed) return null;
  return (
    <div role="alert" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-destructive/30 bg-card px-4 py-3 text-sm shadow-lg lg:bottom-6">
      <CloudOff className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Your preferences weren&apos;t saved to your account.</span> <span className="text-muted-foreground">{failed}</span>
      </p>
      <button type="button" onClick={() => setFailed(null)} className="-m-1 grid size-7 shrink-0 place-items-center rounded-full hover:bg-muted" aria-label="Dismiss">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
