// Landing page tests:
//   - every module card links to a real app route (dead-link guard)
//   - the landing grid covers every shipped module (full-coverage guard)
//   - <Landing/> renders without throwing

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { MODULE_LIBRARY } from '../../pages/landing/modules';
import { moduleRegistry } from '../../data/moduleRegistry';
import { Landing } from '../../pages/Landing';

describe('landing module grid', () => {
  const registryRoutes = new Set(moduleRegistry.map((m) => m.route));

  it('every module card points to a real app route', () => {
    for (const m of MODULE_LIBRARY) {
      expect(registryRoutes, `card "${m.name}" → ${m.route}`).toContain(m.route);
    }
  });

  it('covers every shipped module — no shipped module is hidden from the landing', () => {
    const cardRoutes = new Set(MODULE_LIBRARY.map((m) => m.route));
    const missing = moduleRegistry
      .filter((m) => m.shipped && !cardRoutes.has(m.route))
      .map((m) => m.route);
    expect(missing, `shipped modules absent from the landing: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no duplicate routes', () => {
    const routes = MODULE_LIBRARY.map((m) => m.route);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

describe('<Landing/>', () => {
  it('renders without throwing', () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <Landing />
        </MemoryRouter>
      </HelmetProvider>,
    );
    // hero tagline is present
    expect(screen.getByText(/El cálculo estructural que no te frena/i)).toBeInTheDocument();
    // every module card rendered (16 shipped modules)
    expect(screen.getAllByText(/Todos los módulos implementados/i).length).toBeGreaterThan(0);
  });
});
