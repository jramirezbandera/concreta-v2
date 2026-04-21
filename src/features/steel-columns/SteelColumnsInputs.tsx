import { useEffect } from 'react';
import { type SteelColumnInputs, type ColumnBCType } from '../../data/defaults';
import { getSizesForTipo, getSizesUPN } from '../../data/steelProfiles';
import { getBetaForBCType } from '../../lib/calculations/steelColumnBC';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { IconGridSelector, type IconGridOption } from '../../components/ui/IconGridSelector';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

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

const BC_OPTIONS: ReadonlyArray<IconGridOption<ColumnBCType>> = [
  { value: 'pp',     label: 'Art-Art',   Icon: SvgPP,     tooltip: 'Articulado–Articulado  β=1.0' },
  { value: 'pf',     label: 'Art-Emp',   Icon: SvgPF,     tooltip: 'Articulado–Empotrado  β=0.7' },
  { value: 'ff',     label: 'Emp-Emp',   Icon: SvgFF,     tooltip: 'Empotrado–Empotrado  β=0.5' },
  { value: 'fc',     label: 'Ménsula',   Icon: SvgFC,     tooltip: 'Empotrado–Libre  β=2.0' },
  { value: 'custom', label: 'β lib.',    Icon: SvgCustom, tooltip: 'Coeficientes personalizados' },
];

// ── Shared field components ───────────────────────────────────────────────────

function NumField({
  labelKey, label, sub, id, value, unit, min, step, onChange,
}: {
  // Pull label/sub/unit from the LABELS catalog when a key is given.
  labelKey?: LabelKey;
  // Escape hatch for one-off fields not in the catalog.
  label?: string; sub?: string; unit?: string;
  id: string; value: number;
  min?: number; step?: number;
  onChange: (v: number) => void;
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '—' ? '' : resolved.unit;
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={id} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) onChange(n); }}
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
  labelKey, label, id, value, options, onChange,
}: {
  labelKey?: LabelKey; label?: string;
  id: string; value: string | number;
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
          const num = Number(raw);
          onChange(isNaN(num) || raw === '' ? raw : num);
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
  const isCHS = state.sectionType === 'CHS';
  const availableSizes = isCHS
    ? []
    : isBox
    ? getSizesUPN()
    : getSizesForTipo(state.sectionType as 'HEA' | 'HEB' | 'IPE');

  // When sectionType changes, snap size to first available if current is invalid
  useEffect(() => {
    if (!isCHS && !availableSizes.includes(state.size)) {
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

  // d/t badge — CHS slenderness ratio. EC3 Class 3 limit is 90·ε² → for S275 ≈ 76.9.
  // Informational only; the actual classification runs in the calc layer and is
  // surfaced via the "Clasificación CLASE X" check row.
  const chs_dOverT = isCHS && state.chs_t > 0 ? state.chs_D / state.chs_t : 0;

  return (
    <div className="flex flex-col" aria-label="Datos de entrada — Pilar de acero">

      {/* SECCIÓN */}
      <CollapsibleSection label="Sección">
      <SelectField
        labelKey="profile_type"
        id="sc-sectionType"
        value={state.sectionType}
        options={[
          { value: 'HEA', label: 'HEA' },
          { value: 'HEB', label: 'HEB' },
          { value: 'IPE', label: 'IPE' },
          { value: '2UPN', label: '2UPN' },
          { value: 'CHS', label: 'Circular' },
        ]}
        onChange={(v) => setField('sectionType', v)}
      />
      {isCHS ? (
        <>
          <NumField
            label="D"
            sub="diámetro exterior"
            unit="mm"
            id="sc-chs-D"
            value={state.chs_D}
            min={20}
            step={1}
            onChange={(v) => { if (v > 0) setField('chs_D', v); }}
          />
          <NumField
            label="t"
            sub="espesor pared"
            unit="mm"
            id="sc-chs-t"
            value={state.chs_t}
            min={1}
            step={0.1}
            onChange={(v) => { if (v > 0) setField('chs_t', v); }}
          />
          <SelectField
            label="Proceso"
            id="sc-chs-process"
            value={state.chs_process}
            options={[
              { value: 'hot-finished', label: 'Caliente (EN 10210)' },
              { value: 'cold-formed',  label: 'Frío (EN 10219)' },
            ]}
            onChange={(v) => setField('chs_process', v as SteelColumnInputs['chs_process'])}
          />
          <div className="flex items-center justify-between py-0.75 gap-2">
            <span className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
              D/t<span className="text-[11px] text-text-disabled ml-1">esbeltez</span>
            </span>
            <span
              className="bg-bg-elevated text-text-disabled font-mono text-[11px] px-1.5 py-0.5 rounded tabular-nums"
              title="EC3 §5.5 Tab 5.2: Clase 1 si D/t ≤ 50·ε², Clase 2 ≤ 70·ε², Clase 3 ≤ 90·ε²"
            >
              {chs_dOverT.toFixed(1)}
            </span>
          </div>
        </>
      ) : (
        <SelectField
          labelKey="profile_size"
          id="sc-size"
          value={state.size}
          options={sizeOptions}
          onChange={(v) => setField('size', v)}
        />
      )}
      <SelectField
        labelKey="steel_grade"
        id="sc-steel"
        value={state.steel}
        options={(['S275', 'S355'] as const).map((s) => ({ value: s, label: s }))}
        onChange={(v) => setField('steel', v)}
      />
      </CollapsibleSection>

      {/* GEOMETRÍA */}
      <CollapsibleSection label="Geometría">

      {/* Ly — unbraced length y-axis, displayed in m (stored internally in mm) */}
      <div className="flex items-center justify-between py-0.75 gap-2">
        <label htmlFor="sc-Ly" className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
          {LABELS.Ly_strong.sym}
          <span className="text-[11px] text-text-disabled ml-1">{LABELS.Ly_strong.descShort}</span>
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
            className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label={`${LABELS.Ly_strong.sym} (${LABELS.Ly_strong.unit})`}
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
            {LABELS.Ly_strong.unit}
          </span>
        </div>
      </div>

      {/* Lz — unbraced length z-axis, displayed in m (stored internally in mm) */}
      <div className="flex items-center justify-between py-0.75 gap-2">
        <label htmlFor="sc-Lz" className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
          {LABELS.Lz_weak.sym}
          <span className="text-[11px] text-text-disabled ml-1">{LABELS.Lz_weak.descShort}</span>
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
            className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label={`${LABELS.Lz_weak.sym} (${LABELS.Lz_weak.unit})`}
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
            {LABELS.Lz_weak.unit}
          </span>
        </div>
      </div>

      {/* BC selector — shared for both axes */}
      <div className="mt-2">
        <IconGridSelector
          options={BC_OPTIONS}
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
      </CollapsibleSection>

      {/* CARGAS */}
      <CollapsibleSection label="Cargas">
      <UnitNumberInput
        labelKey="NEd"
        quantity="force"
        id="sc-Ned"
        value={state.Ned}
        min={0}
        step={10}
        onChange={(v) => setField('Ned', v)}
      />
      <UnitNumberInput
        labelKey="My_Ed"
        quantity="moment"
        id="sc-My"
        value={state.My_Ed}
        min={0}
        step={1}
        onChange={(v) => setField('My_Ed', v)}
      />
      <UnitNumberInput
        labelKey="Mz_Ed"
        quantity="moment"
        id="sc-Mz"
        value={state.Mz_Ed}
        min={0}
        step={1}
        onChange={(v) => setField('Mz_Ed', v)}
      />
      </CollapsibleSection>
    </div>
  );
}
