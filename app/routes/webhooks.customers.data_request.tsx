import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { DOWNSTREAM_CONTROLLER_NOTE, auditCompliance } from "../common.server/compliance";

/**
 * A customer asked the merchant for the data we hold on them.
 *
 * We hold none: VizHog writes no customer data to its own database, it forwards
 * events to the merchant's PostHog project and Iris workspace. So the disclosure
 * is "nothing here", plus a pointer to where the data actually lives — see
 * app/common.server/compliance.ts.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  auditCompliance("customers/data_request", shop, payload, {
    disclosed_records: 0,
    downstream: DOWNSTREAM_CONTROLLER_NOTE,
  });

  return new Response();
};
