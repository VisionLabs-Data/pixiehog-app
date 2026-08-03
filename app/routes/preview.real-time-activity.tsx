/** Preview of app.real-time-activity.tsx. No loader needed — the page takes no data. */
import { useClientComponent, PreviewLoading } from '../preview-support/client-only-route';

export default function Preview() {
  const Comp = useClientComponent(() => import('./app.real-time-activity'));
  return Comp ? <Comp /> : <PreviewLoading />;
}
