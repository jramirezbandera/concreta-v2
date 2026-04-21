import React, { useState, useEffect } from 'react';
import {
  type ForjadosInputs,
  type ForjadosVariant,
  type ForjadosTipologia,
  type ForjadosTipoVano,
} from '../../data/defaults';
import { TIPOLOGIAS, TIPOS_VANO, getTipologia } from '../../data/forjadoTipologias';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface Props {
  state: ForjadosInputs;
  section: 'vano' | 'apoyo';
  setSection: (s: 'vano' | 'apoyo') => void;
  setField: (field: string, value: ForjadosInputs[keyof ForjadosInputs]) => void;
  onVariantSwitch: (next: ForjadosVariant) => void;
}

function NumField({
  label, sub, field, value, unit = 'mm', readOnly = false, integer = false, setField,
}: {
  label: string;
  sub?: string;
  field: string;
  value: number;
  unit?: string;
  readOnly?: boolean;
  integer?: boolean;
  setField: Props['setField'];
}) {
  const [localStr, setLocalStr] = useState(() => String(value));
  useEffect(() => { setLocalStr(String(value)); }, [value]);
  return (
    <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
      <label htmlFor={`input-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0 truncate min-w-0">
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`input-${field}`}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          value={localStr}
          readOnly={readOnly}
          onChange={(e) => {
            const raw = integer ? e.target.value.replace(/[^0-9-]/g, '') : e.target.value;
            setLocalStr(raw);
            const n = integer ? parseInt(raw, 10) : parseFloat(raw);
            if (!isNaN(n)) setField(field, n);
          }}
          onBlur={() => {
            const n = integer ? parseInt(localStr, 10) : parseFloat(localStr);
            if (isNaN(n)) setLocalStr(String(value));
          }}
          className={[
            'w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none transition-colors',
            readOnly
              ? 'opacity-60 cursor-not-allowed'
              : 'hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated',
          ].join(' ')}
          aria-label={`${label} (${unit})`}
        />
        <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
          {unit}
        </span>
      </div>
    </div>
  );
}

function SelectField({
  label, field, value, options, setField,
}: {
  label: string;
  field: string;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: Props['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
      <label htmlFor={`select-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
      </label>
      <select
        id={`select-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          setField(field, isNaN(asNum) || raw === '' ? raw : asNum);
        }}
        className="min-w-0 max-w-full truncate bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] text-text-primary font-mono outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleButton({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between py-0.75">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        onClick={onClick}
        className={[
          'px-2.5 py-0.75 rounded border text-[11px] font-mono transition-colors cursor-pointer',
          active
            ? 'bg-accent/10 border-accent/40 text-accent'
            : 'bg-bg-primary border-border-main text-text-disabled hover:text-text-secondary',
        ].join(' ')}
      >
        {active ? 'Activo' : 'Inactivo'}
      </button>
    </div>
  );
}

// ── SVG schematics for variant cards ────────────────────────────────────────

function SvgReticular() {
  return (
    <svg width="32" height="14" viewBox="0 0 32 14" aria-hidden="true">
      {/* capa compresión */}
      <rect x="1" y="1" width="30" height="3" fill="none" stroke="currentColor" strokeWidth="1.1" />
      {/* nervios */}
      <rect x="4"  y="4" width="3" height="9" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <rect x="14" y="4" width="3" height="9" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <rect x="24" y="4" width="3" height="9" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function SvgMaciza() {
  return (
    <svg width="32" height="14" viewBox="0 0 32 14" aria-hidden="true">
      <rect x="1" y="3" width="30" height="8" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

const VARIANTS: Array<{ value: ForjadosVariant; label: string; Svg: () => React.ReactElement }> = [
  { value: 'reticular', label: 'Reticular',   Svg: SvgReticular },
  { value: 'maciza',    label: 'Losa maciza', Svg: SvgMaciza },
];

const FCK_OPTIONS = availableFck.map((v) => ({ value: v, label: `${v} MPa` }));
const FYK_OPTIONS = [400, 500, 600].map((v) => ({ value: v, label: `${v} MPa` }));
const EXP_OPTIONS = ['XC1', 'XC2', 'XC3', 'XC4'].map((c) => ({ value: c, label: c }));
const BAR_OPTIONS = availableBarDiams.map((d) => ({ value: d, label: `Ø ${d}` }));
const MAC_PHI_OPTIONS = [8, 10, 12, 16, 20].map((d) => ({ value: d, label: `Ø ${d}` }));
const SW_DIAM_OPTIONS = [6, 8, 10, 12].map((d) => ({ value: d, label: `Ø ${d}` }));
const SW_LEGS_OPTIONS = [2, 3, 4].map((v) => ({ value: v, label: `${v}` }));
// Short labels for the narrow sidebar select. Canonical labels live in the data
// files and are used for PDFs where there's room.
const TIPOLOGIA_SHORT: Record<string, string> = {
  '25+5':  '25+5 (h30)',
  '30+5':  '30+5 (h35)',
  '35+5':  '35+5 (h40)',
  '40+5':  '40+5 (h45)',
  '35+10': '35+10 (h45)',
};
const TIPO_VANO_SHORT: Record<string, string> = {
  'biapoyado':         'Biapoyado (1.00)',
  'continuo-extremo':  'Cont. extremo (0.85)',
  'continuo-interior': 'Cont. interior (0.70)',
  'voladizo':          'Voladizo (2.00)',
};
const TIPOLOGIA_OPTIONS: Array<{ value: ForjadosTipologia; label: string }> = [
  ...TIPOLOGIAS.map((t) => ({ value: t.key, label: TIPOLOGIA_SHORT[t.key] ?? t.label })),
  { value: 'custom' as ForjadosTipologia, label: 'Personalizada' },
];
const TIPO_VANO_OPTIONS: Array<{ value: ForjadosTipoVano; label: string }> = TIPOS_VANO.map((t) => ({
  value: t.key, label: TIPO_VANO_SHORT[t.key] ?? t.label,
}));

export function ForjadosInputsPanel({ state, section, setSection, setField, onVariantSwitch }: Props) {
  const variant = state.variant as ForjadosVariant;
  const isReticular = variant === 'reticular';
  const isVano = section === 'vano';
  const tipologia = state.tipologia as ForjadosTipologia;
  const geomLocked = isReticular && tipologia !== 'custom';

  const handleTipologia = (key: string) => {
    setField('tipologia', key);
    if (key !== 'custom') {
      const t = getTipologia(key as ForjadosTipologia);
      if (t) {
        setField('h', t.h);
        setField('hFlange', t.hFlange);
        setField('bWeb', t.bWeb);
        setField('intereje', t.intereje);
      }
    }
  };

  return (
    <div className="flex flex-col min-w-0" aria-label="Datos de entrada — Forjados">

      {/* VARIANT TOGGLE */}
      <div
        role="radiogroup"
        aria-label="Tipo de forjado"
        className="flex rounded border border-border-main mb-3 shrink-0 overflow-hidden"
      >
        {VARIANTS.map(({ value, label, Svg }) => {
          const active = variant === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onVariantSwitch(value)}
              onKeyDown={(e) => {
                const idx = VARIANTS.findIndex((v) => v.value === value);
                if (e.key === 'ArrowRight') onVariantSwitch(VARIANTS[(idx + 1) % VARIANTS.length].value);
                else if (e.key === 'ArrowLeft') onVariantSwitch(VARIANTS[(idx - 1 + VARIANTS.length) % VARIANTS.length].value);
              }}
              className={[
                'flex-1 flex flex-col items-center gap-1 py-1.5 px-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]',
                active ? 'bg-accent/10 text-accent' : 'text-text-disabled hover:text-text-secondary',
              ].join(' ')}
            >
              <Svg />
              <span className="text-[10px] font-mono">{label}</span>
            </button>
          );
        })}
      </div>

      {isReticular && (
        <p className="text-[10px] text-text-disabled -mt-2 mb-2 leading-tight">
          Verifica una dirección. Bidireccional → dos ejecuciones.
        </p>
      )}

      {/* SECCIÓN */}
      <CollapsibleSection label="Sección">
        {isReticular && (
          <>
            <SelectField
              label="Tipología"
              field="tipologia"
              value={tipologia}
              options={TIPOLOGIA_OPTIONS}
              setField={(_, v) => handleTipologia(String(v))}
            />
            <NumField label="h"   sub="canto"       field="h"        value={state.h as number}        readOnly={geomLocked} setField={setField} />
            <NumField label="h_f" sub="capa compr." field="hFlange"  value={state.hFlange as number}  readOnly={geomLocked} setField={setField} />
            <NumField label="b_w" sub="nervio"      field="bWeb"     value={state.bWeb as number}     readOnly={geomLocked} setField={setField} />
            <NumField label="Intereje"              field="intereje" value={state.intereje as number} readOnly={geomLocked} setField={setField} />
            <NumField label="L"   sub="luz"         field="spanLength" value={state.spanLength as number} setField={setField} />
            <SelectField label="Tipo vano" field="tipoVano" value={state.tipoVano as string} options={TIPO_VANO_OPTIONS} setField={setField} />
          </>
        )}
        {!isReticular && (
          <>
            <NumField label="h"           field="h"     value={state.h as number}     setField={setField} />
            <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">Franja b = 1000 mm (por metro)</p>
          </>
        )}
        <NumField label="Recubr." sub="mec." field="cover" value={state.cover as number} setField={setField} />
      </CollapsibleSection>

      {/* MATERIALES */}
      <CollapsibleSection label="Materiales">
        <SelectField label="fck"     field="fck"           value={state.fck as number}        options={FCK_OPTIONS} setField={setField} />
        <SelectField label="fyk"     field="fyk"           value={state.fyk as number}        options={FYK_OPTIONS} setField={setField} />
        <SelectField label="Exposición" field="exposureClass" value={state.exposureClass as string} options={EXP_OPTIONS} setField={setField} />
      </CollapsibleSection>

      {/* SECTION TAB SELECTOR */}
      <div
        className="flex mt-3 border-b border-border-main"
        role="tablist"
        aria-label="Sección activa"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            setSection(isVano ? 'apoyo' : 'vano');
          }
        }}
      >
        <button
          role="tab"
          aria-selected={isVano}
          tabIndex={isVano ? 0 : -1}
          onClick={() => setSection('vano')}
          className={[
            'flex-1 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]',
            isVano ? 'text-accent border-accent' : 'text-text-secondary border-transparent hover:text-text-primary',
          ].join(' ')}
        >
          Vano (M+)
        </button>
        <button
          role="tab"
          aria-selected={!isVano}
          tabIndex={!isVano ? 0 : -1}
          onClick={() => setSection('apoyo')}
          className={[
            'flex-1 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]',
            !isVano ? 'text-accent border-accent' : 'text-text-secondary border-transparent hover:text-text-primary',
          ].join(' ')}
        >
          Apoyo (M−)
        </button>
      </div>

      {/* ARMADO BASE — compartido entre vano y apoyo (siempre visible) */}
      <CollapsibleSection
        label={isReticular ? 'Armado base (montaje continuo)' : 'Parrilla base (sup + inf)'}
      >
        <p className="text-[10px] text-text-disabled mb-1 leading-tight">
          {isReticular
            ? 'Montaje continuo del nervio. Se suma al refuerzo zonal en la cara de tracción.'
            : 'Parrilla uniforme. Los refuerzos zonales se superponen a la base.'}
        </p>
        {isReticular ? (
          <>
            <p className="text-[10px] text-text-disabled mt-1 mb-0.5">Cara superior</p>
            <NumField
              label="Nº barras" field="base_sup_nBars"
              value={state.base_sup_nBars as number}
              unit="ud" integer setField={setField}
            />
            <SelectField
              label="Diámetro" field="base_sup_barDiam"
              value={state.base_sup_barDiam as number}
              options={BAR_OPTIONS} setField={setField}
            />
            <p className="text-[10px] text-text-disabled mt-2 mb-0.5">Cara inferior</p>
            <NumField
              label="Nº barras" field="base_inf_nBars"
              value={state.base_inf_nBars as number}
              unit="ud" integer setField={setField}
            />
            <SelectField
              label="Diámetro" field="base_inf_barDiam"
              value={state.base_inf_barDiam as number}
              options={BAR_OPTIONS} setField={setField}
            />
          </>
        ) : (
          <>
            <p className="text-[10px] text-text-disabled mt-1 mb-0.5">Cara superior</p>
            <SelectField
              label="Ø" field="base_sup_phi_mac"
              value={state.base_sup_phi_mac as number}
              options={MAC_PHI_OPTIONS} setField={setField}
            />
            <NumField
              label="Separ." sub="s" field="base_sup_s_mac"
              value={state.base_sup_s_mac as number}
              setField={setField}
            />
            <p className="text-[10px] text-text-disabled mt-2 mb-0.5">Cara inferior</p>
            <SelectField
              label="Ø" field="base_inf_phi_mac"
              value={state.base_inf_phi_mac as number}
              options={MAC_PHI_OPTIONS} setField={setField}
            />
            <NumField
              label="Separ." sub="s" field="base_inf_s_mac"
              value={state.base_inf_s_mac as number}
              setField={setField}
            />
          </>
        )}
      </CollapsibleSection>

      {/* REFUERZO ZONAL — visible según tab (vano ↔ inferior, apoyo ↔ superior) */}
      <CollapsibleSection
        label={isVano ? 'Refuerzo vano (inferior, M+)' : 'Refuerzo apoyo (superior, M−)'}
      >
        <p className="text-[10px] text-text-disabled mb-1 leading-tight">
          Adicional a la base. Dejar en 0 si no es necesario.
        </p>
        {isReticular ? (
          <>
            <NumField
              label="Nº barras"
              field={isVano ? 'refuerzo_vano_inf_nBars' : 'refuerzo_apoyo_sup_nBars'}
              value={state[isVano ? 'refuerzo_vano_inf_nBars' : 'refuerzo_apoyo_sup_nBars'] as number}
              unit="ud" integer setField={setField}
            />
            <SelectField
              label="Diámetro"
              field={isVano ? 'refuerzo_vano_inf_barDiam' : 'refuerzo_apoyo_sup_barDiam'}
              value={state[isVano ? 'refuerzo_vano_inf_barDiam' : 'refuerzo_apoyo_sup_barDiam'] as number}
              options={BAR_OPTIONS} setField={setField}
            />
          </>
        ) : (
          <>
            <SelectField
              label="Ø"
              field={isVano ? 'refuerzo_vano_inf_phi_mac' : 'refuerzo_apoyo_sup_phi_mac'}
              value={state[isVano ? 'refuerzo_vano_inf_phi_mac' : 'refuerzo_apoyo_sup_phi_mac'] as number}
              options={[{ value: 0, label: '—' }, ...MAC_PHI_OPTIONS]} setField={setField}
            />
            <NumField
              label="Separ." sub="s"
              field={isVano ? 'refuerzo_vano_inf_s_mac' : 'refuerzo_apoyo_sup_s_mac'}
              value={state[isVano ? 'refuerzo_vano_inf_s_mac' : 'refuerzo_apoyo_sup_s_mac'] as number}
              setField={setField}
            />
          </>
        )}
      </CollapsibleSection>

      {/* CORTANTE (toggle + stirrup fields) */}
      <CollapsibleSection label="Cortante (cercos)">
        <ToggleButton
          label="Añadir armadura de cortante"
          active={state.stirrupsEnabled as boolean}
          onClick={() => setField('stirrupsEnabled', !(state.stirrupsEnabled as boolean))}
        />
        <div
          className="overflow-hidden transition-all duration-150"
          style={{
            maxHeight: state.stirrupsEnabled ? '300px' : '0px',
            opacity: state.stirrupsEnabled ? 1 : 0,
          }}
        >
          <p className="text-[10px] text-text-disabled mt-1 mb-0.5">
            {isVano ? 'Vano' : 'Apoyo'}
          </p>
          <SelectField
            label="Ø cerco" field={`${section}_stirrupDiam`}
            value={state[`${section}_stirrupDiam`] as number}
            options={SW_DIAM_OPTIONS} setField={setField}
          />
          <NumField
            label="Separ." sub="s" field={`${section}_stirrupSpacing`}
            value={state[`${section}_stirrupSpacing`] as number} setField={setField}
          />
          <SelectField
            label="Ramas" field={`${section}_stirrupLegs`}
            value={state[`${section}_stirrupLegs`] as number}
            options={SW_LEGS_OPTIONS} setField={setField}
          />
        </div>
      </CollapsibleSection>

      {/* ESFUERZOS */}
      <CollapsibleSection label="Esfuerzos de cálculo">
        <UnitNumberInput
          label="Md+" sub="vano (ELU)" field="vano_Md"
          value={state.vano_Md as number} quantity="moment"
          onChange={(v) => setField('vano_Md', v)}
        />
        <UnitNumberInput
          label="|M−|" sub="apoyo" field="apoyo_Md"
          value={state.apoyo_Md as number} quantity="moment"
          onChange={(v) => setField('apoyo_Md', v)}
        />
        <UnitNumberInput
          labelKey="VEd" field="VEd"
          value={state.VEd as number} quantity="force"
          onChange={(v) => setField('VEd', v)}
        />
        <p className="text-[10px] text-text-disabled mt-2 mb-0.5">Fisuración (ELS — solo XC2+)</p>
        <UnitNumberInput
          label={isVano ? 'M_G vano' : 'M_G apoyo'} sub="perm."
          field={`${section}_M_G`}
          value={state[`${section}_M_G`] as number} quantity="moment"
          onChange={(v) => setField(`${section}_M_G`, v)}
        />
        <UnitNumberInput
          label={isVano ? 'M_Q vano' : 'M_Q apoyo'} sub="var."
          field={`${section}_M_Q`}
          value={state[`${section}_M_Q`] as number} quantity="moment"
          onChange={(v) => setField(`${section}_M_Q`, v)}
        />
      </CollapsibleSection>

    </div>
  );
}
