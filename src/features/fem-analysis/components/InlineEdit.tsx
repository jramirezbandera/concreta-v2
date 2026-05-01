// FEM 2D — InlineEdit primitive
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

interface Props {
  value: number;
  /** Decimals shown in display mode; stored value is full precision. */
  decimals?: number;
  /** Min allowed value. Values below revert. */
  min?: number;
  /** Max allowed value. Values above revert. */
  max?: number;
  /** Optional unit suffix shown after the value in display mode (e.g. 'm', 'kN/m'). */
  unit?: string;
  /** Display class for the value text. Default: font-mono text-text-primary. */
  className?: string;
  /** When true, value is non-editable (read-only display). */
  disabled?: boolean;
  /** Called on commit. */
  onCommit: (next: number) => void;
  /** Optional aria-label for accessibility. */
  ariaLabel?: string;
}

export function InlineEdit({
  value,
  decimals = 2,
  min,
  max,
  unit,
  className,
  disabled,
  onCommit,
  ariaLabel,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatDraft(value, decimals));
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Re-sync the draft when value changes externally (e.g. solver result
  // updates a derived value via a different path) and we are not editing.
  useEffect(() => {
    if (!editing) setDraft(formatDraft(value, decimals));
  }, [value, decimals, editing]);

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
      setDraft(formatDraft(value, decimals));
      setEditing(false);
      return;
    }
    if (min != null && parsed < min) {
      setDraft(formatDraft(value, decimals));
      setEditing(false);
      return;
    }
    if (max != null && parsed > max) {
      setDraft(formatDraft(value, decimals));
      setEditing(false);
      return;
    }
    if (parsed !== value) onCommit(parsed);
    setEditing(false);
  }

  function cancel() {
    setDraft(formatDraft(value, decimals));
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
        {unit && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--color-text-disabled)',
            }}
          >
            {unit}
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
      aria-label={ariaLabel ?? `Editar (actual: ${formatDraft(value, decimals)}${unit ? ' ' + unit : ''})`}
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
      {formatDraft(value, decimals)}
      {unit && (
        <span
          style={{
            marginLeft: 2,
            fontSize: 10,
            color: 'var(--color-text-disabled)',
          }}
        >
          {unit}
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
