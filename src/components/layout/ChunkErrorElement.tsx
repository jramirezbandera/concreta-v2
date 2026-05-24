import { useEffect } from 'react';

// Renders when route.lazy() rejects (typically: stale HTML pointing at a
// renamed chunk after deploy, or transient network failure). The existing
// ChunkErrorBoundary only catches errors AFTER the new route mounts; lazy
// rejections fire BEFORE mount, so they need to be caught at the route's
// errorElement boundary instead. See src/test/routing/lazy.dom.test.tsx.
export function ChunkErrorElement() {
  useEffect(() => {
    if (typeof window !== 'undefined') window.location.reload();
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center bg-bg-primary">
      <div className="text-text-secondary text-sm">Recargando…</div>
    </div>
  );
}
