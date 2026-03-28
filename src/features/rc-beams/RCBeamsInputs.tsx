import { type RCBeamInputs } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';

interface RCBeamsInputsProps {
  state: RCBeamInputs;
  setField: (field: keyof RCBeamInputs, value: RCBeamInputs[keyof RCBeamInputs]) => void;
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
  field: keyof RCBeamInputs;
  value: number;
  unit: string;
  min?: number;
  setField: RCBeamsInputsProps['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`input-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`input-${field}`}
          type="number"
          value={value}
          min={min}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!isNaN(n)) setField(field, n);
          }}
          className="w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
  field: keyof RCBeamInputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: RCBeamsInputsProps['setField'];
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

export function RCBeamsInputs({ state, setField }: RCBeamsInputsProps) {
  return (
    <div className="flex flex-col" aria-label="Datos de entrada">
      <SectionHeader label="Geometría" />
      <NumField label="Ancho b" field="b" value={state.b} unit="mm" min={1} setField={setField} />
      <NumField label="Canto h" field="h" value={state.h} unit="mm" min={1} setField={setField} />
      <NumField label="Recubrimiento" field="cover" value={state.cover} unit="mm" min={1} setField={setField} />

      <SectionHeader label="Armadura long." />
      <NumField label="Núm. barras" field="nBars" value={state.nBars} unit="ud" min={1} setField={setField} />
      <SelectField
        label="Diámetro φ"
        field="barDiam"
        value={state.barDiam}
        options={availableBarDiams.map((d) => ({ value: d, label: `φ ${d}` }))}
        setField={setField}
      />

      <SectionHeader label="Armadura trans." />
      <SelectField
        label="Estribos φ"
        field="stirrupDiam"
        value={state.stirrupDiam}
        options={availableBarDiams.filter((d) => d <= 16).map((d) => ({ value: d, label: `φ ${d}` }))}
        setField={setField}
      />
      <NumField label="Separación" field="stirrupSpacing" value={state.stirrupSpacing} unit="mm" min={50} setField={setField} />
      <NumField label="Núm. ramas" field="stirrupLegs" value={state.stirrupLegs} unit="ud" min={1} setField={setField} />

      <SectionHeader label="Materiales" />
      <SelectField
        label="fck"
        field="fck"
        value={state.fck}
        options={availableFck.map((f) => ({ value: f, label: `${f} MPa` }))}
        setField={setField}
      />
      <SelectField
        label="fyk"
        field="fyk"
        value={state.fyk}
        options={[400, 500, 600].map((f) => ({ value: f, label: `${f} MPa` }))}
        setField={setField}
      />
      <SelectField
        label="Exposición"
        field="exposureClass"
        value={state.exposureClass}
        options={['XC1', 'XC2', 'XC3', 'XC4'].map((c) => ({ value: c, label: c }))}
        setField={setField}
      />

      <SectionHeader label="Solicitaciones" />
      <NumField label="Md" sub="(ELU)" field="Md" value={state.Md} unit="kNm" setField={setField} />
      <NumField label="VEd" sub="(ELU)" field="VEd" value={state.VEd} unit="kN" setField={setField} />
      <NumField label="Ms" sub="(ELS)" field="Ms" value={state.Ms} unit="kNm" setField={setField} />
      <NumField label="ψ₂·Qk / total" field="psi2" value={state.psi2} unit="—" min={0} setField={setField} />
    </div>
  );
}
