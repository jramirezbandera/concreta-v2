// Campo numérico que comitea al perder el foco.
//
// UnitNumberInput (vía RawNumberInput) emite onChange en CADA pulsación;
// cableado directo a un setModel con historial, eso acuña una entrada de undo
// por tecla — teclear «12.5» dejaba cuatro pasos que deshacer. Este envoltorio
// guarda un borrador local y comitea una sola vez al salir del campo o con
// Enter: un gesto, un paso de undo.
//
// Nació en el editor del FEM 2D; el FEM 1D lo adoptó al homogeneizar los dos
// módulos (era justo el módulo con el bug que este componente describe).
//
// `resetKey` re-seeds the draft when the selection changes (or an undo lands):
// the field must show the NEW target's value, not the previous draft.

import { useState, type JSX } from 'react';
import { UnitNumberInput } from './UnitNumberInput';
import type { Quantity } from '../../lib/units/types';

interface Props {
  /** Canonical SI value from the model. */
  value: number;
  /** Called ONCE per gesture (blur/Enter) when the draft differs. */
  onCommit: (next: number) => void;
  /** Re-seed the draft when this changes (selection id + field name). */
  resetKey: string;
  label?: string;
  labelKey?: Parameters<typeof UnitNumberInput>[0]['labelKey'];
  sub?: string;
  help?: string;
  unit?: string;
  quantity?: Quantity;
  min?: number;
  max?: number;
  /** Permite teclear negativos (cargas con dirección: Fx/Fy/w). */
  allowNegative?: boolean;
  integer?: boolean;
  /** Stacked layout (label on top, full-width input) — for narrow grid cells. */
  stacked?: boolean;
}

export function DraftNumberField({
  value, onCommit, resetKey, label, labelKey, sub, help, unit, quantity, min, max, allowNegative, integer, stacked,
}: Props): JSX.Element {
  const [draft, setDraft] = useState(value);
  const [seededFor, setSeededFor] = useState(resetKey);
  const [lastValue, setLastValue] = useState(value);

  // Adjust-state-during-render: reseed on selection change OR when the model
  // value moves under us (undo/redo, another field's side effect).
  if (seededFor !== resetKey || lastValue !== value) {
    setSeededFor(resetKey);
    setLastValue(value);
    setDraft(value);
  }

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <div
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLElement).blur?.();
      }}
    >
      <UnitNumberInput
        value={draft}
        onChange={setDraft}
        label={label}
        labelKey={labelKey}
        sub={sub}
        help={help}
        unit={unit}
        quantity={quantity}
        min={min}
        max={max}
        allowNegative={allowNegative}
        integer={integer}
        stacked={stacked}
      />
    </div>
  );
}
