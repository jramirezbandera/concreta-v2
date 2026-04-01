import { useState, useEffect } from 'react';
import { type RetainingWallInputs } from '../../data/defaults';
import { availableFck } from '../../data/materials';

interface RetainingWallInputsProps {
  state: RetainingWallInputs;
  setField: (field: string, value: RetainingWallInputs[keyof RetainingWallInputs]) => void;
}

function NumField({
  label,
  sub,
  field,
  value,
  unit,
  integer = false,
  setField,
}: {
  label: string;
  sub?: string;
  field: string;
  value: number;
  unit: string;
  min?: number;
  integer?: boolean;
  setField: RetainingWallInputsProps['setField'];
}) {
  const [localStr, setLocalStr] = useState(() => String(value));

  useEffect(() => {
    setLocalStr(String(value));
  }, [value]);

  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`input-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`input-${field}`}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          value={localStr}
          onChange={(e) => {
            const raw = integer ? e.target.value.replace(/[^0-9-]/g, '') : e.target.value;
            setLocalStr(raw);
            const n = integer ? parseInt(raw, 10) : parseFloat(raw);
            if (!isNaN(n)) setField(field, n);
          }}
          onBlur={() => {
            const n = integer ? parseInt(localStr, 10) : parseFloat(localStr);
            if (isNaN(n)) setLocalStr(String(value));
            else if (integer) setLocalStr(String(Math.round(n)));
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

function SelectField({
  label,
  field,
  value,
  options,
  setField,
}: {
  label: string;
  field: string;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: RetainingWallInputsProps['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`select-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
      </label>
      <select
        id={`select-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          setField(field, isNaN(asNum) ? raw : asNum);
        }}
        className="min-w-0 bg-bg-primary border border-border-main rounded px-1.75 py-1 text-[12px] text-text-primary font-mono outline-none focus:border-accent transition-colors cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled pt-2.25 pb-1.75 border-b border-border-sub mb-2.5 mt-3 first:mt-0">
      {label}
    </p>
  );
}

function SubGroupLabel({ label }: { label: string }) {
  return (
    <p role="presentation" className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled pt-2 pb-0.5">
      {label}
    </p>
  );
}

const REBAR_DIAMS = [0, 10, 12, 14, 16, 20] as const;

function RebarField({
  label, fieldDiam, fieldSep, diam, sep, setField,
}: {
  label: string;
  fieldDiam: string;
  fieldSep: string;
  diam: number;
  sep: number;
  setField: RetainingWallInputsProps['setField'];
}) {
  const [localSep, setLocalSep] = useState(() => String(sep));

  useEffect(() => { setLocalSep(String(sep)); }, [sep]);

  const inactive = diam <= 0;

  return (
    <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
      <label className="text-[13px] text-text-secondary truncate shrink min-w-0">
        {label}
      </label>
      <div className="flex items-center gap-0 shrink-0">
        <select
          value={diam}
          onChange={(e) => setField(fieldDiam, Number(e.target.value))}
          className="w-14 bg-bg-primary border border-border-main rounded-l px-1 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors cursor-pointer appearance-none text-center"
          aria-label={`${label} — diámetro (mm)`}
        >
          {REBAR_DIAMS.map((d) => (
            <option key={d} value={d}>{d === 0 ? '—' : `Ø${d}`}</option>
          ))}
        </select>
        <span className="bg-bg-elevated border-t border-b border-border-main px-1.25 py-1 text-[10px] text-text-disabled font-mono">
          c/
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={localSep}
          placeholder="200"
          onChange={(e) => {
            const raw = e.target.value;
            setLocalSep(raw);
            const n = parseFloat(raw);
            if (!isNaN(n) && n > 0) setField(fieldSep, n);
          }}
          onBlur={() => {
            const n = parseFloat(localSep);
            if (isNaN(n) || n <= 0) { setLocalSep('200'); setField(fieldSep, 200); }
          }}
          className={`w-12 text-right bg-bg-primary border border-l-0 border-border-main rounded-r px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors${inactive ? ' opacity-40' : ''}`}
          aria-label={`${label} — separación (mm)`}
        />
      </div>
    </div>
  );
}

export function RetainingWallInputsPanel({ state, setField }: RetainingWallInputsProps) {
  const noSeismic = (state.Ab as number) === 0;

  return (
    <div className="flex flex-col" aria-label="Datos de entrada">

      <SectionHeader label="Geometría" />
      <NumField label="Altura fuste H"       field="H"      value={state.H as number}      unit="m" setField={setField} />
      <NumField label="Canto zapata hf"      field="hf"     value={state.hf as number}     unit="m" setField={setField} />
      <NumField label="Espesor fuste"        field="tFuste" value={state.tFuste as number}  unit="m" setField={setField} />
      <NumField label="Punta bP"             field="bPunta" value={state.bPunta as number}  unit="m" setField={setField} />
      <NumField label="Talón bT"             field="bTalon" value={state.bTalon as number}  unit="m" setField={setField} />

      <SectionHeader label="Materiales" />
      <SelectField
        label="fck"
        field="fck"
        value={state.fck as number}
        options={availableFck.map((f) => ({ value: f, label: `${f} N/mm²` }))}
        setField={setField}
      />
      <SelectField
        label="fyk"
        field="fyk"
        value={state.fyk as number}
        options={[400, 500, 600].map((f) => ({ value: f, label: `${f} N/mm²` }))}
        setField={setField}
      />
      <NumField label="Recubrimiento" field="cover" value={state.cover as number} unit="m" setField={setField} />

      <SectionHeader label="Terreno (trasdós)" />
      <NumField label="γ suelo seco"         field="gammaSuelo" value={state.gammaSuelo as number} unit="kN/m³" setField={setField} />
      <NumField label="γ suelo sat."         field="gammaSat"   value={state.gammaSat   as number} unit="kN/m³" setField={setField} />
      <NumField label="φ fricción"           field="phi"        value={state.phi        as number} unit="°"     setField={setField} />
      <NumField label="δ rozamiento pared"   field="delta"      value={state.delta      as number} unit="°"     setField={setField} />
      <NumField label="Sobrecarga q"         field="q"          value={state.q          as number} unit="kN/m²" setField={setField} />
      <NumField label="σ admisible"          field="sigmaAdm"   value={state.sigmaAdm   as number} unit="kPa"   setField={setField} />
      <NumField label="μ fricción base"      field="mu"         value={state.mu         as number} unit="—"     setField={setField} />

      <SectionHeader label="Nivel freático" />
      <div className="flex items-center justify-between py-0.75 gap-2">
        <span className="text-[13px] text-text-secondary">Nivel freático</span>
        <button
          type="button"
          onClick={() => setField('hasWater', !(state.hasWater as boolean))}
          className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-colors ${
            state.hasWater
              ? 'bg-accent/15 text-accent border border-accent/40'
              : 'bg-bg-elevated text-text-disabled border border-border-main'
          }`}
          aria-pressed={state.hasWater as boolean}
        >
          {state.hasWater ? 'Activo' : 'Sin NF'}
        </button>
      </div>
      {state.hasWater && (
        <NumField
          label="Prof. NF (desde cor.)"
          field="hw"
          value={state.hw as number}
          unit="m"
          setField={setField}
        />
      )}

      <SectionHeader label="Sismo (NCSE-02 / Mononobe-Okabe)" />
      <NumField label="Ab (acel. básica)" field="Ab" value={state.Ab as number} unit="g" setField={setField} />
      <NumField label="S (amplif. suelo)" field="S"  value={state.S  as number} unit="—" setField={setField} />
      {noSeismic ? (
        <p className="text-[11px] text-text-disabled mt-1">Sin sismo (Ab = 0)</p>
      ) : (
        <p className="text-[11px] text-text-disabled mt-1">
          kh = {((state.S as number) * (state.Ab as number)).toFixed(3)}&nbsp;&nbsp;
          kv = {((state.S as number) * (state.Ab as number) / 2).toFixed(3)}
        </p>
      )}

      <SectionHeader label="Armado (ø mm / sep mm)" />
      <p className="text-[11px] text-text-disabled mb-2">
        Dejar ø = 0 para calcular solo As,req (modo diseño)
      </p>
      <SubGroupLabel label="Fuste" />
      <RebarField label="Trasdós (vert.)"  fieldDiam="diam_fv_int" fieldSep="sep_fv_int" diam={state.diam_fv_int as number} sep={state.sep_fv_int as number} setField={setField} />
      <RebarField label="Intradós (vert.)" fieldDiam="diam_fv_ext" fieldSep="sep_fv_ext" diam={state.diam_fv_ext as number} sep={state.sep_fv_ext as number} setField={setField} />
      <RebarField label="Horizontal"       fieldDiam="diam_fh"     fieldSep="sep_fh"     diam={state.diam_fh     as number} sep={state.sep_fh     as number} setField={setField} />
      <SubGroupLabel label="Zapata" />
      <RebarField label="Superior (talón)" fieldDiam="diam_zs"     fieldSep="sep_zs"     diam={state.diam_zs     as number} sep={state.sep_zs     as number} setField={setField} />
      <RebarField label="Inferior (punta)" fieldDiam="diam_zi"     fieldSep="sep_zi"     diam={state.diam_zi     as number} sep={state.sep_zi     as number} setField={setField} />
      <RebarField label="Transv. inferior"  fieldDiam="diam_zt_inf" fieldSep="sep_zt_inf" diam={state.diam_zt_inf as number} sep={state.sep_zt_inf as number} setField={setField} />
      <RebarField label="Transv. superior"  fieldDiam="diam_zt_sup" fieldSep="sep_zt_sup" diam={state.diam_zt_sup as number} sep={state.sep_zt_sup as number} setField={setField} />

    </div>
  );
}
