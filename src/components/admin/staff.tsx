"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Crown,
  Eye,
  FlaskConical,
  Info,
  Lock,
  type LucideIcon,
  Mail,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { dateTime } from "@/lib/admin-demo";
import {
  accessErrors,
  accessOf,
  addInvite,
  allowedLevel,
  capOf,
  DEFAULT_ACCESS,
  type Invite,
  inviteErrors,
  isRole,
  type Level,
  LEVEL_LABEL,
  LEVELS,
  MODULES,
  OWNER_ENTRY,
  removeInvite,
  resetRole,
  type RoleAccess,
  type RoleId,
  ROLE_BY_ID,
  ROLES,
  saveRole,
  SENSITIVE,
  sensitiveBlock,
  type StaffEntry,
  summarize,
  updateInvite,
  useStaffAdmin,
  withLevel,
} from "@/lib/admin-staff";
import { cn } from "@/lib/utils";
import { describe, Field, SelectInput, TextArea, TextInput } from "./form";
import { AdminDemoTag } from "./ui";

/* -------------------------------------------------------------------------- */
/*  URL state                                                                 */
/* -------------------------------------------------------------------------- */

type View = "team" | "roles" | "security";
const VIEWS: { id: View; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "roles", label: "Roles & permissions" },
  { id: "security", label: "Security & activity" },
];
type StatusFilter = "" | "member" | "invite";
type Sort = "name" | "role" | "status";
const PAGE = 10;

interface Query {
  view: View;
  role: RoleId;
  member: string;
  invite: boolean;
  q: string;
  frole: "" | RoleId;
  status: StatusFilter;
  sort: Sort;
  page: number;
}

function parse(p: URLSearchParams): Query {
  const view = p.get("view");
  const role = p.get("role");
  const frole = p.get("frole");
  const status = p.get("status");
  const sort = p.get("sort");
  return {
    view: view === "roles" || view === "security" ? view : "team",
    role: isRole(role) ? role : "owner",
    member: p.get("member") ?? "",
    invite: p.get("invite") === "1",
    q: (p.get("q") ?? "").slice(0, 80),
    frole: isRole(frole) ? frole : "",
    status: status === "member" || status === "invite" ? status : "",
    sort: sort === "role" || sort === "status" ? sort : "name",
    page: Math.max(1, Number.parseInt(p.get("page") ?? "1", 10) || 1),
  };
}

function toQuery(s: Query) {
  const q = new URLSearchParams();
  if (s.view !== "team") q.set("view", s.view);
  if (s.view === "roles" && s.role !== "owner") q.set("role", s.role);
  if (s.member) q.set("member", s.member);
  if (s.invite) q.set("invite", "1");
  if (s.q) q.set("q", s.q);
  if (s.frole) q.set("frole", s.frole);
  if (s.status) q.set("status", s.status);
  if (s.sort !== "name") q.set("sort", s.sort);
  if (s.page > 1) q.set("page", String(s.page));
  return q.toString();
}

const initials = (s: string) =>
  s
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const STATUS_RANK = { member: 0, invite: 1 };

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AdminStaff() {
  const params = useSearchParams();
  const pathname = usePathname();
  const s = parse(params);
  const stored = useStaffAdmin();
  const [notice, setNotice] = React.useState<string | null>(null);
  const pushedOverlay = React.useRef(false);

  // Build from the live URL so quick successive changes never overwrite each other.
  const go = React.useCallback(
    (patch: Partial<Query>, mode: "push" | "replace" = "push") => {
      const qs = toQuery({ ...parse(new URLSearchParams(window.location.search)), ...patch });
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [pathname],
  );
  const openOverlay = (patch: Partial<Query>) => {
    pushedOverlay.current = true;
    go(patch);
  };
  const closeOverlay = () => {
    if (pushedOverlay.current) {
      pushedOverlay.current = false;
      window.history.back();
    } else go({ member: "", invite: false }, "replace");
  };

  const entries: StaffEntry[] = [OWNER_ENTRY, ...stored.invites.map((i) => ({ id: i.id, name: i.email, email: i.email, role: i.role, kind: "invite" as const, invite: i }))];
  const members = entries.filter((e) => e.kind === "member");
  const selected = entries.find((e) => e.id === s.member) ?? null;

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
            Administration <AdminDemoTag>Demo configuration</AdminDemoTag>
          </p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Staff &amp; Permissions</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">Manage your team, organize roles and control access to your platform.</p>
        </div>
        <button type="button" onClick={() => openOverlay({ invite: true, member: "" })} className={primaryBtn}>
          <UserPlus className="size-4" aria-hidden /> Invite team member
        </button>
      </header>

      <div role="note" aria-label="Security status" className="mt-5 flex items-start gap-3 rounded-2xl border border-soon/30 bg-soon-soft/40 px-4 py-3.5 dark:bg-soon-soft/10">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-soon" aria-hidden />
        <div className="min-w-0 text-[0.85rem] leading-relaxed">
          <p className="font-semibold text-foreground">Security status: not enforced</p>
          <p className="text-muted-foreground">
            There&apos;s no sign-in or server-side access control yet, so every admin route is open. Roles here are proposals: nothing on this page grants, limits or removes anyone&apos;s access.{" "}
            <Link href="/admin/staff?view=security" scroll={false} className="font-semibold text-primary hover:underline">
              See security readiness
            </Link>
          </p>
        </div>
      </div>

      <Kpis
        items={[
          { label: "Total staff", value: members.length, note: "Demo identity only" },
          { label: "Owners & admins", value: members.filter((m) => m.role === "owner" || m.role === "admin").length, note: "Highest-access roles" },
          { label: "Pending invitations", value: stored.invites.length, note: stored.invites.length ? "Drafts · none sent" : "No drafts", tone: stored.invites.length ? "soon" : undefined },
          { label: "Active roles", value: new Set(members.map((m) => m.role)).size, note: `In use, of ${ROLES.length} templates` },
        ]}
      />

      <div role="tablist" aria-label="Staff views" className="mt-6 -mb-px flex gap-1 overflow-x-auto border-b [scrollbar-width:none]">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            id={`sf-tab-${v.id}`}
            aria-selected={s.view === v.id}
            aria-controls="sf-panel"
            onClick={() => v.id !== s.view && go({ view: v.id, member: "", invite: false, page: 1 })}
            className={cn(
              "relative inline-flex h-11 shrink-0 items-center px-3.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              s.view === v.id && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {notice ? (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-ok-soft/70 px-3.5 py-2.5 text-[0.82rem] font-medium text-ok dark:bg-ok-soft/20">
          <CircleCheck className="size-4 shrink-0" aria-hidden /> {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="ms-auto rounded p-0.5 hover:bg-ok/10">
            <X className="size-3.5" aria-hidden />
          </button>
        </p>
      ) : null}

      <div role="tabpanel" id="sf-panel" aria-labelledby={`sf-tab-${s.view}`} className="mt-5">
        {s.view === "team" ? (
          <TeamView s={s} go={go} entries={entries} stored={stored} onOpen={(id) => openOverlay({ member: id, invite: false })} onInvite={() => openOverlay({ invite: true, member: "" })} />
        ) : s.view === "roles" ? (
          <RolesView role={s.role} stored={stored} invites={stored.invites} onRole={(r) => go({ role: r })} setNotice={setNotice} />
        ) : (
          <SecurityView />
        )}
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && closeOverlay()}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[36rem]">
          {selected ? <StaffDrawer key={selected.id} entry={selected} stored={stored} onClose={closeOverlay} setNotice={setNotice} /> : null}
        </SheetContent>
      </Sheet>

      <Sheet open={s.invite} onOpenChange={(o) => !o && closeOverlay()}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[34rem]">
          {s.invite ? (
            <InviteForm
              stored={stored}
              onClose={closeOverlay}
              onSaved={(inv) => {
                setNotice(`Invitation draft saved for ${inv.email}. Not sent — no email or account was created.`);
                closeOverlay();
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type Stored = ReturnType<typeof useStaffAdmin>;

const primaryBtn =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45";
const secondaryBtn =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border bg-card px-3.5 text-[0.85rem] font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card";
const closeBtn =
  "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

/* -------------------------------------------------------------------------- */
/*  Small pieces                                                              */
/* -------------------------------------------------------------------------- */

function Kpis({ items }: { items: { label: string; value: number; note: string; tone?: "soon" }[] }) {
  return (
    <section aria-label="Team summary" className="@container mt-5">
      <dl className="grid grid-cols-2 gap-2.5 @3xl:grid-cols-4 @3xl:gap-3">
        {items.map((k) => (
          <div key={k.label} className={cn("flex min-h-[6.25rem] min-w-0 flex-col rounded-2xl border bg-card px-4 py-3.5", k.tone === "soon" && "border-soon/35 bg-soon-soft/25 dark:bg-soon-soft/10")}>
            <dt className={cn("text-[0.78rem] font-medium", k.tone === "soon" ? "text-soon" : "text-muted-foreground")}>{k.label}</dt>
            <dd className={cn("mt-1 font-heading text-[1.5rem] leading-tight font-extrabold tabular-nums", k.tone === "soon" && "text-soon")}>{k.value}</dd>
            <dd className="mt-auto text-[0.75rem] leading-snug text-muted-foreground">{k.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const ROLE_TONE: Record<RoleId, string> = {
  owner: "bg-graphite text-white dark:bg-white/10",
  admin: "bg-secondary text-secondary-foreground",
  support: "bg-muted text-foreground",
  orders: "bg-muted text-foreground",
  finance: "bg-muted text-foreground",
};

function RoleBadge({ role }: { role: RoleId }) {
  return (
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap", ROLE_TONE[role])}>
      {role === "owner" ? <Crown className="size-3 text-lime" aria-hidden /> : null}
      {ROLE_BY_ID[role].label}
    </span>
  );
}

function StatusBadge({ entry }: { entry: StaffEntry }) {
  const draft = entry.kind === "invite";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[0.8rem] font-medium whitespace-nowrap", draft ? "text-soon" : "text-foreground")}>
      <span className={cn("size-1.5 shrink-0 rounded-full", draft ? "bg-soon" : "bg-primary")} aria-hidden />
      {draft ? "Draft · not sent" : "Demo identity"}
    </span>
  );
}

function Avatar({ entry, size = "md" }: { entry: StaffEntry; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold",
        size === "lg" ? "size-12 text-base" : "size-9 text-xs",
        entry.kind === "member" ? "bg-graphite text-lime dark:bg-white/10" : "border border-dashed border-soon/50 bg-soon-soft/40 text-soon",
      )}
      aria-hidden
    >
      {entry.kind === "member" ? initials(entry.name) : <Mail className={size === "lg" ? "size-5" : "size-4"} />}
    </span>
  );
}

function accessLine(a: RoleAccess) {
  const x = summarize(a);
  return `${x.manage.length} manage · ${x.view.length} view${x.sensitive.length ? ` · ${x.sensitive.length} sensitive` : ""}`;
}

function Select({ id, label, value, onChange, children, className }: { id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <SelectInput id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </SelectInput>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Team                                                                      */
/* -------------------------------------------------------------------------- */

function TeamView({ s, go, entries, stored, onOpen, onInvite }: { s: Query; go: (p: Partial<Query>, m?: "push" | "replace") => void; entries: StaffEntry[]; stored: Stored; onOpen: (id: string) => void; onInvite: () => void }) {
  const [q, setQ] = React.useState(s.q);
  const [lastUrlQ, setLastUrlQ] = React.useState(s.q);
  if (lastUrlQ !== s.q) {
    setLastUrlQ(s.q);
    setQ(s.q);
  }
  React.useEffect(() => {
    if (q === s.q) return;
    const t = setTimeout(() => go({ q: q.trim(), page: 1 }, "replace"), 250);
    return () => clearTimeout(t);
  }, [q, s.q, go]);

  const needle = s.q.toLowerCase();
  const rows = entries
    .filter((e) => !needle || [e.name, e.email, ROLE_BY_ID[e.role].label].some((x) => x.toLowerCase().includes(needle)))
    .filter((e) => !s.frole || e.role === s.frole)
    .filter((e) => !s.status || e.kind === s.status)
    .sort(
      (a, b) =>
        (s.sort === "role" ? ROLES.findIndex((r) => r.id === a.role) - ROLES.findIndex((r) => r.id === b.role) : s.sort === "status" ? STATUS_RANK[a.kind] - STATUS_RANK[b.kind] : 0) ||
        a.name.localeCompare(b.name),
    );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(s.page, pages);
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const filtered = Boolean(s.q || s.frole || s.status);

  return (
    <section aria-labelledby="sf-team" className="rounded-2xl border bg-card">
      <h2 id="sf-team" className="sr-only">
        Team directory
      </h2>
      <div className="flex flex-col gap-2.5 border-b p-3 sm:p-4 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="sf-q" className="sr-only">
            Search staff
          </label>
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <TextInput id="sf-q" type="search" value={q} placeholder="Search by name, email or role" onChange={(e) => setQ(e.target.value)} className="ps-10" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
          <Select id="sf-role" label="Role" value={s.frole} onChange={(v) => go({ frole: v as Query["frole"], page: 1 }, "replace")} className="lg:w-44">
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
          <Select id="sf-status" label="Status" value={s.status} onChange={(v) => go({ status: v as StatusFilter, page: 1 }, "replace")} className="lg:w-44">
            <option value="">All statuses</option>
            <option value="member">Demo identity</option>
            <option value="invite">Invitation drafts</option>
          </Select>
          <Select id="sf-sort" label="Sort" value={s.sort} onChange={(v) => go({ sort: v as Sort }, "replace")} className="col-span-2 sm:col-span-1 lg:w-40">
            <option value="name">Sort: Name</option>
            <option value="role">Sort: Role</option>
            <option value="status">Sort: Status</option>
          </Select>
        </div>
      </div>

      {shown.length ? (
        <>
          {/* Desktop table */}
          <table className="hidden w-full text-sm xl:table">
            <caption className="sr-only">Staff and invitation drafts</caption>
            <thead className="text-[0.68rem] tracking-wider text-muted-foreground uppercase">
              <tr className="border-b">
                <th scope="col" className="px-4 py-2.5 text-start font-bold">
                  Staff member
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-bold">
                  Role
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-bold">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-bold">
                  Last activity
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-bold">
                  Access
                </th>
                <th scope="col" className="px-4 py-2.5 text-end font-bold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar entry={e} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{e.kind === "member" ? e.name : e.email}</p>
                        <p className="truncate text-xs text-muted-foreground">{e.kind === "member" ? e.email : "Invitation draft"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <RoleBadge role={e.role} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge entry={e} />
                  </td>
                  <td className="px-3 py-3 text-[0.8rem] text-muted-foreground">Not recorded</td>
                  <td className="px-3 py-3 text-[0.8rem] text-muted-foreground tabular-nums">{accessLine(accessOf(stored, e.role))}</td>
                  <td className="px-4 py-3 text-end">
                    <button type="button" onClick={() => onOpen(e.id)} aria-label={`Manage ${e.kind === "member" ? e.name : e.email}`} className={secondaryBtn}>
                      {e.kind === "member" ? "Manage" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phone & tablet cards */}
          <ul className="divide-y xl:hidden" aria-label="Staff and invitation drafts">
            {shown.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onOpen(e.id)} className="flex w-full items-start gap-3 px-4 py-3.5 text-start transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                  <Avatar entry={e} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.kind === "member" ? e.name : e.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">{e.kind === "member" ? e.email : "Invitation draft"}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <RoleBadge role={e.role} />
                      <StatusBadge entry={e} />
                    </span>
                    <span className="mt-1.5 block text-xs text-muted-foreground">{accessLine(accessOf(stored, e.role))}</span>
                  </span>
                  <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
            <p>
              Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + shown.length} of {rows.length}
            </p>
            {pages > 1 ? (
              <div className="flex items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => go({ page: page - 1 })} aria-label="Previous page" className={cn(closeBtn, "size-8 disabled:opacity-40")}>
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <span className="px-1 tabular-nums">
                  Page {page} of {pages}
                </span>
                <button type="button" disabled={page >= pages} onClick={() => go({ page: page + 1 })} aria-label="Next page" className={cn(closeBtn, "size-8 disabled:opacity-40")}>
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="px-4 py-12 text-center">
          <p className="font-semibold">{filtered ? "No staff match these filters" : "No staff yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{filtered ? "Try another search, role or status." : "Invite someone to prepare their access."}</p>
          <div className="mt-4 flex justify-center gap-2">
            {filtered ? (
              <button type="button" onClick={() => go({ q: "", frole: "", status: "", page: 1 }, "replace")} className={secondaryBtn}>
                Clear filters
              </button>
            ) : null}
            <button type="button" onClick={onInvite} className={secondaryBtn}>
              <UserPlus className="size-3.5" aria-hidden /> Invite team member
            </button>
          </div>
        </div>
      )}
      {!stored.invites.length && !filtered ? (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          {OWNER_ENTRY.name} is the only staff identity. No other accounts exist; invitations you prepare appear here as drafts.
        </p>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Roles & permissions                                                       */
/* -------------------------------------------------------------------------- */

function RolesView({ role, stored, invites, onRole, setNotice }: { role: RoleId; stored: Stored; invites: Invite[]; onRole: (r: RoleId) => void; setNotice: (v: string | null) => void }) {
  const count = (r: RoleId) => (r === "owner" ? 1 : 0);
  const drafts = (r: RoleId) => invites.filter((i) => i.role === r).length;
  return (
    <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
      <div className="lg:hidden">
        <label htmlFor="sr-role" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
          Role
        </label>
        <SelectInput id="sr-role" value={role} onChange={(e) => onRole(e.target.value as RoleId)}>
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </SelectInput>
      </div>
      <nav aria-label="Roles" className="hidden lg:block">
        <ul className="space-y-1.5">
          {ROLES.map((r) => {
            const on = r.id === role;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onRole(r.id)}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "w-full rounded-xl border px-3.5 py-3 text-start transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
                    on ? "border-primary/45 bg-card shadow-[0_1px_2px_rgb(15_16_20/0.06)]" : "border-transparent bg-transparent",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("flex items-center gap-1.5 text-sm font-semibold", on && "text-primary")}>
                      {r.id === "owner" ? <Lock className="size-3.5" aria-hidden /> : null}
                      {r.label}
                    </span>
                    <span className="text-[0.7rem] text-muted-foreground tabular-nums">
                      {count(r.id)} staff{drafts(r.id) ? ` · ${drafts(r.id)} draft` : ""}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{r.summary}</span>
                  {stored.roles[r.id] ? <span className="mt-1 block text-[0.68rem] font-semibold text-primary">Edited template</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <RoleEditor key={`${role}-${stored.roles[role]?.savedAt ?? "default"}`} role={role} stored={stored} setNotice={setNotice} />
    </div>
  );
}

function RoleEditor({ role, stored, setNotice }: { role: RoleId; stored: Stored; setNotice: (v: string | null) => void }) {
  const meta = ROLE_BY_ID[role];
  const locked = role === "owner";
  const saved = accessOf(stored, role);
  const [draft, setDraft] = React.useState<RoleAccess>(saved);
  const [ask, setAsk] = React.useState<{ title: string; description: string; confirmLabel: string; danger?: boolean; run: () => void } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const errs = accessErrors(role, draft);
  const sens = SENSITIVE.filter((x) => draft.sensitive[x.id]).length;

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () => {
    if (locked || errs.length) return;
    const commit = () => {
      saveRole(role as Exclude<RoleId, "owner">, draft);
      setNotice(`${meta.label} template saved on this device. It's a proposal — nobody's access changed.`);
    };
    const granted = SENSITIVE.filter((x) => draft.sensitive[x.id] && !saved.sensitive[x.id]);
    if (granted.length)
      setAsk({
        title: "Allow sensitive permissions?",
        description: `${meta.label} would be allowed to: ${granted.map((g) => g.label.toLowerCase()).join(", ")}. This is a proposed template; real enforcement needs server-side checks.`,
        confirmLabel: "Save template",
        run: commit,
      });
    else commit();
  };

  return (
    <section aria-labelledby="sr-heading" className="min-w-0 rounded-2xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 id="sr-heading" className="flex flex-wrap items-center gap-2 font-heading text-lg font-extrabold">
            {meta.label}
            <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[0.66rem] font-semibold text-muted-foreground">Proposed template · not enforced</span>
          </h2>
          <p className="mt-0.5 text-[0.85rem] text-muted-foreground">{meta.summary}</p>
        </div>
        <p className="text-xs text-muted-foreground">{stored.roles[role] ? `Edited ${dateTime(stored.roles[role]!.savedAt)}` : "Default template"}</p>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {locked ? (
          <p className="flex items-start gap-2.5 rounded-xl bg-muted/50 px-3.5 py-3 text-[0.82rem]">
            <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>The Owner role is protected. It always keeps full access, so it can&apos;t be restricted or removed here.</span>
          </p>
        ) : meta.capReason ? (
          <p className="flex items-start gap-2.5 rounded-xl bg-muted/50 px-3.5 py-3 text-[0.82rem]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{meta.capReason} Options beyond these limits are unavailable.</span>
          </p>
        ) : null}
        <dl className="grid gap-2 text-xs sm:grid-cols-3">
          {LEVELS.map((l) => (
            <div key={l} className="rounded-lg border px-3 py-2">
              <dt className="font-semibold text-foreground">{LEVEL_LABEL[l]}</dt>
              <dd className="text-muted-foreground">{l === "none" ? "The area is hidden." : l === "view" ? "Can see records. Can't change anything." : "Can see and change records."}</dd>
            </div>
          ))}
        </dl>
      </div>

      <fieldset disabled={locked} className="min-w-0">
        <legend className="sr-only">Access by area</legend>
        <ul className="divide-y border-t">
          {MODULES.map((m) => (
            <li key={m.id} className="grid gap-x-6 gap-y-2.5 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{m.label}</p>
                <p className="text-xs text-muted-foreground">
                  {draft.modules[m.id] === "manage" ? m.manage : draft.modules[m.id] === "view" ? m.view : "No access to this area."}
                  {capOf(role, m.id) !== "manage" ? <span className="block">Limited to {LEVEL_LABEL[capOf(role, m.id)]} for this role.</span> : null}
                </p>
              </div>
              <LevelPicker
                name={`lvl-${m.id}`}
                label={m.label}
                value={draft.modules[m.id]}
                isAllowed={(l) => allowedLevel(role, m.id, l)}
                onChange={(l) => setDraft((d) => withLevel(role, d, m.id, l))}
              />
            </li>
          ))}
        </ul>

        <details className="group border-t" open={locked || undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-5 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-bold">Sensitive permissions</span>
              <span className="block text-xs text-muted-foreground">
                {sens} of {SENSITIVE.length} allowed · high-impact actions on money, prices, providers and staff.
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
          </summary>
          <ul className="divide-y border-t">
            {SENSITIVE.map((x) => {
              const block = sensitiveBlock(role, draft, x.id);
              return (
                <li key={x.id} className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <label htmlFor={`sp-${x.id}`} className="text-sm font-semibold">
                      {x.label}
                    </label>
                    <p id={`sp-${x.id}-help`} className="text-xs text-muted-foreground">
                      {x.description}
                      {block && !locked ? <span className="block font-medium text-foreground/70">{block}</span> : null}
                    </p>
                  </div>
                  <Toggle id={`sp-${x.id}`} describedBy={`sp-${x.id}-help`} checked={draft.sensitive[x.id]} disabled={locked || Boolean(block)} onChange={(c) => setDraft((d) => ({ ...d, sensitive: { ...d.sensitive, [x.id]: c } }))} />
                </li>
              );
            })}
          </ul>
        </details>
      </fieldset>

      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t bg-card px-4 py-3 sm:px-5", dirty && "sticky bottom-3 rounded-2xl border shadow-float")}>
        <p className="min-w-0 text-[0.82rem] text-muted-foreground" aria-live="polite">
          {locked ? (
            "Protected role · nothing to save."
          ) : errs.length ? (
            <span className="font-semibold text-destructive">{errs[0]}</span>
          ) : dirty ? (
            <span className="font-semibold text-foreground">Unsaved template changes.</span>
          ) : (
            "All changes saved."
          )}
        </p>
        {locked ? null : (
          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <button type="button" onClick={() => setDraft(saved)} className={secondaryBtn}>
                Discard
              </button>
            ) : stored.roles[role] ? (
              <button
                type="button"
                onClick={() =>
                  setAsk({
                    title: `Reset ${meta.label} to the default template?`,
                    description: "Your edits to this role template are removed. Other roles are unchanged.",
                    confirmLabel: "Reset template",
                    danger: true,
                    run: () => {
                      resetRole(role);
                      setDraft(DEFAULT_ACCESS[role]);
                      setNotice(`${meta.label} template reset to default.`);
                    },
                  })
                }
                className={secondaryBtn}
              >
                Reset to default
              </button>
            ) : null}
            <button type="button" onClick={save} disabled={!dirty || errs.length > 0} className={cn(primaryBtn, "h-9 text-[0.85rem]")}>
              Save template
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask?.title ?? ""}
        description={ask?.description ?? ""}
        confirmLabel={ask?.confirmLabel}
        cancelLabel="Cancel"
        tone={ask?.danger ? "danger" : "default"}
        icon={TriangleAlert}
        onConfirm={() => ask?.run()}
      />
    </section>
  );
}

/** No access / View only / Manage as native radios, so arrow keys work and unavailable levels are skipped. */
function LevelPicker({ name, label, value, isAllowed, onChange }: { name: string; label: string; value: Level; isAllowed: (l: Level) => boolean; onChange: (l: Level) => void }) {
  return (
    <div role="radiogroup" aria-label={`${label} access`} className="inline-flex w-full gap-1 rounded-xl bg-muted p-1 md:w-auto">
      {LEVELS.map((l) => {
        const allowed = isAllowed(l);
        return (
          <label
            key={l}
            className={cn(
              "flex h-8 flex-1 items-center justify-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors select-none has-focus-visible:ring-2 has-focus-visible:ring-primary/40 md:flex-none",
              allowed ? "cursor-pointer hover:text-foreground" : "cursor-not-allowed opacity-40",
              value === l && (l === "manage" ? "bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground" : "bg-card text-foreground shadow-sm"),
              "in-disabled:cursor-not-allowed",
            )}
          >
            <input type="radio" name={name} value={l} checked={value === l} disabled={!allowed} onChange={() => onChange(l)} className="sr-only" />
            {l === "view" ? <Eye className="size-3.5" aria-hidden /> : null}
            {LEVEL_LABEL[l]}
          </label>
        );
      })}
    </div>
  );
}

function Toggle({ id, checked, disabled, describedBy, onChange }: { id: string; checked: boolean; disabled?: boolean; describedBy?: string; onChange: (v: boolean) => void }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none",
        checked ? "bg-primary" : "bg-foreground/15",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none", checked ? "translate-x-[1.375rem]" : "translate-x-0.5")} aria-hidden />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Security & activity                                                       */
/* -------------------------------------------------------------------------- */

type Readiness = "not_implemented" | "backend" | "demo" | "none_recorded";
const READY: Record<Readiness, { label: string; className: string; Icon: LucideIcon }> = {
  not_implemented: { label: "Not implemented", className: "bg-off-soft text-off", Icon: CircleSlash },
  backend: { label: "Backend required", className: "bg-soon-soft text-soon", Icon: Server },
  demo: { label: "Demo configuration", className: "bg-secondary text-secondary-foreground", Icon: FlaskConical },
  none_recorded: { label: "No activity recorded", className: "bg-muted text-muted-foreground", Icon: CircleDashed },
};

function ReadyBadge({ state }: { state: Readiness }) {
  const { label, className, Icon } = READY[state];
  return (
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap ring-1 ring-current/15 ring-inset", className)}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {label}
    </span>
  );
}

function SecurityView() {
  const rows: { label: string; detail: string; state: Readiness }[] = [
    { label: "Access control", detail: "Admin routes are open to anyone with the link. No role is checked.", state: "not_implemented" },
    { label: "Authentication", detail: "No sign-in, sessions or password handling exist yet.", state: "backend" },
    { label: "Two-factor authentication", detail: "Planned for every staff account once sign-in exists.", state: "not_implemented" },
    { label: "Administrative activity log", detail: "Staff actions aren't recorded. An immutable audit log needs a backend.", state: "backend" },
    { label: "Role templates", detail: "Saved on this device only, as proposals for future enforcement.", state: "demo" },
    { label: "Last verified security event", detail: "Nothing has been verified or logged.", state: "none_recorded" },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <section aria-labelledby="ss-ready" className="rounded-2xl border bg-card">
        <div className="border-b px-4 py-3.5 sm:px-5">
          <h2 id="ss-ready" className="text-[0.95rem] font-bold">
            Security readiness
          </h2>
          <p className="text-[0.8rem] text-muted-foreground">What protects the admin panel today, stated plainly.</p>
        </div>
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.label} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{r.label}</p>
                <p className="text-[0.8rem] text-muted-foreground">{r.detail}</p>
              </div>
              <ReadyBadge state={r.state} />
            </li>
          ))}
        </ul>
      </section>
      <div className="space-y-4">
        <section aria-labelledby="ss-how" className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 id="ss-how" className="flex items-center gap-2 text-[0.95rem] font-bold">
            <ShieldCheck className="size-4 text-primary" aria-hidden /> How permissions will be enforced
          </h2>
          <p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted-foreground">
            Every sensitive operation — crediting deposits, refunds, wallet adjustments, price changes, provider connections, reward approvals and staff changes — must be checked on the server against the signed-in staff member&apos;s role, every time. Hiding buttons in the browser is never security.
          </p>
        </section>
        <section aria-labelledby="ss-activity" className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 id="ss-activity" className="text-[0.95rem] font-bold">
            Administrative activity
          </h2>
          <p className="mt-1.5 flex items-center gap-2 text-[0.82rem] text-muted-foreground">
            <CircleDashed className="size-4 shrink-0" aria-hidden /> No activity recorded.
          </p>
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Staff drawer                                                              */
/* -------------------------------------------------------------------------- */

function StaffDrawer({ entry, stored, onClose, setNotice }: { entry: StaffEntry; stored: Stored; onClose: () => void; setNotice: (v: string | null) => void }) {
  const isOwner = entry.kind === "member" && entry.role === "owner";
  const [role, setRole] = React.useState<RoleId>(entry.role);
  const [info, setInfo] = React.useState<{ title: string; description: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const access = accessOf(stored, entry.role);
  const sum = summarize(access);
  const meta = ROLE_BY_ID[entry.role];
  const protectedInfo = (what: string) =>
    setInfo({ title: `The Owner can't be ${what}`, description: `${OWNER_ENTRY.name} holds the protected Owner role. In this demo nothing changes anyone's access anyway — real ${what === "disabled" ? "suspension" : "removal"} needs sign-in and server-side checks.` });

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{value}</dd>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b px-5 pt-5 pb-4 sm:px-6">
        <Avatar entry={entry} size="lg" />
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate font-heading text-lg leading-tight font-bold">{entry.kind === "member" ? entry.name : entry.email}</SheetTitle>
          <SheetDescription className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <RoleBadge role={entry.role} />
            <StatusBadge entry={entry} />
          </SheetDescription>
        </div>
        <button type="button" onClick={onClose} aria-label="Close staff details" className={closeBtn}>
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <DrawerSection id="sd-profile" title="Profile">
          <dl className="divide-y">
            {entry.kind === "member" ? row("Name", entry.name) : null}
            {row("Email", entry.email)}
            {row("Role", `${meta.label}${entry.kind === "member" ? " (demo)" : ""}`)}
            {row("Status", entry.kind === "member" ? "Demo identity — no sign-in exists" : "Invitation draft — not sent, no account created")}
            {row("Last activity", <span className="text-muted-foreground">Not recorded</span>)}
            {entry.invite?.message ? row("Message", <span className="font-normal whitespace-pre-line">{entry.invite.message}</span>) : null}
          </dl>
        </DrawerSection>

        <DrawerSection id="sd-access" title="Access" aside={<span className="text-xs text-muted-foreground">From the {meta.label} template</span>}>
          <div className="space-y-3 text-sm">
            <AccessList label="Can manage" items={sum.manage.map((m) => m.label)} tone="manage" />
            <AccessList label="View only" items={sum.view.map((m) => m.label)} tone="view" />
            <AccessList label="No access" items={sum.none.map((m) => m.label)} tone="none" />
            <AccessList label="Sensitive permissions" items={sum.sensitive.map((x) => x.label)} tone="sensitive" />
            {meta.capReason ? (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Proposed restriction:</span> {meta.capReason}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">Proposed only. Today every admin route is open to everyone.</p>
          </div>
        </DrawerSection>

        <DrawerSection id="sd-activity" title="Administrative activity">
          {entry.invite ? (
            <ul className="text-sm">
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-soon" aria-hidden />
                <span>
                  Invitation draft saved on this device <span className="block text-xs text-muted-foreground">{dateTime(entry.invite.createdAt)} · not sent</span>
                </span>
              </li>
            </ul>
          ) : (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> No administrative activity is recorded. An audit log needs a backend.
            </p>
          )}
        </DrawerSection>

        <DrawerSection id="sd-actions" title="Actions" aside={<AdminDemoTag>Demo only</AdminDemoTag>}>
          <div className="space-y-4">
            <div>
              <Field id="sd-role" label="Change role" help={isOwner ? "The Owner role is protected and can't be changed." : "Updates this invitation draft only."}>
                <div className="flex gap-2">
                  <SelectInput {...describe("sd-role", null, true)} value={role} disabled={isOwner} onChange={(e) => setRole(e.target.value as RoleId)} className="flex-1">
                    {ROLES.filter((r) => isOwner || r.id !== "owner").map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </SelectInput>
                  {!isOwner ? (
                    <button
                      type="button"
                      disabled={role === entry.role}
                      onClick={() => {
                        updateInvite(entry.id, { role: role as Invite["role"] });
                        setNotice(`Draft updated: ${entry.email} would join as ${ROLE_BY_ID[role].label}. Not sent.`);
                      }}
                      className={secondaryBtn}
                    >
                      Save role
                    </button>
                  ) : null}
                </div>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/staff?view=roles${entry.role === "owner" ? "" : `&role=${entry.role}`}`} className={secondaryBtn}>
                Review permissions <ArrowRight className="size-3.5" aria-hidden />
              </Link>
              {entry.kind === "invite" ? (
                <>
                  <button type="button" onClick={() => setInfo({ title: "Invitation not sent", description: "Invitations can't be sent until email delivery and sign-in exist. This draft stays on this device, and no account is created." })} className={secondaryBtn}>
                    <Send className="size-3.5" aria-hidden /> Resend invitation
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(true)} className={cn(secondaryBtn, "text-destructive hover:bg-destructive/10")}>
                    <Trash2 className="size-3.5" aria-hidden /> Delete draft
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => protectedInfo("disabled")} className={secondaryBtn}>
                    <UserX className="size-3.5" aria-hidden /> Disable access
                  </button>
                  <button type="button" onClick={() => protectedInfo("removed")} className={cn(secondaryBtn, "text-destructive hover:bg-destructive/10")}>
                    <Trash2 className="size-3.5" aria-hidden /> Remove staff member
                  </button>
                </>
              )}
            </div>
          </div>
        </DrawerSection>
      </div>

      <ConfirmDialog open={info !== null} onOpenChange={(o) => !o && setInfo(null)} title={info?.title ?? ""} description={info?.description ?? ""} icon={Lock} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this invitation draft?"
        description={`The draft for ${entry.email} is removed from this device. Nothing was sent, so there's nothing to revoke.`}
        confirmLabel="Delete draft"
        cancelLabel="Cancel"
        tone="danger"
        icon={Trash2}
        onConfirm={() => {
          removeInvite(entry.id);
          setNotice(`Invitation draft for ${entry.email} deleted.`);
          onClose();
        }}
      />
    </div>
  );
}

function DrawerSection({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-b px-5 py-4 last:border-b-0 sm:px-6">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 id={id} className="text-[0.78rem] font-bold tracking-wider text-muted-foreground uppercase">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function AccessList({ label, items, tone }: { label: string; items: string[]; tone: "manage" | "view" | "none" | "sensitive" }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">
        {label} · {items.length}
      </p>
      {items.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((x) => (
            <li
              key={x}
              className={cn(
                "inline-flex h-6 items-center rounded-full px-2.5 text-[0.72rem] font-medium",
                tone === "manage" && "bg-secondary text-secondary-foreground",
                tone === "view" && "border bg-card",
                tone === "none" && "bg-muted text-muted-foreground line-through decoration-muted-foreground/40",
                tone === "sensitive" && "bg-soon-soft text-soon",
              )}
            >
              {x}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">None</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Invite                                                                    */
/* -------------------------------------------------------------------------- */

function InviteForm({ stored, onClose, onSaved }: { stored: Stored; onClose: () => void; onSaved: (inv: Invite) => void }) {
  const [form, setForm] = React.useState({ email: "", role: "support" as Invite["role"], message: "" });
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [tried, setTried] = React.useState(false);
  const errs = inviteErrors(form, stored.invites);
  const shown = (k: keyof typeof errs) => (tried || touched[k] ? errs[k] : undefined);
  const access = accessOf(stored, form.role);
  const sum = summarize(access);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    const first = (["email", "role", "message"] as const).find((k) => errs[k]);
    if (first) {
      document.getElementById(`inv-${first}`)?.focus();
      return;
    }
    onSaved(addInvite(form));
  };

  return (
    <form onSubmit={submit} noValidate className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <SheetTitle className="font-heading text-lg leading-tight font-bold">Invite team member</SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">Prepare an invitation draft. It&apos;s saved on this device and marked Not sent.</SheetDescription>
        </div>
        <button type="button" onClick={onClose} aria-label="Close invite" className={closeBtn}>
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
        <Field id="inv-email" label="Email address" error={shown("email")} help="Their work email.">
          <TextInput
            {...describe("inv-email", shown("email"), true)}
            type="email"
            inputMode="email"
            autoComplete="off"
            maxLength={120}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            placeholder="name@example.com"
          />
        </Field>
        <Field id="inv-role" label="Role" error={shown("role")} help={ROLE_BY_ID[form.role].summary}>
          <SelectInput {...describe("inv-role", shown("role"), true)} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Invite["role"] }))}>
            {ROLES.filter((r) => r.id !== "owner").map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="inv-message" label="Personal message" optional error={shown("message")} help={`${form.message.length}/300`}>
          <TextArea
            {...describe("inv-message", shown("message"), true)}
            maxLength={300}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            onBlur={() => setTouched((t) => ({ ...t, message: true }))}
            placeholder="Welcome to the team!"
          />
        </Field>

        <section aria-labelledby="inv-preview" className="rounded-xl border bg-muted/25 p-4">
          <h3 id="inv-preview" className="flex items-center gap-2 text-sm font-bold">
            Access preview <span className="text-xs font-normal text-muted-foreground">· {ROLE_BY_ID[form.role].label}</span>
          </h3>
          <div className="mt-3 space-y-3">
            <AccessList label="Can manage" items={sum.manage.map((m) => m.label)} tone="manage" />
            <AccessList label="View only" items={sum.view.map((m) => m.label)} tone="view" />
            <AccessList label="Sensitive permissions" items={sum.sensitive.map((x) => x.label)} tone="sensitive" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">What the role would allow once permissions are enforced by a backend.</p>
        </section>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mail className="size-3.5 shrink-0" aria-hidden /> No email is sent and no account is created.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={cn(secondaryBtn, "h-10 flex-1 sm:flex-none")}>
            Cancel
          </button>
          <button type="submit" className={cn(primaryBtn, "flex-1 sm:flex-none")}>
            Save draft
          </button>
        </div>
      </div>
    </form>
  );
}
