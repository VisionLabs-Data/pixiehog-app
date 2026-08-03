/** Preview of app.pre-built-tags.tsx. No loader needed — the page takes no data. */
import { useClientComponent, PreviewLoading } from '../preview-support/client-only-route';

export default function Preview() {
  const Comp = useClientComponent(() => import('./app.pre-built-tags'));
  return Comp ? <Comp /> : <PreviewLoading />;
}
