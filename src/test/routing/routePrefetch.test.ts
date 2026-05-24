// useRoutePrefetch coverage: coalescing, .catch retry, navigator.connection
// gating, touch/coarse-pointer skip.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoutePrefetch, __resetPrefetchCache } from '../../hooks/useRoutePrefetch';

type Nav = Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };

function setConnection(connection: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: connection,
  });
}

function setMatchMedia(coarseMatches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('pointer: coarse') ? coarseMatches : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

beforeEach(() => {
  __resetPrefetchCache();
  setConnection(undefined);
  setMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRoutePrefetch', () => {
  it('calls loader once per route (coalesces repeat hovers)', () => {
    const loader = vi.fn(() => Promise.resolve('chunk'));
    const { result } = renderHook(() => useRoutePrefetch());

    act(() => {
      result.current.prefetch('/horm/vigas', loader);
      result.current.prefetch('/horm/vigas', loader);
      result.current.prefetch('/horm/vigas', loader);
    });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('allows retry after a failed prefetch (deletes cache entry on .catch)', async () => {
    const loader = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(() => Promise.reject(new Error('net fail')))
      .mockImplementationOnce(() => Promise.resolve('chunk'));

    const { result } = renderHook(() => useRoutePrefetch());

    await act(async () => {
      result.current.prefetch('/horm/vigas', loader);
      // Let the rejected promise settle and the .catch handler delete the entry.
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.prefetch('/horm/vigas', loader);
    });

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('skips prefetch when saveData is true', () => {
    setConnection({ saveData: true });
    const loader = vi.fn(() => Promise.resolve('chunk'));
    const { result } = renderHook(() => useRoutePrefetch());

    act(() => {
      result.current.prefetch('/horm/vigas', loader);
    });

    expect(loader).not.toHaveBeenCalled();
  });

  it('skips prefetch on effectiveType 2g', () => {
    setConnection({ effectiveType: '2g' });
    const loader = vi.fn(() => Promise.resolve('chunk'));
    const { result } = renderHook(() => useRoutePrefetch());

    act(() => {
      result.current.prefetch('/horm/vigas', loader);
    });

    expect(loader).not.toHaveBeenCalled();
  });

  it('skips prefetch on pointer:coarse (touch-only devices)', () => {
    setMatchMedia(true);
    const loader = vi.fn(() => Promise.resolve('chunk'));
    const { result } = renderHook(() => useRoutePrefetch());

    act(() => {
      result.current.prefetch('/horm/vigas', loader);
    });

    expect(loader).not.toHaveBeenCalled();
  });

  it('does not crash when navigator.connection is absent (Safari/Firefox)', () => {
    // navigator.connection deliberately undefined (Safari behavior).
    const nav = navigator as Nav;
    expect(nav.connection).toBeUndefined();

    const loader = vi.fn(() => Promise.resolve('chunk'));
    const { result } = renderHook(() => useRoutePrefetch());

    expect(() => {
      act(() => {
        result.current.prefetch('/horm/vigas', loader);
      });
    }).not.toThrow();

    expect(loader).toHaveBeenCalledTimes(1);
  });
});
