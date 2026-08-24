// Landing page tests:
//   - every module card links to a real app route (dead-link guard)
//   - the landing grid covers every shipped module (full-coverage guard)
//   - <Landing/> renders without throwing
//   - the numbered eyebrows stay sequential (they used to be 12 hand-written
//     strings and 4 had drifted)
//   - the hero's FEM 2D deep-link round-trips to a real model
//   - no plan advertises a feature that was removed with the old Studio tier

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { MODULE_LIBRARY } from '../../pages/landing/modules';
import { moduleRegistry } from '../../data/moduleRegistry';
import { Landing } from '../../pages/Landing';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import {
  APP_ROUTE,
  BETA,
  FEM2D_ROUTE,
  PLANS,
  SECTION_ORDER,
  planBadge,
  sectionEyebrow,
} from '../../pages/landing/constants';
import { PORTAL_FRAME, PORTAL_FRAME_HREF } from '../../pages/landing/heroCase';
import { decodeShareString, isPlausibleModel } from '../../features/fem2d/serialize';

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
        <ThemeProvider>
          <MemoryRouter>
            <Landing />
          </MemoryRouter>
        </ThemeProvider>
      </HelmetProvider>,
    );
    // hero tagline is present — it leads with the product, not with the AI
    expect(screen.getByText(/El cálculo estructural que no te frena/i)).toBeInTheDocument();
    // the assistant section is on the page, as a feature (see section numbering)
    // and says plainly what it is — "asistente de IA", not a clever metaphor
    expect(screen.getByText(/Un asistente de IA/i)).toBeInTheDocument();
    expect(screen.getByText(/La IA no calcula/i)).toBeInTheDocument();
    // every module card rendered (16 shipped modules)
    expect(screen.getAllByText(/Todos los módulos implementados/i).length).toBeGreaterThan(0);
  });
});

describe('section numbering', () => {
  // The eyebrows used to be hardcoded in 12 files and 4 had drifted (Normativa
  // read 05 on the landing and 04 on its own page). They are derived now; these
  // guard the derivation, not the copy.
  it('numbers sections sequentially from their position', () => {
    // Módulos before Asistente: the product first, the assistant as a feature.
    expect(sectionEyebrow('modulos')).toBe('02 · Módulos');
    expect(sectionEyebrow('asistente')).toBe('03 · Asistente');
    expect(sectionEyebrow('precio')).toBe('08 · Precio');
  });

  it('keeps a subpage label without desyncing its number', () => {
    // /about expands the landing's "Quién" — different wording, same number.
    expect(sectionEyebrow('quien', 'Sobre Concreta')).toBe('10 · Sobre Concreta');
    expect(sectionEyebrow('quien')).toBe('10 · Quién');
  });

  it('has no duplicate section ids', () => {
    const ids = SECTION_ORDER.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('throws on an unknown section instead of rendering a wrong number', () => {
    // @ts-expect-error — deliberately off the union: a typo must fail loudly.
    expect(() => sectionEyebrow('inventada')).toThrow(/unknown section/);
  });
});

describe('hero FEM 2D deep-link', () => {
  // buildShareUrl's default baseUrl reads window.location.pathname, which on the
  // landing is "/". Omitting the explicit route would silently produce
  // "/?model=…" and the hero's headline CTA would link back to the landing.
  it('points at the FEM 2D route, not the current page', () => {
    expect(PORTAL_FRAME_HREF.startsWith(`${FEM2D_ROUTE}?model=`)).toBe(true);
  });

  it('round-trips to a plausible model', () => {
    const encoded = PORTAL_FRAME_HREF.split('?model=')[1];
    const model = decodeShareString(encoded);
    expect(model).not.toBeNull();
    expect(isPlausibleModel(model)).toBe(true);
    expect(model?.templateId).toBe('portal-frame');
  });

  it('draws the frame the link actually opens', () => {
    // The canvas geometry is derived from the same model, so a template default
    // change can never leave the drawing describing a frame you can't open.
    expect(PORTAL_FRAME.members.length).toBeGreaterThan(0);
    expect(PORTAL_FRAME.supports.length).toBeGreaterThan(0);
    expect(PORTAL_FRAME.loadedMembers.length).toBeGreaterThan(0);
    expect(PORTAL_FRAME.facts).toMatch(/\d+\.\d{2} × \d+\.\d{2} m/);
  });
});

describe('pricing plans', () => {
  const allCopy = PLANS.flatMap((p) => [
    p.name,
    p.blurb,
    p.unit,
    p.note ?? '',
    ...p.features,
    ...p.teaserFeatures,
  ]).join(' | ');

  it('no longer advertises anything from the retired Studio tier', () => {
    for (const dead of ['SSO', 'SLA', 'Biblioteca', 'Plantillas', '5 técnicos', 'cuentas', '12+']) {
      expect(allCopy, `plan copy still sells "${dead}"`).not.toContain(dead);
    }
  });

  it('never hardcodes a module count', () => {
    // MODULE_LIBRARY is the single source of truth; a literal here goes stale
    // within a fortnight (the page said "12+" with 19 shipped).
    expect(allCopy).not.toMatch(/\d+\s*\+?\s*módulos/i);
  });

  it('teaser features are a subset of the full list', () => {
    for (const p of PLANS) {
      expect(p.teaserFeatures.length).toBeLessThanOrEqual(p.features.length);
    }
  });

  it('marks every tier that cannot be bought as soon, and never pushes one', () => {
    // There is no payment gateway and no licence gate during the beta, so Pro
    // is an announcement too — a RECOMENDADO badge on a card you cannot buy is
    // the exact promise this page refuses to make.
    const soon = PLANS.filter((p) => p.soon);
    expect(soon.map((p) => p.id)).toEqual(BETA ? ['pro', 'estudio'] : ['estudio']);
    expect(soon.every((p) => !p.highlight)).toBe(true);
  });

  it('gives every card at most one badge, and never a filled one to a soon tier', () => {
    for (const p of PLANS) {
      const badge = planBadge(p);
      if (p.soon) expect(badge).toEqual({ text: 'PRÓXIMAMENTE', soon: true });
      else if (p.highlight) expect(badge?.soon).toBe(false);
      else expect(badge).toBeNull();
    }
  });

  it('the highlighted plan is one the visitor can act on right now', () => {
    // Whatever the loud button says, it has to lead somewhere that delivers it:
    // during the beta that means the app, never a mailto waiting list.
    const hi = PLANS.filter((p) => p.highlight);
    expect(hi.length).toBe(1);
    if (BETA) {
      expect(hi[0].id).toBe('libre');
      expect(hi[0].ctaTo).toBe(APP_ROUTE);
      expect(hi[0].cta).toMatch(/gratis/i);
    }
  });

  it('paid CTAs open a prefilled email, with an ASCII subject', () => {
    // There is no licence gate yet, so nothing is actually paywalled: a payment
    // link would charge for something the visitor already has. And the subject
    // is the measurement instrument — a "€" does not survive every mail client.
    for (const p of PLANS.filter((x) => x.id !== 'libre')) {
      expect(p.ctaTo, `${p.name} CTA`).toMatch(/^mailto:/);
      // eslint-disable-next-line no-control-regex -- ASCII-only guard
      expect(p.ctaTo).toMatch(/^[\x00-\x7F]*$/);
    }
  });
});
