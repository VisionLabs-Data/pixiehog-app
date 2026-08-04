import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session } = await authenticate.webhook(request);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  //
  // The `await` matters: unawaited, the handler returned 200 and the process was
  // free to move on before the delete landed, leaving live access tokens for an
  // uninstalled shop. `shop/redact` is the 48-hour backstop for exactly that.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
