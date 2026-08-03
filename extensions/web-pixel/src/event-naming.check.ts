/**
 * Run with: npx tsx extensions/web-pixel/src/event-naming.check.ts
 *
 * Two rules that decide what lands in a customer's analytics, both silent if
 * wrong — events keep flowing, just under the wrong names or on the wrong person.
 *
 * 1. Each destination renames independently. The pixel used to rename ONCE and
 *    send the same name everywhere, so PostHog's ecommerce-spec toggle silently
 *    decided Iris's event names too.
 * 2. Iris's flag, when it has never been set, inherits PostHog's — so turning
 *    this feature on doesn't rewrite the event names an existing shop is already
 *    receiving.
 */
import assert from 'node:assert';
import { webPixelToPostHogEcommerceSpecMap } from './posthog-ecommerce-spec/event-map';

/** The resolver from index.ts, per destination. */
const resolveEventName = (name: string, useSpec: boolean) =>
  useSpec ? webPixelToPostHogEcommerceSpecMap[name] || name : name;

/** The inheritance rule from recalculateWebPixel. */
function resolveIrisSpec(irisRaw: string | null | undefined, posthogSpec: boolean): boolean {
  return irisRaw === undefined || irisRaw === null ? posthogSpec : irisRaw === 'true';
}

/* ── Renaming is per destination ─────────────────────────────────────────── */
assert.strictEqual(resolveEventName('page_viewed', true), '$pageview', 'spec on renames');
assert.strictEqual(resolveEventName('page_viewed', false), 'page_viewed', 'spec off keeps Shopify');

// The case that motivated the split: the same source event, two destinations,
// two settings, two names — and neither destination can change the other's.
const source = 'product_viewed';
assert.strictEqual(resolveEventName(source, true), 'Product Viewed');
assert.strictEqual(resolveEventName(source, false), 'product_viewed');
assert.notStrictEqual(
  resolveEventName(source, true),
  resolveEventName(source, false),
  'the two flags must be able to produce different names for one event',
);

// An event with no spec equivalent passes through under either flag, rather than
// becoming undefined — the map is a partial Record.
for (const useSpec of [true, false]) {
  assert.strictEqual(
    resolveEventName('clicked', useSpec),
    'clicked',
    'an unmapped event keeps its Shopify name',
  );
  assert.strictEqual(resolveEventName('input_blurred', useSpec), 'input_blurred');
}

// Every mapped name must be non-empty, or an event would go out unnamed.
for (const [shopify, spec] of Object.entries(webPixelToPostHogEcommerceSpecMap)) {
  assert.ok(spec, `${shopify} maps to an empty name`);
  assert.strictEqual(resolveEventName(shopify, true), spec);
}

/* ── Iris inherits until it has its own value ────────────────────────────── */
// Never set: follow PostHog, in both directions. This is what keeps an existing
// shop's Iris data on the names it already had.
assert.strictEqual(resolveIrisSpec(undefined, true), true, 'unset follows PostHog on');
assert.strictEqual(resolveIrisSpec(undefined, false), false, 'unset follows PostHog off');
assert.strictEqual(resolveIrisSpec(null, true), true, 'null is also unset');

// Once set, it stands alone — including the case that looks like "unset" if you
// test truthiness instead of presence.
assert.strictEqual(resolveIrisSpec('false', true), false, "an explicit 'false' must beat PostHog on");
assert.strictEqual(resolveIrisSpec('true', false), true, "an explicit 'true' must beat PostHog off");

// Anything that isn't exactly 'true' is off, not "inherit".
assert.strictEqual(resolveIrisSpec('', true), false, "'' is a set value, not unset");
assert.strictEqual(resolveIrisSpec('False', true), false);

console.log('web-pixel event-naming: per-destination renaming, Iris inherits until set ✓');
