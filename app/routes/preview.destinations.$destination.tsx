/**
 * Preview of app.destinations.$destination.tsx with mock loader data.
 *
 * The param name matches the real route (`$destination`), so the component's
 * useParams() resolves the same way. Step navigation (?step=) works; the back
 * action points at /app/tracking, which only exists inside the embed.
 */
import { json } from '@remix-run/node';
import { mockAppInstallation } from '../preview-support/mock-app-installation';
import { useClientComponent, PreviewLoading } from '../preview-support/client-only-route';

export const loader = () => json({ install: mockAppInstallation, jsWebEmbedActive: true });

export default function PreviewDestination() {
  const Comp = useClientComponent(() => import('./app.destinations.$destination'));
  return Comp ? <Comp /> : <PreviewLoading />;
}
