// Smoke de INTEGRACIÓN del módulo completo de muros de escollera/gaviones.
//
// Monta `RockfillWallModule` (features/rockfill-wall/index.tsx) en jsdom con
// MemoryRouter (useModuleState → useSearchParams) y los providers de tema y
// unidades. El motor es síncrono y puro: no hay nada que mockear.
//
// Cubre:
//   1. el módulo renderiza sin throw con los defaults y pinta la vista de
//      geometría en el lienzo de pantalla + el veredicto de resultados;
//   2. el conmutador de vistas monta Cargas y Hiladas en el lienzo;
//   3. el toggle de tipología a Gaviones re-renderiza inputs (altura de caja) y
//      la geometría escalonada sin invalidar el resultado;
//   4. los clones PDF de las TRES vistas existen (ancla del exportador).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { RockfillWallModule } from '../../features/rockfill-wall';

function renderModule() {
  return render(
    <MemoryRouter initialEntries={['/geotec/escollera']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <RockfillWallModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const VIEW_GEOM = /Geometría del muro de escollera/i;
const VIEW_LOADS = /Cargas y empujes sobre el muro de escollera/i;
const VIEW_HILADAS = /Comprobación hilada a hilada/i;

/** Lienzo central de pantalla (los clones PDF cuelgan de un wrapper aria-hidden). */
function screenCanvas(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.canvas-dot-grid');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => cleanup());

describe('RockfillWallModule — smoke de integración', () => {
  it('1 · renderiza sin throw: geometría viva + veredicto + checks clave', () => {
    const { container } = renderModule();
    const canvas = within(screenCanvas(container));
    expect(canvas.getByLabelText(VIEW_GEOM)).toBeInTheDocument();
    expect(screen.getByText(/Resultados calculados/i)).toBeInTheDocument();
    // Las dos comprobaciones firma del módulo están en pantalla.
    expect(container.querySelector('[data-check-id="hilada-deslizamiento"]')).not.toBeNull();
    expect(container.querySelector('[data-check-id="deslizamiento"]')).not.toBeNull();
    expect(container.querySelector('[data-check-id="estabilidad-global"]')).not.toBeNull();
  });

  it('2 · el conmutador de vistas monta Cargas y Hiladas en el lienzo', () => {
    const { container } = renderModule();
    fireEvent.click(screen.getByRole('button', { name: /Cargas y empujes/i }));
    let canvas = within(screenCanvas(container));
    expect(canvas.getByLabelText(VIEW_LOADS)).toBeInTheDocument();

    // Varios botones contienen "hiladas" (tooltip de ayuda del campo): se
    // desambigua por el texto exacto del ViewTabButton ("3" + "Hiladas").
    const hiladasTab = screen
      .getAllByRole('button')
      .find((b) => /^3\s*Hiladas$/.test(b.textContent?.trim() ?? ''));
    expect(hiladasTab).toBeDefined();
    fireEvent.click(hiladasTab!);
    canvas = within(screenCanvas(container));
    expect(canvas.getByLabelText(VIEW_HILADAS)).toBeInTheDocument();
    expect(canvas.queryByLabelText(VIEW_GEOM)).not.toBeInTheDocument();
  });

  it('3 · el toggle de tipología a Gaviones cambia inputs y mantiene resultado válido', () => {
    const { container } = renderModule();
    // Antes: campos de escollera presentes, de gaviones ausentes.
    expect(container.querySelector('#input-mIntra')).not.toBeNull();
    expect(container.querySelector('#select-hCaja')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Gaviones$/i }));

    expect(container.querySelector('#input-mIntra')).toBeNull();
    expect(container.querySelector('#select-hCaja')).not.toBeNull();
    // El resultado sigue calculado (fila neutral de filas de cajas).
    expect(container.querySelector('[data-check-id="geom-filas"]')).not.toBeNull();
    expect(screen.getByText(/Resultados calculados/i)).toBeInTheDocument();
  });

  it('4 · los clones PDF de las tres vistas existen', () => {
    renderModule();
    for (const id of ['rockfill-wall-svg-pdf', 'rockfill-wall-svg-pdf-loads', 'rockfill-wall-svg-pdf-hiladas']) {
      const clone = document.getElementById(id);
      expect(clone, id).not.toBeNull();
      expect(clone!.querySelector('svg'), `${id} svg`).not.toBeNull();
    }
  });
});
