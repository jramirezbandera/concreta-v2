// About page tests:
//   - /about renders via the real router
//   - "About" nav link is active (aria-current) on /about
//   - the AboutSection teaser on the landing links to /about

import { describe, expect, it, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { Landing } from '../../pages/Landing';
import { About } from '../../pages/About';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderRoutes(initial: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Landing /> },
      { path: '/about', element: <About /> },
    ],
    { initialEntries: [initial] },
  );
  return render(
    <HelmetProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </HelmetProvider>,
  );
}

describe('About page', () => {
  it('renders at /about via the real router', () => {
    renderRoutes('/about');
    expect(
      screen.getByRole('heading', { name: /Una mesa de trabajo\. No un dashboard/i }),
    ).toBeInTheDocument();
    // story, manifesto, author and values sections all render
    expect(screen.getByRole('heading', { name: 'La historia' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'El manifiesto' })).toBeInTheDocument();
    expect(screen.getByText('Javier Ramírez Bandera')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Licencia y valores' })).toBeInTheDocument();
  });

  it('marks "About" active on /about', () => {
    renderRoutes('/about');
    const aboutLinks = screen.getAllByRole('link', { name: 'About' });
    expect(aboutLinks.some((a) => a.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('the landing teaser links to the full /about page', () => {
    renderRoutes('/');
    expect(
      screen.getByRole('link', { name: /Sobre Concreta y Javier/i }),
    ).toHaveAttribute('href', '/about');
    // 15s: this is the first render of <Landing /> in this file; under
    // parallel-load it can blow past the 5s default while modules transform.
  }, 15000);
});
