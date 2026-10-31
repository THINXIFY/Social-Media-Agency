import { desc, eq } from "drizzle-orm";
import { CAMPAIGN_STUDIO, CONTENT_STUDIO, GROWTH_INTELLIGENCE, ORDER_SUPPORT, SMART_ASSISTANCE } from "@/server/ai/generators";
import { providerStatus } from "@/server/ai/provider";
import { type AiSubject, runTool } from "@/server/ai/run";
import { createDb } from "@/server/db/client";
import { aiUsageEvents, customers, orders } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { fail, loadEnvFiles, requireDatabaseUrl } from "../db/shared";

/**
 * Live provider test for every implemented AI tool (operator-only; spends real money).
 *
 * Runs each implemented tool once against the configured provider through
 * the full pipeline — validation, redaction, budget, structured output, tool
 * rules and usage accounting — with fixed, harmless briefs. It works while
 * AI_GENERATION_ENABLED is still off; turn that on only after this passes.
 *
 * AI Order Explanation needs a real order to explain. Set AI_VERIFY_ORDER to
 * the reference of an order owned by an operator test account; it is run as
 * that order's customer (read-only). Without it the tool is reported as not
 * verified and the test fails, because the launch switch covers every tool.
 *
 *   npm run ai:verify
 *   AI_VERIFY_ORDER=ORD-XXXXXXXXXX npm run ai:verify
 */
const BRIEFS: Record<string, unknown> = {
  "caption-generator": { topic: "Launching our autumn coffee menu — warm, cosy and a little playful.", platforms: ["Instagram", "LinkedIn"], tone: "Playful", audience: "Local students and remote workers" },
  "hashtag-finder": { topic: "Vegan meal prep for busy parents on a budget", platforms: ["Instagram", "TikTok"] },
  "post-ideas": { brand: "An independent bike repair shop that wants more local regulars", goal: "Build a community", platforms: ["Instagram", "Facebook"] },
  "content-calendar": { brand: "A new skincare brand for sensitive skin", goal: "Grow followers", platforms: ["TikTok", "Instagram"], frequency: "3", days: "7" },
  "growth-advisor": { challenge: "Our Instagram posts get a few likes but we don't see new local customers from it.", businessType: "Small business", niche: "Family Italian restaurant", platform: "Instagram", goal: "Get more leads" },
  "growth-roadmap": { niche: "A handmade candle brand selling online, mostly to repeat customers.", platform: "Instagram", objective: "Sell more products", time: "3–5 hours a week", duration: "7" },
  "service-recommender": { goal: "More people watching our new YouTube tutorials, and a few more subscribers.", platform: "youtube", focus: "Views" },
  assistant: { messages: [{ role: "user", content: "How do orders work on SociVanta, and is ordering open right now?" }] },
  "service-search": { query: "I want to promote my clothing store on Instagram" },
  "order-assistant": { goal: "More followers for my new Instagram bakery account", platform: "instagram" },
  "order-explanation": { reference: process.env.AI_VERIFY_ORDER ?? "", question: "What happens next?" },
  "campaign-planner": { niche: "Independent bakery selling sourdough and pastries in Leeds", objective: "Build a community", platforms: ["Instagram", "TikTok"], weeks: "4" },
  "automation-assistant": { request: "Remind me every Monday at 9 to review my content calendar", timezone: "Europe/London" },
  "support-assistant": { messages: [{ role: "user", content: "How do I cancel an order, and do I get my money back?" }] },
};
const ALL = { ...CONTENT_STUDIO, ...GROWTH_INTELLIGENCE, ...SMART_ASSISTANCE, ...ORDER_SUPPORT, ...CAMPAIGN_STUDIO };

function summary(id: string, output: unknown): string {
  const o = output as Record<string, unknown[]>;
  switch (id) {
    case "caption-generator":
      return `${o.platforms.length} platforms × 3 captions, ${o.hooks.length} hooks, ${o.ctas.length} CTAs`;
    case "hashtag-finder":
      return `${(o.groups as { tags: string[] }[]).map((g) => g.tags.length).join("/")} hashtags, ${o.keywords.length} keywords`;
    case "post-ideas":
      return `${o.ideas.length} ideas in ${new Set((o.ideas as { category: string }[]).map((i) => i.category)).size} categories`;
    case "content-calendar":
      return `${o.weeks.length} week(s), ${o.posts.length} posts`;
    case "growth-advisor":
      return `${o.recommendations.length} recommendations, ${o.quickWins.length} quick wins`;
    case "growth-roadmap":
      return `${o.stages.length} stages`;
    case "assistant":
      return `${String((o as unknown as { answer: string }).answer).length} characters, ${o.links.length} links, ${o.followUps.length} follow-ups`;
    case "service-search":
      return `${o.best.length} best and ${o.alternatives.length} other catalog matches`;
    case "order-assistant":
      return (o as unknown as { service: { id: string } | null }).service ? `recommended ${(o as unknown as { service: { id: string } }).service.id}` : "asked a clarifying question";
    case "order-explanation":
      return `explained ${(o as unknown as { reference: string }).reference} (${o.nextSteps.length} next steps, ${o.timeline.length} recorded events)`;
    case "support-assistant":
      return `${String((o as unknown as { answer: string }).answer).length} characters, escalation ${(o as unknown as { escalation: unknown }).escalation ? "offered" : "not needed"}`;
    case "automation-assistant":
      return `suggested a ${(o as unknown as { suggestion: { trigger: { type: string }; action: { type: string } } }).suggestion.trigger.type} → ${(o as unknown as { suggestion: { action: { type: string } } }).suggestion.action.type} workflow`;
    case "campaign-planner":
      return `${o.weeklyPlan.length}-week goal-based plan, ${o.themes.length} themes, ${o.captionIdeas.length} caption ideas`;
    default:
      return `${o.recommendations.length} catalog services recommended from ${(o as unknown as { candidatesConsidered: number }).candidatesConsidered} candidates`;
  }
}

async function main() {
  loadEnvFiles();
  const env = getEnv();
  const status = providerStatus(env);
  if (!status.ok) throw new Error(`Provider not ready: ${status.reason}`);
  console.log(`Live test — provider ${env.AI_PROVIDER}, model ${env.AI_MODEL}. This makes real, billed requests.\n`);

  const db = createDb(requireDatabaseUrl(), { max: 2 });
  let passed = 0;
  try {
    for (const id of Object.keys(ALL)) {
      const started = Date.now();
      try {
        let subject: AiSubject = { kind: "account", userId: "ops:ai-verify" };
        if (id === "order-explanation") {
          if (!process.env.AI_VERIFY_ORDER) {
            console.log("✖ order-explanation: not verified — set AI_VERIFY_ORDER to an order owned by an operator test account.");
            continue;
          }
          const [owner] = await db.select({ customerId: orders.customerId, userId: customers.userId }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(eq(orders.publicRef, process.env.AI_VERIFY_ORDER)).limit(1);
          if (!owner) throw new Error(`Order ${process.env.AI_VERIFY_ORDER} wasn't found.`);
          subject = { kind: "account", userId: owner.userId, customerId: owner.customerId };
        }
        const res = await runTool(db, id, BRIEFS[id], subject, {}, { provider: status.provider, env });
        const [row] = await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.toolId, id)).orderBy(desc(aiUsageEvents.createdAt)).limit(1);
        console.log(`✔ ${id}: ${summary(id, res.output)} · ${((Date.now() - started) / 1000).toFixed(1)}s · $${(row.costMicros / 1e6).toFixed(4)} · ${row.inputTokens ?? "?"} in / ${row.outputTokens ?? "?"} out tokens`);
        passed++;
      } catch (e) {
        console.log(`✖ ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await db.$client.end();
  }
  const total = Object.keys(ALL).length;
  console.log(`\n${passed}/${total} tools passed.`);
  if (passed !== total) throw new Error("Live test failed — keep AI_GENERATION_ENABLED=false.");
  console.log("Review the results above, then set AI_GENERATION_ENABLED=true to launch the AI tools.");
}

main().catch(fail);
