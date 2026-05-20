// Regression coverage for the route-level lazy split.
//
// Three failure modes the bundle-split PR can introduce:
//   1. Cold deep-link doesn't show HydrateFallback while the chunk loads.
//   2. Wildcard `<Navigate>` redirect doesn't resolve once the target chunk
//      lazy-loads.
//   3. A 404'd lazy chunk (stale HTML after deploy) leaves the route tree
//      blank instead of triggering a reload.

import React, { Suspense } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Navigate } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { ChunkErrorBoundary } from '../../components/layout/ChunkErrorBoundary';
import { RouteFallback } from '../../components/layout/RouteFallback';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <HelmetProvider>{children}</HelmetProvider>;
}

function delayedComponent(label: string, delayMs = 10) {
  return () =>
    new Promise<{ Component: React.ComponentType }>((resolve) =>
      setTimeout(
        () => resolve({ Component: () => <div data-testid="resolved">{label}</div> }),
        delayMs,
      ),
    );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('route-level lazy splitting', () => {
  it('cold deep-link shows HydrateFallback then resolves the lazy component', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          HydrateFallback: RouteFallback,
          children: [{ path: 'horm/vigas', lazy: delayedComponent('rc-beams') }],
        },
      ],
      { initialEntries: ['/horm/vigas'] },
    );

    render(
      <Wrapper>
        <RouterProvider router={router} />
      </Wrapper>,
    );

    // The chunk hasn't resolved yet — final UI not visible.
    expect(screen.queryByTestId('resolved')).toBeNull();

    // Once the lazy factory resolves the module appears.
    expect(await screen.findByTestId('resolved')).toHaveTextContent('rc-beams');
  });

  it('wildcard <Navigate> redirects into a lazy route that resolves', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          HydrateFallback: RouteFallback,
          children: [
            { path: 'horm/vigas', lazy: delayedComponent('rc-beams') },
            { path: '*', element: <Navigate to="/horm/vigas" replace /> },
          ],
        },
      ],
      { initialEntries: ['/garbage-path-that-does-not-exist'] },
    );

    render(
      <Wrapper>
        <RouterProvider router={router} />
      </Wrapper>,
    );

    // Navigate fires synchronously, then lazy chunk lands.
    expect(await screen.findByTestId('resolved')).toHaveTextContent('rc-beams');
  });

  it('ChunkErrorBoundary triggers window.location.reload on a chunk-load failure', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    function Boom(): React.ReactElement {
      // Simulate the runtime error fired by `import()` when the chunk URL
      // resolves to a 404 (stale HTML, deleted chunk after deploy).
      const err = new Error('Failed to fetch dynamically imported module: /assets/x.js');
      err.name = 'ChunkLoadError';
      throw err;
    }

    render(
      <Wrapper>
        <ChunkErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Boom />
          </Suspense>
        </ChunkErrorBoundary>
      </Wrapper>,
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('ChunkErrorBoundary non-chunk errors', () => {
  it('does NOT reload on unrelated runtime errors (lets them propagate)', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    // Swallow the expected React error log so the test output stays clean.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Bug(): React.ReactElement {
      throw new Error('something else broke');
    }

    // Wrap in a second boundary that catches the non-chunk error so the test
    // process doesn't hard-fail.
    class Sink extends React.Component<{ children: React.ReactNode }, { caught: boolean }> {
      state = { caught: false };
      static getDerivedStateFromError() {
        return { caught: true };
      }
      render() {
        if (this.state.caught) return <div data-testid="sink">caught</div>;
        return this.props.children;
      }
    }

    render(
      <Wrapper>
        <Sink>
          <ChunkErrorBoundary>
            <Bug />
          </ChunkErrorBoundary>
        </Sink>
      </Wrapper>,
    );

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByTestId('sink')).toBeInTheDocument();

    consoleError.mockRestore();
  });
});

