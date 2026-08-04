import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { auditCompliance } from "../common.server/compliance";

/**
 * Sent 48 hours after the shop uninstalls: erase everything we hold for it.
 *
 * Sessions are the whole of it — Shopify access tokens and the installing staff
 * member's name and email (see prisma/schema.prisma, `Session` is the only
 * model). Settings live in app-installation metafields and the web pixel, which
 * Shopify removes with the installation itself.
 *
 * This is the backstop, not the primary path: `app/uninstalled` already clears
 * sessions. `deleteMany` is idempotent, so arriving after that (or twice, which
 * Shopify does) deletes 0 rows and still succeeds.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const { count } = await db.session.deleteMany({ where: { shop } });

  auditCompliance("shop/redact", shop, payload, { sessions_deleted: count });

  return new Response();
};
