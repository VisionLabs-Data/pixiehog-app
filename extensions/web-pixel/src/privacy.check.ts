/**
 * Run with: npx tsx extensions/web-pixel/src/privacy.check.ts
 *
 * Guards the rule that decides whether identifiable customer data leaves the
 * storefront. The bug that prompted extracting this: the value was computed once
 * at pixel registration, so a shopper who revoked consent mid-session kept
 * having PII sent. Nothing errored — the events just carried too much.
 */
import assert from 'node:assert';
import { resolveAnonymous } from './privacy';

const ANON = true;
const IDENTIFIED = false;

// Consent is irrelevant to the two absolute strategies.
for (const consent of [true, false, undefined]) {
  assert.strictEqual(resolveAnonymous('anonymized', consent), ANON, 'anonymized is always anonymous');
  assert.strictEqual(
    resolveAnonymous('non-anonymized', consent),
    IDENTIFIED,
    'non-anonymized always identifies',
  );
}

// By consent: granted identifies, everything else does not.
assert.strictEqual(resolveAnonymous('non-anonymized-by-consent', true), IDENTIFIED, 'granted identifies');
assert.strictEqual(resolveAnonymous('non-anonymized-by-consent', false), ANON, 'denied stays anonymous');
assert.strictEqual(
  resolveAnonymous('non-anonymized-by-consent', undefined),
  ANON,
  'unknown consent must not read as granted',
);

// Fail closed on anything unexpected, including a strategy added later.
for (const strategy of ['', 'something-new', undefined]) {
  assert.strictEqual(resolveAnonymous(strategy, true), ANON, `"${strategy}" must fall back to anonymous`);
}

// The revocation case the frozen boolean got wrong: the same inputs, read again
// after consent flips, must produce the opposite answer.
const strategy = 'non-anonymized-by-consent';
let live: boolean | undefined = true;
const now = () => resolveAnonymous(strategy, live);
assert.strictEqual(now(), IDENTIFIED, 'identified while consent stands');
live = false;
assert.strictEqual(now(), ANON, 'revoking consent must take effect immediately');
live = true;
assert.strictEqual(now(), IDENTIFIED, 'granting again must also take effect immediately');

console.log('web-pixel privacy: consent is re-read per event ✓');
