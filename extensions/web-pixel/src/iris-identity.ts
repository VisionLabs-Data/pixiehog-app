/**
 * The pixel and the Iris JS SDK agree on one id by sharing a storage key —
 * READ-ONLY on our side.
 *
 * The contract is documented upstream: Mythic/Iris docs -> JavaScript SDK ->
 * Identity Storage Contract. `identity` is the authoritative record, written by
 * the SDK write-through at init (measured at 39ms on a clean cold load, SDK
 * 2.231.0) and adopted verbatim when present; `distinct_id` / `device_id` are
 * derived mirrors and must never be read as truth.
 *
 * The pixel never writes the SDK's records. A seed used to live here for the
 * cold-load race; it was dead code justified by measurement artifacts — see
 * docs/iris-identity-bootstrap-request.md for the trap list. On a shop with no
 * Iris theme embed nothing is stored and the pixel simply uses its own id,
 * which is still one consistent person.
 *
 * The cold race runs BOTH ways: the 39ms cold test proved the SDK writes fast,
 * not that it always writes first — a 2026-08-04 wire trace on the same store
 * showed the pixel minting 77ms BEFORE the SDK. Only the first event races
 * (later ones re-read and adopt), so the first send waits — bounded — for the
 * SDK's records via `waitForIrisSdk`. Read-only on timeout too: we mint nothing
 * into the SDK's namespace, we just proceed with the pixel's own ids (the legit
 * timeout case is a cold landing straight onto checkout, where the theme embed
 * never runs).
 */
export type IrisIdentity = {
  distinctId?: string;
  anonymousId?: string;
  deviceId?: string;
  aliases?: string[];
};

const present = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

/**
 * Which id an Iris event goes out under, plus the device id to carry.
 *
 * Adopt the SDK's stored id when there is one; fall back to the pixel's own.
 * Once the visitor is known the email wins — never downgrade a known person
 * back to an anonymous id just because one is stored.
 */
export function chooseIrisIdentity(
  pixelDistinctId: string,
  stored: IrisIdentity | null,
): { distinctId: string; deviceId: string | null } {
  const deviceId = present(stored?.deviceId);
  if (pixelDistinctId.includes('@')) {
    return { distinctId: pixelDistinctId, deviceId };
  }
  return { distinctId: present(stored?.distinctId) || pixelDistinctId, deviceId };
}

/**
 * Poll until `probe` reports the SDK's records are readable, or give up after
 * `timeoutMs`. Resolves true if the SDK showed up, false on timeout. The first
 * probe runs immediately, so a warm load (records already stored) never waits.
 */
export async function waitForIrisSdk(
  probe: () => Promise<boolean>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs = 3000,
  intervalMs = 50,
): Promise<boolean> {
  for (let elapsed = 0; ; elapsed += intervalMs) {
    if (await probe()) return true;
    if (elapsed >= timeoutMs) return false;
    await wait(intervalMs);
  }
}
