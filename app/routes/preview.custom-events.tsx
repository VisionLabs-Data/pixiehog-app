/**
 * Preview of app.custom-events.tsx (the event catalog) with mock loader data.
 */
import { json } from '@remix-run/node';
import { mockAppInstallation } from '../preview-support/mock-app-installation';
import { useClientComponent, PreviewLoading } from '../preview-support/client-only-route';

export const loader = () => json({ install: mockAppInstallation });

export default function PreviewCustomEvents() {
  const Comp = useClientComponent(() => import('./app.custom-events'));
  return Comp ? <Comp /> : <PreviewLoading />;
}
