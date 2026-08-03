/**
 * Regression check: PostHog and Iris must be independently usable.
 *
 * Run with: npx tsx common/dto/web-pixel-settings.check.ts
 *
 * The bug this guards: posthog_api_key had no `.default('')`, so it was a
 * required key. recalculateWebPixel builds its settings object by spreading each
 * credential in only when present, so an Iris-only shop produced an object with
 * no posthog_api_key, safeParse failed, and the failure branch — commented "this
 * probably means posthog_api_key is not set" — DELETED the web pixel. Iris could
 * not run without PostHog.
 */
import assert from 'node:assert';
import { WebPixelSettingsSchema } from './web-pixel-settings.dto';

const base = {
  tracked_events: JSON.stringify(['page_viewed']),
  data_collection_strategy: 'anonymized',
  posthog_ecommerce_spec: false,
  datalayer_enabled: false,
};

/** The predicate recalculateWebPixel uses to decide the pixel has somewhere to send. */
const hasDestination = (s: { posthog_api_key: string; iris_api_key: string; iris_enabled: boolean }) =>
  Boolean(s.posthog_api_key) || Boolean(s.iris_enabled && s.iris_api_key);

// ── Iris only: no posthog_api_key key at all, the way recalculate builds it ──
const irisOnly = WebPixelSettingsSchema.safeParse({
  ...base,
  iris_api_key: 'pk_test123',
  iris_api_host: 'https://api.adberserk.com',
  iris_enabled: true,
});
assert(irisOnly.success, 'Iris-only settings must parse — otherwise the pixel gets deleted');
assert.strictEqual(irisOnly.data.posthog_api_key, '', 'missing PostHog key must default to empty');
// posthog_api_host had the same defect in a subtler form: `.url().default('')`
// rejects its own default, because zod validates a default through the inner type.
assert.strictEqual(irisOnly.data.posthog_api_host, '', 'missing PostHog host must default to empty');
assert(hasDestination(irisOnly.data), 'Iris alone must count as a destination');

// ── PostHog only: no iris_* keys ──
const posthogOnly = WebPixelSettingsSchema.safeParse({
  ...base,
  posthog_api_key: 'phc_test123',
  posthog_api_host: 'https://us.i.posthog.com',
});
assert(posthogOnly.success, 'PostHog-only settings must parse');
assert.strictEqual(posthogOnly.data.iris_enabled, false, 'missing Iris toggle must default off');
assert(hasDestination(posthogOnly.data), 'PostHog alone must count as a destination');

// ── Both together ──
const both = WebPixelSettingsSchema.safeParse({
  ...base,
  posthog_api_key: 'phc_test123',
  posthog_api_host: 'https://us.i.posthog.com',
  iris_api_key: 'pk_test123',
  iris_enabled: true,
});
assert(both.success, 'both destinations at once must parse');

// ── Neither: parses fine, but must NOT count as having a destination, so the
//    pixel is removed rather than booting into its "no provider" throw. ──
const neither = WebPixelSettingsSchema.safeParse(base);
assert(neither.success, 'an unconfigured shop still parses');
assert(!hasDestination(neither.data), 'no credentials must mean no destination');

// Iris key present but the toggle off is still "off" — the toggle is the switch.
assert(
  !hasDestination({ posthog_api_key: '', iris_api_key: 'pk_x', iris_enabled: false }),
  'iris_enabled=false must not count, even with a key saved',
);

// An empty host now parses, which is what lets PostHog be cleared. The flip side
// is that "key set, host empty" also parses — a pixel that captures to nowhere
// and reports nothing wrong — so the general step in
// app/routes/app.destinations.$destination.tsx rejects that pairing explicitly.
// This asserts the hole the schema leaves open, so the reason for that guard
// doesn't get lost.
const keyWithoutHost = WebPixelSettingsSchema.safeParse({ ...base, posthog_api_key: 'phc_test123' });
assert(keyWithoutHost.success, 'schema alone permits a key with no host');
assert.strictEqual(keyWithoutHost.data.posthog_api_host, '', 'and leaves the host empty');

// A bad key is still rejected — defaulting must not have loosened validation.
assert(
  !WebPixelSettingsSchema.safeParse({ ...base, posthog_api_key: 'nope' }).success,
  'a malformed PostHog key must still fail',
);

console.log('web-pixel-settings: PostHog and Iris are independent ✓');
