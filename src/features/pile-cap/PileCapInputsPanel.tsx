import { useState, useEffect } from 'react';
import { type PileCapInputs } from '../../data/defaults';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface Props {
  state:    PileCapInputs;
  setField: (field: string, value: PileCapInputs[keyof PileCapInputs]) => void;
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
      <label htmlFor={`pc-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`pc-${field}`}
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
      <label htmlFor={`pc-sel-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <select
        id={`pc-sel-${field}`}
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

const N_OPTIONS = [2, 3, 4] as const;

export function PileCapInputsPanel({ state, setField }: Props) {
  const n = state.n as number;

  const fckOptions = availableFck.map((v) => ({ value: v, label: `${v} MPa` }));
  const fykOptions = [{ value: 500, label: '500 MPa' }, { value: 400, label: '400 MPa' }];
  const barOptions = availableBarDiams.map((v) => ({ value: v, label: `Ø${v} mm` }));

  return (
    <div className="flex flex-col gap-0">

      {/* n picker — segmented control */}
      <CollapsibleSection label="Número de micropilotes">
        <div
          role="radiogroup"
          aria-label="Número de micropilotes"
          className="flex rounded border border-border-main mb-3 shrink-0 overflow-hidden"
        >
          {N_OPTIONS.map((opt) => {
            const isActive = n === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setField('n', opt)}
                className={[
                  'flex-1 py-2 text-center transition-colors border-r border-border-main last:border-r-0',
                  isActive
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-text-disabled hover:text-text-secondary',
                ].join(' ')}
              >
                <span className="text-[12px] font-mono">{opt}</span>
              </button>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* Geometry */}
      <CollapsibleSection label="Geometría">
        <NumField label="d_p"    sub="Diám. pilote"     field="d_p"    value={state.d_p as number}    unit="mm"  setField={setField} />
        <NumField label="s"      sub="Sep. c/c"         field="s"      value={state.s as number}      unit="mm"  setField={setField} />
        <NumField labelKey="h_encepado" field="h_enc"  value={state.h_enc as number}  setField={setField} />
        <NumField labelKey="b_col"      field="b_col"  value={state.b_col as number}  setField={setField} />
        <NumField labelKey="h_col"      field="h_col"  value={state.h_col as number}  setField={setField} />
        <UnitNumberInput
          label="R_adm" sub="Cap. admisible" field="R_adm"
          value={state.R_adm as number} quantity="force"
          onChange={(v) => setField('R_adm', v)}
        />
      </CollapsibleSection>

      {/* Loads */}
      <CollapsibleSection label="Acciones de diseño (ELU)">
        <UnitNumberInput
          labelKey="NEd" field="N_Ed"
          value={state.N_Ed as number} quantity="force"
          onChange={(v) => setField('N_Ed', v)}
        />
        <UnitNumberInput
          labelKey="Mx_Ed_plan" field="Mx_Ed"
          value={state.Mx_Ed as number} quantity="moment"
          onChange={(v) => setField('Mx_Ed', v)}
        />
        {n !== 2 && (
          <UnitNumberInput
            labelKey="My_Ed_plan" field="My_Ed"
            value={state.My_Ed as number} quantity="moment"
            onChange={(v) => setField('My_Ed', v)}
          />
        )}
      </CollapsibleSection>

      {/* Materials */}
      <CollapsibleSection label="Materiales">
        <SelectField labelKey="fck" field="fck" value={state.fck as number} options={fckOptions} setField={setField} />
        <SelectField labelKey="fyk" field="fyk" value={state.fyk as number} options={fykOptions} setField={setField} />
      </CollapsibleSection>

      {/* Reinforcement */}
      <CollapsibleSection label="Armadura tirantes">
        <SelectField labelKey="bar_diameter_tie" field="phi_tie" value={state.phi_tie as number} options={barOptions} setField={setField} />
        <NumField labelKey="cover_mechanical" field="cover"  value={state.cover as number}  setField={setField} />

        {n === 2 && (
          <p className="text-[10px] text-text-secondary mt-3 leading-relaxed">
            n=2: 2 pilotes alineados en X. Mx_Ed debe ser 0 (staticamente inadmisible). Usar n=4 para momento biaxial.
          </p>
        )}
      </CollapsibleSection>
    </div>
  );
}
