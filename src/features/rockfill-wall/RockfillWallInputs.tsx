import { useState, useEffect } from 'react';
import {
  type RockfillWallInputs,
  type RockfillLitologia,
} from '../../data/defaults';
import { PHI_B_LITOLOGIA } from '../../lib/calculations/rockfillWall';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface RockfillWallInputsProps {
  state: RockfillWallInputs;
  setField: <K extends keyof RockfillWallInputs>(field: K, value: RockfillWallInputs[K]) => void;
}

const LITOLOGIA_LABELS: Record<RockfillLitologia, string> = {
  granito: 'Granito sano',
  gneis: 'Gneis',
  cuarcita: 'Cuarcita sana',
  basalto: 'Basalto',
  riolita: 'Riolita / andesita',
  granodiorita: 'Sienita / granodiorita',
  caliza: 'Caliza / dolomía sana',
  conglomerado: 'Conglomerado cementado',
  arenisca: 'Arenisca cementada',
};

function NumField({
  labelKey, label, sub, help, field, value, unit, integer = false, setField,
}: {
  labelKey?: LabelKey;
  label?: string;
  sub?: string;
  help?: string;
  field: keyof RockfillWallInputs;
  value: number;
  unit?: string;
  integer?: boolean;
  setField: RockfillWallInputsProps['setField'];
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: unit ?? LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '—' ? '' : resolved.unit;
  const [localStr, setLocalStr] = useState(() => String(value));

  useEffect(() => {
    setLocalStr(String(value));
  }, [value]);

  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <InputLabel
        htmlFor={`input-${field}`}
        labelKey={labelKey}
        label={labelKey ? undefined : resolved.label}
        sub={labelKey ? undefined : resolved.sub}
        help={help}
      />
      <div className="flex shrink-0">
        <input
          id={`input-${field}`}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          value={localStr}
          onChange={(e) => {
            const raw = integer ? e.target.value.replace(/[^0-9-]/g, '') : e.target.value;
            setLocalStr(raw);
            const n = integer ? parseInt(raw, 10) : parseFloat(raw);
            if (!isNaN(n)) setField(field, n as RockfillWallInputs[typeof field]);
          }}
          onBlur={() => {
            const n = integer ? parseInt(localStr, 10) : parseFloat(localStr);
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

function SelectField({
  label, sub, help, field, value, options, setField,
}: {
  label: string;
  sub?: string;
  help?: string;
  field: keyof RockfillWallInputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: RockfillWallInputsProps['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <InputLabel htmlFor={`select-${field}`} label={label} sub={sub} help={help} />
      <select
        id={`select-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          // Cast: los values de las options los controla el call-site y casan con la unión del campo.
          setField(field, (raw !== '' && !isNaN(asNum) && String(asNum) === raw ? asNum : raw) as RockfillWallInputs[typeof field]);
        }}
        className="min-w-0 max-w-44 truncate bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] text-text-primary font-mono outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({
  label, help, active, activeLabel, inactiveLabel, onToggle,
}: {
  label: string;
  help?: string;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onToggle: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
        <span className="text-[13px] text-text-secondary">{label}</span>
        <button
          type="button"
          onClick={onToggle}
          className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-colors ${
            active
              ? 'bg-accent/15 text-accent border border-accent/40'
              : 'bg-bg-elevated text-text-disabled border border-border-main'
          }`}
          aria-pressed={active}
        >
          {active ? activeLabel : inactiveLabel}
        </button>
      </div>
      {help && <p className="text-[11px] text-text-disabled mt-1">{help}</p>}
    </>
  );
}

export function RockfillWallInputsPanel({ state, setField }: RockfillWallInputsProps) {
  const isGavion = state.wallType === 'gaviones';
  const noSeismic = (state.Ab as number) === 0;
  const guia = state.phiMode === 'guia';

  return (
    <div className="flex flex-col" aria-label="Datos de entrada">

      {/* Tipología */}
      <div className="flex rounded border border-border-main overflow-hidden mb-3 mt-1">
        {(['escollera', 'gaviones'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setField('wallType', t)}
            className={`flex-1 py-1.5 text-[11.5px] font-semibold font-mono uppercase tracking-wide transition-colors ${
              state.wallType === t
                ? 'bg-accent/15 text-accent'
                : 'bg-bg-surface text-text-disabled hover:text-text-secondary'
            }`}
            aria-pressed={state.wallType === t}
          >
            {t === 'escollera' ? 'Escollera' : 'Gaviones'}
          </button>
        ))}
      </div>

      <CollapsibleSection label="Geometría del cuerpo">
        <NumField label="H" sub="Altura del cuerpo" field="H" value={state.H as number} unit="m" setField={setField}
          help="Altura del cuerpo del muro sobre la cara superior del cimiento. En gaviones se ajusta a un número entero de filas." />
        <NumField label="a" sub="Ancho coronación" field="a" value={state.a as number} unit="m" setField={setField}
          help="Ancho en coronación. La Guía exige ≥ 2 m (1.5 m si H < 5 m) en escollera colocada." />
        {!isGavion && (
          <>
            <NumField label="mI" sub="Talud intradós (xH:1V)" field="mIntra" value={state.mIntra as number} unit="H:1V" setField={setField}
              help="Avance horizontal del paramento visto por metro de altura. No más vertical que 1H:3V (0.33)." />
            <NumField label="mT" sub="Talud trasdós (xH:1V)" field="mTras" value={state.mTras as number} unit="H:1V" setField={setField}
              help="Batter del trasdós hacia el relleno (0 = vertical). El empuje se evalúa en el plano virtual vertical por el punto más retrasado." />
            <NumField label="αh" sub="Contrainclinación hiladas" field="alphaHiladas" value={state.alphaHiladas as number} unit="°" setField={setField}
              help="Inclinación de las hiladas hacia el trasdós. La Guía prescribe ≈ 3H:1V (18.4°); gobierna el deslizamiento piedra sobre piedra." />
          </>
        )}
        {isGavion && (
          <>
            <SelectField
              label="hc" sub="Altura de caja"
              field="hCaja"
              value={state.hCaja as number}
              options={[0.5, 1.0].map((v) => ({ value: v, label: `${v.toFixed(1)} m` }))}
              setField={setField}
              help="Altura estándar de las cajas de gavión."
            />
            <NumField label="Δb" sub="Escalón por fila" field="stepCaja" value={state.stepCaja as number} unit="m" setField={setField}
              help="Incremento de ancho de cada fila hacia abajo." />
            <SelectField
              label="Alineación" sub="Cara plana"
              field="stepAlign"
              value={state.stepAlign}
              options={[
                { value: 'back', label: 'Trasdós plano' },
                { value: 'front', label: 'Frente plano' },
              ]}
              setField={setField}
              help="Trasdós plano = escalones en el paramento visto (lo habitual en contención)."
            />
            <NumField label="αb" sub="Contrainclinación pila" field="alphaBatter" value={state.alphaBatter as number} unit="°" setField={setField}
              help="Inclinación global de la pila de cajas hacia el relleno (típ. 6–10°); gobierna el deslizamiento entre filas." />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection label="Cimiento (escollera hormigonada)">
        <NumField label="hz" sub="Canto del cimiento" field="hz" value={state.hz as number} unit="m" setField={setField}
          help="Canto del cimiento de escollera hormigonada. La Guía recomienda ≥ 1 m." />
        <NumField label="x0" sub="Vuelo de puntera" field="x0" value={state.x0 as number} unit="m" setField={setField} />
        <NumField label="xT" sub="Vuelo de talón" field="xT" value={state.xT as number} unit="m" setField={setField} />
        <NumField label="αz" sub="Contraincl. plano apoyo" field="alphaBase" value={state.alphaBase as number} unit="°" setField={setField}
          help="Contrainclinación del plano de apoyo hacia el trasdós (Guía: ≈ 3H:1V). Mejora la seguridad al deslizamiento." />
        <NumField label="df" sub="Empotramiento frontal" field="df" value={state.df as number} unit="m" setField={setField}
          help="Terreno frontal sobre la cara superior del cimiento. Habilita el empuje pasivo si se activa." />
      </CollapsibleSection>

      <CollapsibleSection label={isGavion ? 'Material (gavión)' : 'Material (escollera)'}>
        <UnitNumberInput
          label="γap"
          sub="Peso específico aparente"
          help={isGavion
            ? 'Peso de caja rellena por volumen: γ piedra · (1 − n), con porosidad n ≈ 0.3 → 15–18 kN/m³.'
            : 'γap = γd · (1 − n). Guía 2006: porosidad n entre 0.25 y 0.35 → γap ≈ 17–19 kN/m³.'}
          field="gammaAp"
          value={state.gammaAp as number}
          quantity="weightDensity"
          onChange={(v) => setField('gammaAp', v)}
        />
        <SelectField
          label="φ" sub="Definición del rozamiento"
          field="phiMode"
          value={state.phiMode}
          options={[
            { value: 'directo', label: 'Directo' },
            { value: 'guia', label: 'Guía 2006 (φb+Δφe−Δφn)' },
          ]}
          setField={setField}
        />
        {!guia && (
          <NumField label="φ" sub="Rozamiento interno" field="phi" value={state.phi as number} unit="°" setField={setField}
            help="Ángulo de rozamiento interno del material del muro (escollera colocada: 38–42°)." />
        )}
        {guia && (
          <>
            <SelectField
              label="Litología" sub="Tabla 4.2"
              field="litologia"
              value={state.litologia}
              options={(Object.keys(PHI_B_LITOLOGIA) as RockfillLitologia[]).map((k) => ({
                value: k,
                label: `${LITOLOGIA_LABELS[k]} (φb=${PHI_B_LITOLOGIA[k].toFixed(1)}°)`,
              }))}
              setField={setField}
            />
            <NumField label="Δφe" sub="Mejora por colocación" field="dPhiE" value={state.dPhiE as number} unit="°" setField={setField}
              help="Incremento por colocación cuidada (1–3° según tabla 4.2). Exige cumplir las prescripciones de ejecución del cap. 5." />
          </>
        )}
        <ToggleField
          label="Contacto mejorado"
          active={state.contactoMejorado as boolean}
          activeLabel="tan φ"
          inactiveLabel="tan ⅔φ"
          onToggle={() => setField('contactoMejorado', !(state.contactoMejorado as boolean))}
          help={state.contactoMejorado
            ? 'Hiladas trabadas/recebadas con hormigón: rozamiento entre hiladas con φ completo.'
            : 'Práctica conservadora: rozamiento entre hiladas tan(⅔·φ).'}
        />
      </CollapsibleSection>

      <CollapsibleSection label="Relleno del trasdós / terreno">
        <UnitNumberInput
          labelKey="gamma_soil"
          help="Peso específico del relleno del trasdós."
          field="gammaSuelo"
          value={state.gammaSuelo as number}
          quantity="weightDensity"
          onChange={(v) => setField('gammaSuelo', v)}
        />
        <UnitNumberInput
          label="γsat"
          sub="Suelo saturado"
          help="Peso específico saturado, usado bajo el nivel freático."
          field="gammaSat"
          value={state.gammaSat as number}
          quantity="weightDensity"
          onChange={(v) => setField('gammaSat', v)}
        />
        <NumField label="φt" sub="Rozamiento relleno" field="phiRelleno" value={state.phiRelleno as number} unit="°" setField={setField}
          help="Ángulo de rozamiento interno del relleno del trasdós (empuje activo)." />
        <NumField labelKey="delta_wall" field="delta" value={state.delta as number} setField={setField} />
        <NumField label="β" sub="Talud del terreno" field="beta" value={state.beta as number} unit="°" setField={setField}
          help="Inclinación de la superficie del terreno sobre la coronación (β < φ del relleno)." />
        <UnitNumberInput
          label="q"
          sub="Sobrecarga trasdós"
          help="Sobrecarga uniforme sobre el terreno del trasdós."
          field="q"
          value={state.q as number}
          quantity="areaLoad"
          onChange={(v) => setField('q', v)}
        />
        <UnitNumberInput
          labelKey="sigma_adm"
          help="Tensión admisible del terreno de cimentación. Se compara con la tensión de referencia de Meyerhof."
          field="sigmaAdm"
          value={state.sigmaAdm as number}
          quantity="soilPressure"
          onChange={(v) => setField('sigmaAdm', v)}
        />
        <NumField labelKey="mu_base" field="muBase" value={state.muBase as number} setField={setField}
          help="Coeficiente de rozamiento cimiento-terreno (≈ tan ⅔·φ del terreno de apoyo; tan φ si el contacto es hormigonado contra roca sana)." />
      </CollapsibleSection>

      <CollapsibleSection label="Nivel freático">
        <ToggleField
          label="Nivel freático"
          active={state.hasWater as boolean}
          activeLabel="Activo"
          inactiveLabel="Sin NF"
          onToggle={() => setField('hasWater', !(state.hasWater as boolean))}
        />
        {state.hasWater && (
          <NumField
            label="hw" sub="Prof. NF (desde coronación)"
            help="Profundidad del nivel freático desde la coronación. Recuerda que la Guía exige garantizar el drenaje del trasdós."
            field="hw"
            value={state.hw as number}
            unit="m"
            setField={setField}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection label="Empuje pasivo (CTE DB-SE-C §9.3.3)">
        <ToggleField
          label="Considerar Ep"
          active={state.usePassive as boolean}
          activeLabel="Activo"
          inactiveLabel="Ignorado"
          onToggle={() => setField('usePassive', !(state.usePassive as boolean))}
          help={state.usePassive
            ? 'Ep = ½·Kp·γ·(df+hz)² × 0.5 de movilización, aplicado en deslizamiento y vuelco.'
            : 'Lado conservador: la resistencia pasiva frontal no se considera.'}
        />
      </CollapsibleSection>

      <CollapsibleSection label="Sismo (NCSE-02 / Mononobe-Okabe)">
        <NumField labelKey="Ab_accel" field="Ab" value={state.Ab as number} setField={setField} />
        <NumField labelKey="S_site" field="S" value={state.S as number} setField={setField} />
        {noSeismic ? (
          <p className="text-[11px] text-text-disabled mt-1">Sin sismo (Ab = 0)</p>
        ) : (
          <p className="text-[11px] text-text-disabled mt-1">
            kh = {((state.S as number) * (state.Ab as number)).toFixed(3)}&nbsp;&nbsp;
            kv = {((state.S as number) * (state.Ab as number) / 2).toFixed(3)}
          </p>
        )}
      </CollapsibleSection>

    </div>
  );
}
