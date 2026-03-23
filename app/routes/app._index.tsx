import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SelectOption } from '@shopify/polaris';
import type { ClientActionFunctionArgs, ClientLoaderFunctionArgs} from '@remix-run/react';
import { useFetcher, useLoaderData, Link as RemixLink } from '@remix-run/react';
import { Constant } from '../../common/constant/index';
import { metafieldsSet as clientMetafieldsSet } from '../common.client/mutations/metafields-set';
import { metafieldsDelete as clientMetafieldsDelete } from '../common.client/mutations/metafields-delete';
import type { PosthogApiKey } from '../../common/dto/posthog-api-key.dto';
import { PosthogApiKeySchema, posthogApiKeyPrimitive } from '../../common/dto/posthog-api-key.dto';
import { WebPixelFeatureToggleSchema } from '../../common/dto/web-pixel-feature-toggle.dto';
import type { WebPixelFeatureToggle } from '../../common/dto/web-pixel-feature-toggle.dto';
import type { JsWebPosthogFeatureToggle } from '../../common/dto/js-web-feature-toggle.dto';
import { JsWebPosthogFeatureToggleSchema } from '../../common/dto/js-web-feature-toggle.dto';
import { recalculateWebPixel as clientRecalculateWebPixel } from '../common.client/procedures/recalculate-web-pixel';
import type { WebPixelEventsSettings } from 'common/dto/web-pixel-events-settings.dto';
import type { WebPixelSettingChoice } from './app.web-pixel-settings/interface/setting-row.interface';
import { defaultWebPixelSettings } from './app.web-pixel-settings/default-web-pixel-settings';
import type { PosthogApiHost} from 'common/dto/posthog-api-host.dto';
import { PosthogApiHostSchema, posthogApiHostPrimitive } from 'common/dto/posthog-api-host.dto';
import { urlWithShopParam } from '../../common/utils';
import type { DataCollectionStrategy} from 'common/dto/data-collection-stratergy';
import { DataCollectionStrategySchema} from 'common/dto/data-collection-stratergy';
import { queryCurrentAppInstallation as clientQueryCurrentAppInstallation } from '../common.client/queries/current-app-installation';
import { appEmbedStatus as clientAppEmbedStatus  } from '../common.client/procedures/app-embed-status';
import LoadingSpinner from '../../common/components/LoadingSpinner';
import styles from '../styles/account-setup.module.css';

type StrictOptions = Extract<SelectOption, {label: string}>

const apiHostOptions: StrictOptions[] = [
  { label: 'Select API Host', value: '', disabled: true},
  { label: "Posthog US Cloud", value:"https://us.i.posthog.com"},
  { label: "Posthog EU Cloud", value:"https://eu.i.posthog.com"},
  { label: "Reverse Proxy", value:"custom"},
]


export const clientLoader = async ({
  request,
}: ClientLoaderFunctionArgs) => {
  const response = await clientQueryCurrentAppInstallation();
  const currentPosthogJsWebAppEmbedStatus = await clientAppEmbedStatus(window.ENV.APP_POSTHOG_JS_WEB_THEME_APP_UUID)
  const payload = {
    currentAppInstallation: response.currentAppInstallation,
    js_web_posthog_app_embed_status: currentPosthogJsWebAppEmbedStatus,
    js_web_posthog_app_embed_uuid: window.ENV.APP_POSTHOG_JS_WEB_THEME_APP_UUID,
    shop: shopify.config.shop,
    js_web_posthog_app_embed_handle: Constant.APP_POSTHOG_JS_WEB_THEME_APP_HANDLE,
  }

  return payload;
};


export const clientAction = async ({
  request,
  params,
}: ClientActionFunctionArgs) => {

  const payload = await request.json()
  const response = await clientQueryCurrentAppInstallation();
  const appId = response.currentAppInstallation.id;
  const dtoResultPosthogApiKey = PosthogApiKeySchema.safeParse({ posthog_api_key: payload.posthog_api_key } as PosthogApiKey);
  if (!dtoResultPosthogApiKey.success) {
    const message = dtoResultPosthogApiKey.error.flatten().fieldErrors.posthog_api_key?.join(' - ');
    return { ok: false, message: message };
  }
  const dtoResultPosthogApiHost = PosthogApiHostSchema.safeParse({posthog_api_host: payload.posthog_api_host} as PosthogApiHost)
  if(!dtoResultPosthogApiHost.success) {
    const message = dtoResultPosthogApiHost.error.flatten().fieldErrors.posthog_api_host?.join(' - ');
    return { ok: false, message: message };
  }

  const dtoResultDataCollectionStrategy = DataCollectionStrategySchema.safeParse({data_collection_strategy: payload.data_collection_strategy} as DataCollectionStrategy)
  if(!dtoResultDataCollectionStrategy.success) {
    const message = dtoResultDataCollectionStrategy.error.flatten().fieldErrors.data_collection_strategy?.join(' - ');
    return { ok: false, message: message };
  }

  const dtoResultWebPixelFeatureToggle = WebPixelFeatureToggleSchema.safeParse({ web_pixel_feature_toggle: payload.web_pixel_feature_toggle } as WebPixelFeatureToggle);
  if (!dtoResultWebPixelFeatureToggle.success) {
    const message = dtoResultWebPixelFeatureToggle.error.flatten().fieldErrors.web_pixel_feature_toggle?.join(' - ');
    return { ok: false, message: message };
  }

  const dtoResultJsWebPosthogFeatureToggle = JsWebPosthogFeatureToggleSchema.safeParse({ js_web_posthog_feature_toggle: payload.js_web_posthog_feature_toggle } as JsWebPosthogFeatureToggle);
  if (!dtoResultJsWebPosthogFeatureToggle.success) {
    const message = dtoResultJsWebPosthogFeatureToggle.error.flatten().fieldErrors.js_web_posthog_feature_toggle?.join(' - ');
    return { ok: false, message: message };
  }
  const metafieldsSetData = [
    {
      key: Constant.METAFIELD_KEY_JS_WEB_POSTHOG_FEATURE_TOGGLE,
      namespace: Constant.METAFIELD_NAMESPACE,
      ownerId: response.currentAppInstallation.id,
      type: 'boolean',
      value: dtoResultJsWebPosthogFeatureToggle.data.js_web_posthog_feature_toggle.toString(),
    },
    {
      key: Constant.METAFIELD_KEY_WEB_PIXEL_FEATURE_TOGGLE,
      namespace: Constant.METAFIELD_NAMESPACE,
      ownerId: response.currentAppInstallation.id,
      type: 'boolean',
      value: dtoResultWebPixelFeatureToggle.data.web_pixel_feature_toggle.toString(),
    },
    {
      key: Constant.METAFIELD_KEY_DATA_COLLECTION_STRATEGY,
      namespace: Constant.METAFIELD_NAMESPACE,
      ownerId: appId,
      type: 'single_line_text_field',
      value: dtoResultDataCollectionStrategy.data.data_collection_strategy.toString(),
    }
  ]

  // posthog api key
  if (dtoResultPosthogApiKey.data.posthog_api_key == '') {
    await clientMetafieldsDelete([
      {
        key: Constant.METAFIELD_KEY_POSTHOG_API_KEY,
        namespace: Constant.METAFIELD_NAMESPACE,
        ownerId: appId,
      },
    ]);
  } else {
    metafieldsSetData.push({
      key: Constant.METAFIELD_KEY_POSTHOG_API_KEY,
      namespace: Constant.METAFIELD_NAMESPACE,
      ownerId: appId,
      type: 'single_line_text_field',
      value: dtoResultPosthogApiKey.data.posthog_api_key,
    })
  }

  // posthog api host
  if (dtoResultPosthogApiHost.data.posthog_api_host == '') {
    await clientMetafieldsDelete([
      {
        key: Constant.METAFIELD_KEY_POSTHOG_API_HOST,
        namespace: Constant.METAFIELD_NAMESPACE,
        ownerId: appId,
      },
    ]);
  }else{
    metafieldsSetData.push({
      key: Constant.METAFIELD_KEY_POSTHOG_API_HOST,
      namespace: Constant.METAFIELD_NAMESPACE,
      ownerId: appId,
      type: 'single_line_text_field',
      value: dtoResultPosthogApiHost.data.posthog_api_host?.toString(),
    })
  }
  await clientMetafieldsSet(metafieldsSetData);


  const responseRecalculate = await clientRecalculateWebPixel();
  const message = (() => {
    if (responseRecalculate?.status == 'error') {
      return responseRecalculate.message;
    }
    if (!responseRecalculate?.status) {
      return 'saved successfully.';
    }
    return `saved & web pixel ${responseRecalculate.status}.`;
  })();
  return { ok: true, message: message }
};

export function HydrateFallback() {
  return <LoadingSpinner />
}

/* ── Inline SVG Icons ── */

function ExternalLinkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ZapIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function CodeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function SettingsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function AlertTriangleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function LightbulbIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

/* ── Status Badge Component ── */

interface StatusBadgeProps {
  featureEnabled: boolean;
  dirty: boolean;
  hasActionRequired: boolean;
}

function StatusBadge({ featureEnabled, dirty, hasActionRequired }: StatusBadgeProps) {
  if (!featureEnabled) {
    return (
      <span className={`${styles.badge} ${styles.badgeDisconnected}`}>
        <span className={`${styles.badgeDot} ${styles.badgeDotGray}`} />
        Disconnected
      </span>
    );
  }
  if (hasActionRequired) {
    return (
      <span className={`${styles.badge} ${styles.badgeWarning}`}>
        <span className={`${styles.badgeDot} ${styles.badgeDotYellow}`} />
        Action required
      </span>
    );
  }
  return (
    <span className={`${styles.badge} ${styles.badgeConnected}`}>
      <span className={`${styles.badgeDot} ${styles.badgeDotGreen}`} />
      {dirty ? 'Unsaved' : 'Connected'}
    </span>
  );
}

/* ── Status Card Component ── */

interface StatusCardProps {
  title: string;
  icon: React.ReactNode;
  featureEnabled: boolean;
  dirty: boolean;
  hasActionRequired: boolean;
  requirements?: { trigger: boolean; message: React.ReactNode }[];
  configureUrl: string;
  configureLabel: string;
  onToggle: () => void;
}

function StatusCard({
  title,
  icon,
  featureEnabled,
  dirty,
  hasActionRequired,
  requirements,
  configureUrl,
  configureLabel,
  onToggle,
}: StatusCardProps) {
  const activeRequirements = requirements?.filter(r => r.trigger) ?? [];

  return (
    <div className={styles.statusCard}>
      <div className={styles.statusCardHeader}>
        <div className={styles.statusCardLeft}>
          <div className={`${styles.statusIcon} ${featureEnabled && !hasActionRequired ? styles.statusIconGreen : styles.statusIconGray}`}>
            {icon}
          </div>
          <p className={styles.statusCardTitle}>{title}</p>
        </div>
        <StatusBadge featureEnabled={featureEnabled} dirty={dirty} hasActionRequired={hasActionRequired} />
      </div>

      {featureEnabled && activeRequirements.length > 0 && (
        <div className={styles.requirementsBanner}>
          <strong>Requirements:</strong>
          <ul className={styles.requirementsList}>
            {activeRequirements.map((req, i) => (
              <li key={i}>{req.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.statusCardActions}>
        <RemixLink to={configureUrl} className={styles.configureLink}>
          <SettingsIcon />
          {configureLabel}
        </RemixLink>
        <button className={styles.turnOffBtn} onClick={onToggle}>
          {featureEnabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>
    </div>
  );
}

/* ── Main Page Component ── */

export default function Index() {
  const {
    currentAppInstallation,
    js_web_posthog_app_embed_status: jsWebPosthogAppEmbedStatus,
    js_web_posthog_app_embed_uuid: jsWebPosthogAppEmbedUuid,
    js_web_posthog_app_embed_handle: jsWebPosthogAppEmbedHandle,
    shop,
  } = useLoaderData<typeof clientLoader>();

  const fetcher = useFetcher();
  const PosthogApiKeyInitialState = currentAppInstallation.posthog_api_key?.value || '';
  const [PostHogApiKey, setPostHogApiKey] = useState(PosthogApiKeyInitialState);
  const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setPostHogApiKey(e.target.value), []);

  const PosthogApiHostInitialState = currentAppInstallation.posthog_api_host?.value || '';
  const isPosthogApiHostInitialStateCustom = PosthogApiHostInitialState == '' ? false : !apiHostOptions.some((option) => option.value == PosthogApiHostInitialState)
  const [posthogApiHost, setPosthogApiHost] = useState(isPosthogApiHostInitialStateCustom ? 'custom' : PosthogApiHostInitialState == '' ? '' : PosthogApiHostInitialState);
  const [posthogApiKeyError, setPosthogApiKeyError] = useState<string>('');
  const [posthogApiHostError, setPosthogApiHostError] = useState<string>('');
  const [posthogCustomApiHostError, setCustomPosthogApiHostError] = useState<string>('');
  // api host
  const handlePosthogApiHostChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setPosthogApiHostError('')
      setPosthogApiHost(e.target.value)
    },
    [],
  );
  const [posthogApiHostCustom, setPosthogApiHostCustom] = useState(isPosthogApiHostInitialStateCustom ? PosthogApiHostInitialState : '' );
  const handlePosthogApiHostCustomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomPosthogApiHostError('')
      setPosthogApiHostCustom(e.target.value)
    },
    [],
  );

  //data collection strategy
  type ValueOf<T> = T[keyof T];
  const DataCollectionStrategyInitialState: ValueOf<DataCollectionStrategy> = currentAppInstallation.data_collection_strategy?.value as ValueOf<DataCollectionStrategy> || 'anonymized';
  const [dataCollectionStrategy, setDataCollectionStrategy] = useState(DataCollectionStrategyInitialState);
  const handleDataCollectionStrategyChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => setDataCollectionStrategy(e.target.value as ValueOf<DataCollectionStrategy>),
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

    if (data.ok) {
      window.shopify.toast.show(data.message, {
        isError: false,
        duration: 2000,
      });
      return;
    }
    window.shopify.toast.show(data.message, {
      isError: true,
      duration: 2000,
    });
  }, [fetcher.data]);


  // web pixels

  const webPixelSettingsMetafieldValue = currentAppInstallation?.web_pixel_settings?.jsonValue as
  | undefined
  | null
  | WebPixelEventsSettings;

  const webPixelSettingsInitialState = defaultWebPixelSettings.map<WebPixelSettingChoice>((entry) => {
    if(webPixelSettingsMetafieldValue?.[entry.key]){
      return {
        ...entry,
        value: webPixelSettingsMetafieldValue?.[entry.key] === true,
      } as WebPixelSettingChoice
    }
    return entry
  });
  const webPixelFeatureToggleInitialState = currentAppInstallation.web_pixel_feature_toggle?.jsonValue == true
  const [webPixelFeatureEnabled, setWebPixelFeatureEnabled] = useState(
    webPixelFeatureToggleInitialState
  );
  const handleWebPixelFeatureEnabledToggle = useCallback(() => setWebPixelFeatureEnabled((value) => !value), []);
  const allEventsDisabled = webPixelSettingsInitialState.every((entry) => !entry.value)

  // JS web events

  const jsWebPosthogFeatureEnabledInitialState = currentAppInstallation.js_web_posthog_feature_toggle?.jsonValue == true
  const [jsWebPosthogFeatureEnabled, setjsWebPosthogFeatureEnabled] = useState(
    jsWebPosthogFeatureEnabledInitialState
  );
  const handleJsWebPosthogFeatureEnabledToggle = useCallback(() => setjsWebPosthogFeatureEnabled((value) => !value), []);


  const dirty = useMemo(() => {
    if (PosthogApiKeyInitialState != PostHogApiKey) {
      return true;
    }
    if (jsWebPosthogFeatureEnabledInitialState != jsWebPosthogFeatureEnabled) {
      return true
    }
    if (webPixelFeatureToggleInitialState != webPixelFeatureEnabled) {
      return true
    }
    if (DataCollectionStrategyInitialState != dataCollectionStrategy) {
      return true
    }
    if (posthogApiHost == "custom" && PosthogApiHostInitialState != posthogApiHostCustom) {
      return true
    }
    if (posthogApiHost != "custom" && PosthogApiHostInitialState != posthogApiHost) {
      return true
    }
    return false
  }, [
    PosthogApiKeyInitialState,
    PostHogApiKey,
    jsWebPosthogFeatureEnabledInitialState,
    jsWebPosthogFeatureEnabled,
    webPixelFeatureToggleInitialState,
    webPixelFeatureEnabled,
    DataCollectionStrategyInitialState,
    dataCollectionStrategy,
    posthogApiHost,
    PosthogApiHostInitialState,
    posthogApiHostCustom
  ])


  const submitSettings = () => {
    let errors: string[] = [];

    const parsedApiKey = posthogApiKeyPrimitive.safeParse(PostHogApiKey)
    if (!parsedApiKey.success) {
      const message = parsedApiKey.error.flatten().formErrors.join(' - ')
      setPosthogApiKeyError(message)
      errors.push(message);
    }

    if (posthogApiHost == '') {
      const errorMessage = 'Select API host'
      setPosthogApiHostError(errorMessage)
      errors.push(errorMessage)
    }

    if (posthogApiHost == 'custom') {
      const parsedUrl = posthogApiHostPrimitive.safeParse(posthogApiHostCustom)
      if (!parsedUrl.success) {
        const message = parsedUrl.error.flatten().formErrors.join(' - ') || 'invalid url';
        setCustomPosthogApiHostError(message)
        errors.push(message)
      }
    }

    if (errors.length > 0) {
      if (errors.length == 1) {
        window.shopify.toast.show(errors[0], {
          isError: true,
          duration: 2000,
        });
      } else {
        window.shopify.toast.show('invalid settings', {
          isError: true,
          duration: 2000,
        });
      }
      return
    }

    fetcher.submit(
      {
        posthog_api_key: PostHogApiKey,
        posthog_api_host: posthogApiHost == 'custom' ?  posthogApiHostCustom : posthogApiHost,
        js_web_posthog_feature_toggle: jsWebPosthogFeatureEnabled,
        web_pixel_feature_toggle: webPixelFeatureEnabled,
        data_collection_strategy: dataCollectionStrategy,

      },
      {
        method: 'POST',
        encType: "application/json"
      }
    );
  };

  const posthogDashboardUrl = useMemo(() => {
    if (posthogApiHost == 'https://us.i.posthog.com') {
      return 'https://us.posthog.com';
    }

    if (posthogApiHost == 'https://eu.i.posthog.com') {
      return 'https://eu.posthog.com';
    }

    return 'https://app.posthog.com';
  }, [
    posthogApiHost
  ]);

  const hasApiKey = PosthogApiKeyInitialState !== '' && !!PosthogApiKeyInitialState;

  // Determine action-required states for status cards
  const webPixelHasActionRequired = webPixelFeatureEnabled && (!PostHogApiKey || !posthogApiHost || allEventsDisabled);
  const jsWebHasActionRequired = jsWebPosthogFeatureEnabled && (!PostHogApiKey || !posthogApiHost || !jsWebPosthogAppEmbedStatus);

  return (
    <div className={styles.pageWrapper}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.headerTitle}>Account Setup</h1>
          <p className={styles.headerDesc}>Connect your PostHog instance to start collecting data</p>
        </div>
        <div className={styles.headerActions}>
          <a href={posthogDashboardUrl} target="_blank" rel="noopener noreferrer" className={styles.dashboardBtn}>
            <ExternalLinkIcon />
            My PostHog Dashboard
          </a>
          <button
            className={styles.saveBtn}
            onClick={submitSettings}
            disabled={fetcher.state !== 'idle' || !dirty}
          >
            {fetcher.state === 'loading' ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>
        {/* ── Left Column: Setup Form ── */}
        <div className={styles.setupForm}>
          <div className={styles.setupCard}>
            {/* Card header with step badge */}
            <div className={styles.cardHeader}>
              <div className={styles.stepBadge}>1</div>
              <h2 className={styles.stepTitle}>Connect PostHog</h2>
            </div>

            <p className={styles.stepDesc}>
              Enter your PostHog credentials to start collecting analytics data from your Shopify store.
            </p>

            {/* PostHog Project API Key */}
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabelRow}>
                <label className={styles.fieldLabel}>PostHog Project API Key</label>
                <a
                  href={urlWithShopParam('https://pxhog.com/docs/getting-started#3-project-api-key-setup', shop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.fieldHelp}
                >
                  Where is my API key?
                </a>
              </div>
              <div className={styles.fieldInput}>
                <input
                  type="text"
                  value={PostHogApiKey}
                  onChange={handleApiKeyChange}
                  placeholder="phc_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  autoComplete="off"
                />
              </div>
              {posthogApiKeyError && <p className={styles.fieldError}>{posthogApiKeyError}</p>}
            </div>

            {/* API Host */}
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabelRow}>
                <label className={styles.fieldLabel}>API Host</label>
                <a
                  href={urlWithShopParam('https://pxhog.com/faqs/what-is-posthog-api-host', shop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.fieldHelp}
                >
                  What is this?
                </a>
              </div>
              <div className={styles.selectWrapper}>
                <select value={posthogApiHost} onChange={handlePosthogApiHostChange}>
                  {apiHostOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {posthogApiHostError && <p className={styles.fieldError}>{posthogApiHostError}</p>}
              <p className={styles.fieldHint}>We recommend using a Reverse Proxy for optimal data collection.</p>
            </div>

            {/* Custom Reverse Proxy (conditional) */}
            {posthogApiHost === 'custom' && (
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabelRow}>
                  <label className={styles.fieldLabel}>Custom Reverse Proxy</label>
                  <a
                    href={urlWithShopParam('https://pxhog.com/faqs/what-is-custom-reverse-proxy', shop)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.fieldHelp}
                  >
                    What is this, and how do I configure it?
                  </a>
                </div>
                <div className={styles.fieldInput}>
                  <input
                    type="url"
                    value={posthogApiHostCustom}
                    onChange={handlePosthogApiHostCustomChange}
                    placeholder="https://example.com"
                    autoComplete="off"
                  />
                </div>
                {posthogCustomApiHostError && <p className={styles.fieldError}>{posthogCustomApiHostError}</p>}
              </div>
            )}

            {/* Data Collection Strategy */}
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabelRow}>
                <label className={styles.fieldLabel}>Data Collection Strategy</label>
                <a
                  href={urlWithShopParam('https://pxhog.com/docs/data-collection-strategies', shop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.fieldHelp}
                >
                  What is this?
                </a>
              </div>
              <div className={styles.selectWrapper}>
                <select value={dataCollectionStrategy} onChange={handleDataCollectionStrategyChange}>
                  <option value="anonymized">Anonymized</option>
                  <option value="non-anonymized-by-consent">Identified By Consent</option>
                  <option value="non-anonymized">Identified</option>
                </select>
              </div>
              <p className={styles.fieldHint}>
                We recommend <strong>Anonymized</strong> or <strong>Identified By Consent</strong> for GDPR compliance.
              </p>
            </div>

            {/* Warning Banner */}
            {dataCollectionStrategy === 'non-anonymized' && (
              <div className={styles.warningBanner}>
                <span className={styles.warningIcon}>
                  <AlertTriangleIcon />
                </span>
                <span className={styles.warningText}>
                  This option <strong>bypasses customer privacy preferences</strong>.{' '}
                  <a href={urlWithShopParam('https://pxhog.com/docs/data-collection-strategies#3-identified', shop)} target="_blank" rel="noopener noreferrer">
                    Read more.
                  </a>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column: Connection Status ── */}
        <div className={styles.rightColumn}>
          <h3 className={styles.sectionTitle}>Connection Status</h3>

          {/* Web Pixels Status Card */}
          {hasApiKey && (
            <StatusCard
              title="Web Pixels"
              icon={<ZapIcon />}
              featureEnabled={webPixelFeatureEnabled}
              dirty={webPixelFeatureToggleInitialState !== webPixelFeatureEnabled || !!PostHogApiKey !== !!PosthogApiKeyInitialState}
              hasActionRequired={webPixelHasActionRequired}
              requirements={[
                { trigger: !PostHogApiKey, message: 'Setup PostHog project API key.' },
                { trigger: !posthogApiHost, message: 'Setup PostHog API Host.' },
                {
                  trigger: allEventsDisabled,
                  message: (
                    <>Select at least 1 event. <RemixLink to="/app/web-pixel-settings">Configure events</RemixLink></>
                  ),
                },
              ]}
              configureUrl="/app/web-pixel-settings"
              configureLabel="Configure Web Pixel Settings"
              onToggle={handleWebPixelFeatureEnabledToggle}
            />
          )}

          {/* JS Web Config Status Card */}
          {hasApiKey && (
            <StatusCard
              title="JS Web Config"
              icon={<CodeIcon />}
              featureEnabled={jsWebPosthogFeatureEnabled}
              dirty={jsWebPosthogFeatureEnabledInitialState !== jsWebPosthogFeatureEnabled || !!PostHogApiKey !== !!PosthogApiKeyInitialState}
              hasActionRequired={jsWebHasActionRequired}
              requirements={[
                { trigger: !PostHogApiKey, message: 'Setup PostHog project API key.' },
                { trigger: !posthogApiHost, message: 'Setup PostHog API Host.' },
                {
                  trigger: !jsWebPosthogAppEmbedStatus,
                  message: (
                    <>
                      Toggle PostHog JS web app embed on.{' '}
                      <a href={`https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${jsWebPosthogAppEmbedUuid}/${jsWebPosthogAppEmbedHandle}`} target="_top">
                        Click here
                      </a>
                      . Ensure changes are saved.
                    </>
                  ),
                },
              ]}
              configureUrl="/app/js-web-posthog-settings"
              configureLabel="Configure JS PostHog Settings"
              onToggle={handleJsWebPosthogFeatureEnabledToggle}
            />
          )}

          {/* Quick Tips Card */}
          <div className={styles.tipsCard}>
            <div className={styles.tipsHeader}>
              <span className={styles.tipsIcon}><LightbulbIcon /></span>
              <h4 className={styles.tipsTitle}>Quick Tips</h4>
            </div>
            <div className={styles.tipItem}>
              <span className={styles.tipBullet}>•</span>
              <p className={styles.tipText}>Use a Reverse Proxy for better data collection reliability</p>
            </div>
            <div className={styles.tipItem}>
              <span className={styles.tipBullet}>•</span>
              <p className={styles.tipText}>Identified By Consent is recommended for GDPR compliance</p>
            </div>
            <div className={styles.tipItem}>
              <span className={styles.tipBullet}>•</span>
              <p className={styles.tipText}>Your API key can be found in PostHog → Project Settings</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
