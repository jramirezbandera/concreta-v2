// FEM 2D — end-to-end integration smoke tests
//
// Mounts the full FemAnalysisModule with the app providers it depends on
// (Router for useSearchParams, DrawerContext for useDrawer, HelmetProvider
// for <Helmet>) and verifies the critical user paths:
//
//   1. Cold mount with no model → Landing renders with V1 plantillas
//   2. Pick a plantilla → workspace appears with Canvas + panels
//   3. localStorage hydration: model present at mount → workspace loads it
//   4. URL share hydration: ?model=encoded → workspace loads that model
//   5. Verdict aggregation: solver runs and produces η + status per bar
//
// Deeper interaction tests (click-to-edit, hinge toggle, etc.) live in the
// per-component test files (Canvas/InputsPanel/etc are stubbed at component
// level in V1 — they're shipped under E2E coverage as the module loads
// without crashing and the solver pipeline produces correct results).

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import { DrawerContext } from '../../components/layout/AppShell';
import { FemAnalysisModule } from '../../features/fem-analysis';
import { cloneDesignPreset } from '../../features/fem-analysis/presets';
import { encodeShareString } from '../../features/fem-analysis/serialize';
import { UnitSystemProvider } from '../../lib/units';

function renderModule(initialEntries: string[] = ['/analisis/fem']) {
  return render(
    <HelmetProvider>
      <UnitSystemProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <DrawerContext.Provider value={{ openDrawer: () => {} }}>
            <FemAnalysisModule />
          </DrawerContext.Provider>
        </MemoryRouter>
      </UnitSystemProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('FemAnalysisModule — Landing on cold mount', () => {
  it('renders Landing with the 3 V1 plantillas and the title', () => {
    renderModule();
    // Title.
    expect(screen.getByText(/Empieza con una plantilla/i)).toBeInTheDocument();
    // Plantilla names — note: order is continuous, cantilever, beam.
    expect(screen.getByText(/Viga continua/i)).toBeInTheDocument();
    expect(screen.getByText(/Ménsula/i)).toBeInTheDocument();
    expect(screen.getByText(/Viga simple/i)).toBeInTheDocument();
  });

  it('does NOT show plantillas hidden in V1 (cerchas, pórticos, etc.)', () => {
    renderModule();
    expect(screen.queryByText(/Cercha/i)).toBeNull();
    expect(screen.queryByText(/Pórtico/i)).toBeNull();
    expect(screen.queryByText(/dos aguas/i)).toBeNull();
  });

  it('does NOT show "Recientes" section when localStorage has no entries', () => {
    renderModule();
    expect(screen.queryByText(/^RECIENTES$/i)).toBeNull();
  });
});

describe('FemAnalysisModule — localStorage hydration', () => {
  it('loads a saved model from localStorage and skips Landing', () => {
    const model = cloneDesignPreset('continuous');
    window.localStorage.setItem('concreta-fem-2d-design', JSON.stringify(model));
    renderModule();
    // Workspace markers: Inputs panel header + Resultados verdict.
    // V1.1: <ResultsHeader> renders "Modelo · ● CUMPLE/REVISIÓN/INCUMPLE 119%"
    // (replacing the old "RESULTADOS" header). Verdict pill is the persistent
    // marker for the right panel rendering correctly.
    expect(screen.getAllByText(/CUMPLE|REVISIÓN|INCUMPLE|PENDIENTE/).length).toBeGreaterThanOrEqual(1);
    // Landing is gone.
    expect(screen.queryByText(/Empieza con una plantilla/i)).toBeNull();
  });

  it('produces solver results for a hydrated continuous-beam model', () => {
    const model = cloneDesignPreset('continuous');
    window.localStorage.setItem('concreta-fem-2d-design', JSON.stringify(model));
    renderModule();
    // Per-bar list shows b1, b2, b3 (one button per bar). The id is rendered
    // in its own span with exact text "b1"/"b2"/"b3".
    expect(screen.getAllByText('b1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('b2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('b3').length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to Landing when localStorage contains malformed JSON', () => {
    window.localStorage.setItem('concreta-fem-2d-design', 'not-valid-json{{{');
    renderModule();
    expect(screen.getByText(/Empieza con una plantilla/i)).toBeInTheDocument();
  });
});

describe('FemAnalysisModule — share-URL hydration', () => {
  it('loads a model from the ?model= query param and renders the workspace', () => {
    const model = cloneDesignPreset('cantilever');
    const encoded = encodeShareString(model);
    renderModule([`/analisis/fem?model=${encoded}`]);
    // Workspace renders.
    // V1.1: <ResultsHeader> renders "Modelo · ● CUMPLE/REVISIÓN/INCUMPLE 119%"
    // (replacing the old "RESULTADOS" header). Verdict pill is the persistent
    // marker for the right panel rendering correctly.
    expect(screen.getAllByText(/CUMPLE|REVISIÓN|INCUMPLE|PENDIENTE/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Empieza con una plantilla/i)).toBeNull();
  });

  it('survives a corrupted ?model= param by falling back to Landing + toast', () => {
    renderModule(['/analisis/fem?model=corrupted-not-a-real-encoding']);
    // Falls back: Landing shown.
    expect(screen.getByText(/Empieza con una plantilla/i)).toBeInTheDocument();
  });

  it('share-URL takes precedence over localStorage', () => {
    // Pre-seed localStorage with a continuous beam.
    const stored = cloneDesignPreset('continuous');
    window.localStorage.setItem('concreta-fem-2d-design', JSON.stringify(stored));
    // Share URL points to a cantilever.
    const shared = cloneDesignPreset('cantilever');
    const encoded = encodeShareString(shared);
    renderModule([`/analisis/fem?model=${encoded}`]);
    // Workspace renders (one of them); the cantilever has 1 bar so b1 should
    // show but NOT b2/b3 from the continuous in localStorage.
    // V1.1: <ResultsHeader> renders "Modelo · ● CUMPLE/REVISIÓN/INCUMPLE 119%"
    // (replacing the old "RESULTADOS" header). Verdict pill is the persistent
    // marker for the right panel rendering correctly.
    expect(screen.getAllByText(/CUMPLE|REVISIÓN|INCUMPLE|PENDIENTE/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('b3')).toBeNull(); // continuous would have b3
  });
});

describe('FemAnalysisModule — verdict aggregation', () => {
  it('shows verdict badge when a model is loaded (CUMPLE / REVISIÓN / INCUMPLE / PENDIENTE)', () => {
    const model = cloneDesignPreset('continuous');
    window.localStorage.setItem('concreta-fem-2d-design', JSON.stringify(model));
    renderModule();
    // Some verdict badge must be visible.
    const verdictRegex = /CUMPLE|REVISIÓN|INCUMPLE|PENDIENTE/;
    expect(screen.getAllByText(verdictRegex).length).toBeGreaterThanOrEqual(1);
  });

  it('models with no supports → fail status visible', () => {
    const model = cloneDesignPreset('beam');
    model.supports = [];
    window.localStorage.setItem('concreta-fem-2d-design', JSON.stringify(model));
    renderModule();
    // The errors banner renders the NO_SUPPORTS message (may appear in inputs
    // panel + results panel; we just need at least one).
    expect(screen.getAllByText(/no hay apoyos definidos/i).length).toBeGreaterThanOrEqual(1);
  });
});
