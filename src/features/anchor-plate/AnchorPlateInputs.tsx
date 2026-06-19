import { useEffect, useRef, useState } from 'react';
import { type AnchorPlateInputs as Inputs } from '../../data/defaults';
import { getSizesForTipo } from '../../data/steelProfiles';
import {
  AVAILABLE_REBAR_DIAMS,
  AVAILABLE_REBAR_GRADES,
  AVAILABLE_BOTTOM_ANCHORAGES,
  AVAILABLE_TOP_CONNECTIONS,
  BOTTOM_ANCHORAGE_LABEL,
  TOP_CONNECTION_LABEL,
} from '../../data/anchorBars';
import { availableFck } from '../../data/materials';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';
import type { ValidationWarning } from '../../lib/calculations/anchorPlate';

interface Props {
  state: Inputs;
  setField: <K extends keyof Inputs>(field: K, value: Inputs[K]) => void;
  warnings?: ValidationWarning[];
}

// D3 — inline field-level validation hint. Renders immediately under the
// offending NumField/SelectField so the user doesn't have to cross-reference
// the global amber strip against dozens of fields.
function FieldWarn({ field, warnings }: { field: string; warnings?: ValidationWarning[] }) {
  const w = warnings?.find((x) => x.field === field);
  if (!w) return null;
  const color = w.severity === 'fail' ? 'text-state-fail' : 'text-state-warn';
  return (
    <div className={`text-[10px] ${color} -mt-0.5 mb-1 pl-1 leading-tight`}>
      <span aria-hidden>⚠</span> {w.message}
    </div>
  );
}

// ── Atomic fields (local, to match the RC-beams NumField ergonomics) ──────
function NumField({
  label, sub, help, field, value, unit, integer = false, setField,
}: {
  label: string;
  sub?: string;
  help?: string;
  field: keyof Inputs;
  value: number;
  unit: string;
  integer?: boolean;
  setField: Props['setField'];
}) {
  const [localStr, setLocalStr] = useState(() => String(value));
  useEffect(() => { setLocalStr(String(value)); }, [value]);
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <InputLabel htmlFor={`ap-${field}`} label={label} sub={sub} help={help} />
      <div className="flex shrink-0">
        <input
          id={`ap-${field}`}
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
        />
        <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
          {unit}
        </span>
      </div>
    </div>
  );
}

function SelectField({
  label, help, field, value, options, setField, disabled,
}: {
  label: string;
  help?: string;
  field: keyof Inputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: Props['setField'];
  disabled?: boolean;
}) {
  // When label OR the longest option label would not fit alongside the
  // narrow inputs column (≈ 280px), stack vertically so both stay readable.
  // Threshold tuned to the panel width: label > 10 chars or any option > 18.
  const longestOpt = options.reduce((m, o) => Math.max(m, o.label.length), 0);
  const stack = label.length > 10 || longestOpt > 18;

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const raw = e.target.value;
    const asNum = Number(raw);
    // Cast: option values are controlled by the caller and match Inputs[field]'s union.
    setField(field, (isNaN(asNum) ? raw : asNum) as Inputs[typeof field]);
  };

  const selectCls = "bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] text-text-primary font-mono outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  if (stack) {
    return (
      <div className="flex flex-col gap-1 py-0.75 max-lg:min-h-11 min-w-0">
        <InputLabel htmlFor={`ap-sel-${field}`} label={label} help={help} />
        <select id={`ap-sel-${field}`} value={value} disabled={disabled} onChange={onChange}
          className={`w-full min-w-0 ${selectCls}`}>
          {options.map((o) => (
            <option key={String(o.value)} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <InputLabel htmlFor={`ap-sel-${field}`} label={label} help={help} />
      <select id={`ap-sel-${field}`} value={value} disabled={disabled} onChange={onChange}
        className={`min-w-0 max-w-44 truncate ${selectCls}`}>
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Icon-grid (D11): schematic stroke-only, accent on active ──────────────
// M27: WAI-ARIA radiogroup pattern — roving tabIndex (only the active option
// is tabbable), Space/Enter activates, ArrowKeys move + focus + select with
// preventDefault so the page does not scroll.
interface IconGridOption<T extends number> {
  value: T;
  label: string;
  ariaLabel?: string;
  glyph: React.ReactNode;
}

function IconGrid<T extends number>({
  groupLabel, options, active, onSelect, disabled,
}: {
  groupLabel: string;
  options: IconGridOption<T>[];
  active: T;
  onSelect: (v: T) => void;
  disabled?: boolean;
}) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const moveTo = (newIdx: number) => {
    const opt = options[newIdx];
    onSelect(opt.value);
    // Defer focus to next tick so React has re-rendered with tabIndex=0
    // on the newly selected button before we focus it.
    queueMicrotask(() => buttonsRef.current[newIdx]?.focus());
  };

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      className={`flex rounded border border-border-main overflow-hidden mb-1 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {options.map((o, idx) => {
        const isActive = active === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => { buttonsRef.current[idx] = el; }}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={o.ariaLabel ?? o.label}
            title={o.ariaLabel ?? o.label}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                moveTo((idx + 1) % options.length);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                moveTo((idx - 1 + options.length) % options.length);
              } else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onSelect(o.value);
              } else if (e.key === 'Home') {
                e.preventDefault();
                moveTo(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                moveTo(options.length - 1);
              }
            }}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-0 min-h-11 transition-colors cursor-pointer
              ${isActive ? 'bg-accent/5 text-accent' : 'text-text-disabled hover:text-text-secondary'}`}
          >
            <span className="inline-flex items-center justify-center w-8 h-8">{o.glyph}</span>
            <span className="text-[10px] font-mono leading-none">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Bolt-layout glyphs (D11: schematic stroke-only) ───────────────────────
function BoltGlyph4() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="6" width="24" height="20" rx="1.5" />
      <circle cx="9" cy="11" r="1.5" />
      <circle cx="23" cy="11" r="1.5" />
      <circle cx="9" cy="21" r="1.5" />
      <circle cx="23" cy="21" r="1.5" />
    </svg>
  );
}
function BoltGlyph6() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="6" width="24" height="20" rx="1.5" />
      <circle cx="8" cy="11" r="1.5" />
      <circle cx="16" cy="11" r="1.5" />
      <circle cx="24" cy="11" r="1.5" />
      <circle cx="8" cy="21" r="1.5" />
      <circle cx="16" cy="21" r="1.5" />
      <circle cx="24" cy="21" r="1.5" />
    </svg>
  );
}
function BoltGlyph8() {
  // 4 puntos por fila × 2 filas. Rectángulo de x=4 a x=28 (ancho 24).
  // Para márgenes simétricos: spacing 6 → x = 7, 13, 19, 25.
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="6" width="24" height="20" rx="1.5" />
      {[7, 13, 19, 25].flatMap((x) => [
        <circle key={`t${x}`} cx={x} cy="11" r="1.3" />,
        <circle key={`b${x}`} cx={x} cy="21" r="1.3" />,
      ])}
    </svg>
  );
}
function BoltGlyph9() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="6" width="24" height="20" rx="1.5" />
      {[8, 16, 24].flatMap((x) => [
        <circle key={`t${x}`} cx={x} cy="10" r="1.3" />,
        <circle key={`m${x}`} cx={x} cy="16" r="1.3" />,
        <circle key={`b${x}`} cx={x} cy="22" r="1.3" />,
      ])}
    </svg>
  );
}

// ── Rib-count glyphs ──────────────────────────────────────────────────────
function RibGlyph0() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="4" width="24" height="24" rx="1.5" />
    </svg>
  );
}
function RibGlyph2() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="4" width="24" height="24" rx="1.5" />
      <line x1="12" y1="4" x2="12" y2="28" />
      <line x1="20" y1="4" x2="20" y2="28" />
    </svg>
  );
}
function RibGlyph4() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="4" width="24" height="24" rx="1.5" />
      <line x1="12" y1="4" x2="12" y2="28" />
      <line x1="20" y1="4" x2="20" y2="28" />
      <line x1="4" y1="12" x2="28" y2="12" />
      <line x1="4" y1="20" x2="28" y2="20" />
    </svg>
  );
}

// ── Advanced toggle: directional edges + Vx/Vy ────────────────────────────
//
// Plegado por defecto. Cuando OFF, las ediciones a cX/cY (legacy) sincronizan
// los 4 direccionales cX1=cX2=cX y cY1=cY2=cY (mantiene comportamiento
// pre-PR8a). Cuando ON, los 4 direccionales son editables independientemente
// para casos asimétricos (placa de fachada cerca de un solo borde).
//
// Mismo patrón para VEd ↔ Vx/Vy en la sección de acciones.
function ExpandToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-1 py-1.5 text-[10px] uppercase tracking-widest text-text-disabled hover:text-text-secondary transition-colors"
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="transition-transform duration-150" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} aria-hidden="true">
        <path d="M3 4l2 2 2-2" />
      </svg>
      {label}
    </button>
  );
}

// Textos de ayuda (tooltips ⓘ). Módulo todo override: textos locales.
const HELP = {
  sectionType: 'Serie del perfil metálico del soporte.',
  sectionSize: 'Designación del perfil dentro de la serie.',
  NEd: 'Axil de cálculo (ELU). Positivo en compresión.',
  NEdG: 'Axil cuasipermanente (parte sostenida de la carga), para fluencia/aplastamiento del hormigón.',
  Mx: 'Momento de cálculo (ELU) respecto al eje fuerte.',
  My: 'Momento de cálculo (ELU) respecto al eje débil.',
  VEd: 'Cortante de cálculo (ELU) en la base del soporte.',
  Vx: 'Componente del cortante en el eje fuerte.',
  Vy: 'Componente del cortante en el eje débil.',
  plateA: 'Dimensión de la placa en el eje fuerte.',
  plateB: 'Dimensión de la placa en el eje débil.',
  plateT: 'Espesor de la placa de anclaje.',
  plateSteel: 'Grado del acero de la placa.',
  barDiam: 'Diámetro de las barras de anclaje.',
  barGrade: 'Grado del acero de las barras de anclaje.',
  sx: 'Separación entre barras en el eje fuerte.',
  sy: 'Separación entre barras en el eje débil.',
  ex: 'Distancia de las barras al borde de la placa (eje fuerte).',
  ey: 'Distancia de las barras al borde de la placa (eje débil).',
  hef: 'Profundidad efectiva de anclaje de la barra en el hormigón.',
  bottomAnchorage: 'Dispositivo de anclaje en el extremo inferior de la barra (gancho, patilla, arandela+tuerca…).',
  topConnection: 'Forma de conexión de la barra con la placa.',
  washerOd: 'Diámetro exterior de la arandela bajo tuerca.',
  ribH: 'Altura del rigidizador (cartela).',
  ribT: 'Espesor del rigidizador.',
  fck: 'Resistencia característica del hormigón del pedestal.',
  pedestalH: 'Canto del macizo de hormigón bajo la placa.',
  cX: 'Distancia de la barra al borde del pedestal en el eje X.',
  cY: 'Distancia de la barra al borde del pedestal en el eje Y.',
  cX1: 'Distancia barra→borde en la cara +x.',
  cX2: 'Distancia barra→borde en la cara −x.',
  cY1: 'Distancia barra→borde en la cara +y.',
  cY2: 'Distancia barra→borde en la cara −y.',
  mX: 'Distancia del borde de la placa al borde del pedestal (eje X); define el área de reparto.',
  mY: 'Distancia del borde de la placa al borde del pedestal (eje Y); define el área de reparto.',
  surface: 'Acabado de la interfaz placa-hormigón: lisa (µ=0.2) o rugosa (µ=0.4).',
  weld: 'Garganta del cordón de soldadura perfil-placa (informativo).',
} as const;

// ── Main ──────────────────────────────────────────────────────────────────
export function AnchorPlateInputsPanel({ state, setField, warnings }: Props) {
  // Snap size to first available if sectionType changes and current is invalid
  const availableSizes = getSizesForTipo(state.sectionType);
  useEffect(() => {
    if (!availableSizes.includes(state.sectionSize)) {
      setField('sectionSize', availableSizes[0] ?? 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sectionType]);

  const sizeOpts = availableSizes.map((s) => ({ value: s, label: `${state.sectionType} ${s}` }));

  // Detect asymmetric state on mount: if cX1 ≠ cX2 or cY1 ≠ cY2, expand by default.
  const initialEdgesAsym =
    state.pedestal_cX1 !== state.pedestal_cX2 ||
    state.pedestal_cY1 !== state.pedestal_cY2;
  const [edgesDirectional, setEdgesDirectional] = useState(initialEdgesAsym);
  const initialShearAsym = (state.Vy as number) !== 0;
  const [shearDirectional, setShearDirectional] = useState(initialShearAsym);

  // Wrapper: legacy cX edit syncs cX1=cX2=cX cuando toggle está OFF.
  const setLegacyCX = (v: number) => {
    setField('pedestal_cX', v);
    if (!edgesDirectional) {
      setField('pedestal_cX1', v);
      setField('pedestal_cX2', v);
    }
  };
  const setLegacyCY = (v: number) => {
    setField('pedestal_cY', v);
    if (!edgesDirectional) {
      setField('pedestal_cY1', v);
      setField('pedestal_cY2', v);
    }
  };
  // VEd → Vx/Vy: cuando toggle OFF, edit VEd sincroniza Vx=VEd, Vy=0.
  const setLegacyVEd = (v: number) => {
    setField('VEd', v);
    if (!shearDirectional) {
      setField('Vx', v);
      setField('Vy', 0);
    }
  };

  return (
    <div className="flex flex-col" aria-label="Datos de entrada">

      {/* D7 order: Perfil → Acciones → Placa → Barras → Rigidizadores → Pedestal */}

      <CollapsibleSection label="Perfil">
        <SelectField
          label="Tipo"
          help={HELP.sectionType}
          field="sectionType"
          value={state.sectionType as string}
          options={(['IPE', 'HEA', 'HEB', 'IPN'] as const).map((t) => ({ value: t, label: t }))}
          setField={setField}
        />
        <SelectField
          label="Dimensión"
          help={HELP.sectionSize}
          field="sectionSize"
          value={state.sectionSize as number}
          options={sizeOpts}
          setField={setField}
        />
      </CollapsibleSection>

      <CollapsibleSection label="Acciones (ELU)">
        <UnitNumberInput label="NEd"   sub="axil (+ compres.)" help={HELP.NEd}  field="NEd"   value={state.NEd   as number} quantity="force"  onChange={(v) => setField('NEd', v)} />
        <UnitNumberInput label="NEd,G" sub="axil cuasi-perm."  help={HELP.NEdG} field="NEd_G" value={state.NEd_G as number} quantity="force"  onChange={(v) => setField('NEd_G', v)} />
        <UnitNumberInput label="Mx"    sub="(eje fuerte)"      help={HELP.Mx}   field="Mx"    value={state.Mx    as number} quantity="moment" onChange={(v) => setField('Mx', v)} />
        <UnitNumberInput label="My"    sub="(eje débil)"       help={HELP.My}   field="My"    value={state.My    as number} quantity="moment" onChange={(v) => setField('My', v)} />
        <UnitNumberInput label="VEd"   sub={shearDirectional ? 'magnitud' : 'cortante'} help={HELP.VEd} field="VEd" value={state.VEd as number} quantity="force" onChange={(v) => setLegacyVEd(v)} />
        <ExpandToggle
          open={shearDirectional}
          onToggle={() => setShearDirectional((o) => !o)}
          label={shearDirectional ? 'Cortante direccional (Vx, Vy)' : 'Cortante direccional ▸'}
        />
        {shearDirectional && (
          <>
            <UnitNumberInput label="Vx" sub="eje fuerte" help={HELP.Vx} field="Vx" value={state.Vx as number} quantity="force" onChange={(v) => setField('Vx', v)} />
            <UnitNumberInput label="Vy" sub="eje débil"  help={HELP.Vy} field="Vy" value={state.Vy as number} quantity="force" onChange={(v) => setField('Vy', v)} />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection label="Placa">
        <NumField label="a"  sub="eje fuerte" help={HELP.plateA} field="plate_a" value={state.plate_a as number} unit="mm" integer setField={setField} />
        <NumField label="b"  sub="eje débil"  help={HELP.plateB} field="plate_b" value={state.plate_b as number} unit="mm" integer setField={setField} />
        <NumField label="t"  sub="espesor"    help={HELP.plateT} field="plate_t" value={state.plate_t as number} unit="mm" integer setField={setField} />
        <FieldWarn field="plate_t" warnings={warnings} />
        <SelectField
          label="Acero"
          help={HELP.plateSteel}
          field="plate_steel"
          value={state.plate_steel as string}
          options={['S235', 'S275', 'S355'].map((s) => ({ value: s, label: s }))}
          setField={setField}
        />
      </CollapsibleSection>

      <CollapsibleSection label="Barras de anclaje">
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-widest text-text-disabled mb-1">Disposición</p>
          <IconGrid
            groupLabel="Disposición de barras"
            active={state.bar_nLayout as 4 | 6 | 8 | 9}
            onSelect={(v) => setField('bar_nLayout', v)}
            disabled={false}
            options={[
              { value: 4, label: '4', ariaLabel: '4 barras, 2 por lado', glyph: <BoltGlyph4 /> },
              { value: 6, label: '6', ariaLabel: '6 barras, 3 por lado mayor', glyph: <BoltGlyph6 /> },
              { value: 8, label: '8', ariaLabel: '8 barras en perímetro',     glyph: <BoltGlyph8 /> },
              { value: 9, label: '9', ariaLabel: '9 barras en perímetro 3×3', glyph: <BoltGlyph9 /> },
            ]}
          />
        </div>
        <SelectField
          label="Diámetro"
          help={HELP.barDiam}
          field="bar_diam"
          value={state.bar_diam as number}
          options={AVAILABLE_REBAR_DIAMS.map((d) => ({ value: d, label: `Ø${d}` }))}
          setField={setField}
        />
        <SelectField
          label="Acero"
          help={HELP.barGrade}
          field="bar_grade"
          value={state.bar_grade as string}
          options={AVAILABLE_REBAR_GRADES.map((g) => ({ value: g, label: g }))}
          setField={setField}
        />
        <NumField label="sx" sub="sep. eje fuerte" help={HELP.sx} field="bar_spacing_x" value={state.bar_spacing_x as number} unit="mm" integer setField={setField} />
        <NumField label="sy" sub="sep. eje débil"  help={HELP.sy} field="bar_spacing_y" value={state.bar_spacing_y as number} unit="mm" integer setField={setField} />
        <NumField label="ex" sub="dist. borde placa" help={HELP.ex} field="bar_edge_x" value={state.bar_edge_x as number} unit="mm" integer setField={setField} />
        <FieldWarn field="bar_edge_x" warnings={warnings} />
        <NumField label="ey" sub="dist. borde placa" help={HELP.ey} field="bar_edge_y" value={state.bar_edge_y as number} unit="mm" integer setField={setField} />
        <FieldWarn field="bar_edge_y" warnings={warnings} />
        <NumField label="hef" sub="prof. anclaje" help={HELP.hef} field="bar_hef" value={state.bar_hef as number} unit="mm" integer setField={setField} />
        <FieldWarn field="bar_hef" warnings={warnings} />
        <SelectField
          label="Anclaje inferior"
          help={HELP.bottomAnchorage}
          field="bottom_anchorage"
          value={state.bottom_anchorage as string}
          options={AVAILABLE_BOTTOM_ANCHORAGES.map((t) => ({ value: t, label: BOTTOM_ANCHORAGE_LABEL[t] }))}
          setField={setField}
        />
        <SelectField
          label="Unión a placa"
          help={HELP.topConnection}
          field="top_connection"
          value={state.top_connection as string}
          options={AVAILABLE_TOP_CONNECTIONS.map((t) => ({ value: t, label: TOP_CONNECTION_LABEL[t] }))}
          setField={setField}
        />
        {state.bottom_anchorage === 'arandela_tuerca' && (
          <>
            <NumField
              label="OD arandela"
              sub="diámetro exterior"
              help={HELP.washerOd}
              field="washer_od"
              value={state.washer_od as number}
              unit="mm"
              integer
              setField={setField}
            />
            <FieldWarn field="washer_od" warnings={warnings} />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection label="Rigidizadores">
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-widest text-text-disabled mb-1">Nº de rigidizadores</p>
          <IconGrid
            groupLabel="Rigidizadores"
            active={state.rib_count as 0 | 2 | 4}
            onSelect={(v) => setField('rib_count', v)}
            options={[
              { value: 0, label: '0', ariaLabel: 'Sin rigidizadores',                       glyph: <RibGlyph0 /> },
              { value: 2, label: '2', ariaLabel: '2 rigidizadores en eje fuerte',           glyph: <RibGlyph2 /> },
              { value: 4, label: '4', ariaLabel: '4 rigidizadores (2 en cada eje)',         glyph: <RibGlyph4 /> },
            ]}
          />
        </div>
        <NumField label="h"  sub="altura" help={HELP.ribH} field="rib_h" value={state.rib_h as number} unit="mm" integer setField={setField} />
        <NumField label="t"  sub="espesor" help={HELP.ribT} field="rib_t" value={state.rib_t as number} unit="mm" integer setField={setField} />
      </CollapsibleSection>

      <CollapsibleSection label="Pedestal (hormigón)">
        <SelectField
          label="fck"
          help={HELP.fck}
          field="fck"
          value={state.fck as number}
          options={availableFck.map((f) => ({ value: f, label: `${f} MPa` }))}
          setField={setField}
        />
        <NumField label="h"   sub="canto macizo" help={HELP.pedestalH} field="pedestal_h" value={state.pedestal_h as number} unit="mm" integer setField={setField} />
        <NumField label="cX"  sub={edgesDirectional ? 'barra→borde (simétrico)' : 'barra→borde (c1)'} help={HELP.cX} field="pedestal_cX" value={state.pedestal_cX as number} unit="mm" integer setField={(_f, v) => setLegacyCX(v as number)} />
        <NumField label="cY"  sub={edgesDirectional ? 'barra→borde (simétrico)' : 'barra→borde (c2)'} help={HELP.cY} field="pedestal_cY" value={state.pedestal_cY as number} unit="mm" integer setField={(_f, v) => setLegacyCY(v as number)} />
        <ExpandToggle
          open={edgesDirectional}
          onToggle={() => setEdgesDirectional((o) => !o)}
          label={edgesDirectional ? 'Bordes direccionales por cara (asimétrico)' : 'Bordes direccionales por cara ▸'}
        />
        {edgesDirectional && (
          <>
            <NumField label="cX1" sub="cara +x"  help={HELP.cX1} field="pedestal_cX1" value={state.pedestal_cX1 as number} unit="mm" integer setField={setField} />
            <NumField label="cX2" sub="cara −x"  help={HELP.cX2} field="pedestal_cX2" value={state.pedestal_cX2 as number} unit="mm" integer setField={setField} />
            <NumField label="cY1" sub="cara +y"  help={HELP.cY1} field="pedestal_cY1" value={state.pedestal_cY1 as number} unit="mm" integer setField={setField} />
            <NumField label="cY2" sub="cara −y"  help={HELP.cY2} field="pedestal_cY2" value={state.pedestal_cY2 as number} unit="mm" integer setField={setField} />
          </>
        )}
        <NumField label="mX"  sub="placa→borde (α)"  help={HELP.mX} field="plate_margin_x" value={state.plate_margin_x as number} unit="mm" integer setField={setField} />
        <NumField label="mY"  sub="placa→borde (α)"  help={HELP.mY} field="plate_margin_y" value={state.plate_margin_y as number} unit="mm" integer setField={setField} />
        <SelectField
          label="Superficie"
          help={HELP.surface}
          field="surface_type"
          value={state.surface_type as string}
          options={[
            { value: 'smooth',    label: 'lisa (µ=0.2)' },
            { value: 'roughened', label: 'rugosa (µ=0.4)' },
          ]}
          setField={setField}
        />
        <NumField label="aw" sub="garganta (info)" help={HELP.weld} field="weld_throat" value={state.weld_throat as number} unit="mm" integer setField={setField} />
      </CollapsibleSection>

    </div>
  );
}
