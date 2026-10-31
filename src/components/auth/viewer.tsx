"use client";

import * as React from "react";

/**
 * The signed-in person, for display only (names, role, which nav items to
 * show). Resolved and validated on the server; never used as a security check.
 */
export interface Viewer {
  kind: "customer" | "staff";
  name: string;
  email: string;
  initials?: string;
  roleName?: string;
  sections?: string[];
  demo: boolean;
}

const ViewerContext = React.createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}

export const useViewer = () => React.use(ViewerContext);
