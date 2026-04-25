import React, { useState, useEffect } from 'react';
import { type PunchingInputs, type PunchingMode, type PunchingPosition } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams, getBarArea } from '../../data/rebar';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface PunchingInputsProps {
  state: PunchingInputs;
  setField: (field: string, value: PunchingInputs[keyof PunchingInputs]) => void;
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
  field: string;
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
    <div className="flex items-center justify-between py-0.75 gap-2">
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
  setField: PunchingInputsProps['setField'];
}) {
  const resolved = labelKey
    ? LABELS[labelKey].sym
      ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort }
      : { label: LABELS[labelKey].descShort, sub: undefined as string | undefined }
    : { label: label ?? '', sub: undefined as string | undefined };
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <InputLabel htmlFor={`select-${field}`} label={resolved.label} sub={resolved.sub} />
      <select
        id={`select-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          setField(field, isNaN(asNum) ? raw : asNum);
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
      className="flex items-center justify-between py-0.75"
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

const MODES: Array<{ value: PunchingMode; label: string; Svg: () => React.ReactElement }> = [
  { value: 'pilar',         label: 'Pilar',         Svg: SvgPilar },
  { value: 'carga-puntual', label: 'Carga puntual', Svg: SvgCargaPuntual },
];

const POSITION_OPTIONS: Array<{ value: PunchingPosition; label: string }> = [
  { value: 'interior', label: 'Interior' },
  { value: 'borde',    label: 'Borde' },
  { value: 'esquina',  label: 'Esquina' },
];

const FCK_OPTIONS  = availableFck.map((v) => ({ value: v, label: `${v} MPa` }));
const BAR_DIAM_OPTIONS = availableBarDiams.map((v) => ({ value: v, label: `Ø ${v}` }));
const SW_DIAM_OPTIONS  = [6, 8, 10, 12].map((v) => ({ value: v, label: `Ø ${v}` }));
const SW_LEGS_OPTIONS  = [2, 3, 4, 5, 6].map((v) => ({ value: v, label: `${v}` }));

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
              <div className="flex items-center justify-between py-0.75">
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
    </div>
  );
}
