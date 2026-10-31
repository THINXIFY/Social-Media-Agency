import Link from "next/link";
import { ArrowLeft, CircleDashed, Lock } from "lucide-react";
import { ADMIN_SECTION_BY_ID } from "./nav";

/** A labelled preview for an admin section that isn't built yet. */
export function SectionPreview({ id }: { id: string }) {
  const section = ADMIN_SECTION_BY_ID[id];
  const Icon = section.icon;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden /> Overview
      </Link>
      <div className="mt-4 rounded-2xl border bg-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground" aria-hidden>
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[0.7rem] font-bold tracking-wide text-muted-foreground uppercase">
              <CircleDashed className="size-3" aria-hidden /> Preview · not built yet
            </p>
            <h1 className="mt-2 text-[1.6rem] leading-tight font-extrabold tracking-tight">{section.label}</h1>
            <p className="mt-1 text-[0.95rem] text-muted-foreground">{section.summary}</p>
          </div>
        </div>
        <h2 className="mt-7 text-xs font-bold tracking-wider text-muted-foreground uppercase">Planned for this page</h2>
        <ul className="mt-3 space-y-2">
          {section.planned.map((p) => (
            <li key={p} className="flex gap-2.5 text-sm">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-7 flex items-start gap-2 rounded-xl bg-muted/60 p-3.5 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
          Nothing on this page is active. Admin operations need a backend with authentication and permissions before they can change orders,
          payments or customer data.
        </p>
      </div>
    </div>
  );
}
