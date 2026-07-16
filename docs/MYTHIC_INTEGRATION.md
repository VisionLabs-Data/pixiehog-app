# Mythic Analytics Integration

VizHog forwards Shopify storefront and order events to **Mythic Analytics** as a
first-class destination, alongside (or instead of) PostHog. Both providers run as
independent sinks — enable either or both.

Mythic's ingestion is PostHog-shaped, so the same transformed event the pixel
builds for PostHog is sent to Mythic verbatim (event name, `distinct_id`,
`properties`, `$set`/`$set_once` person properties).

## Setup

1. In **Account Setup** (`/app`), open the **Connect Mythic** card.
2. Tick **Enable Mythic**.
3. Paste your Mythic **publishable key** (`pk_…`). The same key is used by the
   storefront pixel and by server-side order conversions.
4. Leave **Mythic API Host** at the default (`https://mythic-analytics.gulp.workers.dev`)
   unless you front Mythic with your own domain/proxy.
5. Save. The web pixel is (re)deployed with the Mythic settings.

Consent and anonymization follow the shared **Data Collection Strategy** — the
same PII stripping applied to PostHog is applied to Mythic.

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
be blocked by the storefront. VizHog forwards them to Mythic's server ingest
(`POST {host}/ingest`, `Authorization: Bearer pk_…`).

| Shopify topic | Mythic event | Stable `uuid` (dedupe key) |
|---|---|---|
| `orders/create` | `Order Completed` | `shopify-order-<id>` |
| `orders/cancelled` | `Order Cancelled` | `shopify-order-cancel-<id>` |
| `refunds/create` | `Order Refunded` | `shopify-refund-<id>` |

`Order Completed` carries flat ecommerce properties (`order_id`, `total`,
`subtotal`, `revenue`, `tax`, `shipping`, `discount`, `currency`, `coupon`,
`products[]`) plus a `$set` person block (`email`, name, phone) when the order
has a customer, so Mythic can resolve the purchase to a profile.

The per-shop Mythic key is read from the app-installation metafield at webhook
time (the same value entered in the UI) — no separate credential store.

**Dedupe note:** the stable `uuid` dedupes webhook re-deliveries. It does **not**
dedupe the server `Order Completed` against the browser's `checkout_completed`.
Mythic treats the server event as authoritative; suppress the client
`checkout_completed` if you need exactly one purchase per order.

## Identity resolution

The pixel keeps a single `distinct_id` (an anonymous UUID until a customer email
is known, then the email). On identify it emits a Mythic `$identify` event
carrying `$anon_distinct_id` so Mythic can alias the anonymous session to the
known profile — the same primitive PostHog uses.

## Where it lives

- Pixel sink: `extensions/web-pixel/src/pixiehog-mythic.ts` (wired in `src/index.ts`)
- Order transform: `app/common.server/mythic/order-to-event.ts` (+ `.check.ts`)
- Webhook route: `app/routes/webhooks.orders.tsx`
- Settings: `common/dto/mythic-settings.dto.ts`, metafields `mythic_api_key` /
  `mythic_api_host` / `mythic_enabled` (namespace `pxhog`)
- Webhook subscriptions: `shopify.app.visionlabs.toml`
