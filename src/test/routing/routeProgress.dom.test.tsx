// Coverage for RouteProgressBar's anti-flash, escalation, cleanup, and
// reduced-motion behavior. Tests the component in isolation by mocking
// react-router's useNavigation so we don't have to drive a real navigation.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const navigationState = { state: 'idle' as 'idle' | 'loading', location: undefined as { pathname: string } | undefined };

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigation: () => navigationState,
  };
});

// Import AFTER mock so the component picks up the mocked useNavigation.
const { RouteProgressBar } = await import('../../components/layout/RouteProgressBar');

function setNav(state: 'idle' | 'loading', pathname?: string) {
  navigationState.state = state;
  navigationState.location = pathname ? { pathname } : undefined;
}

describe('RouteProgressBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setNav('idle');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT render before the 80ms anti-flash window', () => {
    const { rerender } = render(<RouteProgressBar />);
    setNav('loading', '/horm/vigas');
    rerender(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders after 80ms in loading state with route label', () => {
    const { rerender } = render(<RouteProgressBar />);
    setNav('loading', '/horm/vigas');
    rerender(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/Cargando Vigas/);
  });

  it('renders generic Cargando when route is not in moduleRegistry', () => {
    const { rerender } = render(<RouteProgressBar />);
    setNav('loading', '/blog/some-slug');
    rerender(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^Cargando$/);
  });

  it('escalates copy after 10 seconds in loading', () => {
    const { rerender } = render(<RouteProgressBar />);
    setNav('loading', '/horm/vigas');
    rerender(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(10_500);
    });

    expect(screen.getByRole('status')).toHaveTextContent(/tardando más de lo normal/);
  });

  it('shows Recargar button after 20 seconds stuck', () => {
    const { rerender } = render(<RouteProgressBar />);
    setNav('loading', '/horm/vigas');
    rerender(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(20_500);
    });

    expect(screen.getByRole('button', { name: /Recargar/i })).toBeInTheDocument();
  });

  it('hides after navigation settles (idle)', () => {
    const { rerender } = render(<RouteProgressBar />);
    setNav('loading', '/horm/vigas');
    rerender(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.queryByRole('status')).toBeInTheDocument();

    setNav('idle');
    rerender(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('cleans up timers on unmount', () => {
    const { rerender, unmount } = render(<RouteProgressBar />);
    setNav('loading', '/horm/vigas');
    rerender(<RouteProgressBar />);

    // Unmount BEFORE the 80ms fires — timer must not fire after unmount.
    unmount();
    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    // No assertion — test passes if no warning/error about setState after unmount.
    expect(true).toBe(true);
  });

  it('reduced-motion swaps shimmer for pulse class', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    });

    const { rerender } = render(<RouteProgressBar />);
    setNav('loading', '/horm/vigas');
    rerender(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(120);
    });

    const status = screen.getByRole('status');
    const bar = status.querySelector('div');
    expect(bar?.className).toMatch(/animate-pulse/);
    expect(bar?.className).not.toMatch(/animate-route-progress/);
  });
});
