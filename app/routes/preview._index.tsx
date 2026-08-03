import { Link } from '@remix-run/react';

const PAGES = [
  { to: '/preview/tracking', label: 'My Tracking', desc: 'Shopify Web + Webhooks → PostHog + Iris wiring diagram' },
  { to: '/preview/custom-events', label: 'Custom Events', desc: 'Catalog of every event sent, and to which destination' },
  { to: '/preview/web-pixel', label: 'Source · Shopify Web', desc: 'Events captured, plus the settings shared by all destinations' },
  { to: '/preview/destinations/posthog', label: 'Destination · PostHog', desc: 'Credentials, event naming, client-side; consent is read-only' },
  { to: '/preview/destinations/iris', label: 'Destination · Iris', desc: 'As above, plus the generated JS SDK config form' },
  { to: '/preview/js-web', label: 'Destination · PostHog JS SDK', desc: 'Client-side posthog-js configuration' },
];

export default function PreviewIndex() {
  return (
    <div style={{ maxWidth: 640, margin: '48px auto', padding: '0 24px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Admin UI Preview</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Real admin components rendered with mock data, outside the Shopify embed.
        Edit fixtures in <code>app/preview-support/mock-app-installation.ts</code>.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {PAGES.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            style={{
              display: 'block',
              padding: 16,
              border: '1px solid #e4e4e7',
              borderRadius: 10,
              textDecoration: 'none',
              color: '#18181b',
            }}
          >
            <div style={{ fontWeight: 600 }}>{p.label}</div>
            <div style={{ color: '#71717a', fontSize: 14 }}>{p.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
