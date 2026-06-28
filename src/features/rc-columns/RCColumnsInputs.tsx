import { useState, useEffect } from 'react';
import { type RCColumnInputs } from '../../data/defaults';
import { availableFck, availableFyk } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';
import { IconGridSelector, type IconGridOption } from '../../components/ui/IconGridSelector';

interface RCColumnsInputsProps {
  state: RCColumnInputs;
  setField: <K extends keyof RCColumnInputs>(key: K, value: RCColumnInputs[K]) => void;
}

const FCK_OPTIONS = availableFck.map((v) => ({ value: v, label: `${v}` }));
const FYK_OPTIONS = availableFyk.map((v) => ({ value: v, label: `${v}` }));
const BAR_DIAM_OPTIONS = availableBarDiams.map((v) => ({ value: v, label: `${v}` }));
const STIRRUP_DIAM_OPTIONS = [6, 8, 10, 12].map((v) => ({ value: v, label: `${v}` }));

// Iconos esquemáticos (solo trazo) para el selector de forma de sección.
const RectIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);
const CircIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

type SectionShape = 'rectangular' | 'circular';
const SECTION_OPTIONS: ReadonlyArray<IconGridOption<SectionShape>> = [
  { value: 'rectangular', label: 'Rectangular', Icon: RectIcon, tooltip: 'Sección rectangular' },
  { value: 'circular', label: 'Circular', Icon: CircIcon, tooltip: 'Sección circular (anillo de barras)' },
];

function SubHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-disabled/70 pt-1.5 pb-1 mb-1 mt-2">
      {label}
    </p>
  );
}

function NumberField({
  labelKey,
  label,
  sub,
  help,
  fieldKey,
  value,
  unit,
  min: _min,
  step: _step = 1,
  integer = false,
  setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  sub?: string;
  help?: string;
  fieldKey: keyof RCColumnInputs;
  value: number;
  unit?: string;
  min?: number;
  step?: number;
  integer?: boolean;
  setField: <K extends keyof RCColumnInputs>(key: K, value: RCColumnInputs[K]) => void;
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
        htmlFor={`input-${fieldKey}`}
        labelKey={labelKey}
        label={labelKey ? undefined : resolved.label}
        sub={labelKey ? undefined : resolved.sub}
        help={help}
      />
      <div className="flex shrink-0">
        <input
          id={`input-${fieldKey}`}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          value={localStr}
          onChange={(e) => {
            const raw = integer ? e.target.value.replace(/[^0-9-]/g, '') : e.target.value;
            setLocalStr(raw);
            const n = integer ? parseInt(raw, 10) : parseFloat(raw);
            if (!isNaN(n)) setField(fieldKey, n);
          }}
          onBlur={() => {
            const n = integer ? parseInt(localStr, 10) : parseFloat(localStr);
            if (isNaN(n)) setLocalStr(String(value));
            else if (integer) setLocalStr(String(Math.round(n)));
          }}
          aria-label={unitText ? `${resolved.label} (${unitText})` : resolved.label}
          className={`w-15 text-right bg-bg-primary border border-border-main px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors ${unitText ? 'rounded-l' : 'rounded'}`}
        />
        {unitText && (
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
            {unitText}
          </span>
        )}
      </div>
    </div>
  );
}

function SelectField({
  labelKey,
  label,
  sub,
  help,
  fieldKey,
  value,
  options,
  unit,
  setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  sub?: string;
  help?: string;
  fieldKey: keyof RCColumnInputs;
  value: number;
  options: Array<{ value: number; label: string }>;
  unit?: string;
  setField: <K extends keyof RCColumnInputs>(key: K, value: RCColumnInputs[K]) => void;
}) {
  const resolved = labelKey
    ? LABELS[labelKey].sym
      ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort }
      : { label: LABELS[labelKey].descShort, sub: undefined as string | undefined }
    : { label: label ?? '', sub };
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel
        htmlFor={`select-${fieldKey}`}
        labelKey={labelKey}
        label={labelKey ? undefined : resolved.label}
        sub={labelKey ? undefined : (resolved.sub ?? (unit ? unit : undefined))}
        help={help}
      />
      <select
        id={`select-${fieldKey}`}
        value={value}
        onChange={(e) => setField(fieldKey, Number(e.target.value))}
        className="shrink-0 bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] text-text-primary font-mono outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function RCColumnsInputs({ state, setField }: RCColumnsInputsProps) {
  const Lk = (state.L * state.beta).toFixed(2);
  const isCircular = (state.sectionType ?? 'rectangular') === 'circular';

  const cornerArea = Math.PI * (state.cornerBarDiam / 2) ** 2;
  const areaX = Math.PI * (state.barDiamX / 2) ** 2;
  const areaY = Math.PI * (state.barDiamY / 2) ** 2;
  const circBarDiam = state.circBarDiam ?? 16;
  const nBarsCirc = state.nBarsCirc ?? 6;
  const As_total = (isCircular
    ? nBarsCirc * Math.PI * (circBarDiam / 2) ** 2
    : 4 * cornerArea + 2 * state.nBarsX * areaX + 2 * state.nBarsY * areaY
  ).toFixed(0);

  return (
    <div>
      <IconGridSelector<SectionShape>
        groupLabel="Forma de la sección"
        active={isCircular ? 'circular' : 'rectangular'}
        onSelect={(v) => setField('sectionType', v)}
        options={SECTION_OPTIONS}
        className="mb-3"
      />

      <CollapsibleSection label="Geometría">
        {isCircular ? (
          <NumberField labelKey="D_section" fieldKey="D" value={state.D ?? 350} min={150} setField={setField} />
        ) : (
          <>
            <NumberField labelKey="b_section" fieldKey="b" value={state.b} min={100} setField={setField} />
            <NumberField labelKey="h_section" fieldKey="h" value={state.h} min={100} setField={setField} />
          </>
        )}
        <NumberField labelKey="cover_mechanical" fieldKey="cover" value={state.cover} min={10}   setField={setField} />
        <NumberField labelKey="L_column"         fieldKey="L"     value={state.L}     min={0.5} step={0.1} setField={setField} />
        <NumberField labelKey="beta_buckling"    fieldKey="beta"  value={state.beta}  min={0.5} step={0.05} setField={setField} />
        <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
          <span className="text-[13px] text-text-disabled whitespace-nowrap shrink-0">Lk = L × β</span>
          <span className="font-mono text-[12px] text-text-secondary tabular-nums shrink-0">{Lk} m</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection label="Materiales">
        <SelectField labelKey="fck" fieldKey="fck" value={state.fck} options={FCK_OPTIONS} setField={setField} />
        <SelectField labelKey="fyk" fieldKey="fyk" value={state.fyk} options={FYK_OPTIONS} setField={setField} />
      </CollapsibleSection>

      <CollapsibleSection label="Armadura longitudinal">
        {isCircular ? (
          <>
            <NumberField label="n" sub="Nº barras del anillo" fieldKey="nBarsCirc" value={nBarsCirc} unit="ud" min={4} integer setField={setField}
              help="Número de barras longitudinales repartidas uniformemente en el anillo (mínimo 4 — Anejo 19 §9.5.2)." />
            <SelectField label="Ø barras" sub="Diámetro del anillo" fieldKey="circBarDiam" value={circBarDiam} options={BAR_DIAM_OPTIONS} setField={setField} />
          </>
        ) : (
          <>
            <SelectField labelKey="bar_diameter_corner" fieldKey="cornerBarDiam" value={state.cornerBarDiam} options={BAR_DIAM_OPTIONS} setField={setField} />

            <SubHeader label="Cara X  (sup. + inf.)" />
            <NumberField label="n" sub="Nº barras por cara" fieldKey="nBarsX" value={state.nBarsX} unit="ud" min={0} integer setField={setField}
              help="Número de barras intermedias por cara en la dirección X (sin contar las 4 de esquina)." />
            <SelectField labelKey="bar_diameter_intermediate" fieldKey="barDiamX" value={state.barDiamX} options={BAR_DIAM_OPTIONS} setField={setField} />

            <SubHeader label="Cara Y  (laterales)" />
            <NumberField label="n" sub="Nº barras por cara" fieldKey="nBarsY" value={state.nBarsY} unit="ud" min={0} integer setField={setField}
              help="Número de barras intermedias por cara en la dirección Y (laterales, sin contar las 4 de esquina)." />
            <SelectField labelKey="bar_diameter_intermediate" fieldKey="barDiamY" value={state.barDiamY} options={BAR_DIAM_OPTIONS} setField={setField} />
          </>
        )}

        <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 mt-1">
          <span className="text-[13px] text-text-disabled whitespace-nowrap shrink-0">As total</span>
          <span className="font-mono text-[12px] text-text-secondary tabular-nums shrink-0">{As_total} mm²</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection label="Armadura transversal">
        <SelectField labelKey="bar_diameter_stirrup" fieldKey="stirrupDiam" value={state.stirrupDiam} options={STIRRUP_DIAM_OPTIONS} setField={setField} />
        <NumberField label="s" sub="Separación cercos" fieldKey="stirrupSpacing" value={state.stirrupSpacing} unit="mm" min={50} setField={setField}
          help="Separación longitudinal entre cercos. Limita el pandeo de las barras comprimidas y aporta confinamiento al núcleo." />
      </CollapsibleSection>

      <CollapsibleSection label="Solicitaciones">
        <UnitNumberInput labelKey="NEd"   field="Nd"   value={state.Nd}   quantity="force"  onChange={(v) => setField('Nd', v)} />
        <UnitNumberInput labelKey="My_Ed" field="MEdy" value={state.MEdy} quantity="moment" onChange={(v) => setField('MEdy', v)} />
        <UnitNumberInput labelKey="Mz_Ed" field="MEdz" value={state.MEdz} quantity="moment" onChange={(v) => setField('MEdz', v)} />
      </CollapsibleSection>
    </div>
  );
}
