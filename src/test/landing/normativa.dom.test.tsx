// Normativa page + shared-chrome tests:
//   - /normativa renders via the real router
//   - LandingNav active state (aria-current) and /#anchor link form
//   - mobile menu open/close
//   - ScrollToHash scrolls to a /#section target
//   - NormativaSection "Detalle completo" links to /normativa

import { describe, expect, it, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, MemoryRouter } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { Landing } from '../../pages/Landing';
import { Normativa } from '../../pages/Normativa';
import { LandingNav } from '../../pages/landing/LandingNav';

beforeAll(() => {
  // jsdom has no layout — scrollIntoView is unimplemented.
  Element.prototype.scrollIntoView = vi.fn();
});

function renderRoutes(initial: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Landing /> },
      { path: '/normativa', element: <Normativa /> },
    ],
    { initialEntries: [initial] },
  );
  return render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
}

describe('Normativa page', () => {
  it('renders at /normativa via the real router', () => {
    renderRoutes('/normativa');
    expect(
      screen.getByRole('heading', { name: /Norma española, artículo a artículo/i }),
    ).toBeInTheDocument();
    // a norm block, a module-doc card, and the legend all render
    expect(screen.getByRole('heading', { name: /Bases de cálculo/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vigas HA' })).toBeInTheDocument();
    expect(screen.getByText('Vivo en la app y testeado.')).toBeInTheDocument();
  });

  it('shows a per-block "última revisión" date', () => {
    renderRoutes('/normativa');
    expect(screen.getAllByText(/revisado · 05\/2026/).length).toBeGreaterThan(0);
  });

  it('marks "Normativa" active on /normativa but not on /', () => {
    const { unmount } = renderRoutes('/normativa');
    const normativaLinks = screen.getAllByRole('link', { name: 'Normativa' });
    expect(normativaLinks.some((a) => a.getAttribute('aria-current') === 'page')).toBe(true);
    unmount();

    renderRoutes('/');
    const active = screen
      .queryAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page');
    expect(active).toHaveLength(0);
  });
});

describe('LandingNav', () => {
  it('section links use the /#anchor form so they work from any route', () => {
    render(
      <MemoryRouter initialEntries={['/normativa']}>
        <LandingNav />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Módulos' })).toHaveAttribute('href', '/#modulos');
  });

  it('mobile menu opens and closes', () => {
    render(
      <MemoryRouter>
        <LandingNav />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Abrir menú/i }));
    expect(screen.getByRole('button', { name: /Cerrar menú/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cerrar menú/i }));
    expect(screen.getByRole('button', { name: /Abrir menú/i })).toBeInTheDocument();
  });
});

describe('cross-page navigation', () => {
  it('NormativaSection links to the full /normativa page', () => {
    renderRoutes('/');
    expect(screen.getByRole('link', { name: /Detalle completo/i })).toHaveAttribute(
      'href',
      '/normativa',
    );
    // 15s: first render of <Landing /> in this file; transform contention can
    // exceed the 5s default under full-suite parallel load.
  }, 15000);

  it('ScrollToHash scrolls to a /#section target on the landing', async () => {
    (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear();
    renderRoutes('/#modulos');
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it('a hash with no matching element does not throw', () => {
    expect(() => renderRoutes('/#no-such-section')).not.toThrow();
  });
});
