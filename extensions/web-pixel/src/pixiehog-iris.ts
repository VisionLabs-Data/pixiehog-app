/**
 * Minimal Iris Analytics sink for the Shopify Web Pixel sandbox.
 *
 * Iris's ingestion (`POST /e?key=pk_xxx`) is PostHog-shaped — it accepts the
 * exact `{ event, distinct_id, timestamp, properties }` payload the pixel
 * already builds for PostHog, including `$set` / `$set_once` person properties.
 * So we reuse the transformed event verbatim and just POST it to Iris.
 *
 * ponytail: fire-and-forget per event with keepalive — no batching/flush timers.
 * Per-session event volume is small; add a batch queue only if that changes.
 */

import { v7 as uuidv7 } from 'uuid';

export interface IrisClientOptions {
  host: string;
  apiKey: string; // pk_xxxx
  libVersion?: string;
}

export interface IrisCaptureOptions {
  uuid?: string;
  timestamp?: Date | number;
}

/**
 * Iris reads the session/identity ids off the event ENVELOPE, not `properties`
 * — its Tinybird decoder and identity-processor both look at the root. PostHog
 * carries them inside `properties`, so lift them on the way out or the event
 * lands session-less (no row in the sessions table, no device stitching).
 */
const ENVELOPE_KEYS = ['$session_id', '$device_id', '$anon_distinct_id', '$user_id'] as const;

function envelopeIds(properties: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ENVELOPE_KEYS) {
    const value = properties?.[key];
    if (typeof value === 'string' && value !== '') out[key] = value;
  }
  return out;
}

export class PixieHogIris {
  private readonly endpoint: string;
  private readonly libVersion: string;

  constructor(opts: IrisClientOptions) {
    const host = (opts.host || '').replace(/\/+$/, '');
    this.endpoint = `${host}/e?key=${encodeURIComponent(opts.apiKey)}`;
    this.libVersion = opts.libVersion || '1.0.0';
  }

  private resolveTimestamp(ts?: Date | number): number {
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'number') return ts;
    return new Date().getTime();
  }

  async capture(
    distinctId: string,
    event: string,
    properties: Record<string, any>,
    options?: IrisCaptureOptions
  ): Promise<void> {
    const body = {
      event,
      distinct_id: distinctId,
      timestamp: this.resolveTimestamp(options?.timestamp),
      ...(options?.uuid ? { uuid: options.uuid } : {}),
      ...envelopeIds(properties),
      properties: {
        ...properties,
        $lib: 'vizhog-shopify',
        $lib_version: this.libVersion,
      },
    };

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        // text/plain, NOT application/json. Iris is a different origin from the
        // storefront, and application/json is not a CORS-safelisted request
        // header value — so every single event paid for an OPTIONS preflight
        // before its POST (MEASURED on the checkout thank-you page: a 204
        // preflight in front of every 200, doubling the request count). Iris's
        // /e handler reads the raw body and JSON.parses it regardless of
        // Content-Type, so the safelisted value costs nothing and removes the
        // preflight entirely. This is also what the Iris JS SDK sends.
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(body),
        keepalive: true,
      });
    } catch (_e) {
      // best-effort sink — never throw into the shared capture path
    }
  }

  /**
   * Mirror PostHog's `$identify` so Iris's identity graph can alias the
   * anonymous distinct_id to the known one (email).
   */
  async identify(
    distinctId: string,
    anonDistinctId: string | null,
    setProps: Record<string, any>,
    sessionId?: string
  ): Promise<void> {
    // Mint a uuid. Iris does not generate one on /e, so an identify without it
    // lands with uuid '' — and everything keyed on event_uuid (destination
    // delivery logs, the portal's deliveries lookup) then collapses every
    // identify this pixel ever sent into one bucket.
    await this.capture(
      distinctId,
      '$identify',
      {
        ...(anonDistinctId ? { $anon_distinct_id: anonDistinctId } : {}),
        ...(sessionId ? { $session_id: sessionId } : {}),
        $set: setProps,
      },
      { uuid: uuidv7() }
    );
  }

  /**
   * Link two ANONYMOUS ids into one person. Iris's identity processor
   * explicitly allows anonymous→anonymous aliases; shape per the Iris team:
   * distinct_id = the id to keep (the SDK's), `alias` = the id being folded in
   * (the pixel's self-minted one). Same uuid mint as identify, same reason.
   */
  async alias(keepId: string, aliasId: string): Promise<void> {
    await this.capture(keepId, '$create_alias', { alias: aliasId }, { uuid: uuidv7() });
  }
}
