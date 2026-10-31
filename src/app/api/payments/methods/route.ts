import { connection } from "next/server";
import { privateJson, route } from "@/server/http";
import { methodReadiness } from "@/server/payments/methods";

/** Which deposit methods are usable right now and why not. No account details or secrets. */
export const GET = route(async () => {
  await connection();
  return privateJson({ methods: methodReadiness() });
});
