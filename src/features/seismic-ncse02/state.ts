// Modelo de estado del módulo de sismo, y su traducción a lo que pide el motor.
//
// Vive aquí y no en `lib/codes/seismic/` a propósito: el motor son funciones
// puras sobre `SeismicInput` y no debe saber nada de conmutadores auto/manual,
// de si el usuario metió el peso a mano o por el asistente de superficie, ni de
// qué municipio eligió. Todo eso es forma de la UI, y se queda de este lado.
//
// El estado es SUPERCONJUNTO de `SeismicInput`, porque las dos puertas
// normativas piden datos que la cadena de fuerzas no necesita: `nTotal` (sólo
// para la pasarela de ≤4 plantas del art. 3.5.1), el arriostramiento del art.
// 1.2.3 y las tres declaraciones de regularidad. Meterlos en `SeismicInput`
// habría obligado al motor a cargar con datos que no usa.

import { checkApplicability } from '../../lib/codes/seismic/applicability';
import { calcularSismo, resolverEmplazamiento } from '../../lib/codes/seismic/ncse02';
import type {
  ApplicabilityResult,
  ComponenteCarga,
  ElementoResistente,
  EmplazamientoResult,
  Estrato,
  ExcentricidadDireccion,
  Importancia,
  PlantaInput,
  SeismicInput,
  SeismicResult,
  SistemaEstructural,
  TipoTerreno,
} from '../../lib/codes/seismic/types';

// ── Modelo ───────────────────────────────────────────────────────────────────

export interface PlantaUI extends PlantaInput {
  id: string;
  /** Rótulo libre: "Planta 3", "Ático", "Torreón". */
  nombre: string;
  /**
   * Cuando es `true`, `P` manda y el asistente de superficie queda ignorado.
   * Hay plantas que es más rápido meterlas directamente en kN.
   */
  pesoManual: boolean;
}

export interface DireccionUI {
  L: number;
  B: number;
  elementos: ElementoResistente[];
  /**
   * El periodo fundamental es DERIVADO, no una decisión. El conmutador existe
   * porque el art. 3.6.2.3.2 permite justificarlo por otra vía, no porque el
   * usuario tenga que elegirlo cada vez.
   */
  TFModo: 'auto' | 'manual';
  TFManual: number;
}

export interface SeismicState {
  // — emplazamiento —
  /** Código INE del municipio elegido, o null si se metieron ab y K a mano. */
  municipioIne: string | null;
  /** Nombre para enseñar y para el PDF. Vacío en entrada manual. */
  municipioNombre: string;
  /** ab/g, adimensional. */
  ab: number;
  K: number;
  importancia: Importancia;
  /** El art. 2.4 admite el tipo tabulado o el perfil de estratos ponderado. */
  terrenoModo: 'tipo' | 'perfil';
  terreno: TipoTerreno;
  estratos: Estrato[];

  // — estructura —
  sistema: SistemaEstructural;
  /** Plantas SOBRE RASANTE. */
  n: number;
  /** Plantas TOTALES, sótanos incluidos. Sólo entra en la pasarela del art. 3.5.1. */
  nTotal: number;
  /** Altura sobre rasante [m]. */
  H: number;
  /** Amortiguamiento [%]. */
  omega: number;
  /** Ductilidad, art. 3.7.3.1. */
  mu: number;
  nModosModo: 'auto' | 'manual';
  nModosManual: number;

  // — plantas y direcciones —
  plantas: PlantaUI[];
  x: DireccionUI;
  y: DireccionUI;

  // — declaraciones del proyectista —
  /** Art. 1.2.3: "pórticos bien arriostrados entre sí en todas las direcciones". */
  porticosBienArriostrados: boolean | null;
  regularidadGeometrica: boolean | null;
  soportesContinuos: boolean | null;
  regularidadMecanica: boolean | null;
  /** Requisito (6) declarado, para cuando no hay planos resistentes suficientes. */
  excentricidadDeclarada: boolean | null;
}

// ── Estados de partida ───────────────────────────────────────────────────────

let contador = 0;
export function newId(): string {
  contador += 1;
  return `p${Date.now().toString(36)}${contador.toString(36)}`;
}

function plantaTipo(nombre: string, h: number, area: number): PlantaUI {
  return {
    id: newId(),
    nombre,
    h,
    area,
    componentes: [
      { categoria: 'permanente', q: 4.5 },
      { categoria: 'permanente', q: 1.5 },
      { categoria: 'tabiqueria', q: 1.0 },
      { categoria: 'uso-residencial', q: 2.0 },
    ],
    // Presente aunque no se use: así el estado por defecto es punto fijo de su
    // propia normalización, y un round-trip por localStorage o share-URL no lo
    // cambia. Sin esto, el estado "recién cargado" y el "recién creado" no son
    // iguales y cualquier comparación de igualdad miente.
    P: 0,
    pesoManual: false,
  };
}

/**
 * El caso del mockup: Granada, 10 plantas de pórticos de hormigón sin
 * pantallas, terreno II. Sirve de punto de partida reconocible y es el mismo
 * caso que fija `CASO_GRANADA` en los fixtures del motor.
 */
export function defaultSeismicState(): SeismicState {
  const plantas: PlantaUI[] = [];
  for (let k = 1; k <= 10; k++) {
    plantas.push(
      k === 10
        ? {
            id: newId(),
            nombre: 'Cubierta',
            h: 3 * k,
            area: 300,
            componentes: [
              { categoria: 'permanente', q: 4.5 },
              { categoria: 'permanente', q: 1.5 },
              // Sobrecarga de mantenimiento de cubierta: excluida por decisión
              // declarada del proyectista (art. 3.2, "efecto desfavorable").
              { categoria: 'uso-publico', q: 1.0, excluida: true },
            ],
            P: 0,
            pesoManual: false,
          }
        : plantaTipo(`Planta ${k}`, 3 * k, 300),
    );
  }
  return {
    municipioIne: '18087',
    municipioNombre: 'Granada',
    ab: 0.23,
    K: 1.0,
    importancia: 'normal',
    terrenoModo: 'tipo',
    terreno: 'II',
    estratos: [{ C: 1.3, espesor: 30 }],
    sistema: 'porticos-ha',
    n: 10,
    nTotal: 10,
    H: 30,
    omega: 5,
    // mu = 3 no es un valor de relleno: es el del caso que congela
    // `CASO_GRANADA` en los fixtures, y hay un test que ata este arranque a
    // aquellos números para que nadie los desincronice por descuido.
    mu: 3,
    nModosModo: 'auto',
    nModosManual: 2,
    plantas,
    x: direccionPorDefecto(20, 0),
    y: direccionPorDefecto(15, 0),
    porticosBienArriostrados: null,
    regularidadGeometrica: true,
    soportesContinuos: true,
    regularidadMecanica: true,
    excentricidadDeclarada: true,
  };
}

function direccionPorDefecto(L: number, B: number): DireccionUI {
  return {
    L,
    B,
    // Con todas las rigideces a 1,00 el reparto degenera en F_k / nº de planos,
    // que es exactamente lo que hacen las hojas de cálculo al uso. Dar
    // rigideces es una MEJORA opcional, no un requisito para empezar.
    elementos: [
      { id: newId(), x: -L / 2, k: 1 },
      { id: newId(), x: -L / 4, k: 1 },
      { id: newId(), x: L / 4, k: 1 },
      { id: newId(), x: L / 2, k: 1 },
    ],
    TFModo: 'auto',
    TFManual: 0,
  };
}

/** Estado mínimo: una planta, sin municipio. Para empezar de cero. */
export function blankSeismicState(): SeismicState {
  const s = defaultSeismicState();
  return {
    ...s,
    municipioIne: null,
    municipioNombre: '',
    ab: 0,
    K: 1.0,
    n: 1,
    nTotal: 1,
    H: 3,
    plantas: [plantaTipo('Planta 1', 3, 100)],
    regularidadGeometrica: null,
    soportesContinuos: null,
    regularidadMecanica: null,
    excentricidadDeclarada: null,
  };
}

// ── Traducción al motor ──────────────────────────────────────────────────────

function direccionAInput(d: DireccionUI) {
  return {
    L: d.L,
    B: d.B,
    elementos: d.elementos,
    // El override sólo viaja si está activo Y tiene valor: un 0 colado como
    // "manual" produciría T_F = 0 y una alpha sin sentido.
    ...(d.TFModo === 'manual' && d.TFManual > 0 ? { TFManual: d.TFManual } : {}),
  };
}

export function toSeismicInput(s: SeismicState): SeismicInput {
  return {
    emplazamiento: {
      ab: s.ab,
      K: s.K,
      importancia: s.importancia,
      terreno: s.terrenoModo === 'perfil' ? s.estratos : s.terreno,
    },
    estructura: {
      sistema: s.sistema,
      n: s.n,
      H: s.H,
      omega: s.omega,
      mu: s.mu,
      ...(s.nModosModo === 'manual' && s.nModosManual > 0 ? { nModos: s.nModosManual } : {}),
    },
    plantas: s.plantas.map((p) => ({
      id: p.id,
      h: p.h,
      ...(p.pesoManual ? { P: p.P ?? 0 } : { area: p.area, componentes: p.componentes }),
    })),
    x: direccionAInput(s.x),
    y: direccionAInput(s.y),
  };
}

/**
 * Excentricidad relativa por dirección, para el requisito (6) del art. 3.5.1.
 *
 * Sale sola de los planos resistentes: el centro de rigidez es la media de las
 * `x` pesadas por rigidez, y el centro de masas se toma en el centro geométrico
 * (`x = 0`), que es la convención con la que se introducen las coordenadas.
 * Devuelve `null` cuando no hay rigidez que repartir y hay que declararla.
 */
export function excentricidadDe(d: DireccionUI): ExcentricidadDireccion | null {
  const suma = d.elementos.reduce((a, el) => a + el.k, 0);
  if (!(suma > 0) || !(d.L > 0) || d.elementos.length === 0) return null;
  const centroRigidez = d.elementos.reduce((a, el) => a + el.k * el.x, 0) / suma;
  return { e: Math.abs(centroRigidez), dimension: d.L };
}

// ── Evaluación completa ──────────────────────────────────────────────────────

export interface SeismicEvaluation {
  /** Siempre presente: de aquí sale `ac`, que la puerta del art. 1.2.3 necesita. */
  emplazamiento: EmplazamientoResult;
  aplicabilidad: ApplicabilityResult;
  /** `null` cuando alguna de las dos puertas lo impide. */
  resultado: SeismicResult | null;
}

/**
 * Encadena emplazamiento → puertas → cadena de fuerzas, en ese orden y por una
 * razón: la contraexcepción de las siete plantas del art. 1.2.3 depende de `ac`,
 * y `ac` exige rho, tipo de terreno y S. Sin resolver antes el emplazamiento, la
 * puerta sólo puede devolver "indeterminada".
 */
export function evaluarSismo(s: SeismicState): SeismicEvaluation {
  const input = toSeismicInput(s);
  const emplazamiento = resolverEmplazamiento(input.emplazamiento);

  const ex = excentricidadDe(s.x);
  const ey = excentricidadDe(s.y);

  const aplicabilidad = checkApplicability(
    {
      importancia: s.importancia,
      ab: s.ab,
      ac: emplazamiento.ac,
      n: s.n,
      ...(s.porticosBienArriostrados == null
        ? {}
        : { porticosBienArriostrados: s.porticosBienArriostrados }),
      sistema: s.sistema,
    },
    {
      importancia: s.importancia,
      n: s.n,
      nTotal: s.nTotal,
      H: s.H,
      regularidadGeometrica: s.regularidadGeometrica,
      soportesContinuos: s.soportesContinuos,
      regularidadMecanica: s.regularidadMecanica,
      ...(ex || ey
        ? {
            excentricidad: {
              ...(ex ? { x: ex } : {}),
              ...(ey ? { y: ey } : {}),
            },
          }
        : {}),
      excentricidadDeclarada: s.excentricidadDeclarada,
    },
  );

  return {
    emplazamiento,
    aplicabilidad,
    resultado: aplicabilidad.puedeCalcular ? calcularSismo(input) : null,
  };
}

// ── Normalización ────────────────────────────────────────────────────────────

const TERRENOS: TipoTerreno[] = ['I', 'II', 'III', 'IV'];
const IMPORTANCIAS: Importancia[] = ['moderada', 'normal', 'especial'];
const SISTEMAS: SistemaEstructural[] = [
  'fabrica',
  'porticos-ha',
  'porticos-ha-pantallas',
  'porticos-acero',
  'acero-triangulado',
  'mamposteria-seco',
  'adobe',
  'tapial',
  'otro',
];
const CATEGORIAS: ComponenteCarga['categoria'][] = [
  'permanente',
  'tabiqueria',
  'uso-residencial',
  'uso-publico',
  'uso-aglomeracion',
  'uso-almacen',
  'nieve-persistente',
  'agua',
];

const num = (v: unknown, porDefecto: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : porDefecto;
const boolNull = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/**
 * Deja cualquier objeto en un `SeismicState` utilizable. Se aplica a lo que
 * viene de localStorage y de una share-URL, que son entradas que no controlamos:
 * un estado a medio migrar tiene que degradar a valores por defecto, nunca
 * producir un `NaN` que se propague hasta el cortante basal.
 */
export function normalizeSeismicState(x: unknown): SeismicState {
  const d = defaultSeismicState();
  if (!x || typeof x !== 'object') return d;
  const s = x as Record<string, unknown>;

  const plantasBrutas = Array.isArray(s.plantas) ? s.plantas : [];
  const plantas: PlantaUI[] = plantasBrutas.map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const comps = Array.isArray(o.componentes) ? o.componentes : [];
    return {
      id: typeof o.id === 'string' && o.id ? o.id : newId(),
      nombre: typeof o.nombre === 'string' ? o.nombre : `Planta ${i + 1}`,
      h: num(o.h, 3 * (i + 1)),
      area: num(o.area, 100),
      componentes: comps.map((c) => {
        const cc = (c ?? {}) as Record<string, unknown>;
        return {
          categoria: CATEGORIAS.includes(cc.categoria as ComponenteCarga['categoria'])
            ? (cc.categoria as ComponenteCarga['categoria'])
            : 'permanente',
          q: num(cc.q, 0),
          ...(cc.excluida === true ? { excluida: true } : {}),
        };
      }),
      P: num(o.P, 0),
      pesoManual: o.pesoManual === true,
    };
  });

  return {
    municipioIne: typeof s.municipioIne === 'string' ? s.municipioIne : null,
    municipioNombre: typeof s.municipioNombre === 'string' ? s.municipioNombre : '',
    ab: num(s.ab, d.ab),
    K: num(s.K, d.K),
    importancia: IMPORTANCIAS.includes(s.importancia as Importancia)
      ? (s.importancia as Importancia)
      : d.importancia,
    terrenoModo: s.terrenoModo === 'perfil' ? 'perfil' : 'tipo',
    terreno: TERRENOS.includes(s.terreno as TipoTerreno) ? (s.terreno as TipoTerreno) : d.terreno,
    estratos: Array.isArray(s.estratos)
      ? (s.estratos as unknown[]).map((e) => {
          const o = (e ?? {}) as Record<string, unknown>;
          return { C: num(o.C, 1.3), espesor: num(o.espesor, 0) } as Estrato;
        })
      : d.estratos,
    sistema: SISTEMAS.includes(s.sistema as SistemaEstructural)
      ? (s.sistema as SistemaEstructural)
      : d.sistema,
    n: num(s.n, plantas.length || d.n),
    nTotal: num(s.nTotal, num(s.n, plantas.length || d.n)),
    H: num(s.H, d.H),
    omega: num(s.omega, d.omega),
    mu: num(s.mu, d.mu),
    nModosModo: s.nModosModo === 'manual' ? 'manual' : 'auto',
    nModosManual: num(s.nModosManual, d.nModosManual),
    plantas: plantas.length ? plantas : d.plantas,
    x: normalizarDireccion(s.x, d.x),
    y: normalizarDireccion(s.y, d.y),
    porticosBienArriostrados: boolNull(s.porticosBienArriostrados),
    regularidadGeometrica: boolNull(s.regularidadGeometrica),
    soportesContinuos: boolNull(s.soportesContinuos),
    regularidadMecanica: boolNull(s.regularidadMecanica),
    excentricidadDeclarada: boolNull(s.excentricidadDeclarada),
  };
}

function normalizarDireccion(x: unknown, porDefecto: DireccionUI): DireccionUI {
  if (!x || typeof x !== 'object') return porDefecto;
  const o = x as Record<string, unknown>;
  const els = Array.isArray(o.elementos) ? o.elementos : [];
  return {
    L: num(o.L, porDefecto.L),
    B: num(o.B, porDefecto.B),
    elementos: els.map((e) => {
      const el = (e ?? {}) as Record<string, unknown>;
      return {
        id: typeof el.id === 'string' && el.id ? el.id : newId(),
        // El signo de `x` se CONSERVA. Guardar |x| destruiría la geometría y
        // dejaría al módulo sin poder calcular el centro de rigidez.
        x: num(el.x, 0),
        k: num(el.k, 1),
      };
    }),
    TFModo: o.TFModo === 'manual' ? 'manual' : 'auto',
    TFManual: num(o.TFManual, 0),
  };
}
