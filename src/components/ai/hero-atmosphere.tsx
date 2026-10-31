"use client";

import * as React from "react";

/*
 * The hero's living background: oversized, soft light fields that drift on
 * long, seamless CSS loops (transform/opacity only — no blur filters, canvas
 * or WebGL). The only JavaScript pauses the loops while the hero is offscreen
 * or the tab is hidden; reduced motion disables them in CSS.
 */
export function HeroAtmosphere() {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = true;
    const apply = () => el.setAttribute("data-motion", visible && document.visibilityState === "visible" ? "running" : "paused");
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      apply();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", apply);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, []);

  return (
    <div ref={ref} data-motion="running" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Violet field, top centre */}
      <div className="ai-drift-a absolute -top-[22rem] left-1/2 -ml-[38rem] h-[44rem] w-[76rem] rounded-full bg-[radial-gradient(closest-side,rgb(112_71_235/0.16),rgb(112_71_235/0.05)_55%,transparent)] dark:bg-[radial-gradient(closest-side,rgb(112_71_235/0.32),rgb(112_71_235/0.1)_55%,transparent)]" />
      {/* Deeper violet behind the preview */}
      <div className="ai-drift-b absolute top-[8%] -right-[18rem] h-[40rem] w-[48rem] rounded-full bg-[radial-gradient(closest-side,rgb(140_100_255/0.12),transparent)] dark:bg-[radial-gradient(closest-side,rgb(140_100_255/0.24),transparent)]" />
      {/* Restrained lime highlight */}
      <div className="ai-drift-c absolute top-[38%] left-[6%] h-[22rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,rgb(200_255_82/0.13),transparent)] dark:bg-[radial-gradient(closest-side,rgb(200_255_82/0.08),transparent)]" />
      {/* Existing grid, kept very faint */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(32_33_39/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(32_33_39/0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)] dark:bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)]" />
    </div>
  );
}
