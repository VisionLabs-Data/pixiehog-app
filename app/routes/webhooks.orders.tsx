import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { queryCurrentAppInstallation } from "../common.server/queries/current-app-installation";
import { orderToMythicEvent } from "../common.server/mythic/order-to-event";
import { Constant } from "../../common/constant";

/**
 * Server-side conversion forwarding: Shopify order/refund webhooks -> Mythic.
 *
 * These are authoritative purchase signals (can't be blocked by the storefront),
 * forwarded to Mythic's server ingest (`POST /ingest`, Bearer pk_). The per-shop
 * Mythic key lives in the app-installation metafield (same value the merchant
 * enters for the client pixel) — read here via the offline admin session so no
 * extra store is needed.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  // App uninstalled / no offline session — ack so Shopify stops retrying.
  if (!admin) {
    return new Response();
  }

  const mythicEvent = orderToMythicEvent(topic, payload);
  if (!mythicEvent) {
    return new Response();
  }

  try {
    const install = await queryCurrentAppInstallation(admin.graphql);
    const enabled = install.mythic_enabled?.value === "true";
    const apiKey = install.mythic_api_key?.value || "";
    const host = (install.mythic_api_host?.value || Constant.MYTHIC_DEFAULT_API_HOST).replace(/\/+$/, "");

    if (!enabled || !apiKey) {
      // Merchant hasn't turned Mythic on — nothing to forward.
      return new Response();
    }

    const res = await fetch(`${host}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ events: [mythicEvent] }),
    });

    if (!res.ok) {
      console.error(`[Mythic webhook] ${topic} for ${shop} -> HTTP ${res.status}`);
    }
  } catch (e) {
    // Never fail the webhook on a downstream error — Shopify would retry-storm.
    console.error(`[Mythic webhook] ${topic} for ${shop} failed`, e);
  }

  return new Response();
};
