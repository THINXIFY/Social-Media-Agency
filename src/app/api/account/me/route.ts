import { requireCustomer } from "@/server/auth";
import { privateJson, route } from "@/server/http";

/** The signed-in customer's own account summary. */
export const GET = route(async () => {
  const { context } = await requireCustomer();
  const { session, customer } = context;
  return privateJson({ email: session.user.email, name: session.user.name, accountRef: customer.accountRef, emailVerified: Boolean(session.user.emailVerifiedAt) });
});
