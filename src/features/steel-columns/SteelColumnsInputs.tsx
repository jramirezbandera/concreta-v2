import React, { useEffect } from 'react';
import { type SteelColumnInputs, type ColumnBCType } from '../../data/defaults';
import { getSizesForTipo, getSizesUPN } from '../../data/steelProfiles';
import { getBetaForBCType } from '../../lib/calculations/steelColumnBC';

interface SteelColumnsInputsProps {
  state: SteelColumnInputs;
  setField: (field: keyof SteelColumnInputs, value: SteelColumnInputs[keyof SteelColumnInputs]) => void;
}

// ── Boundary condition SVG buttons (10×28px vertical viewBox) ─────────────────

function SvgPP() {
  return (
    <svg width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      <line x1="5" y1="5" x2="5" y2="23" stroke="currentColor" strokeWidth="1.5" />
      {/* Top pin — apex touches column at y=5, base opens upward to y=2 */}
      <polygon points="5,5 2,2 8,2" fill="none" stroke="currentColor" strokeWidth="1.25" />
      {/* Bottom pin — apex touches column at y=23, base opens downward to y=26 */}
      <polygon points="5,23 2,26 8,26" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function SvgPF() {
  return (
    <svg width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      <line x1="5" y1="5" x2="5" y2="23" stroke="currentColor" strokeWidth="1.5" />
      {/* Top pin — apex touches column at y=5, base opens upward to y=2 */}
      <polygon points="5,5 2,2 8,2" fill="none" stroke="currentColor" strokeWidth="1.25" />
      {/* Bottom wall hatch */}
      <rect x="0" y="23" width="10" height="5" fill="currentColor" opacity="0.35" />
      <line x1="0" y1="23" x2="5" y2="28" stroke="currentColor" strokeWidth="0.75" />
      <line x1="5" y1="23" x2="10" y2="28" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  );
}

function SvgFF() {
  return (
    <svg width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      {/* Top wall hatch */}
      <rect x="0" y="0" width="10" height="5" fill="currentColor" opacity="0.35" />
      <line x1="0" y1="2" x2="5" y2="5" stroke="currentColor" strokeWidth="0.75" />
      <line x1="5" y1="2" x2="10" y2="5" stroke="currentColor" strokeWidth="0.75" />
      <line x1="5" y1="5" x2="5" y2="23" stroke="currentColor" strokeWidth="1.5" />
      {/* Bottom wall hatch */}
      <rect x="0" y="23" width="10" height="5" fill="currentColor" opacity="0.35" />
      <line x1="0" y1="23" x2="5" y2="28" stroke="currentColor" strokeWidth="0.75" />
      <line x1="5" y1="23" x2="10" y2="28" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  );
}

function SvgFC() {
  return (
    <svg width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      {/* Top free end — open circle */}
      <circle cx="5" cy="3" r="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <line x1="5" y1="5" x2="5" y2="23" stroke="currentColor" strokeWidth="1.5" />
      {/* Bottom wall hatch (fixed base) */}
      <rect x="0" y="23" width="10" height="5" fill="currentColor" opacity="0.35" />
      <line x1="0" y1="23" x2="5" y2="28" stroke="currentColor" strokeWidth="0.75" />
      <line x1="5" y1="23" x2="10" y2="28" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  );
}

function SvgCustom() {
  return (
    <svg width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      <circle cx="5" cy="3" r="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <line x1="5" y1="5" x2="5" y2="23" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,2" />
      <circle cx="5" cy="25" r="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

const BC_OPTIONS: Array<{ type: ColumnBCType; label: string; Svg: () => React.ReactElement; tooltip: string }> = [
  { type: 'pp',     label: 'Art-Art',   Svg: SvgPP,     tooltip: 'Articulado–Articulado  β=1.0' },
  { type: 'pf',     label: 'Art-Emp',   Svg: SvgPF,     tooltip: 'Articulado–Empotrado  β=0.7' },
  { type: 'ff',     label: 'Emp-Emp',   Svg: SvgFF,     tooltip: 'Empotrado–Empotrado  β=0.5' },
  { type: 'fc',     label: 'Ménsula',   Svg: SvgFC,     tooltip: 'Empotrado–Libre  β=2.0' },
  { type: 'custom', label: 'β lib.',    Svg: SvgCustom, tooltip: 'Coeficientes personalizados' },
];

// ── Shared field components ───────────────────────────────────────────────────

function NumField({
  label, sub, id, value, unit, min, step, onChange,
}: {
  label: string; sub?: string; id: string; value: number; unit: string;
  min?: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={id} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) onChange(n); }}
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
  label, id, value, options, onChange,
}: {
  label: string; id: string; value: string | number;
  options: Array<{ value: string | number; label: string }>;
  onChange: (v: string | number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={id} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const num = Number(raw);
          onChange(isNaN(num) || raw === '' ? raw : num);
        }}
        className="bg-bg-primary border border-border-main rounded px-1.5 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors max-w-40"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function BCSelector({
  active, onSelect, groupLabel,
}: {
  active: ColumnBCType;
  onSelect: (bc: ColumnBCType) => void;
  groupLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={groupLabel}
      className="flex rounded border border-border-main overflow-hidden mb-1"
    >
      {BC_OPTIONS.map(({ type, label, Svg, tooltip }) => {
        const isActive = active === type;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={isActive}
            aria-label={tooltip}
            title={tooltip}
            onClick={() => onSelect(type)}
            onKeyDown={(e) => {
              const idx = BC_OPTIONS.findIndex((o) => o.type === type);
              if (e.key === 'ArrowRight') onSelect(BC_OPTIONS[(idx + 1) % BC_OPTIONS.length].type);
              else if (e.key === 'ArrowLeft') onSelect(BC_OPTIONS[(idx - 1 + BC_OPTIONS.length) % BC_OPTIONS.length].type);
            }}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-0 min-h-11 transition-colors
              ${isActive ? 'bg-accent/10 text-accent' : 'text-text-disabled hover:text-text-secondary'}`}
          >
            <Svg />
            <span className="text-[10px] font-mono leading-none">{label}</span>
          </button>
        );
      })}
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

/** Read-only beta display row (auto mode) */
function BetaAutoRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <span className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-mono text-[12px] text-text-primary tabular-nums">{value.toFixed(2)}</span>
        <span className="bg-bg-elevated text-text-disabled font-mono text-[10px] px-1 py-0.5 rounded">auto</span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SteelColumnsInputs({ state, setField }: SteelColumnsInputsProps) {
  const isBox = state.sectionType === '2UPN';
  const availableSizes = isBox ? getSizesUPN() : getSizesForTipo(state.sectionType as 'HEA' | 'HEB' | 'IPE');

  // When sectionType changes, snap size to first available if current is invalid
  useEffect(() => {
    if (!availableSizes.includes(state.size)) {
      setField('size', availableSizes[0] ?? 160);
    }
  }, [state.sectionType]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleBCType(bc: ColumnBCType) {
    setField('bcType', bc);
    if (bc !== 'custom') {
      const { beta_y, beta_z } = getBetaForBCType(bc, state.beta_y, state.beta_z);
      setField('beta_y', beta_y);
      setField('beta_z', beta_z);
    }
  }

  const derivedBeta = state.bcType !== 'custom'
    ? getBetaForBCType(state.bcType, state.beta_y, state.beta_z)
    : null;

  const sizeOptions = isBox
    ? availableSizes.map((s) => ({ value: s, label: `2UPN ${s}` }))
    : availableSizes.map((s) => ({ value: s, label: `${state.sectionType} ${s}` }));

  return (
    <div className="flex flex-col" aria-label="Datos de entrada — Pilar de acero">

      {/* SECCIÓN */}
      <SectionHeader label="Sección" />
      <SelectField
        label="Tipo"
        id="sc-sectionType"
        value={state.sectionType}
        options={(['HEA', 'HEB', 'IPE', '2UPN'] as const).map((t) => ({ value: t, label: t }))}
        onChange={(v) => setField('sectionType', v)}
      />
      <SelectField
        label="Tamaño"
        id="sc-size"
        value={state.size}
        options={sizeOptions}
        onChange={(v) => setField('size', v)}
      />
      <SelectField
        label="Acero"
        id="sc-steel"
        value={state.steel}
        options={(['S275', 'S355'] as const).map((s) => ({ value: s, label: s }))}
        onChange={(v) => setField('steel', v)}
      />

      {/* GEOMETRÍA */}
      <SectionHeader label="Geometría" />

      {/* Ly — unbraced length y-axis, displayed in m */}
      <div className="flex items-center justify-between py-0.75 gap-2">
        <label htmlFor="sc-Ly" className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
          Ly
          <span className="text-[11px] text-text-disabled ml-1">(eje fuerte)</span>
        </label>
        <div className="flex shrink-0">
          <input
            id="sc-Ly"
            type="number"
            value={+(state.Ly / 1000).toFixed(2)}
            min={0.1}
            step={0.1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!isNaN(n) && n > 0) setField('Ly', Math.round(n * 1000));
            }}
            className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="Ly (longitud libre eje fuerte) en metros"
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
            m
          </span>
        </div>
      </div>

      {/* Lz — unbraced length z-axis, displayed in m */}
      <div className="flex items-center justify-between py-0.75 gap-2">
        <label htmlFor="sc-Lz" className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
          Lz
          <span className="text-[11px] text-text-disabled ml-1">(eje débil)</span>
        </label>
        <div className="flex shrink-0">
          <input
            id="sc-Lz"
            type="number"
            value={+(state.Lz / 1000).toFixed(2)}
            min={0.1}
            step={0.1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!isNaN(n) && n > 0) setField('Lz', Math.round(n * 1000));
            }}
            className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="Lz (longitud libre eje débil) en metros"
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
            m
          </span>
        </div>
      </div>

      {/* BC selector — shared for both axes */}
      <div className="mt-2">
        <BCSelector
          active={state.bcType}
          onSelect={handleBCType}
          groupLabel="Condición de apoyo"
        />
        {derivedBeta !== null ? (
          <div className="flex justify-between">
            <BetaAutoRow label="βy" value={derivedBeta.beta_y} />
            <BetaAutoRow label="βz" value={derivedBeta.beta_z} />
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            <NumField
              label="βy"
              id="sc-beta-y"
              value={state.beta_y}
              unit="—"
              min={0.1}
              step={0.05}
              onChange={(v) => setField('beta_y', Math.max(0.1, v))}
            />
            <NumField
              label="βz"
              id="sc-beta-z"
              value={state.beta_z}
              unit="—"
              min={0.1}
              step={0.05}
              onChange={(v) => setField('beta_z', Math.max(0.1, v))}
            />
          </div>
        )}
      </div>

      {/* CARGAS */}
      <SectionHeader label="Cargas" />
      <NumField
        label="NEd"
        sub="(compresión)"
        id="sc-Ned"
        value={state.Ned}
        unit="kN"
        min={0}
        step={10}
        onChange={(v) => setField('Ned', v)}
      />
      <NumField
        label="My,Ed"
        sub="(eje fuerte)"
        id="sc-My"
        value={state.My_Ed}
        unit="kNm"
        min={0}
        step={1}
        onChange={(v) => setField('My_Ed', v)}
      />
      <NumField
        label="Mz,Ed"
        sub="(eje débil)"
        id="sc-Mz"
        value={state.Mz_Ed}
        unit="kNm"
        min={0}
        step={1}
        onChange={(v) => setField('Mz_Ed', v)}
      />
    </div>
  );
}
