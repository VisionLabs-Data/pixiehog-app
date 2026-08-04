/**
 * The pixel and the Iris JS SDK agree on one id by sharing a storage key.
 *
 * Extracted from index.ts so it can be checked without a storefront: the failure
 * mode is silent (events keep flowing, just attributed to two people) and it only
 * shows up on a cold first visit, which is the hardest case to notice by hand.
 *
 * `identity` is the SDK's authoritative record. `distinct_id` and `device_id` are
 * mirrors it rewrites from `identity` on init — verified on a live storefront:
 * seeding the mirrors is ignored, seeding `identity` is adopted verbatim.
 *
 * Adopting is the path that matters. **Seeding only holds on a shop with no Iris
 * theme embed at all** — where the SDK is present, it stages its own id in memory
 * before the pixel gets here and its debounced flush overwrites the seed ~1s later.
 * See the timeline in index.ts. Seeding is kept because it is correct for the
 * no-SDK case and harmless otherwise, not because it wins the cold race.
 */
export type IrisIdentity = {
  distinctId?: string;
  anonymousId?: string;
  deviceId?: string;
  aliases?: string[];
};

export type IrisIdentityIo = {
  /** Read the stored `identity` record, or null when absent/unparseable. */
  read: () => Promise<IrisIdentity | null>;
  /** Persist a freshly minted record. May reject — storage can be blocked. */
  write: (record: IrisIdentity) => Promise<void>;
  mintId: () => string;
  /** The pixel's own id, reused so one visitor doesn't get two ids per sink. */
  pixelDistinctId: string;
  /**
   * The SDK's stored `device_id`, if any. Read-only input: unlike `distinct_id`,
   * `device_id` is NOT derived state — the SDK reads it back via its own
   * getOrCreateDeviceId and (unless persistence is localStorage-only) mirrors it to
   * a cookie, so it can outlive the `identity` record. Minting one here would
   * therefore invent a second device for a browser that already has one.
   */
  storedDeviceId?: string | null;
};

export type ResolvedIrisIdentity = {
  distinctId: string;
  deviceId: string | null;
  /** True when this call minted the id rather than adopting a stored one. */
  seeded: boolean;
};

const present = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

/**
 * Adopt the stored id if there is one, otherwise mint AND write so the SDK adopts
 * ours instead of minting a second id a second later.
 *
 * Whoever runs first wins, which is what makes this symmetric: on a warm visit the
 * SDK has already written and the pixel adopts; on a cold one the pixel writes
 * first and the SDK adopts.
 */
export async function resolveIrisIdentity(io: IrisIdentityIo): Promise<ResolvedIrisIdentity> {
  let existing: IrisIdentity | null = null;
  try {
    existing = await io.read();
  } catch (_e) {
    // An unreadable record is treated as absent — seeding is still better than
    // letting every event pick its own id.
  }
  const stored = present(existing?.distinctId);
  if (stored) {
    return { distinctId: stored, deviceId: present(existing?.deviceId), seeded: false };
  }

  // Anonymous only. A known email belongs to identify(), which Iris needs in order
  // to alias the anonymous history onto the person; seeding the email here would
  // skip that and strand the browsing history.
  const anonymousId = io.pixelDistinctId.includes('@') ? io.mintId() : io.pixelDistinctId;
  // Carry a device id through if the SDK already has one, but NEVER mint one — see
  // storedDeviceId. A browser can legitimately have a device_id and no identity
  // (localStorage cleared, cookie kept), and inventing one there would fork the
  // device. Omitting the field leaves the SDK's own getOrCreateDeviceId to recover
  // or create it, which is the only code that knows where else it lives.
  const deviceId = present(io.storedDeviceId);
  try {
    await io.write({
      distinctId: anonymousId,
      anonymousId,
      ...(deviceId ? { deviceId } : {}),
      aliases: [],
    });
  } catch (_e) {
    // Storage blocked (private browsing). Still return the minted id so at least
    // this page's events agree with each other.
  }
  return { distinctId: anonymousId, deviceId, seeded: true };
}

/**
 * Which id an Iris event goes out under.
 *
 * Once the visitor is known the email wins — never downgrade a known person back
 * to an anonymous id just because one is stored.
 */
export function chooseIrisDistinctId(
  pixelDistinctId: string,
  storedId: string | null,
): string {
  if (pixelDistinctId.includes('@')) {
    return pixelDistinctId;
  }
  return present(storedId) || pixelDistinctId;
}
