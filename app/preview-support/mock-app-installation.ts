/**
 * Mock data for the standalone /preview/* routes.
 *
 * These routes render the real admin React components OUTSIDE the Shopify
 * embed (no `authenticate.admin`, no App Bridge, no Admin GraphQL). Each
 * preview route supplies a plain server `loader` returning the same shape the
 * real `clientLoader` would, drawing from the fixture below so every metafield
 * the components read is populated.
 *
 * Keys here MUST match the aliases in
 * app/common.client/queries/current-app-installation.ts — the components read
 * `currentAppInstallation.<alias>`, so a mismatched name silently reads as unset.
 *
 * Nothing here talks to Shopify — edit freely to preview different states
 * (e.g. flip the feature toggles, blank out the API key to see the empty-state
 * banners, set iris_enabled false to see the Off wiring on My Tracking).
 */

export const PREVIEW_SHOP = 'preview-shop.myshopify.com';

// Mirrors the `currentAppInstallation` returned by the real
// queryCurrentAppInstallation() GraphQL query, with every metafield the admin
// pages read present.
export const mockAppInstallation = {
  id: 'gid://shopify/AppInstallation/000000000',
  app: {
    id: 'gid://shopify/App/0',
    title: 'VizHog',
    handle: 'vizhog',
  },
  posthog_api_key: {
    key: 'posthog_api_key',
    value: 'phc_PREVIEW00000000000000000000000000000000',
    type: 'single_line_text_field',
  },
  posthog_api_host: {
    key: 'posthog_api_host',
    value: 'https://us.i.posthog.com',
    type: 'single_line_text_field',
  },
  data_collection_strategy: {
    key: 'data_collection_strategy',
    value: 'anonymized',
    type: 'single_line_text_field',
  },
  web_pixel_feature_toggle: {
    key: 'web_pixel_feature_toggle',
    value: 'true',
    jsonValue: true,
    type: 'boolean',
  },
  js_web_posthog_feature_toggle: {
    key: 'js_web_posthog_feature_toggle',
    value: 'true',
    jsonValue: true,
    type: 'boolean',
  },
  // Per-event settings. The real query aliases this `web_pixel_settings`.
  // A few events are on so the Events panels and the catalog aren't empty.
  web_pixel_settings: {
    key: 'web_pixel_events_settings',
    jsonValue: {
      page_viewed: true,
      product_viewed: true,
      product_added_to_cart: true,
      cart_viewed: true,
      checkout_started: true,
      checkout_completed: true,
    } as Record<string, unknown>,
    type: 'json',
  },
  js_web_posthog_config: {
    key: 'js_web_posthog_config',
    jsonValue: {} as Record<string, unknown>,
    type: 'json',
  },
  web_pixel_tracked_events: {
    key: 'tracked_events',
    jsonValue: [
      'page_viewed',
      'product_viewed',
      'product_added_to_cart',
      'cart_viewed',
      'checkout_started',
      'checkout_completed',
    ] as string[],
    type: 'json',
  },
  web_pixel_posthog_ecommerce_spec: {
    key: 'web_pixel_posthog_ecommerce_spec',
    jsonValue: true,
    type: 'boolean',
  },
  datalayer_enabled: {
    key: 'datalayer_enabled',
    jsonValue: true,
    type: 'boolean',
  },
  iris_api_key: {
    key: 'iris_api_key',
    value: 'pk_PREVIEW000000000000000000000000',
    type: 'single_line_text_field',
  },
  iris_api_host: {
    key: 'iris_api_host',
    value: 'https://mythic-analytics.gulp.workers.dev',
    type: 'single_line_text_field',
  },
  iris_enabled: {
    key: 'iris_enabled',
    value: 'true',
    jsonValue: true,
    type: 'boolean',
  },
  // Empty means "schema defaults" — the SDK Config form falls back to them.
  iris_js_config: {
    key: 'iris_js_config',
    jsonValue: {} as Record<string, unknown>,
    type: 'json',
  },
  iris_js_feature_toggle: {
    key: 'iris_js_feature_toggle',
    value: 'false',
    jsonValue: false,
    type: 'boolean',
  },
};
