import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { DOWNSTREAM_CONTROLLER_NOTE, auditCompliance } from "../common.server/compliance";

/**
 * A customer's data must be erased.
 *
 * Nothing to erase here — VizHog keeps no customer records of its own (see
 * app/common.server/compliance.ts). The copies that exist are in the merchant's
 * PostHog project and Iris workspace, and we cannot reach them: a merchant gives
 * us ingest-only credentials (`phc_`, where person deletion needs a personal API
 * key, and Iris `pk_`). Erasure there is the merchant's action as controller of
 * those accounts, which is what the audit line records.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  auditCompliance("customers/redact", shop, payload, {
    erased_records: 0,
    relayed_downstream: false,
    downstream: DOWNSTREAM_CONTROLLER_NOTE,
  });

  return new Response();
};
