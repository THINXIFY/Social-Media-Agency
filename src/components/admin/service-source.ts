"use client";

import * as React from "react";
import {
  changedCount,
  resetAdminServices,
  saveService,
  serviceExists,
  type ServiceRecord,
  updateServices,
  useServiceRecords,
} from "@/lib/admin-services";
import { api, ApiError } from "@/lib/live-account";

/**
 * Where Services & Pricing reads and writes. Demo mode uses the browser-only
 * store; live mode (DEMO_MODE off) uses the catalog API, where every save is
 * validated, permission-checked, version-checked and audited on the server.
 * Live state only changes after the server confirms, so a failed save leaves
 * the list exactly as it was (nothing to roll back).
 */
export interface ServiceSource {
  live: boolean;
  records: ServiceRecord[];
  state: "loading" | "ready" | "error";
  error: string | null;
  reload: () => void;
  exists: (id: string) => boolean;
  save: (record: ServiceRecord, mode: "new" | "edit") => Promise<ServiceRecord>;
  setFlags: (ids: string[], patch: { visible: boolean } | { archived: boolean }) => Promise<void>;
  /** Demo only: edits made in this browser, and how to discard them. */
  changes: number;
  reset: () => void;
}

export const CONFLICT_MESSAGE = "Someone else changed this service while you were editing, so your save was stopped. The list now shows the latest version — reopen the service and apply your changes again.";

export function useServiceSource(live: boolean): ServiceSource {
  const demo = useDemoSource();
  const remote = useLiveSource(live);
  return live ? remote : demo;
}

function useDemoSource(): ServiceSource {
  const records = useServiceRecords();
  return {
    live: false,
    records,
    state: "ready",
    error: null,
    reload: () => {},
    exists: serviceExists,
    save: async (record) => {
      saveService(record);
      return record;
    },
    setFlags: async (ids, patch) => updateServices(ids, patch),
    changes: changedCount(records),
    reset: resetAdminServices,
  };
}

function useLiveSource(enabled: boolean): ServiceSource {
  const [records, setRecords] = React.useState<ServiceRecord[]>([]);
  const [state, setState] = React.useState<ServiceSource["state"]>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api<{ services: ServiceRecord[] }>("/api/admin/services").then(
      ({ services }) => {
        if (cancelled) return;
        setRecords(services);
        setState("ready");
        setError(null);
      },
      (e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setState("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  // A reload after a failed load shows the loading state again; a reload of a loaded list refreshes it in place.
  const reload = React.useCallback(() => {
    setState((s) => (s === "error" ? "loading" : s));
    setAttempt((n) => n + 1);
  }, []);

  const replace = (updated: ServiceRecord[]) =>
    setRecords((cur) => {
      const byId = new Map(updated.map((r) => [r.id, r]));
      const next = cur.map((r) => byId.get(r.id) ?? r);
      for (const r of updated) if (!cur.some((c) => c.id === r.id)) next.push(r);
      return next;
    });

  const conflict = (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) {
      reload();
      return new ApiError(409, e.code, e.code === "CONFLICT" && /exists/i.test(e.message) ? e.message : CONFLICT_MESSAGE);
    }
    return e;
  };

  return {
    live: true,
    records,
    state,
    error,
    reload,
    exists: (id) => records.some((r) => r.id === id),
    save: async (record, mode) => {
      try {
        const { service } =
          mode === "edit"
            ? await api<{ service: ServiceRecord }>(`/api/admin/services/${encodeURIComponent(record.id)}`, {
                method: "PATCH",
                body: JSON.stringify({ version: record.version, record }),
              })
            : await api<{ service: ServiceRecord }>("/api/admin/services", { method: "POST", body: JSON.stringify(record) });
        replace([service]);
        return service;
      } catch (e) {
        throw conflict(e);
      }
    },
    setFlags: async (ids, patch) => {
      const items = ids.map((id) => ({ id, version: records.find((r) => r.id === id)?.version ?? 1 }));
      try {
        const { services } = await api<{ services: ServiceRecord[] }>("/api/admin/services", { method: "PATCH", body: JSON.stringify({ items, patch }) });
        replace(services);
      } catch (e) {
        throw conflict(e);
      }
    },
    changes: 0,
    reset: () => {},
  };
}
