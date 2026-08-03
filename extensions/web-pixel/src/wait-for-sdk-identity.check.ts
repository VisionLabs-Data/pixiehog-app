/**
 * Run with: npx tsx extensions/web-pixel/src/wait-for-sdk-identity.check.ts
 *
 * The sleep is injected, so this runs instantly and asserts the timing shape
 * (how many reads, how many sleeps) rather than wall-clock behaviour.
 */
import assert from 'node:assert';
import {
  waitForSdkIdentity,
  onceWaiter,
  shouldWaitForSdk,
  SDK_IDENTITY_WAIT_ATTEMPTS,
} from './wait-for-sdk-identity';

/* ── shouldWaitForSdk: unknown must not be read as "off" ─────────────────── */
// An installed pixel keeps stale settings until the merchant next saves, so a
// newly added field is absent on every existing install. Reading that as "off"
// would silently disable the fix everywhere.
for (const unknown of [undefined, null, '']) {
  assert.strictEqual(shouldWaitForSdk(unknown), true, `${JSON.stringify(unknown)} must wait`);
}
assert.strictEqual(shouldWaitForSdk('true'), true, "'true' waits");
assert.strictEqual(shouldWaitForSdk('false'), false, "an explicit 'false' skips the wait");
// Pixel settings are always strings, but nothing should slip through as truthy.
assert.strictEqual(shouldWaitForSdk('False'), false, 'only exact "true" enables');
assert.strictEqual(shouldWaitForSdk('0'), false);
assert.strictEqual(shouldWaitForSdk(false), false, 'a real boolean false still skips');
assert.strictEqual(shouldWaitForSdk(true), true, 'a real boolean true still waits');

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

  // onceWaiter: the whole point. A storefront with no SDK must pay the timeout
  // once, not once per event.
  {
    const r = readerReadyOn(Number.POSITIVE_INFINITY);
    const s = fakeSleep();
    const waiter = onceWaiter({ read: r.read, sleep: s.sleep });
    const results = await Promise.all([waiter(), waiter(), waiter()]);
    assert.deepStrictEqual(results, [null, null, null]);
    assert.strictEqual(r.state.reads, SDK_IDENTITY_WAIT_ATTEMPTS, 'three callers, one wait');
  }

  // And a later caller still gets the found value without re-reading.
  {
    const r = readerReadyOn(2);
    const s = fakeSleep();
    const waiter = onceWaiter({ read: r.read, sleep: s.sleep });
    assert.strictEqual(await waiter(), 'sdk-id');
    const readsAfterFirst = r.state.reads;
    assert.strictEqual(await waiter(), 'sdk-id', 'the result is cached');
    assert.strictEqual(r.state.reads, readsAfterFirst, 'no further reads');
  }

  console.log('web-pixel wait-for-sdk-identity: bounded, sleeps only between tries, waits once ✓');
}

main();
