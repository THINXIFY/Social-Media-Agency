import Link from "next/link";
import { CloudOff, LockKeyhole, PlugZap } from "lucide-react";

/** Full-area states shared by the dashboard and admin panel. */

function State({ icon: Icon, title, children, action }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
        <Icon className="size-6" />
      </span>
      <h1 className="mt-5 font-heading text-[1.6rem] leading-tight font-extrabold tracking-tight">{title}</h1>
      <div className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">{children}</div>
      {action ? <div className="mt-7 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

const button =
  "inline-flex h-10 items-center justify-center rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

export function AccessDenied({ backHref = "/admin" }: { backHref?: string }) {
  return (
    <State
      icon={LockKeyhole}
      title="You don't have access to this area"
      action={
        <Link href={backHref} className={button}>
          Back to overview
        </Link>
      }
    >
      Your role doesn&apos;t include this section. If you need it for your work, ask the platform owner to update your role.
    </State>
  );
}

export function ServiceUnavailable() {
  return (
    <State icon={CloudOff} title="Sign-in isn't available right now" action={<Link href="/" className={button}>Back to website</Link>}>
      We can&apos;t verify accounts at the moment, so private areas stay closed. Please try again shortly.
    </State>
  );
}

export function NotConnectedYet({ area }: { area: string }) {
  return (
    <State icon={PlugZap} title={`${area} isn't connected yet`}>
      Your account is secure and active. This area will show real data once its backend is switched on — nothing is charged, ordered or moved until then.
    </State>
  );
}
