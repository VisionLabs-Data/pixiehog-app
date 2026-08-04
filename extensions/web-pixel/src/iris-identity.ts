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
 * cold-load race; a clean-harness cold test proved the SDK's write always lands
 * before the pixel's first read, so the seed was dead code justified by
 * measurement artifacts — see docs/iris-identity-bootstrap-request.md for the
 * trap list. On a shop with no Iris theme embed nothing is stored and the pixel
 * simply uses its own id, which is still one consistent person.
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
