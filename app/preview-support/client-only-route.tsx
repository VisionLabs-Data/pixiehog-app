/**
 * Renders a real admin route component CLIENT-ONLY.
 *
 * The admin components are written for client-only rendering (they live under
 * the embedded `app.tsx` boundary, which redirects before SSR). Some of their
 * transitive modules build JSX at module scope and cannot be instantiated under
 * Vite's SSR transform. Static-importing them into a preview route would also
 * poison the Remix dev route manifest for every route.
 *
 * So the preview routes import the real component lazily via `import()` inside
 * an effect — the module loads only in the browser. The server (and the first
 * client render) shows a lightweight placeholder, so there's no hydration
 * mismatch. `useLoaderData()` inside the real component still resolves to the
 * preview route's own (mock) loader data.
 */
import { useEffect, useState, type ComponentType } from 'react';

export function useClientComponent(
  importer: () => Promise<{ default: ComponentType }>,
) {
  const [Comp, setComp] = useState<ComponentType | null>(null);
  useEffect(() => {
    let active = true;
    importer().then((mod) => {
      if (active) setComp(() => mod.default);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return Comp;
}

export function PreviewLoading() {
  return (
    <div
      style={{
        padding: 48,
        textAlign: 'center',
        color: '#71717a',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      Loading preview…
    </div>
  );
}
