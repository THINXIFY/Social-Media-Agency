import { Clock3, Copy, Lock, MessageSquareText, RefreshCw, Sparkles } from "lucide-react";
import { AI_TOOL_BY_ID, PLATFORM_CHOICES } from "@/lib/ai/registry";
import { cn } from "@/lib/utils";

/*
 * Landing-page workspace preview: a realistic two-pane application window
 * (Input → Results) rendered on a dark surface. Static and honest: example
 * inputs, placeholder results, a locked Generate button.
 */

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[0.72rem] font-semibold tracking-[0.12em] text-white/50 uppercase">
      <span className="grid size-5 place-items-center rounded-full bg-primary text-[0.65rem] font-bold tracking-normal text-primary-foreground">{n}</span>
      {children}
    </span>
  );
}

export function WorkspacePreview() {
  const tool = AI_TOOL_BY_ID["caption-generator"];
  const picked = ["Instagram", "TikTok"];
  return (
    <figure className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#141519] shadow-[0_40px_120px_-50px_rgb(112_71_235/0.55)]" aria-label="Preview of the SociVanta AI workspace. Example inputs and placeholder results; nothing is generated.">
      {/* Window bar */}
      <div className="flex items-center gap-4 border-b border-white/[0.07] px-5 py-3.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
            <MessageSquareText className="size-3.5" />
          </span>
          <span className="truncate text-sm font-semibold text-white">{tool.name.replace(/^AI /, "")}</span>
          <span className="hidden text-sm text-white/35 sm:inline">· Content Studio</span>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[0.7rem] font-semibold text-white/60">
          <Lock className="size-3" aria-hidden /> Preview
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Input */}
        <div className="space-y-6 border-b border-white/[0.07] p-5 sm:p-7 md:border-r md:border-b-0">
          <div>
            <Step n={1}>Write your brief</Step>
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[0.95rem] leading-relaxed text-white/85">Launching our autumn coffee menu — warm, cosy and a little playful. For local students and remote workers.</p>
              <p className="mt-3 text-right text-[0.7rem] text-white/30">Example brief</p>
            </div>
          </div>
          <div>
            <Step n={2}>Choose your preferences</Step>
            <p className="mt-3 text-[0.8rem] font-medium text-white/60">Platforms</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PLATFORM_CHOICES.slice(0, 6).map((p) => (
                <span key={p} className={cn("rounded-full border px-3 py-1.5 text-[0.78rem] font-medium", picked.includes(p) ? "border-primary bg-primary text-primary-foreground" : "border-white/10 text-white/55")}>
                  {p}
                </span>
              ))}
            </div>
            <p className="mt-4 text-[0.8rem] font-medium text-white/60">Tone</p>
            <div className="mt-2 inline-flex rounded-full bg-white/[0.05] p-1 text-[0.78rem] font-medium">
              {["Friendly", "Playful", "Professional"].map((t) => (
                <span key={t} className={cn("rounded-full px-3 py-1", t === "Playful" ? "bg-white text-[#141519]" : "text-white/55")}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="flex h-11 items-center justify-center gap-2 rounded-full bg-white/[0.06] text-sm font-semibold text-white/50">
            <Clock3 className="size-4" aria-hidden /> Coming soon
          </div>
        </div>

        {/* Results */}
        <div className="p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <Step n={3}>Review organised results</Step>
            <span className="flex items-center gap-1 text-white/30" aria-hidden>
              <Copy className="size-4" />
              <RefreshCw className="ml-2 size-4" />
            </span>
          </div>
          <ol className="mt-4 space-y-3">
            {tool.output.map((o, i) => (
              <li key={o.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[0.92rem] font-semibold text-white">
                    <span className="mr-2 text-[#b9a6ff]">{String(i + 1).padStart(2, "0")}</span>
                    {o.title}
                  </p>
                  <p className="hidden truncate text-[0.75rem] text-white/40 lg:block">{o.description}</p>
                </div>
                <div className="mt-3 space-y-2" aria-hidden>
                  <span className="ai-sheen block h-2 w-11/12 rounded-full bg-white/[0.07]" />
                  <span className="ai-sheen block h-2 w-8/12 rounded-full bg-white/[0.07]" />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-center gap-2 text-[0.78rem] text-white/40">
            <Sparkles className="size-3.5 text-[#b9a6ff]" aria-hidden /> Results appear here once the tool launches — no sample text is shown.
          </p>
        </div>
      </div>
    </figure>
  );
}
