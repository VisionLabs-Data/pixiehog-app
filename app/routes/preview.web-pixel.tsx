/**
 * Preview of app.web-pixel-settings/route.tsx with mock loader data.
 * The real WebPixelEvents component is imported client-only; only data differs.
 */
import { json } from '@remix-run/node';
import { mockAppInstallation, PREVIEW_SHOP } from '../preview-support/mock-app-installation';
import { useClientComponent, PreviewLoading } from '../preview-support/client-only-route';

export const loader = () =>
  json({
    currentAppInstallation: mockAppInstallation,
    webPixel: null,
    shop: PREVIEW_SHOP,
  });

export default function PreviewWebPixel() {
  const Comp = useClientComponent(() => import('./app.web-pixel-settings/route'));
  return Comp ? <Comp /> : <PreviewLoading />;
}
