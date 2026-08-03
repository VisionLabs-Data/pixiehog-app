import { Constant } from '../../../common/constant';
import { clientGraphQL } from '../client-graphql-client';

export const queryCurrentAppInstallation = async () => {
  const response = await clientGraphQL(
    `#graphql
      query currentAppInstallation(
        $namespace: String!
        $posthogApiKeyKey: String!
        $posthogApiHostKey: String!,
        $webPixelEventsSettingsKey: String!
        $webPixelFeatureToggle: String!
        $jsWebPosthogConfig: String!
        $jsWebPosthogFeatureToggle: String!
        $dataCollectionStrategyKey: String!
        $webPixelTrackedEvents: String!
        $webPixelPostHogEcommerceSpecKey: String!
        $dataLayerEnabledKey: String!
        $irisApiKeyKey: String!
        $irisApiHostKey: String!
        $irisEnabledKey: String!
        $irisEcommerceSpecKey: String!
        $irisJsConfigKey: String!
        $irisJsFeatureToggleKey: String!
      ) {
        currentAppInstallation {
          id
          
          app {
            id
            title
            handle
          }
          posthog_api_key: metafield(namespace: $namespace, key: $posthogApiKeyKey) {
            key
            value
            type
          }
          posthog_api_host: metafield(namespace: $namespace, key: $posthogApiHostKey) {
            key
            value
            type
          }
          data_collection_strategy: metafield(namespace: $namespace, key: $dataCollectionStrategyKey) {
            key
            value
            type
          }
          web_pixel_settings: metafield(namespace: $namespace, key: $webPixelEventsSettingsKey) {
            key
            jsonValue
            type
          }
          web_pixel_feature_toggle: metafield(namespace: $namespace, key: $webPixelFeatureToggle) {
            key
            jsonValue
            value
            type
          }
          web_pixel_posthog_ecommerce_spec: metafield(namespace: $namespace, key: $webPixelPostHogEcommerceSpecKey) {
            key
            jsonValue
            value
            type
          }
          web_pixel_tracked_events: metafield(namespace: $namespace, key: $webPixelTrackedEvents) {
            key
            jsonValue
            value
            type
          }
          js_web_posthog_config: metafield(namespace: $namespace, key: $jsWebPosthogConfig) {
            key
            jsonValue
            value
            type
          },
          js_web_posthog_feature_toggle: metafield(namespace: $namespace, key: $jsWebPosthogFeatureToggle) {
            key
            jsonValue
            value
            type
          },
          datalayer_enabled: metafield(namespace: $namespace, key: $dataLayerEnabledKey) {
            key
            jsonValue
            value
            type
          },
          iris_api_key: metafield(namespace: $namespace, key: $irisApiKeyKey) {
            key
            value
            type
          },
          iris_api_host: metafield(namespace: $namespace, key: $irisApiHostKey) {
            key
            value
            type
          },
          iris_enabled: metafield(namespace: $namespace, key: $irisEnabledKey) {
            key
            jsonValue
            value
            type
          },
          iris_ecommerce_spec: metafield(namespace: $namespace, key: $irisEcommerceSpecKey) {
            key
            jsonValue
            value
            type
          },
          iris_js_config: metafield(namespace: $namespace, key: $irisJsConfigKey) {
            key
            jsonValue
            value
            type
          },
          iris_js_feature_toggle: metafield(namespace: $namespace, key: $irisJsFeatureToggleKey) {
            key
            jsonValue
            value
            type
          },
        }
      }
    `,
    {
      variables: {
        namespace: Constant.METAFIELD_NAMESPACE,
        posthogApiKeyKey: Constant.METAFIELD_KEY_POSTHOG_API_KEY,
        posthogApiHostKey: Constant.METAFIELD_KEY_POSTHOG_API_HOST,
        webPixelEventsSettingsKey: Constant.METAFIELD_KEY_WEB_PIXEL_EVENTS_SETTINGS,
        webPixelFeatureToggle: Constant.METAFIELD_KEY_WEB_PIXEL_FEATURE_TOGGLE,
        jsWebPosthogConfig: Constant.METAFIELD_KEY_JS_WEB_POSTHOG_CONFIG,
        jsWebPosthogFeatureToggle: Constant.METAFIELD_KEY_JS_WEB_POSTHOG_FEATURE_TOGGLE,
        dataCollectionStrategyKey: Constant.METAFIELD_KEY_DATA_COLLECTION_STRATEGY,
        webPixelTrackedEvents: Constant.METAFIELD_KEY_WEB_PIXEL_TRACKED_EVENTS,
        webPixelPostHogEcommerceSpecKey: Constant.METAFIELD_KEY_POSTHOG_ECOMMERCE_SPEC,
        dataLayerEnabledKey: Constant.METAFIELD_KEY_DATALAYER_ENABLED,
        irisApiKeyKey: Constant.METAFIELD_KEY_IRIS_API_KEY,
        irisApiHostKey: Constant.METAFIELD_KEY_IRIS_API_HOST,
        irisEnabledKey: Constant.METAFIELD_KEY_IRIS_ENABLED,
        irisEcommerceSpecKey: Constant.METAFIELD_KEY_IRIS_ECOMMERCE_SPEC,
        irisJsConfigKey: Constant.METAFIELD_KEY_IRIS_JS_CONFIG,
        irisJsFeatureToggleKey: Constant.METAFIELD_KEY_IRIS_JS_FEATURE_TOGGLE,
      },
    }
  );

  return response.data;
};
