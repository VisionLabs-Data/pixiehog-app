/**
 * /preview — standalone (non-embedded) shell for previewing the admin UI.
 *
 * Deliberately does NOT call `authenticate.admin`, so it renders in a plain
 * browser without the Shopify embed. It provides:
 *   - Polaris's own AppProvider + styles
 *   - an inline stub for `window.shopify` / `window.ENV` so App Bridge reads
 *     (e.g. root.tsx's PosthogInit, post-submit toasts) don't throw
 *   - the grouped left sidebar
 *
 * The sidebar lives HERE and only here. In production the app is embedded in
 * Shopify admin, which renders the nav itself from `<NavMenu>` in app.tsx — a
 * second sidebar inside the iframe would sit next to Shopify's own. So this is
 * a preview affordance for seeing the full IA on one screen, not app chrome.
 *
 * Run with `npm run preview` (see README_PREVIEW.md for why it builds rather
 * than using the Vite dev server), then open http://localhost:3000/preview.
 */
import { Link, Outlet, useLocation } from '@remix-run/react';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import { PREVIEW_SHOP } from '../preview-support/mock-app-installation';

export const links = () => [{ rel: 'stylesheet', href: polarisStyles }];

// Runs during HTML parse (before React hydration), so App Bridge globals the
// real components reach for are defined before any effect fires.
const STUB_SCRIPT = `
window.ENV = window.ENV || {};
window.ENV.APP_POSTHOG_JS_WEB_THEME_APP_UUID = window.ENV.APP_POSTHOG_JS_WEB_THEME_APP_UUID || 'preview-app-embed-uuid';
window.shopify = window.shopify || {
  config: { shop: '${PREVIEW_SHOP}', apiKey: 'preview' },
  toast: { show: function () {} },
};
`;

interface NavItem {
  to: string;
  label: string;
}

// Mirrors the production IA: sources own what's shared, destinations own what's
// theirs. Both destinations carry their own JS SDK config as a step in their
// rail, so neither needs a top-level entry for it.
const NAV: { group: string | null; items: NavItem[] }[] = [
  {
    group: null,
    items: [
      { to: '/preview/tracking', label: 'My Tracking' },
      { to: '/preview/custom-events', label: 'Custom Events' },
    ],
  },
  {
    group: 'Sources',
    items: [{ to: '/preview/web-pixel', label: 'Shopify Web' }],
  },
  {
    group: 'Destinations',
    items: [
      { to: '/preview/destinations/posthog', label: 'PostHog' },
      { to: '/preview/destinations/iris', label: 'Iris' },
    ],
  },
];

const SIDEBAR_WIDTH = 260;

export default function PreviewLayout() {
  const location = useLocation();

  return (
    <AppProvider i18n={enTranslations}>
      <script dangerouslySetInnerHTML={{ __html: STUB_SCRIPT }} />
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'stretch' }}>
        <nav
          style={{
            width: SIDEBAR_WIDTH,
            flex: `0 0 ${SIDEBAR_WIDTH}px`,
            borderRight: '1px solid #e3e3e3',
            background: '#fff',
            padding: '16px 12px',
            position: 'sticky',
            top: 0,
            alignSelf: 'flex-start',
            height: '100vh',
            overflowY: 'auto',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 14,
          }}
        >
          <Link
            to="/preview"
            style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '4px 10px 16px' }}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>VizHog</div>
            <div style={{ color: '#8a8a8a', fontSize: 12 }}>preview · not embedded</div>
          </Link>

          {NAV.map((section) => (
            <div key={section.group ?? 'main'} style={{ marginBottom: 18 }}>
              {section.group && (
                <div
                  style={{
                    color: '#8a8a8a',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    padding: '0 10px 6px',
                  }}
                >
                  {section.group}
                </div>
              )}
              {section.items.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '7px 10px',
                      marginBottom: 2,
                      borderRadius: 8,
                      textDecoration: 'none',
                      color: active ? '#303030' : '#4a4a4a',
                      background: active ? '#f1f1f1' : 'transparent',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <main style={{ flex: 1, minWidth: 0, background: '#f1f1f1' }}>
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}
