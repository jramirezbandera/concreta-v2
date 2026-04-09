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
  helpText?: string;
}

function NumberField({ label, unit, value, onChange, step = 1, min = 0, error, errorText, helpText }: FieldProps) {
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
      <SectionHeader label="Pilar existente" />
      <NumberField label="Ancho del pilar (bc)" unit="cm" value={state.bc} step={5} min={10} onChange={(v) => set('bc', v)} />
      <NumberField label="Canto del pilar (hc)" unit="cm" value={state.hc} step={5} min={10} onChange={(v) => set('hc', v)} />
      <NumberField label="Altura libre del pilar (L)" unit="m" value={state.L} step={0.1} min={0.5} onChange={(v) => set('L', v)} />

      {/* ── Cargas de diseño ──────────────────────────────────────────── */}
      <SectionHeader label="Cargas de diseño" />
      <NumberField label="Axil de diseño (N_Ed)" unit="kN" value={state.N_Ed} step={10} min={0} onChange={(v) => set('N_Ed', v)} />
      <NumberField label="Momento eje X (Mx_Ed)" unit="kNm" value={state.Mx_Ed} step={1} onChange={(v) => set('Mx_Ed', v)} />
      <NumberField label="Momento eje Y (My_Ed)" unit="kNm" value={state.My_Ed} step={1} onChange={(v) => set('My_Ed', v)} />
      <NumberField
        label="Cortante de diseno (V_Ed)"
        unit="kN"
        value={state.Vd}
        step={1}
        min={0}
        helpText={"Cortante actuante en la seccion del pilar.\nSi Vd < N_Ed/500, se aplica el minimo normativo N_Ed/500 (EC3 §6.4.3.1)."}
        onChange={(v) => set('Vd', v)}
      />

      {/* ── Perfil L ──────────────────────────────────────────────────── */}
      <SectionHeader label="Perfil L (angulares)" />
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
      <NumberField label="Limite elastico (fy)" unit="MPa" value={state.fy} step={5} min={235} onChange={(v) => set('fy', v)} />

      {/* ── Longitudes de pandeo ──────────────────────────────────────── */}
      <SectionHeader label="Pandeo global del pilar" />
      <NumberField
        label="Coef. pandeo eje X (beta_x)"
        value={state.beta_x}
        step={0.05}
        min={0.5}
        helpText={"Condicion de contorno del pilar en el marco estructural.\nLas pletinas soldadas tienen lk = 0.5*s fijo (biempotradas).\n· Empotrado-empotrado: 0.5\n· Articulado-empotrado: 0.7\n· Articulado-articulado: 1.0"}
        onChange={(v) => set('beta_x', v)}
      />
      <NumberField
        label="Coef. pandeo eje Y (beta_y)"
        value={state.beta_y}
        step={0.05}
        min={0.5}
        helpText={"Condicion de contorno del pilar en el marco estructural.\n· Empotrado-empotrado: 0.5\n· Articulado-empotrado: 0.7\n· Articulado-articulado: 1.0"}
        onChange={(v) => set('beta_y', v)}
      />

      {/* ── Pletinas ──────────────────────────────────────────────────── */}
      <SectionHeader label="Pletinas (battens)" />
      <NumberField
        label="Separacion entre pletinas (s)"
        unit="cm"
        value={state.s}
        step={5}
        min={5}
        error={sError}
        errorText="s debe superar lp"
        onChange={(v) => set('s', v)}
      />
      <NumberField label="Longitud de pletina (lp)" unit="cm" value={state.lp} step={1} min={1} onChange={(v) => set('lp', v)} />
      <NumberField label="Ancho de pletina (bp)" unit="cm" value={state.bp} step={1} min={2} onChange={(v) => set('bp', v)} />
      <NumberField label="Espesor de pletina (tp)" unit="mm" value={state.tp} step={1} min={4} onChange={(v) => set('tp', v)} />
    </div>
  );
}
