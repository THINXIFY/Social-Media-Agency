"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { Bell, CheckCheck, LifeBuoy } from "lucide-react";
import { formatDateTime } from "@/lib/i18n";
import { api } from "@/lib/live-account";
import { cn } from "@/lib/utils";

/* Live in-app notifications (5G-A): the customer's own persisted notifications. Nothing here is sample data. */

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  at: string;
}
interface Data {
  unread: number;
  items: Item[];
}

const iconButton =
  "relative grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none data-popup-open:bg-muted data-popup-open:text-foreground";

export function LiveNotifications() {
  const router = useRouter();
  const [data, setData] = React.useState<Data | null>(null);
  const load = React.useCallback(() => {
    api<Data>("/api/account/notifications").then(setData, () => {});
  }, []);
  React.useEffect(() => {
    load();
    // Refresh while the tab is open so new replies show up without a reload.
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);
  const mark = (body: object) => api<Data>("/api/account/notifications", { method: "POST", body: JSON.stringify(body) }).then(setData, () => {});
  const unread = data?.unread ?? 0;

  return (
    <Popover.Root onOpenChange={(open) => open && load()}>
      <Popover.Trigger className={iconButton} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
        <Bell className="size-[1.1rem]" aria-hidden />
        {unread ? <span className="absolute top-1 end-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-foreground ring-2 ring-background">{unread > 9 ? "9+" : unread}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className="w-[min(23rem,calc(100vw-1.5rem))] origin-(--transform-origin) rounded-2xl border bg-popover text-popover-foreground shadow-float outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <Popover.Title className="font-heading text-sm font-bold">Notifications</Popover.Title>
              <button type="button" disabled={!unread} onClick={() => mark({ all: true })} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-secondary disabled:pointer-events-none disabled:text-muted-foreground">
                <CheckCheck className="size-3.5" aria-hidden /> Mark all read
              </button>
            </div>
            {!data ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : data.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up. Replies from our support team will appear here.</p>
            ) : (
              <ul className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5">
                {data.items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.read) void mark({ ids: [n.id] });
                        if (n.link) router.push(n.link);
                      }}
                      className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-start transition-colors hover:bg-muted"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary dark:text-[#c4b5ff]" aria-hidden>
                        <LifeBuoy className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", n.read ? "font-medium text-muted-foreground" : "font-semibold")}>{n.title}</span>
                        {n.body ? <span className="line-clamp-2 block text-xs text-muted-foreground">{n.body}</span> : null}
                        <span className="mt-1 block text-[0.7rem] text-muted-foreground/80">{formatDateTime(n.at)}</span>
                      </span>
                      {!n.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
