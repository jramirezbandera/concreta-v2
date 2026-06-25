import { useEffect, useState } from "react";
import { LABELS, type LabelKey } from "../../lib/text/labels";
import { InputLabel } from "../ui/InputLabel";
import {
  formatNumber,
  getPrecision,
  getUnitLabel,
  parseQuantity,
} from "../../lib/units/format";
import type { Quantity } from "../../lib/units/types";
import { useUnitSystem } from "../../lib/units/useUnitSystem";

type UnitNumberInputProps = {
  /**
   * Canonical SI value held in module state. Always SI when `quantity` is set.
   * When `quantity` is omitted, the value is passed through unchanged (used for
   * dimensionless integers like number of bars / layers).
   */
  value: number;
  /** Receives the SI value (or raw value when `quantity` is omitted). */
  onChange: (value: number) => void;

  /** Optional explicit DOM id; falls back to `input-${field}` when `field` is set. */
  id?: string;
  /** Legacy field-name identifier used as input id when no `id` is supplied. */
  field?: string;

  /**
   * Pulls label/sub/unit from the `LABELS` catalog. The catalog `unit` is
   * treated as the SI label only — when `quantity` is also provided, the unit
   * suffix comes from the live unit system instead of the catalog string.
   */
  labelKey?: LabelKey;
  /** Override the resolved label (escape hatch for one-off fields). */
  label?: string;
  /** Override the resolved sub (descShort). */
  sub?: string;
  /**
   * Help text → renders the ⓘ tooltip next to the label. Overrides
   * `LABELS[labelKey].help` (catalog default). Omit for no tooltip.
   */
  help?: string;
  /** Override the unit suffix shown to the right of the input. */
  unit?: string;

  /**
   * When set, the input auto-converts between SI (state) and the user's
   * display system. When omitted, the value is shown verbatim and `unit` /
   * the catalog's `unit` is used as the suffix.
   */
  quantity?: Quantity;
  /** Override default precision for the display value. */
  precision?: number;

  /** Restrict to integers (parseInt / numeric inputMode). */
  integer?: boolean;
  /** Min value. DOM hint always; enforced on blur only when `clamp` is set. */
  min?: number;
  /** Max value. DOM hint always; enforced on blur only when `clamp` is set. */
  max?: number;
  /** Step value (DOM hint only). */
  step?: number;
  /**
   * Coerce the value into [min, max] on blur — emits the corrected value via
   * onChange and reformats the field so what's shown is what's used. Opt-in:
   * without it, min/max stay decorative DOM hints (the historical behavior).
   * Use for bounded knobs like the search-mesh fields (dovelas / círculos).
   */
  clamp?: boolean;
};

export function UnitNumberInput({
  value,
  onChange,
  id,
  field,
  labelKey,
  label,
  sub,
  help,
  unit,
  quantity,
  precision,
  integer = false,
  min,
  max,
  step,
  clamp = false,
}: UnitNumberInputProps) {
  const { system } = useUnitSystem();

  // Coerce into [min, max]. Only invoked from blur when `clamp` is set, so the
  // value never gets snapped mid-typing (which would fight the user).
  const clampToRange = (n: number): number => {
    let c = n;
    if (min !== undefined) c = Math.max(min, c);
    if (max !== undefined) c = Math.min(max, c);
    return c;
  };

  const resolvedLabel = labelKey ? LABELS[labelKey].sym : (label ?? "");
  const resolvedUnit = quantity
    ? getUnitLabel(quantity, system)
    : (labelKey ? LABELS[labelKey].unit : (unit ?? ""));
  const unitText = resolvedUnit === "—" ? "" : resolvedUnit;

  const formatForInput = (siValue: number): string => {
    if (!Number.isFinite(siValue)) return "";
    if (integer) return String(Math.round(siValue));
    if (quantity) {
      const prec = precision ?? getPrecision(quantity, system);
      return formatNumber(siValue, quantity, system, prec);
    }
    return String(siValue);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-sync the input string when the external value/unit changes
    setLocalStr(formatForInput(value));
  }, [value, system, quantity, integer, precision]);

  const inputId = id ?? (field ? `input-${field}` : undefined);

  return (
    <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
      {/* Label delegado a InputLabel (único primitivo catalog-aware): resuelve
          sym/descShort/help/ref del catálogo y pinta el icono ⓘ cuando hay help.
          Un `label` explícito es override → no se pasa labelKey para que gane. */}
      <InputLabel
        htmlFor={inputId}
        labelKey={label !== undefined ? undefined : labelKey}
        label={label}
        sub={label !== undefined ? sub : undefined}
        help={help}
      />
      <div className="flex shrink-0">
        <input
          id={inputId}
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
          className="w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={`${resolvedLabel} (${unitText})`}
        />
        <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
          {unitText}
        </span>
      </div>
    </div>
  );
}
