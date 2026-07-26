// FEM 1D — panel de datos tras la homogeneización con el FEM 2D.
//
// Lo que fija este test es la DECISIÓN, no el pixel: el recuento del modelo va
// en una línea, el peso propio dice su ESTADO en palabras, la fila de carga es
// un <button> nativo con papelera, y —lo importante— editar un número acuña UN
// solo cambio de modelo por gesto, no uno por tecla.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { InputsPanel } from '../../features/fem-analysis/InputsPanel';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import type { DesignModel, Selected, SolveResult } from '../../features/fem-analysis/types';

const model: DesignModel = {
  presetCode: 'custom',
  selfWeight: true,
  nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 5, y: 0 }],
  bars: [],
  supports: [{ node: 'n1', type: 'pinned' }],
  loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 15, dir: '-y' }],
};

const result: SolveResult = {
  reactions: [], errors: [], perBar: {}, maxEta: 0, status: 'pending',
};

function renderPanel(selected: Selected = null) {
  const calls: DesignModel[] = [];
  let current = model;
  const setModel = (u: (m: DesignModel) => DesignModel) => {
    current = u(current);
    calls.push(current);
  };
  const view = render(
    <UnitSystemProvider>
      <InputsPanel
        model={model}
        setModel={setModel}
        selected={selected}
        setSelected={() => {}}
        result={result}
        activeSection="vano"
        setActiveSection={() => {}}
      />
    </UnitSystemProvider>,
  );
  return { calls, view };
}

afterEach(cleanup);

describe('FEM 1D — tarjeta del modelo y peso propio', () => {
  it('el recuento va en UNA línea, no en cuatro filas', () => {
    renderPanel();
    expect(screen.getByText('2 nudos · 0 barras · 1 apoyos · 1 cargas')).toBeInTheDocument();
    // Las cuatro filas «Barras / Nodos / Apoyos / Cargas» ya no existen: el
    // rótulo «Cargas» que queda es el de la sección, con su recuento.
    expect(screen.queryByText('Barras')).toBeNull();
    expect(screen.queryByText('Nodos')).toBeNull();
  });

  it('el peso propio dice su estado en palabras y lleva aria-pressed', () => {
    const { calls } = renderPanel();
    // Antes era un botón «ON»/«OFF»: decía el interruptor, no el estado.
    const chip = screen.getByRole('button', { name: 'Incluido' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(calls[0].selfWeight).toBe(false);
  });
});

describe('FEM 1D — fila de carga', () => {
  it('es un botón nativo y borra con la papelera sin seleccionar la carga', () => {
    const { calls } = renderPanel();
    // Antes era un `div role="button"` con onKeyDown a mano.
    const row = screen.getByRole('button', { name: /barra b1/ });
    expect(row.tagName).toBe('BUTTON');
    fireEvent.click(screen.getByRole('button', { name: 'Borrar l1' }));
    expect(calls[0].loads).toHaveLength(0);
  });
});

describe('FEM 1D — un gesto, un cambio de modelo', () => {
  it('teclear en un campo NO acuña un cambio por tecla; comitea al salir', () => {
    const { calls } = renderPanel({ kind: 'load', id: 'l1' });
    const input = screen.getByLabelText(/^q /) as HTMLInputElement;
    expect(input.value).toBe('15.00');

    // Cuatro pulsaciones. Con el NumField anterior esto eran cuatro setModel
    // seguidos y, con historial detrás, cuatro pasos de undo para deshacer un
    // solo número.
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.change(input, { target: { value: '22' } });
    fireEvent.change(input, { target: { value: '22.' } });
    fireEvent.change(input, { target: { value: '22.5' } });
    expect(calls).toHaveLength(0);

    fireEvent.blur(input);
    expect(calls).toHaveLength(1);
    expect(calls[0].loads[0]).toMatchObject({ id: 'l1', w: 22.5 });
  });
});
