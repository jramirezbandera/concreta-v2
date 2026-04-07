import { useState, useEffect } from 'react';
import { type PileCapInputs } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';

interface Props {
  state:    PileCapInputs;
  setField: (field: string, value: PileCapInputs[keyof PileCapInputs]) => void;
}

// ── NumField ──────────────────────────────────────────────────────────────────

function NumField({
  label, sub, field, value, unit, setField,
}: {
  label: string; sub?: string; field: string;
  value: number; unit: string; setField: Props['setField'];
}) {
  const [localStr, setLocalStr] = useState(() => String(value));

  useEffect(() => { setLocalStr(String(value)); }, [value]);

  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`pc-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`pc-${field}`}
          type="text"
          inputMode="decimal"
          value={localStr}
          onChange={(e) => {
            setLocalStr(e.target.value);
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) setField(field, n);
          }}
          onBlur={() => {
            const n = parseFloat(localStr);
            if (isNaN(n)) setLocalStr(String(value));
          }}
          className="w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors"
          aria-label={`${label} (${unit})`}
        />
        <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
          {unit}
        </span>
      </div>
    </div>
  );
}

// ── SelectField ───────────────────────────────────────────────────────────────

function SelectField({
  label, field, value, options, setField,
}: {
  label: string; field: string; value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: Props['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`pc-sel-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
      </label>
      <select
        id={`pc-sel-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          setField(field, isNaN(asNum) ? raw : asNum);
        }}
        className="bg-bg-primary border border-border-main rounded px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-disabled pt-4 pb-1 border-b border-border-sub mb-1">
      {label}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const N_OPTIONS = [2, 3, 4] as const;

export function PileCapInputsPanel({ state, setField }: Props) {
  const n = state.n as number;

  const fckOptions = availableFck.map((v) => ({ value: v, label: `${v} MPa` }));
  const fykOptions = [{ value: 500, label: '500 MPa' }, { value: 400, label: '400 MPa' }];
  const barOptions = availableBarDiams.map((v) => ({ value: v, label: `Ø${v} mm` }));

  return (
    <div className="flex flex-col gap-0">

      {/* n picker — segmented control */}
      <SectionHeader label="Número de micropilotes" />
      <div
        role="radiogroup"
        aria-label="Número de micropilotes"
        className="flex rounded border border-border-main mb-3 shrink-0 overflow-hidden"
      >
        {N_OPTIONS.map((opt) => {
          const isActive = n === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setField('n', opt)}
              className={[
                'flex-1 py-2 text-center transition-colors border-r border-border-main last:border-r-0',
                isActive
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-text-disabled hover:text-text-secondary',
              ].join(' ')}
            >
              <span className="text-[12px] font-mono">{opt}</span>
            </button>
          );
        })}
      </div>

      {/* Geometry */}
      <SectionHeader label="Geometría" />
      <NumField label="d_p"    sub="diám. pilote"     field="d_p"    value={state.d_p as number}    unit="mm"  setField={setField} />
      <NumField label="s"      sub="sep. c/c"         field="s"      value={state.s as number}      unit="mm"  setField={setField} />
      <NumField label="h_enc"  sub="canto encepado"   field="h_enc"  value={state.h_enc as number}  unit="mm"  setField={setField} />
      <NumField label="b_col"  sub="ancho pilar x"    field="b_col"  value={state.b_col as number}  unit="mm"  setField={setField} />
      <NumField label="h_col"  sub="canto pilar y"    field="h_col"  value={state.h_col as number}  unit="mm"  setField={setField} />
      <NumField label="R_adm"  sub="cap. admisible"   field="R_adm"  value={state.R_adm as number}  unit="kN"  setField={setField} />

      {/* Loads */}
      <SectionHeader label="Acciones de diseño (ELU)" />
      <NumField label="N_Ed"   sub="axil (compr.)"    field="N_Ed"   value={state.N_Ed as number}   unit="kN"  setField={setField} />
      <NumField label="Mx_Ed"  sub="momento x"        field="Mx_Ed"  value={state.Mx_Ed as number}  unit="kNm" setField={setField} />
      {n !== 2 && (
        <NumField label="My_Ed" sub="momento y"       field="My_Ed"  value={state.My_Ed as number}  unit="kNm" setField={setField} />
      )}

      {/* Materials */}
      <SectionHeader label="Materiales" />
      <SelectField label="fck" field="fck" value={state.fck as number} options={fckOptions} setField={setField} />
      <SelectField label="fyk" field="fyk" value={state.fyk as number} options={fykOptions} setField={setField} />

      {/* Reinforcement */}
      <SectionHeader label="Armadura tirantes" />
      <SelectField label="Ø tirante" field="phi_tie" value={state.phi_tie as number} options={barOptions} setField={setField} />
      <NumField label="recubr."   sub="al eje barra"  field="cover"  value={state.cover as number}  unit="mm"  setField={setField} />

      {n === 2 && (
        <p className="text-[10px] text-text-secondary mt-3 leading-relaxed">
          n=2: 2 pilotes alineados en X. Mx_Ed debe ser 0 (staticamente inadmisible). Usar n=4 para momento biaxial.
        </p>
      )}
    </div>
  );
}
