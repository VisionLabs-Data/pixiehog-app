/**
 * Custom Events — the catalog of every event VizHog emits, and where each goes.
 *
 * VizHog has no user-defined event builder yet, so rather than show an empty
 * "create your first custom event" shell this page answers the question a
 * merchant actually has here: what is being sent, under what name, to whom.
 */
import type { ClientLoaderFunctionArgs } from '@remix-run/react';
import { useLoaderData } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  IndexTable,
  InlineStack,
  Page,
  Text,
  useBreakpoints,
} from '@shopify/polaris';
import { queryCurrentAppInstallation as clientQueryCurrentAppInstallation } from '../common.client/queries/current-app-installation';
import LoadingSpinner from '../../common/components/LoadingSpinner';
import { webPixelToPostHogEcommerceSpecMap } from './app.web-pixel-settings/event-map';
import type { TrackingInstallation } from '../tracking-config';
import { WEBHOOK_EVENTS, deriveDestinations } from '../tracking-config';

export const clientLoader = async ({ request }: ClientLoaderFunctionArgs) => {
  const response = await clientQueryCurrentAppInstallation();
  return { install: response.currentAppInstallation as TrackingInstallation };
};

export function HydrateFallback() {
  return <LoadingSpinner />;
}

interface Row {
  shopifyName: string;
  sentAs: string;
  path: 'Web' | 'Server';
  on: boolean;
  destinations: string[];
}

export default function CustomEvents() {
  const { install } = useLoaderData<typeof clientLoader>();
  const { smDown } = useBreakpoints();

  const destinations = deriveDestinations(install);
  const liveNames = destinations.filter((d) => d.live).map((d) => d.name);
  const webPixelOn = install.web_pixel_feature_toggle?.value === 'true';
  const settings = (install.web_pixel_settings?.jsonValue as Record<string, boolean> | null) ?? {};
  const irisLive = destinations.find((d) => d.id === 'iris')?.live ?? false;
  const posthogLive = destinations.find((d) => d.id === 'posthog')?.live ?? false;

  const rows: Row[] = [
    ...Object.entries(webPixelToPostHogEcommerceSpecMap).map(([shopifyName, sentAs]) => ({
      shopifyName,
      sentAs: sentAs ?? shopifyName,
      path: 'Web' as const,
      on: webPixelOn && settings[shopifyName] === true,
      destinations: liveNames,
    })),
    ...WEBHOOK_EVENTS.map((e) => ({
      shopifyName: e.topic,
      sentAs: e.event,
      path: 'Server' as const,
      on: irisLive,
      // The PostHog server leg is the external Cloudflare worker, which names
      // its own events — only Iris's mapping is defined in this repo.
      destinations: irisLive ? ['Iris'] : [],
    })),
  ];

  const onCount = rows.filter((r) => r.on).length;

  return (
    <Page
      title="Custom Events"
      subtitle={`${onCount} of ${rows.length} events currently sending`}
    >
      <BlockStack gap="400">
        <Banner tone="info" title="Defining your own events isn’t supported yet">
          <Text as="p">
            VizHog sends the fixed catalog below. To change which of them fire, use the{' '}
            <Text as="span" fontWeight="semibold">
              Web Pixel settings
            </Text>{' '}
            page. A merchant-facing event builder would need a rules store and a pixel change —
            it&rsquo;s not in the app today.
          </Text>
        </Banner>

        {!posthogLive && !irisLive && (
          <Banner tone="warning">
            No destination is live, so nothing in this catalog is being delivered.
          </Banner>
        )}

        <Card padding="0">
          <IndexTable
            condensed={smDown}
            resourceName={{ singular: 'event', plural: 'events' }}
            itemCount={rows.length}
            selectable={false}
            headings={[
              { title: 'Source event' },
              { title: 'Sent as' },
              { title: 'Path' },
              { title: 'Destinations' },
              { title: 'Status' },
            ]}
          >
            {rows.map((row, i) => (
              <IndexTable.Row id={`${row.path}-${row.shopifyName}`} key={`${row.path}-${row.shopifyName}`} position={i}>
                <IndexTable.Cell>
                  <Text as="span" variant="bodySm" tone="subdued" numeric={false}>
                    {row.shopifyName}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodyMd" fontWeight="medium">
                    {row.sentAs}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge>{row.path}</Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {row.destinations.length ? (
                    <InlineStack gap="100">
                      {row.destinations.map((d) => (
                        <Badge key={d}>{d}</Badge>
                      ))}
                    </InlineStack>
                  ) : (
                    <Text as="span" variant="bodySm" tone="subdued">
                      —
                    </Text>
                  )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {row.on ? <Badge tone="success">Sending</Badge> : <Badge>Off</Badge>}
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>

        <Box paddingBlockEnd="400">
          <Text as="p" variant="bodySm" tone="subdued">
            Web events come from the Shopify Web Pixel. Server events come from Shopify webhooks —
            they can&rsquo;t be blocked by the browser, so they&rsquo;re the authoritative
            conversion signal.
          </Text>
        </Box>
      </BlockStack>
    </Page>
  );
}
