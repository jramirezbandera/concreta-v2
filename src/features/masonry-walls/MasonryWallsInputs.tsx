// Inputs panel para el módulo de muros de fábrica.
//
// Jerarquía (rediseño 2026-07): Fábrica (método fk unificado en un solo
// selector de 3 opciones) → Geometría del muro → Mayoración ELU (colapsada:
// γG/γQ casi nunca se tocan) → Plantas → por planta: Forjado (subgrupos
// Cargas / Apoyo), Cargas puntuales y Huecos (nombres humanos "Ventana 1").
// Las aclaraciones largas viven en los tooltips ⓘ; en el panel solo quedan
// readouts de una línea (ReadoutRow) y cajas de valores derivados.

import { useEffect, useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { WARN_UTIL } from '../../lib/calculations/types';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import {
  TABLA_4_4,
  GAMMA_M_TABLA,
  K_ANEJO_C,
  TIPO_MURO_LABELS,
  TIPO_MURO_LABELS_SHORT,
  calcFkAnejoC,
  fbPatch,
  fbValidosPara,
  findGammaMCell,
  fmValidosPara,
  gammaCustomPatch,
  lookupGammaM,
  piezaPatch,
  resolverFabrica,
  tipoMuroPatch,
  eMin,
  eApoyoForjado,
  detectarHuecosSolapados,
  nombreHueco,
  sincronizarHuecosPasantes,
  type CategoriaControl,
  type ClaseEjecucion,
  type MasonryWallState,
  type TipoMuroAnejoC,
  type Hueco,
  type HuecoTipo,
  type Puntual,
  type PlantaResult,
} from '../../lib/calculations/masonryWalls';
import { fromDisplay, toDisplay } from '../../lib/units/convert';
import { formatQuantity, getUnitLabel } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';
import { useUnitSystem } from '../../lib/units/useUnitSystem';

// Textos de ayuda (tooltips ⓘ). Módulo con UI propia (sin InputLabel): los
// textos viven aquí. El detalle largo va SIEMPRE aquí, nunca en <p> inline.
const HELP = {
  pieza: 'Tipo de pieza de fábrica (ladrillo, bloque…). Con fb y fm fija fk (Tabla 4.4).',
  fb: 'Resistencia normalizada a compresión de la pieza.',
  fm: 'Resistencia a compresión del mortero.',
  tipoMuro: 'Tipo de muro para el coeficiente K del Anejo C (eq. C.1): número de hojas y tipo de pieza.',
  fkDirecto: 'Resistencia característica a compresión de la fábrica, introducida directamente (p. ej. de ensayos o de un valor conocido).',
  gammaFab: 'Peso específico de la fábrica. Se estima automáticamente según el tipo de muro; si lo editas, deja de actualizarse solo.',
  gammaMSel: 'Coeficiente parcial γM (Tabla 4.8) según categoría de control de fabricación y clase de ejecución. Elige «Personalizado…» tecleando otro valor en el campo γM.',
  gammaM: 'Coeficiente parcial de seguridad del material; f_d = fk/γM.',
  L: 'Longitud total del muro.',
  t: 'Espesor del muro. Define la excentricidad mínima e_min y la esbeltez.',
  gammaG: 'Coeficiente de mayoración de las cargas permanentes (ELU).',
  gammaQ: 'Coeficiente de mayoración de las cargas variables (ELU).',
  H: 'Altura libre de la planta entre forjados.',
  qG: 'Carga permanente lineal del forjado, valor característico (sin mayorar).',
  qQ: 'Sobrecarga lineal del forjado, valor característico (sin mayorar).',
  a: 'Longitud que el forjado entra en el espesor del muro. La reacción se supone triangular sobre la entrega (máxima en la cara del vano, nula al fondo), así que su resultante queda a a/3 de la cara. En modo auto eso fija la excentricidad del apoyo: e_apoyo = t/2 − a/3.',
  ea: 'Excentricidad de la reacción del forjado respecto al eje del muro. En auto se deriva del reparto triangular de la reacción sobre la entrega: e_apoyo = t/2 − a/3 (§5.2.3), y se recalcula sola si cambias t o a. Actívala manual solo para casos especiales (p. ej. muro interior con forjados a ambos lados que se compensan, o apoyo por herrajes). No confundir con la e_a de resultados, que es la excentricidad accidental h_ef/450.',
  px: 'Posición de la carga puntual a lo largo del muro.',
  pG: 'Carga puntual permanente, valor característico.',
  pQ: 'Carga puntual variable, valor característico.',
  pb: 'Longitud de apoyo de la carga puntual sobre el muro.',
  hTipo: 'Ventana (alféizar y alto libres), puerta (desde el suelo, con muro sobre el dintel) o pasante (de forjado a forjado: ocupa toda la altura libre de la planta, así que no queda fábrica sobre el dintel y su alto lo fija H).',
  hx: 'Posición horizontal del hueco a lo largo del muro.',
  hy: 'Altura del alféizar (cota de la base de la ventana).',
  hw: 'Ancho del hueco.',
  hh: 'Alto del hueco (hasta el dintel).',
} as const;

/** Métodos (excluyentes) de obtener fk. La UI los presenta como UN selector
 *  de 3 opciones, pero el state conserva el par fabricaModo/customMethod
 *  (serialización de URLs y adaptador IA intactos). */
type FkMethod = 'tabla' | 'anejoC' | 'manual';

const FK_METHOD_LABEL: Record<FkMethod, string> = {
  tabla: 'Tabla 4.4',
  anejoC: 'Anejo C',
  manual: 'fk directo',
};

const FK_METHOD_CAPTION: Record<FkMethod, string> = {
  tabla: 'fk tabulado según pieza y mortero',
  anejoC: 'fk = K·fb⁰·⁷·fm⁰·³ · eq. C.1',
  manual: 'fk característico introducido a mano',
};

/** Microheader de subgrupo dentro de una sección (mismo idioma visual que el
 *  header de sección, un nivel por debajo). `note` = aclaración de una línea. */
function SubGroup({ label, note }: { label: string; note?: string }) {
  return (
    <div className="pt-2 pb-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">{label}</p>
      {note && <p className="text-[10px] text-text-disabled leading-tight mt-0.5">{note}</p>}
    </div>
  );
}

/** Fila de solo lectura para valores derivados: etiqueta atenuada a la
 *  izquierda, valor mono a la derecha. Sustituye a los <p> sueltos. */
function ReadoutRow({ label, value, tone = 'default' }: {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'fail';
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.75 min-w-0">
      <span className="text-[10px] text-text-disabled min-w-0 leading-tight">{label}</span>
      <span
        className="text-[10px] font-mono tabular-nums shrink-0"
        style={{ color: tone === 'fail' ? 'var(--color-state-fail)' : 'var(--color-text-secondary)' }}
      >
        {value}
      </span>
    </div>
  );
}

interface NumFieldProps {
  label: string;
  sub?: string;
  /** Tooltip ⓘ breve junto al label. Coexiste con `title={sub}` y notas inline. */
  help?: string;
  /** Valor en las unidades de almacenamiento del state (mm para geometría,
   *  SI para cantidades físicas cuando `quantity` está set). */
  value: number;
  unit?: string;
  /** Storage scaling: value · scale = display value. Permite mm storage →
   *  m/cm display (scale=0.001 / 0.1). Mutuamente exclusivo con `quantity`. */
  scale?: number;
  /** Decimales en el display. Default: 0 si scale=1, 2 si scale<1. */
  decimals?: number;
  onChange: (v: number) => void;
  refNorma?: string;
  /** Cuando set, auto-conversión SI↔técnico via catálogo. value y onChange
   *  son siempre SI. Mutuamente exclusivo con `scale` (storage scaling). */
  quantity?: Quantity;
}

function NumField({ label, sub, help, value, unit, scale = 1, decimals, onChange, refNorma, quantity }: NumFieldProps) {
  const { system } = useUnitSystem();
  // Display value y unit dependen de qué modo aplica:
  //   - quantity: auto SI↔técnico vía catálogo (ignora scale, unit).
  //   - scale: storage-scaling (legacy para mm→m/cm).
  const displayValue = quantity ? toDisplay(value, quantity, system) : value * scale;
  const resolvedUnit = quantity ? getUnitLabel(quantity, system) : unit;

  // Cadena local controlada (mismo patrón que empresillado): permite estados
  // intermedios mientras el usuario escribe ("5.", "1.2"), y solo dispara
  // onChange cuando el valor parsea limpio. onBlur canonicaliza si quedó algo
  // inválido. useEffect sincroniza si el `value` o `system` cambia desde fuera.
  const initial = String(displayValue);
  const [localStr, setLocalStr] = useState<string>(initial);

  useEffect(() => {
    // Si el valor parseado coincide con el almacenado, no sobreescribir lo
    // que el usuario está tecleando (preserva "5." y "5.0" mientras escribe).
    const parsed = parseFloat(localStr);
    const storedFromLocal = isNaN(parsed)
      ? null
      : (quantity ? fromDisplay(parsed, quantity, system) : parsed / scale);
    if (storedFromLocal !== value) {
      setLocalStr(String(displayValue));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, scale, system, quantity]);

  void decimals;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 py-1 max-lg:min-h-11">
        <div className="min-w-0 flex flex-col">
          <span className="flex items-center gap-1 min-w-0">
            <span className="text-[12px] text-text-secondary truncate" title={sub}>
              <span className="font-mono">{label}</span>
              {sub && <span className="text-text-disabled"> · {sub}</span>}
            </span>
            {help && <HelpTooltip text={help} fieldLabel={label} />}
          </span>
          {refNorma && <span className="text-[10px] font-mono text-text-disabled">{refNorma}</span>}
        </div>
        <div className="flex shrink-0">
          <input
            type="text"
            inputMode="decimal"
            value={localStr}
            onChange={(e) => {
              const raw = e.target.value;
              setLocalStr(raw);
              const n = parseFloat(raw);
              if (!isNaN(n)) {
                const si = quantity ? fromDisplay(n, quantity, system) : n / scale;
                onChange(si);
              }
            }}
            onBlur={() => {
              const n = parseFloat(localStr);
              if (isNaN(n)) setLocalStr(String(displayValue));
            }}
            className="w-16 text-right bg-bg-primary border border-border-main rounded-l px-2 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent"
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.5 py-1 text-[10px] font-mono text-text-disabled flex items-center">
            {resolvedUnit}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Croquis del apoyo forjado-muro (§5.2.3): sección con el forjado entrando
 *  la entrega `a`, el reparto triangular de la reacción (solo en modo auto —
 *  con e manual el triángulo ya no justifica la posición de R) y la
 *  excentricidad e de la resultante respecto al eje. Proporcional a t/a/e
 *  reales, así el usuario VE moverse R al tocar los campos. Tokens var()
 *  (regla de paleta: nada hardcodeado en pantalla). */
function ApoyoDiagram({ t, a, e, showTriangle }: { t: number; a: number; e: number; showTriangle: boolean }) {
  if (!(t > 0)) return null;
  const T = 88;              // px que ocupa el espesor t
  const wx = 116;            // x de la cara del vano (por donde entra el forjado)
  const pxMm = T / t;
  const A = Math.min(Math.max(a, 0) * pxMm, T);
  const xc = wx + T / 2;     // eje del muro
  // Clamp visual: con e manual ≥ t/2 la resultante cae fuera de la sección;
  // se pinta pegada fuera de la cara y el aviso rojo pone el número.
  const xR = Math.max(wx - 6, Math.min(xc - e * pxMm, wx + T));
  return (
    <svg viewBox="0 0 240 100" className="w-full h-auto mt-1 font-mono" aria-hidden="true">
      {/* muro (sección) */}
      <rect x={wx} y={6} width={T} height={86} fill="none" stroke="var(--color-text-secondary)" strokeWidth="1" />
      {/* eje del muro */}
      <line x1={xc} y1={2} x2={xc} y2={96} stroke="var(--color-text-disabled)" strokeWidth="1" strokeDasharray="4 3" />
      {/* forjado entrando la entrega a */}
      <rect x={8} y={28} width={wx + A - 8} height={16} fill="var(--color-bg-surface)" stroke="var(--color-text-secondary)" strokeWidth="1" />
      <text x={12} y={39} fontSize="8" fill="var(--color-text-disabled)">forjado</text>
      {/* cota a */}
      {A > 6 && (
        <>
          <line x1={wx} y1={23} x2={wx + A} y2={23} stroke="var(--color-text-disabled)" strokeWidth="1" />
          <text x={wx + A / 2} y={20} textAnchor="middle" fontSize="8" fill="var(--color-text-disabled)">a</text>
        </>
      )}
      {/* triángulo de presiones: máx en la cara del vano, nulo al fondo */}
      {showTriangle && A > 2 && (
        <polygon points={`${wx},44 ${wx + A},44 ${wx},58`} fill="var(--color-tint-accent)" stroke="var(--color-accent)" strokeWidth="0.75" />
      )}
      {/* resultante R */}
      <line x1={xR} y1={showTriangle ? 60 : 48} x2={xR} y2={76} stroke="var(--color-accent)" strokeWidth="1.5" />
      <polygon points={`${xR - 3},76 ${xR + 3},76 ${xR},81`} fill="var(--color-accent)" />
      <text x={xR - 5} y={72} textAnchor="end" fontSize="8" fill="var(--color-accent)">R</text>
      {/* cota e: de R al eje */}
      {Math.abs(xc - xR) > 4 && (
        <>
          <line x1={xR} y1={86} x2={xc} y2={86} stroke="var(--color-accent)" strokeWidth="1" />
          <text x={(xR + xc) / 2} y={95} textAnchor="middle" fontSize="8" fill="var(--color-accent)">e</text>
        </>
      )}
    </svg>
  );
}

/** e_apoyo con modo auto ⇄ manual sobre el centinela del motor (e_apoyo ≤ 0
 *  = derivar t/2 − a/3). Mismo patrón que BetaField de punzonamiento, pero
 *  SIN campo nuevo en el schema: auto escribe 0, manual siembra el derivado.
 *  Estados guardados, URLs y adaptador IA quedan intactos. `forceManual`
 *  mantiene el campo montado mientras se teclea un valor que pasa por 0
 *  ("0.5" → el "0" intermedio no debe desmontar el input); se resetea al
 *  cambiar de planta vía key={plantaSel.id} en el call site. */
function EApoyoField({ t, e_apoyo, a_apoyo, onChange }: {
  t: number; e_apoyo: number; a_apoyo: number; onChange: (v: number) => void;
}) {
  const [forceManual, setForceManual] = useState(false);
  const derived = eApoyoForjado(t, a_apoyo); // mm
  const manual = forceManual || e_apoyo > 0;
  const eEff = e_apoyo > 0 ? e_apoyo : derived;
  return (
    <>
      <div className="flex items-center justify-between gap-2 py-1 max-lg:min-h-11">
        <span className="flex items-center gap-1 min-w-0">
          <span className="text-[12px] text-text-secondary truncate">
            <span className="font-mono">e_apoyo</span>
            <span className="text-text-disabled"> · manual</span>
          </span>
          <HelpTooltip text={HELP.ea} fieldLabel="e_apoyo" />
        </span>
        <button
          type="button"
          onClick={() => {
            if (manual) { setForceManual(false); onChange(0); }
            else { setForceManual(true); onChange(Math.max(derived, 1)); }
          }}
          className={[
            'px-2.5 py-0.75 rounded border text-[11px] font-mono transition-colors cursor-pointer',
            manual
              ? 'bg-accent/10 border-accent/40 text-accent'
              : 'bg-bg-primary border-border-main text-text-disabled hover:text-text-secondary',
          ].join(' ')}
        >
          {manual ? 'Activo' : 'Inactivo'}
        </button>
      </div>
      {manual ? (
        <>
          <NumField label="e_apoyo" sub="excentricidad" value={e_apoyo} unit="cm" scale={0.1} decimals={1}
            onChange={onChange} />
          <p className="text-[10px] text-text-disabled leading-tight pl-1">
            Auto daría t/2 − a/3 = {(derived / 10).toFixed(1)} cm. Con e_apoyo manual, <span className="font-mono">a</span> no interviene en el cálculo.
          </p>
          {e_apoyo >= t / 2 && (
            <p className="text-[10px] text-state-fail leading-tight pl-1 mt-0.5">
              e_apoyo ≥ t/2: la reacción cae fuera de la sección → Φ = 0, N_Rd = 0.
            </p>
          )}
        </>
      ) : (
        <ReadoutRow
          label="e_apoyo = t/2 − a/3 · §5.2.3"
          value={`${(derived / 10).toFixed(1)} cm`}
        />
      )}
      <ApoyoDiagram t={t} a={a_apoyo} e={eEff} showTriangle={!manual} />
    </>
  );
}

interface SelFieldProps<T extends string | number> {
  label: string;
  /** Sub descriptivo atenuado tras el label (label pasa a mono, como NumField). */
  sub?: string;
  help?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  refNorma?: string;
  /** Label arriba + select a ancho completo debajo. Para opciones largas que
   *  truncarían en el layout inline (la barra mide 288 px). */
  stacked?: boolean;
}

function SelField<T extends string | number>({ label, sub, help, value, options, onChange, refNorma, stacked }: SelFieldProps<T>) {
  const labelNode = (
    <span className="flex items-center gap-1 min-w-0">
      <span className="text-[12px] text-text-secondary truncate min-w-0" title={sub ? `${label} · ${sub}` : undefined}>
        {sub ? <span className="font-mono">{label}</span> : label}
        {sub && <span className="text-text-disabled"> · {sub}</span>}
      </span>
      {help && <HelpTooltip text={help} fieldLabel={label} />}
    </span>
  );
  const selectNode = (
    <select
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const asNum = Number(raw);
        onChange((isNaN(asNum) ? raw : asNum) as T);
      }}
      className={[
        'bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent cursor-pointer truncate',
        stacked ? 'w-full' : 'max-w-[150px]',
      ].join(' ')}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
      ))}
    </select>
  );

  if (stacked) {
    return (
      <div className="py-1 max-lg:min-h-11 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          {labelNode}
          {refNorma && <span className="text-[10px] font-mono text-text-disabled shrink-0">{refNorma}</span>}
        </div>
        {selectNode}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2 py-1 max-lg:min-h-11 min-w-0">
        {labelNode}
        {selectNode}
      </div>
      {refNorma && <span className="text-[10px] font-mono text-text-disabled block pl-1 mb-1">{refNorma}</span>}
    </div>
  );
}

interface MiniBtnProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  title?: string;
}

function MiniBtn({ children, onClick, variant = 'default', title }: MiniBtnProps) {
  const styles: Record<NonNullable<MiniBtnProps['variant']>, string> = {
    default: 'text-text-secondary border-border-main hover:border-accent hover:text-accent',
    primary: 'text-accent border-accent/40 bg-accent/5 hover:border-accent hover:text-accent',
    danger:  'text-state-fail border-border-main hover:border-state-fail hover:text-state-fail',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`text-[10px] font-mono px-1.5 py-0.5 max-lg:min-h-11 max-lg:min-w-11 max-lg:px-3 max-lg:flex max-lg:items-center max-lg:justify-center rounded leading-none border transition-colors cursor-pointer ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

/**
 * Campos del modo Anejo C / fk directo. El selector de método vive en el
 * padre (segmented único de 3 opciones); aquí solo los inputs del método
 * activo, con la orquestación auto-γ + edited flag que comparte con la IA.
 */
function CustomFabricaBlock({
  state,
  setState,
}: {
  state: MasonryWallState;
  setState: React.Dispatch<React.SetStateAction<MasonryWallState>>;
}) {
  // Auto-γ al cambiar tipoMuro y marcado de γ como "editado por el usuario":
  // los dos patches viven en el motor porque el asistente IA los comparte (si
  // la IA escribiera γ sin marcar el flag, el siguiente cambio de tipo de muro
  // lo pisaría en silencio).
  const setTipoMuro = (t: TipoMuroAnejoC) =>
    setState((s) => ({ ...s, ...tipoMuroPatch(s, t) }));

  const setGammaCustom = (v: number) =>
    setState((s) => ({ ...s, ...gammaCustomPatch(v) }));

  const r = calcFkAnejoC(state.anejoC_tipoMuro, state.anejoC_fb, state.anejoC_fm);
  const K = K_ANEJO_C[state.anejoC_tipoMuro];

  return (
    <>
      {state.customMethod === 'anejoC' ? (
        <>
          <SelField
            stacked
            label="Tipo de muro"
            help={`${HELP.tipoMuro} Seleccionado: ${TIPO_MURO_LABELS[state.anejoC_tipoMuro]}.`}
            value={state.anejoC_tipoMuro}
            onChange={(v) => setTipoMuro(v as TipoMuroAnejoC)}
            options={(Object.keys(TIPO_MURO_LABELS_SHORT) as TipoMuroAnejoC[]).map((k) => ({
              value: k,
              label: TIPO_MURO_LABELS_SHORT[k],
            }))}
          />
          <ReadoutRow label="K · coef. del tipo de muro" value={K.toFixed(2)} />
          <NumField
            label="fb"
            sub="resist. pieza"
            help={HELP.fb}
            value={state.anejoC_fb}
            quantity="stress"
            onChange={(v) => setState((s) => ({ ...s, anejoC_fb: v }))}
          />
          <NumField
            label="fm"
            sub="resist. mortero"
            help={HELP.fm}
            value={state.anejoC_fm}
            quantity="stress"
            onChange={(v) => setState((s) => ({ ...s, anejoC_fm: v }))}
          />
          {r.capped && (
            // state-warn (no state-fail) — el cap no es input inválido, es
            // la nota al pie de eq. C.1 limitando un fm físicamente irrazonable.
            <div className="rounded border border-state-warn/30 bg-state-warn/5 px-2 py-1.5 mb-2 text-[10px] font-mono text-state-warn leading-tight flex gap-2">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 mt-0.5"
                aria-hidden="true"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>
                fm limitado a {r.fmApplied.toFixed(2)} N/mm² · nota C.1:
                min(20; 0,75·fb)
              </span>
            </div>
          )}
          <NumField
            label="γ"
            sub={state.gamma_custom_edited ? 'peso específico' : 'peso esp. · auto'}
            help={HELP.gammaFab}
            value={state.gamma_custom}
            quantity="weightDensity"
            onChange={setGammaCustom}
          />
          <p className="text-[10px] text-text-disabled leading-tight mt-1 mb-1">
            Solo eq. C.1 (juntas ordinarias). C.2/C.3, llagas a hueso y
            tendeles huecos no incluidos en esta versión.
          </p>
        </>
      ) : (
        <>
          <NumField
            label="fk"
            sub="característica"
            help={HELP.fkDirecto}
            value={state.fk_custom}
            quantity="stress"
            onChange={(v) => set('fk_custom', v, setState)}
          />
          <NumField
            label="γ"
            sub="peso específico"
            help={HELP.gammaFab}
            value={state.gamma_custom}
            quantity="weightDensity"
            onChange={setGammaCustom}
          />
        </>
      )}
    </>
  );
}

// Helper local para fk_custom — evita capturar `set` del componente padre.
function set<K extends keyof MasonryWallState>(
  k: K,
  v: MasonryWallState[K],
  setState: React.Dispatch<React.SetStateAction<MasonryWallState>>,
) {
  setState((s) => ({ ...s, [k]: v }));
}

interface Props {
  state: MasonryWallState;
  setState: React.Dispatch<React.SetStateAction<MasonryWallState>>;
  selectedPlantaIdx: number;
  selectedHueco: string | null;
  setSelectedHueco: (id: string | null) => void;
  setSelectedPlantaIdx: (i: number) => void;
  plantasCalc: PlantaResult[];
  onAddPlanta: () => void;
  onDuplicatePlanta: (i: number) => void;
  onRemovePlanta: (i: number) => void;
  onAddHueco: (plIdx: number, tipo: HuecoTipo) => void;
  onRemoveHueco: (plIdx: number, id: string) => void;
  onAddPuntual: (plIdx: number) => void;
  onRemovePuntual: (plIdx: number, id: string) => void;
}

export function MasonryWallsInputs({
  state, setState,
  selectedPlantaIdx, selectedHueco,
  setSelectedHueco, setSelectedPlantaIdx,
  plantasCalc,
  onAddPlanta, onDuplicatePlanta, onRemovePlanta,
  onAddHueco, onRemoveHueco,
  onAddPuntual, onRemovePuntual,
}: Props) {
  const { system } = useUnitSystem();
  const set = <K extends keyof MasonryWallState>(k: K, v: MasonryWallState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  // Al cambiar H hay que re-sincronizar los huecos pasantes: su alto ES la
  // altura libre de la planta. El cálculo lo deriva igualmente (`huecoGeom`),
  // pero el state que se guarda y se comparte debe quedar coherente.
  const setPlanta = <K extends keyof MasonryWallState['plantas'][number]>(
    idx: number, k: K, v: MasonryWallState['plantas'][number][K],
  ) => setState((s) => ({
    ...s,
    plantas: s.plantas.map((p, i) =>
      i === idx ? sincronizarHuecosPasantes({ ...p, [k]: v }) : p,
    ),
  }));

  const setHueco = <K extends keyof Hueco>(
    plIdx: number, id: string, k: K, v: Hueco[K],
  ) => setState((s) => ({
    ...s,
    plantas: s.plantas.map((p, i) =>
      i === plIdx
        ? sincronizarHuecosPasantes({
            ...p,
            huecos: p.huecos.map((h) => (h.id === id ? { ...h, [k]: v } : h)),
          })
        : p,
    ),
  }));

  const setPuntual = <K extends keyof Puntual>(
    plIdx: number, id: string, k: K, v: Puntual[K],
  ) => setState((s) => ({
    ...s,
    plantas: s.plantas.map((p, i) =>
      i === plIdx
        ? { ...p, puntuales: p.puntuales.map((q) => (q.id === id ? { ...q, [k]: v } : q)) }
        : p,
    ),
  }));

  const fab = resolverFabrica(state);
  const plantaSel = state.plantas[selectedPlantaIdx];
  const plantaCalcSel = plantasCalc[selectedPlantaIdx];
  // Los desplegables se filtran por PIEZA, no por FM_PARA_FB (que ignora la
  // pieza y ofrece celdas nulas de Tabla 4.4: con "junta delgada" no existe
  // fb=5, y elegirlo tumbaba el módulo a "Datos no válidos").
  const fbDisponibles = fbValidosPara(state.pieza);
  const fmDisponibles = fmValidosPara(state.pieza, state.fb);

  // Método fk unificado: 3 opciones excluyentes en un solo selector (antes
  // eran dos toggles anidados — Tabla/Personalizada y Anejo C/fk directo —
  // que enterraban el tercer modo un nivel por debajo).
  const fkMethod: FkMethod = state.fabricaModo === 'tabla' ? 'tabla' : state.customMethod;
  const setFkMethod = (m: FkMethod) => setState((s) =>
    m === 'tabla'
      ? { ...s, fabricaModo: 'tabla' }
      : { ...s, fabricaModo: 'custom', customMethod: m });

  return (
    <div className="px-4 py-3 min-w-0">
      {/* El aviso "¿Quieres ver un caso de ejemplo?" vive sobre el lienzo en
          MasonryWallsModule — no se duplica aquí. */}
      {/* Fábrica — método fk + datos del material + γM + resultado fk/f_d.
          refNorma dinámica según el modo activo — la sección "miente" si
          dice "Tabla 4.4" cuando estamos en Anejo C. */}
      <CollapsibleSection
        label="Fábrica"
        refNorma={
          fkMethod === 'tabla'
            ? '§4.6 · Tabla 4.4'
            : fkMethod === 'anejoC'
              ? '§4.6 · Anejo C eq. C.1'
              : '§4.6 · fk directo'
        }
      >
        <div className="flex gap-1 mb-1">
          {(['tabla', 'anejoC', 'manual'] as const).map((m) => {
            const active = fkMethod === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setFkMethod(m)}
                className="flex-1 text-[11px] py-1 rounded font-mono cursor-pointer border transition-colors"
                style={{
                  color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  background: active ? 'var(--color-tint-accent)' : 'transparent',
                  borderColor: active ? 'var(--color-accent)' : 'var(--color-border-main)',
                }}
                aria-pressed={active}
              >
                {FK_METHOD_LABEL[m]}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] font-mono text-text-disabled leading-tight mb-2">
          {FK_METHOD_CAPTION[fkMethod]}
        </p>

        {state.fabricaModo === 'tabla' ? (
          <>
            <SelField
              stacked
              label="Pieza"
              help={HELP.pieza}
              value={state.pieza}
              onChange={(v) => setState((s) => ({ ...s, ...piezaPatch(s, v as MasonryWallState['pieza']) }))}
              options={Object.entries(TABLA_4_4).map(([k, v]) => ({ value: k as MasonryWallState['pieza'], label: v.label }))}
            />
            <SelField
              label="fb"
              sub="resist. pieza"
              help={HELP.fb}
              value={state.fb}
              onChange={(v) => setState((s) => ({ ...s, ...fbPatch(s, Number(v)) }))}
              options={fbDisponibles.map((v) => ({ value: v, label: `${v} N/mm²` }))}
            />
            <SelField
              label="fm"
              sub="resist. mortero"
              help={HELP.fm}
              value={state.fm}
              onChange={(v) => set('fm', Number(v))}
              options={fmDisponibles.map((v) => ({ value: v, label: `${v} N/mm²` }))}
            />
          </>
        ) : (
          <CustomFabricaBlock state={state} setState={setState} />
        )}
        {/* γM selector según CTE Tabla 4.8 — categoría de control × clase de
            ejecución. La UI detecta si el γM actual coincide con una celda y
            preselecciona; si el usuario teclea un valor distinto, modo "Pers."
            queda activo y se preserva el valor exacto. */}
        {(() => {
          const cell = findGammaMCell(state.gamma_M);
          const isCustom = cell == null;
          return (
            <>
              <SubGroup label="Seguridad del material" />
              <SelField<string>
                stacked
                label="Control · ejecución"
                help={HELP.gammaMSel}
                value={isCustom ? 'custom' : `${cell.cat}-${cell.ejec}`}
                onChange={(v) => {
                  if (v === 'custom') return; // user has to type a number to enter custom mode
                  const [c, e] = (v as string).split('-') as [CategoriaControl, ClaseEjecucion];
                  set('gamma_M', lookupGammaM(c, e));
                }}
                options={[
                  ...(['I', 'II', 'III'] as CategoriaControl[]).flatMap((c) =>
                    (['A', 'B'] as ClaseEjecucion[]).map((e) => ({
                      value: `${c}-${e}`,
                      label: `Cat. ${c} · ejec. ${e} — γM ${GAMMA_M_TABLA[c][e]}`,
                    })),
                  ),
                  { value: 'custom', label: 'Personalizado…' },
                ]}
                refNorma="§4.6.7 · Tabla 4.8"
              />
              <NumField
                label="γM"
                sub={cell ? 'material · Tabla 4.8' : 'material · personalizado'}
                help={HELP.gammaM}
                value={state.gamma_M}
                unit=""
                onChange={(v) => set('gamma_M', v)}
              />
            </>
          );
        })()}

        <div className="rounded border border-border-main p-2 mt-2 mb-1 bg-bg-primary">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-text-disabled">
              fk
              {/* Discriminator: deja claro qué método produjo este fk. */}
              {fkMethod === 'tabla'
                ? ' · Tabla 4.4'
                : fkMethod === 'anejoC'
                  ? ' · Anejo C eq. C.1'
                  : ' · directo'}
            </span>
            {fab.fk ? (
              <span style={{ color: 'var(--color-text-primary)' }}>
                {formatQuantity(fab.fk, 'stress', system)}
              </span>
            ) : (
              // En modo Anejo C con fb/fm parciales o blank, el estado natural
              // es "pendiente" — text-disabled, no rojo. Rojo (state-fail)
              // queda reservado para Tabla 4.4 sin combinación válida.
              <span style={{
                color: fkMethod === 'anejoC'
                  ? 'var(--color-text-disabled)'
                  : 'var(--color-state-fail)',
              }}>
                {fkMethod === 'anejoC' ? 'fk pendiente' : 'no aplicable'}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-text-disabled">f_d = fk/γM</span>
            <span>{fab.fk ? formatQuantity(fab.fk / state.gamma_M, 'stress', system) : '—'}</span>
          </div>
        </div>
      </CollapsibleSection>

      {/* Geometría global del muro */}
      <CollapsibleSection label="Geometría del muro" refNorma="§5.2.4">
        <NumField label="L" sub="longitud" help={HELP.L} value={state.L} unit="m"  scale={0.001} decimals={2}
          onChange={(v) => set('L', v)} />
        <NumField label="t" sub="espesor"  help={HELP.t} value={state.t} unit="cm" scale={0.1}   decimals={1}
          onChange={(v) => set('t', v)} />
        <ReadoutRow
          label="e_min = max(0,05·t; 2 cm) · §5.2.3"
          value={`${(eMin(state.t) / 10).toFixed(1)} cm`}
        />
      </CollapsibleSection>

      {/* Coeficientes de mayoración ELU — colapsada por defecto: γG=1.35 y
          γQ=1.5 son los valores de norma y casi nunca se tocan. El recordatorio
          "cargas sin mayorar" vive junto a los campos de carga del forjado. */}
      <CollapsibleSection label="Mayoración · ELU" refNorma="DB-SE §4.2.4" defaultOpen={false}>
        <p className="text-[10px] text-text-disabled leading-snug font-mono mb-1">
          q<sub>d</sub> = γ<sub>G</sub>·G<sub>k</sub> + γ<sub>Q</sub>·Q<sub>k</sub> — las cargas se introducen sin mayorar.
        </p>
        <NumField label="γG" sub="permanentes" help={HELP.gammaG} value={state.gamma_G} unit="" onChange={(v) => set('gamma_G', v)} />
        <NumField label="γQ" sub="variables"   help={HELP.gammaQ} value={state.gamma_Q} unit="" onChange={(v) => set('gamma_Q', v)} />
      </CollapsibleSection>

      {/* Plantas list + CRUD */}
      <CollapsibleSection label="Plantas del edificio" refNorma="§5.2">
        <div className="flex flex-col gap-1">
          {state.plantas.map((pl, i) => {
            // Cuando el state es inválido (t=0, fk=null, etc.) plantasCalc
            // es []. Sin guard, plantasCalc[i] es undefined y .machones peta.
            const cs = plantasCalc[i];
            const eMax = cs ? Math.max(...cs.machones.map((m) => m.etaMax)) : 0;
            const stCol = !cs
              ? 'var(--color-text-disabled)'
              : eMax >= 1 ? 'var(--color-state-fail)' : eMax >= WARN_UTIL ? 'var(--color-state-warn)' : 'var(--color-state-ok)';
            const isSel = selectedPlantaIdx === i;
            return (
              <div key={pl.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setSelectedPlantaIdx(i); setSelectedHueco(null); }}
                  className="flex-1 flex items-center justify-between rounded px-2 py-1.5 text-[11px] cursor-pointer border transition-colors"
                  style={{
                    background: isSel ? 'var(--color-tint-accent)' : 'transparent',
                    borderColor: isSel ? 'var(--color-accent)' : 'var(--color-border-main)',
                  }}
                >
                  <span className="font-mono" style={{ color: isSel ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                    {pl.nombre}
                  </span>
                  <span className="font-mono tabular-nums" style={{ color: stCol }}>
                    {cs ? `${(eMax * 100).toFixed(0)}%` : '—'}
                  </span>
                </button>
                {state.plantas.length > 1 && i !== 0 && (
                  // Planta 1 (idx=0) nunca se borra: representa el muro
                  // apoyado en la cimentación y es el suelo mínimo del modelo.
                  <MiniBtn variant="danger" onClick={() => onRemovePlanta(i)} title="Eliminar planta">×</MiniBtn>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onAddPlanta}
          className="w-full mt-2 text-[11px] font-mono py-1.5 rounded border border-dashed border-border-main text-text-disabled hover:border-accent hover:text-accent cursor-pointer transition-colors"
        >
          + Añadir planta
        </button>
        {/* Duplicar: la planta nueva de arriba nace vacía; esta copia los datos
            de la planta SELECCIONADA (cargas, apoyo, altura y huecos). Se
            nombra la planta origen en la propia etiqueta para que no haya duda
            de qué se va a copiar — el botón actúa sobre la selección, no sobre
            una fila concreta de la lista. Botón completo en lugar de un icono
            por fila: la lista de plantas es estrecha y ya lleva la utilización
            y la papelera. */}
        {plantaSel && (
          <button
            type="button"
            onClick={() => onDuplicatePlanta(selectedPlantaIdx)}
            title={`Crea una planta nueva con los mismos datos que ${plantaSel.nombre} (cargas, geometría, apoyo, huecos y cargas puntuales) y la inserta justo encima`}
            className="w-full mt-1.5 text-[11px] font-mono py-1.5 px-2 rounded border border-dashed border-border-main text-text-disabled hover:border-accent hover:text-accent cursor-pointer transition-colors flex items-center justify-center gap-1.5 min-w-0"
          >
            <Copy size={12} aria-hidden="true" className="shrink-0" />
            <span className="truncate">Duplicar {plantaSel.nombre}</span>
          </button>
        )}
      </CollapsibleSection>

      {plantaSel && (
        <>
          <CollapsibleSection label={`Forjado · ${plantaSel.nombre}`} refNorma="§5.2.3">
            <NumField label="H"   sub="altura libre"  help={HELP.H}  value={plantaSel.H}       unit="m"    scale={0.001} decimals={2}
              onChange={(v) => setPlanta(selectedPlantaIdx, 'H', v)} />
            <SubGroup label="Cargas del forjado" note="Valores característicos, sin mayorar." />
            <NumField label="q_G" sub="permanente Gk" help={HELP.qG} value={plantaSel.q_G}     quantity="linearLoad"
              onChange={(v) => setPlanta(selectedPlantaIdx, 'q_G', v)} />
            <NumField label="q_Q" sub="variable Qk"   help={HELP.qQ} value={plantaSel.q_Q}     quantity="linearLoad"
              onChange={(v) => setPlanta(selectedPlantaIdx, 'q_Q', v)} />
            <SubGroup label="Apoyo en el muro" />
            <NumField label="a"   sub="entrega del forjado" help={HELP.a}  value={plantaSel.a_apoyo} unit="cm"   scale={0.1}   decimals={1}
              onChange={(v) => setPlanta(selectedPlantaIdx, 'a_apoyo', v)} />
            {/* Excentricidad del apoyo: auto (t/2 − a/3) ⇄ manual, con croquis.
                key= resetea el forceManual del toggle al cambiar de planta.
                Renombrada de "e_a" a "e_apoyo": e_a en resultados/PDF es la
                excentricidad ACCIDENTAL h_ef/450 — eran dos cosas distintas
                con el mismo nombre en pantalla. El detalle del reparto
                triangular vive en el tooltip de `a` y de `e_apoyo`. */}
            <EApoyoField key={plantaSel.id} t={state.t} e_apoyo={plantaSel.e_apoyo} a_apoyo={plantaSel.a_apoyo}
              onChange={(v) => setPlanta(selectedPlantaIdx, 'e_apoyo', v)} />
            {plantaCalcSel && (
              <div className="rounded border border-border-main p-2 mt-2 mb-1 bg-bg-primary">
                <ReadoutRow label={<>q<sub>d</sub> · carga mayorada</>}
                  value={formatQuantity(state.gamma_G * (plantaSel.q_G || 0) + state.gamma_Q * (plantaSel.q_Q || 0), 'linearLoad', system)} />
                <ReadoutRow label="k · reparto cabeza/pie" value={plantaCalcSel.k_reparto.toFixed(2)} />
                <ReadoutRow label="e_cabeza" value={`${(plantaCalcSel.e_cabeza / 10).toFixed(1)} cm`} />
                <ReadoutRow label="e_pie" value={`${(plantaCalcSel.e_pie / 10).toFixed(1)} cm`} />
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection label="Cargas puntuales" refNorma="§5.4">
            {plantaSel.puntuales.length === 0 && (
              <div className="text-[11px] text-text-disabled py-1">Sin cargas puntuales en esta planta.</div>
            )}
            {plantaSel.puntuales.map((p, i) => (
              <div key={p.id} className="border-l border-border-main pl-2 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-text-disabled">Carga {i + 1}</span>
                  <MiniBtn variant="danger" onClick={() => onRemovePuntual(selectedPlantaIdx, p.id)}>eliminar</MiniBtn>
                </div>
                <NumField label="x"   sub="posición"      help={HELP.px} value={p.x}       unit="m"  scale={0.001} decimals={2}
                  onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'x', v)} />
                <NumField label="P_G" sub="permanente Gk" help={HELP.pG} value={p.P_G}     quantity="force"
                  onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'P_G', v)} />
                <NumField label="P_Q" sub="variable Qk"   help={HELP.pQ} value={p.P_Q}     quantity="force"
                  onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'P_Q', v)} />
                <NumField label="b"   sub="ancho de apoyo" help={HELP.pb} value={p.b_apoyo} unit="cm" scale={0.1}   decimals={1}
                  onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'b_apoyo', v)} />
                <ReadoutRow label={<>P<sub>d</sub> · carga mayorada</>}
                  value={formatQuantity(state.gamma_G * (p.P_G || 0) + state.gamma_Q * (p.P_Q || 0), 'force', system)} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => onAddPuntual(selectedPlantaIdx)}
              className="w-full mt-1 text-[11px] font-mono py-1.5 rounded border border-dashed border-border-main text-text-disabled hover:border-accent hover:text-accent cursor-pointer transition-colors"
            >
              + Añadir carga
            </button>
          </CollapsibleSection>

          <CollapsibleSection label="Huecos">
            {plantaSel.huecos.length === 0 && (
              <div className="text-[11px] text-text-disabled py-1">Sin huecos en esta planta.</div>
            )}
            {/* Warning si dos huecos se solapan: el motor mergea su unión en
                un solo intervalo, así que el cálculo es estable, pero el
                usuario no se da cuenta de que su modelo es ambiguo. */}
            {(() => {
              const pares = detectarHuecosSolapados(plantaSel.huecos);
              if (pares.length === 0) return null;
              const nombre = (id: string) => nombreHueco(plantaSel.huecos, id);
              return (
                <div className="rounded border border-state-warn/60 bg-state-warn/5 px-2 py-1.5 mb-2 text-[10px] font-mono text-state-warn leading-tight flex gap-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" aria-hidden="true">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    Huecos solapados (el motor calcula su unión como un único hueco):
                    <ul className="mt-1 ml-3 list-disc">
                      {pares.map((p, i) => (
                        <li key={i}>{nombre(p.a)} ↔ {nombre(p.b)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })()}
            {plantaSel.huecos.map((h) => {
              const sel = selectedHueco === h.id;
              return (
                <div key={h.id} className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <button
                      type="button"
                      onClick={() => setSelectedHueco(sel ? null : h.id)}
                      className="text-[10px] font-mono cursor-pointer"
                      style={{ color: sel ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
                    >
                      {h.tipo === 'puerta' ? '▮' : h.tipo === 'pasante' ? '▯' : '◫'} {nombreHueco(plantaSel.huecos, h.id)}
                    </button>
                    <MiniBtn variant="danger" onClick={() => onRemoveHueco(selectedPlantaIdx, h.id)}>eliminar</MiniBtn>
                  </div>
                  {sel && (
                    <div className="border-l border-accent pl-2">
                      <SelField
                        label="Tipo"
                        help={HELP.hTipo}
                        value={h.tipo}
                        onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'tipo', v as HuecoTipo)}
                        options={[
                          { value: 'ventana', label: 'Ventana' },
                          { value: 'puerta', label: 'Puerta' },
                          { value: 'pasante', label: 'Pasante' },
                        ]}
                      />
                      <NumField label="x" sub="posición" help={HELP.hx} value={h.x} unit="m" scale={0.001} decimals={2}
                        onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'x', v)} />
                      {h.tipo === 'ventana' && (
                        <NumField label="y" sub="alféizar" help={HELP.hy} value={h.y} unit="m" scale={0.001} decimals={2}
                          // El alféizar nunca puede salirse de la planta: y se
                          // limita superiormente a H - h para que el hueco
                          // siempre quede dentro del muro.
                          onChange={(v) => setHueco(
                            selectedPlantaIdx, h.id, 'y',
                            Math.max(0, Math.min(v, plantaSel.H - h.h)),
                          )} />
                      )}
                      <NumField label="w" sub="ancho" help={HELP.hw} value={h.w} unit="m" scale={0.001} decimals={2}
                        onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'w', v)} />
                      {/* El pasante NO tiene alto editable: por definición vale
                          la altura libre de la planta. Un campo con el valor
                          copiado se quedaría obsoleto en cuanto se tocara H y
                          reaparecería como una franja de fábrica sobre el
                          dintel que en la obra no existe. */}
                      {h.tipo === 'pasante' ? (
                        <>
                          <ReadoutRow label="h · alto = H de la planta"
                            value={`${(plantaSel.H / 10).toFixed(1)} cm`} />
                          <p className="text-[9px] text-text-disabled mt-1 leading-tight">
                            De forjado a forjado: sin fábrica sobre el dintel (g_muro = 0).
                            El dintel sigue salvando el hueco y descargando en los machones.
                          </p>
                        </>
                      ) : (
                        <>
                          <NumField
                            label="h"
                            sub={h.tipo === 'puerta' ? 'alto (hasta dintel)' : 'alto'}
                            help={HELP.hh}
                            value={h.h}
                            unit="m"
                            scale={0.001}
                            decimals={2}
                            // Máximo = altura libre de la planta − alféizar (para
                            // puertas, alféizar=0 y el tope es H directamente).
                            // Evita huecos que se salen del muro, que confundirían
                            // al motor (h_muro_sobre = 0 silencioso) y al usuario.
                            onChange={(v) => setHueco(
                              selectedPlantaIdx, h.id, 'h',
                              Math.max(0, Math.min(v, plantaSel.H - h.y)),
                            )}
                          />
                          {/* Hint del límite superior — visible siempre para que el
                              "snap-back" cuando el usuario tipea por encima de H−y
                              no sorprenda. Consistente con el hint del muro sobre
                              la puerta de más abajo. */}
                          <ReadoutRow label="h máx = H − y" value={`${((plantaSel.H - h.y) / 10).toFixed(1)} cm`} />
                        </>
                      )}
                      {h.tipo === 'puerta' && plantaSel.H - h.h > 0 && (
                        <ReadoutRow label="muro sobre la puerta · cargado al dintel"
                          value={`${((plantaSel.H - h.h) / 10).toFixed(1)} cm`} />
                      )}
                      {/* Info del dintel */}
                      {(() => {
                        const d = plantaCalcSel?.dinteles.find((x) => x.id === h.id);
                        if (!d) return null;
                        return (
                          <div className="mt-2 rounded border border-state-warn/60 p-2 bg-state-warn/5">
                            <div className="text-[10px] font-mono text-state-warn mb-1 uppercase" style={{ letterSpacing: '0.08em' }}>
                              Dintel · luz {(d.luz / 1000).toFixed(2)} m
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-mono">
                              <span className="text-text-secondary">q_dintel</span>
                              <span className="text-right tabular-nums">{formatQuantity(d.q_dintel, 'linearLoad', system)}</span>
                              <span className="text-text-secondary">g_muro_sobre</span>
                              <span className="text-right tabular-nums">{formatQuantity(d.g_propio, 'linearLoad', system)}</span>
                              <span className="text-text-secondary">h_muro_sobre</span>
                              <span className="text-right tabular-nums">{(d.h_muro_sobre / 10).toFixed(1)} cm</span>
                              <span className="text-text-secondary">M_Ed</span>
                              <span className="text-right tabular-nums">{formatQuantity(d.M_Ed, 'moment', system)}</span>
                              <span className="text-text-secondary">V_Ed</span>
                              <span className="text-right tabular-nums">{formatQuantity(d.V_Ed, 'force', system)}</span>
                              <span className="text-text-secondary">R apoyo</span>
                              <span className="text-right tabular-nums" style={{ color: 'var(--color-state-warn)' }}>
                                {formatQuantity(d.R_apoyo, 'force', system)}
                              </span>
                            </div>
                            <p className="text-[9px] text-text-disabled mt-1.5 leading-tight">
                              Reacciones aplicadas a los machones adyacentes
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Tres botones en un panel de 288 px: texto a 10px y padding
                horizontal mínimo para que "+ Pasante" no se parta en dos
                líneas. El title= repite el matiz del tooltip del selector. */}
            <div className="flex gap-1 mt-1">
              {([
                ['ventana', '+ Ventana', 'Hueco con alféizar y alto libres'],
                ['puerta', '+ Puerta', 'Desde el suelo, con muro sobre el dintel'],
                ['pasante', '+ Pasante', 'De forjado a forjado: ocupa toda la altura libre de la planta'],
              ] as const).map(([tipo, label, title]) => (
                <button
                  key={tipo}
                  type="button"
                  title={title}
                  onClick={() => onAddHueco(selectedPlantaIdx, tipo)}
                  className="flex-1 min-w-0 text-[10px] font-mono py-1.5 px-0.5 rounded border border-dashed border-border-main text-text-disabled hover:border-accent hover:text-accent cursor-pointer transition-colors whitespace-nowrap"
                >
                  {label}
                </button>
              ))}
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
