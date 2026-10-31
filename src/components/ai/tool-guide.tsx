import Link from "next/link";
import { ArrowRight, ChevronDown, Lightbulb, ShieldCheck } from "lucide-react";
import { HOW_RESULTS_ARE_MADE, type ToolGuide } from "@/lib/ai/guides";
import { AI_TOOL_BY_ID, type AiTool, aiToolHref, CATALOG_PLATFORM_CHOICES } from "@/lib/ai/registry";
import { cn } from "@/lib/utils";
import { LiveAvailabilityBadge } from "./live-badge";
import { ToolGlyph } from "./parts";
import { AiPlatformIcon } from "./platform-icon";
import { TryExampleButton } from "./try-example";

/*
 * The written half of a tool page, below the workspace. Server-rendered, so
 * every word is in the initial HTML. One editorial flow instead of a stack of
 * card grids: how it works → examples → better results → FAQs → related tools.
 */

const h2 = "font-heading text-[1.55rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[1.9rem]";
const eyebrow = "text-[0.72rem] font-semibold tracking-[0.14em] text-primary uppercase";

/** The example's main text: the first free-text value (topic or brand). */
const exampleText = (fill: Record<string, string | string[]>) => Object.values(fill).find((v): v is string => typeof v === "string" && v.length > 12) ?? "";
const exampleSettings = (fill: Record<string, string | string[]>) =>
  [fill.businessType, fill.tone, fill.goal, fill.objective, fill.focus, fill.time, fill.days ? `${fill.days} days` : null, fill.duration ? `${fill.duration}-day plan` : null, fill.frequency ? `${fill.frequency} posts a week` : null].filter((v): v is string => typeof v === "string" && v.length > 0);
/** Platforms an example uses, as display names (single-platform tools store a name or a catalog id). */
const examplePlatforms = (fill: Record<string, string | string[]>) => (Array.isArray(fill.platforms) ? fill.platforms : typeof fill.platform === "string" ? [CATALOG_PLATFORM_CHOICES[fill.platform] ?? fill.platform] : []);

export function ToolGuideSection({ tool, guide }: { tool: AiTool; guide: ToolGuide }) {
  const short = tool.name.replace(/^AI /, "");
  return (
    <div className="mt-16 space-y-20 sm:mt-24 sm:space-y-24">
      {/* How it works: the direct answer, who it's for, and three steps */}
      <section aria-labelledby="guide-what" className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className={eyebrow}>How it works</p>
          <h2 id="guide-what" className={cn(h2, "mt-2")}>
            {guide.whatIs.q}
          </h2>
          <p className="mt-4 text-[1.05rem] leading-relaxed">{guide.whatIs.a}</p>
          <p className="mt-3 leading-relaxed text-muted-foreground">{guide.whatIs.more}</p>
          <h3 className="mt-8 text-sm font-semibold">Who it&apos;s for</h3>
          <ul className="mt-3 space-y-2.5">
            {guide.whoFor.map((w) => (
              <li key={w.who} className="flex gap-3 text-[0.95rem] leading-relaxed">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>
                  <span className="font-semibold">{w.who}</span> <span className="text-muted-foreground">— {w.why}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="self-start rounded-[1.5rem] border bg-card p-6 shadow-[0_1px_2px_rgb(32_33_39/0.04)] sm:p-7">
          <h3 className="font-heading text-lg font-bold">How to use it</h3>
          <ol className="mt-5 space-y-5">
            {guide.steps.map((s, i) => (
              <li key={s.title} className="relative flex gap-4">
                {i < guide.steps.length - 1 ? <span className="absolute top-9 bottom-[-1.25rem] left-4 w-px bg-border" aria-hidden /> : null}
                <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
                  {i + 1}
                </span>
                <div className="pt-0.5">
                  <h4 className="font-semibold">{s.title}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Examples */}
      <section aria-labelledby="guide-examples">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={eyebrow}>Examples</p>
            <h2 id="guide-examples" className={cn(h2, "mt-2")}>
              Start from an example brief
            </h2>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">“Try this example” fills the form above. Nothing is generated until you choose to.</p>
        </div>
        <ul className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
          {guide.examples.map((ex) => {
            const platforms = examplePlatforms(ex.fill);
            return (
              <li key={ex.title} className="flex flex-col rounded-[1.5rem] border bg-card p-6 shadow-[0_1px_2px_rgb(32_33_39/0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-heading text-lg font-bold">{ex.title}</h3>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {platforms.map((p) => (
                      <span key={p} title={p} className="grid size-7 place-items-center rounded-full border bg-background dark:bg-white/[0.03]">
                        <AiPlatformIcon name={p} className="size-3.5" />
                        <span className="sr-only">{p}</span>
                      </span>
                    ))}
                  </span>
                </div>
                <blockquote className="mt-4 border-l-2 border-primary/40 pl-4 text-[0.95rem] leading-relaxed">“{exampleText(ex.fill)}”</blockquote>
                {exampleSettings(ex.fill).length ? (
                  <p className="mt-3 flex flex-wrap gap-1.5">
                    {exampleSettings(ex.fill).map((s) => (
                      <span key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {s}
                      </span>
                    ))}
                  </p>
                ) : null}
                <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">What you get: </span>
                  {ex.youGet}
                </p>
                <div className="mt-5">
                  <TryExampleButton toolId={tool.id} title={ex.title} values={ex.fill} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Examples describe how results are organised — they aren&apos;t generated output.</p>
      </section>

      {/* Better results: tips, options, and how results are made */}
      <section aria-labelledby="guide-tips" className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className={eyebrow}>Better results</p>
          <h2 id="guide-tips" className={cn(h2, "mt-2")}>
            Tips from the SociVanta team
          </h2>
          <ul className="mt-6 divide-y border-y">
            {guide.tips.map((t) => (
              <li key={t.title} className="flex gap-4 py-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lime/40 text-graphite dark:bg-lime/15 dark:text-lime" aria-hidden>
                  <Lightbulb className="size-4" />
                </span>
                <div>
                  <h3 className="font-semibold">{t.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
                  {t.example ? <p className="mt-2.5 rounded-xl bg-subtle px-3.5 py-2.5 text-sm leading-relaxed dark:bg-white/[0.03]">{t.example}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-5 self-start">
          <div className="rounded-[1.5rem] border bg-card p-6 shadow-[0_1px_2px_rgb(32_33_39/0.04)]">
            <h3 className="font-heading text-lg font-bold">What you can customise</h3>
            <dl className="mt-4 space-y-4">
              {guide.options.map((o) => (
                <div key={o.name}>
                  <dt className="text-sm font-semibold">{o.name}</dt>
                  <dd className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{o.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div id="how-results" className="scroll-mt-24 rounded-[1.5rem] border bg-subtle/60 p-6 dark:bg-white/[0.02]">
            <h3 className="flex items-center gap-2 font-heading text-lg font-bold">
              <ShieldCheck className="size-5 text-primary" aria-hidden /> How results are made
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {HOW_RESULTS_ARE_MADE.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <h4 className="mt-4 text-sm font-semibold">Limits to keep in mind</h4>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-primary/60">
              {tool.limits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section aria-labelledby="guide-faq" className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
        <div>
          <p className={eyebrow}>Questions</p>
          <h2 id="guide-faq" className={cn(h2, "mt-2")}>
            {`${short} questions`}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Short answers to what people ask most. More about SociVanta AI on the{" "}
            <Link href="/ai-tools#faq" className="font-semibold text-primary hover:underline">
              AI tools page
            </Link>
            .
          </p>
        </div>
        <div className="divide-y rounded-[1.5rem] border bg-card shadow-[0_1px_2px_rgb(32_33_39/0.04)]">
          {guide.faqs.map((f, i) => (
            <details key={f.q} name={`faq-${tool.id}`} open={i === 0} className="group px-5 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center gap-4 rounded-lg py-5 outline-none focus-visible:ring-3 focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden">
                <h3 className="flex-1 text-[1rem] font-semibold">{f.q}</h3>
                <span className="grid size-8 shrink-0 place-items-center rounded-full border text-muted-foreground transition-colors group-open:border-primary/40 group-open:bg-primary group-open:text-primary-foreground" aria-hidden>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                </span>
              </summary>
              <p className="-mt-1 max-w-2xl pr-12 pb-5 text-[0.95rem] leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Related tools: meaningful next steps first (with why), then the rest of the family. Badges show real availability. */
export function RelatedToolsSection({ tool, guide, others }: { tool: AiTool; guide?: ToolGuide; others: AiTool[] }) {
  const pairs = (guide?.next ?? []).map((n) => ({ tool: AI_TOOL_BY_ID[n.toolId], why: n.text }));
  const rest = others.filter((t) => !pairs.some((p) => p.tool.id === t.id)).map((t) => ({ tool: t, why: t.tagline }));
  const items = [...pairs, ...rest];
  if (!items.length) return null;
  return (
    <section aria-labelledby="related-title" className="mt-20 sm:mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={eyebrow}>Keep going</p>
          <h2 id="related-title" className={cn(h2, "mt-2")}>
            {pairs.length ? `Pairs well with the ${tool.name.replace(/^AI /, "")}` : "Related tools"}
          </h2>
        </div>
        <Link href="/ai-tools#tools" className="text-sm font-semibold text-primary hover:underline">
          All 13 tools
        </Link>
      </div>
      <ul className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 3).map(({ tool: t, why }) => (
          <li key={t.id}>
            <Link href={aiToolHref(t)} className="group flex h-full flex-col rounded-[1.5rem] border bg-card p-5 transition-[border-color,box-shadow] hover:border-primary/35 hover:shadow-[0_18px_40px_-28px_rgb(112_71_235/0.55)] focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
              <span className="flex items-start justify-between gap-3">
                <ToolGlyph tool={t} />
                <LiveAvailabilityBadge tool={t} />
              </span>
              <span className="mt-4 font-heading text-[1.05rem] font-bold">{t.name}</span>
              <span className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{why}</span>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-foreground/80 group-hover:text-primary">
                Open tool <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
