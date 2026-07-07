import { LABELS, type LabelKey } from "../../lib/text/labels";
import { InputLabel } from "../ui/InputLabel";
import { getUnitLabel } from "../../lib/units/format";
import type { Quantity } from "../../lib/units/types";
import { useUnitSystem } from "../../lib/units/useUnitSystem";
import { RawNumberInput } from "./RawNumberInput";

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
  /** Tailwind width utility for the input box (default `w-15`). */
  widthClass?: string;
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
  widthClass,
}: UnitNumberInputProps) {
  const { system } = useUnitSystem();

  const resolvedLabel = labelKey ? LABELS[labelKey].sym : (label ?? "");
  const resolvedUnit = quantity
    ? getUnitLabel(quantity, system)
    : (labelKey ? LABELS[labelKey].unit : (unit ?? ""));
  const unitText = resolvedUnit === "—" ? "" : resolvedUnit;

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
      <RawNumberInput
        id={inputId}
        value={value}
        onChange={onChange}
        unit={unitText}
        ariaLabel={`${resolvedLabel} (${unitText})`}
        quantity={quantity}
        precision={precision}
        integer={integer}
        min={min}
        max={max}
        step={step}
        clamp={clamp}
        widthClass={widthClass}
      />
    </div>
  );
}
