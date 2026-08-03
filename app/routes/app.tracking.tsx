/**
 * My Tracking — the sources → destinations graph for this shop.
 *
 * Read-only overview. Every card links to the page that owns its settings; the
 * status on each card is derived from the app-installation metafields via
 * app/tracking-config.ts, so this page can't drift from reality.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { ClientLoaderFunctionArgs } from '@remix-run/react';
import { Link as RemixLink, useLoaderData } from '@remix-run/react';
import {
  ActionList,
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Popover,
  Text,
  Tooltip,
} from '@shopify/polaris';
import { LightbulbIcon, PlusCircleIcon } from '@shopify/polaris-icons';
import { queryCurrentAppInstallation as clientQueryCurrentAppInstallation } from '../common.client/queries/current-app-installation';
import { appEmbedStatus as clientAppEmbedStatus } from '../common.client/procedures/app-embed-status';
import { Constant } from '../../common/constant';
import LoadingSpinner from '../../common/components/LoadingSpinner';
import { irisSvg, posthogSvg, shopifySvg, webhookSvg } from '../brand-icons';
import type { DestinationView, SourceView, TrackingInstallation } from '../tracking-config';
import { deriveDestinations, deriveSources, maskKey } from '../tracking-config';
import styles from '../styles/tracking.module.css';

export const clientLoader = async ({ request }: ClientLoaderFunctionArgs) => {
  const response = await clientQueryCurrentAppInstallation();
  // One theme extension, two blocks — same UUID, told apart by handle.
  const [jsWebEmbedActive, irisEmbedActive] = await Promise.all([
    clientAppEmbedStatus(
      window.ENV.APP_POSTHOG_JS_WEB_THEME_APP_UUID,
      Constant.APP_POSTHOG_JS_WEB_THEME_APP_HANDLE,
    ),
    clientAppEmbedStatus(
      window.ENV.APP_POSTHOG_JS_WEB_THEME_APP_UUID,
      Constant.APP_IRIS_JS_THEME_APP_HANDLE,
    ),
  ]);
  return {
    install: response.currentAppInstallation as TrackingInstallation,
    jsWebEmbedActive: Boolean(jsWebEmbedActive),
    irisEmbedActive: Boolean(irisEmbedActive),
  };
};

export function HydrateFallback() {
  return <LoadingSpinner />;
}

/* ── Wiring ──────────────────────────────────────────────────────────────── */

interface Geometry {
  width: number;
  height: number;
  sources: number[];
  dests: { y: number; live: boolean }[];
}

/**
 * Draws the orthogonal wires between the two columns.
 *
 * Positions come from measuring the real card elements (tagged `data-wire`), so
 * the lines land on card centres at any width and after any reflow — a
 * ResizeObserver re-measures instead of trusting a one-shot read. The SVG is
 * sized in raw pixels with no viewBox, so nothing is ever scaled or skewed.
 */
function Wiring() {
  const wireRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);

  useLayoutEffect(() => {
    const wire = wireRef.current;
    if (!wire) return;
    // The row that holds both columns. Deliberately NOT a ref passed down from
    // the parent: React attaches a parent's DOM ref only AFTER its children's
    // layout effects have run, so such a ref reads null on mount.
    const row = wire.parentElement;
    if (!row) return;

    const measure = () => {
      const box = wire.getBoundingClientRect();
      // Stacked layout hides the column entirely — nothing to draw.
      if (box.width === 0 || box.height === 0) {
        setGeo(null);
        return;
      }
      const centre = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 - box.top;
      };
      setGeo({
        width: box.width,
        height: box.height,
        sources: Array.from(row.querySelectorAll('[data-wire="source"]')).map(centre),
        dests: Array.from(row.querySelectorAll('[data-wire="dest"]')).map((el) => ({
          y: centre(el),
          live: el.getAttribute('data-live') === 'true',
        })),
      });
    };

    measure();
    // Observe regardless of that first measurement: on mount the row can still
    // be collapsed, and the observer is what recovers once it lays out. The SVG
    // is absolutely positioned, so re-rendering can't feed back into size.
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    ro.observe(wire);
    return () => ro.disconnect();
  }, []);

  const nodes = geo ? [...geo.sources, ...geo.dests.map((d) => d.y)] : [];
  const hubY = nodes.length ? nodes.reduce((a, b) => a + b, 0) / nodes.length : 0;
  const hubX = geo ? geo.width / 2 : 0;
  const mergeX = geo ? geo.width * 0.28 : 0;
  const branchX = geo ? geo.width * 0.72 : 0;
  const HUB_R = 22;

  return (
    <div ref={wireRef} className={styles.wire}>
      {geo && (
        <>
          <svg
            className={styles.wireSvg}
            width={geo.width}
            height={geo.height}
            aria-hidden="true"
            focusable="false"
          >
            {/* Sources → merge spine → hub. Both sources always feed both
                destinations, so these are unconditionally live. */}
            {geo.sources.map((y, i) => (
              <path
                key={`s${i}`}
                d={`M 0 ${y} H ${mergeX} V ${hubY} H ${hubX - HUB_R}`}
                fill="none"
                stroke="var(--wire-live)"
                strokeWidth="2"
              />
            ))}
            {/* Hub → branch spine → each destination. */}
            {geo.dests.map((d, i) => (
              <path
                key={`d${i}`}
                d={`M ${hubX + HUB_R} ${hubY} H ${branchX} V ${d.y} H ${geo.width}`}
                fill="none"
                stroke={d.live ? 'var(--wire-live)' : 'var(--wire-off)'}
                strokeWidth="2"
                strokeDasharray={d.live ? undefined : '4 4'}
              />
            ))}
          </svg>
          <div className={styles.hub} style={{ left: hubX, top: hubY }}>
            VH
          </div>
        </>
      )}
    </div>
  );
}

/* ── Cards ───────────────────────────────────────────────────────────────── */

const SOURCE_MARK: Record<SourceView['id'], () => JSX.Element> = {
  'shopify-web': shopifySvg,
  'shopify-webhooks': webhookSvg,
};

function SourceCard({ source }: { source: SourceView }) {
  const Mark = SOURCE_MARK[source.id];
  const inner = (
    <Card>
      <InlineStack gap="300" blockAlign="center" wrap={false}>
        <Box width="24px">
          <Mark />
        </Box>
        <Box minWidth="0">
          <BlockStack gap="050">
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              {source.name}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued" breakWord>
              {source.detail}
            </Text>
          </BlockStack>
        </Box>
        <Box width="100%">
          <InlineStack align="end">
            <Badge tone={source.badge.tone}>{source.badge.label}</Badge>
          </InlineStack>
        </Box>
      </InlineStack>
    </Card>
  );

  return (
    <div className={styles.node} data-wire="source">
      {source.href ? (
        <RemixLink to={source.href} style={{ textDecoration: 'none', color: 'inherit' }}>
          {inner}
        </RemixLink>
      ) : (
        inner
      )}
    </div>
  );
}

const DEST_MARK: Record<DestinationView['id'], () => JSX.Element> = {
  posthog: posthogSvg,
  iris: irisSvg,
};

function DestinationCard({ dest }: { dest: DestinationView }) {
  const Mark = DEST_MARK[dest.id];

  return (
    <div className={styles.node} data-wire="dest" data-live={String(dest.live)}>
      <RemixLink
        to={`/app/destinations/${dest.id}`}
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <InlineStack gap="300" blockAlign="center" wrap={false}>
                <Box width="24px">
                  <Mark />
                </Box>
                <Text as="h3" variant="headingSm">
                  {dest.name}
                </Text>
              </InlineStack>
              {dest.live ? (
                <Badge tone="success">Live</Badge>
              ) : dest.blockedReason ? (
                <Tooltip content={dest.blockedReason}>
                  <Badge tone={dest.configured ? undefined : 'attention'}>
                    {dest.configured ? 'Off' : 'Not set up'}
                  </Badge>
                </Tooltip>
              ) : (
                <Badge>Off</Badge>
              )}
            </InlineStack>

            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <Box minWidth="0">
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued" breakWord>
                    {dest.idLabel}: {maskKey(dest.idValue)}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued" breakWord>
                    {dest.host}
                  </Text>
                </BlockStack>
              </Box>
              <Text as="p" variant="bodySm" tone="subdued">
                {dest.paths.length ? dest.paths.join(' • ') : 'No active path'}
              </Text>
            </InlineStack>

            {!dest.configured && (
              <InlineStack>
                <Button variant="primary" size="slim">
                  Set up now
                </Button>
              </InlineStack>
            )}
          </BlockStack>
        </Card>
      </RemixLink>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function TrackingOverview() {
  const { install, jsWebEmbedActive, irisEmbedActive } = useLoaderData<typeof clientLoader>();
  const [addOpen, setAddOpen] = useState(false);

  const sources = deriveSources(install, jsWebEmbedActive, irisEmbedActive);
  const destinations = deriveDestinations(install);
  const liveCount = destinations.filter((d) => d.live).length;
  const unconfigured = destinations.filter((d) => !d.configured);

  return (
    <Page
      title="My Tracking"
      subtitle={`${liveCount} of ${destinations.length} destinations live`}
      secondaryActions={[
        { content: 'Custom Events', icon: LightbulbIcon, url: '/app/custom-events' },
      ]}
      primaryAction={
        <Popover
          active={addOpen}
          onClose={() => setAddOpen(false)}
          activator={
            <Button
              variant="primary"
              icon={PlusCircleIcon}
              disclosure
              onClick={() => setAddOpen((o) => !o)}
            >
              Add destination
            </Button>
          }
        >
          {unconfigured.length ? (
            <ActionList
              actionRole="menuitem"
              items={unconfigured.map((d) => ({
                content: d.name,
                helpText: d.blockedReason ?? undefined,
                url: `/app/destinations/${d.id}`,
              }))}
            />
          ) : (
            <Box padding="400" maxWidth="260px">
              <Text as="p" variant="bodySm" tone="subdued">
                PostHog and Iris are both set up. They&rsquo;re the destinations VizHog supports
                today.
              </Text>
            </Box>
          )}
        </Popover>
      }
    >
      <div className={styles.body}>
        <div className={styles.column}>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm" tone="subdued">
              SOURCES
            </Text>
            {sources.map((s) => (
              <SourceCard key={s.id} source={s} />
            ))}
          </BlockStack>
        </div>

        <Wiring />

        <div className={styles.column}>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm" tone="subdued">
              DESTINATIONS
            </Text>
            {destinations.map((d) => (
              <DestinationCard key={d.id} dest={d} />
            ))}
          </BlockStack>
        </div>
      </div>
    </Page>
  );
}
