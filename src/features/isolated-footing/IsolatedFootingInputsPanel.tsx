import { useState, useEffect } from 'react';
import { type IsolatedFootingInputs, type FootingSoilType } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface Props {
  state:    IsolatedFootingInputs;
  setField: (field: string, value: IsolatedFootingInputs[keyof IsolatedFootingInputs]) => void;
}

// ── NumField ──────────────────────────────────────────────────────────────────

function NumField({
  labelKey, label, sub, field, value, unit, setField,
}: {
  labelKey?: LabelKey;
  label?: string; sub?: string; field: string;
  value: number; unit?: string; setField: Props['setField'];
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '—' ? '' : resolved.unit;
  const [localStr, setLocalStr] = useState(() => String(value));
  useEffect(() => { setLocalStr(String(value)); }, [value]);

  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`if-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`if-${field}`}
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

// ── SelectField ───────────────────────────────────────────────────────────────

function SelectField({
  labelKey, label, field, value, options, setField,
}: {
  labelKey?: LabelKey;
  label?: string; field: string; value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: Props['setField'];
}) {
  const resolved = labelKey
    ? LABELS[labelKey].sym
      ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort }
      : { label: LABELS[labelKey].descShort, sub: undefined as string | undefined }
    : { label: label ?? '', sub: undefined as string | undefined };
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`if-sel-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <select
        id={`if-sel-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          setField(field, isNaN(asNum) ? raw : asNum);
        }}
        className="shrink-0 bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function IsolatedFootingInputsPanel({ state, setField }: Props) {
  const soilType = state.soilType as FootingSoilType;

  const fckOptions  = availableFck.map((v) => ({ value: v, label: `${v} MPa` }));
  const fykOptions  = [{ value: 500, label: '500 MPa' }, { value: 400, label: '400 MPa' }];
  const barOptions  = availableBarDiams.map((v) => ({ value: v, label: `Ø${v} mm` }));

  return (
    <div className="flex flex-col gap-0">

      {/* Soil type toggle */}
      <CollapsibleSection label="Tipo de suelo">
        <div
          role="radiogroup"
          aria-label="Tipo de suelo"
          className="flex rounded border border-border-main mb-3 shrink-0 overflow-hidden"
        >
          {(['cohesive', 'granular'] as const).map((opt) => {
            const isActive = soilType === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => {
                  setField('soilType', opt);
                  // Auto-set c_base to 0 for granular
                  if (opt === 'granular') setField('c_base', 0);
                }}
                className={[
                  'flex-1 py-2 text-center transition-colors border-r border-border-main last:border-r-0',
                  isActive
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-text-disabled hover:text-text-secondary',
                ].join(' ')}
              >
                <span className="text-[12px] font-mono">
                  {opt === 'cohesive' ? 'Cohesivo' : 'Granular'}
                </span>
              </button>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* Geometry */}
      <CollapsibleSection label="Geometría">
        <NumField labelKey="B_footing"   field="B"     value={state.B  as number}  setField={setField} />
        <NumField labelKey="L_footing"   field="L"     value={state.L  as number}  setField={setField} />
        <NumField labelKey="h_footing"   field="h"     value={state.h  as number}  setField={setField} />
        <NumField label="bc"    sub="Pilar ancho x"  field="bc"    value={state.bc as number}  unit="m"  setField={setField} />
        <NumField label="hc"    sub="Pilar canto y"  field="hc"    value={state.hc as number}  unit="m"  setField={setField} />
        <NumField labelKey="Df_embedment" field="Df"    value={state.Df as number}  setField={setField} />
        <NumField labelKey="cover_mechanical" field="cover" value={state.cover as number} setField={setField} />
      </CollapsibleSection>

      {/* SLS loads */}
      <CollapsibleSection label="Cargas SLS (suelo)">
        <UnitNumberInput labelKey="N_k"  field="N_k"   value={state.N_k  as number} quantity="force"  onChange={(v) => setField('N_k',  v)} />
        <UnitNumberInput labelKey="Mx_k" field="Mx_k"  value={state.Mx_k as number} quantity="moment" onChange={(v) => setField('Mx_k', v)} />
        <UnitNumberInput labelKey="My_k" field="My_k"  value={state.My_k as number} quantity="moment" onChange={(v) => setField('My_k', v)} />
        <UnitNumberInput labelKey="H_k"  field="H_k"   value={state.H_k  as number} quantity="force"  onChange={(v) => setField('H_k',  v)} />
      </CollapsibleSection>

      {/* ELU loads */}
      <CollapsibleSection label="Cargas ELU (armado)">
        <UnitNumberInput labelKey="NEd"        field="N_Ed"   value={state.N_Ed  as number} quantity="force"  onChange={(v) => setField('N_Ed',  v)} />
        <UnitNumberInput labelKey="Mx_Ed_plan" field="Mx_Ed"  value={state.Mx_Ed as number} quantity="moment" onChange={(v) => setField('Mx_Ed', v)} />
        <UnitNumberInput labelKey="My_Ed_plan" field="My_Ed"  value={state.My_Ed as number} quantity="moment" onChange={(v) => setField('My_Ed', v)} />
      </CollapsibleSection>

      {/* Materials */}
      <CollapsibleSection label="Materiales">
        <SelectField labelKey="fck" field="fck" value={state.fck as number} options={fckOptions} setField={setField} />
        <SelectField labelKey="fyk" field="fyk" value={state.fyk as number} options={fykOptions} setField={setField} />
      </CollapsibleSection>

      {/* Reinforcement */}
      <CollapsibleSection label="Armadura">
        <SelectField labelKey="bar_diameter_x" field="phi_x" value={state.phi_x as number} options={barOptions} setField={setField} />
        <NumField    label="s_x"  sub="Sep. barras x" field="s_x"  value={state.s_x as number}   unit="mm"  setField={setField} />
        <SelectField labelKey="bar_diameter_y" field="phi_y" value={state.phi_y as number} options={barOptions} setField={setField} />
        <NumField    label="s_y"  sub="Sep. barras y" field="s_y"  value={state.s_y as number}   unit="mm"  setField={setField} />
      </CollapsibleSection>

      {/* Soil parameters */}
      {soilType === 'cohesive' ? (
        <CollapsibleSection label="Parámetros del suelo (art. 4.3.2)">
          <NumField labelKey="c_soil"     field="c_soil"     value={state.c_soil     as number} setField={setField} />
          <NumField labelKey="phi_soil"   field="phi_soil"   value={state.phi_soil   as number} setField={setField} />
          <NumField labelKey="gamma_soil" field="gamma_soil" value={state.gamma_soil as number} setField={setField} />
          <NumField label="γ_R"    sub="Coef. segur."   field="gamma_R"    value={state.gamma_R    as number} unit="—"      setField={setField} />
          <NumField label="μ"      sub="Rozam. base"    field="mu"         value={state.mu         as number} unit="—"      setField={setField} />
          <NumField label="c_base" sub="Adhes. base"    field="c_base"     value={state.c_base     as number} unit="kPa"    setField={setField} />
        </CollapsibleSection>
      ) : (
        <CollapsibleSection label="Parámetros del suelo (art. 4.3.3)">
          <NumField label="N_SPT"  sub="Valor repr."    field="N_spt"      value={state.N_spt      as number} unit="—"      setField={setField} />
          <NumField label="μ"      sub="Rozam. base"    field="mu"         value={state.mu         as number} unit="—"      setField={setField} />
          <p className="text-[10px] text-text-secondary mt-2 leading-relaxed">
            Granular: c_base=0 (sin adherencia). Deslizamiento solo por rozamiento.
          </p>
        </CollapsibleSection>
      )}
    </div>
  );
}
