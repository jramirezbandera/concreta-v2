import React, { useState, useEffect } from 'react';
import {
  type CompositeSectionInputs,
  type CompositeSectionMode,
  type PlateEntry,
  type SteelGrade,
} from '../../data/defaults';
import { getSizesForTipo } from '../../data/steelProfiles';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';

interface Props {
  state: CompositeSectionInputs;
  addPlate: () => void;
  removePlate: (id: string) => void;
  updatePlate: (id: string, field: keyof PlateEntry, val: PlateEntry[keyof PlateEntry]) => void;
  setField: <K extends keyof CompositeSectionInputs>(k: K, v: CompositeSectionInputs[K]) => void;
}

// ── Local field components ────────────────────────────────────────────────────

function NumField({
  label,
  value,
  unit,
  onChange,
  id,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
  id: string;
}) {
  const [local, setLocal] = useState(() => String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={id} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
      </label>
      <div className="flex shrink-0">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(n);
          }}
          onBlur={() => {
            const n = parseFloat(local);
            if (isNaN(n)) setLocal(String(value));
          }}
          className="w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors"
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
  labelKey,
  label,
  id,
  value,
  options,
  onChange,
}: {
  labelKey?: LabelKey;
  label?: string;
  id: string;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  onChange: (v: string | number) => void;
}) {
  const resolved = labelKey
    ? LABELS[labelKey].sym
      ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort }
      : { label: LABELS[labelKey].descShort, sub: undefined as string | undefined }
    : { label: label ?? '', sub: undefined as string | undefined };
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={id} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          onChange(isNaN(asNum) ? raw : asNum);
        }}
        className="shrink-0 bg-bg-primary border border-border-main rounded px-1.75 py-1 text-[12px] text-text-primary font-mono outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── SVG mode icons ────────────────────────────────────────────────────────────

function SvgCustom() {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
      <rect x="1"  y="1"  width="26" height="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5"  y="5"  width="18" height="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1"  y="9"  width="26" height="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SvgReinforced() {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
      {/* cover plate */}
      <rect x="3"  y="0"  width="22" height="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* top flange */}
      <rect x="5"  y="3"  width="18" height="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* web */}
      <rect x="12" y="5.5" width="4" height="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* bottom flange */}
      <rect x="5"  y="8.5" width="18" height="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

const MODES: Array<{ value: CompositeSectionMode; label: string; Svg: () => React.ReactElement }> = [
  { value: 'custom',     label: 'Desde cero', Svg: SvgCustom },
  { value: 'reinforced', label: 'Perfil base', Svg: SvgReinforced },
];

// ── Options ───────────────────────────────────────────────────────────────────

const TIPO_OPTIONS = [
  { value: 'IPE', label: 'IPE' },
  { value: 'HEA', label: 'HEA' },
  { value: 'HEB', label: 'HEB' },
];

const GRADE_OPTIONS: Array<{ value: SteelGrade; label: string }> = [
  { value: 'S235', label: 'S235' },
  { value: 'S275', label: 'S275' },
  { value: 'S355', label: 'S355' },
  { value: 'S450', label: 'S450' },
];

const POS_OPTIONS_REINFORCED = [
  { value: 'top',    label: 'Ala superior' },
  { value: 'bottom', label: 'Ala inferior' },
  { value: 'left',   label: 'Lateral izq.' },
  { value: 'right',  label: 'Lateral der.' },
  { value: 'custom', label: 'Personalizada' },
];

const POS_OPTIONS_CUSTOM = [
  { value: 'top',    label: 'Superior (apilar)' },
  { value: 'bottom', label: 'Inferior (apilar)' },
  { value: 'custom', label: 'Personalizada' },
];

const MAX_PLATES = 6;

// ── Component ─────────────────────────────────────────────────────────────────

export function CompositeSectionInputsPanel({ state, addPlate, removePlate, updatePlate, setField }: Props) {
  const mode = state.mode;
  const sizeOptions = getSizesForTipo(state.profileType).map((s) => ({ value: s, label: String(s) }));
  const posOptions = mode === 'reinforced' ? POS_OPTIONS_REINFORCED : POS_OPTIONS_CUSTOM;

  return (
    <div className="flex flex-col" aria-label="Datos de entrada — Sección compuesta">

      {/* Mode toggle */}
      <div
        role="radiogroup"
        aria-label="Modo de sección"
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
                if (e.key === 'ArrowRight') setField('mode', MODES[(idx + 1) % MODES.length].value);
                if (e.key === 'ArrowLeft')  setField('mode', MODES[(idx - 1 + MODES.length) % MODES.length].value);
              }}
              className={[
                'flex-1 flex flex-col items-center gap-1 py-1.5 px-0 transition-colors',
                isActive ? 'bg-accent/10 text-accent' : 'text-text-disabled hover:text-text-secondary',
              ].join(' ')}
            >
              <Svg />
              <span className="text-[10px] font-mono">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Profile (reinforced mode only) */}
      {mode === 'reinforced' && (
        <CollapsibleSection label="Sección base">
          <SelectField
            labelKey="profile_type"
            id="cs-tipo"
            value={state.profileType}
            options={TIPO_OPTIONS}
            onChange={(v) => {
              const tipo = v as 'IPE' | 'HEA' | 'HEB';
              const sizes = getSizesForTipo(tipo);
              setField('profileType', tipo);
              setField('profileSize', sizes[0] ?? 300);
            }}
          />
          <SelectField
            labelKey="profile_size"
            id="cs-size"
            value={state.profileSize}
            options={sizeOptions}
            onChange={(v) => setField('profileSize', v as number)}
          />
        </CollapsibleSection>
      )}

      {/* Steel grade */}
      <CollapsibleSection label="Material">
        <SelectField
          labelKey="steel_grade"
          id="cs-grade"
          value={state.grade}
          options={GRADE_OPTIONS}
          onChange={(v) => setField('grade', v as SteelGrade)}
        />
      </CollapsibleSection>

      {/* Plates */}
      <CollapsibleSection label="Chapas añadidas">
        {state.plates.length === 0 && (
          <div className="border border-dashed border-border-main rounded px-3 py-3 mb-2 flex items-center justify-center">
            <span className="text-[11px] text-text-disabled">Añade al menos una chapa</span>
          </div>
        )}

        {state.plates.map((plate, idx) => (
          <div key={plate.id} className="border border-border-sub rounded p-2 mb-2">
            {/* Card header */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-[0.07em]">
                Chapa {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => removePlate(plate.id)}
                aria-label={`Eliminar chapa ${idx + 1}`}
                className="text-[14px] leading-none text-text-disabled hover:text-state-fail transition-colors px-1 -mr-0.5"
              >
                ×
              </button>
            </div>

            {/* Fields */}
            <SelectField
              label="Posición"
              id={`cs-pos-${plate.id}`}
              value={plate.posType}
              options={posOptions}
              onChange={(v) => updatePlate(plate.id, 'posType', v as PlateEntry['posType'])}
            />

            {/* b and t — 2 col grid on mobile (md: stacked rows as normal) */}
            <div className="md:contents grid grid-cols-2 gap-x-2">
              <NumField
                label="b"
                id={`cs-b-${plate.id}`}
                value={plate.b}
                unit="mm"
                onChange={(v) => updatePlate(plate.id, 'b', v)}
              />
              {plate.posType !== 'left' && plate.posType !== 'right' && (
                <NumField
                  label="t"
                  id={`cs-t-${plate.id}`}
                  value={plate.t}
                  unit="mm"
                  onChange={(v) => updatePlate(plate.id, 't', v)}
                />
              )}
              {(plate.posType === 'left' || plate.posType === 'right') && (
                <div className="flex items-center py-0.75 col-span-1">
                  <span className="text-[10px] text-text-disabled italic">
                    h = altura alma
                  </span>
                </div>
              )}
            </div>

            {plate.posType === 'custom' && (
              <NumField
                label="y inf."
                id={`cs-ybot-${plate.id}`}
                value={plate.customYBottom}
                unit="mm"
                onChange={(v) => updatePlate(plate.id, 'customYBottom', v)}
              />
            )}
          </div>
        ))}

        {/* Add plate button */}
        <button
          type="button"
          onClick={addPlate}
          disabled={state.plates.length >= MAX_PLATES}
          className={[
            'w-full border border-dashed border-border-main rounded px-3 py-1.5',
            'text-[12px] text-text-secondary hover:text-text-primary hover:border-text-disabled',
            'transition-colors flex items-center justify-center gap-2',
            state.plates.length >= MAX_PLATES ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
          ].join(' ')}
          aria-label="Añadir chapa"
        >
          <span>+ Añadir chapa</span>
          <span className="text-[10px] text-text-disabled font-mono">
            {state.plates.length}/{MAX_PLATES}
          </span>
        </button>
      </CollapsibleSection>
    </div>
  );
}
