# Feature request: let the caller supply the initial anonymous ID

**From:** Vision Labs (VizHog — Shopify app, dual-sink to Mythic/Iris and PostHog)
**Component:** Mythic/Iris JavaScript SDK (`api.adberserk.com/cdn/m.js`) + capture API
**Date:** 2026-08-03

## Summary

We have two surfaces that both represent one visitor, and no supported way to make
them agree on an anonymous ID. The SDK mints its own on init and offers no
init-time option to supply one, so whichever surface starts first defines an
identity the other cannot join.

We are currently working around this by writing the SDK's internal
`mythic_pk_<key>_identity` localStorage record ourselves before the SDK loads. It
works, but it depends on an undocumented internal shape and will break silently
whenever that shape changes. We would like a supported API instead.

**The ask, in one line:** an `init()` option that supplies the anonymous ID to use
when no stored identity exists — the equivalent of PostHog's `bootstrap.distinctId`.

## Environment

A Shopify app can only track from two places, and both are mandatory:

| Surface | What it is | Runs on |
|---|---|---|
| **Theme app embed** | Your JS SDK, normal browser context | Storefront pages only |
| **Web Pixel** | Sandboxed worker, no DOM, HTTP capture only | Storefront **and checkout** |

Checkout is not scriptable, so the SDK cannot run there — the Web Pixel is the only
way to capture `checkout_started`, `payment_info_submitted`, and
`checkout_completed`. Storefront browsing (landing page, UTMs, product views) is
best captured by the SDK. So every purchase necessarily spans both surfaces, and
they have to resolve to one person or the funnel breaks at exactly the step that
matters.

Shopify proxies `browser.localStorage` in the pixel sandbox to the storefront
document, so the two surfaces *can* share storage. That is the only channel between
them — there is no shared JS context.

## The problem

The pixel reaches its first event about a second before the SDK publishes an
identity. Measured on a live storefront:

```
~2.1s   Web Pixel sends its first event (page_viewed)
~3.1s   SDK writes its identity to localStorage
```

So on a cold first visit the pixel reads storage, finds nothing, and has to use its
own ID. A second later the SDK mints a *different* one. Result: one visit lands as
two people — storefront browsing under the SDK's ID, cart and checkout under ours.
The purchase then has no landing page and no UTMs, because the pixel only ever sees
the checkout URL.

Reversing the order doesn't help either way round: whoever is first mints an ID the
other has no supported way to adopt.

### For contrast: PostHog has no such problem

`posthog-js` accepts the ID at init:

```js
posthog.init(key, { bootstrap: { distinctId: knownId } })
```

…and its server-side client accepts the same. Both surfaces are peer *writers* on
one shared storage key, so whichever runs first defines the ID and the other adopts
it. No merge, no extra event, no race. That's the shape we're asking for.

## What we tried

**1. Block the first pixel event until the SDK publishes an identity.** Rejected:
it delays the landing pageview by up to a second, and a delayed event is lost
outright if the shopper navigates away first. Trading a mis-attributed pageview for
a missing one.

**2. Send immediately, then alias with `$identify` + `$anon_distinct_id`.** This
works, and we shipped it briefly. But it costs an extra event and a merge per
visitor for something that was knowable up front, and merges resolve into reports
on a ~24h identity snapshot — so same-day funnels still show the split. A
bootstrap avoids the merge entirely rather than repairing it after the fact.

**3. Seed the SDK's localStorage record ourselves.** What we're doing now. We
determined experimentally which key is authoritative — wipe all `mythic_*` keys,
seed one combination, reload, read `mythic.getDistinctId()`:

| Seeded | SDK adopts it? |
|---|---|
| `distinct_id` | **No** — minted its own |
| `distinct_id` + `device_id` | **No** — minted its own |
| `identity` | **Yes** |
| `identity` + `distinct_id` + `device_id` | **Yes** |

So `identity` is authoritative and `distinct_id` / `device_id` are mirrors the SDK
rewrites from it on init. We now write, before the SDK loads:

```js
localStorage.setItem(`mythic_pk_${key}_identity`, JSON.stringify({
  distinctId: ourAnonymousId,
  anonymousId: ourAnonymousId,
  deviceId: ourDeviceId,
  aliases: [],
}));
```

**Why this isn't good enough:**

- It's an undocumented internal. Any change to the record shape, the key name, or
  the init-time precedence breaks it — silently, because events keep flowing and
  only the attribution is wrong. That's the hardest class of bug to notice.
- It assumes the default `mythic` global name. A custom `__mythic_global_name`
  changes the prefix and we seed a key nothing reads.
- We're writing a record we don't own, so we can't tell a stale record from a valid
  one, and we can't safely populate the fields we don't understand.

## What we're asking for

**1. Primary — an init-time anonymous ID.** Something equivalent to:

```js
mythic.init(key, {
  bootstrap: {
    distinctId: 'shared-anonymous-id',
    deviceId: 'shared-device-id',   // optional
  },
});
```

Semantics that would work for us: **use this ID when no stored identity exists;
never override a stored one.** That preserves returning visitors and keeps the
"first writer wins" symmetry — we'd pass the ID unconditionally and let the SDK
decide. A pre-init `mythic.setAnonymousId(id)` on the existing stub queue would
serve equally well; the config option is just easier for us to render into a Liquid
snippet.

**2. Secondary — session.** Even with identity solved, on a cold load the pixel has
no session ID to attach to, because the SDK hasn't created one yet. We deliberately
do *not* seed `session`: it carries `landingPage` and `utm`, and a hand-built record
would clobber exactly the attribution we're trying to protect. So a cold first event
currently goes out with no `$session_id`.

If there were a supported way to either seed a session or read a session ID the SDK
will commit to, we'd use it. Lower priority than identity — a wrong person splits a
profile permanently, a missing `$session_id` on one event is cosmetic by comparison.

**3. Nice to have — document the storage contract.** If a bootstrap option isn't on
the roadmap, then documenting the `identity` record shape and its init-time
precedence, with a compatibility guarantee, would at least make our current
workaround something we can rely on rather than something we're getting away with.

## Reproducing

Any Shopify store with both the Iris theme app embed and a Web Pixel active. On a
cold browser profile, load a storefront page and compare `mythic.getDistinctId()`
in the console against the `distinct_id` the pixel sent. Without the workaround
they differ; the divergence is visible in the events API as two people sharing one
session's worth of activity.

Happy to jump on a call, share the pixel source, or test a pre-release build
against our store.
