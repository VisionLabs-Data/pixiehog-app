/**
 * Run with: npx tsx extensions/web-pixel/src/iris-identity.check.ts
 *
 * The pixel and the Iris SDK have to land on ONE id. Every failure here is
 * silent — events keep flowing, they just attach to two different people, with
 * the landing page and UTMs stranded on whichever one the SDK invented.
 */
import assert from 'node:assert';
import type { IrisIdentity } from './iris-identity';
import { chooseIrisIdentity, waitForIrisSdk, watchForSdkIdentity } from './iris-identity';

async function main() {
  /* ── The SDK's stored id wins for anonymous visitors ─────────────────────── */
  {
    const got = chooseIrisIdentity('pixel-id', {
      distinctId: 'sdk-abc',
      deviceId: 'sdk-dev',
      aliases: [],
    });
    assert.strictEqual(got.distinctId, 'sdk-abc', "must adopt the SDK's stored id");
    assert.strictEqual(got.deviceId, 'sdk-dev', 'carry the SDK device id onto the envelope');
  }

  /* ── Nothing stored: fall back to the pixel's own id ─────────────────────── */
  assert.deepStrictEqual(chooseIrisIdentity('pixel-id', null), {
    distinctId: 'pixel-id',
    deviceId: null,
  });

  /* ── Empty or malformed stored records count as absent, not as an id ─────── */
  for (const bad of [{}, { distinctId: '' }, { distinctId: undefined }] as IrisIdentity[]) {
    assert.strictEqual(
      chooseIrisIdentity('pixel-id', bad).distinctId,
      'pixel-id',
      `${JSON.stringify(bad)} must be treated as absent`,
    );
  }
  assert.strictEqual(
    chooseIrisIdentity('pixel-id', { distinctId: 'sdk-abc', deviceId: '' }).deviceId,
    null,
    "'' is not a device id",
  );

  /* ── A known person must never be downgraded back to an anonymous id ─────── */
  {
    const got = chooseIrisIdentity('shopper@example.com', {
      distinctId: 'sdk-abc',
      deviceId: 'sdk-dev',
    });
    assert.strictEqual(
      got.distinctId,
      'shopper@example.com',
      'a known email must beat any stored anonymous id',
    );
    assert.strictEqual(got.deviceId, 'sdk-dev', 'the device id still comes through');
  }

  /* ── Layer 1, first-send gate: warm loads never wait ─────────────────────── */
  const noWait = async () => {};
  {
    // Warm load: records already stored → zero waits, resolves on the first probe.
    let probes = 0;
    let waited = false;
    const ok = await waitForIrisSdk(
      async () => (probes += 1) > 0,
      async () => {
        waited = true;
      },
    );
    assert.strictEqual(ok, true, 'stored records must pass the gate');
    assert.strictEqual(probes, 1, 'the first probe runs immediately');
    assert.strictEqual(waited, false, 'a warm load must not wait at all');
  }
  {
    // Cold load: SDK shows up mid-poll → gate opens as soon as it does.
    let probes = 0;
    const ok = await waitForIrisSdk(async () => (probes += 1) >= 3, noWait);
    assert.strictEqual(ok, true, 'must keep polling until the SDK shows up');
    assert.strictEqual(probes, 3, 'must stop polling the moment it does');
  }
  {
    // No embed: gate times out false — the caller falls through to the heal.
    const ok = await waitForIrisSdk(async () => false, noWait, 200, 50);
    assert.strictEqual(ok, false, 'timeout must report false, not hang');
  }

  /* ── Layer 2, background heal watch after a gate timeout ─────────────────── */
  {
    // SDK shows up mid-watch → resolves with its record, stops reading.
    let reads = 0;
    const got = await watchForSdkIdentity(
      async () => ((reads += 1) >= 3 ? { distinctId: 'sdk-late' } : null),
      noWait,
    );
    assert.strictEqual(got?.distinctId, 'sdk-late', 'must resolve with the record that appeared');
    assert.strictEqual(reads, 3, 'must stop reading the moment it does');
  }
  {
    // A record without a usable distinctId must not end the watch.
    let reads = 0;
    const got = await watchForSdkIdentity(
      async () => ((reads += 1) >= 2 ? { distinctId: 'sdk-late' } : { distinctId: '' }),
      noWait,
    );
    assert.strictEqual(got?.distinctId, 'sdk-late', "'' must not count as the SDK showing up");
  }
  {
    // No embed: times out null — the caller aliases nothing.
    const got = await watchForSdkIdentity(async () => null, noWait, 1000, 500);
    assert.strictEqual(got, null, 'timeout must report null, not hang');
  }

  console.log(
    'web-pixel iris-identity: read-only adopt, email wins, gated first send, alias heal on timeout ✓',
  );
}

void main();
