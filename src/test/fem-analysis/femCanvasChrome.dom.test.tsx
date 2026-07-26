// FEM 1D — cromo del lienzo tras la homogeneización con el FEM 2D.
//
// Lo que fija este test es la DECISIÓN, no el pixel: la barra de vistas es
// anclada y sus pestañas EXCLUSIVAS (antes eran capas conmutables flotando
// sobre el lienzo, con un estado «ninguna capa» que ya no existe), la paleta
// solo aparece donde se puede editar, y el lienzo tiene cámara.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { FemAnalysisModule } from '../../features/fem-analysis';
import { cloneDesignPreset } from '../../features/fem-analysis/presets';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

const STORAGE_KEY = 'concreta-fem-2d-design';

/** Escritorio: matchMedia de useIsMobile responde false. */
function installDesktopMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const renderModule = () =>
  render(
    <MemoryRouter>
      <UnitSystemProvider>
        <FemAnalysisModule />
      </UnitSystemProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  installDesktopMatchMedia();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cloneDesignPreset('continuous')));
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('FEM 1D — barra de vistas anclada', () => {
  it('pinta las 6 pestañas y arranca en «Modelo»', () => {
    renderModule();
    for (const label of ['Modelo', 'M', 'V', 'R', 'δ', 'η%']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Modelo' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('las pestañas son EXCLUSIVAS: no hay estado «ninguna capa»', () => {
    // El control anterior conmutaba: volver a pulsar la capa activa la apagaba.
    // Con pestañas, pulsar la activa la deja activa — siempre hay una vista.
    renderModule();
    const m = screen.getByRole('button', { name: 'M' });
    fireEvent.click(m);
    expect(m).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Modelo' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(m);
    expect(m).toHaveAttribute('aria-pressed', 'true');
  });

  it('la paleta de herramientas solo existe en la pestaña «Modelo»', () => {
    renderModule();
    expect(screen.getByRole('button', { name: 'Añadir nodo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'V' }));
    expect(screen.queryByRole('button', { name: 'Añadir nodo' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Modelo' }));
    expect(screen.getByRole('button', { name: 'Añadir nodo' })).toBeInTheDocument();
  });

  it('el selector de combinación no se oculta con la vista (alimenta las reacciones)', () => {
    // Diferencia deliberada con el 2D, que lo esconde en «Modelo»: aquí la
    // envolvente manda también sobre el panel derecho, visible en toda pestaña.
    renderModule();
    const combo = screen.getByLabelText('Combinación visual');
    expect(combo).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Modelo' }));
    expect(screen.getByLabelText('Combinación visual')).toBe(combo);
  });
});

/** Valor armado dentro del panel de cargas (el label lleva el sub pegado). */
const loadValue = () =>
  (document.querySelector('.tool-load-menu input') as HTMLInputElement | null)?.value;

describe('FEM 1D — familia de cargas en la paleta', () => {
  it('las dos herramientas de carga viven bajo un solo botón «Cargas»', () => {
    renderModule();
    // Antes eran dos botones sueltos en la paleta; ahora es la familia del 2D.
    expect(screen.queryByRole('button', { name: 'Carga distribuida' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Carga puntual' })).toBeNull();
    const cargas = screen.getByRole('button', { name: 'Cargas' });
    expect(cargas).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(cargas);
    expect(cargas).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('radio', { name: /Distribuida/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Puntual/ })).toBeInTheDocument();
  });

  it('la carga se ARMA antes de colocarla: valor, hipótesis y categoría', () => {
    renderModule();
    fireEvent.click(screen.getByRole('button', { name: 'Cargas' }));
    // Arranca con el valor que el lienzo ponía a fuego (15 kN/m en la UDL).
    expect(loadValue()).toBe('15.00');
    // La categoría de uso solo aparece cuando la hipótesis es variable.
    expect(screen.queryByLabelText('Categoría')).toBeNull();
    fireEvent.change(screen.getByLabelText('Hipótesis'), { target: { value: 'Q' } });
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument();
  });

  it('cambiar de tipo cambia la unidad del valor (kN/m ⇄ kN)', () => {
    renderModule();
    fireEvent.click(screen.getByRole('button', { name: 'Cargas' }));
    expect(screen.getByText('por metro de barra')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Puntual/ }));
    expect(screen.queryByText('por metro de barra')).toBeNull();
    expect(loadValue()).toBe('10.00');
  });
});

describe('FEM 1D — cámara del lienzo', () => {
  it('monta el grupo de zoom compartido, en autofit y con − deshabilitado', () => {
    renderModule();
    expect(screen.getByRole('group', { name: 'Zoom del lienzo' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Reencuadrar — zoom actual/)).toHaveTextContent('100 %');
    // A k=1 alejar y encuadrar no tienen sentido; acercar sí.
    expect(screen.getByLabelText('Alejar')).toBeDisabled();
    expect(screen.getByLabelText('Encuadrar')).toBeDisabled();
    expect(screen.getByLabelText('Acercar')).toBeEnabled();
  });

  it('acercar sube el zoom y habilita alejar y encuadrar', async () => {
    renderModule();
    fireEvent.click(screen.getByLabelText('Acercar'));
    // El salto discreto se interpola por rAF; basta con que el estado avance.
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.getByLabelText('Alejar')).toBeEnabled();
    expect(screen.getByLabelText('Encuadrar')).toBeEnabled();
    expect(screen.getByLabelText(/Reencuadrar — zoom actual/)).not.toHaveTextContent('100 %');
  });
});
