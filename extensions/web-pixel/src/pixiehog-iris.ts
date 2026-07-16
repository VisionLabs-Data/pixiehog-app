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

export interface IrisClientOptions {
  host: string;
  apiKey: string; // pk_xxxx
  libVersion?: string;
}

export interface IrisCaptureOptions {
  uuid?: string;
  timestamp?: Date | number;
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
      properties: {
        ...properties,
        $lib: 'vizhog-shopify',
        $lib_version: this.libVersion,
      },
    };

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    setProps: Record<string, any>
  ): Promise<void> {
    await this.capture(distinctId, '$identify', {
      ...(anonDistinctId ? { $anon_distinct_id: anonDistinctId } : {}),
      $set: setProps,
    });
  }
}
