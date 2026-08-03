/**
 * Preview of app._index.tsx (the "Overview" page) with mock loader data.
 * The real Index component is imported client-only; only the data differs.
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

export default function PreviewOverview() {
  const Comp = useClientComponent(() => import('./app._index'));
  return Comp ? <Comp /> : <PreviewLoading />;
}
