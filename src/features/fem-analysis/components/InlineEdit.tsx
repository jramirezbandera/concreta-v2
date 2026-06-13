// FEM 1D — InlineEdit primitive
//
// A minimal click-to-edit input rendered inside the SVG canvas (or panel) for
// editing dimensions, load values, and similar single-number fields.
//
// Behavior (per design review Pass 2 spec):
//   - Display: shows the current value as Geist Mono text (matching DESIGN.md
//     numeric-value rule). Hover shows pointer cursor + subtle background to
//     advertise editability (Pass 3 discoverability).
//   - Activate: click on the value → switches to <input> mode, focused with
//     value pre-selected for fast overwrite.
//   - Commit: Enter or blur applies the new value (parsed as float).
//   - Cancel: Escape reverts to the original value.
//   - Recompute strategy (per eng-review Issue 7): commit happens on Enter
//     or blur, NOT on every keystroke. The parent re-runs solver only on
//     commit, avoiding jank during typing.
//
// Locale handling: accepts both '5.00' (period) and '5,00' (Spanish comma)
// via a tolerant parser. Rejects non-numeric input by reverting on commit.

import { useEffect, useRef, useState } from 'react';
import { fromDisplay, toDisplay } from '../../../lib/units/convert';
import { getPrecision, getUnitLabel } from '../../../lib/units/format';
import type { Quantity } from '../../../lib/units/types';
import { useUnitSystem } from '../../../lib/units/useUnitSystem';

interface Props {
  /** SIempre el valor canónico SI cuando `quantity` está set. Sin quantity,
   *  value pasa por la representación que decida el caller (geometría
   *  pre-escalada, etc.). */
  value: number;
  /** Decimals shown in display mode. Cuando `quantity` está set y no se
   *  fuerza decimals, se usa el del catálogo según el sistema activo. */
  decimals?: number;
  /** Min allowed value, IN SI cuando `quantity` está set. Se compara después
   *  de fromDisplay(parsed) para evitar bugs cuando el usuario teclea en
   *  técnico (kg/cm²) — bug C1 spec review. */
  min?: number;
  max?: number;
  /** Unit suffix mostrado en display mode. Si `quantity` está set, esta prop
   *  se ignora y el label viene del catálogo según el sistema activo. */
  unit?: string;
  /** Display class for the value text. Default: font-mono text-text-primary. */
  className?: string;
  /** When true, value is non-editable (read-only display). */
  disabled?: boolean;
  /** Called on commit. Devuelve el valor en SI cuando `quantity` está set. */
  onCommit: (next: number) => void;
  /** Optional aria-label for accessibility. */
  ariaLabel?: string;
  /** Cuando se pasa, InlineEdit hace auto-conversión SI↔técnico según el
   *  toggle global del usuario. El valor de entrada y salida es siempre SI;
   *  el display y el parse se hacen en el sistema activo. */
  quantity?: Quantity;
}

export function InlineEdit({
  value,
  decimals,
  min,
  max,
  unit,
  className,
  disabled,
  onCommit,
  ariaLabel,
  quantity,
}: Props) {
  const { system } = useUnitSystem();
  // Resolved unit label: si quantity está set, viene del catálogo según el
  // sistema activo. Si no, se respeta la prop `unit` legacy.
  const resolvedUnit = quantity ? getUnitLabel(quantity, system) : unit;
  // Resolved decimals: catálogo por sistema cuando quantity set; default 2.
  const resolvedDecimals = decimals ?? (quantity ? getPrecision(quantity, system) : 2);
  // Display value: SI value convertido al sistema activo cuando quantity set.
  const displayValue = quantity ? toDisplay(value, quantity, system) : value;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatDraft(displayValue, resolvedDecimals));
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Re-sync the draft when value, system or decimals change externally
  // (system toggle reformats display; solver result updates value; etc.) and
  // we are not editing — preservar what user is typing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-sync the draft from displayValue while the user is not actively editing
    if (!editing) setDraft(formatDraft(displayValue, resolvedDecimals));
  }, [displayValue, resolvedDecimals, editing]);

  function activate() {
    if (disabled) return;
    setEditing(true);
    // Focus + select on next tick once <input> mounts.
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }

  function commit() {
    const parsed = parseLocaleNumber(draft);
    if (parsed == null || !Number.isFinite(parsed)) {
      // Revert on invalid input.
      setDraft(formatDraft(displayValue, resolvedDecimals));
      setEditing(false);
      return;
    }
    // Cuando quantity set, el usuario teclea en el sistema activo (ej.
    // kg/cm²). Convertir a SI ANTES de comparar min/max — fix subagent C1.
    const parsedSi = quantity ? fromDisplay(parsed, quantity, system) : parsed;
    if (min != null && parsedSi < min) {
      setDraft(formatDraft(displayValue, resolvedDecimals));
      setEditing(false);
      return;
    }
    if (max != null && parsedSi > max) {
      setDraft(formatDraft(displayValue, resolvedDecimals));
      setEditing(false);
      return;
    }
    if (parsedSi !== value) onCommit(parsedSi);
    setEditing(false);
  }

  function cancel() {
    setDraft(formatDraft(displayValue, resolvedDecimals));
    setEditing(false);
  }

  if (editing) {
    return (
      <span
        className="inline-flex items-baseline gap-0.5"
        style={{
          background: 'var(--color-bg-elevated)',
          padding: '0 4px',
          borderRadius: 4,
          border: '1px solid var(--color-accent)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={commit}
          aria-label={ariaLabel}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            width: '5ch',
            textAlign: 'right',
            padding: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        {resolvedUnit && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--color-text-disabled)',
            }}
          >
            {resolvedUnit}
          </span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={activate}
      disabled={disabled}
      aria-label={ariaLabel ?? `Editar (actual: ${formatDraft(displayValue, resolvedDecimals)}${resolvedUnit ? ' ' + resolvedUnit : ''})`}
      className={className}
      style={{
        background: 'transparent',
        border: 'none',
        padding: '0 2px',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--color-text-primary)',
        fontVariantNumeric: 'tabular-nums',
        borderRadius: 4,
        transition: 'background-color 120ms',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--color-bg-elevated)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {formatDraft(displayValue, resolvedDecimals)}
      {resolvedUnit && (
        <span
          style={{
            marginLeft: 2,
            fontSize: 10,
            color: 'var(--color-text-disabled)',
          }}
        >
          {resolvedUnit}
        </span>
      )}
    </button>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDraft(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(decimals);
}

/**
 * Parse a number string accepting both decimal separators ('5.00' or '5,00').
 * Returns null when the input cannot be interpreted as a single number.
 */
function parseLocaleNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept comma as decimal separator (Spanish/EU). If the string contains
  // both '.' and ',', assume the LAST one is the decimal sep.
  const lastDot = trimmed.lastIndexOf('.');
  const lastComma = trimmed.lastIndexOf(',');
  let normalized = trimmed;
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) {
      // '1.234,56' → '1234.56'
      normalized = trimmed.replace(/\./g, '').replace(',', '.');
    } else {
      // '1,234.56' → '1234.56'
      normalized = trimmed.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    normalized = trimmed.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
