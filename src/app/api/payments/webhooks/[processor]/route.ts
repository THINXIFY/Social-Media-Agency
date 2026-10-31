import { errors } from "@/server/errors";
import { route } from "@/server/http";
import { adapterFor } from "@/server/payments/webhooks";

/**
 * Payment processor webhooks. Fail closed: with no approved, configured
 * adapter the body is never parsed, trusted or stored.
 */
export const POST = route<{ params: Promise<{ processor: string }> }>(async (_request, { params }) => {
  const { processor } = await params;
  if (!/^[a-z_]{2,40}$/.test(processor) || !adapterFor(processor)) throw errors.featureDisabled("Payment notifications");
  // Reached only once an adapter is approved and built (none exist in Phase 5D).
  throw errors.featureDisabled("Payment notifications");
});
