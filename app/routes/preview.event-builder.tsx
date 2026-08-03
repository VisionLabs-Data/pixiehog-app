/** Preview of app.event-builder.tsx. No loader needed — the page takes no data. */
import { useClientComponent, PreviewLoading } from '../preview-support/client-only-route';

export default function Preview() {
  const Comp = useClientComponent(() => import('./app.event-builder'));
  return Comp ? <Comp /> : <PreviewLoading />;
}
