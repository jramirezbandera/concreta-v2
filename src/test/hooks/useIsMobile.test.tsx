import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../../hooks/useIsMobile';

interface MockMQL {
  matches: boolean;
  listeners: Array<(e: MediaQueryListEvent) => void>;
  addEventListener: (type: string, l: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: string, l: (e: MediaQueryListEvent) => void) => void;
  fire: (matches: boolean) => void;
}

function createMockMatchMedia(initialMatches: boolean): { mql: MockMQL; matchMedia: (q: string) => MockMQL } {
  const mql: MockMQL = {
    matches: initialMatches,
    listeners: [],
    addEventListener(_type, l) { this.listeners.push(l); },
    removeEventListener(_type, l) { this.listeners = this.listeners.filter((x) => x !== l); },
    fire(matches) {
      this.matches = matches;
      const evt = { matches } as MediaQueryListEvent;
      for (const l of this.listeners) l(evt);
    },
  };
  return { mql, matchMedia: () => mql };
}

describe('useIsMobile', () => {
  let original: typeof window.matchMedia | undefined;

  beforeEach(() => {
    original = window.matchMedia;
  });

  afterEach(() => {
    if (original) window.matchMedia = original;
    else delete (window as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia;
    vi.restoreAllMocks();
  });

  it('returns false when matchMedia is unavailable (jsdom default)', () => {
    delete (window as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('reads the initial breakpoint from matchMedia', () => {
    const { matchMedia } = createMockMatchMedia(true);
    window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('updates when the breakpoint changes (resize 768 → 767 → 768)', () => {
    const { mql, matchMedia } = createMockMatchMedia(false);
    window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize to mobile (<768)
    act(() => mql.fire(true));
    expect(result.current).toBe(true);

    // Simulate resize back to tablet (≥768)
    act(() => mql.fire(false));
    expect(result.current).toBe(false);
  });

  it('removes the change listener on unmount', () => {
    const { mql, matchMedia } = createMockMatchMedia(false);
    window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
    const { unmount } = renderHook(() => useIsMobile());
    expect(mql.listeners.length).toBe(1);
    unmount();
    expect(mql.listeners.length).toBe(0);
  });
});
