// Hueco PASANTE (de forjado a forjado) en el panel de inputs de muros de fábrica.
//
// El tipo nuevo no añade fórmula: añade una forma de DECLARAR que el hueco
// ocupa toda la altura libre de la planta. Su contrato de UI es que el alto
// NO es editable y que el state nunca guarda un alto que contradiga a H —
// antes había que fingirlo con una puerta de altura H, que se quedaba
// obsoleta en cuanto se tocaba la altura de la planta. Estos tests lo fijan:
//   1. pasante seleccionado → sin campo "h", con el readout "alto = H".
//   2. puerta seleccionada  → sí tiene campo "h" (control de la asimetría).
//   3. cambiar el tipo a pasante normaliza y=0, h=H en el state.
//   4. cambiar H de la planta arrastra el alto del pasante (no hay fantasma).
//   5. el botón "+ Pasante" pide un hueco de ese tipo.

import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MasonryWallsInputs } from '../../../features/masonry-walls/MasonryWallsInputs';
import {
  blankMasonryState,
  calcularEdificio,
  type Hueco,
  type MasonryWallState,
  type PlantaResult,
} from '../../../lib/calculations/masonryWalls';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';

function stateConHueco(hueco: Hueco): MasonryWallState {
  const s = blankMasonryState(); // 1 planta, H = 3000, sin huecos
  return { ...s, plantas: [{ ...s.plantas[0], huecos: [hueco] }] };
}

function Harness({ initial, onState, onAddHueco }: {
  initial: MasonryWallState;
  onState: (s: MasonryWallState) => void;
  onAddHueco?: (plIdx: number, tipo: Hueco['tipo']) => void;
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
        selectedPlantaIdx={0} selectedHueco={state.plantas[0].huecos[0]?.id ?? null}
        setSelectedHueco={noop} setSelectedPlantaIdx={noop}
        plantasCalc={plantasCalc}
        onAddPlanta={noop} onRemovePlanta={noop}
        onAddHueco={onAddHueco ?? noop} onRemoveHueco={noop}
        onAddPuntual={noop} onRemovePuntual={noop}
      />
    </UnitSystemProvider>
  );
}

function renderWith(initial: MasonryWallState, onAddHueco?: (plIdx: number, tipo: Hueco['tipo']) => void) {
  let last = initial;
  const utils = render(
    <Harness initial={initial} onState={(s) => { last = s; }} onAddHueco={onAddHueco} />,
  );
  return { ...utils, getState: () => last };
}

/** Input de un NumField, localizado por el `sub` de su etiqueta (title=). */
function numInput(sub: string): HTMLInputElement {
  const labelSpan = screen.getByTitle(sub);
  const input = labelSpan.closest('div')?.parentElement?.querySelector('input');
  if (!input) throw new Error(`input del campo "${sub}" no encontrado`);
  return input as HTMLInputElement;
}

/** El <select> de tipo de hueco (el único con la opción "Pasante"). */
function tipoSelect(): HTMLSelectElement {
  const sel = screen.getAllByRole('combobox').find((s) => s.textContent?.includes('Pasante'));
  if (!sel) throw new Error('selector de tipo de hueco no encontrado');
  return sel as HTMLSelectElement;
}

const PASANTE: Hueco = { id: 'h1', x: 1000, y: 0, w: 900, h: 3000, tipo: 'pasante' };
const PUERTA: Hueco = { id: 'h1', x: 1000, y: 0, w: 900, h: 2100, tipo: 'puerta' };

describe('hueco pasante — panel de inputs', () => {
  it('pasante: sin campo de alto editable, con el readout "alto = H de la planta"', () => {
    renderWith(stateConHueco(PASANTE));
    expect(screen.getByText(/alto = H de la planta/)).toBeTruthy();
    expect(screen.getByText(/300\.0 cm/)).toBeTruthy();
    expect(screen.queryByTitle('alto (hasta dintel)')).toBeNull();
    // Tampoco el hint "h máx = H − y", que solo tiene sentido con h editable.
    expect(screen.queryByText(/h máx/)).toBeNull();
  });

  it('puerta: conserva su campo de alto (la asimetría es intencionada)', () => {
    renderWith(stateConHueco(PUERTA));
    expect(screen.getByTitle('alto (hasta dintel)')).toBeTruthy();
    expect(screen.queryByText(/alto = H de la planta/)).toBeNull();
  });

  it('cambiar el tipo a pasante normaliza y=0 y h=H en el state', () => {
    const ventana: Hueco = { id: 'h1', x: 1000, y: 900, w: 900, h: 1200, tipo: 'ventana' };
    const { getState } = renderWith(stateConHueco(ventana));
    fireEvent.change(tipoSelect(), { target: { value: 'pasante' } });
    expect(getState().plantas[0].huecos[0]).toMatchObject({ tipo: 'pasante', y: 0, h: 3000 });
  });

  it('cambiar H de la planta arrastra el alto del pasante (sin dato fantasma)', () => {
    const { getState } = renderWith(stateConHueco(PASANTE));
    fireEvent.change(numInput('altura libre'), { target: { value: '2.5' } });
    expect(getState().plantas[0].H).toBe(2500);
    expect(getState().plantas[0].huecos[0].h).toBe(2500);
  });

  it('cambiar H NO toca el alto de una puerta (ahí el alto es dato del usuario)', () => {
    const { getState } = renderWith(stateConHueco(PUERTA));
    fireEvent.change(numInput('altura libre'), { target: { value: '2.5' } });
    expect(getState().plantas[0].huecos[0].h).toBe(2100);
  });

  it('el botón "+ Pasante" pide un hueco de tipo pasante', () => {
    const onAddHueco = vi.fn();
    renderWith(blankMasonryState(), onAddHueco);
    fireEvent.click(screen.getByText('+ Pasante'));
    expect(onAddHueco).toHaveBeenCalledWith(0, 'pasante');
  });
});
