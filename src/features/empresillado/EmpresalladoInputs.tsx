import { useState, useEffect } from 'react';
import { type EmpresalladoInputs } from '../../data/defaults';
import { ANGLE_PROFILES } from '../../data/angleProfiles';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface EmpresalladoInputsProps {
  state: EmpresalladoInputs;
  setField: (field: keyof EmpresalladoInputs, value: EmpresalladoInputs[keyof EmpresalladoInputs]) => void;
  /** True when s ≤ lp — highlights the s field */
  sError: boolean;
}

interface FieldProps {
  labelKey?: LabelKey;
  label?: string;
  sub?: string;
  unit?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  error?: boolean;
  errorText?: string;
  helpText?: string;
  id: string;
}

function NumberField({ labelKey, label, sub, unit, value, onChange, error, errorText, helpText, id }: FieldProps) {
  const resolved = labelKey
    ? {
        label: LABELS[labelKey].sym || LABELS[labelKey].descShort,
        sub: LABELS[labelKey].sym ? LABELS[labelKey].descShort : undefined,
        unit: LABELS[labelKey].unit === '—' ? '' : LABELS[labelKey].unit,
      }
    : { label: label ?? '', sub, unit: unit ?? '' };

  const [localStr, setLocalStr] = useState(() => String(value));
  useEffect(() => { setLocalStr(String(value)); }, [value]);

  return (
    <div>
      <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
        <InputLabel htmlFor={id} label={resolved.label} sub={resolved.sub} />
        <div className="flex shrink-0">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={localStr}
            onChange={(e) => {
              setLocalStr(e.target.value);
              const n = parseFloat(e.target.value);
              if (!isNaN(n)) onChange(n);
            }}
            onBlur={() => {
              const n = parseFloat(localStr);
              if (isNaN(n)) setLocalStr(String(value));
            }}
            className={[
              'w-15 text-right bg-bg-primary border rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors',
              error ? 'border-state-fail' : 'border-border-main',
            ].join(' ')}
            aria-label={`${resolved.label} (${resolved.unit})`}
          />
          <span
            className={[
              'bg-bg-elevated border border-l-0 rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center',
              error ? 'border-state-fail' : 'border-border-main',
            ].join(' ')}
          >
            {resolved.unit}
          </span>
        </div>
      </div>
      {error && errorText && (
        <p className="text-[10px] text-state-fail pl-1 mb-1">{errorText}</p>
      )}
      {helpText && !error && (
        <p className="text-[10px] text-text-disabled leading-tight whitespace-pre-line pl-1 mb-1">{helpText}</p>
      )}
    </div>
  );
}

function SelectField({
  label,
  id,
  value,
  options,
  onChange,
}: {
  label: string;
  id: string;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
      <InputLabel htmlFor={id} label={label} />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 max-w-36 truncate bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] text-text-primary font-mono outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function EmpresalladoInputsPanel({ state, setField, sError }: EmpresalladoInputsProps) {
  const set = <K extends keyof EmpresalladoInputs>(field: K, val: EmpresalladoInputs[K]) =>
    setField(field, val);

  return (
    <div className="flex flex-col">
      {/* ── Pilar existente ───────────────────────────────────────────── */}
      <CollapsibleSection label="Pilar existente">
        <NumberField id="emp-bc" labelKey="bc_column" value={state.bc} step={5} min={10} onChange={(v) => set('bc', v)} />
        <NumberField id="emp-hc" labelKey="hc_column" value={state.hc} step={5} min={10} onChange={(v) => set('hc', v)} />
        <NumberField id="emp-L"  labelKey="L_column"  value={state.L}  step={0.1} min={0.5} onChange={(v) => set('L', v)} />
      </CollapsibleSection>

      {/* ── Cargas de diseño ──────────────────────────────────────────── */}
      <CollapsibleSection label="Cargas de diseño">
        <UnitNumberInput labelKey="NEd"        field="N_Ed"  value={state.N_Ed}  quantity="force"  onChange={(v) => set('N_Ed', v)} />
        <UnitNumberInput labelKey="Mx_Ed_plan" field="Mx_Ed" value={state.Mx_Ed} quantity="moment" onChange={(v) => set('Mx_Ed', v)} />
        <UnitNumberInput labelKey="My_Ed_plan" field="My_Ed" value={state.My_Ed} quantity="moment" onChange={(v) => set('My_Ed', v)} />
        <UnitNumberInput labelKey="VEd"        field="Vd"    value={state.Vd}    quantity="force"  onChange={(v) => set('Vd', v)} />
        <p className="text-[10px] text-text-disabled leading-tight whitespace-pre-line pl-1 mb-1">
          {"Cortante actuante en la sección del pilar.\nSi Vd < N_Ed/500, se aplica el mínimo normativo N_Ed/500 (EC3 §6.4.3.1)."}
        </p>
      </CollapsibleSection>

      {/* ── Perfil L ──────────────────────────────────────────────────── */}
      <CollapsibleSection label="Perfil L (angulares)">
        <SelectField
          label="Perfil"
          id="emp-perfil"
          value={state.perfil}
          options={ANGLE_PROFILES.map((p) => ({ value: p.key, label: p.label }))}
          onChange={(v) => set('perfil', v)}
        />
        <NumberField id="emp-fy" labelKey="fy_steel" value={state.fy} step={5} min={235} onChange={(v) => set('fy', v)} />
      </CollapsibleSection>

      {/* ── Pandeo global ────────────────────────────────────────────── */}
      <CollapsibleSection label="Pandeo global del pilar">
        <NumberField
          id="emp-beta-x"
          label="βx"
          sub="Coef. pandeo eje X"
          value={state.beta_x}
          step={0.05}
          min={0.5}
          helpText={"Condición de contorno del pilar en el marco estructural.\nLas pletinas soldadas tienen lk = 0.5·s fijo (biempotradas).\n· Empotrado-empotrado: 0.5\n· Articulado-empotrado: 0.7\n· Articulado-articulado: 1.0"}
          onChange={(v) => set('beta_x', v)}
        />
        <NumberField
          id="emp-beta-y"
          label="βy"
          sub="Coef. pandeo eje Y"
          value={state.beta_y}
          step={0.05}
          min={0.5}
          helpText={"Condición de contorno del pilar en el marco estructural.\nLas pletinas soldadas tienen lk = 0.5·s fijo (biempotradas).\n· Empotrado-empotrado: 0.5\n· Articulado-empotrado: 0.7\n· Articulado-articulado: 1.0"}
          onChange={(v) => set('beta_y', v)}
        />
      </CollapsibleSection>

      {/* ── Pletinas ──────────────────────────────────────────────────── */}
      <CollapsibleSection label="Pletinas (battens)">
        <NumberField
          id="emp-s"
          label="s"
          sub="Separación pletinas"
          unit="cm"
          value={state.s}
          step={5}
          min={5}
          error={sError}
          errorText="s debe superar lp"
          onChange={(v) => set('s', v)}
        />
        <NumberField id="emp-lp" label="lp" sub="Alto pletina"     unit="cm" value={state.lp} step={1} min={1} onChange={(v) => set('lp', v)} />
        <NumberField id="emp-bp" label="bp" sub="Ancho pletina"    unit="cm" value={state.bp} step={1} min={2} onChange={(v) => set('bp', v)} />
        <NumberField id="emp-tp" label="tp" sub="Espesor pletina"  unit="mm" value={state.tp} step={1} min={4} onChange={(v) => set('tp', v)} />
      </CollapsibleSection>
    </div>
  );
}
