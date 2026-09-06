// Panel de entrada del módulo de sismo.
//
// ─────────────────────────────────────────────────────────────────────────────
// EN CADA GRUPO: PRIMERO LO QUE SE DECIDE, DESPUÉS LO QUE SE DEDUCE
// ─────────────────────────────────────────────────────────────────────────────
// La primera versión del mockup intercalaba los tres datos que el usuario
// introduce de verdad con seis valores calculados, sin nada que los
// distinguiera. El panel se leía como nueve preguntas, y la reacción del autor
// fue literalmente "es bastante lioso".
//
// De ahí la regla: cada bloque enseña primero sus campos editables y luego, tras
// un separador "se deduce", los derivados en sólo-lectura y con su procedencia a
// la vista (`ρ · importancia normal`, `C · terreno II`, `ac · S·ρ·ab`).
//
// Caso particular que conviene no deshacer: `T_A` y `T_B` NO son decisiones y
// tampoco son simétricos. `T_B` decide la expresión de las fuerzas (por debajo
// α = 2,5; por encima α = 2,5·T_B/T). `T_A` no interviene en las fuerzas en
// absoluto: es la esquina del espectro ELÁSTICO del art. 2.3, y por debajo de
// ella es donde las dos curvas se separan. Por eso salen como derivados y las
// zonas de α se rotulan sobre la propia gráfica, no aquí.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Layers, Ruler } from 'lucide-react';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import { InputLabel } from '../../components/ui/InputLabel';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { Num, NumIn, SELECT_CLS, UNIT_CLS } from './campos';
import { dec, fuerza, unidadFuerza } from './formato';
import type {
  Importancia,
  SistemaEstructural,
  TipoTerreno,
} from '../../lib/codes/seismic/types';
import {
  MENSAJE_NO_ENCONTRADO,
  buscarMunicipios,
  textoProcedencia,
  type Municipio,
} from './hazard';
import {
  pesoSismicoTotal,
  plantasSobreRasante,
  plantasTotales,
  type SeismicEvaluation,
  type SeismicState,
} from './state';

export interface SeismicInputsProps {
  state: SeismicState;
  setState: (fn: (s: SeismicState) => SeismicState) => void;
  evaluacion: SeismicEvaluation;
  /**
   * Abre el cuadro de plantas y cargas, que lo monta el módulo junto al resto
   * de modales. Aquí sólo queda el resumen y la puerta: ver PlantasModal.tsx.
   */
  onEditPlantas: () => void;
  /** Ídem para la geometría en planta: ver GeometriaModal.tsx. */
  onEditGeometria: () => void;
}

// ── Textos de ayuda ──────────────────────────────────────────────────────────
//
// Cada campo del panel lleva su ⓘ (HelpTooltip, el mecanismo por defecto de
// DESIGN.md): quien abre el módulo por primera vez no tiene por qué saber qué
// es `ab` o `K`, y la sigla sola convierte el panel en un examen. Los textos de
// `ab` y `K` viven aquí como constantes porque se usan DOS veces: en los campos
// manuales (sin municipio del Anejo 1) y en los derivados (con municipio) — y
// dos redacciones distintas de la misma magnitud sería exactamente el tipo de
// deriva que un catálogo evita.

const AYUDA_AB =
  'Aceleración sísmica básica del emplazamiento, en fracción de g: el punto de partida de todo el cálculo. La fija el Anejo 1 de la NCSE-02 (o un estudio propio). Por debajo de 0,04 g la Norma no es de aplicación obligatoria.';
const AYUDA_K =
  'Coeficiente de contribución del Anejo 1: recoge cuánto pesan los terremotos lejanos (falla Azores–Gibraltar) en la peligrosidad del municipio. Vale 1,0 en casi toda España; llega a 1,3 en el sur y sureste peninsular (y a 1,4 en un único municipio).';

// ── Piezas ───────────────────────────────────────────────────────────────────

function Sel<T extends string>({
  label,
  sub,
  help,
  value,
  options,
  onChange,
}: {
  label: string;
  sub?: string;
  help?: string;
  value: T;
  options: { v: T; t: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel htmlFor={id} label={label} sub={sub} help={help} />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${SELECT_CLS} max-w-40 shrink-0`}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.t}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Separador que parte cada bloque en "lo que decides" y "lo que sale solo". */
function SeDeduce() {
  return (
    <div className="flex items-center gap-2 pt-2.5 pb-1.5" aria-hidden="true">
      <div className="h-px flex-1 bg-border-sub" />
      <span className="text-[9px] uppercase tracking-[0.09em] text-text-disabled">se deduce</span>
      <div className="h-px flex-1 bg-border-sub" />
    </div>
  );
}

/**
 * Valor calculado. Borde discontinuo (la convención de sólo-lectura de
 * Concreta) y la procedencia a la vista, para que nadie lo confunda con un
 * campo que haya que rellenar.
 */
function Derivado({
  label,
  origen,
  valor,
  unit,
  help,
}: {
  label: string;
  origen: string;
  valor: string;
  unit?: string;
  help?: string;
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <div className="min-w-0">
        {/* El ⓘ también en los derivados: `ab`, `K` o `β` son justo las siglas
            que el usuario nuevo no conoce, y con municipio elegido SOLO
            aparecen aquí. */}
        <span className="flex items-center gap-1 min-w-0">
          <span className="text-[12px] text-text-secondary truncate">{label}</span>
          {help ? <HelpTooltip text={help} fieldLabel={label} /> : null}
        </span>
        <div className="text-[10px] text-text-disabled truncate font-mono">{origen}</div>
      </div>
      <div className="flex shrink-0">
        <span
          className={
            'w-15 text-right bg-transparent border border-dashed border-border-main ' +
            'rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary'
          }
        >
          {valor}
        </span>
        <span className={UNIT_CLS}>{unit ?? ''}</span>
      </div>
    </div>
  );
}

/** Sí / No / sin contestar. El tercer estado NO es cosmético: ver abajo. */
function Declaracion({
  label,
  sub,
  help,
  value,
  onChange,
}: {
  label: string;
  sub?: string;
  help?: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  // El nombre accesible lleva el requisito: tres botones rotulados «Sí», «No» y
  // «—» repetidos cinco veces no se distinguen entre sí fuera de su contexto
  // visual, y la lista de controles de un lector de pantalla es exactamente eso.
  const btn = (v: boolean | null, t: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      aria-label={`${label}: ${v === null ? 'sin contestar' : t}`}
      className={[
        'px-2 py-1 text-[11px] rounded border transition-colors cursor-pointer',
        value === v
          ? 'border-accent text-text-primary bg-bg-elevated'
          : 'border-border-main text-text-disabled hover:border-accent/40',
      ].join(' ')}
    >
      {t}
    </button>
  );
  return (
    <div className="flex items-start justify-between py-1 gap-2">
      <div className="min-w-0 pt-0.5">
        {/* Wrapper en <span> a propósito: el test de integración localiza la
            fila con closest('div.flex.items-start') y un div flex interior se
            la robaría. */}
        <span className="flex items-center gap-1">
          <span className="text-[12px] text-text-secondary">{label}</span>
          {help ? <HelpTooltip text={help} fieldLabel={label} /> : null}
        </span>
        {sub ? <div className="text-[10px] text-text-disabled">{sub}</div> : null}
      </div>
      <div className="flex gap-1 shrink-0">
        {btn(true, 'Sí')}
        {btn(false, 'No')}
        {btn(null, '—')}
      </div>
    </div>
  );
}

// ── Buscador de municipios ───────────────────────────────────────────────────

function BuscadorMunicipio({
  state,
  setState,
}: {
  state: SeismicState;
  setState: SeismicInputsProps['setState'];
}) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<Municipio[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState(false);
  /** Opción resaltada por teclado. −1 = ninguna. */
  const [activo, setActivo] = useState(-1);
  const caja = useRef<HTMLDivElement>(null);
  const idLista = useId();

  useEffect(() => {
    if (!q.trim()) return;
    let vivo = true;
    // El dataset entra por `import()`: la primera pulsación dispara la carga y
    // las siguientes reutilizan la promesa memoizada. Todo el estado se toca
    // dentro de callbacks —nunca en el cuerpo del efecto— para no encadenar
    // renders por cada tecla.
    const t = setTimeout(() => {
      if (!vivo) return;
      setBuscando(true);
      buscarMunicipios(q, 12).then(
        (r) => {
          if (!vivo) return;
          setResultados(r);
          setActivo(-1);
          setFallo(false);
          setBuscando(false);
        },
        // Sin esta rama el fallo era una promesa rechazada sin dueño: `buscando`
        // se quedaba en true para siempre —lo que además SUPRIME el mensaje de
        // «no figura»—, y el usuario veía un buscador que no responde sin saber
        // por qué. `cargarHazard` suelta su memoización al fallar, así que
        // volver a teclear reintenta de verdad.
        () => {
          if (!vivo) return;
          setResultados([]);
          setActivo(-1);
          setFallo(true);
          setBuscando(false);
        },
      );
    }, 120);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q]);

  // Con la caja vacía no se enseña nada, y se deriva en render en vez de
  // limpiar el estado desde el efecto.
  const visibles = q.trim() ? resultados : [];

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const elegir = (m: Municipio) => {
    setState((s) => ({
      ...s,
      municipioIne: m.ine,
      municipioNombre: m.nombre,
      municipioProcedencia: m.procedencia,
      ab: m.ab,
      K: m.k,
    }));
    setQ('');
    setAbierto(false);
    setActivo(-1);
  };

  /**
   * Patrón combobox del teclado. Sin esto la lista sólo se podía usar con el
   * ratón: quien navega con teclado tabulaba desde la caja de búsqueda hasta el
   * siguiente campo sin poder llegar a ninguna de las opciones que acababa de
   * pedir.
   */
  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setAbierto(false);
      setActivo(-1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (visibles.length === 0) return;
      e.preventDefault(); // que no mueva el cursor dentro del texto
      setAbierto(true);
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      setActivo((i) => {
        const n = visibles.length;
        // Desde "ninguna", abajo lleva a la primera y arriba a la última.
        if (i < 0) return paso === 1 ? 0 : n - 1;
        return (i + paso + n) % n;
      });
      return;
    }
    if (e.key === 'Enter' && abierto && activo >= 0 && visibles[activo]) {
      e.preventDefault();
      elegir(visibles[activo]);
    }
  };

  /**
   * Suelta el municipio y deja ab y K editables. Es la salida para los dos
   * casos que el Anejo 1 no puede resolver por nombre: un municipio creado
   * después de 2002 que la tabla de suplemento todavía no cubra, y cualquier
   * emplazamiento cuya peligrosidad venga de un estudio propio. Sin esto, un
   * "no figura" deja al usuario sin ninguna forma de seguir.
   */
  const pasarAManual = () => {
    setState((s) => ({ ...s, municipioIne: null, municipioNombre: '', municipioProcedencia: null }));
    setQ('');
    setAbierto(false);
  };

  const sinResultados =
    abierto && q.trim().length >= 2 && !buscando && !fallo && visibles.length === 0;

  return (
    <div className="py-0.75" ref={caja}>
      {/* El ⓘ va FUERA del <label>: dentro, pulsarlo llevaría el foco al campo
          de búsqueda en vez de abrir la ayuda. */}
      <span className="flex items-center gap-1 mb-1">
        <label className="text-[12px] text-text-secondary" htmlFor="sismo-municipio">
          Municipio
          <span className="text-[10px] text-text-disabled font-mono ml-1.5">Anejo 1</span>
        </label>
        <HelpTooltip
          text="Municipio del emplazamiento de la obra. De él salen ab y K según el Anejo 1 de la NCSE-02. Si no figura —municipio creado después de 2002, o peligrosidad de un estudio propio—, introduce ab y K a mano."
          fieldLabel="Municipio"
        />
      </span>
      <input
        id="sismo-municipio"
        type="text"
        value={q}
        placeholder={state.municipioNombre || 'Buscar municipio…'}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={teclas}
        role="combobox"
        aria-expanded={abierto && visibles.length > 0}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        {...(activo >= 0 && visibles[activo]
          ? { 'aria-activedescendant': `${idLista}-${activo}` }
          : {})}
        className={
          'w-full bg-bg-primary border border-border-main rounded px-2 py-1.5 text-[12px] ' +
          'text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors'
        }
      />
      {state.municipioIne && !q ? (
        <>
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <span className="text-[10px] text-text-disabled font-mono truncate">
              {state.municipioNombre} · INE {state.municipioIne}
            </span>
            <button
              type="button"
              onClick={pasarAManual}
              className="text-[10px] text-text-disabled hover:text-accent transition-colors cursor-pointer shrink-0"
            >
              introducir a mano
            </button>
          </div>
          {/*
            Un municipio creado después de 2002 no está en el Anejo 1 y hereda
            de aquel del que se segregó. Es exacto —la Norma clasificó ese mismo
            territorio bajo el término de origen— pero NO es lo que dice la
            Norma con este nombre, y quien firma tiene que verlo aquí y en el
            PDF, no descubrirlo cuando se lo pregunten.
          */}
          {state.municipioProcedencia ? (
            <p className="mt-1 text-[10px] leading-snug text-state-warn">
              {textoProcedencia(state.municipioProcedencia)}.
            </p>
          ) : null}
        </>
      ) : null}
      {!state.municipioIne && !q ? (
        <div className="text-[10px] text-state-warn font-mono mt-1">
          ab y K introducidos a mano · sin municipio del Anejo 1
        </div>
      ) : null}

      {/*
        Cada opción enseña su PROVINCIA. Hay homónimos con peligrosidades muy
        distintas —los dos «Torrent», Girona 0,05 g y Valencia 0,07 g— y sin
        ella el desplegable ofrecía dos filas idénticas: elegir la que no era
        rebaja el cortante basal un 30 % sin que nada lo delate.
      */}
      <ul
        id={idLista}
        role="listbox"
        aria-label="Resultados de la búsqueda"
        className={
          abierto && visibles.length > 0
            ? 'mt-1 max-h-56 overflow-y-auto scroll-hide border border-border-main rounded bg-bg-elevated'
            : 'hidden'
        }
      >
        {visibles.map((m, i) => (
          <li
            key={m.ine}
            id={`${idLista}-${i}`}
            role="option"
            aria-selected={i === activo}
            onClick={() => elegir(m)}
            onMouseEnter={() => setActivo(i)}
            className={[
              'px-2 py-1.5 cursor-pointer transition-colors',
              i === activo ? 'bg-bg-primary' : 'hover:bg-bg-primary',
            ].join(' ')}
          >
            <span className="text-[12px] text-text-primary">{m.nombre}</span>
            <span className="text-[10px] text-text-disabled font-mono float-right">
              ab {dec(m.ab, 2)} · K {dec(m.k, 1)}
            </span>
            {/* Ceuta, Melilla y las capitales se llaman como su provincia: repetirlo sobra. */}
            {m.provincia && m.provincia !== m.nombre ? (
              <div className="text-[10px] text-text-disabled">{m.provincia}</div>
            ) : null}
          </li>
        ))}
      </ul>

      {/*
        Lo que pasa mientras tanto, dicho en voz alta. `role="status"` lo anuncia
        sin robar el foco, que es lo que hace falta en un buscador: quien no ve
        la lista necesita enterarse de que hay ocho resultados, o de que la tabla
        no ha cargado.
      */}
      <div className="sr-only" role="status" aria-live="polite">
        {fallo
          ? 'No se han podido cargar los municipios.'
          : buscando
            ? 'Buscando…'
            : visibles.length > 0
              ? `${visibles.length} municipio${visibles.length === 1 ? '' : 's'} encontrado${visibles.length === 1 ? '' : 's'}`
              : ''}
      </div>

      {/*
        El fallo de carga NO se puede confundir con «no figura en el Anejo 1»,
        que en esta pantalla significa que la Norma no obliga. Por eso tiene
        mensaje propio y precede al otro.
      */}
      {fallo ? (
        <p className="mt-1.5 text-[10px] leading-snug text-state-fail">
          No se ha podido cargar la tabla del Anejo 1. Esto <strong>no</strong> significa que el
          municipio no figure: vuelve a teclear para reintentar, o introduce ab y K a mano.
        </p>
      ) : null}

      {sinResultados ? (
        // El dataset lleva SOLO el Anejo 1, así que "no encontrado" tiene tres
        // causas y ninguna se puede dar por supuesta: ver MENSAJE_NO_ENCONTRADO.
        // El botón es la salida, y sin él el mensaje sería un callejón.
        <div className="mt-1.5">
          <p className="text-[10px] leading-snug text-state-warn">{MENSAJE_NO_ENCONTRADO}</p>
          <button
            type="button"
            onClick={pasarAManual}
            className={
              'mt-1.5 text-[10px] px-1.5 py-1 rounded border border-border-main ' +
              'text-text-secondary hover:border-accent/40 hover:text-text-primary ' +
              'transition-colors cursor-pointer'
            }
          >
            Introducir ab y K a mano
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

const SISTEMAS: { v: SistemaEstructural; t: string }[] = [
  { v: 'porticos-ha', t: 'Pórticos de HA' },
  { v: 'porticos-ha-pantallas', t: 'Pórticos de HA con pantallas' },
  { v: 'porticos-acero', t: 'Pórticos de acero' },
  { v: 'acero-triangulado', t: 'Acero triangulado' },
  { v: 'fabrica', t: 'Muros de fábrica' },
  { v: 'mamposteria-seco', t: 'Mampostería en seco' },
  { v: 'adobe', t: 'Adobe' },
  { v: 'tapial', t: 'Tapial' },
  { v: 'otro', t: 'Otro' },
];

const f = (v: number | undefined, d = 2) => (v === undefined ? '—' : dec(v, d));

/**
 * Rótulo de procedencia de `ab` y `K` bajo "se deduce". Un municipio segregado
 * después de 2002 hereda de su término de origen, y llamar a eso "Anejo 1"
 * sería atribuir a la Norma un nombre de municipio que no contiene.
 */
function origenPeligrosidad(state: SeismicState): string {
  const p = state.municipioProcedencia;
  if (p?.tipo === 'segregado') return `${state.municipioNombre} · hereda de ${p.padre.nombre}`;
  return `${state.municipioNombre} · Anejo 1`;
}

export function SeismicInputs({
  state,
  setState,
  evaluacion,
  onEditPlantas,
  onEditGeometria,
}: SeismicInputsProps) {
  const e = evaluacion.emplazamiento;
  const r = evaluacion.resultado;
  // Sale de la tabla y no de `resultado`: un caso exento del art. 1.2.3 no tiene
  // resultado, y con él como única fuente el resumen decía «Σ P = 0 kN» para un
  // edificio con diez plantas de masa dentro.
  const sumaP = useMemo(() => pesoSismicoTotal(state), [state]);
  const { system } = useUnitSystem();

  return (
    <div className="space-y-1">
      <CollapsibleSection label="Emplazamiento" refNorma="art. 2.2 · 2.4">
        <BuscadorMunicipio state={state} setState={setState} />
        {/*
          Sin municipio del Anejo 1, `ab` y `K` dejan de ser derivados y pasan a
          ser DECISIONES del proyectista: por eso salen aquí arriba, entre lo que
          se decide, y no bajo el separador "se deduce". El estado ya lo preveía
          (`municipioIne: null` significa "metidos a mano"); lo que faltaba era
          la forma de introducirlos, sin la cual un municipio ausente del Anejo 1
          —Ceuta, Melilla, cualquier segregación posterior a 2002— dejaba el
          módulo inservible.
        */}
        {state.municipioIne === null ? (
          <>
            <Num
              label="ab"
              sub="aceleración básica"
              help={AYUDA_AB}
              value={state.ab}
              unit="g"
              min={0}
              onChange={(v) => setState((s) => ({ ...s, ab: v }))}
            />
            <Num
              label="K"
              sub="contribución"
              help={AYUDA_K}
              value={state.K}
              min={1}
              onChange={(v) => setState((s) => ({ ...s, K: v }))}
            />
          </>
        ) : null}
        <Sel<Importancia>
          label="Importancia"
          sub="art. 1.2.2"
          help="Clasificación del art. 1.2.2 según lo que arriesga el edificio en un sismo: moderada (la Norma no obliga), normal (viviendas, oficinas…) o especial (hospitales, bomberos, servicios esenciales). Decide el coeficiente de riesgo ρ."
          value={state.importancia}
          options={[
            { v: 'moderada', t: 'Moderada' },
            { v: 'normal', t: 'Normal' },
            { v: 'especial', t: 'Especial' },
          ]}
          onChange={(v) => setState((s) => ({ ...s, importancia: v }))}
        />
        <Sel<'tipo' | 'perfil'>
          label="Terreno"
          sub="art. 2.4"
          help="Cómo describir el terreno del emplazamiento: eligiendo directamente un tipo tabulado del art. 2.4, o introduciendo el perfil de estratos (C y espesor de cada uno), que se pondera en los 30 m superiores."
          value={state.terrenoModo}
          options={[
            { v: 'tipo', t: 'Tipo tabulado' },
            { v: 'perfil', t: 'Perfil de estratos' },
          ]}
          onChange={(v) => setState((s) => ({ ...s, terrenoModo: v }))}
        />
        {state.terrenoModo === 'tipo' ? (
          <Sel<TipoTerreno>
            label="Tipo"
            sub="I · II · III · IV"
            help="Clasificación del terreno del art. 2.4, de más rígido a más blando: I roca compacta, II roca fracturada o suelo muy denso, III suelo granular medio, IV suelo blando. Decide el coeficiente C: cuanto más blando, más amplifica."
            value={state.terreno}
            options={[
              { v: 'I', t: 'I · roca compacta' },
              { v: 'II', t: 'II · roca fracturada' },
              { v: 'III', t: 'III · suelo granular medio' },
              { v: 'IV', t: 'IV · suelo blando' },
            ]}
            onChange={(v) => setState((s) => ({ ...s, terreno: v }))}
          />
        ) : (
          <div className="space-y-1">
            <p className="text-[10px] leading-snug text-text-disabled">
              Se pondera en los 30 m superiores. Si el perfil no llega, el último estrato se
              prolonga — que es el lado seguro.
            </p>
            {state.estratos.map((es, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5">
                {/* El art. 2.4 tabula C entre 1,0 (roca compacta) y 2,0 (suelo blando). */}
                <NumIn
                  value={es.C}
                  min={1}
                  max={2}
                  etiqueta={`C del estrato ${i + 1}`}
                  onChange={(n) =>
                    setState((s) => ({
                      ...s,
                      estratos: s.estratos.map((y, m) => (m === i ? { ...y, C: n } : y)),
                    }))
                  }
                />
                <span className="text-[9px] text-text-disabled font-mono">C</span>
                <NumIn
                  value={es.espesor}
                  min={0}
                  etiqueta={`Espesor del estrato ${i + 1}`}
                  onChange={(n) =>
                    setState((s) => ({
                      ...s,
                      estratos: s.estratos.map((y, m) => (m === i ? { ...y, espesor: n } : y)),
                    }))
                  }
                />
                <span className="text-[9px] text-text-disabled font-mono">m</span>
                <button
                  type="button"
                  onClick={() =>
                    setState((s) => ({ ...s, estratos: s.estratos.filter((_, m) => m !== i) }))
                  }
                  className="text-[11px] text-text-disabled hover:text-state-fail cursor-pointer ml-auto"
                  aria-label={`Eliminar el estrato ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setState((s) => ({ ...s, estratos: [...s.estratos, { C: 1.3, espesor: 5 }] }))
              }
              className="mt-1 rounded border border-border-main bg-bg-elevated px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary cursor-pointer"
            >
              + Añadir estrato
            </button>
          </div>
        )}

        <SeDeduce />
        {state.municipioIne !== null ? (
          <>
            {/* Un valor heredado no puede rotularse "Anejo 1": no lo es. */}
            <Derivado
              label="ab"
              origen={origenPeligrosidad(state)}
              valor={f(state.ab)}
              unit="g"
              help={AYUDA_AB}
            />
            <Derivado
              label="K"
              origen={origenPeligrosidad(state)}
              valor={f(state.K, 1)}
              help={AYUDA_K}
            />
          </>
        ) : null}
        <Derivado
          label="ρ"
          origen={`importancia ${state.importancia}`}
          valor={f(e.rho, 1)}
          help="Coeficiente adimensional de riesgo (art. 2.2), según la importancia del edificio: 1,0 para importancia normal y 1,3 para especial. Multiplica a ab en la aceleración de cálculo."
        />
        <Derivado
          label="C"
          origen={state.terrenoModo === 'tipo' ? `terreno ${state.terreno}` : 'perfil ponderado'}
          valor={f(e.C)}
          help="Coeficiente del terreno (art. 2.4): de 1,0 (roca compacta) a 2,0 (suelo blando). Con perfil de estratos es la media ponderada de los 30 m superiores."
        />
        <Derivado
          label="S"
          origen="art. 2.2"
          valor={f(e.S, 3)}
          help="Coeficiente de amplificación del terreno (art. 2.2). Sale de C y de ρ·ab: para aceleraciones bajas amplifica más, y a partir de 0,4 g deja de amplificar."
        />
        <Derivado
          label="ac"
          origen="S · ρ · ab"
          valor={f(e.ac, 3)}
          unit="g"
          help="Aceleración sísmica de cálculo: ac = S · ρ · ab (art. 2.2). Es la aceleración con la que se construyen el espectro y las fuerzas."
        />
        <Derivado
          label="T_A"
          origen="K·C/10 · esquina del espectro elástico"
          valor={f(e.TA)}
          unit="s"
          help="Período característico del espectro elástico (art. 2.3): T_A = K·C/10, en segundos. Por debajo de él el espectro elástico crece con T; no interviene en las fuerzas del método simplificado."
        />
        <Derivado
          label="T_B"
          origen="K·C/2,5 · decide la rama de α"
          valor={f(e.TB)}
          unit="s"
          help="Período característico del espectro (art. 2.3): T_B = K·C/2,5, en segundos. Decide la rama del coeficiente α: por debajo α = 2,5 y por encima α = 2,5·T_B/T."
        />
      </CollapsibleSection>

      <CollapsibleSection label="Estructura" refNorma="art. 3.7.2">
        <Sel<SistemaEstructural>
          label="Sistema"
          help="Sistema estructural resistente del edificio. Decide con qué expresión se estima el período fundamental T_F (art. 3.7.2.2) y, con ab, si el material está prohibido por el art. 1.2.3 (adobe, tapial, mampostería en seco). Con pantallas o triangulaciones, su ancho B se pide en «Geometría en planta»."
          value={state.sistema}
          options={SISTEMAS}
          onChange={(v) => setState((s) => ({ ...s, sistema: v }))}
        />
        {/*
          Los sótanos son el único dato de recuento que se introduce: `n` sale
          de contar la tabla de plantas y `n total` es la suma. Antes los tres
          eran independientes y podían contradecirse —«+ planta» subía n y
          dejaba n total quieto—, y con n total por debajo de n la pasarela de
          las cuatro plantas del art. 3.5.1 se abría para edificios que no le
          corresponden.
        */}
        <Num
          label="Sótanos"
          sub="plantas bajo rasante"
          help="Sólo intervienen en la pasarela de ≤4 plantas del art. 3.5.1, que cuenta las plantas TOTALES. Un edificio de 4 plantas sobre rasante con dos sótanos suma 6 y NO entra por esa vía."
          value={state.sotanos}
          min={0}
          onChange={(v) => setState((s) => ({ ...s, sotanos: Math.max(0, Math.trunc(v)) }))}
        />
        <Num
          label="H"
          sub="altura sobre rasante"
          help="Altura del edificio sobre rasante, en metros. Entra en la estimación del período fundamental T_F y en el requisito del método simplificado (menos de 60 m, art. 3.5.1)."
          unit="m"
          value={state.H}
          min={0}
          onChange={(v) => setState((s) => ({ ...s, H: v }))}
        />
        <Num
          label="Ω"
          sub="amortiguamiento"
          help="Amortiguamiento de la estructura, en % del crítico, según el tipo estructural y su compartimentación. El espectro de referencia corresponde al 5 %; otros valores lo corrigen mediante ν = (5/Ω)^0,4 (art. 2.5)."
          unit="%"
          value={state.omega}
          min={0}
          onChange={(v) => setState((s) => ({ ...s, omega: v }))}
        />
        <Num
          label="μ"
          sub="ductilidad · art. 3.7.3.1"
          help="Coeficiente de comportamiento por ductilidad (art. 3.7.3.1): 1 sin ductilidad, 2 baja, 3 alta y 4 muy alta. A más ductilidad, menores fuerzas de cálculo — pero exige que el proyecto cumpla las condiciones de diseño correspondientes."
          value={state.mu}
          min={1}
          onChange={(v) => setState((s) => ({ ...s, mu: v }))}
        />

        <SeDeduce />
        <Derivado
          label="n"
          origen="plantas sobre rasante · de la tabla"
          valor={String(plantasSobreRasante(state))}
          help="Número de plantas sobre rasante. No se teclea: se cuenta de la tabla de plantas y cargas, y limita el método simplificado (menos de veinte)."
        />
        <Derivado
          label="n total"
          origen={
            state.sotanos > 0
              ? `n + ${state.sotanos} sótano${state.sotanos === 1 ? '' : 's'} · pasarela art. 3.5.1`
              : 'sin sótanos · pasarela art. 3.5.1'
          }
          valor={String(plantasTotales(state))}
          help="Plantas totales del edificio, sótanos incluidos. Es el recuento que usa la pasarela de ≤ 4 plantas del art. 3.5.1 para dar por cumplidos los requisitos sin declararlos."
        />
        {/*
          T_F es DERIVADO. El conmutador existe porque el art. 3.6.2.3.2 permite
          justificarlo por otra vía, no porque haya que elegirlo cada vez.
        */}
        <div className="flex items-center justify-between py-0.75 gap-2">
          <div className="min-w-0">
            <span className="flex items-center gap-1 min-w-0">
              <span className="text-[12px] text-text-secondary">T_F</span>
              <HelpTooltip
                text="Período fundamental de oscilación del edificio, en segundos, estimado según el sistema estructural (art. 3.7.2.2). Sitúa al edificio en el espectro. Puede imponerse un valor justificado por otro procedimiento (art. 3.6.2.3.2)."
                fieldLabel="T_F"
              />
            </span>
            <div className="text-[10px] text-text-disabled font-mono truncate">
              {state.x.TFModo === 'manual' ? 'impuesto · art. 3.6.2.3.2' : 'art. 3.7.2.2'}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  x: { ...s.x, TFModo: s.x.TFModo === 'auto' ? 'manual' : 'auto' },
                  y: { ...s.y, TFModo: s.y.TFModo === 'auto' ? 'manual' : 'auto' },
                }))
              }
              className="text-[10px] px-1.5 py-1 rounded border border-border-main text-text-disabled hover:border-accent/40 transition-colors cursor-pointer"
            >
              {state.x.TFModo === 'auto' ? 'auto' : 'manual'}
            </button>
            {state.x.TFModo === 'manual' ? (
              <NumIn
                value={state.x.TFManual}
                min={0}
                ancho="w-15"
                etiqueta="T_F impuesto, en segundos"
                onChange={(n) =>
                  setState((s) => ({
                    ...s,
                    x: { ...s.x, TFManual: n },
                    y: { ...s.y, TFManual: n },
                  }))
                }
              />
            ) : (
              <span className="w-15 text-right border border-dashed border-border-main rounded px-1.75 py-1 text-[12px] font-mono text-text-primary">
                {f(r?.x.TF, 3)}
              </span>
            )}
            <span className="text-[9px] text-text-disabled font-mono">s</span>
          </div>
        </div>
        <Derivado
          label="Nº de modos"
          origen="art. 3.7.2.1"
          valor={r ? String(r.x.nModos) : '—'}
          help="Modos de vibración que exige considerar el art. 3.7.2.1 según T_F: 1 hasta 0,75 s, 2 hasta 1,25 s y 3 por encima."
        />
        <Derivado
          label="ν"
          origen={`art. 2.5 · Ω = ${state.omega} %`}
          valor={f(evaluacion.resultado?.nu, 3)}
          help="Factor de modificación del espectro por amortiguamiento distinto del 5 % de referencia: ν = (5/Ω)^0,4 (art. 2.5)."
        />
        <Derivado
          label="β"
          origen="ν / μ · art. 3.7.3.1"
          valor={f(evaluacion.resultado?.beta, 3)}
          help="Coeficiente de respuesta β = ν/μ (art. 3.7.3.1): condensa amortiguamiento y ductilidad en un solo factor que multiplica a las fuerzas sísmicas."
        />
      </CollapsibleSection>

      {/*
        Las plantas se editan en su propio cuadro y no aquí: cuarenta filas de
        cuatro controles no caben en 288 px sin cortarse. Ver PlantasModal.tsx.
        En la barra queda lo que se lee de un vistazo —cuántas plantas y cuánta
        masa— y la puerta para entrar a tocarlas.
      */}
      <CollapsibleSection label="Plantas y cargas" refNorma="art. 3.2">
        <div className="flex items-center justify-between pb-2">
          <span className="text-[11px] text-text-disabled">
            {state.plantas.length} planta{state.plantas.length === 1 ? '' : 's'}
          </span>
          <span className="text-[11px] font-mono text-accent">
            Σ P = {fuerza(sumaP, system)} {unidadFuerza(system)}
          </span>
        </div>
        <button
          type="button"
          onClick={onEditPlantas}
          className={
            'w-full flex items-center justify-center gap-1.5 py-2 max-lg:min-h-11 rounded border ' +
            'border-border-main text-[11px] text-text-secondary hover:border-accent ' +
            'hover:text-accent transition-colors cursor-pointer'
          }
        >
          <Layers size={12} aria-hidden="true" />
          Editar plantas y cargas
        </button>
        <p className="mt-1.5 text-[10px] leading-snug text-text-disabled">
          Cotas, superficies y cargas del <span className="font-mono">art. 3.2</span>, sobre el
          alzado del edificio.
        </p>
      </CollapsibleSection>

      {/*
        La ÚNICA geometría que pide el módulo, y se edita en su propio cuadro:
        el método simplificado no construye modelo estructural —ni secciones, ni
        material, ni nudos—, por cada dirección basta la lista de planos
        resistentes con su posición y una rigidez relativa. En la barra queda lo
        que se lee de un vistazo y la puerta para entrar a tocarla; dentro, las
        posiciones se miden desde la fachada y la planta se dibuja en vivo. Ver
        GeometriaModal.tsx.
      */}
      <CollapsibleSection label="Geometría en planta" refNorma="art. 3.7.5">
        <div className="flex items-center justify-between pb-2">
          <span className="text-[11px] text-text-disabled">
            {state.x.elementos.length} plano{state.x.elementos.length === 1 ? '' : 's'} en X ·{' '}
            {state.y.elementos.length} en Y
          </span>
          <span className="text-[11px] font-mono text-accent">
            {dec(state.x.L, 2)} × {dec(state.y.L, 2)} m
          </span>
        </div>
        <button
          type="button"
          onClick={onEditGeometria}
          className={
            'w-full flex items-center justify-center gap-1.5 py-2 max-lg:min-h-11 rounded border ' +
            'border-border-main text-[11px] text-text-secondary hover:border-accent ' +
            'hover:text-accent transition-colors cursor-pointer'
          }
        >
          <Ruler size={12} aria-hidden="true" />
          Editar geometría en planta
        </button>
        <p className="mt-1.5 text-[10px] leading-snug text-text-disabled">
          Dimensiones y planos resistentes del <span className="font-mono">art. 3.7.5</span>, sobre
          la planta dibujada y midiendo desde la fachada.
        </p>
      </CollapsibleSection>

      <CollapsibleSection label="Declaraciones" refNorma="art. 1.2.3 · 3.5.1" defaultOpen={false}>
        {/*
          El tercer estado ("—", sin contestar) NO es cosmético. Dar por buena
          una declaración que nadie hizo es el único fallo del módulo que no deja
          rastro: no lanza error, no avisa, y produce un proyecto visado sin
          justificación sísmica.
        */}
        <p className="text-[10px] leading-snug text-text-disabled pb-1">
          Sin contestar (<span className="font-mono">—</span>) no se calcula. Darlas por buenas por
          omisión produciría un proyecto sin justificación sísmica y sin ningún aviso.
        </p>
        <Declaracion
          label="Pórticos bien arriostrados"
          sub="art. 1.2.3 · en todas las direcciones"
          help="Pórticos capaces de resistir acciones horizontales en todas las direcciones. Con ab < 0,08 g esta condición exime de aplicar la Norma en construcciones de importancia normal (art. 1.2.3)."
          value={state.porticosBienArriostrados}
          onChange={(v) => setState((s) => ({ ...s, porticosBienArriostrados: v }))}
        />
        <Declaracion
          label="Regularidad geométrica"
          sub="requisito (3)"
          help="Planta y alzado regulares, sin entrantes ni salientes importantes. Es el requisito (3) del art. 3.5.1: el módulo no puede comprobarlo con sus datos, así que lo declara el proyectista."
          value={state.regularidadGeometrica}
          onChange={(v) => setState((s) => ({ ...s, regularidadGeometrica: v }))}
        />
        <Declaracion
          label="Soportes continuos hasta cimentación"
          sub="requisito (4)"
          help="Soportes que bajan hasta la cimentación sin cambios bruscos de rigidez, repartidos uniformemente en planta. Requisito (4) del art. 3.5.1, declarado por el proyectista."
          value={state.soportesContinuos}
          onChange={(v) => setState((s) => ({ ...s, soportesContinuos: v }))}
        />
        <Declaracion
          label="Regularidad mecánica"
          sub="requisito (5)"
          help="Rigideces, resistencias y masas repartidas de modo que los centros de gravedad y de torsión de todas las plantas queden, aproximadamente, en la misma vertical. Requisito (5) del art. 3.5.1, declarado."
          value={state.regularidadMecanica}
          onChange={(v) => setState((s) => ({ ...s, regularidadMecanica: v }))}
        />
        <Declaracion
          label="Excentricidad ≤ 10 %"
          sub="requisito (6) · declarada, si no hay planos suficientes"
          help="Excentricidad del centro de masas respecto al de torsión inferior al 10 % de la dimensión en planta, en cada dirección. Con los planos resistentes introducidos se comprueba sola; esta declaración sólo cuenta cuando faltan."
          value={state.excentricidadDeclarada}
          onChange={(v) => setState((s) => ({ ...s, excentricidadDeclarada: v }))}
        />
      </CollapsibleSection>
    </div>
  );
}
