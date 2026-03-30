import { type RCBeamInputs } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';

interface RCBeamsInputsProps {
  state: RCBeamInputs;
  section: 'vano' | 'apoyo';
  setSection: (s: 'vano' | 'apoyo') => void;
  setField: (field: string, value: RCBeamInputs[keyof RCBeamInputs]) => void;
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
  field: string;
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
  field: string;
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

const LOAD_TYPE_OPTIONS = [
  { value: 'residential', label: 'Residencial (\u03c8\u2082=0.3)' },
  { value: 'office',      label: 'Oficinas (\u03c8\u2082=0.3)' },
  { value: 'parking',     label: 'Garaje (\u03c8\u2082=0.6)' },
  { value: 'roof',        label: 'Cubierta (\u03c8\u2082=0.0)' },
  { value: 'custom',      label: 'Personalizado' },
];

export function RCBeamsInputs({ state, section, setSection, setField }: RCBeamsInputsProps) {
  const isVano = section === 'vano';
  const prefix = isVano ? 'midspan' : 'support';

  return (
    <div className="flex flex-col" aria-label="Datos de entrada">

      {/* Shared geometry */}
      <SectionHeader label="Geometria" />
      <NumField label="Ancho b"         field="b"     value={state.b as number}     unit="mm" min={1} setField={setField} />
      <NumField label="Canto h"         field="h"     value={state.h as number}     unit="mm" min={1} setField={setField} />
      <NumField label="Recubrimiento"   field="cover" value={state.cover as number} unit="mm" min={1} setField={setField} />

      {/* Shared materials */}
      <SectionHeader label="Materiales" />
      <SelectField
        label="fck"
        field="fck"
        value={state.fck as number}
        options={availableFck.map((f) => ({ value: f, label: `${f} MPa` }))}
        setField={setField}
      />
      <SelectField
        label="fyk"
        field="fyk"
        value={state.fyk as number}
        options={[400, 500, 600].map((f) => ({ value: f, label: `${f} MPa` }))}
        setField={setField}
      />


      {/* Shared: exposure class + load type (affect cracking ELS in both sections) */}
      <SectionHeader label="Uso y exposicion (fisuracion ELS)" />
      <SelectField
        label="Clase de exposicion"
        field="exposureClass"
        value={state.exposureClass as string}
        options={['XC1', 'XC2', 'XC3', 'XC4'].map((c) => ({ value: c, label: c }))}
        setField={setField}
      />
      <SelectField
        label="Tipo de carga"
        field="loadType"
        value={state.loadType as string}
        options={LOAD_TYPE_OPTIONS}
        setField={setField}
      />
      {state.loadType === 'custom' && (
        <NumField
          label="\u03c8\u2082 personalizado"
          field="psi2Custom"
          value={state.psi2Custom as number}
          unit="\u2014"
          min={0}
          setField={setField}
        />
      )}

      {/* Section tab selector */}
      <div className="flex mt-3 mb-0 border-b border-border-main" role="tablist" aria-label="Seccion">
        <button
          role="tab"
          aria-selected={isVano}
          onClick={() => setSection('vano')}
          className={[
            'flex-1 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-px',
            isVano
              ? 'text-accent border-accent'
              : 'text-text-secondary border-transparent hover:text-text-primary',
          ].join(' ')}
        >
          Vano
        </button>
        <button
          role="tab"
          aria-selected={!isVano}
          onClick={() => setSection('apoyo')}
          className={[
            'flex-1 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-px',
            !isVano
              ? 'text-accent border-accent'
              : 'text-text-secondary border-transparent hover:text-text-primary',
          ].join(' ')}
        >
          Apoyo
        </button>
      </div>

      {/* Per-section armadura longitudinal + transversal */}
      <SectionHeader label={isVano ? 'Armadura (vano)' : 'Armadura (apoyo)'} />
      <NumField
        label="Num. barras"
        field={`${prefix}_nBars`}
        value={state[`${prefix}_nBars`] as number}
        unit="ud"
        min={1}
        setField={setField}
      />
      <SelectField
        label="Diametro"
        field={`${prefix}_barDiam`}
        value={state[`${prefix}_barDiam`] as number}
        options={availableBarDiams.map((d) => ({ value: d, label: `\u03c6 ${d}` }))}
        setField={setField}
      />
      <SelectField
        label="Estribos"
        field={`${prefix}_stirrupDiam`}
        value={state[`${prefix}_stirrupDiam`] as number}
        options={availableBarDiams.filter((d) => d <= 16).map((d) => ({ value: d, label: `\u03c6 ${d}` }))}
        setField={setField}
      />
      <NumField
        label="Separacion"
        field={`${prefix}_stirrupSpacing`}
        value={state[`${prefix}_stirrupSpacing`] as number}
        unit="mm"
        min={50}
        setField={setField}
      />
      <NumField
        label="Num. ramas"
        field={`${prefix}_stirrupLegs`}
        value={state[`${prefix}_stirrupLegs`] as number}
        unit="ud"
        min={1}
        setField={setField}
      />

      {/* Per-section solicitations */}
      <SectionHeader label="Solicitaciones" />
      <NumField
        label="Md"
        sub="(ELU)"
        field={`${prefix}_Md`}
        value={state[`${prefix}_Md`] as number}
        unit="kNm"
        setField={setField}
      />
      <NumField
        label="VEd"
        sub="(ELU)"
        field={`${prefix}_VEd`}
        value={state[`${prefix}_VEd`] as number}
        unit="kN"
        setField={setField}
      />
      <NumField
        label="M carga permanente"
        sub="(ELS)"
        field={`${prefix}_M_G`}
        value={state[`${prefix}_M_G`] as number}
        unit="kNm"
        setField={setField}
      />
      <NumField
        label="M carga variable"
        sub="(ELS)"
        field={`${prefix}_M_Q`}
        value={state[`${prefix}_M_Q`] as number}
        unit="kNm"
        setField={setField}
      />

    </div>
  );
}
