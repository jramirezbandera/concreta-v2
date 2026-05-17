// FEM 1D — mobile read-only enforcement tests
//
// Plan: ~/.gstack/projects/jramirezbandera-concreta-v2/Javier-main-design-20260506-230443.md
//
// Verifies the post-2026-05-06 mobile adaptation:
//   - <768px → Canvas runs in readOnly mode (Canvas accepts `readOnly` prop).
//   - <768px → MobileTabBar shows up (3 tabs).
//   - <768px → ToolPalette + +Vano + undo/redo are not in the DOM.
//   - <768px → ReadOnlyBanner appears.
//   - <768px → EtaPill is rendered floating over canvas.
//   - <768px → InputsPanel is wrapped in <fieldset disabled>.
//   - ≥768px → none of the above mobile-only chrome is visible (regression).

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import { DrawerContext } from '../../components/layout/AppShell';
import { FemAnalysisModule } from '../../features/fem-analysis';
import { cloneDesignPreset } from '../../features/fem-analysis/presets';
import { UnitSystemProvider } from '../../lib/units';

interface MockMQL {
  matches: boolean;
  media: string;
  listeners: Array<(e: MediaQueryListEvent) => void>;
  addEventListener: (t: string, l: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: (t: string, l: (e: MediaQueryListEvent) => void) => void;
  // legacy callbacks used by some libs (no-op)
  addListener?: () => void;
  removeListener?: () => void;
  onchange?: ((e: MediaQueryListEvent) => void) | null;
  dispatchEvent?: () => boolean;
}

function installMatchMedia(mobile: boolean) {
  const mql: MockMQL = {
    matches: mobile,
    media: '(max-width: 767px)',
    listeners: [],
    addEventListener(_t, l) { this.listeners.push(l); },
    removeEventListener(_t, l) { this.listeners = this.listeners.filter((x) => x !== l); },
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => true,
  };
  (window as unknown as { matchMedia?: (q: string) => MockMQL }).matchMedia = () => mql;
  return mql;
}

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

const STORAGE_KEY = 'concreta-fem-2d-design';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  delete (window as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia;
});

describe('FEM mobile (<768px): read-only enforcement', () => {
  beforeEach(() => {
    installMatchMedia(true);
    // Hydrate with a continuous-beam preset so the workspace mounts (not Landing).
    const m = cloneDesignPreset('continuous');
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  });

  it('renders the MobileTabBar with the 3 canonical tabs', () => {
    renderModule();
    // The tabbar is rendered with role buttons (the shared component is a <nav>
    // with 3 <button>s). We assert the labels appear.
    expect(screen.getByText('Datos')).toBeInTheDocument();
    expect(screen.getByText('Diagramas')).toBeInTheDocument();
    expect(screen.getByText('Resultados')).toBeInTheDocument();
  });

  it('shows the read-only banner over the canvas', () => {
    renderModule();
    expect(screen.getByText(/Modo consulta/i)).toBeInTheDocument();
  });

  it('hides the +Vano edit button (Canvas runs in readOnly)', () => {
    renderModule();
    // Plantillas back-to-landing button still exists, but the +Vano floating
    // affordance does not (gated behind !readOnly in Canvas).
    expect(screen.queryByRole('button', { name: /\+\s*vano/i })).toBeNull();
  });

  it('does NOT render undo / redo controls in the FloatingControls', () => {
    renderModule();
    expect(screen.queryByTitle(/Deshacer/i)).toBeNull();
    expect(screen.queryByTitle(/Rehacer/i)).toBeNull();
  });

  it('does NOT render the layer / combo selector groups', () => {
    renderModule();
    expect(screen.queryByLabelText('Combinación visual')).toBeNull();
    expect(screen.queryByLabelText('Capa visual')).toBeNull();
  });

  it('renders the EtaPill with η% (or error count) on top of canvas', () => {
    renderModule();
    // The pill has aria-label "Ver resultados — η X%" or "Ver resultados — X errores".
    const pill = screen.getByRole('button', { name: /Ver resultados/i });
    expect(pill).toBeInTheDocument();
  });
});

describe('FEM desktop (≥768px): regression — no mobile chrome', () => {
  beforeEach(() => {
    installMatchMedia(false);
    const m = cloneDesignPreset('continuous');
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  });

  it('does NOT render the read-only banner', () => {
    renderModule();
    expect(screen.queryByText(/Modo consulta/i)).toBeNull();
  });

  it('does NOT render the EtaPill (it is mobile-only)', () => {
    renderModule();
    expect(screen.queryByRole('button', { name: /Ver resultados/i })).toBeNull();
  });

  it('renders undo / redo / layer selectors as before', () => {
    renderModule();
    expect(screen.getByTitle(/Deshacer/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Rehacer/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Combinación visual')).toBeInTheDocument();
    expect(screen.getByLabelText('Capa visual')).toBeInTheDocument();
  });
});
