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
first send is defended in two layers. **Gate:** it waits — 50ms poll, 3s cap,
first probe immediate so warm loads never wait — for the SDK's
`identity` + `session` to appear, so the pageview joins the SDK's session and
session-level attribution stays whole (an alias can't fix sessions after the
fact; events are immutable once sent). **Heal on timeout:** it sends under a
self-minted id, watches storage in the background, and when the SDK's record
appears with a different id emits one `$create_alias` (`distinct_id` = the
SDK's id, `properties.alias` = the minted id); Iris's identity processor
allows anonymous→anonymous aliases and merges the two persons, reattaching
the orphan event. Later events re-read fresh per event, so a late-loading
embed is adopted mid-session anyway. Known residual: a healed orphan keeps
its own session row in session analytics, and an instant bounce before the
SDK's record ever appears stays split. Without the shared key, one visit
split into two sessions and two people — storefront browsing under the SDK's
ids, cart and checkout under the pixel's — and the purchase session carried no
landing page or UTMs, because the pixel only ever sees the checkout URL.
PostHog's payload is unchanged. Falls back to the pixel's own ids if the
merchant runs the SDK under a custom global name (storage prefix is then not
`mythic_`).

## Privacy: erasure relay (pending upstream)

VizHog persists **no** customer data — `Session` is the only Prisma model — so
the mandatory privacy webhooks record that fact rather than deleting rows; see
`app/common.server/compliance.ts`. The customer copies live in the merchant's own
PostHog project and Iris workspace, and we hold ingest-only credentials for both
(`phc_` can't delete — PostHog needs a personal API key; Iris `pk_` only ingests).

Iris is building `DELETE /client/v1/data/people/:id` (likely async). When it
ships, `webhooks.customers.redact.tsx` can relay instead of handing the request
back to the merchant. That needs a secret-key setting in the UI, deliberately
**not built yet** — the Iris team will publish path, method, credential and
sync-vs-async together so it's one piece of work.

Their current design direction (not ratified — pending Stockton, along with
whether erasure gets its own permission scope rather than riding an existing
role): a **location-scoped secret key**, since their `sk_` prefix already binds
to exactly one location. The credential would then carry the tenant and the relay
sends no location at all.

The payload they want, and what we can actually supply from Shopify's
`customers/redact` webhook:

| Field | Source | Have it? |
|---|---|---|
| `shop_domain` | webhook `shop` | yes |
| Shopify `customer_id` | `payload.customer.id` | yes |
| `email` | `payload.customer.email` | yes |
| `phone` | `payload.customer.phone` | yes |
| `requested_at` | receipt time | yes |
| `location_id` | — | **not sent** — VizHog has no location concept; derived from the credential |
| anon / device ids | — | **no** — we persist nothing, so we can't enumerate them |

The two gaps are structural, not an omission, and both were accepted as design
inputs: partial identity sets are the target, and location is derived rather than
required. Because VizHog keeps no customer records, the email from Shopify's
payload is the **only** handle we can hand over — the pixel's anonymous and
device ids exist solely inside Iris's merge graph, put there by our own events
and `$create_alias`. Their executor resolving the whole merge component from one
identity value is what makes that sufficient, and it now matches email against
both the identity graph and person properties, case-insensitively (an email that
arrived only as a `$set` and never became a merge key used to resolve nothing and
report `no_match` — a deletion that looked successful and erased nothing).

**Stated limit, not a gap:** a visitor who browsed anonymously and never
identified is unreachable through VizHog by construction — we never learned an
email, so there is nothing to hand over. The only way to change that would be for
VizHog to retain customer records, which is worse for everyone. Iris documents
this on their side too.

## Where it lives

- Pixel sink: `extensions/web-pixel/src/pixiehog-iris.ts` (wired in `src/index.ts`)
- Order transform: `app/common.server/iris/order-to-event.ts` (+ `.check.ts`)
- Webhook route: `app/routes/webhooks.orders.tsx`
- Settings: `common/dto/iris-settings.dto.ts`, metafields `iris_api_key` /
  `iris_api_host` / `iris_enabled` (namespace `pxhog`)
- Webhook subscriptions: `shopify.app.visionlabs.toml`
