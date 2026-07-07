import { useEffect, useState } from "react";
import {
  formatNumber,
  getPrecision,
  parseQuantity,
} from "../../lib/units/format";
import type { Quantity } from "../../lib/units/types";
import { useUnitSystem } from "../../lib/units/useUnitSystem";

type RawNumberInputProps = {
  /**
   * Canonical value held in module state. When `quantity` is set this is SI and
   * the field converts to/from the active display system; when omitted the value
   * is shown and emitted verbatim (raw numbers, or values with a caller-side
   * conversion like mm↔m).
   */
  value: number;
  /** Receives the parsed value (SI when `quantity` is set, otherwise raw). */
  onChange: (value: number) => void;

  /** DOM id (for label `htmlFor`). */
  id?: string;
  /** Unit suffix shown to the right of the input. Empty string → no chip. */
  unit?: string;
  /** aria-label for the bare input. */
  ariaLabel?: string;

  /** Convert/format/parse against this catalog quantity. Omit for raw numbers. */
  quantity?: Quantity;
  /** Override display precision (quantity mode only). */
  precision?: number;
  /** Restrict to integers (parseInt / numeric inputMode). */
  integer?: boolean;

  min?: number;
  max?: number;
  step?: number;
  /**
   * Coerce into [min, max] on blur — emits the corrected value and reformats the
   * field. Opt-in: without it, min/max stay decorative DOM hints.
   */
  clamp?: boolean;

  /** Tailwind width utility for the input box (default `w-15`). */
  widthClass?: string;
};

/**
 * The single numeric-entry primitive: a `type="text"` input (+ optional unit
 * chip) that holds a local string while typing so the field can be emptied,
 * accepts a decimal comma, never reformats mid-keystroke, and restores/normalises
 * on blur. `UnitNumberInput` composes this with `InputLabel`; bespoke rows (e.g.
 * an input flanked by a badge) can use it directly.
 */
export function RawNumberInput({
  value,
  onChange,
  id,
  unit = "",
  ariaLabel,
  quantity,
  precision,
  integer = false,
  min,
  max,
  step,
  clamp = false,
  widthClass = "w-15",
}: RawNumberInputProps) {
  const { system } = useUnitSystem();

  // Coerce into [min, max]. Only invoked from blur when `clamp` is set, so the
  // value never gets snapped mid-typing (which would fight the user).
  const clampToRange = (n: number): number => {
    let c = n;
    if (min !== undefined) c = Math.max(min, c);
    if (max !== undefined) c = Math.min(max, c);
    return c;
  };

  const formatForInput = (val: number): string => {
    if (!Number.isFinite(val)) return "";
    if (integer) return String(Math.round(val));
    if (quantity) {
      const prec = precision ?? getPrecision(quantity, system);
      return formatNumber(val, quantity, system, prec);
    }
    return String(val);
  };

  const [localStr, setLocalStr] = useState(() => formatForInput(value));

  useEffect(() => {
    // Skip the reformat when localStr already represents `value` — otherwise
    // every keystroke round-trips through parent state and overwrites what the
    // user is typing with the formatted version (e.g. "3" → "3.00"), forcing
    // them to re-click between digits.
    let parsed: number | null;
    if (integer) {
      const n = parseInt(localStr, 10);
      parsed = isNaN(n) ? null : n;
    } else if (quantity) {
      parsed = parseQuantity(localStr, quantity, system);
    } else {
      const n = parseFloat(localStr.replace(",", "."));
      parsed = isNaN(n) ? null : n;
    }
    if (parsed !== null && Math.abs(parsed - value) < 1e-9) return;
    // Re-sincroniza el string mostrado cuando cambia el valor/unidad externo.
    // `formatForInput` (recreada cada render) y `localStr` se omiten a propósito:
    // este efecto SOLO debe re-sincronizar cuando cambia el valor/unidad EXTERNO.
    setLocalStr(formatForInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, system, quantity, integer, precision]);

  return (
    <div className="flex shrink-0">
      <input
        id={id}
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        value={localStr}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = integer
            ? e.target.value.replace(/[^0-9-]/g, "")
            : e.target.value;
          setLocalStr(raw);
          if (integer) {
            const n = parseInt(raw, 10);
            if (!isNaN(n)) onChange(n);
            return;
          }
          if (quantity) {
            const si = parseQuantity(raw, quantity, system);
            if (si !== null) onChange(si);
            return;
          }
          const normalized = raw.replace(",", ".");
          const n = parseFloat(normalized);
          if (!isNaN(n)) onChange(n);
        }}
        onBlur={() => {
          if (integer) {
            const n = parseInt(localStr, 10);
            if (isNaN(n)) { setLocalStr(formatForInput(value)); return; }
            const next = clamp ? clampToRange(Math.round(n)) : Math.round(n);
            if (clamp && next !== value) onChange(next);
            setLocalStr(String(next));
            return;
          }
          if (quantity) {
            const si = parseQuantity(localStr, quantity, system);
            if (si === null) { setLocalStr(formatForInput(value)); return; }
            const next = clamp ? clampToRange(si) : si;
            if (clamp && next !== value) onChange(next);
            setLocalStr(formatForInput(next));
            return;
          }
          const normalized = localStr.replace(",", ".");
          const n = parseFloat(normalized);
          if (isNaN(n)) { setLocalStr(formatForInput(value)); return; }
          if (clamp) {
            const next = clampToRange(n);
            if (next !== value) onChange(next);
            setLocalStr(formatForInput(next));
          }
        }}
        className={`${widthClass} text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
        aria-label={ariaLabel}
      />
      <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
        {unit}
      </span>
    </div>
  );
}
