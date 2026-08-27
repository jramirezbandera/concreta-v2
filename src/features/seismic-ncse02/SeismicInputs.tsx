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

import { useEffect, useMemo, useRef, useState } from 'react';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { FRACCION_MASA } from '../../lib/codes/seismic/ncse02';
import type {
  CategoriaMasa,
  Importancia,
  SistemaEstructural,
  TipoTerreno,
} from '../../lib/codes/seismic/types';
import { MENSAJE_NO_ENCONTRADO, buscarMunicipios, type Municipio } from './hazard';
import {
  newId,
  type DireccionUI,
  type PlantaUI,
  type SeismicEvaluation,
  type SeismicState,
} from './state';

export interface SeismicInputsProps {
  state: SeismicState;
  setState: (fn: (s: SeismicState) => SeismicState) => void;
  evaluacion: SeismicEvaluation;
}

// ── Piezas ───────────────────────────────────────────────────────────────────

const INPUT_CLS =
  'w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 ' +
  'text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 ' +
  'hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors';
const UNIT_CLS =
  'bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 ' +
  'text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center';
const SELECT_CLS =
  'bg-bg-primary border border-border-main rounded px-1.5 py-1 text-[12px] ' +
  'text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors';

function Num({
  label,
  sub,
  help,
  value,
  unit,
  onChange,
  min,
  ancho = 'w-15',
}: {
  label: string;
  sub?: string;
  help?: string;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  min?: number;
  ancho?: string;
}) {
  // El campo guarda el texto tal cual se teclea, para que "3," o "3." a medio
  // escribir no se reformateen bajo el cursor. Cuando el valor cambia DESDE
  // FUERA (cargar un caso, elegir municipio) hay que resincronizar: se hace
  // ajustando en render con el valor anterior, que es el patrón de React para
  // esto, y no con un efecto que provocaría un render en cascada.
  const [txt, setTxt] = useState(() => String(value));
  const [previo, setPrevio] = useState(value);
  if (previo !== value) {
    setPrevio(value);
    setTxt(String(value));
  }
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel label={label} sub={sub} help={help} />
      <div className="flex shrink-0">
        <input
          type="text"
          inputMode="decimal"
          value={txt}
          onChange={(e) => {
            setTxt(e.target.value);
            const n = parseFloat(e.target.value.replace(',', '.'));
            if (!Number.isNaN(n) && (min === undefined || n >= min)) onChange(n);
          }}
          onBlur={() => {
            const n = parseFloat(txt.replace(',', '.'));
            if (Number.isNaN(n)) setTxt(String(value));
          }}
          className={`${INPUT_CLS} ${ancho}`}
          aria-label={`${label}${unit ? ` (${unit})` : ''}`}
        />
        {unit ? <span className={UNIT_CLS}>{unit}</span> : null}
      </div>
    </div>
  );
}

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
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel label={label} sub={sub} help={help} />
      <select
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
}: {
  label: string;
  origen: string;
  valor: string;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <div className="min-w-0">
        <div className="text-[12px] text-text-secondary truncate">{label}</div>
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
  value,
  onChange,
}: {
  label: string;
  sub?: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const btn = (v: boolean | null, t: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
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
        <div className="text-[12px] text-text-secondary">{label}</div>
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
  const caja = useRef<HTMLDivElement>(null);

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
      buscarMunicipios(q, 12).then((r) => {
        if (!vivo) return;
        setResultados(r);
        setBuscando(false);
      });
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
      ab: m.ab,
      K: m.k,
    }));
    setQ('');
    setAbierto(false);
  };

  const sinResultados = abierto && q.trim().length >= 2 && !buscando && visibles.length === 0;

  return (
    <div className="py-0.75" ref={caja}>
      <label className="text-[12px] text-text-secondary block mb-1" htmlFor="sismo-municipio">
        Municipio
        <span className="text-[10px] text-text-disabled font-mono ml-1.5">Anejo 1</span>
      </label>
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
        className={
          'w-full bg-bg-primary border border-border-main rounded px-2 py-1.5 text-[12px] ' +
          'text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors'
        }
      />
      {state.municipioIne && !q ? (
        <div className="text-[10px] text-text-disabled font-mono mt-1">
          {state.municipioNombre} · INE {state.municipioIne}
        </div>
      ) : null}

      {abierto && visibles.length > 0 ? (
        <ul className="mt-1 max-h-56 overflow-y-auto scroll-hide border border-border-main rounded bg-bg-elevated">
          {visibles.map((m) => (
            <li key={m.ine}>
              <button
                type="button"
                onClick={() => elegir(m)}
                className="w-full text-left px-2 py-1.5 hover:bg-bg-primary transition-colors cursor-pointer"
              >
                <span className="text-[12px] text-text-primary">{m.nombre}</span>
                <span className="text-[10px] text-text-disabled font-mono float-right">
                  ab {m.ab.toFixed(2)} · K {m.k.toFixed(1)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {sinResultados ? (
        // El dataset lleva SOLO el Anejo 1, así que "no encontrado" no distingue
        // exento de errata. El mensaje cubre los dos casos a propósito.
        <p className="mt-1.5 text-[10px] leading-snug text-state-warn">{MENSAJE_NO_ENCONTRADO}</p>
      ) : null}
    </div>
  );
}

// ── Tabla de plantas ─────────────────────────────────────────────────────────

const CATEGORIAS: { v: CategoriaMasa; t: string }[] = [
  { v: 'permanente', t: 'Permanente' },
  { v: 'tabiqueria', t: 'Tabiquería' },
  { v: 'uso-residencial', t: 'Uso · residencial' },
  { v: 'uso-publico', t: 'Uso · público' },
  { v: 'uso-aglomeracion', t: 'Uso · aglomeración' },
  { v: 'uso-almacen', t: 'Uso · almacén' },
  { v: 'nieve-persistente', t: 'Nieve persistente' },
  { v: 'agua', t: 'Agua' },
];

function TablaPlantas({
  state,
  setState,
  evaluacion,
}: {
  state: SeismicState;
  setState: SeismicInputsProps['setState'];
  evaluacion: SeismicEvaluation;
}) {
  const pesos = evaluacion.resultado?.plantas.map((p) => p.P) ?? [];

  const cambiar = (id: string, fn: (p: PlantaUI) => PlantaUI) =>
    setState((s) => ({ ...s, plantas: s.plantas.map((p) => (p.id === id ? fn(p) : p)) }));

  return (
    <div className="space-y-2">
      {/*
        La fracción del art. 3.2 NO es el psi_2 del CTE. Se reutiliza la
        taxonomía de categorías de uso, no sus valores: psi gobierna la
        COMBINACIÓN de acciones y la fracción gobierna qué parte de la
        sobrecarga es MASA. Aplicar 0,5·Q en las dos es el error natural, y no
        lo delata ningún número raro.
      */}
      <p className="text-[10px] leading-snug text-text-disabled border border-border-sub rounded px-2 py-1.5">
        La fracción es la del <span className="font-mono">art. 3.2</span> y decide qué parte de la
        sobrecarga es <strong className="text-text-secondary">masa</strong>. No es el{' '}
        <span className="font-mono">ψ₂</span> del CTE, que gobierna la gravedad concomitante del art.
        3.4 y entra entera.
      </p>

      {state.plantas.map((p, i) => (
        <div key={p.id} className="border border-border-sub rounded p-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              value={p.nombre}
              onChange={(e) => cambiar(p.id, (x) => ({ ...x, nombre: e.target.value }))}
              className="bg-transparent text-[12px] text-text-primary outline-none min-w-0 flex-1"
              aria-label={`Nombre de la planta ${i + 1}`}
            />
            <span className="text-[11px] font-mono text-accent shrink-0">
              {(pesos[i] ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} kN
            </span>
            <button
              type="button"
              onClick={() => setState((s) => ({ ...s, plantas: s.plantas.filter((q) => q.id !== p.id) }))}
              className="text-[11px] text-text-disabled hover:text-state-fail transition-colors cursor-pointer shrink-0"
              aria-label={`Eliminar ${p.nombre}`}
            >
              ✕
            </button>
          </div>

          <Num
            label="h"
            sub="altura sobre rasante"
            unit="m"
            value={p.h}
            onChange={(v) => cambiar(p.id, (x) => ({ ...x, h: v }))}
          />

          <label className="flex items-center gap-1.5 text-[11px] text-text-disabled py-0.5 cursor-pointer">
            <input
              type="checkbox"
              checked={p.pesoManual}
              onChange={(e) => cambiar(p.id, (x) => ({ ...x, pesoManual: e.target.checked }))}
            />
            Meter el peso directamente en kN
          </label>

          {p.pesoManual ? (
            <Num
              label="P"
              sub="peso sísmico"
              unit="kN"
              value={p.P ?? 0}
              onChange={(v) => cambiar(p.id, (x) => ({ ...x, P: v }))}
            />
          ) : (
            <>
              <Num
                label="Área"
                unit="m²"
                value={p.area ?? 0}
                onChange={(v) => cambiar(p.id, (x) => ({ ...x, area: v }))}
              />
              {(p.componentes ?? []).map((c, j) => (
                <div key={j} className="flex items-center gap-1.5 py-0.5">
                  <select
                    value={c.categoria}
                    onChange={(e) =>
                      cambiar(p.id, (x) => ({
                        ...x,
                        componentes: (x.componentes ?? []).map((y, m) =>
                          m === j ? { ...y, categoria: e.target.value as CategoriaMasa } : y,
                        ),
                      }))
                    }
                    className={`${SELECT_CLS} flex-1 min-w-0`}
                    aria-label={`Categoría del componente ${j + 1}`}
                  >
                    {CATEGORIAS.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.t}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(c.q)}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value.replace(',', '.'));
                      if (Number.isNaN(n)) return;
                      cambiar(p.id, (x) => ({
                        ...x,
                        componentes: (x.componentes ?? []).map((y, m) => (m === j ? { ...y, q: n } : y)),
                      }));
                    }}
                    className={`${INPUT_CLS} w-12 rounded`}
                    aria-label={`Carga del componente ${j + 1} en kN/m²`}
                  />
                  <span className="text-[9px] text-text-disabled font-mono w-9 shrink-0">
                    ×{FRACCION_MASA[c.categoria].toFixed(1)}
                  </span>
                  {/*
                    La exclusión es POR PLANTA y es una decisión declarada: el
                    art. 3.2 sólo cuenta las sobrecargas "siempre que tengan un
                    efecto desfavorable". El PDF la recoge como declaración del
                    proyectista, no como cálculo.
                  */}
                  <button
                    type="button"
                    onClick={() =>
                      cambiar(p.id, (x) => ({
                        ...x,
                        componentes: (x.componentes ?? []).map((y, m) =>
                          m === j ? { ...y, excluida: !y.excluida } : y,
                        ),
                      }))
                    }
                    title={c.excluida ? 'Excluida por el proyectista' : 'Incluida'}
                    className={[
                      'text-[10px] px-1 rounded border transition-colors cursor-pointer shrink-0',
                      c.excluida
                        ? 'border-state-warn text-state-warn'
                        : 'border-border-main text-text-disabled hover:border-accent/40',
                    ].join(' ')}
                  >
                    {c.excluida ? 'excl.' : 'incl.'}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  cambiar(p.id, (x) => ({
                    ...x,
                    componentes: [...(x.componentes ?? []), { categoria: 'permanente', q: 0 }],
                  }))
                }
                className="text-[10px] text-text-disabled hover:text-accent transition-colors cursor-pointer"
              >
                + componente
              </button>
            </>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          setState((s) => {
            const ultima = s.plantas[s.plantas.length - 1];
            const nueva: PlantaUI = {
              ...(ultima ?? { h: 0, area: 100, componentes: [], P: 0, pesoManual: false }),
              id: newId(),
              nombre: `Planta ${s.plantas.length + 1}`,
              h: (ultima?.h ?? 0) + 3,
            };
            return { ...s, plantas: [...s.plantas, nueva], n: s.plantas.length + 1 };
          })
        }
        className="text-[11px] text-text-disabled hover:text-accent transition-colors cursor-pointer"
      >
        + planta
      </button>
    </div>
  );
}

// ── Planos resistentes ───────────────────────────────────────────────────────

/**
 * La ÚNICA geometría que pide el módulo.
 *
 * El método simplificado no construye modelo estructural: no hacen falta
 * secciones, armado, material, módulo elástico, luces, nudos ni altura de cada
 * pilar. Por cada dirección basta la lista de planos resistentes con su
 * coordenada firmada y una rigidez relativa. Con todas las rigideces a 1,00 el
 * reparto degenera en F_k / nº de planos, que es exactamente lo que hacen las
 * hojas de cálculo al uso: dar rigideces es una mejora opcional.
 */
function PlanosResistentes({
  dir,
  eje,
  onChange,
}: {
  dir: DireccionUI;
  eje: 'X' | 'Y';
  onChange: (fn: (d: DireccionUI) => DireccionUI) => void;
}) {
  return (
    <div className="space-y-1">
      <Num
        label="L"
        sub="dimensión en el sentido de oscilación"
        unit="m"
        value={dir.L}
        onChange={(v) => onChange((d) => ({ ...d, L: v }))}
      />
      <Num
        label="B"
        sub="pantallas o planos triangulados"
        help="Sólo entra en las expresiones (3) y (5) del art. 3.7.2.2. Cero si no hay."
        unit="m"
        value={dir.B}
        onChange={(v) => onChange((d) => ({ ...d, B: v }))}
      />

      <div className="pt-1.5 text-[10px] uppercase tracking-[0.07em] text-text-disabled">
        Planos resistentes · {eje}
      </div>
      <p className="text-[10px] leading-snug text-text-disabled">
        <span className="font-mono">x</span> es la coordenada{' '}
        <strong className="text-text-secondary">con signo</strong> respecto al centro, medida
        perpendicularmente al sismo. De aquí salen solos L<sub>e</sub>, el centro de torsión y γ
        <sub>a</sub>.
      </p>

      {dir.elementos.map((el, i) => (
        <div key={el.id} className="flex items-center gap-1.5 py-0.5">
          <span className="text-[10px] text-text-disabled font-mono w-4 shrink-0">{i + 1}</span>
          <input
            type="text"
            inputMode="decimal"
            value={String(el.x)}
            onChange={(e) => {
              const n = parseFloat(e.target.value.replace(',', '.'));
              if (Number.isNaN(n)) return;
              onChange((d) => ({
                ...d,
                elementos: d.elementos.map((y, m) => (m === i ? { ...y, x: n } : y)),
              }));
            }}
            className={`${INPUT_CLS} w-14 rounded`}
            aria-label={`Coordenada x del plano ${i + 1}`}
          />
          <span className="text-[9px] text-text-disabled font-mono shrink-0">m</span>
          <input
            type="text"
            inputMode="decimal"
            value={String(el.k)}
            onChange={(e) => {
              const n = parseFloat(e.target.value.replace(',', '.'));
              if (Number.isNaN(n)) return;
              onChange((d) => ({
                ...d,
                elementos: d.elementos.map((y, m) => (m === i ? { ...y, k: n } : y)),
              }));
            }}
            className={`${INPUT_CLS} w-14 rounded`}
            aria-label={`Rigidez relativa del plano ${i + 1}`}
          />
          <span className="text-[9px] text-text-disabled font-mono shrink-0">k</span>
          <button
            type="button"
            onClick={() => onChange((d) => ({ ...d, elementos: d.elementos.filter((_, m) => m !== i) }))}
            className="text-[11px] text-text-disabled hover:text-state-fail transition-colors cursor-pointer ml-auto"
            aria-label={`Eliminar el plano ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange((d) => ({ ...d, elementos: [...d.elementos, { id: newId(), x: 0, k: 1 }] }))
        }
        className="text-[11px] text-text-disabled hover:text-accent transition-colors cursor-pointer"
      >
        + plano resistente
      </button>
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

const f = (v: number | undefined, d = 2) => (v === undefined ? '—' : v.toFixed(d));

export function SeismicInputs({ state, setState, evaluacion }: SeismicInputsProps) {
  const e = evaluacion.emplazamiento;
  const r = evaluacion.resultado;
  const sumaP = useMemo(
    () => r?.plantas.reduce((a, p) => a + p.P, 0) ?? 0,
    [r],
  );

  const setDir = (eje: 'x' | 'y', fn: (d: DireccionUI) => DireccionUI) =>
    setState((s) => ({ ...s, [eje]: fn(s[eje]) }));

  return (
    <div className="space-y-1">
      <CollapsibleSection label="Emplazamiento" refNorma="art. 2.2 · 2.4">
        <BuscadorMunicipio state={state} setState={setState} />
        <Sel<Importancia>
          label="Importancia"
          sub="art. 1.2.2"
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
                <input
                  type="text"
                  inputMode="decimal"
                  value={String(es.C)}
                  onChange={(ev) => {
                    const n = parseFloat(ev.target.value.replace(',', '.'));
                    if (Number.isNaN(n)) return;
                    setState((s) => ({
                      ...s,
                      estratos: s.estratos.map((y, m) => (m === i ? { ...y, C: n } : y)),
                    }));
                  }}
                  className={`${INPUT_CLS} w-14 rounded`}
                  aria-label={`C del estrato ${i + 1}`}
                />
                <span className="text-[9px] text-text-disabled font-mono">C</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={String(es.espesor)}
                  onChange={(ev) => {
                    const n = parseFloat(ev.target.value.replace(',', '.'));
                    if (Number.isNaN(n)) return;
                    setState((s) => ({
                      ...s,
                      estratos: s.estratos.map((y, m) => (m === i ? { ...y, espesor: n } : y)),
                    }));
                  }}
                  className={`${INPUT_CLS} w-14 rounded`}
                  aria-label={`Espesor del estrato ${i + 1}`}
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
              className="text-[11px] text-text-disabled hover:text-accent transition-colors cursor-pointer"
            >
              + estrato
            </button>
          </div>
        )}

        <SeDeduce />
        <Derivado label="ab" origen={state.municipioNombre || 'entrada manual'} valor={f(state.ab)} unit="g" />
        <Derivado label="K" origen={state.municipioNombre || 'entrada manual'} valor={f(state.K, 1)} />
        <Derivado label="ρ" origen={`importancia ${state.importancia}`} valor={f(e.rho, 1)} />
        <Derivado
          label="C"
          origen={state.terrenoModo === 'tipo' ? `terreno ${state.terreno}` : 'perfil ponderado'}
          valor={f(e.C)}
        />
        <Derivado label="S" origen="art. 2.2" valor={f(e.S, 3)} />
        <Derivado label="ac" origen="S · ρ · ab" valor={f(e.ac, 3)} unit="g" />
        <Derivado label="T_A" origen="K·C/10 · esquina del espectro elástico" valor={f(e.TA)} unit="s" />
        <Derivado label="T_B" origen="K·C/2,5 · decide la rama de α" valor={f(e.TB)} unit="s" />
      </CollapsibleSection>

      <CollapsibleSection label="Estructura" refNorma="art. 3.7.2">
        <Sel<SistemaEstructural>
          label="Sistema"
          value={state.sistema}
          options={SISTEMAS}
          onChange={(v) => setState((s) => ({ ...s, sistema: v }))}
        />
        <Num
          label="n"
          sub="plantas sobre rasante"
          value={state.n}
          min={1}
          onChange={(v) => setState((s) => ({ ...s, n: v }))}
        />
        <Num
          label="n total"
          sub="sótanos incluidos"
          help="Sólo interviene en la pasarela de ≤4 plantas del art. 3.5.1. Un edificio de 4 plantas sobre rasante con dos sótanos tiene n = 4 pero n_total = 6, y NO entra por la pasarela."
          value={state.nTotal}
          min={1}
          onChange={(v) => setState((s) => ({ ...s, nTotal: v }))}
        />
        <Num
          label="H"
          sub="altura sobre rasante"
          unit="m"
          value={state.H}
          min={0}
          onChange={(v) => setState((s) => ({ ...s, H: v }))}
        />
        <Num
          label="Ω"
          sub="amortiguamiento"
          unit="%"
          value={state.omega}
          min={0}
          onChange={(v) => setState((s) => ({ ...s, omega: v }))}
        />
        <Num
          label="μ"
          sub="ductilidad · art. 3.7.3.1"
          value={state.mu}
          min={1}
          onChange={(v) => setState((s) => ({ ...s, mu: v }))}
        />

        <SeDeduce />
        {/*
          T_F es DERIVADO. El conmutador existe porque el art. 3.6.2.3.2 permite
          justificarlo por otra vía, no porque haya que elegirlo cada vez.
        */}
        <div className="flex items-center justify-between py-0.75 gap-2">
          <div className="min-w-0">
            <div className="text-[12px] text-text-secondary">T_F</div>
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
              <input
                type="text"
                inputMode="decimal"
                value={String(state.x.TFManual)}
                onChange={(ev) => {
                  const n = parseFloat(ev.target.value.replace(',', '.'));
                  if (Number.isNaN(n)) return;
                  setState((s) => ({
                    ...s,
                    x: { ...s.x, TFManual: n },
                    y: { ...s.y, TFManual: n },
                  }));
                }}
                className={`${INPUT_CLS} w-15 rounded`}
                aria-label="T_F impuesto, en segundos"
              />
            ) : (
              <span className="w-15 text-right border border-dashed border-border-main rounded px-1.75 py-1 text-[12px] font-mono text-text-primary">
                {f(r?.x.TF, 3)}
              </span>
            )}
            <span className="text-[9px] text-text-disabled font-mono">s</span>
          </div>
        </div>
        <Derivado label="Nº de modos" origen="art. 3.7.2.1" valor={r ? String(r.x.nModos) : '—'} />
        <Derivado label="ν" origen={`art. 2.5 · Ω = ${state.omega} %`} valor={f(evaluacion.resultado?.nu, 3)} />
        <Derivado label="β" origen="ν / μ · art. 3.7.3.1" valor={f(evaluacion.resultado?.beta, 3)} />
      </CollapsibleSection>

      <CollapsibleSection label="Plantas y cargas" refNorma="art. 3.2" defaultOpen={false}>
        <div className="flex items-center justify-between pb-1.5">
          <span className="text-[11px] text-text-disabled">{state.plantas.length} plantas</span>
          <span className="text-[11px] font-mono text-accent">
            Σ P = {sumaP.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kN
          </span>
        </div>
        <TablaPlantas state={state} setState={setState} evaluacion={evaluacion} />
      </CollapsibleSection>

      <CollapsibleSection label="Dirección X" refNorma="art. 3.7.5" defaultOpen={false}>
        <PlanosResistentes dir={state.x} eje="X" onChange={(fn) => setDir('x', fn)} />
      </CollapsibleSection>

      <CollapsibleSection label="Dirección Y" refNorma="art. 3.7.5" defaultOpen={false}>
        <PlanosResistentes dir={state.y} eje="Y" onChange={(fn) => setDir('y', fn)} />
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
          value={state.porticosBienArriostrados}
          onChange={(v) => setState((s) => ({ ...s, porticosBienArriostrados: v }))}
        />
        <Declaracion
          label="Regularidad geométrica"
          sub="requisito (3)"
          value={state.regularidadGeometrica}
          onChange={(v) => setState((s) => ({ ...s, regularidadGeometrica: v }))}
        />
        <Declaracion
          label="Soportes continuos hasta cimentación"
          sub="requisito (4)"
          value={state.soportesContinuos}
          onChange={(v) => setState((s) => ({ ...s, soportesContinuos: v }))}
        />
        <Declaracion
          label="Regularidad mecánica"
          sub="requisito (5)"
          value={state.regularidadMecanica}
          onChange={(v) => setState((s) => ({ ...s, regularidadMecanica: v }))}
        />
        <Declaracion
          label="Excentricidad ≤ 10 %"
          sub="requisito (6) · declarada, si no hay planos suficientes"
          value={state.excentricidadDeclarada}
          onChange={(v) => setState((s) => ({ ...s, excentricidadDeclarada: v }))}
        />
      </CollapsibleSection>
    </div>
  );
}
