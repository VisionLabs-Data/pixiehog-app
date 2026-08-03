/**
 * Per-destination settings — /app/destinations/posthog and /app/destinations/iris.
 *
 * A Setup Steps rail on the left, the active step's panel on the right. Which
 * steps exist, and whether each is complete, is derived per destination from the
 * app-installation metafields (see app/tracking-config.ts).
 *
 * Steps that already have a full editor elsewhere (the Web Pixel event matrix,
 * the JS Web config) show live state here and hand off to that page rather than
 * duplicating the form.
 *
 * The dividing line, and the reason the pages are split this way at all:
 * anything that only affects THIS destination is editable here (credentials,
 * event renaming, its own SDK config). Anything shared by every destination is
 * read-only here and edited on the source that owns it — /app/web-pixel-settings
 * for the Shopify Web source. Consent is the case that catches people out: the
 * pixel resolves identified-vs-anonymous once and fans the answer out, so it
 * cannot be a per-destination setting even though it looks like one.
 */
import { useCallback, useMemo, useState } from 'react';
import type { ClientActionFunctionArgs, ClientLoaderFunctionArgs } from '@remix-run/react';
import type { IconSource } from '@shopify/polaris';
import {
  json,
  useFetcher,
  useLoaderData,
  useNavigate,
  useParams,
  useSearchParams,
} from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Icon,
  InlineStack,
  Link,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { CheckCircleIcon, ExternalIcon, HomeIcon, LockIcon, SearchIcon } from '@shopify/polaris-icons';
import { Constant } from '../../common/constant';
import MultiChoiceSelector from '../../common/components/MultiChoiceSelector';
import StackIcon from '../../common/components/StackIcon';
import { SettingType } from '../../common/interfaces/feature-settings.interface';
import type { IrisJsConfig } from '../../common/dto/iris-js-settings.dto';
import { IrisJsConfigSchema } from '../../common/dto/iris-js-settings.dto';
import type { IrisJsSettingChoice } from '../iris-js-settings-rows';
import { irisJsSettingsWithValues } from '../iris-js-settings-rows';
import { PosthogApiHostSchema } from '../../common/dto/posthog-api-host.dto';
import { posthogApiKeyPrimitive } from '../../common/dto/posthog-api-key.dto';
import { WebPixelPostHogEcommerceSpecSchema } from '../../common/dto/web-pixel-posthog-ecommerce-spec';
import type { JsWebPosthogConfig } from '../../common/dto/js-web-settings.dto';
import { JsWebPosthogConfigSchema } from '../../common/dto/js-web-settings.dto';
import type { JsWebPosthogSettingChoice } from '../js-web-posthog-settings-rows';
import { jsWebPosthogSettingsWithValues } from '../js-web-posthog-settings-rows';
import { irisApiHostPrimitive, irisApiKeyPrimitive } from '../../common/dto/iris-settings.dto';
import { metafieldsSet as clientMetafieldsSet } from '../common.client/mutations/metafields-set';
import { metafieldsDelete as clientMetafieldsDelete } from '../common.client/mutations/metafields-delete';
import { recalculateWebPixel as clientRecalculateWebPixel } from '../common.client/procedures/recalculate-web-pixel';
import { queryCurrentAppInstallation as clientQueryCurrentAppInstallation } from '../common.client/queries/current-app-installation';
import { appEmbedStatus as clientAppEmbedStatus } from '../common.client/procedures/app-embed-status';
import LoadingSpinner from '../../common/components/LoadingSpinner';
import { webPixelToPostHogEcommerceSpecMap } from './app.web-pixel-settings/event-map';
import { irisSvg, posthogSvg } from '../brand-icons';
import type { DestinationId, DestinationView, TrackingInstallation } from '../tracking-config';
import { WEBHOOK_EVENTS, deriveDestinations } from '../tracking-config';

const DESTINATIONS: DestinationId[] = ['posthog', 'iris'];

const apiHostOptions = [
  { label: 'PostHog US Cloud', value: 'https://us.i.posthog.com' },
  { label: 'PostHog EU Cloud', value: 'https://eu.i.posthog.com' },
  { label: 'Reverse proxy', value: 'custom' },
];

const STRATEGY_LABELS: Record<string, string> = {
  anonymized: 'Anonymized',
  'non-anonymized': 'Not anonymized',
  'non-anonymized-by-consent': 'Not anonymized, by consent',
};

/* ── Data ────────────────────────────────────────────────────────────────── */

export const clientLoader = async ({ params }: ClientLoaderFunctionArgs) => {
  const id = params.destination as DestinationId;
  if (!DESTINATIONS.includes(id)) {
    throw new Response('Unknown destination', { status: 404 });
  }
  const response = await clientQueryCurrentAppInstallation();
  // Both embeds are checked here rather than per-panel so switching steps
  // doesn't refetch the theme file each time.
  // One theme extension, two blocks — same UUID, told apart by handle.
  const themeExtensionUuid = window.ENV.APP_POSTHOG_JS_WEB_THEME_APP_UUID;
  const [jsWebEmbedActive, irisEmbedActive] = await Promise.all([
    clientAppEmbedStatus(themeExtensionUuid, Constant.APP_POSTHOG_JS_WEB_THEME_APP_HANDLE),
    clientAppEmbedStatus(themeExtensionUuid, Constant.APP_IRIS_JS_THEME_APP_HANDLE),
  ]);
  return {
    install: response.currentAppInstallation as TrackingInstallation,
    jsWebEmbedActive: Boolean(jsWebEmbedActive),
    irisEmbedActive: Boolean(irisEmbedActive),
    themeExtensionUuid,
    shop: window.shopify.config.shop,
  };
};

export const clientAction = async ({ request }: ClientActionFunctionArgs) => {
  const payload = await request.json();
  const response = await clientQueryCurrentAppInstallation();
  const ownerId = response.currentAppInstallation.id;
  const namespace = Constant.METAFIELD_NAMESPACE;

  const sets: Parameters<typeof clientMetafieldsSet>[0] = [];
  const deletes: Parameters<typeof clientMetafieldsDelete>[0] = [];

  // An empty value means "unset" — Shopify rejects '' on a metafield, so delete it.
  const text = (key: string, value: string) => {
    if (value === '') {
      deletes.push({ key, namespace, ownerId });
    } else {
      sets.push({ key, namespace, ownerId, type: 'single_line_text_field', value });
    }
  };

  if (payload.step === 'general' && payload.destination === 'posthog') {
    const key = posthogApiKeyPrimitive.safeParse(payload.posthog_api_key ?? '');
    if (!key.success) {
      return json({ ok: false, message: key.error.flatten().formErrors.join(' - ') || 'Invalid PostHog key' }, { status: 400 });
    }
    const host = PosthogApiHostSchema.safeParse({ posthog_api_host: payload.posthog_api_host ?? '' });
    if (!host.success) {
      return json({ ok: false, message: 'Enter a valid API host URL' }, { status: 400 });
    }
    // An empty host is only valid as "PostHog not configured". Paired with a key
    // it would produce a pixel that captures to nowhere and reports no error, so
    // the two have to be set or cleared together.
    if (key.data && !host.data.posthog_api_host) {
      return json({ ok: false, message: 'Pick an API host to go with the project API key' }, { status: 400 });
    }
    text(Constant.METAFIELD_KEY_POSTHOG_API_KEY, key.data);
    text(Constant.METAFIELD_KEY_POSTHOG_API_HOST, host.data.posthog_api_host);
  } else if (payload.step === 'general' && payload.destination === 'iris') {
    const key = irisApiKeyPrimitive.safeParse(payload.iris_api_key ?? '');
    if (!key.success) {
      return json({ ok: false, message: 'Iris publishable keys start with pk_' }, { status: 400 });
    }
    const host = irisApiHostPrimitive.safeParse(payload.iris_api_host ?? '');
    if (!host.success) {
      return json({ ok: false, message: 'Enter a valid Iris host URL' }, { status: 400 });
    }
    const enabled = payload.iris_enabled === true || payload.iris_enabled === 'true';
    sets.push({
      key: Constant.METAFIELD_KEY_IRIS_ENABLED,
      namespace,
      ownerId,
      type: 'boolean',
      value: String(enabled),
    });
    sets.push({
      key: Constant.METAFIELD_KEY_IRIS_API_HOST,
      namespace,
      ownerId,
      type: 'single_line_text_field',
      value: host.data || Constant.IRIS_DEFAULT_API_HOST,
    });
    text(Constant.METAFIELD_KEY_IRIS_API_KEY, key.data);
  } else if (payload.step === 'sdk-config') {
    const { step, iris_js_feature_toggle, ...config } = payload;
    const parsed = IrisJsConfigSchema.safeParse(config);
    if (!parsed.success) {
      const bad = Object.keys(parsed.error.flatten().fieldErrors).join(', ');
      return json({ ok: false, message: `Invalid SDK settings: ${bad}` }, { status: 400 });
    }
    sets.push({
      key: Constant.METAFIELD_KEY_IRIS_JS_FEATURE_TOGGLE,
      namespace,
      ownerId,
      type: 'boolean',
      value: String(iris_js_feature_toggle === true || iris_js_feature_toggle === 'true'),
    });
    sets.push({
      key: Constant.METAFIELD_KEY_IRIS_JS_CONFIG,
      namespace,
      ownerId,
      type: 'json',
      value: JSON.stringify(parsed.data),
    });
  } else if (payload.step === 'posthog-sdk-config') {
    const { step, js_web_posthog_feature_toggle, ...config } = payload;
    const parsed = JsWebPosthogConfigSchema.safeParse(config);
    if (!parsed.success) {
      const bad = Object.keys(parsed.error.flatten().fieldErrors).join(', ');
      return json({ ok: false, message: `Invalid SDK settings: ${bad}` }, { status: 400 });
    }
    sets.push({
      key: Constant.METAFIELD_KEY_JS_WEB_POSTHOG_FEATURE_TOGGLE,
      namespace,
      ownerId,
      type: 'boolean',
      value: String(js_web_posthog_feature_toggle === true || js_web_posthog_feature_toggle === 'true'),
    });
    sets.push({
      key: Constant.METAFIELD_KEY_JS_WEB_POSTHOG_CONFIG,
      namespace,
      ownerId,
      type: 'json',
      value: JSON.stringify(parsed.data),
    });
  } else if (payload.step === 'events' && payload.destination === 'posthog') {
    const parsed = WebPixelPostHogEcommerceSpecSchema.safeParse({
      posthog_ecommerce_spec: payload.posthog_ecommerce_spec,
    });
    if (!parsed.success) {
      return json({ ok: false, message: 'Invalid ecommerce spec value' }, { status: 400 });
    }
    sets.push({
      key: Constant.METAFIELD_KEY_POSTHOG_ECOMMERCE_SPEC,
      namespace,
      ownerId,
      type: 'boolean',
      value: String(parsed.data.posthog_ecommerce_spec),
    });
  } else {
    return json({ ok: false, message: 'Nothing to save for this step' }, { status: 400 });
  }

  if (deletes.length) await clientMetafieldsDelete(deletes);
  if (sets.length) await clientMetafieldsSet(sets);

  // Everything above is read by the running Web Pixel, so it has to be pushed
  // into the pixel's settings — a metafield write alone changes nothing on the
  // storefront. Harmless when the pixel isn't installed yet.
  const recalculated = await clientRecalculateWebPixel();
  if (recalculated?.status === 'error') {
    return json({ ok: false, message: recalculated.message }, { status: 422 });
  }
  return json({ ok: true, message: 'Settings saved' }, { status: 200 });
};

export function HydrateFallback() {
  return <LoadingSpinner />;
}

/* ── Step panels ─────────────────────────────────────────────────────────── */

interface PanelProps {
  dest: DestinationView;
  install: TrackingInstallation;
  /** PostHog's theme app embed is active on the live theme. */
  jsWebEmbedActive: boolean;
  /** Iris's theme app embed is active on the live theme. */
  irisEmbedActive: boolean;
  /** Deeplink target for the theme editor. */
  themeEditorUrl: (uuid: string, handle: string) => string;
  /** Registration UUID of the theme extension both embed blocks live in. */
  themeExtensionUuid: string;
}

/**
 * Names the web-path legs that are actually switched on for a destination.
 *
 * Was a hardcoded string per destination, which went stale the moment Iris grew
 * a second web leg (the SDK theme embed) — the Overview kept describing only the
 * pixel. It also leaked a source filename, `pixiehog-iris.ts`, into merchant-
 * facing copy.
 */
function describeWebPath(
  dest: DestinationView,
  install: TrackingInstallation,
  jsWebEmbedActive: boolean,
  irisEmbedActive: boolean,
): string {
  const webPixelOn = install.web_pixel_feature_toggle?.value === 'true';
  const legs: string[] = [];

  if (dest.id === 'posthog') {
    if (webPixelOn) legs.push('Web Pixel');
    if (install.js_web_posthog_feature_toggle?.value === 'true' && jsWebEmbedActive) {
      legs.push('PostHog JS theme embed');
    }
  } else {
    // The pixel only forwards to Iris when the Iris sink itself is enabled.
    if (webPixelOn && install.iris_enabled?.value === 'true') legs.push('Web Pixel');
    if (install.iris_js_feature_toggle?.value === 'true' && irisEmbedActive) {
      legs.push('Iris SDK theme embed');
    }
  }

  return legs.length
    ? `${legs.join(' + ')}, in the shopper’s browser`
    : 'Nothing is collecting in the browser';
}

function OverviewPanel({ dest, install, jsWebEmbedActive, irisEmbedActive }: PanelProps) {
  const strategy = install.data_collection_strategy?.value || 'anonymized';
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Overview
          </Text>
          <Text as="p" tone="subdued">
            {dest.id === 'posthog'
              ? 'PostHog receives storefront events in the browser, and order events server-side from the Shopify webhook pipeline.'
              : 'Iris receives storefront events in the browser — from the Web Pixel, from its own JS SDK, or both — plus authoritative order events server-side from Shopify webhooks.'}
          </Text>
        </BlockStack>

        {dest.blockedReason && (
          <Banner tone={dest.configured ? 'warning' : 'info'}>{dest.blockedReason}</Banner>
        )}

        <Divider />

        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Delivery paths
          </Text>
          {(['Web', 'Server'] as const).map((path) => {
            const active = dest.paths.includes(path);
            return (
              <InlineStack key={path} align="space-between" blockAlign="center">
                <BlockStack gap="050">
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    {path}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {path === 'Web'
                      ? describeWebPath(dest, install, jsWebEmbedActive, irisEmbedActive)
                      : dest.id === 'posthog'
                        ? 'Shopify webhooks → Pub/Sub → Cloudflare worker'
                        : 'Shopify webhooks → Iris, for every order'}
                  </Text>
                </BlockStack>
                <Badge tone={active ? 'success' : undefined}>{active ? 'On' : 'Off'}</Badge>
              </InlineStack>
            );
          })}
        </BlockStack>

        {dest.id === 'posthog' && (
          <Banner tone="info">
            The server path runs on infrastructure outside this app (Pub/Sub topic{' '}
            <Text as="span" fontWeight="semibold">
              vizhog-shopify-webhooks
            </Text>
            ), so its health can&rsquo;t be probed from here.
          </Banner>
        )}

        <Divider />

        <InlineStack align="space-between">
          <Text as="p" variant="bodySm" tone="subdued">
            Data collection strategy
          </Text>
          <Text as="p" variant="bodySm">
            {STRATEGY_LABELS[strategy] ?? strategy}
          </Text>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function GeneralPanel({ dest, install }: PanelProps) {
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const saving = fetcher.state !== 'idle';

  const initialKey = (dest.id === 'posthog' ? install.posthog_api_key : install.iris_api_key)?.value || '';
  const initialHost =
    (dest.id === 'posthog' ? install.posthog_api_host : install.iris_api_host)?.value ||
    (dest.id === 'iris' ? Constant.IRIS_DEFAULT_API_HOST : '');

  const [apiKey, setApiKey] = useState(initialKey);
  const [enabled, setEnabled] = useState(install.iris_enabled?.value === 'true');
  const knownHost = apiHostOptions.some((o) => o.value === initialHost);
  const [hostChoice, setHostChoice] = useState(
    dest.id === 'posthog' ? (initialHost && !knownHost ? 'custom' : initialHost) : initialHost,
  );
  const [customHost, setCustomHost] = useState(knownHost ? '' : initialHost);

  const resolvedHost = dest.id === 'posthog' && hostChoice === 'custom' ? customHost : hostChoice;
  const dirty =
    apiKey !== initialKey ||
    resolvedHost !== initialHost ||
    (dest.id === 'iris' && enabled !== (install.iris_enabled?.value === 'true'));

  const save = useCallback(() => {
    fetcher.submit(
      JSON.stringify(
        dest.id === 'posthog'
          ? { step: 'general', destination: 'posthog', posthog_api_key: apiKey, posthog_api_host: resolvedHost }
          : {
              step: 'general',
              destination: 'iris',
              iris_api_key: apiKey,
              iris_api_host: resolvedHost,
              iris_enabled: enabled,
            },
      ),
      { method: 'POST', encType: 'application/json' },
    );
  }, [fetcher, dest.id, apiKey, resolvedHost, enabled]);

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            General Settings
          </Text>
          <Text as="p" tone="subdued">
            To send your data to {dest.name}, we need the following from your {dest.name} account.
          </Text>
        </BlockStack>

        {fetcher.data && (
          <Banner tone={fetcher.data.ok ? 'success' : 'critical'}>{fetcher.data.message}</Banner>
        )}

        {dest.id === 'iris' && (
          <Select
            label="Status"
            options={[
              { label: 'On — forward events to Iris', value: 'true' },
              { label: 'Off', value: 'false' },
            ]}
            value={String(enabled)}
            onChange={(v) => setEnabled(v === 'true')}
          />
        )}

        <TextField
          label={dest.idLabel}
          autoComplete="off"
          value={apiKey}
          onChange={setApiKey}
          placeholder={dest.id === 'posthog' ? 'phc_...' : 'pk_...'}
          helpText={
            dest.id === 'posthog'
              ? 'Project Settings → Project API Key in PostHog.'
              : 'Iris publishable key. Same value the client pixel uses.'
          }
          monospaced
        />

        {dest.id === 'posthog' ? (
          <>
            <Select
              label="API host"
              options={[{ label: 'Select a host', value: '' }, ...apiHostOptions]}
              value={hostChoice}
              onChange={setHostChoice}
            />
            {hostChoice === 'custom' && (
              <TextField
                label="Reverse proxy URL"
                autoComplete="off"
                value={customHost}
                onChange={setCustomHost}
                placeholder="https://analytics.example.com"
                monospaced
              />
            )}
          </>
        ) : (
          <TextField
            label="Ingestion host"
            autoComplete="off"
            value={hostChoice}
            onChange={setHostChoice}
            placeholder={Constant.IRIS_DEFAULT_API_HOST}
            monospaced
          />
        )}

        <InlineStack>
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || saving}>
            Save
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function EventsPanel({ dest, install }: PanelProps) {
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const specInitial = install.web_pixel_posthog_ecommerce_spec?.value === 'true';
  const [spec, setSpec] = useState(specInitial);
  const saving = fetcher.state !== 'idle';
  // PostHog-only: renames the source's Shopify event names into PostHog's
  // ecommerce spec on the way out. Iris receives the Shopify names either way,
  // which is why this control belongs to the destination and not the source.
  const renaming = dest.id === 'posthog' && spec;

  const webEvents = useMemo(() => {
    const settings = (install.web_pixel_settings?.jsonValue as Record<string, boolean> | null) ?? {};
    return Object.keys(webPixelToPostHogEcommerceSpecMap).map((key) => ({
      key,
      label: renaming ? (webPixelToPostHogEcommerceSpecMap[key] ?? key) : key,
      on: settings[key] === true,
    }));
  }, [install, renaming]);
  const onCount = webEvents.filter((e) => e.on).length;

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Events
          </Text>
          <Text as="p" tone="subdued">
            What VizHog sends to {dest.name}, by delivery path.
          </Text>
        </BlockStack>

        {dest.id === 'posthog' && (
          <>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Event naming
              </Text>
              {fetcher.data && (
                <Banner tone={fetcher.data.ok ? 'success' : 'critical'}>{fetcher.data.message}</Banner>
              )}
              <Checkbox
                label="Use PostHog's ecommerce spec event names"
                helpText="Renames events for PostHog only — for example product_viewed becomes Product Viewed. Other destinations keep Shopify's names."
                checked={spec}
                onChange={setSpec}
              />
              <InlineStack>
                <Button
                  variant="primary"
                  loading={saving}
                  disabled={spec === specInitial || saving}
                  onClick={() =>
                    fetcher.submit(
                      JSON.stringify({ step: 'events', destination: 'posthog', posthog_ecommerce_spec: spec }),
                      { method: 'POST', encType: 'application/json' },
                    )
                  }
                >
                  Save
                </Button>
              </InlineStack>
            </BlockStack>
            <Divider />
          </>
        )}

        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h3" variant="headingSm">
              Web — Web Pixel
            </Text>
            <Badge tone={onCount ? 'success' : undefined}>{`${onCount} of ${webEvents.length} on`}</Badge>
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            Which events are captured is a Shopify Web source setting, shared by every destination —
            it can only be changed there.
          </Text>
          {webEvents.map((e) => (
            <InlineStack key={e.key} align="space-between" blockAlign="center">
              <Text as="p" variant="bodySm" tone={e.on ? undefined : 'subdued'}>
                {e.label}
              </Text>
              {e.on ? (
                <StackIcon source={CheckCircleIcon} tone="success" />
              ) : (
                <Text as="span" variant="bodySm" tone="subdued">
                  Off
                </Text>
              )}
            </InlineStack>
          ))}
          {/* ponytail: the event matrix already has a full editor — link, don't rebuild. */}
          <InlineStack>
            <Button url="/app/web-pixel-settings">Edit on the Shopify Web source</Button>
          </InlineStack>
        </BlockStack>

        <Divider />

        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Server — Shopify webhooks
          </Text>
          {dest.id === 'iris' ? (
            WEBHOOK_EVENTS.map((e) => (
              <InlineStack key={e.topic} align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm">
                  {e.event}
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                  {e.topic}
                </Text>
              </InlineStack>
            ))
          ) : (
            <>
              {WEBHOOK_EVENTS.map((e) => (
                <InlineStack key={e.topic} align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm">
                    {e.topic}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    via Pub/Sub
                  </Text>
                </InlineStack>
              ))}
              <Text as="p" variant="bodySm" tone="subdued">
                Event names on this path are set by the Cloudflare worker, not by this app.
              </Text>
            </>
          )}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function ConsentPanel({ install }: PanelProps) {
  const strategy = install.data_collection_strategy?.value || 'anonymized';

  // Read-only on purpose. The Web Pixel resolves identified-vs-anonymous once
  // and fans the same answer out to every sink, so there is no such thing as a
  // per-destination consent strategy. It used to be editable on PostHog with
  // Iris showing a "change it over there" link, which read as though PostHog
  // owned a setting it merely happened to display.
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="200">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h2" variant="headingMd">
              Consent
            </Text>
            <Badge tone="info">Applies to all destinations</Badge>
          </InlineStack>
          <Text as="p" tone="subdued">
            Whether events carry identifiable customer data, and whether that depends on the
            shopper&rsquo;s consent choices. This is a Shopify Web source setting — one pixel
            decides it for every destination, so it can&rsquo;t be set separately here.
          </Text>
        </BlockStack>

        <InlineStack align="space-between" blockAlign="center">
          <Text as="p" variant="bodyMd">
            Current strategy
          </Text>
          <Badge tone={strategy === 'non-anonymized' ? 'warning' : undefined}>
            {STRATEGY_LABELS[strategy] ?? strategy}
          </Badge>
        </InlineStack>

        {strategy === 'non-anonymized' && (
          <Banner tone="warning">
            Identifiable data is sent for every shopper, to every destination, regardless of their
            privacy preferences.
          </Banner>
        )}

        <InlineStack>
          <Button url="/app/web-pixel-settings">Change on the Shopify Web source</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function ClientSidePanel({ dest, install, jsWebEmbedActive, irisEmbedActive }: PanelProps) {
  const webPixelOn = install.web_pixel_feature_toggle?.value === 'true';
  const jsWebOn = install.js_web_posthog_feature_toggle?.value === 'true';
  const irisJsOn = install.iris_js_feature_toggle?.value === 'true';

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Client-Side Tracking
          </Text>
          <Text as="p" tone="subdued">
            How {dest.name} collects events in the shopper&rsquo;s browser.
          </Text>
        </BlockStack>

        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text as="p" variant="bodyMd" fontWeight="medium">
              Web Pixel
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Shopify&rsquo;s sandboxed pixel. Required for all storefront events.
            </Text>
          </BlockStack>
          <Badge tone={webPixelOn ? 'success' : undefined}>{webPixelOn ? 'On' : 'Off'}</Badge>
        </InlineStack>

        {dest.id === 'posthog' && (
          <>
            <Divider />
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  PostHog JS theme embed
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Needed for session replay and experiments.
                </Text>
              </BlockStack>
              <Badge tone={jsWebOn && jsWebEmbedActive ? 'success' : jsWebOn ? 'warning' : undefined}>
                {!jsWebOn ? 'Off' : jsWebEmbedActive ? 'On' : 'Not activated in theme'}
              </Badge>
            </InlineStack>
            {jsWebOn && !jsWebEmbedActive && (
              <Banner tone="warning">
                The embed is enabled in the app but not activated on the live theme, so nothing
                loads on the storefront.
              </Banner>
            )}
            <InlineStack gap="200">
              <Button variant="primary" url="/app/destinations/posthog?step=sdk-config">
                Configure PostHog JS SDK
              </Button>
              <Button url="/app/web-pixel-settings">Shopify Web source</Button>
            </InlineStack>
          </>
        )}

        {dest.id === 'iris' && (
          <>
            <Divider />
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  Iris SDK theme embed
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Needed for session replay, autocapture and error tracking.
                </Text>
              </BlockStack>
              <Badge tone={irisJsOn && irisEmbedActive ? 'success' : irisJsOn ? 'warning' : undefined}>
                {!irisJsOn ? 'Off' : irisEmbedActive ? 'On' : 'Not activated in theme'}
              </Badge>
            </InlineStack>
            <Banner tone="info">
              Iris has two independent web paths. The Web Pixel above sends events on its own, so
              Iris keeps working with the SDK embed off — the embed only adds what the SDK can do
              that a plain HTTP client can&rsquo;t.
            </Banner>
            <InlineStack gap="200">
              <Button variant="primary" url="/app/destinations/iris?step=sdk-config">
                Configure Iris SDK
              </Button>
              <Button url="/app/web-pixel-settings">Shopify Web source</Button>
            </InlineStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

/**
 * Iris JS SDK config — the Iris counterpart to the PostHog JS Web Config page.
 *
 * Rows are generated from IrisJsConfigSchema, so this form covers the SDK's
 * documented option surface without hand-writing a control per option.
 */
function SdkConfigPanel({ install, irisEmbedActive, themeEditorUrl, themeExtensionUuid }: PanelProps) {
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const saved = install.iris_js_config?.jsonValue as Partial<IrisJsConfig> | null | undefined;
  const enabledInitial = install.iris_js_feature_toggle?.value === 'true';
  const strategy = install.data_collection_strategy?.value || 'anonymized';

  const [enabled, setEnabled] = useState(enabledInitial);
  const [rows, setRows] = useState(() => irisJsSettingsWithValues(saved));
  const [query, setQuery] = useState('');
  const saving = fetcher.state !== 'idle';

  const onChange = (key: string, value?: string | number | string[]) => {
    setRows((current) =>
      current.map((row) =>
        row.key !== key
          ? row
          : ({
              ...row,
              // Checkbox rows call through with no value — that means "toggle".
              value: value === undefined && row.type === SettingType.Checkbox ? !row.value : value,
            } as IrisJsSettingChoice),
      ),
    );
  };

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.map((row) => ({
      ...row,
      filteredOut: q !== '' && !row.key.toLowerCase().includes(q) && !row.description.toLowerCase().includes(q),
    })) as IrisJsSettingChoice[];
  }, [rows, query]);

  const save = () => {
    const config = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    fetcher.submit(JSON.stringify({ step: 'sdk-config', iris_js_feature_toggle: enabled, ...config }), {
      method: 'POST',
      encType: 'application/json',
    });
  };

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              JS SDK Config
            </Text>
            <Text as="p" tone="subdued">
              Options passed to <code>window.mythic.init()</code> when the Iris SDK loads on your
              storefront.
            </Text>
          </BlockStack>

          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="p" variant="bodyMd" fontWeight="medium">
                Iris SDK theme embed
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Loads <code>{Constant.IRIS_SDK_LOADER_URL}</code> in the storefront&rsquo;s head.
              </Text>
            </BlockStack>
            <Badge tone={enabledInitial && irisEmbedActive ? 'success' : enabledInitial ? 'warning' : undefined}>
              {!enabledInitial ? 'Off' : irisEmbedActive ? 'On' : 'Not activated in theme'}
            </Badge>
          </InlineStack>

          {/* Two independent switches, and only both together do anything: this
              app's toggle gates the liquid block, and the merchant has to
              activate the embed on the live theme. Reporting only one of them
              is how you get a page that claims to be working and isn't. */}
          {enabledInitial && !irisEmbedActive && (
            <Banner tone="warning" title="Not activated on your live theme">
              <Text as="p">
                The embed is enabled here but switched off in the theme, so nothing loads on the
                storefront and none of these options apply yet.{' '}
                {themeExtensionUuid ? (
                  <Link url={themeEditorUrl(themeExtensionUuid, Constant.APP_IRIS_JS_THEME_APP_HANDLE)} target="_top">
                    Activate it in the theme editor
                  </Link>
                ) : (
                  <>Activate &ldquo;Iris Javascript Web&rdquo; under App embeds in the theme editor.</>
                )}{' '}
                Remember to save the theme.
              </Text>
            </Banner>
          )}

          {strategy === 'non-anonymized-by-consent' && (
            <Banner tone="info">
              Your data collection strategy is <strong>Identified by consent</strong>, so the embed
              forces <code>requireConsent</code> on and holds every event until the shopper grants
              analytics consent — whatever that option is set to below.
            </Banner>
          )}

          {fetcher.data && (
            <Banner tone={fetcher.data.ok ? 'success' : 'critical'}>{fetcher.data.message}</Banner>
          )}

          <Select
            label="Load the Iris SDK on the storefront"
            options={[
              { label: 'Enabled', value: 'true' },
              { label: 'Disabled', value: 'false' },
            ]}
            value={String(enabled)}
            onChange={(v) => setEnabled(v === 'true')}
          />

          <TextField
            label="Filter settings"
            labelHidden
            autoComplete="off"
            placeholder={`Search ${rows.length} SDK options`}
            value={query}
            onChange={setQuery}
            prefix={<Icon source={SearchIcon} />}
            clearButton
            onClearButtonClick={() => setQuery('')}
          />
        </BlockStack>
      </Card>

      <MultiChoiceSelector settings={visibleRows} onChange={onChange} featureEnabled={enabled} />

      <Card>
        <InlineStack align="end">
          <Button variant="primary" onClick={save} loading={saving} disabled={saving}>
            Save
          </Button>
        </InlineStack>
      </Card>
    </BlockStack>
  );
}

/* ── Steps ───────────────────────────────────────────────────────────────── */

interface Step {
  id: string;
  label: string;
  /**
   * Whether the step is something you complete *here*. Overview and Consent are
   * both false: one is a summary, the other is owned by the source. Only `task`
   * steps count toward the progress figure.
   */
  task: boolean;
  done: boolean;
  /** Defaults to a check (tasks) or a home mark (everything else). */
  icon?: IconSource;
  Panel: (props: PanelProps) => JSX.Element;
}

/**
 * PostHog's JS SDK config, as a rail step.
 *
 * It used to live at /app/js-web-posthog-settings, reached by a button from the
 * Client-Side Tracking step, while Iris's equivalent was a step in this rail —
 * so the two destinations had different shapes and different step counts (3/3 vs
 * 4/4) for the same kind of setup. Same rail now; that route redirects here.
 */
function PostHogSdkConfigPanel({ install, jsWebEmbedActive, themeEditorUrl, themeExtensionUuid }: PanelProps) {
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const saved = install.js_web_posthog_config?.jsonValue as Partial<JsWebPosthogConfig> | null | undefined;
  const enabledInitial = install.js_web_posthog_feature_toggle?.value === 'true';

  const [enabled, setEnabled] = useState(enabledInitial);
  const [rows, setRows] = useState(() => jsWebPosthogSettingsWithValues(saved));
  const [query, setQuery] = useState('');
  const saving = fetcher.state !== 'idle';

  const onChange = (key: string, value?: string | number | string[]) => {
    setRows((current) =>
      current.map((row) =>
        row.key !== key
          ? row
          : ({
              ...row,
              value: value === undefined && row.type === SettingType.Checkbox ? !row.value : value,
            } as JsWebPosthogSettingChoice),
      ),
    );
  };

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.map((row) => ({
      ...row,
      filteredOut:
        q !== '' && !row.key.toLowerCase().includes(q) && !row.description.toLowerCase().includes(q),
    })) as JsWebPosthogSettingChoice[];
  }, [rows, query]);

  const save = () => {
    const config = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    fetcher.submit(
      JSON.stringify({ step: 'posthog-sdk-config', js_web_posthog_feature_toggle: enabled, ...config }),
      { method: 'POST', encType: 'application/json' },
    );
  };

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              JS SDK Config
            </Text>
            <Text as="p" tone="subdued">
              Options passed to <code>posthog.init()</code> when the PostHog script loads on your
              storefront.
            </Text>
          </BlockStack>

          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="p" variant="bodyMd" fontWeight="medium">
                PostHog JS theme embed
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Needed for session replay, surveys and experiments.
              </Text>
            </BlockStack>
            <Badge tone={enabledInitial && jsWebEmbedActive ? 'success' : enabledInitial ? 'warning' : undefined}>
              {!enabledInitial ? 'Off' : jsWebEmbedActive ? 'On' : 'Not activated in theme'}
            </Badge>
          </InlineStack>

          {enabledInitial && !jsWebEmbedActive && (
            <Banner tone="warning" title="Not activated on your live theme">
              <Text as="p">
                The embed is enabled here but switched off in the theme, so nothing loads on the
                storefront and none of these options apply yet.{' '}
                {themeExtensionUuid ? (
                  <Link
                    url={themeEditorUrl(themeExtensionUuid, Constant.APP_POSTHOG_JS_WEB_THEME_APP_HANDLE)}
                    target="_top"
                  >
                    Activate it in the theme editor
                  </Link>
                ) : (
                  <>Activate &ldquo;Posthog Javascript Web&rdquo; under App embeds in the theme editor.</>
                )}{' '}
                Remember to save the theme.
              </Text>
            </Banner>
          )}

          {fetcher.data && (
            <Banner tone={fetcher.data.ok ? 'success' : 'critical'}>{fetcher.data.message}</Banner>
          )}

          <Select
            label="Load the PostHog script on the storefront"
            options={[
              { label: 'Enabled', value: 'true' },
              { label: 'Disabled', value: 'false' },
            ]}
            value={String(enabled)}
            onChange={(v) => setEnabled(v === 'true')}
          />

          <TextField
            label="Filter settings"
            labelHidden
            autoComplete="off"
            placeholder={`Search ${rows.length} SDK options`}
            value={query}
            onChange={setQuery}
            prefix={<Icon source={SearchIcon} />}
            clearButton
            onClearButtonClick={() => setQuery('')}
          />
        </BlockStack>
      </Card>

      <MultiChoiceSelector settings={visibleRows} onChange={onChange} featureEnabled={enabled} />

      <Card>
        <InlineStack align="end">
          <Button variant="primary" onClick={save} loading={saving} disabled={saving}>
            Save
          </Button>
        </InlineStack>
      </Card>
    </BlockStack>
  );
}

function buildSteps(
  dest: DestinationView,
  install: TrackingInstallation,
  jsWebEmbedActive: boolean,
  irisEmbedActive: boolean,
): Step[] {
  const webPixelOn = install.web_pixel_feature_toggle?.value === 'true';
  const jsWebOn = install.js_web_posthog_feature_toggle?.value === 'true';
  const irisJsOn = install.iris_js_feature_toggle?.value === 'true';
  const trackedCount = Object.values(
    (install.web_pixel_settings?.jsonValue as Record<string, boolean> | null) ?? {},
  ).filter(Boolean).length;

  return [
    { id: 'overview', label: 'Overview', task: false, done: false, Panel: OverviewPanel },
    { id: 'general', label: 'General Settings', task: true, done: dest.configured, Panel: GeneralPanel },
    { id: 'events', label: 'Events', task: true, done: trackedCount > 0, Panel: EventsPanel },
    {
      id: 'consent',
      label: 'Consent (shared)',
      // Not a task: every destination inherits one strategy from the source, so
      // there is nothing to complete here for either of them.
      task: false,
      done: false,
      icon: LockIcon,
      Panel: ConsentPanel,
    },
    {
      id: 'client-side',
      label: 'Client-Side Tracking',
      task: true,
      done:
        dest.id === 'iris'
          ? webPixelOn || (irisJsOn && irisEmbedActive)
          : webPixelOn || (jsWebOn && jsWebEmbedActive),
      Panel: ClientSidePanel,
    },
    // Both destinations carry their SDK config here, in the same rail position.
    // PostHog's used to be a top-level route reached by a button, which gave the
    // two destinations different shapes and different step counts for the same
    // work. Each is complete only when the app toggle AND the theme embed are on:
    // the toggle alone means config saved and nothing loading.
    {
      id: 'sdk-config',
      label: 'JS SDK Config',
      task: true,
      done:
        dest.id === 'iris'
          ? install.iris_js_feature_toggle?.value === 'true' && irisEmbedActive
          : install.js_web_posthog_feature_toggle?.value === 'true' && jsWebEmbedActive,
      Panel: dest.id === 'iris' ? SdkConfigPanel : PostHogSdkConfigPanel,
    },
  ];
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function DestinationSettings() {
  const { install, jsWebEmbedActive, irisEmbedActive, themeExtensionUuid, shop } =
    useLoaderData<typeof clientLoader>();
  const themeEditorUrl = (uuid: string, handle: string) =>
    `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${uuid}/${handle}`;
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const id = params.destination as DestinationId;
  const dest = deriveDestinations(install).find((d) => d.id === id)!;
  const steps = buildSteps(dest, install, jsWebEmbedActive, irisEmbedActive);

  const activeId = searchParams.get('step') || 'overview';
  const active = steps.find((s) => s.id === activeId) ?? steps[0];
  const tasks = steps.filter((s) => s.task);
  const doneCount = tasks.filter((s) => s.done).length;

  const Mark = id === 'posthog' ? posthogSvg : irisSvg;

  return (
    <Page
      backAction={{ content: 'My Tracking', onAction: () => navigate('/app') }}
      title={dest.name}
      titleMetadata={dest.live ? <Badge tone="success">Live</Badge> : <Badge>{dest.configured ? 'Off' : 'Not set up'}</Badge>}
      secondaryActions={[
        {
          content: id === 'posthog' ? 'Open PostHog' : 'Open Iris host',
          icon: ExternalIcon,
          external: true,
          url: dest.host,
        },
      ]}
    >
      <InlineStack gap="400" align="start" wrap={false} blockAlign="start">
        <Box width="320px" minWidth="260px">
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm">
                  Setup Steps
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                  {doneCount}/{tasks.length}
                </Text>
              </InlineStack>

              <BlockStack gap="100">
                {steps.map((step) => {
                  const isActive = step.id === active.id;
                  return (
                    <Box
                      key={step.id}
                      background={isActive ? 'bg-surface-secondary-active' : undefined}
                      borderRadius="200"
                      padding="200"
                    >
                      <button
                        type="button"
                        onClick={() => setSearchParams({ step: step.id }, { preventScrollReset: true })}
                        // Explicit reset rather than `all: unset`, which also
                        // drops text-align and right-aligns the row content.
                        style={{
                          background: 'none',
                          border: 0,
                          padding: 0,
                          margin: 0,
                          font: 'inherit',
                          color: 'inherit',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'block',
                          width: '100%',
                        }}
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          <StackIcon
                            source={step.icon ?? (step.task ? CheckCircleIcon : HomeIcon)}
                            tone={step.task && step.done ? 'success' : 'subdued'}
                          />
                          <Text as="span" variant="bodyMd" fontWeight={isActive ? 'semibold' : undefined}>
                            {step.label}
                          </Text>
                        </InlineStack>
                      </button>
                    </Box>
                  );
                })}
              </BlockStack>

              <Divider />

              <InlineStack gap="200" blockAlign="center">
                <Box width="20px">
                  <Mark />
                </Box>
                <Text as="p" variant="bodySm" tone="subdued">
                  Need help?{' '}
                  <Link url="https://pxhog.com/faqs" external>
                    Visit support
                  </Link>
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Box>

        <Box width="100%" minWidth="0">
          <active.Panel
            dest={dest}
            install={install}
            jsWebEmbedActive={jsWebEmbedActive}
            irisEmbedActive={irisEmbedActive}
            themeEditorUrl={themeEditorUrl}
            themeExtensionUuid={themeExtensionUuid}
          />
        </Box>
      </InlineStack>
    </Page>
  );
}
