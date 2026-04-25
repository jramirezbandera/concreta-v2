import { useState, useEffect } from 'react';
import { type IsolatedFootingInputs } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface Props {
  state:    IsolatedFootingInputs;
  setField: (field: string, value: IsolatedFootingInputs[keyof IsolatedFootingInputs]) => void;
}

// ── NumField ──────────────────────────────────────────────────────────────────

function NumField({
  labelKey, label, sub, field, value, unit, helpText, setField,
}: {
  labelKey?: LabelKey;
  label?: string; sub?: string; field: string;
  value: number; unit?: string;
  helpText?: string;
  setField: Props['setField'];
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '—' ? '' : resolved.unit;
  const [localStr, setLocalStr] = useState(() => String(value));
  useEffect(() => { setLocalStr(String(value)); }, [value]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between py-0.75 gap-2">
        <InputLabel htmlFor={`if-${field}`} label={resolved.label} sub={resolved.sub} />
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
      {helpText && (
        <p className="text-[10px] text-text-disabled leading-tight mt-0.5 mb-1 whitespace-pre-line">
          {helpText}
        </p>
      )}
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
      <InputLabel htmlFor={`if-sel-${field}`} label={resolved.label} sub={resolved.sub} />
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
  const fckOptions  = availableFck.map((v) => ({ value: v, label: `${v} MPa` }));
  const fykOptions  = [{ value: 500, label: '500 MPa' }, { value: 400, label: '400 MPa' }];
  const barOptions  = availableBarDiams.map((v) => ({ value: v, label: `Ø${v} mm` }));

  const dfHelpText =
    'Profundidad hasta la base de zapata, medida desde el terreno natural.\n'
    + 'Se usa solo para calcular el peso de tierras sobre la zapata.';

  const loadsHelpText =
    'Sin mayorar: introduce cargas de servicio (SLS). Se mayoran con γ para armado.\n'
    + 'Mayoradas: introduce cargas ELU. Se desmayoran con γ para suelo.';

  return (
    <div className="flex flex-col gap-0">

      {/* 1. Geometría */}
      <CollapsibleSection label="Geometría">
        <NumField labelKey="B_footing"   field="B"     value={state.B}  setField={setField} />
        <NumField labelKey="L_footing"   field="L"     value={state.L}  setField={setField} />
        <NumField labelKey="h_footing"   field="h"     value={state.h}  setField={setField} />
        <NumField label="bc"    sub="Pilar ancho x"  field="bc"    value={state.bc}  unit="m"  setField={setField} />
        <NumField label="hc"    sub="Pilar canto y"  field="hc"    value={state.hc}  unit="m"  setField={setField} />
        <NumField labelKey="Df_embedment" field="Df"   value={state.Df}  helpText={dfHelpText} setField={setField} />
        <NumField labelKey="cover_mechanical" field="cover" value={state.cover} setField={setField} />
      </CollapsibleSection>

      {/* 2. Tensión admisible */}
      <CollapsibleSection label="Tensión admisible del terreno">
        <UnitNumberInput
          labelKey="sigma_adm" field="sigma_adm"
          value={state.sigma_adm} quantity="soilPressure"
          onChange={(v) => setField('sigma_adm', v)}
        />
      </CollapsibleSection>

      {/* 3. Cargas */}
      <CollapsibleSection label="Cargas">
        <div
          role="radiogroup"
          aria-label="Tipo de cargas introducidas"
          className="flex rounded border border-border-main mb-1 shrink-0 overflow-hidden"
        >
          {(['sin_mayorar', 'mayoradas'] as const).map((opt) => {
            const isActive = (opt === 'mayoradas') === state.loadsAreFactored;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setField('loadsAreFactored', opt === 'mayoradas')}
                className={[
                  'flex-1 py-2 text-center transition-colors border-r border-border-main last:border-r-0',
                  isActive
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-text-disabled hover:text-text-secondary',
                ].join(' ')}
              >
                <span className="text-[12px] font-mono">
                  {opt === 'sin_mayorar' ? 'Sin mayorar' : 'Mayoradas'}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-text-disabled leading-tight mt-1 mb-2 whitespace-pre-line">
          {loadsHelpText}
        </p>

        <NumField labelKey="load_factor" field="loadFactor" value={state.loadFactor} setField={setField} />

        <UnitNumberInput labelKey="N_footing"  field="N"  value={state.N}  quantity="force"  onChange={(v) => setField('N', v)} />
        <UnitNumberInput labelKey="Mx_footing" field="Mx" value={state.Mx} quantity="moment" onChange={(v) => setField('Mx', v)} />
        <UnitNumberInput labelKey="My_footing" field="My" value={state.My} quantity="moment" onChange={(v) => setField('My', v)} />
        <UnitNumberInput labelKey="H_footing"  field="H"  value={state.H}  quantity="force"  onChange={(v) => setField('H', v)} />
      </CollapsibleSection>

      {/* 4. Materiales */}
      <CollapsibleSection label="Materiales">
        <SelectField labelKey="fck" field="fck" value={state.fck} options={fckOptions} setField={setField} />
        <SelectField labelKey="fyk" field="fyk" value={state.fyk} options={fykOptions} setField={setField} />
      </CollapsibleSection>

      {/* 5. Armadura */}
      <CollapsibleSection label="Armadura">
        <SelectField labelKey="bar_diameter_x" field="phi_x" value={state.phi_x} options={barOptions} setField={setField} />
        <NumField    label="s_x"  sub="Sep. barras x" field="s_x" value={state.s_x} unit="mm" setField={setField} />
        <SelectField labelKey="bar_diameter_y" field="phi_y" value={state.phi_y} options={barOptions} setField={setField} />
        <NumField    label="s_y"  sub="Sep. barras y" field="s_y" value={state.s_y} unit="mm" setField={setField} />
      </CollapsibleSection>

      {/* 6. Suelo */}
      <CollapsibleSection label="Suelo">
        <NumField labelKey="gamma_soil"  field="gamma_soil_kN_m3" value={state.gamma_soil_kN_m3} setField={setField} />
        <NumField labelKey="mu_friction" field="mu_friction"      value={state.mu_friction}      setField={setField} />
      </CollapsibleSection>
    </div>
  );
}
