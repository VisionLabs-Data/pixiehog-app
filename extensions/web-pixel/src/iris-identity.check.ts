/**
 * Run with: npx tsx extensions/web-pixel/src/iris-identity.check.ts
 *
 * The pixel and the Iris SDK have to land on ONE id. Every failure here is
 * silent — events keep flowing, they just attach to two different people, with
 * the landing page and UTMs stranded on whichever one the SDK invented.
 */
import assert from 'node:assert';
import type { IrisIdentity } from './iris-identity';
import { chooseIrisIdentity } from './iris-identity';

function main() {
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

  console.log('web-pixel iris-identity: read-only adopt, email wins, empty is absent ✓');
}

main();
