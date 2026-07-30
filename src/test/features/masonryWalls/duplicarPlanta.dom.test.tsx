// Botón "Duplicar <planta>" en el panel de inputs de muros de fábrica.
//
// La duplicación en sí es una función pura del motor (`insertPlantaDuplicada`,
// testada en calc/masonryWalls.test.ts). Lo que estos tests fijan es el
// contrato de la UI, que es donde puede volver a romperse:
//   1. el botón NOMBRA la planta que va a copiar — actúa sobre la SELECCIÓN,
//      no sobre una fila concreta de la lista, así que sin el nombre el usuario
//      no sabría qué se copia.
//   2. el nombre sigue a la selección (Planta 1 → Cubierta).
//   3. al pulsar, pide duplicar el índice SELECCIONADO (no el 0 fijo).

import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MasonryWallsInputs } from '../../../features/masonry-walls/MasonryWallsInputs';
import {
  calcularEdificio,
  defaultMasonryState,
  type MasonryWallState,
  type PlantaResult,
} from '../../../lib/calculations/masonryWalls';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';

function Harness({ initial, selectedPlantaIdx, onDuplicatePlanta }: {
  initial: MasonryWallState;
  selectedPlantaIdx: number;
  onDuplicatePlanta: (i: number) => void;
}) {
  const [state, setState] = useState(initial);
  const r = calcularEdificio(state);
  const plantasCalc: PlantaResult[] = r.invalid ? [] : r.plantas;
  const noop = () => {};
  return (
    <UnitSystemProvider>
      <MasonryWallsInputs
        state={state} setState={setState}
        selectedPlantaIdx={selectedPlantaIdx} selectedHueco={null}
        setSelectedHueco={noop} setSelectedPlantaIdx={noop}
        plantasCalc={plantasCalc}
        onAddPlanta={noop} onDuplicatePlanta={onDuplicatePlanta} onRemovePlanta={noop}
        onAddHueco={noop} onRemoveHueco={noop}
        onAddPuntual={noop} onRemovePuntual={noop}
      />
    </UnitSystemProvider>
  );
}

/** Edificio de ejemplo: [Planta 1, Planta 2, Planta 3, Cubierta]. */
function renderWith(selectedPlantaIdx: number) {
  const onDuplicatePlanta = vi.fn();
  render(
    <Harness
      initial={defaultMasonryState()}
      selectedPlantaIdx={selectedPlantaIdx}
      onDuplicatePlanta={onDuplicatePlanta}
    />,
  );
  return { onDuplicatePlanta };
}

describe('duplicar planta — panel de inputs', () => {
  it('el botón nombra la planta seleccionada', () => {
    renderWith(0);
    expect(screen.getByText('Duplicar Planta 1')).toBeTruthy();
    // Y sigue estando el de planta nueva vacía: son dos acciones distintas.
    expect(screen.getByText('+ Añadir planta')).toBeTruthy();
  });

  it('el nombre del botón sigue a la selección', () => {
    renderWith(3); // Cubierta
    expect(screen.getByText('Duplicar Cubierta')).toBeTruthy();
    expect(screen.queryByText('Duplicar Planta 1')).toBeNull();
  });

  it('pulsar pide duplicar el índice SELECCIONADO', () => {
    const { onDuplicatePlanta } = renderWith(2); // Planta 3
    fireEvent.click(screen.getByText('Duplicar Planta 3'));
    expect(onDuplicatePlanta).toHaveBeenCalledTimes(1);
    expect(onDuplicatePlanta).toHaveBeenCalledWith(2);
  });
});
