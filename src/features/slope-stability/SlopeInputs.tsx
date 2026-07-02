// Panel de entrada del módulo de estabilidad de taludes (geotecnia · Phase 1).
//
// Componente CONTROLADO: no guarda estado propio del modelo. En cada edición
// calcula el `SlopeInputs` siguiente y llama a `onChange(next)`. La persistencia
// (localStorage del módulo) la gestiona el shell del módulo, no este panel.
//
// Mesa de trabajo del ingeniero (DESIGN.md): denso, técnico, sin adorno. Reusa
// los primitivos pan-módulo (CollapsibleSection / UnitNumberInput / InputLabel /
// HelpTooltip) y el editor de estratos de micropilotes (SoilStrataEditor) — los
// taludes comparten el modelo SoilLayer. El motor de taludes solo usa γ, c' y φ'
// (+ su para el check sin drenaje); las columnas micropilote-específicas
// (Nspt/rfℓim/Cu) se OCULTAN vía hiddenFields (Phase 2) para no mostrar siempre 0.

import type { JSX } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import type { SlopeInputs, SlopeLoad, SoilLayer } from '../../data/defaults';
import type { SoilType } from '../../data/micropileLookups';
import type { SlopeValidation } from '../../lib/calculations/geotech/validate';
import { LABELS } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';
import { InputLabel } from '../../components/ui/InputLabel';
import { SoilStrataEditor } from '../micropiles/SoilStrataEditor';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { getUnitLabel } from '../../lib/units/format';

interface SlopeInputsPanelProps {
  value: SlopeInputs;
  onChange: (next: SlopeInputs) => void;
  /** { valid, error?, fix? } — gatea el motor y alimenta el banner de fallo. */
  validation: SlopeValidation;
}

// Límites de la malla de búsqueda (acotados por PySlope y por coste de cómputo).
const SLICES_MIN = 10;
const SLICES_MAX = 200;
const ITER_MIN = 500;
const ITER_MAX = 5000;

// Presets de la malla — el toggle de precisión fija dovelas + círculos a la vez.
// "Rápida" devuelve un FoS orientativo en menos tiempo; "Fina" es la malla
// determinista del golden (25/1000) y la que va al PDF.
const MESH_PRESETS = {
  fast: { slices: 15, iterations: 500 },
  fine: { slices: 25, iterations: 1000 },
} as const;

// Textos de ayuda locales (módulo all-override, sin labelKey en estos campos).
const HELP = {
  noWater: 'Análisis seco: sin nivel freático, sin presión intersticial.',
  load: 'Sobrecargas aplicadas en la coronación del talud (trasdós).',
  method: 'Método de dovelas para el equilibrio. Bishop simplificado (iterativo, satisface equilibrio de momentos) o Fellenius/ordinario (directo, más conservador). Con nivel freático o presiones intersticiales altas Fellenius puede subestimar el FoS de forma marcada (no solo "algo menor"); para verificación con agua se prefiere Bishop.',
  slices: 'Número de dovelas en que se discretiza la masa deslizante (10–200).',
  iterations: 'Número de círculos de rotura tanteados en la búsqueda (500–5000).',
  precision: 'Malla fina (25 dovelas / 1000 círculos) o rápida (orientativa).',
  situation: 'Situación de proyecto: fija el límite normativo del factor de seguridad (γR).',
} as const;

const SITUATION_OPTIONS: Array<{ value: SlopeInputs['situation']; label: string }> = [
  { value: 'persistent', label: 'Persistente (γR = 1,5)' },
  { value: 'transient', label: 'Transitoria (γR = 1,5)' },
  { value: 'extraordinary', label: 'Extraordinaria (γR = 1,1)' },
];

// Contexto normativo (doc §4.2): selecciona qué checks/límites aplican. Los textos
// vienen del catálogo LABELS (Phase 1) para no duplicar vocabulario normativo.
const CONTEXT_OPTIONS: Array<{ value: SlopeInputs['context']; label: string }> = [
  { value: 'excavation', label: LABELS.slope_context_excavation.descLong },
  { value: 'global-foundation', label: LABELS.slope_context_global_foundation.descLong },
];

// ── Fila de sobrecarga ───────────────────────────────────────────────────────

function LoadRow({
  load, index, onUpdate, onRemove,
}: {
  load: SlopeLoad;
  index: number;
  onUpdate: (patch: Partial<SlopeLoad>) => void;
  onRemove: () => void;
}) {
  const isUdl = load.kind === 'udl';
  // Sufijos de unidad del selector según el toggle SI↔técnico (kN/m² ↔ kg/m²,
  // kN/m ↔ kg/m) — el input de magnitud ya convertía vía quantity=.
  const { system } = useUnitSystem();
  return (
    <div className="rounded border border-border-main bg-bg-primary/40 px-2.5 py-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <label className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] text-text-secondary shrink-0">Tipo</span>
          <select
            value={load.kind}
            onChange={(e) => {
              const kind = e.target.value as SlopeLoad['kind'];
              // Al pasar a lineal, `length` deja de aplicar → se descarta.
              onUpdate(kind === 'line' ? { kind, length: undefined } : { kind });
            }}
            aria-label={`Tipo de sobrecarga ${index + 1}`}
            className="bg-bg-primary border border-border-main rounded px-1.5 py-1 text-[11.5px] font-mono text-text-primary outline-none focus:border-accent transition-colors min-w-0"
          >
            <option value="udl">{`UDL (${getUnitLabel('areaLoad', system)})`}</option>
            <option value="line">{`Lineal (${getUnitLabel('linearLoad', system)})`}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-text-disabled hover:text-state-fail transition-colors shrink-0"
          aria-label={`Eliminar sobrecarga ${index + 1}`}
        >
          <Trash2 size={11} />
        </button>
      </div>
      <UnitNumberInput
        label="q"
        sub="magnitud"
        quantity={isUdl ? 'areaLoad' : 'linearLoad'}
        help={isUdl ? 'Carga uniforme repartida sobre la banda.' : 'Carga lineal en el punto indicado.'}
        value={load.magnitude}
        onChange={(n) => onUpdate({ magnitude: n })}
        min={0}
      />
      <UnitNumberInput
        label="d"
        sub="desde coronación"
        unit="m"
        help="Distancia desde la coronación del talud hacia el trasdós."
        value={load.offset}
        onChange={(n) => onUpdate({ offset: n })}
        min={0}
      />
      {isUdl && (
        <UnitNumberInput
          label="L"
          sub="ancho banda"
          unit="m"
          help="Ancho de la banda cargada. 0 = hasta el límite de análisis."
          value={load.length ?? 0}
          onChange={(n) => onUpdate({ length: n })}
          min={0}
        />
      )}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function SlopeInputs(props: SlopeInputsPanelProps): JSX.Element {
  const { value, onChange, validation } = props;

  // Reemplaza un único campo escalar del modelo y emite el nuevo estado.
  const set = <K extends keyof SlopeInputs>(field: K, next: SlopeInputs[K]) => {
    onChange({ ...value, [field]: next });
  };

  // ── Nivel freático ──────────────────────────────────────────────────────────
  // El toggle "Sin nivel freático" alterna entre null (seco) y una profundidad.
  // Al reactivarlo recupera H/2 como semilla razonable (NF a media altura).
  const hasWater = value.waterTableDepth !== null;
  const toggleWater = () => {
    if (hasWater) set('waterTableDepth', null);
    else set('waterTableDepth', Math.max(0, value.height / 2));
  };

  // ── Estratos ────────────────────────────────────────────────────────────────
  // SoilStrataEditor muta `value.strata` vía estos tres callbacks, siempre
  // inmutables y reemitiendo el modelo completo por onChange.
  const nextLayerId = () =>
    value.strata.reduce((max, s) => Math.max(max, s.id), 0) + 1;

  const addLayer = () => {
    const seed: SoilLayer = {
      id: nextLayerId(),
      type: 'cohesive',
      thickness: 5,
      gamma: 19,
      c: 10,
      phi: 28,
      Nspt: 0,
      su: 0,
      rflim: 0,
    };
    set('strata', [...value.strata, seed]);
  };

  const removeLayer = (id: number) => {
    set('strata', value.strata.filter((s) => s.id !== id));
  };

  const updateLayer = (id: number, field: keyof SoilLayer, v: number | SoilType) => {
    set(
      'strata',
      value.strata.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, [field]: v };
        // Al pasar a granular, la cohesión efectiva (c′) y la resistencia sin
        // drenaje (su) son nulas por definición. Se fuerzan a 0 para que no
        // quede un valor oculto alimentando el motor: la UI no muestra c′/su en
        // granular, pero PySlope lee `c` de TODOS los estratos y el check sin
        // drenaje se dispara con cualquier su>0, sin mirar el tipo.
        if (field === 'type' && v === 'granular') {
          next.c = 0;
          next.su = 0;
        }
        return next;
      }),
    );
  };

  // ── Sobrecargas ─────────────────────────────────────────────────────────────
  const nextLoadId = () =>
    value.loads.reduce((max, l) => Math.max(max, l.id), 0) + 1;

  const addLoad = () => {
    const seed: SlopeLoad = { id: nextLoadId(), kind: 'udl', magnitude: 10, offset: 0, length: 0 };
    set('loads', [...value.loads, seed]);
  };

  const removeLoad = (id: number) => {
    set('loads', value.loads.filter((l) => l.id !== id));
  };

  const updateLoad = (id: number, patch: Partial<SlopeLoad>) => {
    set('loads', value.loads.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  // ── Precisión ───────────────────────────────────────────────────────────────
  const isFine =
    value.slices === MESH_PRESETS.fine.slices && value.iterations === MESH_PRESETS.fine.iterations;
  const applyMesh = (preset: keyof typeof MESH_PRESETS) => {
    onChange({ ...value, slices: MESH_PRESETS[preset].slices, iterations: MESH_PRESETS[preset].iterations });
  };

  return (
    // Sin lg:w-72 aquí: la columna externa (index.tsx) ya es lg:w-72 con px-4;
    // re-forzar 288px dentro de un contenedor de 256px desbordaba en horizontal
    // (refs de cabecera y selects se salían bajo el canvas). Llena el contenedor.
    <div className="flex flex-col gap-1">

      {/* Banner de validación (DESIGN.md 2026-05-04). No-modal, sobre el panel,
          con bloque "Cómo arreglarlo" en accent/5. */}
      {!validation.valid && (
        <div className="mb-1 rounded border border-state-fail/40 bg-state-fail/5 px-2.5 py-2">
          <div className="flex items-start gap-1.5">
            <AlertTriangle size={13} className="text-state-fail mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-state-fail leading-snug">Datos no válidos</div>
              {validation.error && (
                <div className="text-[11px] text-text-secondary mt-0.5 leading-snug">{validation.error}</div>
              )}
              {validation.fix && (
                <div className="mt-1.5 rounded border border-accent/30 bg-accent/5 px-2 py-1.5">
                  <div className="text-[10px] font-mono uppercase text-accent mb-0.5" style={{ letterSpacing: '0.08em' }}>
                    Cómo arreglarlo
                  </div>
                  <div className="text-[11px] text-text-secondary leading-snug">{validation.fix}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1 — Geometría */}
      <CollapsibleSection label="Geometría" refNorma="CTE DB-SE-C cap. 7">
        <UnitNumberInput
          labelKey="H"
          value={value.height}
          onChange={(n) => set('height', n)}
          unit="m"
          min={0}
        />
        <UnitNumberInput
          labelKey="beta"
          quantity="angle"
          value={value.angle}
          onChange={(n) => set('angle', n)}
          min={0}
        />
      </CollapsibleSection>

      {/* 2 — Nivel freático */}
      <CollapsibleSection label="Nivel freático" refNorma="CTE DB-SE-C §4.4">
        <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 min-w-0">
          <span className="text-[13px] text-text-secondary truncate min-w-0">Nivel freático</span>
          <button
            type="button"
            onClick={toggleWater}
            aria-pressed={hasWater}
            className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-colors shrink-0 ${
              hasWater
                ? 'bg-accent/15 text-accent border border-accent/40'
                : 'bg-bg-elevated text-text-disabled border border-border-main'
            }`}
          >
            {hasWater ? 'Con NF' : 'Seco'}
          </button>
        </div>
        {hasWater && (
          <UnitNumberInput
            labelKey="nf_slope"
            value={value.waterTableDepth ?? 0}
            onChange={(n) => set('waterTableDepth', n)}
            unit="m"
            min={0}
          />
        )}
      </CollapsibleSection>

      {/* 3 — Sobrecargas en coronación */}
      <CollapsibleSection label="Sobrecargas en coronación" refNorma="CTE DB-SE-AE">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-text-disabled leading-snug px-0.5">{HELP.load}</p>
          {value.loads.length === 0 ? (
            <p className="text-[11px] text-text-disabled px-0.5">Sin sobrecargas (talud descargado).</p>
          ) : (
            value.loads.map((load, i) => (
              <LoadRow
                key={load.id}
                load={load}
                index={i}
                onUpdate={(patch) => updateLoad(load.id, patch)}
                onRemove={() => removeLoad(load.id)}
              />
            ))
          )}
          <button
            type="button"
            onClick={addLoad}
            className="flex items-center gap-1 text-[11px] text-accent/80 hover:text-accent transition-colors text-left py-1 px-2"
          >
            <Plus size={12} aria-hidden="true" />
            Añadir carga
          </button>
        </div>
      </CollapsibleSection>

      {/* 4 — Estratos (reusa SoilStrataEditor de micropilotes) */}
      <CollapsibleSection label="Estratos" refNorma="CTE DB-SE-C §4.2">
        <SoilStrataEditor
          soil={value.strata}
          onAdd={addLayer}
          onRemove={removeLayer}
          onUpdate={updateLayer}
          // El motor de taludes solo lee γ, c' y φ' (+ su para el check sin
          // drenaje). NSPT/rfℓim/Cu son específicos de micropilotes → se ocultan
          // para no mostrar campos irrelevantes siempre a 0.
          hiddenFields={['Nspt', 'rflim', 'Cu']}
        />
      </CollapsibleSection>

      {/* 5 — Método y malla */}
      <CollapsibleSection label="Método" refNorma="CTE DB-SE-C art. 7.2.2.1">
        <div className="flex flex-col gap-1 py-0.75 min-w-0">
          <InputLabel htmlFor="select-slope-method" label="Método" help={HELP.method} />
          <select
            id="select-slope-method"
            value={value.method}
            onChange={(e) => set('method', e.target.value as SlopeInputs['method'])}
            className="bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors w-full"
          >
            <option value="bishop">Bishop simplificado</option>
            <option value="fellenius">Fellenius (ordinario)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 py-0.75 min-w-0">
          <InputLabel htmlFor="select-slope-precision" label="Precisión" sub="malla" help={HELP.precision} />
          <select
            id="select-slope-precision"
            value={isFine ? 'fine' : 'fast'}
            onChange={(e) => applyMesh(e.target.value as keyof typeof MESH_PRESETS)}
            className="bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors w-full"
          >
            <option value="fine">Fina (25/1000)</option>
            <option value="fast">Rápida (15/500)</option>
          </select>
        </div>

        <UnitNumberInput
          label="nd"
          sub="dovelas"
          help={HELP.slices}
          value={value.slices}
          onChange={(n) => set('slices', n)}
          integer
          min={SLICES_MIN}
          max={SLICES_MAX}
          clamp
          step={5}
          unit="ud"
        />
        <UnitNumberInput
          label="nit"
          sub="círculos"
          help={HELP.iterations}
          value={value.iterations}
          onChange={(n) => set('iterations', n)}
          integer
          min={ITER_MIN}
          max={ITER_MAX}
          clamp
          step={100}
          unit="ud"
        />
        <p className="text-[10px] text-text-disabled leading-snug px-0.5">
          Dovelas {SLICES_MIN}–{SLICES_MAX} · círculos {ITER_MIN}–{ITER_MAX}.
        </p>

        <div className="flex flex-col gap-1 py-0.75 min-w-0">
          <InputLabel htmlFor="select-slope-situation" label="Situación" help={HELP.situation} />
          <select
            id="select-slope-situation"
            value={value.situation}
            onChange={(e) => set('situation', e.target.value as SlopeInputs['situation'])}
            className="bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors w-full"
          >
            {SITUATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Contexto normativo (doc §4.2): talud de excavación (art. 7.2.2.1, γR
            sobre la resistencia) vs estabilidad global de cimentación (Tabla 2.1,
            terreno minorado γM). Selecciona qué checks/límites aplican tras Calcular.
            Texto/tooltip del catálogo LABELS (slope_context). */}
        <div className="flex flex-col gap-1 py-0.75 min-w-0">
          <InputLabel htmlFor="select-slope-context" labelKey="slope_context" />
          <select
            id="select-slope-context"
            value={value.context}
            onChange={(e) => set('context', e.target.value as SlopeInputs['context'])}
            className="bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors w-full"
          >
            {CONTEXT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Aviso de alcance (DESIGN.md D4): el sísmico pseudo-estático llega en
            Phase 3. Hint discreto NO interactivo (no es un control) que fija la
            expectativa; conserva el tooltip del catálogo (fos_seismic_deferred). */}
        <div className="flex items-center justify-between py-0.75 gap-2 min-w-0 opacity-60">
          <InputLabel label="Sísmico" sub="pseudo-estático" help={LABELS.fos_seismic_deferred.help} />
          <span className="text-[11px] font-mono text-text-disabled border border-border-main rounded px-2 py-1 shrink-0">
            Próximamente · Phase 3
          </span>
        </div>
      </CollapsibleSection>

    </div>
  );
}
