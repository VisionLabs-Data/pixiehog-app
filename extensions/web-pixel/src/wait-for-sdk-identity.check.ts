/**
 * Run with: npx tsx extensions/web-pixel/src/wait-for-sdk-identity.check.ts
 *
 * The sleep is injected, so this runs instantly and asserts the timing shape
 * (how many reads, how many sleeps) rather than wall-clock behaviour.
 */
import assert from 'node:assert';
import {
  waitForSdkIdentity,
  shouldExpectSdk,
  SDK_IDENTITY_WAIT_ATTEMPTS,
} from './wait-for-sdk-identity';

/* ── shouldExpectSdk: unknown must not be read as "off" ──────────────────── */
// An installed pixel keeps stale settings until the merchant next saves, so a
// newly added field is absent on every existing install. Reading that as "off"
// would silently disable the fix everywhere.
for (const unknown of [undefined, null, '']) {
  assert.strictEqual(shouldExpectSdk(unknown), true, `${JSON.stringify(unknown)} must expect an SDK`);
}
assert.strictEqual(shouldExpectSdk('true'), true, "'true' expects one");
assert.strictEqual(shouldExpectSdk('false'), false, "an explicit 'false' does not");
// Pixel settings are always strings, but nothing should slip through as truthy.
assert.strictEqual(shouldExpectSdk('False'), false, 'only exact "true" enables');
assert.strictEqual(shouldExpectSdk('0'), false);
assert.strictEqual(shouldExpectSdk(false), false, 'a real boolean false still does not');
assert.strictEqual(shouldExpectSdk(true), true, 'a real boolean true still does');

/** A reader that yields `value` from attempt `readyOn` (1-based) onward. */
function readerReadyOn(readyOn: number, value = 'sdk-id') {
  const state = { reads: 0 };
  return {
    state,
    read: async () => {
      state.reads += 1;
      return state.reads >= readyOn ? value : null;
    },
  };
}

function fakeSleep() {
  const state = { sleeps: 0, total: 0 };
  return {
    state,
    sleep: async (ms: number) => {
      state.sleeps += 1;
      state.total += ms;
    },
  };
}

// Wrapped in main() because this directory compiles as CJS, where top-level
// await isn't available.
async function main() {
  // Already present: one read, zero sleeps. The overwhelmingly common case once a
  // visitor has any history, and it must not delay the event at all.
  {
    const r = readerReadyOn(1);
    const s = fakeSleep();
    assert.strictEqual(await waitForSdkIdentity({ read: r.read, sleep: s.sleep }), 'sdk-id');
    assert.strictEqual(r.state.reads, 1, 'a present id must cost exactly one read');
    assert.strictEqual(s.state.sleeps, 0, 'and must not sleep');
  }

  // Appears on the 3rd poll — the real race. Two sleeps, then success.
  {
    const r = readerReadyOn(3);
    const s = fakeSleep();
    assert.strictEqual(await waitForSdkIdentity({ read: r.read, sleep: s.sleep }), 'sdk-id');
    assert.strictEqual(r.state.reads, 3);
    assert.strictEqual(s.state.sleeps, 2, 'sleeps only between attempts');
  }

  // Never appears: null, exactly `attempts` reads, and one fewer sleep — the last
  // attempt must not sleep before giving up.
  {
    const r = readerReadyOn(Number.POSITIVE_INFINITY);
    const s = fakeSleep();
    assert.strictEqual(await waitForSdkIdentity({ read: r.read, sleep: s.sleep }), null);
    assert.strictEqual(r.state.reads, SDK_IDENTITY_WAIT_ATTEMPTS, 'budget is respected exactly');
    assert.strictEqual(s.state.sleeps, SDK_IDENTITY_WAIT_ATTEMPTS - 1, 'no trailing sleep');
  }

  // A single attempt must still read once and never sleep.
  {
    const r = readerReadyOn(Number.POSITIVE_INFINITY);
    const s = fakeSleep();
    assert.strictEqual(await waitForSdkIdentity({ read: r.read, sleep: s.sleep, attempts: 1 }), null);
    assert.strictEqual(r.state.reads, 1);
    assert.strictEqual(s.state.sleeps, 0);
  }

  // Empty string counts as absent, not as an id.
  {
    const state = { reads: 0 };
    const s = fakeSleep();
    const got = await waitForSdkIdentity({
      read: async () => {
        state.reads += 1;
        return state.reads < 2 ? '' : 'real';
      },
      sleep: s.sleep,
    });
    assert.strictEqual(got, 'real', "'' must not be mistaken for an id");
    assert.strictEqual(state.reads, 2);
  }



  console.log('web-pixel wait-for-sdk-identity: bounded, sleeps only between tries, waits once ✓');
}

main();
