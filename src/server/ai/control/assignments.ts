import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AI_PROVIDER_BY_ID, CAPABILITY_LABEL, TOOL_REQUIREMENTS } from "@/lib/ai/provider-catalog";
import { AI_TOOL_BY_ID, AI_TOOLS, type AiTool, WORKSPACE_TOOLS } from "@/lib/ai/registry";
import { audit } from "../../audit";
import type { Db, Executor } from "../../db/client";
import { aiCredentials, aiToolAssignments } from "../../db/schema";
import { errors } from "../../errors";
import { costMicros } from "../pricing";
import { GENERATORS } from "../run";
import { type Controls, loadControls } from "./controls";
import { modelPrice } from "./models";

/*
 * Tool → model assignments. Server-authoritative: a tool only ever runs on
 * its active assignment, and an assignment can be activated only after a
 * passing compatibility and cost check. Activation never switches generation
 * on (AI_GENERATION_ENABLED stays the launch switch). Tool input/output
 * contracts, quotas and validators are unchanged.
 */

type Staff = { userId: string };
type Client = { ip?: string | null; userAgent?: string | null };

/** Tools that can be assigned: implemented generators with a free-use policy. */
export const assignableTools = (): AiTool[] => [...AI_TOOLS, ...WORKSPACE_TOOLS].filter((t) => GENERATORS[t.id] && t.free && t.availability !== "unavailable");

/** Worst-case cost of one run of a tool on a model, in micro-dollars (same formula as runTool). */
export function worstRunMicros(tool: AiTool, price: { input: number; output: number }) {
  const calls = tool.id === "content-calendar" ? 5 : 1;
  const perCall = costMicros(price, Math.ceil((tool.guard.maxInputChars + (tool.guard.promptChars ?? 4_000)) / 2), tool.guard.maxOutputTokens);
  return { perCall, perRun: perCall * calls, calls };
}

/** Every reason a tool can't use a model, in plain words. Empty = compatible. */
export async function checkAssignment(db: Executor, tool: AiTool, providerId: string, modelId: string, controls?: Controls) {
  const problems: string[] = [];
  const info = AI_PROVIDER_BY_ID[providerId];
  const c = controls ?? (await loadControls(db));
  if (!info) return { problems: ["Unknown provider."], estimate: null };
  if (info.generation === "pending") problems.push(`${info.name} has no generation adapter yet.`);
  if (c.disabledProviders.includes(providerId)) problems.push(`${info.name} is disabled by an administrator.`);
  const { row, price } = await modelPrice(db, providerId, modelId);
  if (!row) return { problems: [...problems, "This model isn't in the model library."], estimate: null };
  if (row.status !== "available") problems.push(row.status === "deprecated" || row.status === "unavailable" ? `The model is marked ${row.status}.` : "The model hasn't been verified yet. Mark it available after checking its documentation.");
  const caps = row.capabilities as Record<string, boolean | null>;
  for (const need of TOOL_REQUIREMENTS) if (caps[need] !== true) problems.push(`${CAPABILITY_LABEL[need]} ${caps[need] === false ? "isn't supported" : "isn't verified"} for this model; every Sociotix tool needs it.`);
  if (row.maxOutputTokens !== null && row.maxOutputTokens < tool.guard.maxOutputTokens) problems.push(`The model allows ${row.maxOutputTokens} output tokens; this tool needs up to ${tool.guard.maxOutputTokens}.`);
  let estimate: ReturnType<typeof worstRunMicros> | null = null;
  if (!price) problems.push("No sourced price is recorded for this model, so its cost can't be capped.");
  else {
    estimate = worstRunMicros(tool, price);
    if (estimate.perCall > tool.guard.maxCostMicros) problems.push(`A single call could cost up to $${(estimate.perCall / 1e6).toFixed(4)}, above this tool's $${(tool.guard.maxCostMicros / 1e6).toFixed(4)} ceiling.`);
    if (c.maxRequestMicros !== null && estimate.perRun > c.maxRequestMicros) problems.push("A run could exceed the maximum cost per request set in Budgets.");
  }
  return { problems, estimate };
}

export async function listAssignments(db: Executor) {
  const rows = await db.select().from(aiToolAssignments);
  const byTool = new Map(rows.map((r) => [r.toolId, r]));
  return assignableTools().map((t) => {
    const a = byTool.get(t.id);
    return {
      toolId: t.id,
      toolName: t.name,
      guard: { maxCostMicros: t.guard.maxCostMicros, maxOutputTokens: t.guard.maxOutputTokens },
      assignment: a ? { providerId: a.providerId, modelId: a.modelId, status: a.status, testedAt: a.testedAt?.toISOString() ?? null, testPassed: a.testPassed, testNote: a.testNote, activatedAt: a.activatedAt?.toISOString() ?? null } : null,
    };
  });
}

const tool = (toolId: string) => {
  const t = AI_TOOL_BY_ID[toolId];
  if (!t || !assignableTools().includes(t)) throw errors.notFound("That tool");
  return t;
};

export const draftSchema = z.strictObject({ providerId: z.string().min(1).max(40), modelId: z.string().min(1).max(120) });

/** Saves a draft (or changes the model): it's inactive until checked and activated again. */
export async function saveDraft(db: Db, staff: Staff, toolId: string, raw: unknown, client: Client = {}) {
  const t = tool(toolId);
  const d = draftSchema.parse(raw);
  if (!AI_PROVIDER_BY_ID[d.providerId]) throw errors.notFound("That AI provider");
  await db.transaction(async (tx) => {
    const values = { providerId: d.providerId, modelId: d.modelId, status: "draft", testedAt: null, testPassed: null, testNote: null, activatedAt: null, updatedBy: staff.userId, updatedAt: new Date() };
    await tx.insert(aiToolAssignments).values({ toolId: t.id, ...values }).onConflictDoUpdate({ target: aiToolAssignments.toolId, set: values });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ai_control.assignment_drafted", targetType: "ai_tool", targetId: t.id, after: d, ip: client.ip, userAgent: client.userAgent });
  });
}

/** Runs the compatibility and cost check (no provider call) and records the outcome. */
export async function checkDraft(db: Db, staff: Staff, toolId: string, client: Client = {}) {
  const t = tool(toolId);
  const [a] = await db.select().from(aiToolAssignments).where(eq(aiToolAssignments.toolId, t.id)).limit(1);
  if (!a) throw errors.conflict("Choose a model for this tool first.");
  const { problems, estimate } = await checkAssignment(db, t, a.providerId, a.modelId);
  const note = problems.length ? problems.join(" ") : `Compatible. Worst case $${((estimate?.perRun ?? 0) / 1e6).toFixed(4)} per run.`;
  await db.transaction(async (tx) => {
    // A failed check on an active assignment switches it back to draft: it must not keep running.
    await tx.update(aiToolAssignments).set({ testedAt: new Date(), testPassed: problems.length === 0, testNote: note, status: problems.length && a.status === "active" ? "draft" : a.status, updatedAt: new Date() }).where(eq(aiToolAssignments.toolId, t.id));
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ai_control.assignment_checked", targetType: "ai_tool", targetId: t.id, after: { passed: problems.length === 0 }, ip: client.ip, userAgent: client.userAgent });
  });
  return { passed: problems.length === 0, problems, estimate };
}

/** Activates a checked assignment. Its provider must have an active, verified key. */
export async function activateAssignment(db: Db, staff: Staff, toolId: string, client: Client = {}) {
  const t = tool(toolId);
  await db.transaction(async (tx) => {
    const [a] = await tx.select().from(aiToolAssignments).where(eq(aiToolAssignments.toolId, t.id)).for("update").limit(1);
    if (!a) throw errors.conflict("Choose a model for this tool first.");
    if (!a.testPassed) throw errors.conflict("Run the compatibility check and fix any problems before activating.");
    const { problems } = await checkAssignment(tx, t, a.providerId, a.modelId);
    if (problems.length) throw errors.conflict(`This assignment is no longer compatible: ${problems.join(" ")}`);
    const [key] = await tx.select({ id: aiCredentials.id }).from(aiCredentials).where(and(eq(aiCredentials.providerId, a.providerId), eq(aiCredentials.status, "active"))).limit(1);
    if (!key) throw errors.conflict("This provider has no active, verified key.");
    await tx.update(aiToolAssignments).set({ status: "active", activatedAt: new Date(), updatedBy: staff.userId, updatedAt: new Date() }).where(eq(aiToolAssignments.toolId, t.id));
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ai_control.assignment_activated", targetType: "ai_tool", targetId: t.id, after: { providerId: a.providerId, modelId: a.modelId }, ip: client.ip, userAgent: client.userAgent });
  });
}

export async function disableAssignment(db: Db, staff: Staff, toolId: string, client: Client = {}) {
  const t = tool(toolId);
  await db.transaction(async (tx) => {
    const done = await tx.update(aiToolAssignments).set({ status: "disabled", updatedBy: staff.userId, updatedAt: new Date() }).where(eq(aiToolAssignments.toolId, t.id)).returning({ toolId: aiToolAssignments.toolId });
    if (!done.length) throw errors.notFound("That assignment");
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ai_control.assignment_disabled", targetType: "ai_tool", targetId: t.id, ip: client.ip, userAgent: client.userAgent });
  });
}
