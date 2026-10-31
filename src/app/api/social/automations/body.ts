import { z } from "zod";
import { errors } from "@/server/errors";

/** Activation must be explicit: both flags, sent only by the Review & Activate step. */
const Body = z.object({ definition: z.unknown(), activate: z.boolean().optional(), confirmed: z.boolean().optional() }).strict();

export function parseSave(raw: unknown) {
  const b = Body.parse(raw);
  if (b.activate && b.confirmed !== true) throw errors.forbidden("activate an automation without confirming it");
  return { definition: b.definition, activate: b.activate === true };
}
