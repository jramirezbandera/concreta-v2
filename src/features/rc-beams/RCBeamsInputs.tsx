import { useState, useEffect } from 'react';
import { type RCBeamInputs } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';

interface RCBeamsInputsProps {
  state: RCBeamInputs;
  section: 'vano' | 'apoyo';
  setSection: (s: 'vano' | 'apoyo') => void;
  setField: (field: string, value: RCBeamInputs[keyof RCBeamInputs]) => void;
}

function NumField({
  labelKey,
  label,
  sub,
  field,
  value,
  unit,
  integer = false,
  setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  sub?: string;
  field: string;
  value: number;
  unit?: string;
  min?: number;
  integer?: boolean;
  setField: RCBeamsInputsProps['setField'];
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '\u2014' ? '' : resolved.unit;
  const [localStr, setLocalStr] = useState(() => String(value));

  useEffect(() => {
    setLocalStr(String(value));
  }, [value]);

  return (
    <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
      <label htmlFor={`input-${field}`} className="text-[13px] text-text-secondary truncate min-w-0" title={`${resolved.label}${resolved.sub ? ' ' + resolved.sub : ''}`}>
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
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
          className="w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors"
          aria-label={`${resolved.label} (${unitText})`}
        />
        <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
          {unitText}
        </span>
      </div>
    </div>
  );
}

function SelectField({
  labelKey,
  label,
  field,
  value,
  options,
  setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  field: string;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: RCBeamsInputsProps['setField'];
}) {
  const resolved = labelKey
    ? LABELS[labelKey].sym
      ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort }
      : { label: LABELS[labelKey].descShort, sub: undefined as string | undefined }
    : { label: label ?? '', sub: undefined as string | undefined };
  return (
    <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
      <label htmlFor={`select-${field}`} className="text-[13px] text-text-secondary truncate min-w-0" title={`${resolved.label}${resolved.sub ? ' ' + resolved.sub : ''}`}>
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <select
        id={`select-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          setField(field, isNaN(asNum) ? raw : asNum);
        }}
        className="min-w-0 max-w-40 truncate bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] text-text-primary font-mono outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
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

const LOAD_TYPE_OPTIONS = [
  { value: 'residential', label: 'Residencial (\u03c8\u2082=0.3)' },
  { value: 'office',      label: 'Oficinas (\u03c8\u2082=0.3)' },
  { value: 'parking',     label: 'Garaje (\u03c8\u2082=0.6)' },
  { value: 'roof',        label: 'Cubierta (\u03c8\u2082=0.0)' },
  { value: 'custom',      label: 'Personalizado' },
];

export function RCBeamsInputs({ state, section, setSection, setField }: RCBeamsInputsProps) {
  const isVano = section === 'vano';
  const p = isVano ? 'vano' : 'apoyo';

  // Labels that depend on the zone's moment sign
  const tensionLabel   = isVano ? 'Traccion (barras inf.)' : 'Traccion (barras sup.)';
  const comprLabel     = isVano ? 'Compresion (barras sup.)' : 'Compresion (barras inf.)';
  const tensionNField  = isVano ? 'vano_bot_nBars'    : 'apoyo_top_nBars';
  const tensionDField  = isVano ? 'vano_bot_barDiam'  : 'apoyo_top_barDiam';
  const comprNField    = isVano ? 'vano_top_nBars'    : 'apoyo_bot_nBars';
  const comprDField    = isVano ? 'vano_top_barDiam'  : 'apoyo_bot_barDiam';

  return (
    <div className="flex flex-col" aria-label="Datos de entrada">

      {/* Shared geometry */}
      <CollapsibleSection label="Geometria">
        <NumField labelKey="b_section"        field="b"     value={state.b as number}     min={1} setField={setField} />
        <NumField labelKey="h_section"        field="h"     value={state.h as number}     min={1} setField={setField} />
        <NumField labelKey="cover_mechanical" field="cover" value={state.cover as number} min={1} setField={setField} />
      </CollapsibleSection>

      {/* Shared materials */}
      <CollapsibleSection label="Materiales">
        <SelectField
          labelKey="fck"
          field="fck"
          value={state.fck as number}
          options={availableFck.map((f) => ({ value: f, label: `${f} MPa` }))}
          setField={setField}
        />
        <SelectField
          labelKey="fyk"
          field="fyk"
          value={state.fyk as number}
          options={[400, 500, 600].map((f) => ({ value: f, label: `${f} MPa` }))}
          setField={setField}
        />
      </CollapsibleSection>

      {/* Shared: exposure class + load type */}
      <CollapsibleSection label="Uso y exposicion (fisuracion ELS)">
        <SelectField
          labelKey="exposureClass"
          field="exposureClass"
          value={state.exposureClass as string}
          options={['XC1', 'XC2', 'XC3', 'XC4'].map((c) => ({ value: c, label: c }))}
          setField={setField}
        />
        <SelectField
          labelKey="loadType"
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
      </CollapsibleSection>

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

      {/* Tension bars */}
      <CollapsibleSection label={tensionLabel}>
        <NumField
          label="Num. barras"
          field={tensionNField}
          value={state[tensionNField] as number}
          unit="ud"
          min={1}
          integer
          setField={setField}
        />
        <SelectField
          label="Diametro"
          field={tensionDField}
          value={state[tensionDField] as number}
          options={availableBarDiams.map((d) => ({ value: d, label: `\u03c6 ${d}` }))}
          setField={setField}
        />
      </CollapsibleSection>

      {/* Compression bars */}
      <CollapsibleSection label={comprLabel}>
        <NumField
          label="Num. barras"
          field={comprNField}
          value={state[comprNField] as number}
          unit="ud"
          min={1}
          integer
          setField={setField}
        />
        <SelectField
          label="Diametro"
          field={comprDField}
          value={state[comprDField] as number}
          options={availableBarDiams.map((d) => ({ value: d, label: `\u03c6 ${d}` }))}
          setField={setField}
        />
      </CollapsibleSection>

      {/* Transverse reinforcement */}
      <CollapsibleSection label="Armadura transversal">
        <SelectField
          labelKey="bar_diameter_stirrup"
          field={`${p}_stirrupDiam`}
          value={state[`${p}_stirrupDiam`] as number}
          options={availableBarDiams.filter((d) => d <= 16).map((d) => ({ value: d, label: `\u03c6 ${d}` }))}
          setField={setField}
        />
        <NumField
          label="s"
          sub="Separaci\u00f3n"
          field={`${p}_stirrupSpacing`}
          value={state[`${p}_stirrupSpacing`] as number}
          unit="mm"
          min={50}
          setField={setField}
        />
        <NumField
          labelKey="n_stirrup_legs"
          field={`${p}_stirrupLegs`}
          value={state[`${p}_stirrupLegs`] as number}
          min={2}
          integer
          setField={setField}
        />
      </CollapsibleSection>

      {/* Per-section solicitations */}
      <CollapsibleSection label="Solicitaciones">
        <NumField
          label={isVano ? 'Md' : '|Md|'}
          sub={isVano ? '(ELU, M+)' : '(ELU, M\u2212)'}
          field={`${p}_Md`}
          value={state[`${p}_Md`] as number}
          unit="kNm"
          setField={setField}
        />
        <NumField
          label="VEd"
          sub="(ELU)"
          field={`${p}_VEd`}
          value={state[`${p}_VEd`] as number}
          unit="kN"
          setField={setField}
        />
        <NumField
          label="M carga permanente"
          sub="(ELS)"
          field={`${p}_M_G`}
          value={state[`${p}_M_G`] as number}
          unit="kNm"
          setField={setField}
        />
        <NumField
          label="M carga variable"
          sub="(ELS)"
          field={`${p}_M_Q`}
          value={state[`${p}_M_Q`] as number}
          unit="kNm"
          setField={setField}
        />
      </CollapsibleSection>

    </div>
  );
}
