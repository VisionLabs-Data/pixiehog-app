/**
 * Bounded watch for the Iris JS SDK to publish its identity to localStorage.
 *
 * Why: the Web Pixel and the SDK both start on page load, and the pixel wins.
 * Measured on a live storefront, `page_viewed` fires ~156ms before the SDK
 * finishes loading its core from the CDN and writes `mythic_<key>_distinct_id`.
 * So a new visitor's FIRST event found nothing to adopt and went out under the
 * pixel's own id, while every later event adopted the SDK's — splitting the one
 * event that carries the landing page and UTMs onto a separate person. That is
 * precisely the attribution split the identity handoff exists to prevent.
 *
 * This started life as a blocking wait in front of the first Iris send. That was
 * the wrong shape: it delayed the landing pageview, and a delayed event is lost
 * outright if the shopper leaves first — trading a mis-attributed pageview for a
 * missing one. It now runs in the BACKGROUND while the event goes out
 * immediately, and the caller links the two ids with an alias once one appears.
 * Nothing is blocked and nothing is dropped.
 */

/**
 * Should the pixel expect an Iris SDK on this page at all?
 *
 * Three states, not two. Web Pixel settings are a snapshot pushed by
 * recalculateWebPixel, and nothing pushes it automatically — an installed pixel
 * keeps its old settings until the merchant next saves something in the app. So a
 * newly declared field reads `undefined` on every existing install.
 *
 * Treating unknown as "off" would mean this does nothing until each merchant
 * happens to save. Treating it as "maybe" costs a shop with the embed switched
 * off some background polling until its next save, and then it stops. Nothing
 * user-visible is delayed either way now that the watch is not blocking.
 *
 * @param setting raw `settings.iris_js_enabled`, always a string or undefined
 */
export function shouldExpectSdk(setting: unknown): boolean {
  if (setting === undefined || setting === null || setting === '') {
    return true;
  }
  return String(setting) === 'true';
}

/**
 * ~12s total, polled every 200ms.
 *
 * Measured on a live storefront, both timings on one clock, the SDK's identity
 * lands ~3.1s into the page:
 *
 *   2144ms  pixel POST /e
 *   3153ms  SDK wrote distinct_id
 *
 * (An earlier sizing of ~1s came from diffing the uuidv7 timestamps embedded in
 * the two ids. Those encode when each id was *minted*, not when the SDK *wrote*
 * it to storage, and understated the gap by roughly an order of magnitude.
 * Measure the write, not the mint.)
 *
 * Because nothing waits on this any more, the budget can be generous enough to
 * cover a slow CDN instead of being traded off against event latency. It stays
 * bounded so a storefront with no SDK stops polling rather than looping for the
 * life of the page.
 */
export const SDK_IDENTITY_WAIT_ATTEMPTS = 60;
export const SDK_IDENTITY_WAIT_INTERVAL_MS = 200;

export interface WaitDeps {
  /** Reads the SDK's distinct id. Returns null/'' when it isn't there yet. */
  read: () => Promise<string | null>;
  sleep: (ms: number) => Promise<void>;
  attempts?: number;
  intervalMs?: number;
}

/**
 * Polls `read` until it yields a value or the attempt budget runs out.
 *
 * @returns the value if it appeared, else null. Callers treat null as "the SDK
 *   isn't coming" and fall back to the pixel's own ids — never an error, because
 *   a shop with the theme embed switched off is a perfectly normal state.
 */
export async function waitForSdkIdentity({
  read,
  sleep,
  attempts = SDK_IDENTITY_WAIT_ATTEMPTS,
  intervalMs = SDK_IDENTITY_WAIT_INTERVAL_MS,
}: WaitDeps): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const value = await read();
    if (value) {
      return value;
    }
    // No sleep after the final attempt — it would delay the caller for nothing.
    if (i < attempts - 1) {
      await sleep(intervalMs);
    }
  }
  return null;
}
