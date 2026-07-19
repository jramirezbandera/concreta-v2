// FEM 2D — commit-on-blur numeric field for the inspector.
//
// UnitNumberInput (via RawNumberInput) emits onChange on EVERY keystroke;
// wiring it straight to setModel would mint one history entry per key — the
// exact inconsistency the 1D InputsPanel has (NumField types → N undo steps)
// that this module deliberately avoids. This wrapper holds a local draft and
// commits once on blur/Enter: one gesture, one undo step.
//
// `resetKey` re-seeds the draft when the selection changes (or an undo lands):
// the field must show the NEW target's value, not the previous draft.

import { useState, type JSX } from 'react';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';
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
  integer?: boolean;
  /** Stacked layout (label on top, full-width input) — for narrow grid cells. */
  stacked?: boolean;
}

export function DraftNumberField({
  value, onCommit, resetKey, label, labelKey, sub, help, unit, quantity, min, max, integer, stacked,
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
        integer={integer}
        stacked={stacked}
      />
    </div>
  );
}
