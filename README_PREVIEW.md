# Admin UI Preview (no Shopify embed)

Preview the embedded admin pages in a plain browser — no Shopify store, OAuth,
App Bridge, or tunnel required.

## Run

```bash
npm run preview
```

Then open **http://localhost:3000/preview**.

Pages:

| URL                              | Real route previewed                               |
| -------------------------------- | -------------------------------------------------- |
| `/preview/overview`              | `app/routes/app._index.tsx`                        |
| `/preview/tracking`              | `app/routes/app.tracking.tsx`                      |
| `/preview/custom-events`         | `app/routes/app.custom-events.tsx`                 |
| `/preview/destinations/posthog`  | `app/routes/app.destinations.$destination.tsx`     |
| `/preview/destinations/iris`     | same route, `?step=` picks the panel               |
| `/preview/web-pixel`             | `app/routes/app.web-pixel-settings/route.tsx`      |
| `/preview/js-web`                | `app/routes/app.js-web-posthog-settings/route.tsx` |
| `/preview/real-time-activity`    | `app/routes/app.real-time-activity.tsx`            |
| `/preview/channel-accuracy`      | `app/routes/app.channel-accuracy.tsx`              |
| `/preview/attribution-feed`      | `app/routes/app.attribution-feed.tsx`              |
| `/preview/event-builder`         | `app/routes/app.event-builder.tsx`                 |
| `/preview/pre-built-tags`        | `app/routes/app.pre-built-tags.tsx`                |

The grouped left sidebar exists **only** in the preview shell. In production the
app is embedded in Shopify admin, which draws the nav itself from `<NavMenu>` in
`app/routes/app.tsx` — rendering our own sidebar inside the iframe would put it
next to Shopify's. The sidebar here is for seeing the whole IA on one screen.

To preview an unconfigured destination (dashed wiring, "Not set up" badge, the
Add-destination popover), blank `iris_api_key` and set `iris_enabled` to
`'false'` in the fixture, then rebuild.

## How it works

The real admin pages live under `app.tsx`, whose loader calls
`authenticate.admin(request)` and boots App Bridge — both require the Shopify
embed. The `/preview/*` routes sit **outside** that boundary:

- `app/routes/preview.tsx` — non-authenticated layout. Provides Polaris'
  `AppProvider` + styles and stubs `window.shopify` / `window.ENV` so App Bridge
  reads (toasts, root PostHog init) don't throw.
- `app/routes/preview.*.tsx` — each supplies a plain `loader` returning the same
  shape the real `clientLoader` would, sourced from
  `app/preview-support/mock-app-installation.ts`. It renders the **real**
  component (client-only — see below); only the data source differs.

Edit `app/preview-support/mock-app-installation.ts` to preview different states
(flip feature toggles, blank the API key to see empty-state banners, etc.).

## Why `npm run preview` builds instead of using the dev server

`remix vite:dev` cannot boot this app: `virtual:remix/server-build` eagerly
evaluates every route module, and `app.web-pixel-settings/keyoverrides.tsx`
builds Polaris JSX at module scope, which trips a React `jsx-dev-runtime` SSR
interop bug in the Vite dev transformer (`__vite_ssr_import_0__.jsxDEV is not a
function`) — bringing down `/`, `/auth/login`, everything. The production build
(Rollup) compiles that file correctly, so `preview` does `vite:build` +
`remix-serve`. Rebuilds are ~2s. The preview components are imported client-only
(`app/preview-support/client-only-route.tsx`) so a future dev-server fix would
work without changes here.
