import React, { useEffect } from 'react';
import { type BeamType, type ElsCombo, type SteelBeamInputs } from '../../data/defaults';

import { type LoadGenResult, getPsiRow, VARIABLE_ACTIONS } from '../../lib/calculations/loadGen';
import { getSizesForTipo } from '../../data/steelProfiles';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatNumber, getUnitLabel } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';

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
  /** FEM embed: hide gk/qk/bTrib/bSide inputs + derivation block (forces come
   *  from FEM envelope, not user input). */
  hideLoads?: boolean;
  /** FEM embed: hide beamType selector (FEM determines BCs by topology). */
  hideBeamType?: boolean;
  /** FEM embed: hide L input (FEM provides bar length). */
  hideL?: boolean;
}

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
  field: keyof SteelBeamInputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: SteelBeamsInputsProps['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      {/* InputLabel maneja el caso sym==='' (label = descShort) y el icono ⓘ. */}
      <InputLabel
        htmlFor={`sb-select-${field}`}
        labelKey={labelKey}
        label={labelKey ? undefined : label}
        help={help}
      />
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
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <span className="text-[13px] text-text-disabled truncate min-w-0" title={label}>{label}</span>
      <span className="text-[12px] font-mono text-text-disabled shrink-0">{value}</span>
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
  // Label side truncates; the value+badge side keeps its full width. Without
  // `min-w-0 truncate` the label refuses to shrink and the whole row overflows
  // the 240-px FEM left panel (Mser + descShort + value + 'derivado' badge
  // adds up to ~223 px in a ~211-px effective width).
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <span
        className="text-[13px] text-text-secondary truncate min-w-0"
        title={sub ? `${label} ${sub}` : label}
      >
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
  hideLoads = false,
  hideBeamType = false,
  hideL = false,
}: SteelBeamsInputsProps) {
  const availableSizes = getSizesForTipo(state.tipo);
  const { system } = useUnitSystem();

  // When tipo changes, snap size to first available if current is invalid
  useEffect(() => {
    if (!availableSizes.includes(state.size)) {
      setField('size', availableSizes[0] ?? 160);
    }
  }, [state.tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const deltaAdm = (state.L / state.deflLimit).toFixed(1);
  const fmt = (v: number, d = 1) => v.toFixed(d);
  // Caja de derivación / filas derivadas: convierten al sistema activo. En SI
  // mantienen 1 decimal (idéntico a antes); en técnico salen kg/m · mt · Tn.
  const derivedQ = (v: number | undefined, q: Quantity) =>
    loadGen && v !== undefined ? formatNumber(v, q, system, 1) : '--';
  const fmtAL = (v: number) => formatNumber(v, 'areaLoad', system, 1);
  const uL = (q: Quantity) => getUnitLabel(q, system);

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
    ff: 'Lcr = 1.0L conservador — reducir según condiciones reales (CE Anejo 22 §6.3)',
  };

  return (
    <div className="flex flex-col" aria-label="Datos de entrada — Viga de acero">

      {/* BEAM TYPE SELECTOR — hidden in FEM embed (BCs from topology) */}
      {!hideBeamType && (
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
      )}

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
      {/* L — beam span, stored in mm, displayed in m. Hidden in FEM embed (FEM provides L). */}
      {!hideL && (
      <UnitNumberInput
        id="sb-input-L"
        labelKey="L_span"
        value={+(state.L / 1000).toFixed(2)}
        min={0.5}
        step={0.1}
        widthClass="w-18"
        onChange={(m) => { if (m > 0) setField('L', Math.round(m * 1000)); }}
      />
      )}
      </CollapsibleSection>

      {/* CARGAS — hidden in FEM embed (forces from envelope) */}
      {!hideLoads && (
      <CollapsibleSection label="Cargas">
      {/* bTrib — directly below L */}
      <UnitNumberInput
        id="sb-input-bTrib"
        labelKey="b_trib"
        value={state.bTrib}
        min={0}
        widthClass="w-18"
        onChange={(v) => setField('bTrib', v)}
      />
      <UnitNumberInput
        labelKey="gk_surface"
        field="gk"
        value={state.gk}
        quantity="areaLoad"
        onChange={(v) => setField('gk', v)}
      />
      <UnitNumberInput
        labelKey="qk_surface"
        field="qk"
        value={state.qk}
        quantity="areaLoad"
        onChange={(v) => {
          setField('qk', v);
          setField('useCategory', 'custom');
        }}
      />
      <SelectField
        labelKey="variableAction"
        field="useCategory"
        value={state.useCategory}
        options={VARIABLE_ACTIONS.map((c) => ({ value: c.value, label: c.label }))}
        setField={(field, val) => {
          setField(field, val);
          // Nieve/viento/personalizada no tienen qk de catálogo: solo fijan las ψ,
          // el valor de la envolvente lo teclea el usuario.
          const cat = VARIABLE_ACTIONS.find((c) => c.value === val);
          if (cat && cat.qk !== null) setField('qk', cat.qk);
        }}
      />

      {/* Derivation box */}
      <div className="bg-bg-elevated/40 rounded px-2 py-1.5 mt-2 mb-1 text-[11px] font-mono text-text-secondary break-words">
        <div className="text-[10px] text-text-disabled mb-1 uppercase tracking-[0.06em]">
          Derivación ELU (CTE DB-SE)
        </div>
        <div>Gk = {fmtAL(state.gk)} × {fmt(state.bTrib)} = {derivedQ(loadGen?.Gk_line, 'linearLoad')} {uL('linearLoad')}</div>
        <div>Qk = {fmtAL(state.qk)} × {fmt(state.bTrib)} = {derivedQ(loadGen?.Qk_line, 'linearLoad')} {uL('linearLoad')}</div>
        <div>
          wEd = 1.35×{derivedQ(loadGen?.Gk_line, 'linearLoad')} + 1.50×{derivedQ(loadGen?.Qk_line, 'linearLoad')} ={' '}
          {derivedQ(loadGen?.wEd, 'linearLoad')} {uL('linearLoad')}
          <span className="text-text-disabled ml-1">[γG=1.35, γQ=1.50]</span>
        </div>
        <div className="border-t border-border-sub mt-1 pt-1">
          <div>MEd  = {formulas.MEd} = {derivedQ(loadGen?.MEd, 'moment')} {uL('moment')}</div>
          <div>VEd  = {formulas.VEd} = {derivedQ(loadGen?.VEd, 'force')} {uL('force')}</div>
        </div>
        <div className="border-t border-border-sub mt-1 pt-1">
          <div className="text-[10px] text-text-disabled mb-0.5 uppercase tracking-[0.06em]">
            ELS — Flecha
          </div>
          <div>
            wSer = {derivedQ(loadGen?.Gk_line, 'linearLoad')} + {currentPsi.toFixed(2)}×{derivedQ(loadGen?.Qk_line, 'linearLoad')} ={' '}
            {derivedQ(loadGen?.wSer, 'linearLoad')} {uL('linearLoad')}
            <span className="text-text-disabled ml-1">
              [{elsComboLabel[state.elsCombo ?? 'characteristic']}, {psiSymbol[state.elsCombo ?? 'characteristic']}]
            </span>
          </div>
          <div>Mser = {formulas.Mser} = {derivedQ(loadGen?.Mser, 'moment')} {uL('moment')}</div>
        </div>
      </div>
      </CollapsibleSection>
      )}

      {/* PANDEO LATERAL (LTB) */}
      <CollapsibleSection label="Pandeo lateral (LTB)">
      {/* Lcr stored in mm, displayed in m */}
      <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
        {/* help override dinámico: el texto de Lcr depende del tipo de viga
            (regla 5A — call site sobreescribe el default del catálogo). */}
        <InputLabel htmlFor="sb-input-Lcr" labelKey="Lcr_LTB" help={lcrTooltip[state.beamType]} />
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`font-mono text-[9px] px-1.25 py-0.5 rounded transition-colors ${lcrIsAuto ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-text-disabled'}`}
            aria-label={lcrIsAuto ? 'Lcr calculado automáticamente' : 'Lcr manual'}
          >
            auto
          </span>
          <RawNumberInput
            id="sb-input-Lcr"
            value={+(displayLcr / 1000).toFixed(2)}
            min={0.1}
            step={0.1}
            widthClass="w-12"
            unit={LABELS.Lcr_LTB.unit}
            ariaLabel={`${LABELS.Lcr_LTB.sym} (${LABELS.Lcr_LTB.unit})`}
            onChange={(m) => { if (m > 0) onLcrChange(Math.round(m * 1000)); }}
          />
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
        value={derivedQ(loadGen?.Mser, 'moment')}
        unit={uL('moment')}
      />
      <SelectField
        labelKey="deflLimit"
        field="deflLimit"
        value={state.deflLimit}
        options={[
          { value: 250, label: 'L/250 — cubiertas / correas' },
          { value: 300, label: 'L/300 — resto de casos (CTE)' },
          { value: 400, label: 'L/400 — tabiques ordinarios / pav. c. juntas' },
          { value: 500, label: 'L/500 — tabiques frágiles / pav. sin juntas' },
          { value: 600, label: 'L/600 — equipos sensibles' },
        ]}
        setField={setField}
      />
      <InfoRow label={`${LABELS.delta_adm.sym} = L/${state.deflLimit}`} value={`${deltaAdm} mm`} />
      </CollapsibleSection>
    </div>
  );
}
