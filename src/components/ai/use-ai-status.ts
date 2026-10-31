"use client";

import * as React from "react";
import type { AiAvailability } from "@/lib/ai/registry";
import { api } from "@/lib/live-account";

/*
 * Live AI availability, read from the server. Pages are static and show each
 * tool's declared state ("Coming soon"); these hooks upgrade it once the
 * server confirms a tool can really run. Any failure keeps the declared state.
 */

export interface ToolStatus {
  availability: AiAvailability;
  account: "signed_out" | "unverified" | "verified";
  usage: { used: number; allowance: number } | null;
}

export function useToolStatus(toolId: string) {
  const [status, setStatus] = React.useState<ToolStatus | null>(null);
  const refresh = React.useCallback(() => {
    api<ToolStatus>(`/api/ai/tools/${toolId}`).then(setStatus, () => {});
  }, [toolId]);
  React.useEffect(refresh, [refresh]);
  return { status, refresh, setStatus };
}

let listRequest: Promise<Record<string, AiAvailability>> | null = null;

/** Availability for every tool (one request per page load, shared by every badge). */
export function useAvailabilityMap() {
  const [map, setMap] = React.useState<Record<string, AiAvailability> | null>(null);
  React.useEffect(() => {
    listRequest ??= api<{ tools: { id: string; availability: AiAvailability }[] }>("/api/ai/tools").then((r) => Object.fromEntries(r.tools.map((t) => [t.id, t.availability])));
    listRequest.then(setMap, () => {
      listRequest = null;
    });
  }, []);
  return map;
}
