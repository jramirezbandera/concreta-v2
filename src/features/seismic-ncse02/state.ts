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
import {
  TEXTO_SIN_TF,
  calcularSismo,
  pesoSismicoPlanta,
  resolverEmplazamiento,
  resolverTF,
} from '../../lib/codes/seismic/ncse02';
import { leerObra } from '../../lib/obra';
import { publicar } from '../../lib/pub';
import type { Procedencia } from './hazard';
import type {
  ApplicabilityResult,
  CategoriaMasa,
  ComponenteCarga,
  ElementoResistente,
  EmplazamientoResult,
  Estrato,
  ExcentricidadDireccion,
  Impedimento,
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
  /**
   * De dónde salen `ab` y `K` cuando no es la cosecha directa de la capa del
   * IGN. `null` en la inmensa mayoría de municipios y en entrada manual.
   *
   * Viaja EN EL ESTADO, y no se vuelve a consultar al pintar, porque el PDF la
   * necesita de forma síncrona y porque es parte de lo que se justifica: un
   * valor heredado del municipio de origen no es lo mismo que uno escrito en el
   * Anejo 1, y el documento tiene que poder decir cuál de los dos es.
   */
  municipioProcedencia: Procedencia | null;
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
  /**
   * Sótanos, o cualquier planta bajo rasante. Cero o más.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POR QUÉ SE PIDEN LOS SÓTANOS Y NO EL TOTAL DE PLANTAS
   * ─────────────────────────────────────────────────────────────────────────
   * Antes el estado guardaba `n` (sobre rasante) y `nTotal` (con sótanos) como
   * dos números libres, y nada impedía que se separaran de la realidad ni entre
   * sí. El botón «+ planta» subía `n` y no tocaba `nTotal`; borrar una fila no
   * tocaba ninguno de los dos. Con `n = 5` y `nTotal = 3` —imposible, porque
   * los sótanos SUMAN— la pasarela del art. 3.5.1, que mira `nTotal <= 4`,
   * declaraba aplicable el método simplificado a un edificio de cinco plantas
   * sin ninguna declaración de regularidad.
   *
   * Ahora los dos son derivados y no se pueden contradecir:
   *
   *   n      = plantas.length          (la tabla ES las plantas sobre rasante)
   *   nTotal = plantas.length + sotanos
   *
   * `nTotal >= n` deja de ser una regla que validar y pasa a ser aritmética.
   */
  sotanos: number;
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
    // Granada sale de la capa del IGN sin suplemento ninguno.
    municipioProcedencia: null,
    ab: 0.23,
    K: 1.0,
    importancia: 'normal',
    terrenoModo: 'tipo',
    terreno: 'II',
    estratos: [{ C: 1.3, espesor: 30 }],
    sistema: 'porticos-ha',
    // n = 10 sale de las diez filas de `plantas`; sin sótanos, nTotal = 10.
    sotanos: 0,
    H: 30,
    omega: 5,
    // mu = 3 no es un valor de relleno: es el del caso que congela
    // `CASO_GRANADA` en los fixtures, y hay un test que ata este arranque a
    // aquellos números para que nadie los desincronice por descuido.
    mu: 3,
    nModosModo: 'auto',
    nModosManual: 2,
    plantas,
    // Planta de 20 × 15 m. Los planos de X se reparten sobre los 15 m del eje
    // Y, y los de Y sobre los 20 m del eje X.
    x: direccionPorDefecto(20, 0, 15),
    y: direccionPorDefecto(15, 0, 20),
    porticosBienArriostrados: null,
    regularidadGeometrica: true,
    soportesContinuos: true,
    regularidadMecanica: true,
    excentricidadDeclarada: true,
  };
}

/**
 * @param L      dimensión EN EL SENTIDO DE LA OSCILACIÓN. Es la que entra en las
 *               expresiones de T_F del art. 3.7.2.2.
 * @param B      pantallas o planos triangulados, para las expresiones (3) y (5).
 * @param ancho  dimensión PERPENDICULAR, que es sobre la que se reparten los
 *               planos resistentes de esta dirección. Antes se usaba `L` para
 *               las dos cosas y la geometría por defecto salía imposible: los
 *               cuatro planos de X caían en ±10 y ±5 sobre un eje que mide 15 m,
 *               o sea dos de ellos fuera del edificio.
 */
function direccionPorDefecto(L: number, B: number, ancho: number): DireccionUI {
  return {
    L,
    B,
    // Con todas las rigideces a 1,00 el reparto degenera en F_k / nº de planos,
    // que es exactamente lo que hacen las hojas de cálculo al uso. Dar
    // rigideces es una MEJORA opcional, no un requisito para empezar.
    elementos: [
      { id: newId(), x: -ancho / 2, k: 1 },
      { id: newId(), x: -ancho / 4, k: 1 },
      { id: newId(), x: ancho / 4, k: 1 },
      { id: newId(), x: ancho / 2, k: 1 },
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
    municipioProcedencia: null,
    ab: 0,
    K: 1.0,
    sotanos: 0,
    H: 3,
    // Una sola planta: n = 1 y, sin sótanos, nTotal = 1.
    plantas: [plantaTipo('Planta 1', 3, 100)],
    regularidadGeometrica: null,
    soportesContinuos: null,
    regularidadMecanica: null,
    excentricidadDeclarada: null,
  };
}

// ── Derivadas del recuento de plantas ────────────────────────────────────────

/**
 * `n` de la Norma: plantas SOBRE RASANTE. Es la tabla de plantas, contada.
 *
 * Sale de aquí y de ningún otro sitio. Alimenta T_F (0,09·n y las otras cuatro
 * expresiones), el número de modos y el requisito (1) del art. 3.5.1, mientras
 * la masa sale de esas mismas filas: que pudieran no coincidir era un fallo
 * silencioso —T_F subía y la masa se quedaba— que ningún número delataba.
 */
export function plantasSobreRasante(s: Pick<SeismicState, 'plantas'>): number {
  return s.plantas.length;
}

/**
 * `nTotal`: plantas totales, sótanos incluidos. El ÚNICO sitio de la Norma que
 * cuenta así es la pasarela de las cuatro plantas del art. 3.5.1.
 */
export function plantasTotales(s: Pick<SeismicState, 'plantas' | 'sotanos'>): number {
  return s.plantas.length + Math.max(0, Math.trunc(s.sotanos));
}

/**
 * Peso sísmico de una planta [kN], tal y como lo verá el motor.
 *
 * El estado guarda a la vez `P` y el asistente de superficie, y `pesoManual`
 * decide cuál manda; `pesoSismicoPlanta` sólo entiende `PlantaInput`, donde eso
 * se expresa por la PRESENCIA de `P`. La traducción es la misma que hace
 * `toSeismicInput`, y por eso se escribe una vez: si las dos se separan, el
 * peso que se dibuja deja de ser el que se calcula.
 *
 * Existe para PINTAR, y por eso no pasa por `evaluacion.resultado`: un caso
 * exento del art. 1.2.3 no tiene resultado, y con él como única fuente las
 * plantas se enseñaban a «0 kN», como si no pesaran nada.
 */
export function pesoDePlanta(p: PlantaUI): number {
  return pesoSismicoPlanta(
    p.pesoManual
      ? { h: p.h, P: p.P ?? 0 }
      : { h: p.h, area: p.area, componentes: p.componentes },
  );
}

/** Σ P_k [kN] de la tabla de plantas, esté o no exento el caso. */
export function pesoSismicoTotal(s: Pick<SeismicState, 'plantas'>): number {
  return s.plantas.reduce((a, p) => a + pesoDePlanta(p), 0);
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
      n: plantasSobreRasante(s),
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DIMENSIÓN QUE NORMALIZA ES LA PERPENDICULAR, NO LA DE LA PROPIA DIRECCIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * La coordenada de los planos se mide PERPENDICULARMENTE al sismo (es la
 * convención de γ_a del art. 3.7.5, y sin ella no habría brazo de torsión). Los
 * planos que resisten el sismo en X se reparten a lo largo del eje Y, así que la
 * excentricidad que sale de ellos es un desplazamiento EN Y, y el 10 % del
 * requisito (6) hay que medirlo contra la dimensión en planta EN Y — que es
 * `L` de la dirección Y.
 *
 * Antes se normalizaba con `d.L`, la dimensión en el sentido de la oscilación:
 * se comparaba un desplazamiento en Y con una longitud en X. En una planta de
 * 20 × 15 m con e = 1,60 m eso daba 8,0 % (pasaba) donde la lectura de mismo eje
 * da 10,7 % (no pasa). El error caía siempre del lado INSEGURO en plantas
 * alargadas: abría el método simplificado a edificios que no le corresponden.
 */
export function excentricidadDe(
  d: DireccionUI,
  dimensionPerpendicular: number,
): ExcentricidadDireccion | null {
  const suma = d.elementos.reduce((a, el) => a + el.k, 0);
  if (!(suma > 0) || !(dimensionPerpendicular > 0) || d.elementos.length === 0) return null;
  const centroRigidez = d.elementos.reduce((a, el) => a + el.k * el.x, 0) / suma;
  return { e: Math.abs(centroRigidez), dimension: dimensionPerpendicular };
}

// ── Evaluación completa ──────────────────────────────────────────────────────

export interface SeismicEvaluation {
  /** Siempre presente: de aquí sale `ac`, que la puerta del art. 1.2.3 necesita. */
  emplazamiento: EmplazamientoResult;
  aplicabilidad: ApplicabilityResult;
  /** `null` cuando alguna de las dos puertas lo impide, o cuando faltan datos. */
  resultado: SeismicResult | null;
  /**
   * Por qué no hay `resultado`. `null` exactamente cuando lo hay.
   *
   * Une los impedimentos de la puerta con los que sólo se ven con la geometría
   * delante —hoy, la falta de T_F—, para que pantalla, PDF y asistente lean un
   * único sitio en vez de reconstruir el motivo cada uno por su cuenta.
   */
  impedimento: Impedimento | null;
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

  // Cruzadas a propósito: los planos de X se reparten sobre el eje Y, así que
  // su excentricidad se mide contra la dimensión en planta de Y. Ver
  // `excentricidadDe`.
  const ex = excentricidadDe(s.x, s.y.L);
  const ey = excentricidadDe(s.y, s.x.L);
  // Contadas, no declaradas: ver `plantasSobreRasante`.
  const n = plantasSobreRasante(s);
  const nTotal = plantasTotales(s);

  const aplicabilidad = checkApplicability(
    {
      importancia: s.importancia,
      ab: s.ab,
      ac: emplazamiento.ac,
      n,
      ...(s.porticosBienArriostrados == null
        ? {}
        : { porticosBienArriostrados: s.porticosBienArriostrados }),
      sistema: s.sistema,
    },
    {
      importancia: s.importancia,
      n,
      nTotal,
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

  if (!aplicabilidad.puedeCalcular) {
    return { emplazamiento, aplicabilidad, resultado: null, impedimento: aplicabilidad.impedimento };
  }

  // Segunda puerta, la que la aplicabilidad no puede ver: sin T_F no hay cadena
  // de fuerzas. Se comprueba ANTES de calcular y con la misma función que usa
  // el motor, porque calcular igualmente producía un documento entero —modos,
  // cortantes, reparto, ocho combinaciones— levantado sobre T_F = 0.
  const ejesSinTF = (['x', 'y'] as const).filter(
    (eje) => resolverTF(input[eje], input.estructura) === null,
  );
  if (ejesSinTF.length > 0) {
    return {
      emplazamiento,
      aplicabilidad,
      resultado: null,
      impedimento: {
        motivo: 'faltan-datos-de-calculo',
        articulo: '3.7.2.2',
        texto:
          `No hay período fundamental en ${ejesSinTF.length === 2 ? 'ninguna de las dos direcciones' : `la dirección ${ejesSinTF[0].toUpperCase()}`}. ` +
          TEXTO_SIN_TF,
      },
    };
  }

  return { emplazamiento, aplicabilidad, resultado: calcularSismo(input), impedimento: null };
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
 * Sótanos, incluida la migración de los casos guardados con el modelo anterior.
 *
 * Aquellos llevaban `n` y `nTotal` sueltos. La conversión honesta es
 * `sotanos = nTotal - n`, y se acota a cero por abajo porque los estados
 * viejos PODÍAN traer `nTotal < n`: eso era justamente el fallo, y un caso
 * archivado con esa incoherencia no puede reaparecer con sótanos negativos.
 *
 * Se prefiere `nTotal - plantas.length` sobre `nTotal - n` porque `plantas` es
 * lo que de verdad describe el edificio; un `n` desincronizado del modelo viejo
 * no debe sobrevivir a la migración.
 */
function sotanosNorm(s: Record<string, unknown>, nPlantas: number): number {
  if (typeof s.sotanos === 'number' && Number.isFinite(s.sotanos)) {
    return Math.max(0, Math.trunc(s.sotanos));
  }
  if (typeof s.nTotal === 'number' && Number.isFinite(s.nTotal)) {
    return Math.max(0, Math.trunc(s.nTotal) - nPlantas);
  }
  return 0;
}

/**
 * La procedencia viene de localStorage o de una share-URL, así que se valida
 * campo a campo. Ante cualquier duda se devuelve `null`, y `null` significa
 * "de la capa del IGN": es el caso de 2.609 de los 2.635 municipios, y además
 * es el que NO añade advertencias al PDF. Degradar hacia el silencio es seguro
 * aquí porque `ab` y `K` viajan aparte y no dependen de esto.
 */
function procedenciaNorm(v: unknown): Procedencia | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  if (p.tipo === 'anejo1-texto') {
    return typeof p.boe === 'string' ? { tipo: 'anejo1-texto', boe: p.boe } : null;
  }
  if (p.tipo === 'correccion') {
    return typeof p.motivo === 'string' ? { tipo: 'correccion', motivo: p.motivo } : null;
  }
  if (p.tipo === 'segregado') {
    const padre = (p.padre ?? {}) as Record<string, unknown>;
    if (typeof padre.ine !== 'string' || typeof padre.nombre !== 'string') return null;
    if (typeof p.anio !== 'number' || !Number.isFinite(p.anio)) return null;
    return {
      tipo: 'segregado',
      padre: { ine: padre.ine, nombre: padre.nombre },
      anio: p.anio,
      ...(p.fusion === true ? { fusion: true } : {}),
    };
  }
  return null;
}

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
    municipioProcedencia: procedenciaNorm(s.municipioProcedencia),
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
    sotanos: sotanosNorm(s, plantas.length),
    H: num(s.H, d.H),
    omega: num(s.omega, d.omega),
    mu: num(s.mu, d.mu),
    nModosModo: s.nModosModo === 'manual' ? 'manual' : 'auto',
    nModosManual: num(s.nModosManual, d.nModosManual),
    plantas: plantas.length ? plantas : d.plantas,
    ...conTFAcorde(normalizarDireccion(s.x, d.x), normalizarDireccion(s.y, d.y)),
    porticosBienArriostrados: boolNull(s.porticosBienArriostrados),
    regularidadGeometrica: boolNull(s.regularidadGeometrica),
    soportesContinuos: boolNull(s.soportesContinuos),
    regularidadMecanica: boolNull(s.regularidadMecanica),
    excentricidadDeclarada: boolNull(s.excentricidadDeclarada),
  };
}

/**
 * El conmutador de T_F es UNO para las dos direcciones, y aquí se hace cumplir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO PUEDEN IR POR LIBRE
 * ─────────────────────────────────────────────────────────────────────────────
 * El panel enseña un solo conmutador —el de X— y el botón cambia las dos a la
 * vez, así que el estado con X en manual e Y en auto no se puede alcanzar
 * tecleando... pero sí abriendo un enlace, porque cada dirección se normalizaba
 * por su cuenta. Y una vez dentro no había salida: la pantalla enseña el modo
 * de X, el botón alterna los dos, y las dos se quedan cruzadas para siempre.
 *
 * Manda `x`, que es la que se ve. Si X viene en manual con un período válido,
 * Y adopta el mismo; si no, las dos a auto.
 */
function conTFAcorde(x: DireccionUI, y: DireccionUI): { x: DireccionUI; y: DireccionUI } {
  const modo = x.TFModo === 'manual' && x.TFManual > 0 ? 'manual' : 'auto';
  const manual = modo === 'manual' ? x.TFManual : 0;
  return {
    x: { ...x, TFModo: modo, TFManual: manual },
    y: { ...y, TFModo: modo, TFManual: manual },
  };
}

/**
 * Los planos, en el orden de la planta: de menor a mayor coordenada.
 *
 * El número de un plano —la fila de la tabla, la burbuja del dibujo, la
 * columna j del reparto— es su ORDEN EN PLANTA, y sólo lo es si la lista está
 * ordenada. Un plano añadido y luego movido al medio salía como «5» entre el 2
 * y el 3, y eso no lo entendía nadie. La tabla no se puede ordenar tecla a
 * tecla (una fila que salta bajo el cursor es ineditable), así que se ordena
 * aquí, al cargar, y en el editor cuando el foco sale de la tabla o se cierra.
 *
 * Estable, y devuelve la MISMA lista si ya estaba en orden: así una llamada de
 * más no dispara ni un render ni un guardado.
 */
export function ordenarElementos(elementos: ElementoResistente[]): ElementoResistente[] {
  const ordenados = elementos
    .map((el, i) => ({ el, i }))
    .sort((a, b) => a.el.x - b.el.x || a.i - b.i)
    .map(({ el }) => el);
  return ordenados.every((el, i) => el === elementos[i]) ? elementos : ordenados;
}

function normalizarDireccion(x: unknown, porDefecto: DireccionUI): DireccionUI {
  if (!x || typeof x !== 'object') return porDefecto;
  const o = x as Record<string, unknown>;
  const els = Array.isArray(o.elementos) ? o.elementos : [];
  return {
    L: num(o.L, porDefecto.L),
    B: num(o.B, porDefecto.B),
    elementos: ordenarElementos(
      els.map((e) => {
        const el = (e ?? {}) as Record<string, unknown>;
        return {
          id: typeof el.id === 'string' && el.id ? el.id : newId(),
          // El signo de `x` se CONSERVA. Guardar |x| destruiría la geometría y
          // dejaría al módulo sin poder calcular el centro de rigidez.
          x: num(el.x, 0),
          k: num(el.k, 1),
        };
      }),
    ),
    TFModo: o.TFModo === 'manual' ? 'manual' : 'auto',
    TFManual: num(o.TFManual, 0),
  };
}


// ── Publicación ─────────────────────────────────────────────────────────────

/**
 * Nombre del módulo en las publicaciones y versión del esquema de `datos`.
 * Tocar `PubSismo` —salvo para añadir campos opcionales— obliga a subir
 * `PUB_VERSION`: un consumidor que pide la v1 y encuentra la v2 recibe `null`
 * en vez de un objeto a medias (ver `lib/pub`).
 */
export const MODULO_PUB = 'sismo';
export const PUB_VERSION = 1;

/** La fuerza sísmica de una planta, en cada dirección. Simetría con viento. */
export interface PubFuerzaPlanta {
  nombre: string;
  /** Altura de la planta sobre rasante, m. */
  h: number;
  /** Peso sísmico de la planta, kN. */
  P: number;
  /** F_k = V_k − V_(k+1), kN. Puede ser negativa: el SRSS destruye el signo. */
  Fx: number;
  Fy: number;
}

/**
 * Esquema v1 de lo que este módulo publica.
 *
 * Viajan HECHOS y ya derivados —`ac` con su ρ y su S dentro, la ductilidad
 * traducida a su palabra, el impedimento con su artículo—, no la prosa de la
 * pantalla ni el estado interno del módulo: quien lo lee (el cuadro de acciones
 * del plano, la ficha DB SE) no tiene el motor y no puede rehacer la cuenta.
 *
 * Y viaja SIEMPRE, haya cálculo o no. Un edificio exento del art. 1.2.3 no es
 * un edificio sin datos sísmicos: es uno cuyo cuadro tiene que poder decir por
 * qué no lleva fuerzas, que es justamente lo que se firma. Por eso `calculo` es
 * lo único que puede faltar.
 */
export interface PubSismo {
  /** Nombre del municipio; vacío en entrada manual de ab y K. */
  municipio: string;
  /** INE de cinco dígitos, o `null` si ab y K se metieron a mano. */
  ine: string | null;

  // — emplazamiento (cap. 2) —
  /** ab/g, adimensional. */
  ab: number;
  K: number;
  importancia: Importancia;
  /** Coeficiente de riesgo ρ: 1,0 normal / 1,3 especial. */
  rho: number;
  /** Tipo de terreno I-IV, o `null` cuando se ponderó un perfil de estratos. */
  terreno: TipoTerreno | null;
  C: number;
  S: number;
  /** ac/g: la aceleración sísmica de CÁLCULO, la que va al cuadro del plano. */
  ac: number;
  TA: number;
  TB: number;

  // — estructura —
  sistema: SistemaEstructural;
  /** Coeficiente de comportamiento por ductilidad μ, art. 3.7.3.1. */
  mu: number;
  /** «sin ductilidad», «baja», «alta», «muy alta»; `null` si μ no es 1-4. */
  ductilidad: string | null;
  /** Amortiguamiento Ω, % del crítico. */
  omega: number;
  /** Plantas sobre rasante. */
  n: number;
  sotanos: number;
  /** Altura sobre rasante, m. */
  H: number;

  // — la puerta del art. 1.2.3 —
  /** Sí cuando la Norma es de aplicación obligatoria. */
  obligatoria: boolean;
  /** Por qué no hay cálculo, con su artículo. `null` exactamente cuando lo hay. */
  impedimento: { articulo: string; texto: string } | null;

  /** `null` cuando no hay resultado: exento, faltan datos, método no aplicable. */
  calculo: {
    /** Factor de amortiguamiento ν, art. 2.5. */
    nu: number;
    /** Coeficiente de respuesta β = ν/μ, art. 3.7.3.1. */
    beta: number;
    /** Suma de los P_k, kN. */
    pesoSismico: number;
    /** Cortante en la base, kN, en cada dirección. */
    cortanteBasal: { x: number; y: number };
    /** Periodo fundamental T_F, s, en cada dirección. */
    TF: { x: number; y: number };
    fuerzas: PubFuerzaPlanta[];
    /** Opcionales y aditivos (v1.1), para la tabla sísmica completa de la ficha DB SE. */
    nModos?: { x: number; y: number };
    /** El único método del módulo, hoy: el simplificado del art. 3.7. */
    metodo?: 'simplificado';
    /** Categorías de masa presentes en las plantas y no excluidas, para la fracción cuasi-permanente (art. 3.2). */
    categoriasMasa?: CategoriaMasa[];
  } | null;
}

/**
 * La ductilidad en palabras, art. 3.7.3.1. La escala es la del propio artículo
 * —1 sin ductilidad, 2 baja, 3 alta, 4 muy alta— y `null` fuera de ella: un μ
 * intermedio justificado aparte no tiene nombre en la Norma, y ponerle uno
 * sería inventarlo.
 */
export function nombreDuctilidad(mu: number): string | null {
  return { 1: 'sin ductilidad', 2: 'baja', 3: 'alta', 4: 'muy alta' }[mu] ?? null;
}

/** Lo que se publica de un estado ya evaluado. */
export function datosPublicacion(s: SeismicState, ev: SeismicEvaluation): PubSismo {
  const e = ev.emplazamiento;
  const r = ev.resultado;
  // Por ID y no por posición: `calcularSismo` ordena las plantas por altura, y
  // emparejando por índice el nombre de una planta acabaría junto a la fuerza
  // de otra en cuanto las alturas dejaran de ir en orden creciente. Mismo
  // cuidado que el PDF (ver `lib/pdf/seismicNCSE02.ts`).
  const porId = new Map(s.plantas.map((pl) => [pl.id, pl]));
  return {
    municipio: s.municipioNombre.trim(),
    ine: s.municipioIne,
    ab: e.ab,
    K: e.K,
    importancia: s.importancia,
    rho: e.rho,
    terreno: s.terrenoModo === 'tipo' ? s.terreno : null,
    C: e.C,
    S: e.S,
    ac: e.ac,
    TA: e.TA,
    TB: e.TB,
    sistema: s.sistema,
    mu: s.mu,
    ductilidad: nombreDuctilidad(s.mu),
    omega: s.omega,
    n: plantasSobreRasante(s),
    sotanos: s.sotanos,
    H: s.H,
    obligatoria: ev.aplicabilidad.obligatoriedad.estado === 'obligatoria',
    impedimento: ev.impedimento ? { articulo: ev.impedimento.articulo, texto: ev.impedimento.texto } : null,
    calculo: r
      ? {
          nu: r.nu,
          beta: r.beta,
          pesoSismico: r.pesoSismico,
          cortanteBasal: { x: r.x.cortanteBasal, y: r.y.cortanteBasal },
          TF: { x: r.x.TF, y: r.y.TF },
          fuerzas: r.plantas.map((pl, i) => ({
            nombre: (pl.id === undefined ? undefined : porId.get(pl.id))?.nombre ?? `Planta ${i + 1}`,
            h: pl.h,
            P: pl.P,
            Fx: r.x.Fk[i] ?? 0,
            Fy: r.y.Fk[i] ?? 0,
          })),
        }
      : null,
  };
}

/**
 * Publica el resultado. A diferencia de viento y materiales, aquí no hay nada
 * que retener: el emplazamiento siempre está resuelto y un caso exento es un
 * dato tan publicable como uno calculado (ver `PubSismo`).
 *
 * La obra del sobre sale del emplazamiento del propio módulo cuando lo hay —es
 * el municipio con el que se sacaron ab y K, no una referencia de despacho— y
 * cae a `concreta-obra` en la entrada manual.
 */
export function publicarResultado(s: SeismicState, ev: SeismicEvaluation): void {
  const datos = datosPublicacion(s, ev);
  const obra = leerObra();
  publicar(MODULO_PUB, PUB_VERSION, datos, {
    municipio: datos.municipio || obra?.municipio || null,
    // El NOMBRE de la provincia vive en la tabla del capítulo Acciones y este
    // módulo no lo necesita para nada: viaja el INE, que es con lo que un
    // consumidor comprueba que la publicación es de SU obra.
    provincia: null,
    ine: datos.ine ?? obra?.ine ?? (obra?.provincia || null),
  });
}
