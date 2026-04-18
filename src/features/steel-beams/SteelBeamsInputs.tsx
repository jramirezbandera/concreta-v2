import React, { useEffect } from 'react';
import { type BeamType, type ElsCombo, type SteelBeamInputs } from '../../data/defaults';

import { type LoadGenResult, getPsiRow } from '../../lib/calculations/loadGen';
import { getSizesForTipo } from '../../data/steelProfiles';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';

interface SteelBeamsInputsProps {
  state: SteelBeamInputs;
  setField: (field: keyof SteelBeamInputs, value: SteelBeamInputs[keyof SteelBeamInputs]) => void;
  /** Effective Lcr to display: autoLcr when not overridden, state.Lcr when overridden. */
  displayLcr: number;
  /** Whether Lcr is currently auto-filled (shows badge). */
  lcrIsAuto: boolean;
  /** Call when user edits Lcr (tracks override in index.tsx). */
  onLcrChange: (val: number) => void;
  /** Derived forces for display (null when inputs are invalid). */
  loadGen: LoadGenResult | null;
}

// CTE DB-SE-AE tabla 3.1 — use categories
const USE_CATEGORIES = [
  { value: 'A1', label: 'A1  Residencial privado',  qk: 2.0 },
  { value: 'A2', label: 'A2  Trasteros',             qk: 3.0 },
  { value: 'B',  label: 'B   Administrativa',        qk: 3.0 },
  { value: 'C1', label: 'C1  Zonas con mesas',       qk: 3.0 },
  { value: 'C2', label: 'C2  Asientos fijos',        qk: 4.0 },
  { value: 'C3', label: 'C3  Sin obstáculos',        qk: 5.0 },
  { value: 'D1', label: 'D1  Comercio local',        qk: 5.0 },
  { value: 'E1', label: 'E1  Almacén',               qk: 7.5 },
  { value: 'G1', label: 'G1  Cubierta accesible',    qk: 1.0 },
  { value: 'custom', label: 'Personalizada',         qk: null },
] as const;

// ── SVG structural schematics for beam type buttons ──────────────────────────

function SvgSS() {
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
      <line x1="4" y1="5" x2="24" y2="5" stroke="currentColor" strokeWidth="1.5" />
      {/* Left pin triangle */}
      <polygon points="4,5 1,10 7,10" fill="currentColor" />
      {/* Right pin triangle */}
      <polygon points="24,5 21,10 27,10" fill="currentColor" />
    </svg>
  );
}

function SvgCantilever() {
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
      {/* Fixed wall — rect + hatch */}
      <rect x="0" y="0" width="4" height="10" fill="currentColor" opacity="0.4" />
      <line x1="0" y1="2" x2="4" y2="5"  stroke="currentColor" strokeWidth="0.75" />
      <line x1="0" y1="5" x2="4" y2="8"  stroke="currentColor" strokeWidth="0.75" />
      {/* Beam line */}
      <line x1="4" y1="5" x2="26" y2="5" stroke="currentColor" strokeWidth="1.5" />
      {/* Free end — open circle */}
      <circle cx="26" cy="5" r="2" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function SvgFP() {
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
      {/* Fixed wall left */}
      <rect x="0" y="0" width="4" height="10" fill="currentColor" opacity="0.4" />
      <line x1="0" y1="2" x2="4" y2="5"  stroke="currentColor" strokeWidth="0.75" />
      <line x1="0" y1="5" x2="4" y2="8"  stroke="currentColor" strokeWidth="0.75" />
      {/* Beam line */}
      <line x1="4" y1="5" x2="24" y2="5" stroke="currentColor" strokeWidth="1.5" />
      {/* Right pin triangle */}
      <polygon points="24,5 21,10 27,10" fill="currentColor" />
    </svg>
  );
}

function SvgFF() {
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
      {/* Fixed wall left */}
      <rect x="0" y="0" width="4" height="10" fill="currentColor" opacity="0.4" />
      <line x1="0" y1="2" x2="4" y2="5"  stroke="currentColor" strokeWidth="0.75" />
      <line x1="0" y1="5" x2="4" y2="8"  stroke="currentColor" strokeWidth="0.75" />
      {/* Beam line */}
      <line x1="4" y1="5" x2="24" y2="5" stroke="currentColor" strokeWidth="1.5" />
      {/* Fixed wall right */}
      <rect x="24" y="0" width="4" height="10" fill="currentColor" opacity="0.4" />
      <line x1="24" y1="2" x2="28" y2="5" stroke="currentColor" strokeWidth="0.75" />
      <line x1="24" y1="5" x2="28" y2="8" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  );
}

const BEAM_TYPE_OPTIONS: Array<{ type: BeamType; label: string; Svg: () => React.ReactElement; tooltip: string }> = [
  { type: 'ss',        label: 'Biart.',   Svg: SvgSS,        tooltip: 'Articulada–Articulada' },
  { type: 'cantilever',label: 'Ménsula',  Svg: SvgCantilever,tooltip: 'Ménsula (empotrada–libre)' },
  { type: 'fp',        label: 'Art-Emp.', Svg: SvgFP,        tooltip: 'Articulada–Empotrada' },
  { type: 'ff',        label: 'Biempotr.',Svg: SvgFF,        tooltip: 'Biempotrada' },
];

// ── Shared field components ───────────────────────────────────────────────────

function NumField({
  labelKey,
  label,
  sub,
  unit,
  field,
  value,
  min,
  step,
  setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  sub?: string;
  unit?: string;
  field: keyof SteelBeamInputs;
  value: number;
  min?: number;
  step?: number;
  setField: SteelBeamsInputsProps['setField'];
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '—' ? '' : resolved.unit;
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label
        htmlFor={`sb-input-${field}`}
        className="text-[13px] text-text-secondary whitespace-nowrap shrink-0"
      >
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`sb-input-${field}`}
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!isNaN(n)) setField(field, n);
          }}
          className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
  field: keyof SteelBeamInputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: SteelBeamsInputsProps['setField'];
}) {
  const resolved = labelKey
    ? LABELS[labelKey].sym
      ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort }
      : { label: LABELS[labelKey].descShort, sub: undefined as string | undefined }
    : { label: label ?? '', sub: undefined as string | undefined };
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label
        htmlFor={`sb-select-${field}`}
        className="text-[13px] text-text-secondary whitespace-nowrap shrink-0"
      >
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <select
        id={`sb-select-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const num = Number(raw);
          setField(field, isNaN(num) || raw === '' ? raw : num);
        }}
        className="w-28 shrink-0 bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
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

function DerivedRow({
  label,
  sub,
  value,
  unit,
}: {
  label: string;
  sub?: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <span className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[12px] font-mono text-text-primary tabular-nums">{value}</span>
        <span className="text-[10px] font-mono text-text-disabled">{unit}</span>
        <span className="bg-accent/10 text-accent text-[10px] rounded px-1 font-mono">derivado</span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SteelBeamsInputs({
  state,
  setField,
  displayLcr,
  lcrIsAuto,
  onLcrChange,
  loadGen,
}: SteelBeamsInputsProps) {
  const availableSizes = getSizesForTipo(state.tipo);

  // When tipo changes, snap size to first available if current is invalid
  useEffect(() => {
    if (!availableSizes.includes(state.size)) {
      setField('size', availableSizes[0] ?? 160);
    }
  }, [state.tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const deltaAdm = (state.L / state.deflLimit).toFixed(1);
  const fmt = (v: number, d = 1) => v.toFixed(d);
  const derivedStr = (v: number | undefined, d = 1) =>
    loadGen && v !== undefined ? fmt(v, d) : '--';

  // Beam-type formula annotation for derivation box
  const beamFormulas: Record<BeamType, { MEd: string; VEd: string; Mser: string }> = {
    ss:         { MEd: 'wEd·L²/8',        VEd: 'wEd·L/2',   Mser: 'wSer·L²/8'         },
    cantilever: { MEd: 'wEd·L²/2',        VEd: 'wEd·L',     Mser: 'wSer·L²/2'         },
    fp:         { MEd: 'wEd·L²/8 (emp.)', VEd: '5·wEd·L/8', Mser: 'wSer·L²/8 (emp.)'  },
    ff:         { MEd: 'wEd·L²/12 (emp.)',VEd: 'wEd·L/2',   Mser: 'wSer·L²/12 (emp.)' },
  };
  const formulas = beamFormulas[state.beamType];

  // ELS combination display helpers
  const psiRow = getPsiRow(state.useCategory);
  const elsComboLabel: Record<ElsCombo, string> = {
    characteristic:   'Característica',
    frequent:         'Frecuente',
    'quasi-permanent':'Cuasi-permanente',
  };
  const psiSymbol: Record<ElsCombo, string> = {
    characteristic:   'ψ=1.00',
    frequent:         `ψ₁=${psiRow.psi1.toFixed(2)}`,
    'quasi-permanent':`ψ₂=${psiRow.psi2.toFixed(2)}`,
  };
  const psiValue: Record<ElsCombo, number> = {
    characteristic:    1.0,
    frequent:          psiRow.psi1,
    'quasi-permanent': psiRow.psi2,
  };
  const currentPsi = psiValue[state.elsCombo ?? 'characteristic'];

  // Lcr tooltip per beam type
  const lcrTooltip: Partial<Record<BeamType, string>> = {
    cantilever: 'Lcr = 2L (ménsula punta libre — CTE DB-SE-A)',
    ff: 'Lcr = 1.0L conservador — reducir según condiciones reales (EC3 §6.3)',
  };

  return (
    <div className="flex flex-col" aria-label="Datos de entrada — Viga de acero">

      {/* BEAM TYPE SELECTOR */}
      <div
        role="radiogroup"
        aria-label="Tipo de viga"
        className="flex rounded border border-border-main mb-3 shrink-0 overflow-hidden"
      >
        {BEAM_TYPE_OPTIONS.map(({ type, label, Svg, tooltip }) => {
          const isActive = state.beamType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={tooltip}
              title={tooltip}
              onClick={() => setField('beamType', type)}
              onKeyDown={(e) => {
                const idx = BEAM_TYPE_OPTIONS.findIndex((o) => o.type === type);
                if (e.key === 'ArrowRight') {
                  const next = BEAM_TYPE_OPTIONS[(idx + 1) % BEAM_TYPE_OPTIONS.length];
                  setField('beamType', next.type);
                } else if (e.key === 'ArrowLeft') {
                  const prev = BEAM_TYPE_OPTIONS[(idx - 1 + BEAM_TYPE_OPTIONS.length) % BEAM_TYPE_OPTIONS.length];
                  setField('beamType', prev.type);
                }
              }}
              className={`flex-1 flex flex-col items-center gap-1 py-1.5 px-0 transition-colors
                ${isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-disabled hover:text-text-secondary'}`}
            >
              <Svg />
              <span className="text-[10px] font-mono">{label}</span>
            </button>
          );
        })}
      </div>

      {/* PERFIL */}
      <CollapsibleSection label="Perfil">
      <SelectField
        labelKey="profile_type"
        field="tipo"
        value={state.tipo}
        options={(['IPE', 'HEA', 'HEB', 'IPN'] as const).map((t) => ({ value: t, label: t }))}
        setField={setField}
      />
      <SelectField
        labelKey="profile_size"
        field="size"
        value={state.size}
        options={availableSizes.map((s) => ({ value: s, label: `${state.tipo} ${s}` }))}
        setField={setField}
      />
      <SelectField
        labelKey="steel_grade"
        field="steel"
        value={state.steel}
        options={(['S275', 'S355'] as const).map((s) => ({ value: s, label: s }))}
        setField={setField}
      />
      {/* L — beam span, stored in mm, displayed in m */}
      <div className="flex items-center justify-between py-0.75 gap-2">
        <label
          htmlFor="sb-input-L"
          className="text-[13px] text-text-secondary whitespace-nowrap shrink-0"
        >
          {LABELS.L_span.sym}
          <span className="text-[11px] text-text-disabled ml-1">{LABELS.L_span.descShort}</span>
        </label>
        <div className="flex shrink-0">
          <input
            id="sb-input-L"
            type="number"
            value={+(state.L / 1000).toFixed(2)}
            min={0.5}
            step={0.1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!isNaN(n) && n > 0) setField('L', Math.round(n * 1000));
            }}
            className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label={`${LABELS.L_span.sym} (${LABELS.L_span.unit})`}
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
            {LABELS.L_span.unit}
          </span>
        </div>
      </div>
      </CollapsibleSection>

      {/* CARGAS */}
      <CollapsibleSection label="Cargas">
      {/* bTrib — directly below L */}
      <NumField
        labelKey="b_trib"
        field="bTrib"
        value={state.bTrib}
        min={0}
        setField={setField}
      />
      <NumField
        labelKey="gk_surface"
        field="gk"
        value={state.gk}
        min={0}
        setField={setField}
      />
      <NumField
        labelKey="qk_surface"
        field="qk"
        value={state.qk}
        min={0}
        setField={(field, val) => {
          setField(field, val);
          setField('useCategory', 'custom');
        }}
      />
      <SelectField
        labelKey="loadType"
        field="useCategory"
        value={state.useCategory}
        options={USE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
        setField={(field, val) => {
          setField(field, val);
          const cat = USE_CATEGORIES.find((c) => c.value === val);
          if (cat && cat.qk !== null) setField('qk', cat.qk);
        }}
      />

      {/* Derivation box */}
      <div className="bg-bg-elevated/40 rounded px-2 py-1.5 mt-2 mb-1 text-[11px] font-mono text-text-secondary">
        <div className="text-[10px] text-text-disabled mb-1 uppercase tracking-[0.06em]">
          Derivación ELU (CTE DB-SE)
        </div>
        <div>Gk = {fmt(state.gk)} × {fmt(state.bTrib)} = {derivedStr(loadGen?.Gk_line)} kN/m</div>
        <div>Qk = {fmt(state.qk)} × {fmt(state.bTrib)} = {derivedStr(loadGen?.Qk_line)} kN/m</div>
        <div>
          wEd = 1.35×{derivedStr(loadGen?.Gk_line)} + 1.50×{derivedStr(loadGen?.Qk_line)} ={' '}
          {derivedStr(loadGen?.wEd)} kN/m
          <span className="text-text-disabled ml-1">[γG=1.35, γQ=1.50]</span>
        </div>
        <div className="border-t border-border-sub mt-1 pt-1">
          <div>MEd  = {formulas.MEd} = {derivedStr(loadGen?.MEd, 1)} kNm</div>
          <div>VEd  = {formulas.VEd} = {derivedStr(loadGen?.VEd, 1)} kN</div>
        </div>
        <div className="border-t border-border-sub mt-1 pt-1">
          <div className="text-[10px] text-text-disabled mb-0.5 uppercase tracking-[0.06em]">
            ELS — Flecha
          </div>
          <div>
            wSer = {derivedStr(loadGen?.Gk_line)} + {currentPsi.toFixed(2)}×{derivedStr(loadGen?.Qk_line)} ={' '}
            {derivedStr(loadGen?.wSer)} kN/m
            <span className="text-text-disabled ml-1">
              [{elsComboLabel[state.elsCombo ?? 'characteristic']}, {psiSymbol[state.elsCombo ?? 'characteristic']}]
            </span>
          </div>
          <div>Mser = {formulas.Mser} = {derivedStr(loadGen?.Mser, 1)} kNm</div>
        </div>
      </div>
      </CollapsibleSection>

      {/* PANDEO LATERAL (LTB) */}
      <CollapsibleSection label="Pandeo lateral (LTB)">
      {/* Lcr stored in mm, displayed in m */}
      <div className="flex items-center justify-between py-0.75 gap-2">
        <label
          htmlFor="sb-input-Lcr"
          className="text-[13px] text-text-secondary whitespace-nowrap min-w-0"
        >
          {LABELS.Lcr_LTB.sym}
          <span className="text-[11px] text-text-disabled ml-1">{LABELS.Lcr_LTB.descShort}</span>
        </label>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`font-mono text-[9px] px-1.25 py-0.5 rounded transition-colors ${lcrIsAuto ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-text-disabled'}`}
            aria-label={lcrIsAuto ? 'Lcr calculado automáticamente' : 'Lcr manual'}
          >
            auto
          </span>
          <div className="flex shrink-0">
            <input
              id="sb-input-Lcr"
              type="number"
              value={+(displayLcr / 1000).toFixed(2)}
              min={0.1}
              step={0.1}
              title={lcrTooltip[state.beamType]}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!isNaN(n) && n > 0) onLcrChange(Math.round(n * 1000));
              }}
              className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              aria-label={`${LABELS.Lcr_LTB.sym} (${LABELS.Lcr_LTB.unit})`}
            />
            <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
              {LABELS.Lcr_LTB.unit}
            </span>
          </div>
        </div>
      </div>
      </CollapsibleSection>

      {/* FLECHA ELS */}
      <CollapsibleSection label="Flecha ELS">
      <SelectField
        labelKey="elsCombo"
        field="elsCombo"
        value={state.elsCombo ?? 'characteristic'}
        options={[
          { value: 'characteristic',   label: 'Característica  (ψ=1.0)' },
          { value: 'frequent',         label: `Frecuente  (ψ₁=${psiRow.psi1.toFixed(2)})` },
          { value: 'quasi-permanent',  label: `Cuasi-perm.  (ψ₂=${psiRow.psi2.toFixed(2)})` },
        ]}
        setField={setField}
      />
      <DerivedRow
        label={LABELS.Mser.sym}
        sub={LABELS.Mser.descShort}
        value={derivedStr(loadGen?.Mser, 1)}
        unit={LABELS.Mser.unit}
      />
      <SelectField
        labelKey="deflLimit"
        field="deflLimit"
        value={state.deflLimit}
        options={[
          { value: 250, label: 'L/250 — cubiertas / industrial' },
          { value: 300, label: 'L/300 — uso general (CTE)' },
          { value: 400, label: 'L/400 — forjados con yeso' },
          { value: 500, label: 'L/500 — forjados sensibles' },
          { value: 600, label: 'L/600 — precisión / laboratorios' },
        ]}
        setField={setField}
      />
      <InfoRow label={`${LABELS.delta_adm.sym} = L/${state.deflLimit}`} value={`${deltaAdm} mm`} />
      </CollapsibleSection>
    </div>
  );
}
