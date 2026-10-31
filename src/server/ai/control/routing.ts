import "server-only";
import { eq } from "drizzle-orm";
import { AI_PROVIDER_BY_ID } from "@/lib/ai/provider-catalog";
import { AI_TOOL_BY_ID } from "@/lib/ai/registry";
import type { Executor } from "../../db/client";
import { aiToolAssignments } from "../../db/schema";
import type { Env } from "../../env";
import type { AiProvider } from "../types";
import { makeProvider } from "./adapters";
import { checkAssignment } from "./assignments";
import type { Controls } from "./controls";
import { activeKey } from "./credentials";
import { modelPrice } from "./models";

/*
 * Control Center routing: the provider, model and key a tool would use.
 * Read per request, so a new request always uses the current active key;
 * a request already in flight keeps the provider instance (and reservation)
 * it started with. Any doubt fails closed. There is no fallback to another
 * provider or model, so nothing can switch silently or cost more.
 */

export type Route = { ok: true; provider: AiProvider; providerId: string; model: string; keyVersion: number } | { ok: false; reason: string };

export async function resolveRoute(db: Executor, toolId: string, env: Env, controls: Controls, deps: { fetch?: typeof fetch } = {}): Promise<Route> {
  if (controls.emergencyDisabled) return { ok: false, reason: "AI is paused by an administrator." };
  const tool = AI_TOOL_BY_ID[toolId];
  if (!tool) return { ok: false, reason: "Unknown tool." };
  const [a] = await db.select().from(aiToolAssignments).where(eq(aiToolAssignments.toolId, toolId)).limit(1);
  if (!a || a.status !== "active") return { ok: false, reason: "No active model is assigned to this tool." };
  const info = AI_PROVIDER_BY_ID[a.providerId];
  if (!info) return { ok: false, reason: "The assigned provider is unknown." };
  if (controls.disabledProviders.includes(info.id)) return { ok: false, reason: `${info.name} is disabled by an administrator.` };
  const { problems } = await checkAssignment(db, tool, a.providerId, a.modelId, controls);
  if (problems.length) return { ok: false, reason: `The assignment is no longer compatible: ${problems[0]}` };
  const key = await activeKey(db, info.id);
  if (!key) return { ok: false, reason: `${info.name} has no active key.` };
  const { price } = await modelPrice(db, info.id, a.modelId);
  const provider = makeProvider(info, key.key, a.modelId, price, env, deps);
  if (!provider) return { ok: false, reason: `${info.name} has no generation adapter.` };
  return { ok: true, provider, providerId: info.id, model: a.modelId, keyVersion: key.version };
}
