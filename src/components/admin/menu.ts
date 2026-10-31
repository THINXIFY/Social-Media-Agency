/**
 * One look for every admin menu, popover and dropdown list.
 * Popups grow from their trigger, respect the space available, and drop
 * their transitions when reduced motion is on.
 */

export const popupSurface =
  "origin-(--transform-origin) rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-float outline-none transition-[opacity,scale] duration-150 ease-out data-starting-style:scale-[0.97] data-starting-style:opacity-0 data-ending-style:scale-[0.97] data-ending-style:opacity-0 motion-reduce:transition-none dark:border-white/10";

/** Menus and dropdown lists: padded, and scrollable when space runs out. */
export const menuPopup = `${popupSurface} max-h-[min(24rem,var(--available-height))] overflow-y-auto overscroll-contain p-1.5`;

export const menuItem =
  "relative flex min-h-9 w-full cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-foreground/90 outline-none select-none transition-colors data-highlighted:bg-primary/[0.07] data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-45 dark:data-highlighted:bg-primary/15 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-highlighted:[&_svg]:text-primary";

export const menuSeparator = "-mx-1.5 my-1.5 h-px bg-border";

export const menuLabel = "px-2.5 pt-1.5 pb-1 text-[0.68rem] font-semibold tracking-wider text-muted-foreground uppercase";
