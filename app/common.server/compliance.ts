/**
 * Shopify's three mandatory privacy webhooks (`customers/data_request`,
 * `customers/redact`, `shop/redact`).
 *
 * What these handlers can honestly do is decided by one fact: **VizHog persists
 * no customer data.** The only thing this app stores is the `Session` table —
 * Shopify access tokens plus the installing staff member's name and email.
 * Customer PII (email, name, order contents) is forwarded to the merchant's OWN
 * PostHog project and Iris workspace and is never written to our database.
 *
 * So for the two customer topics there is nothing here to hand over or erase,
 * and the honest job is to say so in an auditable way. Relaying the erasure
 * downstream is not possible with the credentials a merchant gives us: the
 * PostHog key is a project ingest key (`phc_`, and person deletion requires a
 * personal API key) and the Iris key is a publishable ingest key (`pk_`).
 * Erasure inside those systems is the merchant's action in their own account —
 * they are the controller there, we are a forwarder. `shop/redact` is the one
 * topic with real work to do, because sessions are real data we hold.
 *
 * **Never log the webhook payload.** The template handlers this replaced did
 * `console.log(JSON.stringify(payload, null, 2))`, which copied customer email
 * and phone into the platform log stream — creating a durable copy of exactly
 * the data the request was asking us to erase, caused BY the erasure request.
 * Everything below pulls named safe fields out of the payload; nothing ever
 * spreads or stringifies it.
 *
 * ponytail: the audit trail is a structured log line, not a table. Log search
 * is enough to answer "did we act on request X"; add a model if a regulator
 * ever wants a queryable register.
 */

export type ComplianceTopic = 'customers/data_request' | 'customers/redact' | 'shop/redact';

/** The subset of Shopify's privacy payloads this app is allowed to read. */
type CompliancePayload = {
  customer?: { id?: number | string; email?: string; phone?: string };
  data_request?: { id?: number | string };
  orders_requested?: unknown[];
  orders_to_redact?: unknown[];
};

const id = (v: number | string | undefined): string | null => (v === undefined ? null : String(v));

// Array.isArray, not `?.length`: a malformed payload sending a string here would
// otherwise report its character count as a number of orders.
const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/**
 * Build the audit record for one privacy webhook.
 *
 * Safe fields ONLY, by allowlist: Shopify's numeric customer id and data
 * request id trace the request through our logs, while email and phone — the
 * contact details the request exists to protect — are never read. `outcome`
 * records what we actually did, so a log line distinguishes "nothing to erase"
 * from "not implemented".
 */
export function complianceAuditRecord<T extends Record<string, string | number | boolean>>(
  topic: ComplianceTopic,
  shop: string,
  payload: unknown,
  outcome: T,
) {
  const safe = (payload ?? {}) as CompliancePayload;
  return {
    event: 'privacy_webhook',
    topic,
    shop,
    customer_id: id(safe.customer?.id),
    data_request_id: id(safe.data_request?.id),
    orders_in_scope: count(safe.orders_requested ?? safe.orders_to_redact),
    ...outcome,
  };
}

export function auditCompliance<T extends Record<string, string | number | boolean>>(
  topic: ComplianceTopic,
  shop: string,
  payload: unknown,
  outcome: T,
) {
  console.log(JSON.stringify(complianceAuditRecord(topic, shop, payload, outcome)));
}

/**
 * What the merchant has to do themselves, and why. Recorded in the audit line so
 * the answer sits next to the request instead of living only in a support reply.
 *
 * Deliberately specific about each destination, because "ask your provider" is
 * not equally actionable: PostHog has a self-serve person delete, Iris does not
 * yet (confirmed with the Iris team 2026-08-04 — an `ak_`-authorized
 * `DELETE /client/v1/data/people/:id` is scoped but unbuilt, so erasure there is
 * a request to the provider today). When that endpoint ships, VizHog can relay
 * erasure itself instead of handing it back — which needs a secret-key setting,
 * since `pk_` can only ingest.
 */
export const DOWNSTREAM_CONTROLLER_NOTE =
  'VizHog stores no customer data; it forwards events to the merchant-owned PostHog project and Iris workspace. Erasure must be actioned there by the merchant as controller: PostHog via its person-deletion API or UI, Iris by request to the provider (no self-serve erasure endpoint as of 2026-08).';
