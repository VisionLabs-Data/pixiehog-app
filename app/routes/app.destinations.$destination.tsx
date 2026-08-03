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
 */
import { useCallback, useMemo, useState } from 'react';
import type { ClientActionFunctionArgs, ClientLoaderFunctionArgs } from '@remix-run/react';
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
  Divider,
  Icon,
  InlineStack,
  Link,
  Page,
  RadioButton,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { CheckCircleIcon, ExternalIcon, HomeIcon, SearchIcon } from '@shopify/polaris-icons';
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
import { DataCollectionStrategySchema } from '../../common/dto/data-collection-stratergy';
import { irisApiHostPrimitive, irisApiKeyPrimitive } from '../../common/dto/iris-settings.dto';
import { metafieldsSet as clientMetafieldsSet } from '../common.client/mutations/metafields-set';
import { metafieldsDelete as clientMetafieldsDelete } from '../common.client/mutations/metafields-delete';
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
  const jsWebEmbedActive = await clientAppEmbedStatus(
    window.ENV.APP_POSTHOG_JS_WEB_THEME_APP_UUID,
  );
  return {
    install: response.currentAppInstallation as TrackingInstallation,
    jsWebEmbedActive: Boolean(jsWebEmbedActive),
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
  } else if (payload.step === 'consent') {
    const parsed = DataCollectionStrategySchema.safeParse({
      data_collection_strategy: payload.data_collection_strategy,
    });
    if (!parsed.success) {
      return json({ ok: false, message: 'Pick a data collection strategy' }, { status: 400 });
    }
    sets.push({
      key: Constant.METAFIELD_KEY_DATA_COLLECTION_STRATEGY,
      namespace,
      ownerId,
      type: 'single_line_text_field',
      value: parsed.data.data_collection_strategy,
    });
  } else {
    return json({ ok: false, message: 'Nothing to save for this step' }, { status: 400 });
  }

  if (deletes.length) await clientMetafieldsDelete(deletes);
  if (sets.length) await clientMetafieldsSet(sets);
  return json({ ok: true, message: 'Settings saved' }, { status: 200 });
};

export function HydrateFallback() {
  return <LoadingSpinner />;
}

/* ── Step panels ─────────────────────────────────────────────────────────── */

interface PanelProps {
  dest: DestinationView;
  install: TrackingInstallation;
  jsWebEmbedActive: boolean;
}

function OverviewPanel({ dest, install }: PanelProps) {
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
              ? 'PostHog receives storefront events from the Web Pixel and order events from the Shopify webhook pipeline.'
              : 'Iris receives storefront events from the Web Pixel dual-sink and authoritative order events straight from Shopify webhooks.'}
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
                      ? dest.id === 'posthog'
                        ? 'Web Pixel + JS theme embed, in the shopper’s browser'
                        : 'Web Pixel dual-sink (pixiehog-iris.ts)'
                      : dest.id === 'posthog'
                        ? 'Shopify webhooks → Pub/Sub → Cloudflare worker'
                        : 'Shopify webhooks → /webhooks/orders → Iris /ingest'}
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
  const webEvents = useMemo(() => {
    const settings = (install.web_pixel_settings?.jsonValue as Record<string, boolean> | null) ?? {};
    return Object.keys(webPixelToPostHogEcommerceSpecMap).map((key) => ({
      key,
      label: webPixelToPostHogEcommerceSpecMap[key] ?? key,
      on: settings[key] === true,
    }));
  }, [install]);
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

        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h3" variant="headingSm">
              Web — Web Pixel
            </Text>
            <Badge tone={onCount ? 'success' : undefined}>{`${onCount} of ${webEvents.length} on`}</Badge>
          </InlineStack>
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
            <Button url="/app/web-pixel-settings">Edit Web Pixel events</Button>
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

function ConsentPanel({ dest, install }: PanelProps) {
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const initial = install.data_collection_strategy?.value || 'anonymized';
  const [strategy, setStrategy] = useState(initial);
  const saving = fetcher.state !== 'idle';

  if (dest.id === 'iris') {
    return (
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Consent
          </Text>
          <Text as="p" tone="subdued">
            Iris rides the same Web Pixel as PostHog, so it inherits the Shopify Web
            source&rsquo;s data collection strategy — it can&rsquo;t be set separately here.
          </Text>
          <InlineStack align="space-between">
            <Text as="p" variant="bodyMd">
              Current strategy
            </Text>
            <Badge>{STRATEGY_LABELS[initial] ?? initial}</Badge>
          </InlineStack>
          <InlineStack>
            <Button url="/app/destinations/posthog?step=consent">Change on PostHog</Button>
          </InlineStack>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Would you like us to consider consent?
          </Text>
          <Text as="p" tone="subdued">
            Controls whether events carry identifiable customer data, and whether that depends on
            the shopper&rsquo;s consent choices.
          </Text>
        </BlockStack>

        {fetcher.data && (
          <Banner tone={fetcher.data.ok ? 'success' : 'critical'}>{fetcher.data.message}</Banner>
        )}

        <BlockStack gap="200">
          <RadioButton
            label="Anonymized"
            helpText="No identifiable customer data is sent. Consent is not required."
            checked={strategy === 'anonymized'}
            id="anonymized"
            onChange={() => setStrategy('anonymized')}
          />
          <RadioButton
            label="Not anonymized, by consent"
            helpText="Identifiable data is sent only for shoppers who have granted consent."
            checked={strategy === 'non-anonymized-by-consent'}
            id="non-anonymized-by-consent"
            onChange={() => setStrategy('non-anonymized-by-consent')}
          />
          <RadioButton
            label="Not anonymized"
            helpText="Identifiable data is always sent. This bypasses customer privacy preferences."
            checked={strategy === 'non-anonymized'}
            id="non-anonymized"
            onChange={() => setStrategy('non-anonymized')}
          />
        </BlockStack>

        {strategy === 'non-anonymized' && (
          <Banner tone="warning">
            This option bypasses customer privacy preferences. Make sure you have a lawful basis
            before enabling it.
          </Banner>
        )}

        <InlineStack>
          <Button
            variant="primary"
            loading={saving}
            disabled={strategy === initial || saving}
            onClick={() =>
              fetcher.submit(JSON.stringify({ step: 'consent', data_collection_strategy: strategy }), {
                method: 'POST',
                encType: 'application/json',
              })
            }
          >
            Save
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function ClientSidePanel({ dest, install, jsWebEmbedActive }: PanelProps) {
  const webPixelOn = install.web_pixel_feature_toggle?.value === 'true';
  const jsWebOn = install.js_web_posthog_feature_toggle?.value === 'true';

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
              <Button url="/app/js-web-posthog-settings">JS Web config</Button>
              <Button url="/app/web-pixel-settings">Web Pixel settings</Button>
            </InlineStack>
          </>
        )}

        {dest.id === 'iris' && (
          <>
            <Banner tone="info">
              Iris is a second sink on the same Web Pixel — there is no separate script to install.
              Turning the Web Pixel off stops the Iris web path too.
            </Banner>
            <InlineStack>
              <Button url="/app/web-pixel-settings">Web Pixel settings</Button>
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
function SdkConfigPanel({ install }: PanelProps) {
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const saved = install.iris_js_config?.jsonValue as Partial<IrisJsConfig> | null | undefined;
  const enabledInitial = install.iris_js_feature_toggle?.value === 'true';

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

          <Banner tone="warning" title="No storefront loader ships this yet">
            <Text as="p">
              The Web Pixel&rsquo;s Iris sink is a direct HTTP client, not the Mythic SDK, so it
              can&rsquo;t honour these options. They take effect once an Iris theme app embed loads{' '}
              <code>{Constant.IRIS_SDK_LOADER_URL}</code> — the same shape as the existing PostHog
              JS embed. Saving now stores the config so it&rsquo;s ready for that extension.
            </Text>
          </Banner>

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
  /** Overview isn't a setup task, so it doesn't count toward progress. */
  task: boolean;
  done: boolean;
  Panel: (props: PanelProps) => JSX.Element;
}

function buildSteps(dest: DestinationView, install: TrackingInstallation, jsWebEmbedActive: boolean): Step[] {
  const webPixelOn = install.web_pixel_feature_toggle?.value === 'true';
  const jsWebOn = install.js_web_posthog_feature_toggle?.value === 'true';
  const trackedCount = Object.values(
    (install.web_pixel_settings?.jsonValue as Record<string, boolean> | null) ?? {},
  ).filter(Boolean).length;

  return [
    { id: 'overview', label: 'Overview', task: false, done: false, Panel: OverviewPanel },
    { id: 'general', label: 'General Settings', task: true, done: dest.configured, Panel: GeneralPanel },
    { id: 'events', label: 'Events', task: true, done: trackedCount > 0, Panel: EventsPanel },
    {
      id: 'consent',
      label: 'Consent',
      task: true,
      // Iris inherits the strategy, so there's nothing to complete on its side.
      done: dest.id === 'iris' ? true : Boolean(install.data_collection_strategy?.value),
      Panel: ConsentPanel,
    },
    {
      id: 'client-side',
      label: 'Client-Side Tracking',
      task: true,
      done: dest.id === 'iris' ? webPixelOn : webPixelOn || (jsWebOn && jsWebEmbedActive),
      Panel: ClientSidePanel,
    },
    // PostHog's equivalent lives on its own page (/app/js-web-posthog-settings),
    // so only Iris carries its SDK config inline here.
    ...(dest.id === 'iris'
      ? [
          {
            id: 'sdk-config',
            label: 'JS SDK Config',
            task: true,
            done: install.iris_js_feature_toggle?.value === 'true',
            Panel: SdkConfigPanel,
          } satisfies Step,
        ]
      : []),
  ];
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function DestinationSettings() {
  const { install, jsWebEmbedActive } = useLoaderData<typeof clientLoader>();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const id = params.destination as DestinationId;
  const dest = deriveDestinations(install).find((d) => d.id === id)!;
  const steps = buildSteps(dest, install, jsWebEmbedActive);

  const activeId = searchParams.get('step') || 'overview';
  const active = steps.find((s) => s.id === activeId) ?? steps[0];
  const tasks = steps.filter((s) => s.task);
  const doneCount = tasks.filter((s) => s.done).length;

  const Mark = id === 'posthog' ? posthogSvg : irisSvg;

  return (
    <Page
      backAction={{ content: 'My Tracking', onAction: () => navigate('/app/tracking') }}
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
                            source={step.task ? CheckCircleIcon : HomeIcon}
                            tone={step.task ? (step.done ? 'success' : 'subdued') : 'subdued'}
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
          <active.Panel dest={dest} install={install} jsWebEmbedActive={jsWebEmbedActive} />
        </Box>
      </InlineStack>
    </Page>
  );
}
