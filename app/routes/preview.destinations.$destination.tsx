/**
 * Preview of app.destinations.$destination.tsx with mock loader data.
 *
 * The param name matches the real route (`$destination`), so the component's
 * useParams() resolves the same way. Step navigation (?step=) works; the back
 * action points at /app, which only exists inside the embed.
 *
 * irisEmbedActive is deliberately false while the app-side toggle is true, so the
 * preview shows the "enabled here, not activated on the theme" warning.
 */
import { json } from '@remix-run/node';
import { mockAppInstallation, PREVIEW_SHOP } from '../preview-support/mock-app-installation';
import { useClientComponent, PreviewLoading } from '../preview-support/client-only-route';

export const loader = () =>
  json({
    install: mockAppInstallation,
    jsWebEmbedActive: true,
    irisEmbedActive: false,
    irisEmbedUuid: 'preview-iris-embed-uuid',
    shop: PREVIEW_SHOP,
  });

export default function PreviewDestination() {
  const Comp = useClientComponent(() => import('./app.destinations.$destination'));
  return Comp ? <Comp /> : <PreviewLoading />;
}
