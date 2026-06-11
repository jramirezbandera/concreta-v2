import { useState, useEffect } from 'react';
import { type RCBeamInputs } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface RCBeamsInputsProps {
  state: RCBeamInputs;
  section: 'vano' | 'apoyo';
  setSection: (s: 'vano' | 'apoyo') => void;
  setField: <K extends keyof RCBeamInputs>(field: K, value: RCBeamInputs[K]) => void;
  /** When true, hide the "Solicitaciones" section (Md/VEd/M_G/M_Q inputs).
   *  Used by FEM embed where forces come from the envelope, not user input. */
  hideSolicitations?: boolean;
  /** When true, hide the vano/apoyo tab UI at the top. Used by FEM embed where
   *  the section toggle lives in the external <ResultsHeader>. */
  hideSectionTabs?: boolean;
  /** When true, render the per-section armado blocks (tracción / compresión /
   *  armadura transversal / solicitaciones) twice — once for vano and once for
   *  apoyo, with a labelled divider between them. Used by FEM embed so the
   *  user sees and edits both regions without toggling. Implies hideSectionTabs. */
  showBothArmados?: boolean;
  /** When true, render the 'Pórtico / Sección simple' mode toggle at the top.
   *  Default true en standalone, false en FEM embed (donde el modo simple
   *  no aplica — FEM siempre opera con la cascada de envolvente). */
  showModeToggle?: boolean;
}

function NumField({
  labelKey,
  label,
  sub,
  field,
  value,
  unit,
  min,
  integer = false,
  setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  sub?: string;
  field: keyof RCBeamInputs;
  value: number;
  unit?: string;
  min?: number;
  integer?: boolean;
  setField: RCBeamsInputsProps['setField'];
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '—' ? '' : resolved.unit;
  const [localStr, setLocalStr] = useState(() => String(value));

  useEffect(() => {
    setLocalStr(String(value));
  }, [value]);

  // min se aplica como clamp real (fix auditoría #64: antes el prop existía
  // en el tipo pero nunca se destructuraba — spacing=0, legs=1, etc. eran
  // tecleables y degeneraban el motor). Durante el tecleo se acepta el valor
  // crudo para no pelearse con estados intermedios; el clamp llega en blur.
  const clamp = (n: number) => (min !== undefined ? Math.max(min, n) : n);

  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <InputLabel htmlFor={`input-${field}`} label={resolved.label} sub={resolved.sub} />
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
            if (!isNaN(n)) setField(field, clamp(n));
          }}
          onBlur={() => {
            const n = integer ? parseInt(localStr, 10) : parseFloat(localStr);
            if (isNaN(n)) setLocalStr(String(value));
            else {
              const c = clamp(integer ? Math.round(n) : n);
              setLocalStr(String(c));
              if (c !== n) setField(field, c);
            }
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
  field: keyof RCBeamInputs;
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
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <InputLabel htmlFor={`select-${field}`} label={resolved.label} sub={resolved.sub} />
      <select
        id={`select-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          // Cast: option values are controlled by the caller and match Inputs[field]'s union.
          setField(field, (isNaN(asNum) ? raw : asNum) as RCBeamInputs[typeof field]);
        }}
        className="min-w-0 max-w-36 truncate bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] text-text-primary font-mono outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
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
  { value: 'residential', label: 'Residencial (ψ₂=0.3)' },
  { value: 'office',      label: 'Oficinas (ψ₂=0.3)' },
  { value: 'parking',     label: 'Garaje (ψ₂=0.6)' },
  { value: 'roof',        label: 'Cubierta (ψ₂=0.0)' },
  { value: 'custom',      label: 'Personalizado' },
];

function PerSectionArmado({
  state, setField, sectionKind, hideSolicitations,
}: {
  state: RCBeamInputs;
  setField: RCBeamsInputsProps['setField'];
  sectionKind: 'vano' | 'apoyo';
  hideSolicitations: boolean;
}) {
  const isVano = sectionKind === 'vano';
  const p = sectionKind;
  const tensionLabel  = isVano ? 'Traccion (barras inf.)' : 'Traccion (barras sup.)';
  const comprLabel    = isVano ? 'Compresion (barras sup.)' : 'Compresion (barras inf.)';
  const tensionNField = isVano ? 'vano_bot_nBars'   : 'apoyo_top_nBars';
  const tensionDField = isVano ? 'vano_bot_barDiam' : 'apoyo_top_barDiam';
  const comprNField   = isVano ? 'vano_top_nBars'   : 'apoyo_bot_nBars';
  const comprDField   = isVano ? 'vano_top_barDiam' : 'apoyo_bot_barDiam';

  return (
    <>
      <CollapsibleSection label={tensionLabel}>
        <NumField label="Num. barras" field={tensionNField} value={state[tensionNField] as number}
          unit="ud" min={1} integer setField={setField} />
        <SelectField label="Diametro" field={tensionDField} value={state[tensionDField] as number}
          options={availableBarDiams.map((d) => ({ value: d, label: `φ ${d}` }))} setField={setField} />
      </CollapsibleSection>

      <CollapsibleSection label={comprLabel}>
        <NumField label="Num. barras" field={comprNField} value={state[comprNField] as number}
          unit="ud" min={1} integer setField={setField} />
        <SelectField label="Diametro" field={comprDField} value={state[comprDField] as number}
          options={availableBarDiams.map((d) => ({ value: d, label: `φ ${d}` }))} setField={setField} />
      </CollapsibleSection>

      <CollapsibleSection label="Armadura transversal">
        <SelectField labelKey="bar_diameter_stirrup" field={`${p}_stirrupDiam`}
          value={state[`${p}_stirrupDiam`] as number}
          options={availableBarDiams.filter((d) => d <= 16).map((d) => ({ value: d, label: `φ ${d}` }))}
          setField={setField} />
        <NumField label="s" sub="Separación" field={`${p}_stirrupSpacing`}
          value={state[`${p}_stirrupSpacing`] as number} unit="mm" min={50} setField={setField} />
        <NumField labelKey="n_stirrup_legs" field={`${p}_stirrupLegs`}
          value={state[`${p}_stirrupLegs`] as number} min={2} integer setField={setField} />
      </CollapsibleSection>

      {!hideSolicitations && (
        <CollapsibleSection label="Solicitaciones">
          <UnitNumberInput label={isVano ? 'Md' : '|Md|'} sub={isVano ? '(ELU, M+)' : '(ELU, M−)'}
            field={`${p}_Md`} value={state[`${p}_Md`] as number} quantity="moment"
            onChange={(v) => setField(`${p}_Md`, v)} />
          <UnitNumberInput label="VEd" sub="(ELU)" field={`${p}_VEd`}
            value={state[`${p}_VEd`] as number} quantity="force"
            onChange={(v) => setField(`${p}_VEd`, v)} />
          <UnitNumberInput label="M carga permanente" sub="(ELS)" field={`${p}_M_G`}
            value={state[`${p}_M_G`] as number} quantity="moment"
            onChange={(v) => setField(`${p}_M_G`, v)} />
          <UnitNumberInput label="M carga variable" sub="(ELS)" field={`${p}_M_Q`}
            value={state[`${p}_M_Q`] as number} quantity="moment"
            onChange={(v) => setField(`${p}_M_Q`, v)} />
        </CollapsibleSection>
      )}
    </>
  );
}

function ArmadoSectionHeader({ label }: { label: string }) {
  return (
    <div className="mt-3 mb-1 px-1 text-[10px] font-mono uppercase tracking-[0.07em] font-semibold text-text-disabled border-b border-border-sub pb-1">
      {label}
    </div>
  );
}

export function RCBeamsInputs({
  state, section, setSection, setField,
  hideSolicitations = false,
  hideSectionTabs = false,
  showBothArmados = false,
  showModeToggle = true,
}: RCBeamsInputsProps) {
  const isVano = section === 'vano';
  // localStorage backcompat: states antiguos sin `mode` → default 'simple'
  // (modo por defecto del módulo desde el rediseño 2026-05).
  const mode: 'portico' | 'simple' = state.mode === 'portico' ? 'portico' : 'simple';
  const isSimpleMode = mode === 'simple';

  return (
    <div className="flex flex-col" aria-label="Datos de entrada">

      {/* Mode toggle — solo en standalone (no en FEM embed).
       *  Orden: Sección simple (default) izquierda, Pórtico derecha. */}
      {showModeToggle && (
        <div className="flex gap-1 mb-3" role="tablist" aria-label="Modo de calculo">
          <button
            type="button"
            role="tab"
            aria-selected={isSimpleMode}
            onClick={() => setField('mode', 'simple')}
            className={[
              'flex-1 py-2 px-3 text-[12px] font-medium rounded transition-colors',
              isSimpleMode
                ? 'bg-accent/10 text-accent border border-accent/40'
                : 'bg-bg-elevated text-text-secondary border border-border-main hover:text-text-primary',
            ].join(' ')}
          >
            Sección simple
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isSimpleMode}
            onClick={() => setField('mode', 'portico')}
            className={[
              'flex-1 py-2 px-3 text-[12px] font-medium rounded transition-colors',
              !isSimpleMode
                ? 'bg-accent/10 text-accent border border-accent/40'
                : 'bg-bg-elevated text-text-secondary border border-border-main hover:text-text-primary',
            ].join(' ')}
          >
            Pórtico
          </button>
        </div>
      )}

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
            label="ψ₂ personalizado"
            field="psi2Custom"
            value={state.psi2Custom as number}
            unit="—"
            min={0}
            setField={setField}
          />
        )}
      </CollapsibleSection>

      {/* Section tab selector — hidden in FEM embed (toggle lives externally
       *  or both regions are shown side-by-side via showBothArmados).
       *  TAMBIÉN hidden en modo 'simple' donde solo hay 1 sección y vano es
       *  el único set editable. */}
      {!hideSectionTabs && !showBothArmados && !isSimpleMode && (
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
      )}

      {showBothArmados ? (
        <>
          <ArmadoSectionHeader label="Armado · Vano (M+)" />
          <PerSectionArmado state={state} setField={setField} sectionKind="vano" hideSolicitations={hideSolicitations} />
          <ArmadoSectionHeader label="Armado · Apoyo (M−)" />
          <PerSectionArmado state={state} setField={setField} sectionKind="apoyo" hideSolicitations={hideSolicitations} />
        </>
      ) : isSimpleMode ? (
        // Modo simple: usar 'vano' como "la sección" (sagging-only V1). Sin label.
        <PerSectionArmado state={state} setField={setField} sectionKind="vano" hideSolicitations={hideSolicitations} />
      ) : (
        <PerSectionArmado state={state} setField={setField} sectionKind={isVano ? 'vano' : 'apoyo'} hideSolicitations={hideSolicitations} />
      )}

    </div>
  );
}
