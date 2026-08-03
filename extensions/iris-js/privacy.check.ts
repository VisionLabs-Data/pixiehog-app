/**
 * Checks the strategy → SDK-config mapping the Iris theme embed applies.
 *
 * Run with: npx tsx extensions/iris-js/privacy.check.ts
 *
 * This is the one piece of the embed worth checking without a browser: it decides
 * whether identifiable data leaves a storefront, and getting it wrong is silent —
 * events keep flowing, they just carry more than they should.
 */
import assert from 'node:assert';
// @ts-expect-error - plain JS asset, no types; that's the point (the storefront
// imports the same file, so a .d.ts would be a second thing to keep in sync).
import { irisPrivacyOverrides, analyticsAllowed, applyOverrides } from './assets/privacy.js';

/* ── anonymized: nothing that identifies a person may be on ──────────────── */
const anon = irisPrivacyOverrides('anonymized');
for (const key of ['auto_form_identify', 'auto_input_capture', 'capture_copied_text']) {
  assert.strictEqual(anon[key], false, `anonymized must force ${key} off`);
}
assert.strictEqual(anon.session_replay_mask_all_inputs, true, 'anonymized must mask replay inputs');
assert.strictEqual(anon.requireConsent, false, 'anonymized captures without consent, just not identifiably');

/* ── an unknown strategy must fail to the strictest option, not the loosest ─ */
assert.deepStrictEqual(
  irisPrivacyOverrides('something-new-we-added-later'),
  anon,
  'an unrecognized strategy must behave as anonymized',
);
assert.deepStrictEqual(irisPrivacyOverrides(''), anon, 'an unset strategy must behave as anonymized');

/* ── by-consent: withhold until granted ──────────────────────────────────── */
assert.strictEqual(
  irisPrivacyOverrides('non-anonymized-by-consent').requireConsent,
  true,
  'by-consent must set requireConsent',
);

/* ── non-anonymized: the merchant's own settings stand ───────────────────── */
assert.deepStrictEqual(irisPrivacyOverrides('non-anonymized'), {}, 'non-anonymized forces nothing');

/* ── analyticsAllowed: every unknown must read as "not allowed" ──────────── */
assert.strictEqual(analyticsAllowed({ analyticsAllowed: true }, null), true, 'event detail wins');
assert.strictEqual(analyticsAllowed({ analyticsAllowed: false }, null), false, 'denied stays denied');
assert.strictEqual(
  analyticsAllowed({ analyticsAllowed: false }, { analyticsProcessingAllowed: () => true }),
  false,
  'a denying event detail must not be overridden by the live API',
);
assert.strictEqual(
  analyticsAllowed(null, { analyticsProcessingAllowed: () => true }),
  true,
  'falls back to the live API on first run',
);
assert.strictEqual(analyticsAllowed(null, null), false, 'no API means not allowed');
assert.strictEqual(analyticsAllowed(undefined, undefined), false, 'undefined means not allowed');
assert.strictEqual(analyticsAllowed(null, {}), false, 'an API missing the method means not allowed');
assert.strictEqual(
  analyticsAllowed(null, {
    analyticsProcessingAllowed: () => {
      throw new Error('consent API blew up');
    },
  }),
  false,
  'a throwing API must not be read as consent',
);
// Shopify returns a boolean, but a truthy non-boolean must not pass for granted.
assert.strictEqual(
  analyticsAllowed(null, { analyticsProcessingAllowed: () => 'yes' as never }),
  false,
  'only a strict true counts as granted',
);

/* ── applyOverrides: the nested replay flag must survive the flat override ── */
assert.deepStrictEqual(
  applyOverrides({ session_replay: { enabled: true, maskAllInputs: false, sampleRate: 0.5 } }, anon),
  {
    session_replay: { enabled: true, maskAllInputs: true, sampleRate: 0.5 },
    requireConsent: false,
    auto_form_identify: false,
    auto_input_capture: false,
    capture_copied_text: false,
  },
  'masking is forced on without discarding the rest of the replay config',
);
// Replay off stays off — masking an unused feature shouldn't switch it on.
assert.strictEqual(
  applyOverrides({ session_replay: false }, anon).session_replay,
  false,
  'forcing input masking must not enable replay',
);
assert.strictEqual(
  'session_replay' in applyOverrides({}, anon),
  false,
  'no replay config means none is invented',
);
// The flat key must never reach init() — the SDK only knows the nested shape.
for (const cfg of [{}, { session_replay: false }, { session_replay: { enabled: true } }]) {
  assert.strictEqual(
    'session_replay_mask_all_inputs' in applyOverrides(cfg, anon),
    false,
    'the flat replay key must be translated, never passed through',
  );
}
// Must not mutate the caller's config.
const original = { auto_form_identify: true };
applyOverrides(original, anon);
assert.strictEqual(original.auto_form_identify, true, 'applyOverrides must not mutate its input');

console.log('iris-js privacy: strategy mapping and consent reads are safe ✓');
