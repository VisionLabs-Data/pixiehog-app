/**
 * Preview of app.tracking.tsx (the "My Tracking" page) with mock loader data.
 * The real TrackingOverview component is imported client-only (see
 * client-only-route for why); only the data source differs.
 */
import { json } from '@remix-run/node';
import { mockAppInstallation } from '../preview-support/mock-app-installation';
import { useClientComponent, PreviewLoading } from '../preview-support/client-only-route';

export const loader = () =>
  json({ install: mockAppInstallation, jsWebEmbedActive: true, irisEmbedActive: false });

export default function PreviewTracking() {
  const Comp = useClientComponent(() => import('./app.tracking'));
  return Comp ? <Comp /> : <PreviewLoading />;
}
