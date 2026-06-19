import React, { useState, useEffect } from 'react';
import { type PunchingInputs, type PunchingMode, type PunchingPosition, type CrucetaColType, type CrucetaSteel } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams, getBarArea } from '../../data/rebar';
import { getSizesForTipo, getSizesUPN } from '../../data/steelProfiles';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface PunchingInputsProps {
  state: PunchingInputs;
  setField: <K extends keyof PunchingInputs>(field: K, value: PunchingInputs[K]) => void;
}

function NumField({
  labelKey,
  label,
  sub,
  help,
  field,
  value,
  unit,
  setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  sub?: string;
  help?: string;
  field: keyof PunchingInputs;
  value: number;
  unit?: string;
  setField: PunchingInputsProps['setField'];
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '—' ? '' : resolved.unit;
  const [localStr, setLocalStr] = useState(() => String(value));

  useEffect(() => {
    setLocalStr(String(value));
  }, [value]);

  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel
        htmlFor={`input-${field}`}
        labelKey={labelKey}
        label={labelKey ? undefined : resolved.label}
        sub={labelKey ? undefined : resolved.sub}
        help={help}
      />
      <div className="flex shrink-0">
        <input
          id={`input-${field}`}
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
  help,
  field,
  value,
  options,
  setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  help?: string;
  field: keyof PunchingInputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: PunchingInputsProps['setField'];
}) {
  const resolved = labelKey
    ? LABELS[labelKey].sym
      ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort }
      : { label: LABELS[labelKey].descShort, sub: undefined as string | undefined }
    : { label: label ?? '', sub: undefined as string | undefined };
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel
        htmlFor={`select-${field}`}
        labelKey={labelKey}
        label={labelKey ? undefined : resolved.label}
        sub={labelKey ? undefined : resolved.sub}
        help={help}
      />
      <select
        id={`select-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          // Cast: option values are controlled by the caller and match Inputs[field]'s union.
          setField(field, (isNaN(asNum) ? raw : asNum) as PunchingInputs[typeof field]);
        }}
        className="shrink-0 bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] text-text-primary font-mono outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
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


function ToggleButton({
  label,
  help,
  active,
  disabled,
  disabledTitle,
  onClick,
}: {
  label: string;
  help?: string;
  active: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  onClick: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between py-0.75 max-lg:min-h-11"
      title={disabled ? disabledTitle : undefined}
    >
      <span className="flex items-center gap-1 min-w-0">
        <span className="text-[13px] text-text-secondary">{label}</span>
        {help && <HelpTooltip text={help} fieldLabel={label} />}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        disabled={disabled}
        onClick={onClick}
        className={[
          'px-2.5 py-0.75 rounded border text-[11px] font-mono transition-colors',
          active
            ? 'bg-accent/10 border-accent/40 text-accent'
            : 'bg-bg-primary border-border-main text-text-disabled hover:text-text-secondary',
          disabled ? 'opacity-50 pointer-events-none cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        {active ? 'Activo' : 'Inactivo'}
      </button>
    </div>
  );
}

// ── SVG schematics for mode buttons ──────────────────────────────────────────

function SvgPilar() {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
      {/* slab */}
      <rect x="1" y="2" width="26" height="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* column stub below */}
      <rect x="10" y="6" width="8" height="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* upward force arrow inside column */}
      <line x1="14" y1="13" x2="14" y2="9" stroke="currentColor" strokeWidth="1.2" />
      <polygon points="14,6 11,9.5 17,9.5" fill="currentColor" />
    </svg>
  );
}

function SvgCargaPuntual() {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
      {/* downward load arrow */}
      <line x1="14" y1="0" x2="14" y2="5" stroke="currentColor" strokeWidth="1.2" />
      <polygon points="14,8 11,4 17,4" fill="currentColor" />
      {/* slab */}
      <rect x="1" y="8" width="26" height="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SvgCruceta() {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
      {/* cruciform plan: central plate + 4 arms */}
      <rect x="11" y="5" width="6" height="4" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <line x1="1"  y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.4" />
      <line x1="17" y1="7" x2="27" y2="7" stroke="currentColor" strokeWidth="1.4" />
      <line x1="14" y1="1" x2="14" y2="5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="14" y1="9" x2="14" y2="13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

const MODES: Array<{ value: PunchingMode; label: string; Svg: () => React.ReactElement }> = [
  { value: 'pilar',         label: 'Pilar',         Svg: SvgPilar },
  { value: 'carga-puntual', label: 'Carga puntual', Svg: SvgCargaPuntual },
  { value: 'pilar-cruceta', label: 'Cruceta',       Svg: SvgCruceta },
];

const COL_TYPE_OPTIONS: Array<{ value: CrucetaColType; label: string }> = [
  { value: 'HEB', label: 'HEB' },
  { value: 'HEA', label: 'HEA' },
  { value: 'IPE', label: 'IPE' },
];
const STEEL_GRADE_OPTIONS: Array<{ value: CrucetaSteel; label: string }> = [
  { value: 'S275', label: 'S275' },
  { value: 'S355', label: 'S355' },
];
const UPN_SIZE_OPTIONS = getSizesUPN().map((v) => ({ value: v, label: `UPN ${v}` }));

const POSITION_OPTIONS: Array<{ value: PunchingPosition; label: string }> = [
  { value: 'interior', label: 'Interior' },
  { value: 'borde',    label: 'Borde' },
  { value: 'esquina',  label: 'Esquina' },
];

const FCK_OPTIONS  = availableFck.map((v) => ({ value: v, label: `${v} MPa` }));
const BAR_DIAM_OPTIONS = availableBarDiams.map((v) => ({ value: v, label: `Ø ${v}` }));
const SW_DIAM_OPTIONS  = [6, 8, 10, 12].map((v) => ({ value: v, label: `Ø ${v}` }));
const SW_LEGS_OPTIONS  = [2, 3, 4, 5, 6].map((v) => ({ value: v, label: `${v}` }));

// ── Cruceta-mode inputs (mode='pilar-cruceta') — RECORTADO a compañero de hand-calc ──
function CrucetaInputs({ state, setField }: PunchingInputsProps) {
  const colSizeOptions = getSizesForTipo(state.colType).map((v) => ({
    value: v, label: `${state.colType} ${v}`,
  }));
  const isEdge = state.position !== 'interior';
  const isCorner = state.position === 'esquina';
  return (
    <div className="flex flex-col" aria-label="Datos de entrada — Crucetas">
      <p className="text-[10px] text-text-disabled mb-2 leading-snug">
        Punzonamiento conservador de la placa + datos del UPN; el reparto es tu hand-calc.
      </p>

      <CollapsibleSection label="Configuración">
        <SelectField label="Posición" field="position" value={state.position} options={POSITION_OPTIONS} setField={setField}
          help="Posición del soporte en la losa (interior, borde o esquina). Fija el coeficiente β de excentricidad y el perímetro crítico." />
        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: isEdge ? '140px' : '0px', opacity: isEdge ? 1 : 0 }}
        >
          <NumField label="Dist. al borde libre" sub="ay" field="edgeY" value={state.edgeY} unit="mm" setField={setField}
            help="Distancia libre desde la cara de la placa al borde libre de la losa." />
          {isCorner && (
            <NumField label="Dist. al 2º borde" sub="ax" field="edgeX" value={state.edgeX} unit="mm" setField={setField}
              help="Distancia al segundo borde libre (solo en posición de esquina)." />
          )}
          <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">
            Distancia libre de la cara de la placa al borde libre.
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection label="Pilar y placa de testa">
        <SelectField label="Perfil pilar" field="colType"  value={state.colType}  options={COL_TYPE_OPTIONS} setField={setField}
          help="Serie del perfil del pilar metálico que apoya en la cruceta." />
        <SelectField label="Tamaño"       field="colSize"  value={state.colSize}  options={colSizeOptions}   setField={setField}
          help="Designación del perfil del pilar dentro de la serie." />
        <NumField    label="Placa ancho"  sub="a" field="plateA" value={state.plateA} unit="mm" setField={setField}
          help="Ancho de la placa de testa que reparte la carga del pilar sobre la cruceta." />
        <NumField    label="Placa largo"  sub="b" field="plateB" value={state.plateB} unit="mm" setField={setField}
          help="Largo de la placa de testa." />
      </CollapsibleSection>

      <CollapsibleSection label="Cruceta UPN">
        <SelectField label="Perfil UPN" field="upnSize"    value={state.upnSize}    options={UPN_SIZE_OPTIONS}    setField={setField}
          help="Perfil UPN de los brazos de la cruceta." />
        <SelectField label="Acero"      field="steelGrade" value={state.steelGrade} options={STEEL_GRADE_OPTIONS} setField={setField}
          help="Grado del acero de la cruceta; fija el límite elástico fy." />
        <NumField    label="Garganta soldadura" sub="a"    field="weldThroat" value={state.weldThroat} unit="mm" setField={setField}
          help="Espesor de garganta del cordón de soldadura que une la cruceta." />
        <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">
          Se informan clase y capacidades (M_Rd, Vpl,Rd) del UPN para tu hand-calc del reparto.
        </p>
      </CollapsibleSection>

      <CollapsibleSection label="Hormigón">
        <NumField    label="Canto útil" sub="d" field="d" value={state.d} unit="mm" setField={setField}
          help="Canto útil de la losa: distancia de la fibra comprimida al centro de la armadura de tracción." />
        <SelectField labelKey="fck"     field="fck" value={state.fck} options={FCK_OPTIONS} setField={setField} />
        <NumField    labelKey="fyk"     field="fyk" value={state.fyk} setField={setField} />
        <SelectField label="Ø armado tracción" field="barDiamSup" value={state.barDiamSup} options={BAR_DIAM_OPTIONS} setField={setField}
          help="Diámetro del mallazo en la cara traccionada de la losa." />
        <NumField    label="Separación" sub="s" field="sSup" value={state.sSup} unit="mm" setField={setField}
          help="Separación del mallazo en la cara traccionada; con el diámetro define la cuantía ρl." />
        <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">
          Mallazo en la cara traccionada (para vRd,c del punzonamiento de la placa).
        </p>
      </CollapsibleSection>

      <CollapsibleSection label="Carga">
        <UnitNumberInput
          label="Axil N" sub="VEd" field="VEd"
          help="Axil de cálculo (ELU) transmitido por el pilar a la cruceta."
          value={state.VEd} quantity="force"
          onChange={(v) => setField('VEd', v)}
        />
        <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">Axil mayorado ELU</p>
      </CollapsibleSection>
    </div>
  );
}

export function PunchingInputsPanel({ state, setField }: PunchingInputsProps) {
  const mode     = state.mode as PunchingMode;
  const position = state.position as PunchingPosition;
  const isCircularDisabled = position !== 'interior';

  const cxLabel = mode === 'pilar' ? 'Dim. pilar x' : 'Dim. área x';
  const cyLabel = mode === 'pilar' ? 'Dim. pilar y' : 'Dim. área y';
  const vedLabel = mode === 'pilar' ? 'Reacción pilar' : 'Carga puntual';

  return (
    <div className="flex flex-col" aria-label="Datos de entrada — Punzonamiento">

      {/* MODE TOGGLE */}
      <div
        role="radiogroup"
        aria-label="Modo de cálculo"
        className="flex rounded border border-border-main mb-3 shrink-0 overflow-hidden"
      >
        {MODES.map(({ value, label, Svg }) => {
          const isActive = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setField('mode', value)}
              onKeyDown={(e) => {
                const idx = MODES.findIndex((m) => m.value === value);
                if (e.key === 'ArrowRight') {
                  setField('mode', MODES[(idx + 1) % MODES.length].value);
                } else if (e.key === 'ArrowLeft') {
                  setField('mode', MODES[(idx - 1 + MODES.length) % MODES.length].value);
                }
              }}
              className={[
                'flex-1 flex flex-col items-center gap-1 py-1.5 px-0 transition-colors',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-disabled hover:text-text-secondary',
              ].join(' ')}
            >
              <Svg />
              <span className="text-[10px] font-mono">{label}</span>
            </button>
          );
        })}
      </div>

      {mode === 'pilar-cruceta' && (
        <CrucetaInputs state={state} setField={setField} />
      )}

      {mode !== 'pilar-cruceta' && (<>
      {/* GEOMETRÍA */}
      <CollapsibleSection label="Geometría">
        <NumField label={cxLabel} sub="Cx" field="cx" value={state.cx as number} unit="mm" setField={setField}
          help="Dimensión del pilar (o del área cargada) en dirección x. Define el perímetro del soporte." />
        <NumField label={cyLabel} sub="Cy" field="cy" value={state.cy as number} unit="mm" setField={setField}
          help="Dimensión del pilar (o del área cargada) en dirección y. Define el perímetro del soporte." />
        <ToggleButton
          label="Circular"
          help="Marca si el soporte es de sección circular en lugar de rectangular (solo posición interior)."
          active={state.isCircular as boolean}
          disabled={isCircularDisabled}
          disabledTitle="Solo para posición interior"
          onClick={() => setField('isCircular', !(state.isCircular as boolean))}
        />
        <NumField labelKey="d_effective" field="d" value={state.d as number} setField={setField} />
      </CollapsibleSection>

      {/* MATERIALES */}
      <CollapsibleSection label="Materiales">
        <SelectField labelKey="fck" field="fck" value={state.fck as number} options={FCK_OPTIONS} setField={setField} />
        <NumField labelKey="fyk" field="fyk" value={state.fyk as number} setField={setField} />
      </CollapsibleSection>

      {/* ARMADO DE FLEXIÓN */}
      <CollapsibleSection label="Armado de flexión">
        {/* Supuesto del motor (auditoría #135): ρl = √(ρx·ρy) colapsa a ρ
          * solo si la malla es igual en ambas direcciones ortogonales. */}
        <p className="text-[10px] text-text-disabled mb-1.5 leading-tight">
          Malla supuesta IGUAL en ambas direcciones (ρl = √(ρx·ρy) = ρ)
        </p>
        <p className="text-[10px] text-text-disabled mb-1.5">Cara superior</p>
        <SelectField label="Diámetro" field="barDiamSup" value={state.barDiamSup as number} options={BAR_DIAM_OPTIONS} setField={setField}
          help="Diámetro de las barras de la malla de flexión en la cara superior." />
        <NumField label="Separación" sub="S" field="sSup" value={state.sSup as number} unit="mm" setField={setField}
          help="Separación entre barras de la malla superior; con el diámetro define la cuantía ρl." />
        <p className="text-[10px] text-text-disabled mt-2 mb-1.5">Cara inferior</p>
        <SelectField label="Diámetro" field="barDiamInf" value={state.barDiamInf as number} options={BAR_DIAM_OPTIONS} setField={setField}
          help="Diámetro de las barras de la malla de flexión en la cara inferior." />
        <NumField label="Separación" sub="S" field="sInf" value={state.sInf as number} unit="mm" setField={setField}
          help="Separación entre barras de la malla inferior; con el diámetro define la cuantía ρl." />
        {/* Derived ρl feedback — tension face */}
        {(() => {
          const isSup = mode === 'pilar';
          const diam = isSup ? state.barDiamSup as number : state.barDiamInf as number;
          const s    = isSup ? state.sSup as number       : state.sInf as number;
          const d    = state.d as number;
          if (s > 0 && d > 0 && diam > 0) {
            const rhoL = getBarArea(diam) / s / d;
            return (
              <div className="flex items-center justify-between py-0.75 max-lg:min-h-11">
                <span className="text-[10px] text-text-disabled">ρl cara tensión</span>
                <span className="text-[10px] font-mono text-text-secondary tabular-nums">
                  {(rhoL * 100).toFixed(3)}%
                </span>
              </div>
            );
          }
          return null;
        })()}
      </CollapsibleSection>

      {/* CARGA */}
      <CollapsibleSection label="Carga">
        <UnitNumberInput
          label={vedLabel} sub="VEd" field="VEd"
          help="Esfuerzo de punzonamiento de cálculo (ELU): reacción del pilar o carga puntual sobre la losa."
          value={state.VEd as number} quantity="force"
          onChange={(v) => setField('VEd', v)}
        />
        <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">Esfuerzo mayorado ELU</p>
        <SelectField
          label="Posición"
          help="Posición del soporte en la losa (interior, borde o esquina). Fija el coeficiente β de excentricidad y el perímetro crítico."
          field="position"
          value={state.position as string}
          options={POSITION_OPTIONS}
          setField={setField}
        />
      </CollapsibleSection>

      {/* ARMADO DE PUNZONAMIENTO */}
      <CollapsibleSection label="Armado de punzonamiento">
        <ToggleButton
          label="Con cercos tipo viga"
          help="Activa la armadura transversal de punzonamiento (cercos) cuando vEd supera vRd,c."
          active={state.hasShearReinf as boolean}
          onClick={() => setField('hasShearReinf', !(state.hasShearReinf as boolean))}
        />
        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: (state.hasShearReinf as boolean) ? '200px' : '0px', opacity: (state.hasShearReinf as boolean) ? 1 : 0 }}
        >
          <SelectField label="Ø cerco"   field="swDiam"  value={state.swDiam as number}  options={SW_DIAM_OPTIONS}  setField={setField}
            help="Diámetro de las barras del cerco de punzonamiento." />
          <SelectField label="Nº ramas"  field="swLegs"  value={state.swLegs as number}  options={SW_LEGS_OPTIONS}  setField={setField}
            help="Número de ramas de cerco cortadas por el perímetro de control." />
          <NumField    label="Separación" sub="Sr"        field="sr"     value={state.sr as number}     unit="mm"  setField={setField}
            help="Separación radial entre perímetros sucesivos de cercos." />
          <NumField    label="fywk"                       field="fywk"   value={state.fywk as number}   unit="MPa" setField={setField}
            help="Límite elástico característico del acero de los cercos de punzonamiento." />
        </div>
      </CollapsibleSection>
      </>)}
    </div>
  );
}
