# Iris SDK identity handoff — resolved; kept as a record

**From:** Vision Labs (VizHog — Shopify app, dual-sink to Mythic/Iris and PostHog)
**Component:** Mythic/Iris JavaScript SDK (`api.adberserk.com/cdn/m.js`)
**Status:** CLOSED 2026-08-03. Everything this document originally asked for has been
resolved directly with the Iris team. Do not send it; it survives only so the history
isn't re-litigated.

## Outcome

- **The authoritative reference is now published:** Iris docs → JavaScript SDK →
  *Identity Storage Contract*. `identity` (`{distinctId, anonymousId, deviceId, aliases}`)
  is the authoritative record, adopted verbatim at init when present; `distinct_id` is a
  derived mirror and must never be read; `device_id` is real state the SDK reads back.
  That contract — not this file — is what `extensions/web-pixel/src/iris-identity.ts`
  relies on.
- **SDK 2.230.5** writes `identity` write-through at init (~92–95 ms via `setItem`) and
  evicts it from the debounced (~1.2 s) batch, with an adopt-then-flush ordering test
  pinned upstream. `reset()` now rewrites the mirrors, and `aliases` is backfilled on
  legacy records.
- **`bootstrap` / `setAnonymousId` is parked, not shipped** — per Stockton. It couldn't
  have helped the case that motivated it anyway: the theme embed runs before the pixel
  exists, so an init-time id from us can't reach a cold first load.
- **Our side:** the pixel reads `identity` under `mythic_pk_<key>_` and adopts what it
  finds — read-only, nothing written to the SDK's namespace. A definitive clean-harness
  cold-load test (2026-08-03, SDK 2.231.0) showed the SDK writing `identity` at **39 ms**,
  before the pixel's first read, with pixel wire id, `getDistinctId()`, and stored record
  all agreeing on one id. The seed the pixel briefly carried never fired and was deleted.
  Shops with no theme embed just use the pixel's own id — still one consistent person.

## Original findings that still stand

Both surfaces racing on separate keys split one visitor into two people, with landing
page and UTMs stranded on the SDK's person while checkout landed on the pixel's. The
root cause was ours: reading the derived `distinct_id` mirror instead of `identity`.
Seed-adoption matrix (wipe, seed one combination, reload, read `getDistinctId()`):
only a seeded `identity` is adopted; seeded mirrors are ignored.

## A warning about the numbers this file used to contain

Earlier drafts carried timing figures (171 ms, "SDK persists ~1 s late") from harnesses
that were each measuring their own fault. Every one of these traps produced a confident
wrong conclusion during this investigation — avoid all of them when re-measuring:

1. **Clearing localStorage before navigating** — the outgoing page's SDK re-persists in
   the gap, so you measure a warm load and think the SDK wrote early.
2. **Clearing in a Playwright `addInitScript`** — it runs in *every* frame, and Shopify
   spawns same-origin `about:blank` iframes for the pixel sandbox at ~98–131 ms, i.e.
   after the SDK's write — so the clear deletes the value under test. Guard with
   `window.top !== window` plus a one-shot flag, and clear while parked on `about:blank`.
   (Injecting the password cookie into a pristine context does NOT work either:
   `storefront_digest` never appears in the cookie list, so that context serves the gate
   page with no embeds — which reads as a clean pass.)
3. **Seed-then-navigate** — tests adoption-at-init, not the cold single-load race, so it
   passes while the cold path is broken.
4. **Truncating trace output** (`| tail -n`) — the SDK's write is the FIRST entry and
   ~85 posthog-js writes sit between it and the pixel's, so tail hides it.

Also: a throttled storefront (429) serves a page with no embeds, which an unguarded
script reads as "no writes, so it adopted" — refuse to conclude unless an SDK id and a
pixel send are both present. Attribute writes by PROVENANCE, not timing: hook
`Storage.prototype.setItem` and read the stack. The working harness is preserved at
`/private/tmp/iris-handoff/cold-final.mjs` (session-temporary; recreate from this list
if gone). Do not reproduce with the recipe older versions of this file described.
