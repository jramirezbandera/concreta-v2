import { type EmpresalladoInputs } from '../../data/defaults';
import { ANGLE_PROFILES } from '../../data/angleProfiles';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';

interface EmpresalladoInputsProps {
  state: EmpresalladoInputs;
  setField: (field: keyof EmpresalladoInputs, value: EmpresalladoInputs[keyof EmpresalladoInputs]) => void;
  /** True when s ≤ lp — highlights the s field */
  sError: boolean;
}


interface FieldProps {
  labelKey?: LabelKey;
  label?: string;
  unit?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  error?: boolean;
  errorText?: string;
  helpText?: string;
}

function NumberField({ labelKey, label, unit, value, onChange, step = 1, min = 0, error, errorText, helpText }: FieldProps) {
  const resolved = labelKey
    ? {
        label: LABELS[labelKey].sym || LABELS[labelKey].descShort,
        sub: LABELS[labelKey].sym ? LABELS[labelKey].descShort : undefined,
        unit: LABELS[labelKey].unit === '—' ? '' : LABELS[labelKey].unit,
      }
    : { label: label ?? '', sub: undefined as string | undefined, unit: unit ?? '' };
  return (
    <div className="flex flex-col gap-0.5 mb-2">
      <div className="flex items-center justify-between">
        <label className="text-[12px] text-text-secondary whitespace-nowrap">
          {resolved.label}
          {resolved.sub && <span className="text-[10px] text-text-disabled ml-1">{resolved.sub}</span>}
        </label>
        {resolved.unit && <span className="text-[10px] text-text-disabled font-mono">{resolved.unit}</span>}
      </div>
      <input
        type="number"
        className={[
          'w-full bg-bg-primary border rounded pl-2 pr-6 py-1 text-[13px] font-mono text-text-primary focus:outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors',
          error ? 'border-state-fail' : 'border-border-main',
        ].join(' ')}
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
      />
      {error && errorText && (
        <span className="text-[10px] text-state-fail">{errorText}</span>
      )}
      {helpText && !error && (
        <span className="text-[10px] text-text-disabled leading-tight whitespace-pre-line">{helpText}</span>
      )}
    </div>
  );
}

export function EmpresalladoInputsPanel({ state, setField, sError }: EmpresalladoInputsProps) {
  const set = <K extends keyof EmpresalladoInputs>(field: K, val: EmpresalladoInputs[K]) =>
    setField(field, val);

  return (
    <div>
      {/* ── Pilar existente ───────────────────────────────────────────── */}
      <CollapsibleSection label="Pilar existente">
        <NumberField labelKey="bc_column" value={state.bc} step={5} min={10} onChange={(v) => set('bc', v)} />
        <NumberField labelKey="hc_column" value={state.hc} step={5} min={10} onChange={(v) => set('hc', v)} />
        <NumberField labelKey="L_column" value={state.L} step={0.1} min={0.5} onChange={(v) => set('L', v)} />
      </CollapsibleSection>

      {/* ── Cargas de diseño ──────────────────────────────────────────── */}
      <CollapsibleSection label="Cargas de diseño">
        <NumberField labelKey="NEd" value={state.N_Ed} step={10} min={0} onChange={(v) => set('N_Ed', v)} />
        <NumberField labelKey="Mx_Ed_plan" value={state.Mx_Ed} step={1} onChange={(v) => set('Mx_Ed', v)} />
        <NumberField labelKey="My_Ed_plan" value={state.My_Ed} step={1} onChange={(v) => set('My_Ed', v)} />
        <NumberField
          labelKey="VEd"
          value={state.Vd}
          step={1}
          min={0}
          helpText={"Cortante actuante en la sección del pilar.\nSi Vd < N_Ed/500, se aplica el mínimo normativo N_Ed/500 (EC3 §6.4.3.1)."}
          onChange={(v) => set('Vd', v)}
        />
      </CollapsibleSection>

      {/* ── Perfil L ──────────────────────────────────────────────────── */}
      <CollapsibleSection label="Perfil L (angulares)">
        <div className="flex flex-col gap-0.5 mb-2">
          <label className="text-[12px] text-text-secondary">Perfil</label>
          <select
            className="w-full bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[13px] font-mono text-text-primary focus:outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
            value={state.perfil}
            onChange={(e) => set('perfil', e.target.value)}
          >
            {ANGLE_PROFILES.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
        <NumberField labelKey="fy_steel" value={state.fy} step={5} min={235} onChange={(v) => set('fy', v)} />
      </CollapsibleSection>

      {/* ── Pandeo global ────────────────────────────────────────────── */}
      <CollapsibleSection label="Pandeo global del pilar">
        <NumberField
          label="Coef. pandeo eje X (beta_x)"
          value={state.beta_x}
          step={0.05}
          min={0.5}
          helpText={"Condición de contorno del pilar en el marco estructural.\nLas pletinas soldadas tienen lk = 0.5·s fijo (biempotradas).\n· Empotrado-empotrado: 0.5\n· Articulado-empotrado: 0.7\n· Articulado-articulado: 1.0"}
          onChange={(v) => set('beta_x', v)}
        />
        <NumberField
          label="Coef. pandeo eje Y (beta_y)"
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
          label="Separación entre pletinas (s)"
          unit="cm"
          value={state.s}
          step={5}
          min={5}
          error={sError}
          errorText="s debe superar lp"
          onChange={(v) => set('s', v)}
        />
        <NumberField label="Alto de pletina (lp)" unit="cm" value={state.lp} step={1} min={1} onChange={(v) => set('lp', v)} />
        <NumberField label="Ancho de pletina (bp)" unit="cm" value={state.bp} step={1} min={2} onChange={(v) => set('bp', v)} />
        <NumberField label="Espesor de pletina (tp)" unit="mm" value={state.tp} step={1} min={4} onChange={(v) => set('tp', v)} />
      </CollapsibleSection>
    </div>
  );
}
