// Tipos de dominio del módulo de acción sísmica NCSE-02 (RD 997/2002).
//
// Este fichero no importa React ni el dataset de municipios: el motor de norma
// se testea sin montar UI y sin cargar los ~2.500 municipios del Anejo 1.
//
// Convenios de notación
// ─────────────────────
// Repetidos aquí, y no sólo en el design doc, porque el error más caro de este
// módulo es confundir dos índices que se escriben parecido.
//
//   k       índice de PLANTA. k = 1 la más baja sobre rasante, k = n la cubierta.
//   i       índice de MODO (1, 2, 3).
//   j       índice de ELEMENTO RESISTENTE dentro de una planta. Nunca de planta.
//   n       plantas SOBRE RASANTE. Es la n de las cinco expresiones de T_F
//           (art. 3.7.2.2) y la del requisito (1) del art. 3.5.1.
//   nTotal  plantas EN TOTAL, sótanos incluidos. Aparece en UN solo sitio de
//           toda la Norma: la pasarela de cuatro plantas del art. 3.5.1.
//           NO son lo mismo. Un edificio de 4 plantas sobre rasante con dos
//           sótanos tiene n = 4 y nTotal = 6, y NO entra por la pasarela.
//   h_k     altura de la planta k SOBRE RASANTE [m]. Se usa en Phi_ik.
//   dh_k    altura DE la planta k, h_k - h_(k-1). Se usa en el art. 3.8.
//   H       altura total del edificio sobre rasante [m].
//   P_k     peso sísmico de la planta k [kN].
//   x       coordenada FIRMADA del elemento resistente respecto al centro,
//           perpendicular a la dirección analizada (art. 3.7.5). El estado
//           guarda el signo; abs(x) se aplica sólo dentro de gamma_a.
//
// Unidades: ab y ac son adimensionales, múltiplos de g (ab = 0,23 significa
// 0,23 g). NUNCA en m/s². Es el error que arrastra `Sismo_ISA.xlsx`, cuya celda
// Q12 divide rho*ab entre 9,8116 con ab ya expresada en g y se deja un 2,62% de
// más en S. Ver src/test/fixtures/ncse02.fixtures.ts.

/** Clasificación del art. 1.2.2. Fija rho: normal 1,0 / especial 1,3. */
export type Importancia = "moderada" | "normal" | "especial";

/** Tipo de terreno del art. 2.4. C = 1,0 / 1,3 / 1,6 / 2,0. */
export type TipoTerreno = "I" | "II" | "III" | "IV";

/**
 * Sistema estructural. Los cinco primeros son las cinco familias con expresión
 * de T_F en el art. 3.7.2.2; los tres siguientes son los materiales que el art.
 * 1.2.3 prohíbe cuando la Norma es de aplicación.
 */
export type SistemaEstructural =
  | "fabrica" // muros de fábrica de ladrillo o bloques
  | "porticos-ha" // pórticos de hormigón sin pantallas
  | "porticos-ha-pantallas" // pórticos de hormigón con pantallas
  | "porticos-acero" // pórticos rígidos de acero laminado
  | "acero-triangulado" // acero con planos triangulados resistentes
  | "mamposteria-seco"
  | "adobe"
  | "tapial"
  | "otro";

/** Aviso o bloqueo emitido por el motor, siempre con el artículo que lo funda. */
export interface AvisoNorma {
  id: string;
  articulo: string;
  texto: string;
  severidad: "info" | "aviso" | "bloqueo";
}

// ── Art. 1.2.3 · obligatoriedad ──────────────────────────────────────────────

/** Las TRES exenciones del art. 1.2.3, y sólo esas tres. */
export type MotivoExencion =
  | "importancia-moderada"
  | "ab-inferior-0.04g"
  | "porticos-arriostrados-ab-inferior-0.08g";

/**
 * `indeterminada` no es un fallo: es la fase 2 del design doc. La
 * contraexcepción de las siete plantas depende de ac, y ac exige rho, tipo de
 * terreno y S. Hasta que no hay emplazamiento no se puede decidir esa rama.
 */
export type ObligatoriedadEstado = "obligatoria" | "exenta" | "indeterminada";

export interface ObligatoriedadInput {
  importancia: Importancia;
  /** ab/g, adimensional. El umbral del art. 1.2.3 va sobre ab, NO sobre rho*ab. */
  ab: number;
  /** ac/g. Sólo se necesita para la contraexcepción de más de siete plantas. */
  ac?: number;
  /** Plantas sobre rasante. */
  n: number;
  /** Art. 1.2.3: "pórticos bien arriostrados entre sí en todas las direcciones". */
  porticosBienArriostrados?: boolean;
  sistema?: SistemaEstructural;
}

export interface ObligatoriedadResult {
  estado: ObligatoriedadEstado;
  /** Sólo cuando estado === "exenta". */
  motivo: MotivoExencion | null;
  /** Sólo cuando estado === "indeterminada": qué dato falta para decidir. */
  falta: "ac" | null;
  avisos: AvisoNorma[];
}

// ── Art. 3.5.1 · ámbito del método simplificado ──────────────────────────────

/**
 * `numerico`  lo comprueba la herramienta con los datos introducidos.
 * `declarado` es un juicio del proyectista. El PDF lo recoge como DECLARADO,
 *             nunca como verificado. cumple === null significa "sin declarar",
 *             y sin declarar el módulo no calcula.
 */
export type RequisitoTipo = "numerico" | "declarado";

export interface Requisito {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  texto: string;
  tipo: RequisitoTipo;
  cumple: boolean | null;
  detalle?: string;
}

export interface ExcentricidadDireccion {
  /**
   * Excentricidad entre centro de masas y centro de torsión [m], medida
   * PERPENDICULARMENTE a la dirección del sismo — que es donde está el brazo
   * que produce torsión, y la misma convención que la `x` de γ_a (art. 3.7.5).
   */
  e: number;
  /**
   * Dimensión en planta [m] con la que se compara, sobre EL MISMO EJE en el que
   * está medida `e`: la perpendicular a la dirección analizada. Para la
   * dirección X es, por tanto, la dimensión en Y.
   */
  dimension: number;
}

export type ViaMetodoSimplificado = "requisitos" | "pasarela-4-plantas";

export interface MetodoSimplificadoInput {
  importancia: Importancia;
  /** Plantas sobre rasante — requisito (1). */
  n: number;
  /** Plantas totales, sótanos incluidos — SÓLO para la pasarela. */
  nTotal: number;
  /** Altura sobre rasante [m] — requisito (2). */
  H: number;
  regularidadGeometrica: boolean | null;
  soportesContinuos: boolean | null;
  regularidadMecanica: boolean | null;
  /** Requisito (6) por la vía numérica, cuando hay geometría suficiente. */
  excentricidad?: {
    x?: ExcentricidadDireccion;
    y?: ExcentricidadDireccion;
  };
  /** Requisito (6) por la vía declarada, mientras no haya vía numérica. */
  excentricidadDeclarada?: boolean | null;
}

export interface MetodoSimplificadoResult {
  aplicable: boolean;
  via: ViaMetodoSimplificado | null;
  requisitos: Requisito[];
  avisos: AvisoNorma[];
  /** Texto del bloqueo cuando aplicable === false. null si es aplicable. */
  bloqueo: string | null;
}

// ── Puerta completa ──────────────────────────────────────────────────────────

/**
 * POR QUÉ no se entrega acción sísmica. Son cinco motivos distintos y NO se
 * pueden deducir de `puedeCalcular === false`.
 *
 * Existe porque deducirlos es exactamente lo que se hacía mal. Un edificio de
 * adobe cumple los seis requisitos del art. 3.5.1 y aun así no se calcula,
 * porque el art. 1.2.3 prohíbe el material; el PDF, viendo sólo el booleano,
 * anunciaba «el método simplificado NO es aplicable» y a renglón seguido
 * imprimía los seis requisitos en CUMPLE. Un documento normativo que se
 * contradice en la misma página.
 *
 * Cada consumidor —pantalla, PDF, asistente— lee el mismo motivo y ninguno
 * vuelve a inferirlo por su cuenta.
 */
export type MotivoImpedimento =
  /** Art. 1.2.3: alguna de las tres exenciones. */
  | "norma-no-obligatoria"
  /** Falta `ac` para resolver la contraexcepción de las siete plantas. */
  | "obligatoriedad-indeterminada"
  /** Art. 1.2.3: material prohibido, o fábrica por encima de sus alturas. */
  | "prohibicion-art-1.2.3"
  /** Art. 3.5.1: no se cumplen los requisitos, o están sin declarar. */
  | "metodo-simplificado-no-aplicable"
  /** El método vale, pero falta un dato sin el cual la cadena no se sostiene. */
  | "faltan-datos-de-calculo";

export interface Impedimento {
  motivo: MotivoImpedimento;
  /** Artículo que lo funda, para citarlo. */
  articulo: string;
  /** Explicación lista para enseñar, sin más elaboración. */
  texto: string;
}

export interface ApplicabilityResult {
  obligatoriedad: ObligatoriedadResult;
  /** null cuando la Norma no es de aplicación o falta ac: no se llega a evaluar. */
  metodoSimplificado: MetodoSimplificadoResult | null;
  /** true sólo si la Norma es de aplicación Y el método simplificado es válido. */
  puedeCalcular: boolean;
  /**
   * `null` exactamente cuando `puedeCalcular` es true. Lo que la puerta puede
   * saber; los impedimentos que sólo aparecen al calcular (falta de T_F) los
   * añade `evaluarSismo`, que es quien tiene la geometría delante.
   */
  impedimento: Impedimento | null;
  avisos: AvisoNorma[];
}

// ═════════════════════════════════════════════════════════════════════════════
// CADENA DE FUERZAS
// ═════════════════════════════════════════════════════════════════════════════

// ── Emplazamiento (cap. 2) ───────────────────────────────────────────────────

/** Estrato para ponderar C en los 30 m superiores (art. 2.4). */
export interface Estrato {
  C: number;
  /** Espesor [m]. */
  espesor: number;
}

export interface EmplazamientoInput {
  /** ab/g, adimensional. */
  ab: number;
  K: number;
  importancia: Importancia;
  /** Tipo tabulado I-IV, o perfil de estratos a ponderar. */
  terreno: TipoTerreno | Estrato[];
}

export interface EmplazamientoResult {
  ab: number;
  K: number;
  /** Coeficiente de riesgo: 1,0 normal / 1,3 especial. */
  rho: number;
  C: number;
  S: number;
  /** ac/g, adimensional. */
  ac: number;
  TA: number;
  TB: number;
}

// ── Masas (art. 3.2) ─────────────────────────────────────────────────────────

/**
 * Categorías del art. 3.2. La fracción que llevan asociada gobierna qué parte
 * de la carga es MASA sísmica. NO es el psi_2 del CTE, que gobierna la carga
 * gravitatoria concomitante del art. 3.4. Confundirlas es el error natural.
 */
export type CategoriaMasa =
  | "permanente"
  | "tabiqueria"
  | "uso-residencial"
  | "uso-publico"
  | "uso-aglomeracion"
  | "uso-almacen"
  | "nieve-persistente"
  | "agua";

export interface ComponenteCarga {
  categoria: CategoriaMasa;
  /** Carga superficial [kN/m²]. */
  q: number;
  /**
   * Art. 3.2: las sobrecargas cuentan "siempre que tengan un efecto
   * desfavorable". Excluir una es decisión del proyectista, y el PDF la recoge
   * como declarada.
   */
  excluida?: boolean;
}

export interface PlantaInput {
  id?: string;
  /** Altura de la planta SOBRE RASANTE [m]. */
  h: number;
  /** Superficie en planta [m²]. Sólo para el asistente de cargas. */
  area?: number;
  componentes?: ComponenteCarga[];
  /** Peso sísmico [kN]. Si se da, manda sobre area × componentes. */
  P?: number;
}

export interface PlantaResuelta {
  /**
   * El `id` de la `PlantaInput` que la originó.
   *
   * Existe porque `calcularSismo` ORDENA las plantas por altura antes de nada,
   * y sin el id la única forma de volver a la planta de origen es la posición,
   * que ya no es la misma. Emparejar por posición hacía que la pantalla y el
   * PDF pusieran el nombre de una planta junto al peso y la altura de otra en
   * cuanto las alturas dejaban de estar en orden creciente — al editar la h de
   * una intermedia, o al meter un entresuelo.
   */
  id?: string;
  h: number;
  /** Peso sísmico [kN]. */
  P: number;
}

// ── Estructura y direcciones ─────────────────────────────────────────────────

export interface ElementoResistente {
  id: string;
  /**
   * Coordenada FIRMADA respecto al centro, perpendicular a la dirección
   * analizada [m]. El signo se guarda; abs() sólo se aplica dentro de gamma_a.
   */
  x: number;
  /** Rigidez, relativa (adimensional) o absoluta [kN/m]. */
  k: number;
}

export interface DireccionInput {
  /** Dimensión en planta en el sentido de la oscilación [m]. Expresión (1). */
  L: number;
  /** Dimensión de pantallas o planos triangulados en ese sentido [m]. Expr. (3) y (5). */
  B: number;
  elementos: ElementoResistente[];
  /** Override de T_F para esta dirección [s]. Art. 3.6.2.3.2. */
  TFManual?: number;
}

export interface EstructuraInput {
  sistema: SistemaEstructural;
  /** Plantas sobre rasante. */
  n: number;
  /** Altura sobre rasante [m]. */
  H: number;
  /** Amortiguamiento [%]. */
  omega: number;
  /** Ductilidad, art. 3.7.3.1. */
  mu: number;
  /** Override del número de modos. Sin él se aplica el art. 3.7.2.1. */
  nModos?: number;
}

// ── Resultados ───────────────────────────────────────────────────────────────

export interface ModoResult {
  i: number;
  /** T_i = T_F/(2i−1) [s]. */
  T: number;
  /** alpha_i del art. 3.7.3. NO el espectro elástico del art. 2.3. */
  alpha: number;
  Phi: number[];
  eta: number[];
  /** Coeficiente sísmico, adimensional. */
  s: number[];
  /** Fuerza por planta en este modo [kN]. */
  F: number[];
  /** Cortante por planta en este modo [kN]. */
  V: number[];
  /** Fracción de la masa total movilizada por el modo. */
  participacion: number;
}

export interface RepartoElemento {
  id: string;
  x: number;
  k: number;
  /** Antes de torsión [kN]. */
  fBase: number;
  gamma: number;
  /** Después de torsión [kN]. */
  f: number;
}

export interface RepartoPlanta {
  /** Índice de planta, 1 = la más baja sobre rasante. */
  k: number;
  Fk: number;
  elementos: RepartoElemento[];
}

export interface DireccionResult {
  TF: number;
  /** true si T_F lo impuso el proyectista. */
  TFManual: boolean;
  nModos: number;
  modos: ModoResult[];
  /** Cortante de planta combinado por SRSS [kN]. */
  Vk: number[];
  /** F_k = V_k − V_(k+1) [kN]. Puede ser negativo: el SRSS destruye el signo. */
  Fk: number[];
  cortanteBasal: number;
  participacionTotal: number;
  /** Distancia entre los dos elementos más extremos [m]. */
  Le: number;
  reparto: RepartoPlanta[];
  avisos: AvisoNorma[];
}

/** Uno de los ocho casos del art. 3.4. Los factores van con signo. */
export interface CasoDireccional {
  id: string;
  /** Factor sobre la acción en X. */
  fx: number;
  /** Factor sobre la acción en Y. */
  fy: number;
  /** Cortante basal resultante en X [kN]. */
  Vx: number;
  /** Cortante basal resultante en Y [kN]. */
  Vy: number;
}

export interface SeismicInput {
  emplazamiento: EmplazamientoInput;
  estructura: EstructuraInput;
  plantas: PlantaInput[];
  x: DireccionInput;
  y: DireccionInput;
}

export interface SeismicResult {
  emplazamiento: EmplazamientoResult;
  /** Factor de amortiguamiento, art. 2.5. */
  nu: number;
  /** Coeficiente de respuesta beta = nu/mu, art. 3.7.3.1. */
  beta: number;
  plantas: PlantaResuelta[];
  /** Suma de P_k [kN]. */
  pesoSismico: number;
  x: DireccionResult;
  y: DireccionResult;
  direccionales: CasoDireccional[];
  avisos: AvisoNorma[];
}
