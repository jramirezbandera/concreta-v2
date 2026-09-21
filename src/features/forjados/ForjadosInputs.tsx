import React, { useState, useEffect } from 'react';
import {
  type ForjadosInputs,
  type ForjadosVariant,
  type ForjadosTipologia,
  type ForjadosTipoVano,
} from '../../data/defaults';
import { TIPOLOGIAS, TIPOS_VANO, tipologiaPatch } from '../../data/forjadoTipologias';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';
import { conComaDecimal } from '../../lib/units/format';

interface Props {
  state: ForjadosInputs;
  /**
   * Campo que invalida el cálculo, si lo hay. El mensaje de error vive en el
   * panel de resultados, a 700 px en escritorio; sin esto el campo culpable
   * se quedaba con su borde normal y sin `aria-invalid`.
   */
  errorField?: keyof ForjadosInputs;
  section: 'vano' | 'apoyo';
  setSection: (s: 'vano' | 'apoyo') => void;
  setField: <K extends keyof ForjadosInputs>(field: K, value: ForjadosInputs[K]) => void;
  onVariantSwitch: (next: ForjadosVariant) => void;
}

function NumField({
  labelKey, label, sub, help, field, value, unit = 'mm', readOnly = false, integer = false, errorField, setField,
}: {
  /** Resuelve símbolo, descripción y REFERENCIA NORMATIVA desde el catálogo. */
  labelKey?: LabelKey;
  label?: string;
  sub?: string;
  help?: string;
  field: keyof ForjadosInputs;
  value: number;
  unit?: string;
  readOnly?: boolean;
  integer?: boolean;
  errorField?: keyof ForjadosInputs;
  setField: Props['setField'];
}) {
  const invalido = errorField === field;
  const [localStr, setLocalStr] = useState(() => conComaDecimal(String(value)));
  useEffect(() => { setLocalStr(conComaDecimal(String(value))); }, [value]);
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <InputLabel htmlFor={`input-${field}`} labelKey={labelKey} label={labelKey ? undefined : label} sub={labelKey ? undefined : sub} help={help} />
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
            const n = integer ? parseInt(raw, 10) : parseFloat(raw.replace(',', '.'));
            if (!isNaN(n)) setField(field, n);
          }}
          onBlur={() => {
            const n = integer ? parseInt(localStr, 10) : parseFloat(localStr.replace(',', '.'));
            if (isNaN(n)) setLocalStr(conComaDecimal(String(value)));
          }}
          className={[
            'w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none transition-colors',
            readOnly
              ? 'opacity-60 cursor-not-allowed'
              : 'hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated',
            invalido ? 'border-state-fail bg-state-fail/5' : '',
          ].join(' ')}
          aria-invalid={invalido || undefined}
          aria-label={`${label ?? (labelKey ? LABELS[labelKey].sym : field)} (${unit})`}
        />
        <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
          {unit}
        </span>
      </div>
    </div>
  );
}

function SelectField({
  labelKey, label, help, field, value, options, errorField, setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  help?: string;
  field: keyof ForjadosInputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  errorField?: keyof ForjadosInputs;
  setField: Props['setField'];
}) {
  const invalido = errorField === field;
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <InputLabel htmlFor={`select-${field}`} labelKey={labelKey} label={labelKey ? undefined : label} help={help} className="shrink-0" />
      <select
        id={`select-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          // Cast: option values are controlled by the caller and match Inputs[field]'s union.
          setField(field, (isNaN(asNum) || raw === '' ? raw : asNum) as ForjadosInputs[typeof field]);
        }}
        aria-invalid={invalido || undefined}
        className={`min-w-0 max-w-44 truncate bg-bg-primary border rounded pl-2 pr-6 py-1 text-[12px] text-text-primary font-mono outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors ${invalido ? 'border-state-fail bg-state-fail/5' : 'border-border-main'}`}
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
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={label}
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
/* El paréntesis sobraba y costaba caro: «Cont. interior (0,70)» no cabía en el
   desplegable de la columna y se recortaba a «Cont. inter…», escondiendo el
   coeficiente, que es precisamente lo que cambia L0 y la esbeltez. La columna
   no da para «Cont. interior (0,70)» más su etiqueta en la misma línea, así
   que se queda el nombre corto con el que se habla en obra —vano biapoyado,
   extremo, interior o voladizo— y el coeficiente, que es el dato. */
const TIPO_VANO_SHORT: Record<string, string> = {
  'biapoyado':         'Biapoyado 1,00',
  'continuo-extremo':  'Extremo 0,85',
  'continuo-interior': 'Interior 0,70',
  'voladizo':          'Voladizo 2,00',
};
const TIPOLOGIA_OPTIONS: Array<{ value: ForjadosTipologia; label: string }> = [
  ...TIPOLOGIAS.map((t) => ({ value: t.key, label: TIPOLOGIA_SHORT[t.key] ?? t.label })),
  { value: 'custom' as ForjadosTipologia, label: 'Personalizada' },
];
const TIPO_VANO_OPTIONS: Array<{ value: ForjadosTipoVano; label: string }> = TIPOS_VANO.map((t) => ({
  value: t.key, label: TIPO_VANO_SHORT[t.key] ?? t.label,
}));

// Textos de ayuda (tooltips ⓘ). Los campos propios del forjado (h_f, b_w,
// intereje, nº de barras, separación) no están en el catálogo y viven aquí.
// Los cinco que SÍ comparte con los demás módulos de hormigón —canto,
// recubrimiento, fck, fyk y clase de exposición— van por `labelKey`: sin él,
// `InputLabel` deja `resolvedRef` en undefined y el tooltip se queda SIN la
// referencia al Código, que es justo lo que este módulo no enseñaba. La ayuda
// sigue saliendo de aquí: el catálogo es el default y el call site la verdad.
const HELP = {
  tipologia: 'Tipología del forjado reticular. Al elegir una, se autocompletan h, h_f, b_w e intereje.',
  hRet: 'Canto total del forjado, incluida la capa de compresión.',
  hf: 'Espesor de la capa de compresión superior.',
  bw: 'Ancho del nervio (alma) entre casetones.',
  intereje: 'Distancia entre ejes de nervios.',
  L: 'Luz de cálculo del vano en la dirección analizada.',
  tipoVano: 'Condición de continuidad del vano. Fija el coeficiente de luz para la flecha y el reparto de momentos.',
  hMac: 'Canto total de la losa maciza.',
  cover: 'Recubrimiento de la armadura; con el canto define el canto útil d.',
  fck: 'Resistencia característica del hormigón (HA-25 → 25 N/mm²).',
  fyk: 'Límite elástico del acero de armar (B500S → 500 N/mm²).',
  exp: 'Clase de exposición ambiental: fija el recubrimiento mínimo y el control de fisuración.',
  nbarsBase: 'Número de barras del montaje base por nervio.',
  diamBase: 'Diámetro de las barras del montaje base.',
  phiMacBase: 'Diámetro de las barras de la parrilla base.',
  sMacBase: 'Separación entre barras de la parrilla base.',
  nbarsRef: 'Número de barras de refuerzo, adicional a la base.',
  diamRef: 'Diámetro de las barras de refuerzo.',
  phiMacRef: 'Diámetro del refuerzo adicional (— si no hace falta).',
  sMacRef: 'Separación del refuerzo adicional.',
  swDiam: 'Diámetro de la barra del cerco.',
  swS: 'Separación longitudinal entre cercos.',
  swLegs: 'Número de ramas del cerco cortadas por el plano de cortante.',
  mdVano: 'Momento flector positivo de cálculo (ELU) en el vano.',
  mdApoyo: 'Momento flector negativo de cálculo (ELU) en el apoyo.',
  mg: 'Momento de servicio (ELS) por cargas permanentes, para la fisuración.',
  mq: 'Momento de servicio (ELS) por la sobrecarga, para la fisuración.',
} as const;

export function ForjadosInputsPanel({ state, section, setSection, setField, onVariantSwitch, errorField }: Props) {
  const variant = state.variant as ForjadosVariant;
  const isReticular = variant === 'reticular';
  const isVano = section === 'vano';
  const esXC1 = state.exposureClass === 'XC1';
  const tipologia = state.tipologia as ForjadosTipologia;
  const geomLocked = isReticular && tipologia !== 'custom';

  // El patch (clave + geometría del preset) vive en tipologiaPatch — única
  // fuente de verdad, compartida con el apply del asistente IA.
  const handleTipologia = (key: string) => {
    const patch = tipologiaPatch(key as ForjadosTipologia);
    for (const [f, v] of Object.entries(patch) as [keyof ForjadosInputs, ForjadosInputs[keyof ForjadosInputs]][]) {
      setField(f, v);
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
            <SelectField errorField={errorField}
              label="Tipología"
              help={HELP.tipologia}
              field="tipologia"
              value={tipologia}
              options={TIPOLOGIA_OPTIONS}
              setField={(_, v) => handleTipologia(String(v))}
            />
            <NumField errorField={errorField} labelKey="h_section" help={HELP.hRet}     field="h"        value={state.h as number}        readOnly={geomLocked} setField={setField} />
            <NumField errorField={errorField} label="h_f" sub="capa compr." help={HELP.hf}       field="hFlange"  value={state.hFlange as number}  readOnly={geomLocked} setField={setField} />
            <NumField errorField={errorField} label="b_w" sub="nervio"      help={HELP.bw}       field="bWeb"     value={state.bWeb as number}     readOnly={geomLocked} setField={setField} />
            <NumField errorField={errorField} label="Intereje"              help={HELP.intereje} field="intereje" value={state.intereje as number} readOnly={geomLocked} setField={setField} />
          </>
        )}
        {!isReticular && (
          <>
            <NumField errorField={errorField} labelKey="h_section" help={HELP.hMac} field="h"     value={state.h as number}     setField={setField} />
            <p className="text-[10px] text-text-disabled -mt-0.5 mb-1">Franja b = 1000 mm (por metro)</p>
          </>
        )}
        {/* Luz y tipo de vano: los usa la esbeltez L/d en AMBAS variantes
         *  (rcSlabs, K_LD + span_ld), así que se editan siempre. En reticular
         *  además fijan L0 y el ancho eficaz. */}
        <NumField errorField={errorField} label="L"   sub="luz"   help={HELP.L}        field="spanLength" value={state.spanLength as number} setField={setField} />
        <SelectField errorField={errorField} label="Tipo vano" help={HELP.tipoVano} field="tipoVano" value={state.tipoVano as string} options={TIPO_VANO_OPTIONS} setField={setField} />
        <NumField errorField={errorField} labelKey="cover_mechanical" help={HELP.cover} field="cover" value={state.cover as number} setField={setField} />
      </CollapsibleSection>

      {/* MATERIALES */}
      <CollapsibleSection label="Materiales">
        <SelectField errorField={errorField} labelKey="fck"  help={HELP.fck} field="fck"           value={state.fck as number}        options={FCK_OPTIONS} setField={setField} />
        <SelectField errorField={errorField} labelKey="fyk"  help={HELP.fyk} field="fyk"           value={state.fyk as number}        options={FYK_OPTIONS} setField={setField} />
        <SelectField errorField={errorField} labelKey="exposureClass" help={HELP.exp} field="exposureClass" value={state.exposureClass as string} options={EXP_OPTIONS} setField={setField} />
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
            <NumField errorField={errorField}
              label="Nº barras" help={HELP.nbarsBase} field="base_sup_nBars"
              value={state.base_sup_nBars as number}
              unit="ud" integer setField={setField}
            />
            <SelectField errorField={errorField}
              label="Diámetro" help={HELP.diamBase} field="base_sup_barDiam"
              value={state.base_sup_barDiam as number}
              options={BAR_OPTIONS} setField={setField}
            />
            <p className="text-[10px] text-text-disabled mt-2 mb-0.5">Cara inferior</p>
            <NumField errorField={errorField}
              label="Nº barras" help={HELP.nbarsBase} field="base_inf_nBars"
              value={state.base_inf_nBars as number}
              unit="ud" integer setField={setField}
            />
            <SelectField errorField={errorField}
              label="Diámetro" help={HELP.diamBase} field="base_inf_barDiam"
              value={state.base_inf_barDiam as number}
              options={BAR_OPTIONS} setField={setField}
            />
          </>
        ) : (
          <>
            <p className="text-[10px] text-text-disabled mt-1 mb-0.5">Cara superior</p>
            <SelectField errorField={errorField}
              label="Ø" help={HELP.phiMacBase} field="base_sup_phi_mac"
              value={state.base_sup_phi_mac as number}
              options={MAC_PHI_OPTIONS} setField={setField}
            />
            <NumField errorField={errorField}
              label="Separ." sub="s" help={HELP.sMacBase} field="base_sup_s_mac"
              value={state.base_sup_s_mac as number}
              setField={setField}
            />
            <p className="text-[10px] text-text-disabled mt-2 mb-0.5">Cara inferior</p>
            <SelectField errorField={errorField}
              label="Ø" help={HELP.phiMacBase} field="base_inf_phi_mac"
              value={state.base_inf_phi_mac as number}
              options={MAC_PHI_OPTIONS} setField={setField}
            />
            <NumField errorField={errorField}
              label="Separ." sub="s" help={HELP.sMacBase} field="base_inf_s_mac"
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
        {/* En reticular el «ninguno» es Nº barras = 0; en maciza el control es
            un desplegable de Ø cuyo vacío es «—», así que ahí «dejar en 0» no
            señalaba ningún campo que admitiese un 0. */}
        <p className="text-[10px] text-text-disabled mb-1 leading-tight">
          {isReticular
            ? 'Adicional a la base. Deja Nº barras en 0 si no es necesario.'
            : 'Adicional a la base. Deja el diámetro en «—» si no es necesario.'}
        </p>
        {isReticular ? (
          <>
            <NumField errorField={errorField}
              label="Nº barras" help={HELP.nbarsRef}
              field={isVano ? 'refuerzo_vano_inf_nBars' : 'refuerzo_apoyo_sup_nBars'}
              value={state[isVano ? 'refuerzo_vano_inf_nBars' : 'refuerzo_apoyo_sup_nBars'] as number}
              unit="ud" integer setField={setField}
            />
            <SelectField errorField={errorField}
              label="Diámetro" help={HELP.diamRef}
              field={isVano ? 'refuerzo_vano_inf_barDiam' : 'refuerzo_apoyo_sup_barDiam'}
              value={state[isVano ? 'refuerzo_vano_inf_barDiam' : 'refuerzo_apoyo_sup_barDiam'] as number}
              options={BAR_OPTIONS} setField={setField}
            />
          </>
        ) : (
          <>
            <SelectField errorField={errorField}
              label="Ø" help={HELP.phiMacRef}
              field={isVano ? 'refuerzo_vano_inf_phi_mac' : 'refuerzo_apoyo_sup_phi_mac'}
              value={state[isVano ? 'refuerzo_vano_inf_phi_mac' : 'refuerzo_apoyo_sup_phi_mac'] as number}
              options={[{ value: 0, label: '—' }, ...MAC_PHI_OPTIONS]} setField={setField}
            />
            <NumField errorField={errorField}
              label="Separ." sub="s" help={HELP.sMacRef}
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
          <SelectField errorField={errorField}
            label="Ø cerco" help={HELP.swDiam} field={`${section}_stirrupDiam`}
            value={state[`${section}_stirrupDiam`] as number}
            options={SW_DIAM_OPTIONS} setField={setField}
          />
          <NumField errorField={errorField}
            label="Separ." sub="s" help={HELP.swS} field={`${section}_stirrupSpacing`}
            value={state[`${section}_stirrupSpacing`] as number} setField={setField}
          />
          <SelectField errorField={errorField}
            label="Ramas" help={HELP.swLegs} field={`${section}_stirrupLegs`}
            value={state[`${section}_stirrupLegs`] as number}
            options={SW_LEGS_OPTIONS} setField={setField}
          />
        </div>
      </CollapsibleSection>

      {/* ESFUERZOS */}
      <CollapsibleSection label="Esfuerzos de cálculo">
        <UnitNumberInput
          label="Md+" sub="vano (ELU)" help={HELP.mdVano} field="vano_Md"
          value={state.vano_Md as number} quantity="moment"
          onChange={(v) => setField('vano_Md', v)}
        />
        <UnitNumberInput
          label="|M−|" sub="apoyo" help={HELP.mdApoyo} field="apoyo_Md"
          value={state.apoyo_Md as number} quantity="moment"
          onChange={(v) => setField('apoyo_Md', v)}
        />
        <UnitNumberInput
          labelKey="VEd" field="VEd"
          value={state.VEd as number} quantity="force"
          onChange={(v) => setField('VEd', v)}
        />
        <p className="text-[10px] text-text-disabled mt-2 mb-0.5">Fisuración (ELS — solo XC2+)</p>
        {/* Con XC1 el motor no entra en fisuración (rcSlabs.ts: `exposureClass
            !== 'XC1'`), así que estos dos momentos no intervienen en nada. Se
            enseñaban activos y a plena tinta: se podían teclear y no hacían
            nada. */}
        {esXC1 ? (
          <p className="text-[11px] text-text-disabled leading-snug py-1">
            Con XC1 no se comprueba fisuración. Cambia la clase de exposición a XC2 o superior para pedir los momentos de servicio.
          </p>
        ) : (
          <>
            <UnitNumberInput
              label={isVano ? 'M_G vano' : 'M_G apoyo'} sub="perm." help={HELP.mg}
              field={`${section}_M_G`}
              value={state[`${section}_M_G`] as number} quantity="moment"
              onChange={(v) => setField(`${section}_M_G`, v)}
            />
            <UnitNumberInput
              label={isVano ? 'M_Q vano' : 'M_Q apoyo'} sub="var." help={HELP.mq}
              field={`${section}_M_Q`}
              value={state[`${section}_M_Q`] as number} quantity="moment"
              onChange={(v) => setField(`${section}_M_Q`, v)}
            />
          </>
        )}
      </CollapsibleSection>

    </div>
  );
}
