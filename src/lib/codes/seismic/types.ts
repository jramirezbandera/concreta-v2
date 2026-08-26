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
  /** Excentricidad entre centro de masas y centro de torsión [m]. */
  e: number;
  /** Dimensión en planta del edificio en esa dirección [m]. */
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

export interface ApplicabilityResult {
  obligatoriedad: ObligatoriedadResult;
  /** null cuando la Norma no es de aplicación o falta ac: no se llega a evaluar. */
  metodoSimplificado: MetodoSimplificadoResult | null;
  /** true sólo si la Norma es de aplicación Y el método simplificado es válido. */
  puedeCalcular: boolean;
  avisos: AvisoNorma[];
}
