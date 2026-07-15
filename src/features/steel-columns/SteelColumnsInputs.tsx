import { useEffect } from 'react';
import { type SteelColumnInputs, type ColumnBCType } from '../../data/defaults';
import { getSizesForTipo, getSizesUPN } from '../../data/steelProfiles';
import { getBetaForBCType } from '../../lib/calculations/steelColumnBC';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { IconGridSelector } from '../../components/ui/IconGridSelector';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';
import { BC_OPTIONS } from './columnBCOptions';

interface SteelColumnsInputsProps {
  state: SteelColumnInputs;
  setField: (field: keyof SteelColumnInputs, value: SteelColumnInputs[keyof SteelColumnInputs]) => void;
}

// ── Shared field components ───────────────────────────────────────────────────

function SelectField({
  labelKey, label, help, id, value, options, onChange,
}: {
  labelKey?: LabelKey; label?: string; help?: string;
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
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel
        htmlFor={id}
        labelKey={labelKey}
        label={labelKey ? undefined : resolved.label}
        sub={labelKey ? undefined : resolved.sub}
        help={help}
      />
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
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
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
        onChange={(v) => setField('sectionType', v as SteelColumnInputs['sectionType'])}
      />
      {isCHS ? (
        <>
          <UnitNumberInput
            label="D"
            sub="diámetro exterior"
            help="Diámetro exterior del tubo circular (CHS)."
            unit="mm"
            id="sc-chs-D"
            value={state.chs_D}
            min={20}
            step={1}
            widthClass="w-18"
            onChange={(v) => { if (v > 0) setField('chs_D', v); }}
          />
          <UnitNumberInput
            label="t"
            sub="espesor pared"
            help="Espesor de la pared del tubo. Con D define la clase de sección y la esbeltez D/t."
            unit="mm"
            id="sc-chs-t"
            value={state.chs_t}
            min={1}
            step={0.1}
            widthClass="w-18"
            onChange={(v) => { if (v > 0) setField('chs_t', v); }}
          />
          <SelectField
            label="Proceso"
            help="Proceso de fabricación del tubo: acabado en caliente (EN 10210) o conformado en frío (EN 10219); determina la curva de pandeo."
            id="sc-chs-process"
            value={state.chs_process}
            options={[
              { value: 'hot-finished', label: 'Caliente (EN 10210)' },
              { value: 'cold-formed',  label: 'Frío (EN 10219)' },
            ]}
            onChange={(v) => setField('chs_process', v as SteelColumnInputs['chs_process'])}
          />
          <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
            <span className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
              D/t<span className="text-[11px] text-text-disabled ml-1">esbeltez</span>
            </span>
            <span
              className="bg-bg-elevated text-text-disabled font-mono text-[11px] px-1.5 py-0.5 rounded tabular-nums"
              title="CE Anejo 22 §5.5 Tab 5.2: Clase 1 si D/t ≤ 50·ε², Clase 2 ≤ 70·ε², Clase 3 ≤ 90·ε²"
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
          onChange={(v) => setField('size', v as SteelColumnInputs['size'])}
        />
      )}
      <SelectField
        labelKey="steel_grade"
        id="sc-steel"
        value={state.steel}
        options={(['S275', 'S355'] as const).map((s) => ({ value: s, label: s }))}
        onChange={(v) => setField('steel', v as SteelColumnInputs['steel'])}
      />
      </CollapsibleSection>

      {/* GEOMETRÍA */}
      <CollapsibleSection label="Geometría">

      {/* Ly — unbraced length y-axis, displayed in m (stored internally in mm) */}
      <UnitNumberInput
        id="sc-Ly"
        labelKey="Ly_strong"
        value={+(state.Ly / 1000).toFixed(2)}
        min={0.1}
        step={0.1}
        widthClass="w-18"
        onChange={(m) => { if (m > 0) setField('Ly', Math.round(m * 1000)); }}
      />

      {/* Lz — unbraced length z-axis, displayed in m (stored internally in mm) */}
      <UnitNumberInput
        id="sc-Lz"
        labelKey="Lz_weak"
        value={+(state.Lz / 1000).toFixed(2)}
        min={0.1}
        step={0.1}
        widthClass="w-18"
        onChange={(m) => { if (m > 0) setField('Lz', Math.round(m * 1000)); }}
      />

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
            <UnitNumberInput
              label="βy"
              help="Factor de longitud de pandeo del eje fuerte (y). Lcr,y = βy·Ly."
              id="sc-beta-y"
              value={state.beta_y}
              unit="—"
              min={0.1}
              step={0.05}
              clamp
              widthClass="w-18"
              onChange={(v) => setField('beta_y', v)}
            />
            <UnitNumberInput
              label="βz"
              help="Factor de longitud de pandeo del eje débil (z). Lcr,z = βz·Lz."
              id="sc-beta-z"
              value={state.beta_z}
              unit="—"
              min={0.1}
              step={0.05}
              clamp
              widthClass="w-18"
              onChange={(v) => setField('beta_z', v)}
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
