# Iris SDK: reading the right identity key, and one feature request

**From:** Vision Labs (VizHog — Shopify app, dual-sink to Mythic/Iris and PostHog)
**Component:** Mythic/Iris JavaScript SDK (`api.adberserk.com/cdn/m.js`)
**Date:** 2026-08-03

> **Read this first.** An earlier draft of this document reported that the SDK persisted
> its identity ~1s *after* our pixel needed it, and asked for an init-time bootstrap
> option to work around that. **That measurement was wrong** — the cold-start clear was
> done before navigation, so the outgoing page's SDK re-persisted and the "cold" load was
> actually warm. Corrected numbers below. There is **no bug on the SDK side**; the fault
> was ours, reading a derived key. The remaining request is a genuine nice-to-have, not a
> fix. Keeping the original framing here would have sent you chasing a problem that
> doesn't exist.

## What was actually wrong (ours)

The SDK keeps its state in localStorage under `mythic_pk_<publishableKey>_`. Measured on a
live storefront, on a genuinely cold load (clear performed in an init script at
`document_start`, so no other SDK instance is alive to re-persist):

| Key | First visible |
|---|---|
| `identity` | **171 ms** |
| `distinct_id` (mirror) | 1967 ms |
| `device_id` (mirror) | 1967 ms |
| `session` | 1967 ms |

Our Shopify Web Pixel sends its first event at ~2100 ms. It was reading
**`distinct_id`** — which lands at 1967 ms, ~130 ms of margin — so it raced, and lost
often enough to split visitors across two people. `identity` was available the whole time,
at 171 ms, with more than a 10× margin.

**Fix, entirely on our side:** read `identity.distinctId`, never the `distinct_id` mirror.

We also confirmed which key the SDK honours on init — wipe all `mythic_*`, seed one
combination, reload, read `mythic.getDistinctId()`:

| Seeded | Adopted? |
|---|---|
| `distinct_id` | **No** — SDK minted its own |
| `distinct_id` + `device_id` | **No** |
| `identity` | **Yes** |

So `identity` is authoritative on read *and* on write, and the mirrors are derived state
the SDK rewrites from it. That's consistent, and it's what we now rely on.

## Why we're touching your storage at all

For context, since it explains the remaining request. A Shopify app can only track from
two places, and both are mandatory:

- **Theme app embed** — your JS SDK, normal browser context, storefront pages only.
- **Web Pixel** — a sandboxed worker, no DOM, HTTP capture only. This is the *only* way to
  capture checkout (`checkout_started`, `payment_info_submitted`, `checkout_completed`),
  because Shopify checkout is not scriptable.

Every purchase therefore spans both surfaces, and they must resolve to one person or the
funnel breaks at exactly the step that matters. Shopify proxies `browser.localStorage` in
the pixel sandbox to the storefront document, so shared storage is the only channel
between them — there is no shared JS context.

Our pixel now reads `identity` and adopts whatever is there. If nothing is stored (SDK not
installed on that shop, or an unusually slow bundle load) it mints an id and writes the
`identity` record itself, so the SDK adopts ours rather than minting a second one. In
practice that write is now a rare fallback rather than the normal path.

## The remaining request (nice-to-have, not a fix)

**An init-time anonymous ID**, so we don't have to write your record ourselves even in the
fallback case:

```js
mythic.init(key, { bootstrap: { distinctId: '…', deviceId: '…' } });
```

Semantics that would work: **use the supplied ID when nothing is stored; never override a
stored one.** Then we pass it unconditionally and the SDK decides. A pre-init
`mythic.setAnonymousId(id)` on the existing stub queue would do just as well.

Writing your `identity` record from outside is the part we'd like to stop doing — not
because it races any more, but because it depends on an internal shape that could change
in any release, and it would fail silently if it did: events keep flowing, only attribution
goes wrong.

If a bootstrap option isn't worth it for one embedder, the equally good answer is to
**document `identity` as the stable, authoritative record** — its shape, its init-time
precedence, and that the mirrors are derived — with a compatibility guarantee. That turns
our fallback from something we're getting away with into something we can rely on.

## Questions we'd still like answered

1. Is `identity` written **synchronously during `init()`**, or on a timer? Our 171 ms needs
   to be a guarantee, not luck on one connection.
2. Are `distinct_id` / `device_id` ever authoritative, or are they purely derived and safe
   for us to ignore permanently?
3. What happens to `identity` and the mirrors on `reset()`? That's the one path where we
   could read a stale id.

## Reproducing

Any Shopify store with both the Iris theme app embed and a Web Pixel active. Clear
`mythic_*` in an init script at `document_start` (not before navigation — that's the trap
we fell into), then log first-appearance times for each key.
