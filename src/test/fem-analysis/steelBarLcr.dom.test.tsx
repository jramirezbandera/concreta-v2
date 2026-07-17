// FEM 1D — Lcr manual en el panel de barra de acero (bug 2026-07-17).
//
// El wrapper SteelBarInputs descartaba las ediciones de Lcr a propósito
// (`onLcrChange` vacío, `lcrIsAuto` fijo): el usuario tecleaba una Lcr, el
// campo volvía a "auto" al reseleccionar la barra y el cálculo nunca la usaba
// — aunque el modelo de datos (SteelSelection.Lcr, en METROS) y el motor
// (adaptSteelBar ×1000 → calcSteelBeam) la soportan desde el principio. Mismo
// patrón que el beamType invisible de timber-beams (ola 1) y la luz de la
// variante maciza de forjados (ola 2): el motor consume lo que la UI no deja
// escribir.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SteelBarInputs } from '../../features/fem-analysis/embedded/SteelBarInputs';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import type { DesignBar, DesignModel, SteelSelection } from '../../features/fem-analysis/types';

const SEL: SteelSelection = {
  profileKey: 'steel_IPE240', steel: 'S275', beamType: 'ss',
  deflLimit: 300, elsCombo: 'characteristic', useCategory: 'B',
};

function mkModel(lcr?: number): DesignModel {
  const bar: DesignBar = {
    id: 'b1', i: 'n1', j: 'n2', material: 'steel',
    steelSelection: lcr !== undefined ? { ...SEL, Lcr: lcr } : { ...SEL },
    internalHinges: { i: false, j: false },
  };
  return {
    presetCode: 'custom', selfWeight: true,
    nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 6, y: 0 }],
    bars: [bar],
    supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
    loads: [],
  };
}

function renderPanel(model: DesignModel, setModel: (u: (m: DesignModel) => DesignModel) => void) {
  return render(
    <UnitSystemProvider>
      <SteelBarInputs
        bar={model.bars[0]}
        setModel={setModel}
        barResult={undefined}
        L_mm={6000}
        barLoads={[]}
      />
    </UnitSystemProvider>,
  );
}

function lcrInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('#sb-input-Lcr');
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

describe('FEM SteelBarInputs — Lcr manual', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('sin override muestra la luz de la barra con badge "auto"', () => {
    const model = mkModel();
    const { container } = renderPanel(model, () => {});
    expect(lcrInput(container).value).toBe('6');
    expect(screen.getByLabelText('Lcr calculado automáticamente')).toBeTruthy();
  });

  it('editar Lcr escribe SteelSelection.Lcr en METROS y persiste en el modelo', async () => {
    let model = mkModel();
    const setModel = (u: (m: DesignModel) => DesignModel) => { model = u(model); };
    const { container } = renderPanel(model, setModel);

    const user = userEvent.setup();
    const input = lcrInput(container);
    await user.clear(input);
    await user.type(input, '3');

    expect(model.bars[0].steelSelection?.Lcr).toBe(3); // metros, no mm
  });

  it('al re-renderizar con el override, el campo muestra la Lcr manual y el badge cambia', () => {
    const model = mkModel(3);
    const { container } = renderPanel(model, () => {});
    expect(lcrInput(container).value).toBe('3');
    expect(screen.getByLabelText('Lcr manual')).toBeTruthy();
  });

  it('volver a teclear la luz (±5 mm) borra el override y vuelve a auto', async () => {
    let model = mkModel(3);
    const setModel = (u: (m: DesignModel) => DesignModel) => { model = u(model); };
    const { container } = renderPanel(model, setModel);

    const user = userEvent.setup();
    const input = lcrInput(container);
    await user.clear(input);
    await user.type(input, '6');

    expect(model.bars[0].steelSelection?.Lcr).toBeUndefined();
  });
});
