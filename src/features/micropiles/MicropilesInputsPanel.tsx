import { useState, useEffect } from 'react';
import { type MicropilesInputs, type SoilLayer } from '../../data/defaults';
import {
  EXECUTION_OPTIONS, CORROSION_OPTIONS, DESIGN_LIFE_OPTIONS, GROUT_OPTIONS,
  getMinStructuralCover,
  type ExecutionType, type CorrosionEnv, type ApplicationType,
  type ConnectionType, type Duration, type EffortType, type SoilType,
  type DesignLifeYears, type GroutType,
} from '../../data/micropileLookups';
import { MICROPILE_TUBES, CUSTOM_TUBE_SENTINEL } from '../../data/micropileTubes';
import { availableFck } from '../../data/materials';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { SoilStrataEditor } from './SoilStrataEditor';

interface MicropilesInputsPanelProps {
  state: MicropilesInputs;
  setField: <K extends keyof MicropilesInputs>(field: K, value: MicropilesInputs[K]) => void;
  soil: SoilLayer[];
  addLayer: () => void;
  removeLayer: (id: number) => void;
  updateLayer: (id: number, field: keyof SoilLayer, value: number | SoilType) => void;
  /** CR de pandeo auto-calculado por el solver (para mostrarlo en modo auto). */
  autoCR?: number;
  /** Recubrimiento r auto-calculado (= (Dn−de)/2) para mostrarlo en modo auto. */
  autoCover?: number;
}

// ── Primitives reused locally (same pattern as RetainingWallInputs) ──────────

/**
 * Límites por campo. Antes la UI aceptaba φ=200, γ=−1, baseShear=−5, etc.
 * El motor solo validaba 3 cosas (γ>0, thickness>0, drillDiameter>0,
 * designLoad≥0) y dejaba pasar el resto. Aquí declaramos rangos físicamente
 * razonables — el blur fuerza al usuario al rango y mientras teclea fuera
 * de rango el campo se vuelve rojo y se muestra el límite violado.
 *
 * Md y Vd se introducen como magnitud (siempre ≥0); el motor los suma
 * directamente en MEd_raw, así que un valor negativo desbalancea el modelo.
 *
 * Hay campos sin clamp (cota cabeza/apoyo/NF): aceptan cualquier número
 * porque pueden ser negativos (bajo rasante) o positivos. La relación
 * topEl > toeEl la sigue validando el motor.
 */
const LIMITS = {
  drillDiameter:        { min: 50,   max: 600 },      // mm — perforación realista (v5)
  injectionPressure:    { min: 0,    max: 3000 },     // kPa
  designLoad:           { min: 0,    max: 100000 },   // kN
  steelGrade:           { min: 100,  max: 2000 },     // N/mm²
  CR:                   { min: 0.5,  max: 30 },       // factor pandeo
  structuralCover:      { min: 0,    max: 200 },      // mm
  baseMoment:           { min: 0,    max: 100000 },   // kNm — magnitud
  baseShear:            { min: 0,    max: 100000 },   // kN  — magnitud
  soilModulusTop:       { min: 0,    max: 1e8 },      // kN/m²
  soilModulusEmbed:     { min: 1,    max: 1e8 },      // kN/m² — denominador en Le
  // Tubo personalizado: rangos físicos. de cubre tubos comerciales habituales
  // de micropilotes (30-300 mm). e cubre Tabla A-5.1 garganta soldadura
  // (3-20 mm). El motor además exige 2·e < de.
  customTubeDe:         { min: 30,   max: 300 },      // mm
  customTubeE:          { min: 3,    max: 20 },       // mm
} as const;

export const MICROPILES_INPUT_LIMITS = LIMITS;

function NumField({
  label, sub, field, value, unit, integer = false, min, max, setField,
}: {
  label: string;
  sub?: string;
  field: keyof MicropilesInputs;
  value: number;
  unit?: string;
  integer?: boolean;
  min?: number;
  max?: number;
  setField: MicropilesInputsPanelProps['setField'];
}) {
  const [localStr, setLocalStr] = useState(() => String(value));
  useEffect(() => { setLocalStr(String(value)); }, [value]);
  const unitText = unit === '—' ? '' : unit ?? '';

  const parsed = integer ? parseInt(localStr, 10) : parseFloat(localStr);
  const isParsed = !isNaN(parsed);
  const belowMin = isParsed && min !== undefined && parsed < min;
  const aboveMax = isParsed && max !== undefined && parsed > max;
  const outOfRange = belowMin || aboveMax;
  const errMsg = belowMin ? `min: ${min}` : aboveMax ? `max: ${max}` : null;

  return (
    <div className="flex flex-col py-0.75">
      <div className="flex items-center justify-between max-lg:min-h-11 gap-2 min-w-0">
        <InputLabel htmlFor={`input-${String(field)}`} label={label} sub={sub} />
        <div className="flex shrink-0">
          <input
            id={`input-${String(field)}`}
            type="text"
            inputMode={integer ? 'numeric' : 'decimal'}
            value={localStr}
            aria-invalid={outOfRange || undefined}
            onChange={(e) => {
              const raw = integer ? e.target.value.replace(/[^0-9-]/g, '') : e.target.value;
              setLocalStr(raw);
              const n = integer ? parseInt(raw, 10) : parseFloat(raw);
              // Solo propaga si el valor parseado está EN rango — fuera de
              // rango se queda en el local, pinta error y espera al blur.
              if (!isNaN(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) {
                setField(field, n as MicropilesInputs[typeof field]);
              }
            }}
            onBlur={() => {
              let n = integer ? parseInt(localStr, 10) : parseFloat(localStr);
              if (isNaN(n)) { setLocalStr(String(value)); return; }
              if (min !== undefined && n < min) n = min;
              if (max !== undefined && n > max) n = max;
              if (integer) n = Math.round(n);
              setLocalStr(String(n));
              setField(field, n as MicropilesInputs[typeof field]);
            }}
            className={[
              'w-15 text-right rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none transition-colors',
              outOfRange
                ? 'bg-bg-primary border border-state-fail focus:bg-bg-elevated'
                : 'bg-bg-primary border border-border-main hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated',
            ].join(' ')}
            aria-label={`${label} (${unitText})`}
          />
          <span className={[
            // min-w-11 (44px) fija el ancho del chip aunque la unidad sea "°"
            // o esté vacía, para que el borde derecho de toda la columna de
            // inputs caiga en la misma vertical en TODAS las filas.
            'border border-l-0 rounded-r px-1.25 py-1 text-[10px] font-mono whitespace-nowrap inline-flex items-center justify-center min-w-11',
            outOfRange ? 'bg-bg-elevated border-state-fail text-state-fail' : 'bg-bg-elevated border-border-main text-text-disabled',
          ].join(' ')}>
            {unitText}
          </span>
        </div>
      </div>
      {errMsg && (
        <div className="text-[10px] font-mono text-state-fail text-right pr-1">{errMsg}</div>
      )}
    </div>
  );
}

function SelectField<V extends string | number>({
  label, sub, field, value, options, setField, stacked = false,
}: {
  label: string;
  sub?: string;
  field: keyof MicropilesInputs;
  value: V;
  options: Array<{ value: V; label: string }>;
  setField: MicropilesInputsPanelProps['setField'];
  /** Si true, label arriba y select a todo el ancho debajo. Usar cuando
   *  las opciones del select son demasiado largas para caber en la mitad
   *  derecha sin truncar la label izquierda (Ejecución, Corrosión, etc.). */
  stacked?: boolean;
}) {
  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const raw = e.target.value;
    const opt = options.find((o) => String(o.value) === raw);
    if (opt) setField(field, opt.value as MicropilesInputs[typeof field]);
  };
  const selectClassBase = 'bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors';

  if (stacked) {
    return (
      <div className="flex flex-col py-0.75 gap-1 min-w-0">
        <InputLabel htmlFor={`select-${String(field)}`} label={label} sub={sub} />
        <select
          id={`select-${String(field)}`}
          value={value}
          onChange={onChange}
          className={`${selectClassBase} w-full`}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
      <InputLabel htmlFor={`select-${String(field)}`} label={label} sub={sub} />
      <select
        id={`select-${String(field)}`}
        value={value}
        onChange={onChange}
        className={`${selectClassBase} shrink-0 max-w-45`}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Inputs panel ─────────────────────────────────────────────────────────────

export function MicropilesInputsPanel({
  state, setField, soil, addLayer, removeLayer, updateLayer, autoCR, autoCover,
}: MicropilesInputsPanelProps) {
  return (
    <div className="flex flex-col gap-1">

      <CollapsibleSection label="Geometría del micropilote" refNorma="Guía Fomento cap. 3.2">
        <NumField label="z cabeza"    sub="bajo rasante"     field="topDepth"        value={state.topDepth}        unit="m" setField={setField} />
        <NumField label="z apoyo"     sub="bajo rasante"     field="toeDepth"        value={state.toeDepth}        unit="m" setField={setField} />
        <NumField label="Dn"          sub="Ø perforación"    field="drillDiameter"   value={state.drillDiameter}   unit="mm" integer {...LIMITS.drillDiameter} setField={setField} />
        <NumField label="z NF"        sub="nivel freático"   field="waterTableDepth" value={state.waterTableDepth} unit="m" setField={setField} />
        <NumField label="p,inj"       sub="presión"          field="injectionPressure" value={state.injectionPressure} unit="kPa" integer {...LIMITS.injectionPressure} setField={setField} />
      </CollapsibleSection>

      <CollapsibleSection label="Carga y modo" refNorma="Guía Fomento cap. 3.3">
        <NumField label="Nc,d" sub="por pilote" field="designLoad" value={state.designLoad} unit="kN" integer {...LIMITS.designLoad} setField={setField} />
        <SelectField<EffortType>
          label="Esfuerzo"
          field="effort"
          value={state.effort}
          options={[
            { value: 'compression',         label: 'Compresión' },
            { value: 'tension',             label: 'Tracción' },
            { value: 'compression+tension', label: 'Compr. + tracc.' },
          ]}
          setField={setField}
        />
        <SelectField<'theoretical' | 'empirical'>
          label="Método"
          field="method"
          value={state.method}
          options={[
            { value: 'theoretical', label: 'Teórico'  },
            { value: 'empirical',   label: 'Empírico' },
          ]}
          setField={setField}
        />
      </CollapsibleSection>

      <CollapsibleSection label="Estratos del terreno" refNorma="Guía Fomento cap. 3.4">
        <SoilStrataEditor
          soil={soil}
          onAdd={addLayer}
          onRemove={removeLayer}
          onUpdate={updateLayer}
        />
      </CollapsibleSection>

      <CollapsibleSection label="Materiales" refNorma="EHE-08 / Guía Fomento §3.6">
        <SelectField<number>
          label="Hormigón"
          field="concreteGrade"
          value={state.concreteGrade}
          options={availableFck
            .filter((f) => f >= 25 && f <= 35)
            .map((f) => ({ value: f, label: `HA-${f}` }))}
          setField={setField}
        />
        <SelectField<GroutType>
          label="Inyección"
          sub="relleno del barreno"
          field="groutType"
          value={state.groutType}
          options={GROUT_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          setField={setField}
        />
        <SelectField<string>
          label="Tubo armadura"
          sub={state.tube === CUSTOM_TUBE_SENTINEL ? 'personalizado' : 'PIRESA'}
          field="tube"
          value={state.tube}
          options={[
            ...MICROPILE_TUBES.map((t) => ({ value: t.label, label: t.label })),
            // Sentinel value 'custom' — el motor lo reconoce y usa customTubeDe/E.
            { value: CUSTOM_TUBE_SENTINEL, label: '— Personalizado…' },
          ]}
          setField={setField}
          stacked
        />
        {state.tube === CUSTOM_TUBE_SENTINEL && (
          <>
            {/* Guardrail: el max del Ø ext se acota DINÁMICAMENTE al diámetro
                de perforación menos dos veces el recubrimiento mínimo Tabla
                2.3 — que depende del inyectado y del esfuerzo. Si el usuario
                cambia inyectado de lechada a mortero o efectua tracción, el
                max baja automáticamente. El motor además valida por si el
                state queda inconsistente (Dn cambiado tras fijar de). */}
            <NumField
              label="Ø ext"
              sub="tubo personalizado"
              field="customTubeDe"
              value={state.customTubeDe}
              unit="mm"
              min={LIMITS.customTubeDe.min}
              max={Math.max(
                LIMITS.customTubeDe.min,
                Math.min(
                  LIMITS.customTubeDe.max,
                  state.drillDiameter - 2 * getMinStructuralCover(state.groutType, state.effort),
                ),
              )}
              setField={setField}
            />
            <NumField
              label="Espesor"
              sub="tubo personalizado"
              field="customTubeE"
              value={state.customTubeE}
              unit="mm"
              {...LIMITS.customTubeE}
              setField={setField}
            />
          </>
        )}
        <NumField label="fy" sub="acero" field="steelGrade" value={state.steelGrade} unit="N/mm²" integer {...LIMITS.steelGrade} setField={setField} />
      </CollapsibleSection>

      <CollapsibleSection label="Ejecución y entorno" refNorma="Guía Fomento Tablas 3.5/3.6/A-5.1">
        <SelectField<ExecutionType>
          label="Ejecución"
          field="execution"
          value={state.execution}
          options={EXECUTION_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          setField={setField}
          stacked
        />
        <SelectField<CorrosionEnv>
          label="Corrosión"
          field="corrosionEnv"
          value={state.corrosionEnv}
          options={CORROSION_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          setField={setField}
          stacked
        />
        <SelectField<DesignLifeYears>
          label="Vida útil"
          sub="Tabla 2.4"
          field="designLifeYears"
          value={state.designLifeYears}
          options={DESIGN_LIFE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          setField={setField}
          stacked
        />
        <SelectField<ConnectionType>
          label="Unión"
          field="connection"
          value={state.connection}
          options={[
            { value: 'no-loss', label: 'Sin pérdida' },
            { value: 'other',   label: 'Otros' },
          ]}
          setField={setField}
        />
        <SelectField<ApplicationType>
          label="Aplicación"
          field="application"
          value={state.application}
          options={[
            { value: 'new',      label: 'Nueva construcción' },
            { value: 'existing', label: 'Cimentación existente' },
          ]}
          setField={setField}
          stacked
        />
        <SelectField<Duration>
          label="Duración"
          field="duration"
          value={state.duration}
          options={[
            { value: 'short', label: '≤ 6 meses (provisional)' },
            { value: 'long',  label: '> 6 meses (permanente)' },
          ]}
          setField={setField}
          stacked
        />
        {/* Pandeo (Guía 3.6.1): el CR se auto-calcula de la estratigrafía+
            geometría. El override "Manual" deja teclearlo a mano como antes. */}
        <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
          <InputLabel htmlFor="select-crMode" label="CR pandeo" sub="Guía 3.6.1" />
          <select
            id="select-crMode"
            value={state.crManualOverride ? 'manual' : 'auto'}
            onChange={(e) => setField('crManualOverride', e.target.value === 'manual')}
            className="bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors shrink-0 max-w-45"
          >
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        {state.crManualOverride ? (
          <NumField label="CR" sub="valor manual" field="CR" value={state.CR} unit="—" {...LIMITS.CR} setField={setField} />
        ) : (
          // Valor de solo lectura: no es un control de formulario, así que NO se
          // usa <label htmlFor> (no asocia con un <span> para lectores de
          // pantalla). Span etiquetado con aria-label en su lugar.
          <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
            <span className="text-[13px] text-text-secondary truncate min-w-0">
              CR<span className="text-[11px] text-text-disabled ml-1">auto-calculado</span>
            </span>
            <span
              aria-label="CR de pandeo auto-calculado"
              className="shrink-0 max-w-45 text-[12px] font-mono text-text-secondary px-2 py-1"
            >
              {autoCR !== undefined ? autoCR.toFixed(2) : '—'}
            </span>
          </div>
        )}
        {/* Recubrimiento estructural r (Guía 3.6.2): por defecto AUTO ⇒ la
            lechada llena el barreno, r=(Dn−de)/2 y d_struct=Dn. El override
            "Manual" deja teclear un bulbo reducido. El clamp dinámico del min
            (recubr. mínimo Tabla 2.3 según inyectado+esfuerzo) sigue aplicando
            en manual; en auto el motor valida que (Dn−de)/2 ≥ r_min. */}
        <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
          <InputLabel htmlFor="select-coverMode" label="r recubrimiento" sub="Guía 3.6.2" />
          <select
            id="select-coverMode"
            value={state.coverManualOverride ? 'manual' : 'auto'}
            onChange={(e) => setField('coverManualOverride', e.target.value === 'manual')}
            className="bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors shrink-0 max-w-45"
          >
            <option value="auto">Auto (= barreno)</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        {state.coverManualOverride ? (
          <NumField
            label="r"
            sub="valor manual"
            field="structuralCover"
            value={state.structuralCover}
            unit="mm"
            min={getMinStructuralCover(state.groutType, state.effort)}
            max={LIMITS.structuralCover.max}
            setField={setField}
          />
        ) : (
          <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
            <span className="text-[13px] text-text-secondary truncate min-w-0">
              r<span className="text-[11px] text-text-disabled ml-1">(Dn−de)/2</span>
            </span>
            <span
              aria-label="Recubrimiento estructural auto-calculado"
              className="shrink-0 max-w-45 text-[12px] font-mono text-text-secondary px-2 py-1"
            >
              {autoCover !== undefined ? `${autoCover.toFixed(2)} mm` : '—'}
            </span>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection label="Empujes horizontales" defaultOpen={false} refNorma="Guía Fomento cap. 3.7">
        <NumField label="Md" sub="momento cabeza" field="baseMoment" value={state.baseMoment} unit="kNm" {...LIMITS.baseMoment} setField={setField} />
        <NumField label="Vd" sub="cortante cabeza" field="baseShear"  value={state.baseShear}  unit="kN"  {...LIMITS.baseShear}  setField={setField} />
        <NumField label="E₀" sub="módulo cabeza"  field="soilModulusTop"   value={state.soilModulusTop}   unit="kN/m²" integer {...LIMITS.soilModulusTop}   setField={setField} />
        <NumField label="EL" sub="módulo empotr." field="soilModulusEmbed" value={state.soilModulusEmbed} unit="kN/m²" integer {...LIMITS.soilModulusEmbed} setField={setField} />
        {/* f (empotramiento ficticio) ahora se interpola desde E₀/EL — Tabla 3.8. */}
      </CollapsibleSection>

    </div>
  );
}
