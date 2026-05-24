import { useCallback } from 'react';

// Coalesced route prefetch: hover/focus on a NavLink fires the module's
// dynamic import early so the chunk is cached by the time the user clicks.
//
// Cache is a Map<route, Promise>. If the prefetch rejects, the entry is
// deleted so the next hover retries. The router's own lazy() also benefits
// because the module loader dedupes by URL — both promises resolve from a
// single network fetch.
//
// Skipped on touch-only devices (pointer: coarse), Save-Data, and 2G.

const prefetchCache = new Map<string, Promise<unknown>>();

type ConnectionLike = { saveData?: boolean; effectiveType?: string };

function getConnection(): ConnectionLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: ConnectionLike }).connection;
}

function shouldPrefetch(): boolean {
  if (typeof window === 'undefined') return false;
  // Touch-only devices: hover doesn't fire reliably and bandwidth often matters more.
  if (window.matchMedia?.('(pointer: coarse)').matches) return false;
  const conn = getConnection();
  if (conn?.saveData) return false;
  if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return false;
  return true;
}

// Test-only reset (used by vitest to start each test with a clean cache).
export function __resetPrefetchCache() {
  prefetchCache.clear();
}

export function useRoutePrefetch() {
  const prefetch = useCallback((route: string, loader: () => Promise<unknown>) => {
    if (!shouldPrefetch()) return;
    if (prefetchCache.has(route)) return;
    const promise = loader().catch(() => {
      // Allow next hover to retry instead of permanent failure.
      prefetchCache.delete(route);
    });
    prefetchCache.set(route, promise);
  }, []);

  return { prefetch };
}
