/**
 * Iris (Mythic Analytics) JavaScript SDK configuration.
 *
 * Mirrors the documented options of `window.mythic.init(key, config)` —
 * https://docs.mythicdata.io/javascript-sdk/configuration — so the Iris
 * destination exposes the same breadth of control the PostHog JS Web Config
 * page does (see js-web-settings.dto.ts).
 *
 * SHAPE: deliberately FLAT. The settings form is generated straight off this
 * schema by walking `.shape` (see default-iris-js-settings.ts), and that walker
 * only understands enum/string/number/boolean/array. The SDK's two nested
 * objects are therefore flattened with a prefix and reassembled at init time:
 *
 *   session_replay_*  ->  session_replay: { enabled, sampleRate, ... }
 *   web_vitals_*      ->  web_vitals:     { enabled, ... }
 *
 * NOT EXPOSED, matching the precedent set for posthog-js: function callbacks
 * (`loaded`, `before_send`, `sanitize_properties`, `on_xhr_error`), free-form
 * objects (`xhr_headers`, `super_properties`, `rate_limiting`), and
 * `network_endpoints`. These need code, not a settings row.
 *
 * DEFAULTS: SDK documented defaults, except where the Shopify Web Pixel already
 * covers the same ground — those are noted inline and default off, the same call
 * the PostHog config makes for `capture_pageview` / `capture_pageleave`.
 */
import { z } from 'zod';

export const IrisJsConfigSchema = z.object({
  /* ── Network and batching ─────────────────────────────────────────────── */

  batch_size: z
    .number()
    .int()
    .min(1)
    .max(500)
    .describe('Number of events queued before the SDK sends a batch.')
    .default(10),

  flush_interval: z
    .number()
    .int()
    .min(250)
    .max(60000)
    .describe('Maximum milliseconds between automatic flushes of the event queue.')
    .default(2000),

  max_payload_size: z
    .number()
    .int()
    .min(1000)
    .describe('Maximum size of a single request payload, in characters.')
    .default(6000),

  properties_string_max_length: z
    .number()
    .int()
    .min(255)
    .describe('Longest string a single event property may carry before truncation.')
    .default(65535),

  /* ── Auto-capture ─────────────────────────────────────────────────────── */

  autocapture: z
    .boolean()
    .describe('Automatically capture clicks, form submissions, and input changes as $autocapture.')
    .default(true),

  // Shopify's Web Pixel page_viewed event is the recommended source on a
  // storefront, so this defaults off to avoid double-counting pageviews.
  capture_pageview: z
    .boolean()
    .describe(
      'Automatically capture $pageview on page load. The Web Pixel page_viewed event is recommended instead on Shopify.'
    )
    .default(false),

  capture_spa_pageview: z
    .boolean()
    .describe('Automatically capture $pageview on single-page-app route changes.')
    .default(false),

  capture_pageleave: z
    .boolean()
    .describe('Automatically capture $pageleave on exit, with time-on-page and exit intent.')
    .default(false),

  capture_utm: z
    .boolean()
    .describe('Automatically capture UTM parameters and ad click IDs (gclid, fbclid, ttclid, and similar).')
    .default(true),

  capture_copied_text: z
    .boolean()
    .describe('Capture the text of any element the shopper cuts or copies.')
    .default(false),

  /* ── Advanced auto-tracking ───────────────────────────────────────────── */

  auto_form_identify: z
    .boolean()
    .describe('Identify a visitor automatically from an email field on form submission.')
    .default(true),

  auto_input_capture: z
    .boolean()
    .describe('Identify a visitor from an email address as they type it, before submitting.')
    .default(true),

  auto_booking_listener: z
    .boolean()
    .describe('Detect and track calls to known booking/scheduling APIs.')
    .default(true),

  auto_survey_tracking: z.boolean().describe('Track survey submissions automatically.').default(true),

  auto_gtm_sync: z
    .boolean()
    .describe('Mirror captured events into the Google Tag Manager dataLayer.')
    .default(true),

  auto_framework_extract: z
    .boolean()
    .describe('Extract page context injected by the site framework (Next.js, Remix, and similar).')
    .default(true),

  auto_network_intercept: z
    .boolean()
    .describe('Intercept fetch/XHR traffic to derive events from API calls.')
    .default(false),

  wait_for_page_data: z
    .boolean()
    .describe('Buffer early events until framework page data is available, so they carry full context.')
    .default(true),

  /* ── Identity and session ─────────────────────────────────────────────── */

  allowReidentification: z
    .boolean()
    .describe('Allow a visitor already identified as one user to be re-identified as another.')
    .default(false),

  session_timeout: z
    .number()
    .int()
    .min(60000)
    .describe('Inactivity in milliseconds before a new session starts. Default is 30 minutes.')
    .default(1800000),

  /* ── Persistence ──────────────────────────────────────────────────────── */

  persistence: z
    .enum(['localStorage+cookie', 'localStorage', 'sessionStorage', 'cookie', 'memory'])
    .describe('Where the SDK stores the visitor and session identifiers.')
    .default('localStorage+cookie'),

  cookie_expiration: z.number().int().min(1).max(400).describe('Cookie lifetime in days.').default(365),

  cross_subdomain_cookie: z
    .boolean()
    .describe('Set the cookie on the top-level domain so it is shared across subdomains.')
    .default(true),

  secure_cookie: z.boolean().describe('Mark cookies Secure so they are only sent over HTTPS.').default(true),

  disable_cookie: z
    .boolean()
    .describe('Never use cookies. Identity falls back to the other configured storage.')
    .default(false),

  disable_external_storage: z
    .boolean()
    .describe('Keep everything in memory only — no cookie, local, or session storage.')
    .default(false),

  max_storage_duration: z
    .number()
    .int()
    .min(0)
    .describe('Hours before stored identity is discarded. 0 means no limit. HIPAA mode forces 24.')
    .default(0),

  /* ── Privacy, consent, and masking ────────────────────────────────────── */

  respect_dnt: z.boolean().describe('Honour the browser Do Not Track header and stop capturing.').default(false),

  opt_out_capturing_by_default: z
    .boolean()
    .describe('Start opted out; nothing is captured until opt-in is called explicitly.')
    .default(false),

  requireConsent: z
    .boolean()
    .describe('Queue and withhold every event until consent has been granted.')
    .default(false),

  autoConsentMode: z
    .boolean()
    .describe('Follow Google Consent Mode v2 signals on the page automatically.')
    .default(false),

  mask_all_text: z.boolean().describe('Strip all element text from autocaptured events.').default(false),

  mask_all_element_attributes: z
    .boolean()
    .describe('Strip all element attributes from autocaptured events.')
    .default(false),

  sensitive_fields: z
    .array(z.string().trim())
    .describe('Field names never captured from forms or inputs, in addition to the SDK defaults.')
    .default([]),

  form_selector: z
    .string()
    .trim()
    .describe('CSS selector limiting which forms are tracked. Empty means all forms.')
    .default(''),

  /* ── HIPAA ────────────────────────────────────────────────────────────── */

  hipaa: z
    .boolean()
    .describe('HIPAA mode: strict redaction, no session replay, and a 24-hour storage cap.')
    .default(false),

  disable_remote_config: z
    .boolean()
    .describe('Never fetch remote configuration; only the settings on this page apply.')
    .default(false),

  /* ── Features ─────────────────────────────────────────────────────────── */

  error_tracking: z
    .boolean()
    .describe('Capture uncaught JavaScript errors and unhandled promise rejections as $exception.')
    .default(true),

  web_vitals: z.boolean().describe('Capture Core Web Vitals (LCP, CLS, INP) as events.').default(false),

  geolocation: z.boolean().describe('Enrich events with city-level location derived from IP.').default(true),

  cross_domain_tracking: z
    .boolean()
    .describe('Carry identity across domains you own, for example an off-Shopify landing page.')
    .default(false),

  /* ── Session replay (flattened; see the SHAPE note above) ─────────────── */

  session_replay_enabled: z
    .boolean()
    .describe('Record sessions with rrweb for playback. The server remote config can override this off.')
    .default(false),

  session_replay_sample_rate: z
    .number()
    .min(0)
    .max(1)
    .describe('Fraction of sessions to record, decided deterministically per session id.')
    .default(1),

  session_replay_min_duration_ms: z
    .number()
    .int()
    .min(0)
    .describe('Discard recordings for sessions shorter than this, so bounces send nothing. 0 keeps every session.')
    .default(10000),

  session_replay_mask_all_inputs: z
    .boolean()
    .describe('Mask every form input value in the recording.')
    .default(true),

  session_replay_capture_console: z
    .boolean()
    .describe('Record console log, warn, and error calls alongside the DOM.')
    .default(true),

  session_replay_capture_network: z
    .boolean()
    .describe('Record fetch, XHR, and resource timing as a network waterfall.')
    .default(true),

  session_replay_record_network_headers: z
    .boolean()
    .describe('Include request and response headers in the network recording.')
    .default(false),

  session_replay_record_network_body: z
    .boolean()
    .describe('Include response bodies in the network recording, capped at 10 KB each.')
    .default(false),

  session_replay_block_selector: z
    .string()
    .trim()
    .describe('CSS selector for elements excluded from the recording entirely.')
    .default(''),

  session_replay_mask_text_selector: z
    .string()
    .trim()
    .describe('CSS selector for text nodes to mask in the recording.')
    .default(''),

  /* ── Debugging ────────────────────────────────────────────────────────── */

  debug: z.boolean().describe('Log queued events, requests, and config decisions to the console.').default(false),

  verbose: z.boolean().describe('Verbose logging, including internal SDK state.').default(false),

  test_mode: z.boolean().describe('Log events to the console instead of sending them.').default(false),

  disabled: z.boolean().describe('Disable all capturing without removing the SDK.').default(false),
});

export type IrisJsConfig = z.infer<typeof IrisJsConfigSchema>;

/**
 * Rebuild the SDK's nested option objects from the flat stored config.
 * Everything not flattened passes through unchanged.
 */
export function toIrisSdkConfig(config: IrisJsConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith('session_replay_')) continue;
    // Empty selector/array settings mean "unset" — don't send them at all.
    if (value === '' || (Array.isArray(value) && value.length === 0)) continue;
    out[key] = value;
  }

  out.session_replay = {
    enabled: config.session_replay_enabled,
    sampleRate: config.session_replay_sample_rate,
    minDurationMs: config.session_replay_min_duration_ms,
    maskAllInputs: config.session_replay_mask_all_inputs,
    captureConsole: config.session_replay_capture_console,
    captureNetwork: config.session_replay_capture_network,
    recordNetworkHeaders: config.session_replay_record_network_headers,
    recordNetworkBody: config.session_replay_record_network_body,
    ...(config.session_replay_block_selector
      ? { blockSelector: config.session_replay_block_selector }
      : {}),
    ...(config.session_replay_mask_text_selector
      ? { maskTextSelector: config.session_replay_mask_text_selector }
      : {}),
  };

  return out;
}
