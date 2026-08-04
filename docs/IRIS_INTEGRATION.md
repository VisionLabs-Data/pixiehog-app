# Iris Analytics Integration

VizHog forwards Shopify storefront and order events to **Iris Analytics** as a
first-class destination, alongside (or instead of) PostHog. Both providers run as
independent sinks — enable either or both.

Iris's ingestion is PostHog-shaped, so the same transformed event the pixel
builds for PostHog is sent to Iris verbatim (event name, `distinct_id`,
`properties`, `$set`/`$set_once` person properties).

## Setup

1. In **Account Setup** (`/app`), open the **Connect Iris** card.
2. Tick **Enable Iris**.
3. Paste your Iris **publishable key** (`pk_…`). The same key is used by the
   storefront pixel and by server-side order conversions.
4. Leave **Iris API Host** at the default (`https://mythic-analytics.gulp.workers.dev`)
   unless you front Iris with your own domain/proxy.
5. Save. The web pixel is (re)deployed with the Iris settings.

Consent and anonymization follow the shared **Data Collection Strategy** — the
same PII stripping applied to PostHog is applied to Iris.

## Client-side events

The pixel subscribes to Shopify Web Pixel standard events and forwards them to
`POST {host}/e?key=pk_…`. Event names honor the **Ecommerce Spec** toggle: when
on, Shopify events are renamed to the Segment/PostHog ecommerce spec.

| Shopify event | Ecommerce Spec name |
|---|---|
| `page_viewed` | `$pageview` |
| `product_viewed` | `Product Viewed` |
| `collection_viewed` | `Product List Viewed` |
| `search_submitted` | `Product List Filtered` |
| `product_added_to_cart` | `Product Added` |
| `product_removed_from_cart` | `Product Removed` |
| `cart_viewed` | `Cart Viewed` |
| `checkout_started` | `Checkout Started` |
| `checkout_*_info_submitted` | `Checkout Step Completed` |
| `payment_info_submitted` | `Payment Info Entered` |
| `checkout_completed` | `Order Completed` |

With the toggle off, the raw Shopify event names are sent.

## Server-side conversions (webhooks)

Order and refund webhooks are the **authoritative** purchase signals — they can't
be blocked by the storefront. VizHog forwards them to Iris's server ingest
(`POST {host}/ingest`, `Authorization: Bearer pk_…`).

| Shopify topic | Iris event | Stable `uuid` |
|---|---|---|
| `orders/create` | `Order Completed` | `shopify-order-<id>` |
| `orders/cancelled` | `Order Cancelled` | `shopify-order-cancel-<id>` |
| `refunds/create` | `Order Refunded` | `shopify-refund-<id>` |

`Order Completed` carries flat ecommerce properties (`order_id`, `total`,
`subtotal`, `revenue`, `tax`, `shipping`, `discount`, `currency`, `coupon`,
`products[]`) plus a `$set` person block (`email`, name, phone) when the order
has a customer, so Iris can resolve the purchase to a profile.

The per-shop Iris key is read from the app-installation metafield at webhook
time (the same value entered in the UI) — no separate credential store.

**Dedupe note — VERIFIED, and it is not what it looks like.** The stable `uuid`
is a *dedupe key we supply*, not dedupe that happens. Iris does **not** dedupe on
it today: `/ingest` publishes straight to Pub/Sub with no idempotency cache, and
`mythic_events_decoded_mv` is a plain MergeTree (uuid is an ordinary column, not
part of the sorting key or a ReplacingMergeTree version). So a Shopify webhook
re-delivery — which Shopify does on any non-2xx, repeatedly over roughly 48
hours — double-counts the order's revenue. Nor is the server `Order Completed`
deduped
against the browser's `checkout_completed`: that is a second count of the same
purchase whenever both sinks are live. Until Iris dedupes by `uuid`, pick one
purchase source per store.

## Identity resolution

The pixel keeps a single `distinct_id` (an anonymous UUID until a customer email
is known, then the email). On identify it emits a Iris `$identify` event
carrying `$anon_distinct_id` so Iris can alias the anonymous session to the
known profile — the same primitive PostHog uses.

**Session/device handoff to the storefront SDK.** Iris reads `$session_id`,
`$device_id`, `$anon_distinct_id` and `$user_id` off the event *envelope*, not
`properties` — so `pixiehog-iris.ts` lifts them out of the properties bag on the
way out. And because the pixel's own session id lives in PostHog's namespace
(a different value from the one the Iris JS SDK mints on the storefront), the
pixel shares the SDK's storage: it reads `identity` and `session` under the
`mythic_pk_<key>_` prefix and re-points the Iris sink at them. `identity` is the
authoritative record per the upstream *Identity Storage Contract* (Iris docs →
JavaScript SDK); the `distinct_id` / `device_id` keys are derived mirrors and
are never read. The pixel is READ-ONLY on the SDK's namespace: when nothing is
stored (no theme embed on the shop) it just uses its own id — see
`extensions/web-pixel/src/iris-identity.ts`. Because the cold-load race runs
both ways (the pixel has been observed minting 77ms *before* the SDK), the
first send waits — bounded at 3s — for the SDK's `identity` + `session` to
appear before reading; later events re-read fresh per event, so a
late-loading embed is adopted mid-session. On timeout the pixel proceeds with
its own ids and still writes nothing. Without the shared key, one visit
split into two sessions and two people — storefront browsing under the SDK's
ids, cart and checkout under the pixel's — and the purchase session carried no
landing page or UTMs, because the pixel only ever sees the checkout URL.
PostHog's payload is unchanged. Falls back to the pixel's own ids if the
merchant runs the SDK under a custom global name (storage prefix is then not
`mythic_`).

## Where it lives

- Pixel sink: `extensions/web-pixel/src/pixiehog-iris.ts` (wired in `src/index.ts`)
- Order transform: `app/common.server/iris/order-to-event.ts` (+ `.check.ts`)
- Webhook route: `app/routes/webhooks.orders.tsx`
- Settings: `common/dto/iris-settings.dto.ts`, metafields `iris_api_key` /
  `iris_api_host` / `iris_enabled` (namespace `pxhog`)
- Webhook subscriptions: `shopify.app.visionlabs.toml`
