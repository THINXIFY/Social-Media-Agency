"use client";

import * as React from "react";
import { api, type LiveAccountSnapshot, type LivePreferences, type LiveProfile } from "@/lib/live-account";

/**
 * The signed-in customer's real account (DEMO_MODE off). Present only in
 * live mode, so every hook can tell the two modes apart explicitly: when this
 * context exists, demo records are never shown.
 */
export interface LiveAccount extends LiveAccountSnapshot {
  saveProfile: (input: ProfileInput) => Promise<LiveProfile>;
  savePreferences: (input: Omit<LivePreferences, "language">) => Promise<LivePreferences>;
  refreshWallet: () => Promise<void>;
}

export interface ProfileInput {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  country: string;
  accountType: "personal" | "business";
  businessName: string;
  website: string;
}

const LiveAccountContext = React.createContext<LiveAccount | null>(null);

/** The real account in live mode; null in demo mode. */
export const useLiveAccount = () => React.use(LiveAccountContext);

export function LiveAccountProvider({ initial, children }: { initial: LiveAccountSnapshot; children: React.ReactNode }) {
  const [snapshot, setSnapshot] = React.useState(initial);

  const saveProfile = React.useCallback(async (input: ProfileInput) => {
    const profile = await api<LiveProfile>("/api/account/profile", { method: "PATCH", body: JSON.stringify(input) });
    setSnapshot((s) => ({ ...s, profile }));
    return profile;
  }, []);

  const savePreferences = React.useCallback(async (input: Omit<LivePreferences, "language">) => {
    const preferences = await api<LivePreferences>("/api/account/preferences", { method: "PATCH", body: JSON.stringify(input) });
    setSnapshot((s) => ({ ...s, preferences }));
    return preferences;
  }, []);

  const refreshWallet = React.useCallback(async () => {
    const wallet = await api<LiveAccountSnapshot["wallet"]>("/api/account/wallet");
    setSnapshot((s) => ({ ...s, wallet }));
  }, []);

  const value = React.useMemo(() => ({ ...snapshot, saveProfile, savePreferences, refreshWallet }), [snapshot, saveProfile, savePreferences, refreshWallet]);
  return <LiveAccountContext value={value}>{children}</LiveAccountContext>;
}
