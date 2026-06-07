// PunchingInputsPanel — DOM test del campo "Longitud brazo" con auto-fill.
//
// Comportamiento (patrón steel-beams Lcr): en auto el campo muestra el valor
// calculado y el badge "auto" está activo (deshabilitado); editar el input
// dispara onArmLengthChange; en manual, click en el badge dispara onArmLengthAuto.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PunchingInputsPanel } from '../../../features/punching/PunchingInputs';
import { punchingDefaults, type PunchingInputs } from '../../../data/defaults';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';

function renderCruceta(over: Partial<PunchingInputs> = {}, props: {
  armLengthDisplay?: number; armLengthAuto?: boolean;
} = {}) {
  const setField = vi.fn();
  const onArmLengthChange = vi.fn();
  const onArmLengthAuto = vi.fn();
  const r = render(
    <UnitSystemProvider>
      <PunchingInputsPanel
        state={{ ...punchingDefaults, mode: 'pilar-cruceta', ...over }}
        setField={setField}
        armLengthDisplay={props.armLengthDisplay ?? 289}
        armLengthAuto={props.armLengthAuto ?? true}
        onArmLengthChange={onArmLengthChange}
        onArmLengthAuto={onArmLengthAuto}
      />
    </UnitSystemProvider>,
  );
  return { ...r, setField, onArmLengthChange, onArmLengthAuto };
}

describe('PunchingInputs — campo Longitud brazo (auto-fill)', () => {
  it('en auto: el input muestra el L_eff,máx calculado y el badge está activo', () => {
    const { getByLabelText } = renderCruceta({}, { armLengthDisplay: 289, armLengthAuto: true });
    const input = getByLabelText('Longitud del brazo (mm)') as HTMLInputElement;
    expect(input.value).toBe('289');
    const badge = getByLabelText('Longitud calculada automáticamente') as HTMLButtonElement;
    expect(badge.disabled).toBe(true); // en auto no se puede re-click
  });

  it('editar el input dispara onArmLengthChange con el valor redondeado', () => {
    const { getByLabelText, onArmLengthChange } = renderCruceta();
    const input = getByLabelText('Longitud del brazo (mm)');
    fireEvent.change(input, { target: { value: '350' } });
    expect(onArmLengthChange).toHaveBeenCalledWith(350);
  });

  it('en manual: click en el badge "auto" dispara onArmLengthAuto', () => {
    const { getByLabelText, onArmLengthAuto } = renderCruceta({}, { armLengthDisplay: 350, armLengthAuto: false });
    const badge = getByLabelText('Volver a auto');
    fireEvent.click(badge);
    expect(onArmLengthAuto).toHaveBeenCalledTimes(1);
  });

  it('en manual el campo muestra el valor manual (no el auto)', () => {
    const { getByLabelText } = renderCruceta({}, { armLengthDisplay: 350, armLengthAuto: false });
    const input = getByLabelText('Longitud del brazo (mm)') as HTMLInputElement;
    expect(input.value).toBe('350');
  });
});
