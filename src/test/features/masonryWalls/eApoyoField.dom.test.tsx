// e_apoyo auto ⇄ manual en el panel de inputs de muros de fábrica.
//
// El campo se rediseñó (patrón BetaField de punzonamiento) SIN tocar el
// schema: el centinela del motor e_apoyo ≤ 0 significa "auto" (derivar
// t/2 − a/3, §5.2.3) y el toggle solo escribe 0 (auto) o siembra el valor
// derivado (manual). Estos tests fijan ese contrato de UI:
//   1. blank state (e_apoyo=0) → modo auto, readout con el derivado vivo.
//   2. activar manual → siembra exactamente eApoyoForjado(t, a) en el state.
//   3. desactivar manual → escribe 0 (vuelve al centinela, no borra `a`).
//   4. e_apoyo ≥ t/2 en manual → aviso "fuera de la sección".
//   5. en auto, cambiar t recalcula el readout (el bug original: un valor
//      tecleado para un espesor se quedaba congelado al cambiar t).

import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MasonryWallsInputs } from '../../../features/masonry-walls/MasonryWallsInputs';
import {
  blankMasonryState,
  calcularEdificio,
  eApoyoForjado,
  type MasonryWallState,
  type PlantaResult,
} from '../../../lib/calculations/masonryWalls';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';

/** Harness con useState real: los asserts sobre el state leen el efecto neto
 *  de los updaters funcionales que dispara el panel. */
function Harness({ initial, onState }: {
  initial: MasonryWallState;
  onState: (s: MasonryWallState) => void;
}) {
  const [state, setStateRaw] = useState(initial);
  const setState: React.Dispatch<React.SetStateAction<MasonryWallState>> = (action) => {
    setStateRaw((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      onState(next);
      return next;
    });
  };
  const r = calcularEdificio(state);
  const plantasCalc: PlantaResult[] = r.invalid ? [] : r.plantas;
  const noop = () => {};
  return (
    <UnitSystemProvider>
      <MasonryWallsInputs
        state={state} setState={setState}
        selectedPlantaIdx={0} selectedHueco={null}
        setSelectedHueco={noop} setSelectedPlantaIdx={noop}
        plantasCalc={plantasCalc}
        onAddPlanta={noop} onRemovePlanta={noop}
        onAddHueco={noop} onRemoveHueco={noop}
        onAddPuntual={noop} onRemovePuntual={noop}
      />
    </UnitSystemProvider>
  );
}

function renderWith(initial: MasonryWallState) {
  let last = initial;
  const utils = render(<Harness initial={initial} onState={(s) => { last = s; }} />);
  return { ...utils, getState: () => last };
}

const toggleBtn = () => {
  // El botón Activo/Inactivo vive en la fila "e_apoyo · manual".
  const btn = screen.getAllByRole('button').find(
    (b) => b.textContent === 'Activo' || b.textContent === 'Inactivo',
  );
  if (!btn) throw new Error('toggle e_apoyo no encontrado');
  return btn;
};

describe('EApoyoField — modo auto ⇄ manual', () => {
  it('blank state (e_apoyo=0) arranca en auto con el derivado t/2 − a/3 visible', () => {
    renderWith(blankMasonryState()); // t=240, a=180 → 240/2 − 180/3 = 60 mm
    expect(toggleBtn().textContent).toBe('Inactivo');
    // La fórmula aparece en el readout Y en la glosa; basta con que exista.
    expect(screen.getAllByText(/e_apoyo = t\/2 − a\/3/).length).toBeGreaterThan(0);
    // getAll: e_cabeza/e_pie son ahora filas ReadoutRow propias y pueden
    // coincidir numéricamente con el derivado — basta con que esté visible.
    expect(screen.getAllByText('6.0 cm').length).toBeGreaterThan(0);
  });

  it('activar manual siembra exactamente eApoyoForjado(t, a) en el state', () => {
    const initial = blankMasonryState();
    const { getState } = renderWith(initial);
    fireEvent.click(toggleBtn());
    expect(getState().plantas[0].e_apoyo).toBe(eApoyoForjado(initial.t, initial.plantas[0].a_apoyo));
    expect(toggleBtn().textContent).toBe('Activo');
  });

  it('desactivar manual escribe el centinela 0 y conserva a_apoyo', () => {
    const initial = blankMasonryState();
    initial.plantas[0].e_apoyo = 60;
    const { getState } = renderWith(initial);
    expect(toggleBtn().textContent).toBe('Activo');
    fireEvent.click(toggleBtn());
    expect(getState().plantas[0].e_apoyo).toBe(0);
    expect(getState().plantas[0].a_apoyo).toBe(180);
  });

  it('e_apoyo ≥ t/2 en manual pinta el aviso de resultante fuera de la sección', () => {
    const initial = blankMasonryState(); // t=240 → t/2 = 120 mm
    initial.plantas[0].e_apoyo = 130;
    renderWith(initial);
    expect(screen.getByText(/fuera de la sección/)).toBeTruthy();
  });

  it('en auto, cambiar t recalcula el derivado (nada se queda congelado)', () => {
    const initial = blankMasonryState();
    initial.t = 480; // 480/2 − 180/3 = 180 mm = 18.0 cm
    renderWith(initial);
    expect(screen.getAllByText('18.0 cm').length).toBeGreaterThan(0);
  });
});
