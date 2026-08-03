/**
 * Runnable check for the Iris JS SDK config schema and its flat -> nested map.
 * Run: node common/dto/iris-js-settings.check.ts
 * (Node 22.18+ strips TS types natively.)
 */
import assert from 'node:assert';
import { IrisJsConfigSchema, toIrisSdkConfig } from './iris-js-settings.dto.ts';

// --- every field must carry a default, or the settings-row deriver throws at
// module scope when it calls _def.defaultValue() ---
for (const [key, field] of Object.entries(IrisJsConfigSchema.shape)) {
  const def = (field as any)._def;
  assert.equal(def.typeName, 'ZodDefault', `${key} must end in .default(...)`);
  assert.doesNotThrow(() => def.defaultValue(), `${key} default must be resolvable`);
  // The deriver reads .describe() off the unwrapped inner type.
  let inner: any = field;
  while (inner.isOptional() || inner.isNullable()) inner = inner._def.innerType;
  assert.ok(inner._def.description, `${key} must have a .describe(...)`);
  assert.ok(
    ['ZodEnum', 'ZodString', 'ZodNumber', 'ZodBoolean', 'ZodArray'].includes(inner._def.typeName),
    `${key} is ${inner._def.typeName} — the settings form can't render that, keep the schema flat`,
  );
}

const defaults = IrisJsConfigSchema.parse({});

// Storefront defaults: the Web Pixel owns pageviews, so the SDK must not
// double-count them.
assert.equal(defaults.capture_pageview, false);
assert.equal(defaults.capture_pageleave, false);
assert.equal(defaults.autocapture, true);
assert.equal(defaults.session_timeout, 1800000);

// --- flat -> nested ---
const sdk = toIrisSdkConfig(defaults);
assert.deepEqual(sdk.session_replay, {
  enabled: false,
  sampleRate: 1,
  minDurationMs: 10000,
  maskAllInputs: true,
  captureConsole: true,
  captureNetwork: true,
  recordNetworkHeaders: false,
  recordNetworkBody: false,
});
// Flattened keys must not leak through alongside the assembled object.
assert.ok(!Object.keys(sdk).some((k) => k.startsWith('session_replay_')));
// Empty selectors and empty arrays are omitted rather than sent as ''.
assert.ok(!('form_selector' in sdk));
assert.ok(!('sensitive_fields' in sdk));
// Plain options pass through.
assert.equal(sdk.batch_size, 10);
// localStorage, NOT the SDK's own 'localStorage+cookie' default. The Web Pixel's
// identity handoff reads only localStorage, so a cookie would be a second copy of
// identity that nothing consults at that boundary. If this assertion ever fails,
// the two paths can silently disagree about who the visitor is — don't just
// update the expected value, re-read the comment on `persistence` in the schema.
assert.equal(sdk.persistence, 'localStorage');

// Selectors, once set, land inside the nested object.
const withSelectors = toIrisSdkConfig(
  IrisJsConfigSchema.parse({
    session_replay_block_selector: '.pii',
    session_replay_mask_text_selector: '.secret',
    form_selector: 'form.checkout',
    sensitive_fields: ['cvv'],
  }),
);
assert.equal((withSelectors.session_replay as any).blockSelector, '.pii');
assert.equal((withSelectors.session_replay as any).maskTextSelector, '.secret');
assert.equal(withSelectors.form_selector, 'form.checkout');
assert.deepEqual(withSelectors.sensitive_fields, ['cvv']);

// Range guards actually reject.
assert.ok(!IrisJsConfigSchema.safeParse({ session_replay_sample_rate: 1.5 }).success);
assert.ok(!IrisJsConfigSchema.safeParse({ batch_size: 0 }).success);
assert.ok(!IrisJsConfigSchema.safeParse({ persistence: 'indexeddb' }).success);

console.log('iris-js-settings: all checks passed');
