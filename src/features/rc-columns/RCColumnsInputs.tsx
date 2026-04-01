import { useState, useEffect } from 'react';
import { type RCColumnInputs } from '../../data/defaults';
import { availableFck, availableFyk } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';

interface RCColumnsInputsProps {
  state: RCColumnInputs;
  setField: (key: string, value: number | string) => void;
}

const FCK_OPTIONS = availableFck.map((v) => ({ value: v, label: `${v}` }));
const FYK_OPTIONS = availableFyk.map((v) => ({ value: v, label: `${v}` }));
const BAR_DIAM_OPTIONS = availableBarDiams.map((v) => ({ value: v, label: `${v}` }));
const STIRRUP_DIAM_OPTIONS = [6, 8, 10, 12].map((v) => ({ value: v, label: `${v}` }));

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled pt-2.25 pb-1.75 border-b border-border-sub mb-2.5 mt-3 first:mt-0">
      {label}
    </p>
  );
}

function SubHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-disabled/70 pt-1.5 pb-1 mb-1 mt-2">
      {label}
    </p>
  );
}

function NumberField({
  label,
  sub,
  fieldKey,
  value,
  unit,
  min: _min,
  step: _step = 1,
  integer = false,
  setField,
}: {
  label: string;
  sub?: string;
  fieldKey: string;
  value: number;
  unit: string;
  min?: number;
  step?: number;
  integer?: boolean;
  setField: (key: string, value: number | string) => void;
}) {
  const [localStr, setLocalStr] = useState(() => String(value));

  useEffect(() => {
    setLocalStr(String(value));
  }, [value]);

  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label
        htmlFor={`input-${fieldKey}`}
        className="text-[13px] text-text-secondary whitespace-nowrap shrink-0"
      >
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </label>
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
          aria-label={unit ? `${label} (${unit})` : label}
          className={`w-15 text-right bg-bg-primary border border-border-main px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors ${unit ? 'rounded-l' : 'rounded'}`}
        />
        {unit && (
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function SelectField({
  label,
  sub,
  fieldKey,
  value,
  options,
  unit,
  setField,
}: {
  label: string;
  sub?: string;
  fieldKey: string;
  value: number;
  options: Array<{ value: number; label: string }>;
  unit?: string;
  setField: (key: string, value: number | string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`select-${fieldKey}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
        {unit && <span className="text-[11px] text-text-disabled ml-1">{unit}</span>}
      </label>
      <select
        id={`select-${fieldKey}`}
        value={value}
        onChange={(e) => setField(fieldKey, Number(e.target.value))}
        className="min-w-0 bg-bg-primary border border-border-main rounded px-1.75 py-1 text-[12px] text-text-primary font-mono outline-none focus:border-accent transition-colors cursor-pointer"
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

  const cornerArea = Math.PI * (state.cornerBarDiam / 2) ** 2;
  const areaX = Math.PI * (state.barDiamX / 2) ** 2;
  const areaY = Math.PI * (state.barDiamY / 2) ** 2;
  const As_total = (4 * cornerArea + 2 * state.nBarsX * areaX + 2 * state.nBarsY * areaY).toFixed(0);

  return (
    <div>
      <SectionHeader label="Geometría" />
      <NumberField label="Ancho b"       fieldKey="b"     value={state.b}     unit="mm" min={100}  setField={setField} />
      <NumberField label="Canto h"       fieldKey="h"     value={state.h}     unit="mm" min={100}  setField={setField} />
      <NumberField label="Recubrimiento" fieldKey="cover" value={state.cover} unit="mm" min={10}   setField={setField} />
      <NumberField label="Longitud L"    fieldKey="L"     value={state.L}     unit="m"  min={0.5} step={0.1} setField={setField} />
      <NumberField label="Beta β"        sub="(coef. pandeo)" fieldKey="beta" value={state.beta} unit="" min={0.5} step={0.05} setField={setField} />
      <div className="flex items-center justify-between py-0.75 gap-2">
        <span className="text-[13px] text-text-disabled whitespace-nowrap shrink-0">Lk = L × β</span>
        <span className="font-mono text-[12px] text-text-secondary tabular-nums shrink-0">{Lk} m</span>
      </div>

      <SectionHeader label="Materiales" />
      <SelectField label="fck" fieldKey="fck" value={state.fck} options={FCK_OPTIONS} unit="MPa" setField={setField} />
      <SelectField label="fyk" fieldKey="fyk" value={state.fyk} options={FYK_OPTIONS} unit="MPa" setField={setField} />

      <SectionHeader label="Armadura longitudinal" />
      <SelectField label="Ø esquina" sub="(4 barras)" fieldKey="cornerBarDiam" value={state.cornerBarDiam} options={BAR_DIAM_OPTIONS} unit="mm" setField={setField} />

      <SubHeader label="Cara X  (sup. + inf.)" />
      <NumberField label="Núm. interm." sub="(por cara)" fieldKey="nBarsX" value={state.nBarsX} unit="ud" min={0} integer setField={setField} />
      <SelectField label="Diámetro" fieldKey="barDiamX" value={state.barDiamX} options={BAR_DIAM_OPTIONS} unit="mm" setField={setField} />

      <SubHeader label="Cara Y  (laterales)" />
      <NumberField label="Núm. interm." sub="(por cara)" fieldKey="nBarsY" value={state.nBarsY} unit="ud" min={0} integer setField={setField} />
      <SelectField label="Diámetro" fieldKey="barDiamY" value={state.barDiamY} options={BAR_DIAM_OPTIONS} unit="mm" setField={setField} />

      <div className="flex items-center justify-between py-0.75 gap-2 mt-1">
        <span className="text-[13px] text-text-disabled whitespace-nowrap shrink-0">As total</span>
        <span className="font-mono text-[12px] text-text-secondary tabular-nums shrink-0">{As_total} mm²</span>
      </div>

      <SectionHeader label="Armadura transversal" />
      <SelectField label="Ø estribo" fieldKey="stirrupDiam" value={state.stirrupDiam} options={STIRRUP_DIAM_OPTIONS} unit="mm" setField={setField} />
      <NumberField label="Separación" fieldKey="stirrupSpacing" value={state.stirrupSpacing} unit="mm" min={50} setField={setField} />

      <SectionHeader label="Solicitaciones" />
      <NumberField
        label="NEd"
        sub="(compresión +)"
        fieldKey="Nd"
        value={state.Nd}
        unit="kN"
        min={1}
        step={10}
        setField={setField}
      />
      <NumberField
        label="MEdy"
        sub="(eje y, h)"
        fieldKey="MEdy"
        value={state.MEdy}
        unit="kNm"
        step={1}
        setField={setField}
      />
      <NumberField
        label="MEdz"
        sub="(eje z, b)"
        fieldKey="MEdz"
        value={state.MEdz}
        unit="kNm"
        step={1}
        setField={setField}
      />
    </div>
  );
}
