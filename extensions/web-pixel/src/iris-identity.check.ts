/**
 * Run with: npx tsx extensions/web-pixel/src/iris-identity.check.ts
 *
 * The pixel and the Iris SDK have to land on ONE id. Every failure here is
 * silent — events keep flowing, they just attach to two different people, with
 * the landing page and UTMs stranded on whichever one the SDK invented.
 *
 * Verified against a live storefront and encoded here: the SDK adopts
 * `identity.distinctId` and ignores seeded `distinct_id` / `device_id` mirrors.
 */
import assert from 'node:assert';
import type { IrisIdentity } from './iris-identity';
import { chooseIrisDistinctId, resolveIrisIdentity } from './iris-identity';

/** An in-memory stand-in for the sandbox's proxied localStorage. */
function io(stored: IrisIdentity | null, pixelDistinctId = 'pixel-id') {
  const writes: IrisIdentity[] = [];
  let mints = 0;
  return {
    writes,
    mintCount: () => mints,
    current: () => stored,
    io: {
      read: async () => stored,
      write: async (record: IrisIdentity) => {
        stored = record;
        writes.push(record);
      },
      mintId: () => `minted-${++mints}`,
      pixelDistinctId,
    },
  };
}

async function main() {
  /* ── Warm visit: the SDK got there first, so adopt its id ─────────────────── */
  {
    const h = io({ distinctId: 'sdk-abc', deviceId: 'sdk-dev', aliases: [] });
    const got = await resolveIrisIdentity(h.io);
    assert.strictEqual(got.distinctId, 'sdk-abc', "must adopt the SDK's stored id");
    assert.strictEqual(got.deviceId, 'sdk-dev');
    assert.strictEqual(got.seeded, false);
    assert.strictEqual(h.writes.length, 0, 'adopting must not overwrite the SDK');
  }

  /* ── Cold visit: nothing stored, so mint AND write so the SDK adopts ours ─── */
  {
    const h = io(null);
    const got = await resolveIrisIdentity(h.io);
    assert.strictEqual(got.seeded, true);
    assert.strictEqual(got.distinctId, 'pixel-id', "reuse the pixel's id, don't invent a third");
    assert.strictEqual(h.writes.length, 1, 'a cold visit MUST write — this is the whole fix');
    // The SDK reads `distinctId`; writing only `anonymousId` would be ignored and
    // the SDK would mint its own, which is the bug this replaces.
    assert.strictEqual(h.writes[0].distinctId, 'pixel-id', 'the key the SDK actually reads');
    assert.strictEqual(h.writes[0].anonymousId, 'pixel-id');
    assert.deepStrictEqual(h.writes[0].aliases, [], 'match the shape the SDK writes');
    // Must NOT invent a device id. device_id is real state the SDK reads back and
    // can mirror to a cookie, so it outlives `identity`: a browser whose
    // localStorage was cleared but whose cookie survived still has one. Minting
    // here would fork that browser into two devices.
    assert.ok(
      !('deviceId' in h.writes[0]),
      'must omit deviceId entirely so the SDK can recover its own',
    );
    assert.strictEqual(got.deviceId, null, 'no device id is honest when none is stored');
  }

  /* ── An existing device_id is carried through, never replaced ────────────── */
  {
    const h = io(null);
    const got = await resolveIrisIdentity({ ...h.io, storedDeviceId: 'sdk-device-7' });
    assert.strictEqual(got.seeded, true);
    assert.strictEqual(got.deviceId, 'sdk-device-7', 'reuse the device the SDK already has');
    assert.strictEqual(h.writes[0].deviceId, 'sdk-device-7');
    assert.strictEqual(h.writes[0].distinctId, 'pixel-id', 'still a fresh person id');
  }

  /* ── An empty or malformed stored record counts as absent, not as an id ───── */
  for (const bad of [{}, { distinctId: '' }, { distinctId: undefined }] as IrisIdentity[]) {
    const h = io(bad);
    const got = await resolveIrisIdentity(h.io);
    assert.strictEqual(got.seeded, true, `${JSON.stringify(bad)} must be treated as absent`);
    assert.strictEqual(got.distinctId, 'pixel-id');
  }

  /* ── A known visitor must not be seeded as the anonymous id ──────────────── */
  // Seeding the email would skip the alias Iris needs to attach the anonymous
  // browsing history to the person.
  {
    const h = io(null, 'shopper@example.com');
    const got = await resolveIrisIdentity(h.io);
    assert.strictEqual(got.seeded, true);
    assert.ok(!got.distinctId.includes('@'), 'the seeded anonymous id must not be an email');
    assert.strictEqual(got.distinctId, 'minted-1', 'mint a fresh anonymous id instead');
    assert.ok(!h.writes[0].anonymousId?.includes('@'));
  }

  /* ── Storage failures must not take capture down ─────────────────────────── */
  {
    let mints = 0;
    const got = await resolveIrisIdentity({
      read: async () => {
        throw new Error('localStorage blocked');
      },
      write: async () => {
        throw new Error('localStorage blocked');
      },
      mintId: () => `minted-${++mints}`,
      pixelDistinctId: 'pixel-id',
    });
    // Unstitched but self-consistent: this page's events still agree with each other.
    assert.strictEqual(got.distinctId, 'pixel-id', 'a blocked write still yields a usable id');
  }

  /* ── Which id an event goes out under ───────────────────────────────────── */
  assert.strictEqual(chooseIrisDistinctId('pixel-id', 'sdk-abc'), 'sdk-abc', 'shared id wins');
  assert.strictEqual(chooseIrisDistinctId('pixel-id', null), 'pixel-id', 'fall back to our own');
  assert.strictEqual(chooseIrisDistinctId('pixel-id', ''), 'pixel-id', "'' is not an id");
  // The regression that matters most: a known person must never be downgraded back
  // to an anonymous id just because one is sitting in storage.
  assert.strictEqual(
    chooseIrisDistinctId('shopper@example.com', 'sdk-abc'),
    'shopper@example.com',
    'a known email must beat any stored anonymous id',
  );

  /* ── Two racing callers must not seed two different ids ─────────────────── */
  // index.ts memoises the promise; this asserts the property that memoisation is
  // there to guarantee, since several event handlers fire without awaiting.
  {
    const h = io(null);
    const once = (() => {
      let p: ReturnType<typeof resolveIrisIdentity> | null = null;
      return () => (p ??= resolveIrisIdentity(h.io));
    })();
    const [a, b, c] = await Promise.all([once(), once(), once()]);
    assert.strictEqual(a.distinctId, b.distinctId);
    assert.strictEqual(b.distinctId, c.distinctId);
    assert.strictEqual(h.writes.length, 1, 'concurrent callers must seed exactly once');
  }

  console.log('web-pixel iris-identity: seeds when cold, adopts when warm, one id under races ✓');
}

void main();
