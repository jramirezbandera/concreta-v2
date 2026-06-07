import React, { useState, useEffect } from 'react';
import { type PunchingInputs, type PunchingMode, type PunchingPosition, type CrucetaColType, type CrucetaSteel, type CrucetaSubstrate } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams, getBarArea } from '../../data/rebar';
import { getSizesForTipo, getSizesUPN } from '../../data/steelProfiles';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface PunchingInputsProps {
  state: PunchingInputs;
  setField: <K extends keyof PunchingInputs>(field: K, value: PunchingInputs[K]) => void;
  // Cruceta arm-length auto-fill (wired from index.tsx; mirrors steel-beams Lcr).
  armLengthDisplay?: number;   // L_eff,max when auto, manual value when overridden
  armLengthAuto?: boolean;     // true = auto-filled (badge active)
  onArmLengthChange?: (val: number) => void;
  onArmLengthAuto?: () => void; // re-enable auto
}

function NumField({
  labelKey,
  label,
  sub,
  field,
  value,
  unit,
  setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  sub?: string;
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
      <InputLabel htmlFor={`input-${field}`} label={resolved.label} sub={resolved.sub} />
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

// Arm length with auto-fill: badge shows "auto" (accent) when the field holds the
// computed L_eff,max; editing switches to manual. Clicking the badge re-enables auto.
function ArmLengthField({
  display, isAuto, onChange, onAuto,
}: {
  display: number; isAuto: boolean;
  onChange: (val: number) => void; onAuto: () => void;
}) {
  const [localStr, setLocalStr] = useState(() => String(display));
  useEffect(() => { setLocalStr(String(display)); }, [display]);
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel htmlFor="input-armLength" label="Longitud brazo" />
      <div className="flex items-center shrink-0 gap-1.5">
        <button
          type="button"
          onClick={onAuto}
          disabled={isAuto}
          className={`font-mono text-[9px] px-1.25 py-0.5 rounded transition-colors ${isAuto ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-text-disabled hover:text-accent cursor-pointer'}`}
          aria-label={isAuto ? 'Longitud calculada automáticamente' : 'Volver a auto'}
          title={isAuto ? 'L_eff,máx calculado' : 'Click para volver a auto'}
        >
          auto
        </button>
        <div className="flex">
          <input
            id="input-armLength"
            type="text"
            inputMode="decimal"
            value={localStr}
            onChange={(e) => {
              setLocalStr(e.target.value);
              const n = parseFloat(e.target.value);
              if (!isNaN(n) && n > 0) onChange(Math.round(n));
            }}
            onBlur={() => { const n = parseFloat(localStr); if (isNaN(n) || n <= 0) setLocalStr(String(display)); }}
            className="w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors"
            aria-label="Longitud del brazo (mm)"
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">mm</span>
        </div>
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
      <InputLabel htmlFor={`select-${field}`} label={resolved.label} sub={resolved.sub} />
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
  active,
  disabled,
  disabledTitle,
  onClick,
}: {
  label: string;
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
      <span className="text-[13px] text-text-secondary">{label}</span>
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
const SUBSTRATE_OPTIONS: Array<{ value: CrucetaSubstrate; label: string }> = [
  { value: 'zapata',  label: 'Zapata' },
  { value: 'forjado', label: 'Forjado' },
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

// ── Cruceta-mode inputs (mode='pilar-cruceta') ────────────────────────────────
function CrucetaInputs({ state, setField, armLengthDisplay, armLengthAuto, onArmLengthChange, onArmLengthAuto }: PunchingInputsProps) {
  const colSizeOptions = getSizesForTipo(state.colType).map((v) => ({
    value: v, label: `${state.colType} ${v}`,
  }));
  // Zapata y forjado admiten interior/borde/esquina (motor de perímetro truncado).
  // Forjado: armadura de punzonamiento (losa fina); borde/esquina añade concerns
  // de borde de losa marcados en amber en los resultados.
  const isZapata = state.substrate === 'zapata';
  const isForjado = !isZapata;
  const soilOpen = isZapata && state.soilRelief;
  const swOpen = isForjado && state.hasShearReinf;
  const isEdge = state.position !== 'interior';
  const isCorner = state.position === 'esquina';
  return (
    <div className="flex flex-col" aria-label="Datos de entrada — Crucetas">
      <CollapsibleSection label="Configuración">
        <SelectField label="Sustrato" field="substrate" value={state.substrate} options={SUBSTRATE_OPTIONS} setField={setField} />
        <SelectField label="Posición" field="position" value={state.position} options={POSITION_OPTIONS} setField={setField} />
        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: isEdge ? '140px' : '0px', opacity: isEdge ? 1 : 0 }}
        >
          <NumField label="Dist. al borde libre" sub="ay" field="edgeY" value={state.edgeY} unit="mm" setField={setField} />
          {isCorner && (
            <NumField label="Dist. al 2º borde" sub="ax" field="edgeX" value={state.edgeX} unit="mm" setField={setField} />
          )}
          <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">
            Distancia libre de la cara de la placa al borde libre{isForjado ? ' de la losa' : ' de la zapata'}.
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection label="Pilar y placa de testa">
        <SelectField label="Perfil pilar" field="colType"  value={state.colType}  options={COL_TYPE_OPTIONS} setField={setField} />
        <SelectField label="Tamaño"       field="colSize"  value={state.colSize}  options={colSizeOptions}   setField={setField} />
        <NumField    label="Placa ancho"  sub="a" field="plateA" value={state.plateA} unit="mm" setField={setField} />
        <NumField    label="Placa largo"  sub="b" field="plateB" value={state.plateB} unit="mm" setField={setField} />
        <NumField    label="Placa espesor" sub="t" field="plateT" value={state.plateT} unit="mm" setField={setField} />
      </CollapsibleSection>

      <CollapsibleSection label="Cruceta UPN">
        <SelectField label="Perfil UPN" field="upnSize"    value={state.upnSize}    options={UPN_SIZE_OPTIONS}    setField={setField} />
        <SelectField label="Acero"      field="steelGrade" value={state.steelGrade} options={STEEL_GRADE_OPTIONS} setField={setField} />
        <NumField    label="Luz del vano"  sub="luz" field="spanL" value={state.spanL} unit="mm" setField={setField} />
        <ArmLengthField
          display={armLengthDisplay ?? state.armLength}
          isAuto={armLengthAuto ?? true}
          onChange={(v) => (onArmLengthChange ? onArmLengthChange(v) : setField('armLength', v))}
          onAuto={() => (onArmLengthAuto ? onArmLengthAuto() : setField('armLength', 0))}
        />
        <NumField    label="Garganta soldadura" sub="a"    field="weldThroat" value={state.weldThroat} unit="mm" setField={setField} />
      </CollapsibleSection>

      <CollapsibleSection label={isZapata ? 'Zapata' : 'Losa de transferencia'}>
        <NumField    label={isZapata ? 'Canto útil zapata' : 'Canto útil losa'} sub="d" field="d" value={state.d} unit="mm" setField={setField} />
        <SelectField labelKey="fck"         field="fck" value={state.fck} options={FCK_OPTIONS} setField={setField} />
        <NumField    labelKey="fyk"         field="fyk" value={state.fyk} setField={setField} />
        <SelectField label="Ø armado tracción" field="barDiamSup" value={state.barDiamSup} options={BAR_DIAM_OPTIONS} setField={setField} />
        <NumField    label="Separación"     sub="s" field="sSup" value={state.sSup} unit="mm" setField={setField} />
        <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">
          {isZapata ? 'Mallazo en la cara traccionada (inferior de la zapata).'
                    : 'Mallazo en la cara traccionada (según signo del momento sobre el pilar).'}
        </p>
        <ToggleButton
          label="Espiral de confinamiento (§6.7)"
          active={state.hasSpiral}
          onClick={() => setField('hasSpiral', !state.hasSpiral)}
        />
        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: state.hasSpiral ? '90px' : '0px', opacity: state.hasSpiral ? 1 : 0 }}
        >
          <p className="text-[10px] text-text-disabled mb-1">
            Sube el apoyo del núcleo a f_Rdu = fcd·√(Ac1/Ac0) ≤ 3·fcd. Solo capacidad de apoyo
            (V_cap); no toca el punzonamiento.
          </p>
          <NumField label="Ø núcleo confinado" sub="Dn" field="spiralD" value={state.spiralD} unit="mm" setField={setField} />
        </div>
        <ToggleButton
          label="Cercos de cosido entre crucetas"
          active={state.hasConfTies}
          onClick={() => setField('hasConfTies', !state.hasConfTies)}
        />
        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: state.hasConfTies ? '110px' : '0px', opacity: state.hasConfTies ? 1 : 0 }}
        >
          <p className="text-[10px] text-text-disabled mb-1">
            Cosen el plano horizontal a la cota de la cruz (delaminación, cortante de interfaz §6.2.5).
            NO son los anillos de punzonamiento de la losa.
          </p>
          <SelectField label="Ø cerco cosido" field="confTieD" value={state.confTieD} options={SW_DIAM_OPTIONS} setField={setField} />
          <NumField    label="Separación" sub="s" field="confTieS" value={state.confTieS} unit="mm" setField={setField} />
        </div>
      </CollapsibleSection>

      {isForjado && (
        <CollapsibleSection label="Detalle de armado">
          <p className="text-[10px] text-text-disabled mb-1.5">
            Esquema estándar: marca lo que dispones para que esos estados límite dejen de ser
            "verificar a mano".
          </p>
          <ToggleButton
            label="Cruceta pasante soldada al pilar"
            active={state.armThrough}
            onClick={() => setField('armThrough', !state.armThrough)}
          />
          <ToggleButton
            label="Armadura de reparto superior (atado)"
            active={state.hasRepartoSup}
            onClick={() => setField('hasRepartoSup', !state.hasRepartoSup)}
          />
          <ToggleButton
            label="Armadura de reparto inferior"
            active={state.hasRepartoInf}
            onClick={() => setField('hasRepartoInf', !state.hasRepartoInf)}
          />
        </CollapsibleSection>
      )}

      <CollapsibleSection label="Carga">
        <UnitNumberInput
          label="Axil N" sub="VEd" field="VEd"
          value={state.VEd} quantity="force"
          onChange={(v) => setField('VEd', v)}
        />
        <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">Axil mayorado ELU</p>

        {isZapata && (
          <ToggleButton
            label="Descontar presión terreno"
            active={soilOpen}
            onClick={() => setField('soilRelief', !state.soilRelief)}
          />
        )}
        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: soilOpen ? '160px' : '0px', opacity: soilOpen ? 1 : 0 }}
        >
          <NumField label="Zapata ancho"  sub="B"  field="footB"        value={state.footB}        unit="mm"   setField={setField} />
          <NumField label="Zapata largo"  sub="L"  field="footL"        value={state.footL}        unit="mm"   setField={setField} />
          <NumField label="Presión terreno" sub="σt" field="soilPressure" value={state.soilPressure} unit="kN/m²" setField={setField} />
        </div>

        {/* Concentración Kj (EC3 placa) retirada: el rediseño 2026-06-07 modela la
            cruz EMBEBIDA confinada, no una placa que apoya. El confinamiento >fcd
            (área parcialmente cargada §6.7) queda pendiente del hand-calc. */}

        {isForjado && (<>
          <ToggleButton
            label="Armadura de punzonamiento de la losa (anillos)"
            active={swOpen}
            onClick={() => setField('hasShearReinf', !state.hasShearReinf)}
          />
          <div
            className="overflow-hidden transition-all duration-150"
            style={{ maxHeight: swOpen ? '220px' : '0px', opacity: swOpen ? 1 : 0 }}
          >
            <p className="text-[10px] text-text-disabled mb-1">
              Cercos/studs en anillos en la LOSA alrededor de la cruz (cosen el cono a 2d) → vRd,cs (CE 6.4.5).
              NO son los cercos de confinamiento entre las UPN (eso sube f por §6.7, no modelado aún).
            </p>
            <SelectField label="Ø cerco"    field="swDiam" value={state.swDiam} options={SW_DIAM_OPTIONS} setField={setField} />
            <SelectField label="Nº ramas"   field="swLegs" value={state.swLegs} options={SW_LEGS_OPTIONS} setField={setField} />
            <NumField    label="Sep. radial" sub="sr" field="sr"   value={state.sr}   unit="mm" setField={setField} />
            <NumField    label="fywk"        field="fywk" value={state.fywk} unit="MPa" setField={setField} />
          </div>
        </>)}
      </CollapsibleSection>
    </div>
  );
}

export function PunchingInputsPanel({ state, setField, armLengthDisplay, armLengthAuto, onArmLengthChange, onArmLengthAuto }: PunchingInputsProps) {
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
        <CrucetaInputs
          state={state} setField={setField}
          armLengthDisplay={armLengthDisplay} armLengthAuto={armLengthAuto}
          onArmLengthChange={onArmLengthChange} onArmLengthAuto={onArmLengthAuto}
        />
      )}

      {mode !== 'pilar-cruceta' && (<>
      {/* GEOMETRÍA */}
      <CollapsibleSection label="Geometría">
        <NumField label={cxLabel} sub="Cx" field="cx" value={state.cx as number} unit="mm" setField={setField} />
        <NumField label={cyLabel} sub="Cy" field="cy" value={state.cy as number} unit="mm" setField={setField} />
        <ToggleButton
          label="Circular"
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
        <p className="text-[10px] text-text-disabled mb-1.5">Cara superior</p>
        <SelectField label="Diámetro" field="barDiamSup" value={state.barDiamSup as number} options={BAR_DIAM_OPTIONS} setField={setField} />
        <NumField label="Separación" sub="S" field="sSup" value={state.sSup as number} unit="mm" setField={setField} />
        <p className="text-[10px] text-text-disabled mt-2 mb-1.5">Cara inferior</p>
        <SelectField label="Diámetro" field="barDiamInf" value={state.barDiamInf as number} options={BAR_DIAM_OPTIONS} setField={setField} />
        <NumField label="Separación" sub="S" field="sInf" value={state.sInf as number} unit="mm" setField={setField} />
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
          value={state.VEd as number} quantity="force"
          onChange={(v) => setField('VEd', v)}
        />
        <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">Esfuerzo mayorado ELU</p>
        <SelectField
          label="Posición"
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
          active={state.hasShearReinf as boolean}
          onClick={() => setField('hasShearReinf', !(state.hasShearReinf as boolean))}
        />
        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: (state.hasShearReinf as boolean) ? '200px' : '0px', opacity: (state.hasShearReinf as boolean) ? 1 : 0 }}
        >
          <SelectField label="Ø cerco"   field="swDiam"  value={state.swDiam as number}  options={SW_DIAM_OPTIONS}  setField={setField} />
          <SelectField label="Nº ramas"  field="swLegs"  value={state.swLegs as number}  options={SW_LEGS_OPTIONS}  setField={setField} />
          <NumField    label="Separación" sub="Sr"        field="sr"     value={state.sr as number}     unit="mm"  setField={setField} />
          <NumField    label="fywk"                       field="fywk"   value={state.fywk as number}   unit="MPa" setField={setField} />
        </div>
      </CollapsibleSection>
      </>)}
    </div>
  );
}
