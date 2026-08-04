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
 * (later ones re-read and adopt). Two layered defenses, both wire-verified by
 * the Iris team:
 *
 * 1. GATE (`waitForIrisSdk`): the first send waits — 50ms poll, 3s cap, first
 *    probe immediate so warm loads never wait — for `identity` + `session` to
 *    appear. A gated first pageview joins the SDK's session, so session-level
 *    attribution stays whole. (An alias can't fix sessions after the fact:
 *    events are immutable once sent — a race-losing paid landing otherwise
 *    yields a blank-attribution session holding the only pageview plus an
 *    attributed session with zero pageviews.)
 * 2. HEAL on timeout (`watchForSdkIdentity`): send under the minted id, watch
 *    storage in the background, and when the SDK's record appears with a
 *    DIFFERENT id emit one `$create_alias` — Iris's identity processor
 *    explicitly allows anonymous→anonymous aliases and merges the two persons,
 *    reattaching the orphan event.
 *
 * Known residual (shared by every option): a healed orphan keeps its own
 * session row, and an instant bounce before the SDK's record ever appears
 * stays split.
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
 * Layer 1 — the first-send gate. Poll until `probe` reports the SDK's records
 * are readable, or give up after `timeoutMs`. Resolves true if the SDK showed
 * up, false on timeout. The first probe runs immediately, so a warm load
 * (records already stored) never waits.
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

/**
 * Layer 2 — background watch for the SDK's identity record showing up AFTER the pixel
 * already read empty and self-minted. Resolves with the stored record when it
 * appears, or null on timeout (no theme embed, or a cold landing straight onto
 * checkout). Never sits in front of an event send — the caller fires and
 * forgets it.
 *
 * ponytail: 60s cap — an embed that hasn't loaded a minute in isn't loading;
 * the visitor's later events still adopt via the per-event fresh read.
 */
export async function watchForSdkIdentity(
  read: () => Promise<IrisIdentity | null>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs = 60000,
  intervalMs = 500,
): Promise<IrisIdentity | null> {
  // The caller just read empty — wait first, then re-read.
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += intervalMs) {
    await wait(intervalMs);
    const stored = await read();
    if (stored && present(stored.distinctId)) return stored;
  }
  return null;
}
