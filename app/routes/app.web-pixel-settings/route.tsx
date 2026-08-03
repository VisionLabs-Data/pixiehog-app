/**
 * The **Shopify Web source**: which storefront events the Web Pixel captures.
 *
 * Everything on this page is source-level — every destination receives the same
 * event stream from this one pixel, so a change here changes what PostHog *and*
 * Iris see. Destination-specific settings (credentials, event renaming, SDK
 * config) live under /app/destinations/:id instead.
 *
 * The PostHog Ecommerce Spec toggle used to live here. It renames events for
 * PostHog only, so it moved to the PostHog destination's Events step.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Page, Layout, Card, BlockStack, Tabs, Divider, TextField, Icon, Box, Link, InlineStack, Checkbox, Badge, Banner, Select, Text } from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
import { queryCurrentAppInstallation as clientQueryCurrentAppInstallation } from 'app/common.client/queries/current-app-installation';
import MultiChoiceSelector from '../../../common/components/MultiChoiceSelector';
import type { ClientActionFunctionArgs, ClientLoaderFunctionArgs } from '@remix-run/react';
import { json, useFetcher, useLoaderData } from '@remix-run/react';
import type { WebPixelSettingChoice } from './interface/setting-row.interface';
import { WebPixelEventsSettingsSchema } from '../../../common/dto/web-pixel-events-settings.dto';
import { metafieldsSet as clientMetafieldsSet } from '../../common.client/mutations/metafields-set';
import { Constant } from '../../../common/constant';
import type { WebPixelEventsSettings } from '../../../common/dto/web-pixel-events-settings.dto';
import { recalculateWebPixel as clientRecalculateWebPixel } from '../../common.client/procedures/recalculate-web-pixel';
import { defaultWebPixelSettings } from './default-web-pixel-settings';
import { WebPixelFeatureToggleSchema } from '../../../common/dto/web-pixel-feature-toggle.dto';
import FeatureStatusManager from 'common/components/FeatureStatusManager';
import { detailedDiff } from 'deep-object-diff';
import LoadingSpinner from '../../../common/components/LoadingSpinner';
import { queryWebPixel } from '../../common.client/queries/web-pixel';
import type { WebPixelSettings } from '../../../common/dto/web-pixel-settings.dto';
import { WebPixelDataLayerEnabledSchema } from '../../../common/dto/web-pixel-datalayer-enabled';
import { DataCollectionStrategySchema } from '../../../common/dto/data-collection-stratergy';
import type { DataCollectionStrategy } from '../../../common/dto/data-collection-stratergy';
import { shopifyKeys } from './keyoverrides';
import { deriveDestinations } from '../../tracking-config';
import type { TrackingInstallation } from '../../tracking-config';

export const clientLoader = async ({ request }: ClientLoaderFunctionArgs) => {
  const response = await clientQueryCurrentAppInstallation();
  const webPixel = await queryWebPixel() || null;
  
  return { currentAppInstallation: response.currentAppInstallation, webPixel, shop: shopify.config.shop, };
};

export const clientAction = async ({ request }: ClientActionFunctionArgs) => {
  const payload = await request.json();
  const dtoResult = WebPixelEventsSettingsSchema.merge(WebPixelFeatureToggleSchema).merge(WebPixelDataLayerEnabledSchema).merge(DataCollectionStrategySchema).safeParse(payload);
  if (!dtoResult.success) {
    const message = Object.entries(dtoResult.error.flatten().fieldErrors)
      .map(([key, errors]) => {
        return `${key}`;
      })
      .join(', ');
    return json({ ok: false, message: `Invalid keys: ${message}` }, { status: 400 });
  }
  const response = await clientQueryCurrentAppInstallation();

  const { web_pixel_feature_toggle, datalayer_enabled, data_collection_strategy, ...webPixelEventSettings } = dtoResult.data;

  await clientMetafieldsSet([
    {
      key: Constant.METAFIELD_KEY_WEB_PIXEL_FEATURE_TOGGLE,
      namespace: Constant.METAFIELD_NAMESPACE,
      ownerId: response.currentAppInstallation.id,
      type: 'boolean',
      value: web_pixel_feature_toggle.toString(),
    },
    {
      key: Constant.METAFIELD_KEY_WEB_PIXEL_EVENTS_SETTINGS,
      namespace: Constant.METAFIELD_NAMESPACE,
      ownerId: response.currentAppInstallation.id,
      value: JSON.stringify(webPixelEventSettings),
      type: 'json',
    },
    {
      key: Constant.METAFIELD_KEY_WEB_PIXEL_TRACKED_EVENTS,
      namespace: Constant.METAFIELD_NAMESPACE,
      ownerId: response.currentAppInstallation.id,
      value: JSON.stringify(Object.entries(webPixelEventSettings).filter(([key, value]) => value).map(([key, value]) => key)),
      type: 'json',
    },
    {
      key: Constant.METAFIELD_KEY_DATALAYER_ENABLED,
      namespace: Constant.METAFIELD_NAMESPACE,
      ownerId: response.currentAppInstallation.id,
      value: datalayer_enabled.toString(),
      type: 'boolean',
    },
    // Global: the pixel gates identify-vs-anonymous for *every* sink off this
    // one value, which is why it's owned by the source and not a destination.
    {
      key: Constant.METAFIELD_KEY_DATA_COLLECTION_STRATEGY,
      namespace: Constant.METAFIELD_NAMESPACE,
      ownerId: response.currentAppInstallation.id,
      value: data_collection_strategy,
      type: 'single_line_text_field',
    },
  ]);

  const responseRecalculate = await clientRecalculateWebPixel();
  if (!responseRecalculate) {
    return json({ ok: true, message: 'Web pixel settings saved' }, { status: 200 });
  }
  if (responseRecalculate.status == 'error') {
    return json({ ok: false, message: responseRecalculate.message }, { status: 422 });
  }
  return json({ ok: true, message: `Web pixel ${responseRecalculate.status}` }, { status: 200 });
};

export function HydrateFallback() {
  return <LoadingSpinner />;
}
export default function WebPixelEvents() {
  const fetcher = useFetcher();
  const { currentAppInstallation, webPixel } = useLoaderData<typeof clientLoader>();
  const webPixelActualSettings = (webPixel?.settings as WebPixelSettings | undefined) || null
  const trackedEvents = (() =>  {
    try {
      return JSON.parse(webPixelActualSettings?.tracked_events || '[]') as string[]
    } catch (error) {
      return [];
    }
  })();

  const metafieldTrackedEvents = currentAppInstallation.web_pixel_tracked_events?.jsonValue as string[] | null | undefined
  const mergedTrackedEvents = [...new Set([...(Array.isArray(metafieldTrackedEvents) ? metafieldTrackedEvents : []), ...trackedEvents])]
   
  const webPixelSettingsMetafieldValue = currentAppInstallation?.web_pixel_settings?.jsonValue as
    | undefined
    | null
    | WebPixelEventsSettings;

  const dataLayerEnabledMetafieldValue = currentAppInstallation.datalayer_enabled?.jsonValue == true;
  const strategyMetafieldValue =
    (currentAppInstallation.data_collection_strategy?.value as DataCollectionStrategy['data_collection_strategy']) ||
    'anonymized';
  // Which destinations this source is actually feeding, so the requirement
  // banner can say "no destination" instead of "no PostHog key".
  const liveDestinations = deriveDestinations(currentAppInstallation as unknown as TrackingInstallation).filter(
    (d) => d.configured,
  );


  const webPixelSettingsInitialState = defaultWebPixelSettings.map<WebPixelSettingChoice>((entry) => {
    
    return {
      ...entry,
      value: webPixelSettingsMetafieldValue?.[entry.key] === true || (webPixelActualSettings as any)?.[entry.key] === true || mergedTrackedEvents.includes(entry.key),
    } as WebPixelSettingChoice;
  });

  const [webPixelSettings, setWebPixelSettings] = useState(webPixelSettingsInitialState);

  const handleWebPixelSettingChange = (key: string, value?: string | number | string[]) => {
    setWebPixelSettings(
      webPixelSettings.map<WebPixelSettingChoice>((entry) => {
        if (entry.key != key) {
          return entry;
        }
        if (entry.type === 'Checkbox') {
          return {
            ...entry,
            value: !entry.value,
          };
        }
        return {
          ...entry,
          value: value,
        } as WebPixelSettingChoice;
      })
    );
  };

  const selectedWebPixelSettings = webPixelSettings.filter((entry) => entry.type === 'Checkbox' && entry.value);

  const [selectedTab, setSelectedTab] = useState(0);
  const handleTabChange = useCallback((selectedTabIndex: number) => setSelectedTab(selectedTabIndex), []);
  const tabs = [
    {
      id: 'all',
      content: 'All',
      accessibilityLabel: 'All Events',
      panelID: 'all-events',
    },
    {
      id: 'selected',
      content: 'Selected',
      badge: `${Object.entries(selectedWebPixelSettings).length}`,
      accessibilityLabel: 'Selected Events',
      panelID: 'selected-events',
    },
  ];

  const [filter, setFilter] = useState('');
  const handleFilterChange = useCallback(
    (newValue: string) => {
      const WebPixelsFiltered = webPixelSettings.map<WebPixelSettingChoice>((entry) => {
        return {
          ...entry,
          filteredOut: ![entry.key, entry.description].some((item) => item.includes(newValue)),
        };
      });

      setWebPixelSettings(WebPixelsFiltered);
      setFilter(newValue);
    },
    [webPixelSettings]
  );

  const [strategy, setStrategy] = useState(strategyMetafieldValue);

  const [checkedDataLayer, setCheckedDataLayer] = useState(!!dataLayerEnabledMetafieldValue);
  const handleChangeDataLayer = useCallback(
    (newChecked: boolean) => setCheckedDataLayer(newChecked),
    [],
  );

  useEffect(() => {
    if (fetcher.state == 'loading' || fetcher.state == 'submitting') {
      return;
    }
    const data = fetcher.data as { ok: false; message: string } | { ok: true; message: string } | null;
    if (!data) {
      return;
    }

    if (!data.ok) {
      window.shopify.toast.show(data.message, {
        isError: true,
        duration: 2000,
      });
      return;
    }

    window.shopify.toast.show(data.message, {
      isError: false,
      duration: 2000,
    });
    return;
  }, [fetcher, fetcher.data, fetcher.state]);

  const webPixelFeatureToggleInitialState = currentAppInstallation.web_pixel_feature_toggle?.jsonValue == true;
  const [webPixelFeatureEnabled, setWebPixelFeatureEnabled] = useState(webPixelFeatureToggleInitialState);
  const handleWebPixelFeatureEnabledToggle = useCallback(() => setWebPixelFeatureEnabled((value) => !value), []);

  const submitSettings = () => {
    fetcher.submit(
      {
        ...Object.fromEntries(
          webPixelSettings.map(({ key, value }) => {
            return [key, value];
          })
        ),
        web_pixel_feature_toggle: webPixelFeatureEnabled,
        datalayer_enabled: checkedDataLayer,
        data_collection_strategy: strategy,
      },
      {
        method: 'POST',
        encType: 'application/json',
      }
    );
  };

  const dirty = useMemo(() => {
    const diff = detailedDiff(webPixelSettingsInitialState || {}, webPixelSettings);
    if (Object.values(diff).some((changeType: object) => Object.keys(changeType).length != 0)) {
      return true;
    }
    if (webPixelFeatureEnabled != webPixelFeatureToggleInitialState) {
      return true;
    };
    if (dataLayerEnabledMetafieldValue != checkedDataLayer) {
      return true;
    }
    if (strategyMetafieldValue != strategy) {
      return true;
    }
    return false;
  }, [webPixelSettings, webPixelFeatureEnabled, webPixelFeatureToggleInitialState, webPixelSettingsInitialState, dataLayerEnabledMetafieldValue, checkedDataLayer, strategyMetafieldValue, strategy]);

  const allEventsDisabled = webPixelSettings.every((entry) => !entry.value);
  return (
    <Page
      title="Shopify Web"
      subtitle="Source — storefront events captured by the Shopify Web Pixel"
      titleMetadata={<Badge tone="info">Shared by all destinations</Badge>}
      backAction={{ content: 'My Tracking', url: '/app' }}
      primaryAction={{
        onAction: submitSettings,
        content: 'Save',
        loading: fetcher.state != 'idle',
        disabled: fetcher.state != 'idle' || !dirty,
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <FeatureStatusManager
                featureEnabled={webPixelFeatureEnabled}
                handleFeatureEnabledToggle={handleWebPixelFeatureEnabledToggle}
                dirty={dirty}
                bannerTitle="The following requirements need to be meet to finalize the Web Pixel setup:"
                bannerTone="warning"
                customActions={[
                  {
                    // A source with nowhere to send is the real blocker here.
                    // Naming a specific destination's credential would be wrong
                    // now that there is more than one destination.
                    trigger: liveDestinations.length === 0,
                    badgeText: 'Action required',
                    badgeTone: 'critical',
                    badgeToneOnDirty: 'attention',
                    bannerMessage: (
                      <div>
                        Set up at least one destination — <Link url="/app/destinations/posthog">PostHog</Link> or{' '}
                        <Link url="/app/destinations/iris">Iris</Link>.
                      </div>
                    ),
                  },
                  {
                    trigger: allEventsDisabled,
                    badgeText: 'Action required',
                    badgeTone: 'critical',
                    badgeToneOnDirty: 'attention',
                    bannerMessage: 'Select at least 1 event from the list below.',
                  },
                ]}
              />
              <Divider />

              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingSm">
                    Privacy &amp; consent
                  </Text>
                  <Badge tone="info">Applies to all destinations</Badge>
                </InlineStack>
                <Select
                  label="Data collection strategy"
                  helpText="The pixel decides identified-vs-anonymous once, then fans the result out to every destination. It cannot be set per destination."
                  options={[
                    { label: 'Anonymized — no identifiable customer data', value: 'anonymized' },
                    {
                      label: 'Identified by consent — identifiable only where consent is granted',
                      value: 'non-anonymized-by-consent',
                    },
                    { label: 'Identified — always identifiable', value: 'non-anonymized' },
                  ]}
                  value={strategy}
                  onChange={(value) => setStrategy(value as typeof strategy)}
                />
                {strategy === 'non-anonymized' && (
                  <Banner tone="warning">
                    This bypasses customer privacy preferences for every destination. Make sure you have a
                    lawful basis before saving.
                  </Banner>
                )}
              </BlockStack>

              <Divider />
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingSm">
                    Storefront broadcast
                  </Text>
                  <Badge tone="info">Applies to all destinations</Badge>
                </InlineStack>
                <Checkbox
                  label="Broadcast events to the GTM dataLayer"
                  helpText="Mirrors each captured event onto window.dataLayer. Independent of where events are sent."
                  checked={checkedDataLayer}
                  onChange={handleChangeDataLayer}
                />
              </BlockStack>

              <Divider />
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Events captured
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Shopify&rsquo;s own event names. Turning one off stops it reaching{' '}
                  <strong>every</strong> destination. To rename events for one destination only — for
                  example PostHog&rsquo;s ecommerce spec — use that{' '}
                  <Link url="/app/destinations/posthog?step=events">destination&rsquo;s Events step</Link>.
                </Text>
              </BlockStack>
              <Tabs disabled={!webPixelFeatureEnabled} tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                <BlockStack gap="500">
                  <TextField
                    label=""
                    value={filter}
                    placeholder="Filter events"
                    onChange={handleFilterChange}
                    autoComplete="off"
                    disabled={!webPixelFeatureEnabled}
                    prefix={<Icon source={SearchIcon}></Icon>}
                  />
                  <MultiChoiceSelector
                    settings={tabs[selectedTab].id === 'all' ? webPixelSettings : selectedWebPixelSettings}
                    onChange={handleWebPixelSettingChange}
                    featureEnabled={webPixelFeatureEnabled}
                    /* Always Shopify's names: this is the source, and the
                       PostHog rename now belongs to the PostHog destination. */
                    keyOverride={shopifyKeys}
                  ></MultiChoiceSelector>
                </BlockStack>
              </Tabs>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      <Box paddingBlockEnd={'800'}></Box>
    </Page>
  );
}
