import { useEffect } from 'react';
import { type SteelBeamInputs } from '../../data/defaults';
import { getSizesForTipo } from '../../data/steelProfiles';

interface SteelBeamsInputsProps {
  state: SteelBeamInputs;
  setField: (field: keyof SteelBeamInputs, value: SteelBeamInputs[keyof SteelBeamInputs]) => void;
}

function NumField({
  label,
  sub,
  field,
  value,
  unit,
  min,
  setField,
}: {
  label: string;
  sub?: string;
  field: keyof SteelBeamInputs;
  value: number;
  unit: string;
  min?: number;
  setField: SteelBeamsInputsProps['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label
        htmlFor={`sb-input-${field}`}
        className="text-[13px] text-text-secondary whitespace-nowrap shrink-0"
      >
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`sb-input-${field}`}
          type="number"
          value={value}
          min={min}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!isNaN(n)) setField(field, n);
          }}
          className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
  field: keyof SteelBeamInputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: SteelBeamsInputsProps['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label
        htmlFor={`sb-select-${field}`}
        className="text-[13px] text-text-secondary whitespace-nowrap shrink-0"
      >
        {label}
      </label>
      <select
        id={`sb-select-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          setField(field, isNaN(asNum) ? raw : asNum);
        }}
        className="bg-bg-primary border border-border-main rounded px-1.75 py-1 text-[12px] text-text-primary font-mono outline-none focus:border-accent transition-colors cursor-pointer shrink-0"
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <span className="text-[13px] text-text-disabled whitespace-nowrap shrink-0">{label}</span>
      <span className="text-[12px] font-mono text-text-disabled">{value}</span>
    </div>
  );
}

export function SteelBeamsInputs({ state, setField }: SteelBeamsInputsProps) {
  const availableSizes = getSizesForTipo(state.tipo);

  // When tipo changes, snap size to first available if current is invalid
  useEffect(() => {
    if (!availableSizes.includes(state.size)) {
      setField('size', availableSizes[0] ?? 160);
    }
  }, [state.tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const deltaAdm = (state.L / 300).toFixed(1);

  return (
    <div className="flex flex-col" aria-label="Datos de entrada — Viga de acero">

      {/* PERFIL */}
      <SectionHeader label="Perfil" />
      <SelectField
        label="Tipo"
        field="tipo"
        value={state.tipo}
        options={(['IPE', 'HEA', 'HEB'] as const).map((t) => ({ value: t, label: t }))}
        setField={setField}
      />
      <SelectField
        label="Tamaño"
        field="size"
        value={state.size}
        options={availableSizes.map((s) => ({ value: s, label: `${state.tipo} ${s}` }))}
        setField={setField}
      />

      {/* MATERIAL */}
      <SectionHeader label="Material" />
      <SelectField
        label="Acero"
        field="steel"
        value={state.steel}
        options={(['S275', 'S355'] as const).map((s) => ({ value: s, label: s }))}
        setField={setField}
      />

      {/* SOLICITACIONES ELU */}
      <SectionHeader label="Solicitaciones ELU" />
      <NumField
        label="MEd"
        sub="(ELU)"
        field="MEd"
        value={state.MEd}
        unit="kNm"
        min={0}
        setField={setField}
      />
      <NumField
        label="VEd"
        sub="(ELU)"
        field="VEd"
        value={state.VEd}
        unit="kN"
        min={0}
        setField={setField}
      />

      {/* PANDEO LATERAL (LTB) */}
      <SectionHeader label="Pandeo lateral (LTB)" />
      <NumField
        label="Lcr"
        sub="(longitud)"
        field="Lcr"
        value={state.Lcr}
        unit="mm"
        min={100}
        setField={setField}
      />
      <SelectField
        label="Tipo carga"
        field="loadTypeLTB"
        value={state.loadTypeLTB}
        options={[
          { value: 'uniform', label: 'Uniforme (C₁=1.13)' },
          { value: 'point',   label: 'Puntual (C₁=1.35)' },
        ]}
        setField={setField}
      />

      {/* FLECHA ELS */}
      <SectionHeader label="Flecha ELS" />
      <NumField
        label="Mser"
        sub="(ELS)"
        field="Mser"
        value={state.Mser}
        unit="kNm"
        min={0}
        setField={setField}
      />
      <NumField
        label="L"
        sub="(luz viga)"
        field="L"
        value={state.L}
        unit="mm"
        min={500}
        setField={setField}
      />
      <SelectField
        label="Tipo carga"
        field="loadTypeDefl"
        value={state.loadTypeDefl}
        options={[
          { value: 'uniform', label: 'Uniforme (5/48)' },
          { value: 'point',   label: 'Puntual centro (1/12)' },
        ]}
        setField={setField}
      />
      <InfoRow label="δadm = L/300" value={`${deltaAdm} mm`} />
    </div>
  );
}
