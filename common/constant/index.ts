export class Constant {
  static readonly METAFIELD_NAMESPACE = "pxhog";
  static readonly METAFIELD_KEY_POSTHOG_API_KEY = "posthog_api_key";
  static readonly METAFIELD_KEY_POSTHOG_API_HOST = "posthog_api_host"
  static readonly METAFIELD_KEY_WEB_PIXEL_FEATURE_TOGGLE = "web_pixel_feature_toggle";
  static readonly METAFIELD_KEY_WEB_PIXEL_EVENTS_SETTINGS = "web_pixel_events_settings";
  static readonly METAFIELD_KEY_JS_WEB_POSTHOG_FEATURE_TOGGLE = "js_web_posthog_feature_toggle";
  static readonly METAFIELD_KEY_JS_WEB_POSTHOG_CONFIG = "js_web_posthog_config";
  static readonly APP_POSTHOG_JS_WEB_THEME_APP_HANDLE = "posthog_js_web";
  static readonly METAFIELD_KEY_DATA_COLLECTION_STRATEGY = "data_collection_strategy"
  static readonly METAFIELD_KEY_WEB_PIXEL_TRACKED_EVENTS = "tracked_events"
  static readonly METAFIELD_KEY_POSTHOG_ECOMMERCE_SPEC = 'web_pixel_posthog_ecommerce_spec'
  static readonly METAFIELD_KEY_DATALAYER_ENABLED = 'datalayer_enabled'
  static readonly METAFIELD_KEY_IRIS_API_KEY = 'iris_api_key'
  static readonly METAFIELD_KEY_IRIS_API_HOST = 'iris_api_host'
  static readonly METAFIELD_KEY_IRIS_ENABLED = 'iris_enabled'
  /** Iris's own event-naming flag. Unset means "inherit posthog_ecommerce_spec". */
  static readonly METAFIELD_KEY_IRIS_ECOMMERCE_SPEC = 'iris_ecommerce_spec'
  static readonly IRIS_DEFAULT_API_HOST = 'https://mythic-analytics.gulp.workers.dev'
  /** Iris JS SDK config (see common/dto/iris-js-settings.dto.ts). */
  static readonly METAFIELD_KEY_IRIS_JS_CONFIG = 'iris_js_config'
  /** Whether the Iris JS SDK loads on the storefront at all. */
  static readonly METAFIELD_KEY_IRIS_JS_FEATURE_TOGGLE = 'iris_js_feature_toggle'
  /** Documented ingest host for the JS SDK. BOTH this and IRIS_DEFAULT_API_HOST
   *  above are valid Iris endpoints (confirmed 2026-08-03) — the worker host is
   *  what shops are provisioned with today, this is the documented default the
   *  SDK loader self-detects. Not a discrepancy; don't "reconcile" them. */
  static readonly IRIS_SDK_DEFAULT_API_HOST = 'https://api.adberserk.com'
  static readonly IRIS_SDK_LOADER_URL = 'https://api.adberserk.com/cdn/m.js'
  /** Theme app embed block that loads the Iris SDK (extensions/iris-js). */
  static readonly APP_IRIS_JS_THEME_APP_HANDLE = 'iris_js_web'
  static readonly SHOPIFY_API_VERSION = '2024-10'
}
