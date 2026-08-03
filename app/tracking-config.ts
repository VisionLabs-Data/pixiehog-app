/**
 * Single source of truth for what VizHog's tracking graph actually looks like.
 *
 * Two sources feed two destinations:
 *
 *                      ┌─ PostHog ─ web: Web Pixel → PostHog /capture
 *   Shopify Web ───┐    │           server: Pub/Sub → CF worker → /capture
 *                  ├─◆─┤
 *   Shopify Webhooks┘   └─ Iris ──── web: Web Pixel dual-sink (pixiehog-iris.ts)
 *                                         + Iris SDK theme embed (extensions/iris-js)
 *                                    server: /webhooks/orders → Iris /ingest
 *
 * Both the My Tracking diagram and the per-destination settings pages derive
 * their state from here so they can never disagree about what's live.
 */
import { Constant } from '../common/constant';

export type DestinationId = 'posthog' | 'iris';
export type DeliveryPath = 'Web' | 'Server';

/** Only the metafields this module reads — keeps it decoupled from the codegen types. */
interface MetafieldValue {
  value?: string | null;
  jsonValue?: unknown;
}
export interface TrackingInstallation {
  posthog_api_key?: MetafieldValue | null;
  posthog_api_host?: MetafieldValue | null;
  data_collection_strategy?: MetafieldValue | null;
  web_pixel_feature_toggle?: MetafieldValue | null;
  web_pixel_settings?: MetafieldValue | null;
  web_pixel_tracked_events?: MetafieldValue | null;
  /** PostHog-only event renaming, owned by the PostHog destination. */
  web_pixel_posthog_ecommerce_spec?: MetafieldValue | null;
  js_web_posthog_feature_toggle?: MetafieldValue | null;
  js_web_posthog_config?: MetafieldValue | null;
  iris_api_key?: MetafieldValue | null;
  iris_api_host?: MetafieldValue | null;
  iris_enabled?: MetafieldValue | null;
  iris_js_config?: MetafieldValue | null;
  iris_js_feature_toggle?: MetafieldValue | null;
}

const isOn = (m?: MetafieldValue | null) => m?.value === 'true';
const str = (m?: MetafieldValue | null) => (m?.value || '').trim();

/** Shopify webhook topics VizHog subscribes to, per shopify.app.visionlabs.toml. */
export const WEBHOOK_TOPICS = ['orders/create', 'orders/cancelled', 'refunds/create'] as const;

/** Events the server-side webhook path emits — see app/common.server/iris/order-to-event.ts. */
export const WEBHOOK_EVENTS = [
  { topic: 'orders/create', event: 'Order Completed' },
  { topic: 'orders/cancelled', event: 'Order Cancelled' },
  { topic: 'refunds/create', event: 'Order Refunded' },
] as const;

export interface SourceView {
  id: 'shopify-web' | 'shopify-webhooks';
  name: string;
  detail: string;
  badge: { label: string; tone: 'success' | 'info' | undefined };
  /** In-app route that configures this source, if any. */
  href: string | null;
}

export interface DestinationView {
  id: DestinationId;
  name: string;
  /** Credential shown on the card, e.g. "Project API Key". */
  idLabel: string;
  idValue: string;
  host: string;
  paths: DeliveryPath[];
  /** Credentials present — enough to send. */
  configured: boolean;
  /** Configured AND at least one delivery path switched on. */
  live: boolean;
  /** Why it isn't live, when it isn't. */
  blockedReason: string | null;
}

export function deriveSources(
  install: TrackingInstallation,
  jsWebEmbedActive: boolean,
  irisEmbedActive = false,
): SourceView[] {
  const webPixelOn = isOn(install.web_pixel_feature_toggle);
  const jsWebOn = isOn(install.js_web_posthog_feature_toggle);
  const irisJsOn = isOn(install.iris_js_feature_toggle);

  // Each theme embed is named, because "JS theme embed" was ambiguous once
  // there were two of them and only one might need activating.
  const webParts: string[] = [];
  if (webPixelOn) webParts.push('Web Pixel');
  if (jsWebOn) webParts.push(jsWebEmbedActive ? 'PostHog JS embed' : 'PostHog JS embed (not activated)');
  if (irisJsOn) webParts.push(irisEmbedActive ? 'Iris SDK embed' : 'Iris SDK embed (not activated)');

  const anyOn = webPixelOn || jsWebOn || irisJsOn;
  const needsActivation = (jsWebOn && !jsWebEmbedActive) || (irisJsOn && !irisEmbedActive);

  return [
    {
      id: 'shopify-web',
      name: 'Shopify Web',
      detail: webParts.length ? webParts.join(' · ') : 'Web Pixel and theme embeds all off',
      badge: anyOn
        ? { label: needsActivation ? 'Needs theme activation' : 'On', tone: needsActivation ? undefined : 'success' }
        : { label: 'Off', tone: undefined },
      href: '/app/web-pixel-settings',
    },
    {
      id: 'shopify-webhooks',
      name: 'Shopify Webhooks',
      // Registered in shopify.app.visionlabs.toml at install — no merchant toggle.
      detail: WEBHOOK_TOPICS.join(' · '),
      badge: { label: 'Active', tone: 'success' },
      href: null,
    },
  ];
}

export function deriveDestinations(install: TrackingInstallation): DestinationView[] {
  const webPixelOn = isOn(install.web_pixel_feature_toggle);
  const jsWebOn = isOn(install.js_web_posthog_feature_toggle);

  const posthogKey = str(install.posthog_api_key);
  const posthogConfigured = posthogKey !== '';
  const posthogWeb = webPixelOn || jsWebOn;

  const irisKey = str(install.iris_api_key);
  const irisConfigured = irisKey !== '';
  const irisOn = isOn(install.iris_enabled);
  // Two independent web legs now: the pixel's dual-sink and the SDK theme embed.
  // The embed doesn't need iris_enabled — that flag only gates the pixel sink.
  const irisJsOn = isOn(install.iris_js_feature_toggle);

  const posthog: DestinationView = {
    id: 'posthog',
    name: 'PostHog',
    idLabel: 'Project API Key',
    idValue: posthogKey,
    host: str(install.posthog_api_host) || 'https://us.i.posthog.com',
    // Server path is the Pub/Sub → Cloudflare worker leg. It's provisioned
    // outside this app, so we can't probe it — surfaced, never asserted "live".
    paths: [...(posthogWeb ? (['Web'] as const) : []), 'Server'],
    configured: posthogConfigured,
    live: posthogConfigured && posthogWeb,
    blockedReason: !posthogConfigured
      ? 'No project API key set'
      : !posthogWeb
        ? 'Web Pixel and JS embed are both off'
        : null,
  };

  const iris: DestinationView = {
    id: 'iris',
    name: 'Iris',
    idLabel: 'Publishable Key',
    idValue: irisKey,
    host: str(install.iris_api_host) || Constant.IRIS_DEFAULT_API_HOST,
    paths: [
      ...((irisOn && webPixelOn) || irisJsOn ? (['Web'] as const) : []),
      ...(irisOn ? (['Server'] as const) : []),
    ],
    configured: irisConfigured,
    live: irisConfigured && (irisOn || irisJsOn),
    blockedReason: !irisConfigured
      ? 'No publishable key set'
      : !irisOn && !irisJsOn
        ? 'Iris is switched off'
        : null,
  };

  return [posthog, iris];
}

/** Truncate a credential for display — never show a full token on an overview. */
export function maskKey(key: string, lead = 12): string {
  if (!key) return '—';
  return key.length <= lead + 4 ? key : `${key.slice(0, lead)}…${key.slice(-4)}`;
}
