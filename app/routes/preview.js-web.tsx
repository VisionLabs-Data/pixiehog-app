/**
 * Preview of app.js-web-posthog-settings/route.tsx with mock loader data.
 * The real JsWebEvents component is imported client-only; only data differs.
 */
import { json } from '@remix-run/node';
import { Constant } from '../../common/constant/index';
import { mockAppInstallation, PREVIEW_SHOP } from '../preview-support/mock-app-installation';
import { useClientComponent, PreviewLoading } from '../preview-support/client-only-route';

export const loader = () =>
  json({
    currentAppInstallation: mockAppInstallation,
    js_web_posthog_app_embed_status: true,
    js_web_posthog_app_embed_uuid: 'preview-app-embed-uuid',
    shop: PREVIEW_SHOP,
    js_web_posthog_app_embed_handle: Constant.APP_POSTHOG_JS_WEB_THEME_APP_HANDLE,
  });

export default function PreviewJsWeb() {
  const Comp = useClientComponent(() => import('./app.js-web-posthog-settings/route'));
  return Comp ? <Comp /> : <PreviewLoading />;
}
