/**
 * Bounded wait for the Iris JS SDK to publish its identity to localStorage.
 *
 * Why: the Web Pixel and the SDK both start on page load, and the pixel wins.
 * Measured on a live storefront, `page_viewed` fires ~156ms before the SDK
 * finishes loading its core from the CDN and writes `mythic_<key>_distinct_id`.
 * So a new visitor's FIRST event found nothing to adopt and went out under the
 * pixel's own id, while every later event adopted the SDK's — splitting the one
 * event that carries the landing page and UTMs onto a separate person. That is
 * precisely the attribution split the identity handoff exists to prevent.
 *
 * Deliberately a bounded poll rather than an alias-after-the-fact: aliasing
 * works, but it's an extra event and the merge only resolves downstream (up to
 * ~24h for BigQuery identity resolution). Waiting keeps the first event correct
 * at source.
 *
 * The wait runs ONCE per page. After it resolves — found or timed out — every
 * subsequent event reads through immediately, so the cost is bounded per
 * pageview, not per event.
 */

/**
 * Should the pixel wait for the SDK at all?
 *
 * Three states, not two. Web Pixel settings are a snapshot pushed by
 * recalculateWebPixel, and nothing pushes it automatically — an installed pixel
 * keeps its old settings until the merchant next saves something in the app. So a
 * newly declared field reads `undefined` on every existing install.
 *
 * Treating unknown as "off" would mean this fix does nothing until each merchant
 * happens to save. Treating it as "maybe" costs a shop with the embed switched
 * off one bounded wait per page until its next save, and then it stops. Only an
 * explicit 'false' skips the wait outright.
 *
 * @param setting raw `settings.iris_js_enabled`, always a string or undefined
 */
export function shouldWaitForSdk(setting: unknown): boolean {
  if (setting === undefined || setting === null || setting === '') {
    return true;
  }
  return String(setting) === 'true';
}

/**
 * ~3s total.
 *
 * Sized from a measurement on a live storefront, both timings on one clock:
 *
 *   2144ms  pixel POST /e          (having waited a 1s budget and given up)
 *   3153ms  SDK wrote distinct_id
 *
 * The first sizing used ~1s, from a figure inferred by diffing the uuidv7
 * timestamps embedded in the two ids. That was wrong: those encode when each id
 * was *minted*, not when the SDK *wrote* it to localStorage, and it understated
 * the gap by roughly an order of magnitude. Measure the write, not the mint.
 *
 * 3s covers the observed ~3.1s with headroom. Known ceiling: this is a fixed
 * budget against a variable CDN, so a slow enough load still misses, and an Iris
 * event delayed 3s is lost outright if the shopper leaves first. PostHog is
 * unaffected either way — captureAndBroadcast sends to PostHog before this waits.
 * The durable fix is to send immediately and alias once the SDK id appears; this
 * is the cheap version that demonstrably works on a normal load.
 */
export const SDK_IDENTITY_WAIT_ATTEMPTS = 30;
export const SDK_IDENTITY_WAIT_INTERVAL_MS = 100;

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

/**
 * Wraps `waitForSdkIdentity` so at most one wait ever runs.
 *
 * Without this every event on a storefront where the SDK never appears would pay
 * the full timeout — a second per event, forever.
 */
export function onceWaiter(deps: WaitDeps): () => Promise<string | null> {
  let pending: Promise<string | null> | null = null;
  return () => {
    if (!pending) {
      pending = waitForSdkIdentity(deps);
    }
    return pending;
  };
}
