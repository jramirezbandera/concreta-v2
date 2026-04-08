import { type EmpresalladoInputs } from '../../data/defaults';
import { ANGLE_PROFILES } from '../../data/angleProfiles';

interface EmpresalladoInputsProps {
  state: EmpresalladoInputs;
  setField: (field: keyof EmpresalladoInputs, value: EmpresalladoInputs[keyof EmpresalladoInputs]) => void;
  /** True when s ≤ lp — highlights the s field */
  sError: boolean;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-disabled pt-3 pb-1 border-b border-border-sub mb-2 first:pt-0">
      {label}
    </p>
  );
}

interface FieldProps {
  label: string;
  unit?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  error?: boolean;
  errorText?: string;
}

function NumberField({ label, unit, value, onChange, step = 1, min = 0, error, errorText }: FieldProps) {
  return (
    <div className="flex flex-col gap-0.5 mb-2">
      <div className="flex items-center justify-between">
        <label className="text-[12px] text-text-secondary">{label}</label>
        {unit && <span className="text-[10px] text-text-disabled font-mono">{unit}</span>}
      </div>
      <input
        type="number"
        className={[
          'w-full bg-bg-primary border rounded px-2 py-1 text-[13px] font-mono text-text-primary focus:outline-none focus:border-accent transition-colors',
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
    </div>
  );
}

export function EmpresalladoInputsPanel({ state, setField, sError }: EmpresalladoInputsProps) {
  const set = <K extends keyof EmpresalladoInputs>(field: K, val: EmpresalladoInputs[K]) =>
    setField(field, val);

  return (
    <div>
      {/* ── Pilar existente ───────────────────────────────────────────── */}
      <SectionHeader label="Pilar existente" />
      <NumberField label="bc" unit="mm" value={state.bc} step={10} min={100} onChange={(v) => set('bc', v)} />
      <NumberField label="hc" unit="mm" value={state.hc} step={10} min={100} onChange={(v) => set('hc', v)} />
      <NumberField label="L" unit="mm" value={state.L} step={100} min={500} onChange={(v) => set('L', v)} />

      {/* ── Cargas de diseño ──────────────────────────────────────────── */}
      <SectionHeader label="Cargas de diseño" />
      <NumberField label="N_Ed" unit="kN" value={state.N_Ed} step={10} min={0} onChange={(v) => set('N_Ed', v)} />
      <NumberField label="Mx_Ed" unit="kNm" value={state.Mx_Ed} step={1} onChange={(v) => set('Mx_Ed', v)} />
      <NumberField label="My_Ed" unit="kNm" value={state.My_Ed} step={1} onChange={(v) => set('My_Ed', v)} />
      <NumberField label="Vd (cortante real)" unit="kN" value={state.Vd} step={1} min={0} onChange={(v) => set('Vd', v)} />

      {/* ── Perfil L ──────────────────────────────────────────────────── */}
      <SectionHeader label="Perfil L" />
      <div className="flex flex-col gap-0.5 mb-2">
        <label className="text-[12px] text-text-secondary">Perfil</label>
        <select
          className="w-full bg-bg-primary border border-border-main rounded px-2 py-1 text-[13px] font-mono text-text-primary focus:outline-none focus:border-accent transition-colors"
          value={state.perfil}
          onChange={(e) => set('perfil', e.target.value)}
        >
          {ANGLE_PROFILES.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </div>
      <NumberField label="fy" unit="MPa" value={state.fy} step={5} min={235} onChange={(v) => set('fy', v)} />

      {/* ── Longitudes de pandeo ──────────────────────────────────────── */}
      <SectionHeader label="Longitudes de pandeo" />
      <NumberField label="β_x" value={state.beta_x} step={0.05} min={0.5} onChange={(v) => set('beta_x', v)} />
      <NumberField label="β_y" value={state.beta_y} step={0.05} min={0.5} onChange={(v) => set('beta_y', v)} />

      {/* ── Pletinas ──────────────────────────────────────────────────── */}
      <SectionHeader label="Pletinas" />
      <NumberField
        label="s (intereje)"
        unit="mm"
        value={state.s}
        step={50}
        min={50}
        error={sError}
        errorText="s debe superar lp"
        onChange={(v) => set('s', v)}
      />
      <NumberField label="lp (longitud)" unit="mm" value={state.lp} step={10} min={10} onChange={(v) => set('lp', v)} />
      <NumberField label="bp (ancho)" unit="mm" value={state.bp} step={5} min={20} onChange={(v) => set('bp', v)} />
      <NumberField label="tp (espesor)" unit="mm" value={state.tp} step={1} min={4} onChange={(v) => set('tp', v)} />
    </div>
  );
}
