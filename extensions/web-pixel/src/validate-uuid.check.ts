/**
 * Run with: npx tsx extensions/web-pixel/src/validate-uuid.check.ts
 *
 * Two things worth holding still here: the real Shopify id shape must parse, and
 * it must parse WITHOUT logging — the old version warned on every event because
 * it tested the prefixed id first and treated the expected failure as an error.
 */
import assert from 'node:assert';
import { extractEventUUID } from './validate-uuid';

/** Runs fn and returns everything it sent to console.warn. */
function captureWarnings(fn: () => void): string[] {
  const seen: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void seen.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return seen;
}

// The exact id from a live storefront. Note the variant nibble `1` — not RFC 4122
// conformant, so a strict validator would throw this away.
const REAL = 'sh-c9ac130f-EF2A-4A3C-1A13-92F2E7A19D32';
const REAL_UUID = 'c9ac130f-EF2A-4A3C-1A13-92F2E7A19D32';

let warnings = captureWarnings(() => {
  assert.strictEqual(extractEventUUID(REAL), REAL_UUID, 'the sh- prefix must be stripped');
});
assert.deepStrictEqual(warnings, [], 'a normal Shopify event id must not warn');

// Already-bare UUIDs pass through untouched, and still silently.
warnings = captureWarnings(() => {
  assert.strictEqual(extractEventUUID(REAL_UUID), REAL_UUID, 'a bare uuid passes through');
  assert.strictEqual(
    extractEventUUID('123e4567-e89b-12d3-a456-426614174000'),
    '123e4567-e89b-12d3-a456-426614174000',
    'lowercase uuid passes through',
  );
});
assert.deepStrictEqual(warnings, [], 'valid ids must never warn');

// Absent id: undefined, no noise — a missing id isn't a malformed one.
warnings = captureWarnings(() => {
  assert.strictEqual(extractEventUUID(undefined), undefined);
  assert.strictEqual(extractEventUUID(''), undefined);
});
assert.deepStrictEqual(warnings, [], 'a missing id must not warn');

// Genuinely unparseable input: undefined, and exactly ONE warning naming the
// original id (not the stripped fragment, which would be confusing to debug).
for (const bad of ['not-a-uuid', 'sh-also-not-a-uuid', 'sh-', 'deadbeef', '12345']) {
  warnings = captureWarnings(() => {
    assert.strictEqual(extractEventUUID(bad), undefined, `"${bad}" must not parse`);
  });
  assert.strictEqual(warnings.length, 1, `"${bad}" must warn exactly once, got ${warnings.length}`);
  assert.ok(warnings[0].includes(bad), `the warning must quote the original id, got: ${warnings[0]}`);
}

// A uuid with extra trailing content must be rejected outright, not truncated —
// silently accepting a prefix of a longer string would mint colliding ids.
warnings = captureWarnings(() => {
  assert.strictEqual(extractEventUUID(`${REAL_UUID}-extra`), undefined, 'no partial matches');
});
assert.strictEqual(warnings.length, 1, 'a malformed id warns');

console.log('web-pixel validate-uuid: Shopify ids parse silently ✓');
