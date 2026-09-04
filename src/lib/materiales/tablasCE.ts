/**
 * Tablas del Código Estructural (RD 470/2021, BOE-A-2021-13681), transcritas
 * literalmente desde el texto publicado en el BOE.
 *
 * Regla del módulo: aquí NO se calcula nada. Sólo viven los números de la norma
 * y su referencia. Toda la lógica está en `derive.ts` y `anclajes.ts`, para que
 * una discrepancia con un cuadro real se pueda localizar en un sitio o en otro,
 * nunca en los dos.
 *
 * Advertencia de transcripción: en la tabla 43.2.1.a del PDF del BOE la columna
 * XS2 aparece impresa como «X32» (errata del propio boletín; la tabla 43.2.1.b
 * de la página siguiente, con los mismos encabezados, la imprime bien). Aquí va
 * como XS2.
 */

import type {
  ClaseCorrosividad,
  ClaseEjecucion,
  ClaseExposicion,
  Consistencia,
  NivelControlEjecucion,
  TipoCemento,
  TipoHormigon,
  VidaUtil,
} from './types';

/** Orden de la tabla 27.1.a. Se usa para presentar las clases siempre igual. */
export const ORDEN_CLASES: ClaseExposicion[] = [
  'X0',
  'XC1', 'XC2', 'XC3', 'XC4',
  'XS1', 'XS2', 'XS3',
  'XD1', 'XD2', 'XD3',
  'XF1', 'XF2', 'XF3', 'XF4',
  'XA1', 'XA2', 'XA3',
  'XM1', 'XM2', 'XM3',
];

/** CE tabla 27.1.a — descripción del entorno, para el tooltip del modo Ayuda. */
export const DESCRIPCION_CLASE: Record<ClaseExposicion, string> = {
  X0: 'Sin riesgo de ataque por corrosión: hormigón en masa, o armado en ambiente muy seco (HR < 45 %).',
  XC1: 'Corrosión por carbonatación. Seco o permanentemente húmedo (interior con HR < 65 %, o sumergido en agua no agresiva).',
  XC2: 'Corrosión por carbonatación. Húmedo, raramente seco (enterrado en suelo no agresivo o en contacto permanente con agua).',
  XC3: 'Corrosión por carbonatación. Humedad moderada (interior con HR > 65 %, o exterior protegido de la lluvia).',
  XC4: 'Corrosión por carbonatación. Sequedad y humedad cíclicas (exterior expuesto a la lluvia).',
  XS1: 'Corrosión por cloruros marinos. Expuesto a aerosoles marinos sin contacto directo con el agua del mar.',
  XS2: 'Corrosión por cloruros marinos. Permanentemente sumergido en agua de mar.',
  XS3: 'Corrosión por cloruros marinos. Zona de carrera de mareas, oleaje o salpicaduras.',
  XD1: 'Corrosión por cloruros no marinos. Humedad moderada: exterior expuesto a aerosoles con cloruros.',
  XD2: 'Corrosión por cloruros no marinos. Húmedo, raramente seco: piscinas y aguas industriales con cloruros.',
  XD3: 'Corrosión por cloruros no marinos. Ciclos de humedad y secado: salpicaduras con sales de deshielo, losas de aparcamiento.',
  XF1: 'Ataque hielo/deshielo. Saturación moderada, sin sales fundentes.',
  XF2: 'Ataque hielo/deshielo. Saturación moderada, con sales fundentes.',
  XF3: 'Ataque hielo/deshielo. Saturación alta, sin sales fundentes.',
  XF4: 'Ataque hielo/deshielo. Saturación alta, con sales fundentes o agua de mar.',
  XA1: 'Ataque químico débil conforme a la tabla 27.1.b.',
  XA2: 'Ataque químico moderado conforme a la tabla 27.1.b.',
  XA3: 'Ataque químico alto conforme a la tabla 27.1.b.',
  XM1: 'Erosión/abrasión moderada (losas con tráfico de vehículos).',
  XM2: 'Erosión/abrasión intensa (carretillas con neumáticos).',
  XM3: 'Erosión/abrasión extrema (carretillas con ruedas de acero o cadenas).',
};

// ── CE tabla 43.2.1.a — dosificación mínima ─────────────────────────────────
// `null` = la clase no aplica a ese tipo de hormigón (guion en la tabla).

type PorClase<T> = Record<ClaseExposicion, T>;

const porOrden = <T,>(valores: T[]): PorClase<T> =>
  Object.fromEntries(ORDEN_CLASES.map((c, i) => [c, valores[i]])) as PorClase<T>;

/** CE tabla 43.2.1.a — máxima relación agua/cemento. */
export const AC_MAX: Record<TipoHormigon, PorClase<number | null>> = {
  masa: porOrden([
    0.60,
    null, null, null, null,
    null, null, null,
    null, null, null,
    0.55, 0.50, 0.55, 0.50,
    0.50, 0.50, 0.45,
    0.50, 0.50, 0.50,
  ]),
  armado: porOrden([
    0.60,
    0.60, 0.60, 0.55, 0.55,
    0.50, 0.50, 0.45,
    0.50, 0.50, 0.50,
    0.55, 0.50, 0.55, 0.50,
    0.50, 0.50, 0.45,
    0.50, 0.50, 0.50,
  ]),
  pretensado: porOrden([
    0.60,
    0.60, 0.60, 0.55, 0.55,
    0.45, 0.45, 0.45,
    0.45, 0.45, 0.45,
    0.45, 0.50, 0.45, 0.50,
    0.50, 0.45, 0.45,
    0.50, 0.50, 0.50,
  ]),
};

/** CE tabla 43.2.1.a — contenido mínimo de cemento, kg/m³. */
export const CEMENTO_MIN: Record<TipoHormigon, PorClase<number | null>> = {
  masa: porOrden([
    200,
    null, null, null, null,
    null, null, null,
    null, null, null,
    275, 300, 275, 300,
    275, 300, 325,
    300, 300, 300,
  ]),
  armado: porOrden([
    250,
    275, 275, 300, 300,
    300, 325, 350,
    325, 325, 325,
    300, 325, 300, 325,
    325, 350, 350,
    325, 325, 325,
  ]),
  pretensado: porOrden([
    275,
    300, 300, 300, 300,
    300, 325, 350,
    325, 325, 325,
    300, 325, 300, 325,
    325, 350, 350,
    325, 325, 325,
  ]),
};

/** CE tabla 43.2.1.b — resistencia característica mínima esperada, N/mm². */
export const FCK_MIN: Record<TipoHormigon, PorClase<number | null>> = {
  masa: porOrden([
    20,
    null, null, null, null,
    null, null, null,
    null, null, null,
    30, 30, 30, 30,
    30, 30, 35,
    30, 30, 30,
  ]),
  armado: porOrden([
    25,
    25, 25, 30, 30,
    30, 30, 35,
    30, 30, 30,
    30, 30, 30, 30,
    30, 30, 35,
    30, 30, 30,
  ]),
  pretensado: porOrden([
    25,
    25, 25, 30, 30,
    30, 35, 35,
    35, 35, 35,
    30, 30, 30, 30,
    30, 35, 35,
    30, 30, 30,
  ]),
};

/** CE tabla 43.3.5 — contenido máximo de cemento en clases de exposición XM, kg/m³. */
export const CEMENTO_MAX_XM: { tamMaxArido: number; cementoMax: number }[] = [
  { tamMaxArido: 10, cementoMax: 400 },
  { tamMaxArido: 20, cementoMax: 375 },
  { tamMaxArido: 40, cementoMax: 350 },
];

// ── CE tabla 43.4.1 — margen de recubrimiento Δcdev ─────────────────────────

export const DELTA_CDEV: Record<NivelControlEjecucion, number> = {
  prefabricado_intenso: 0,
  in_situ_intenso: 5,
  normal: 10,
};

export const ETIQUETA_CONTROL_EJECUCION: Record<NivelControlEjecucion, string> = {
  prefabricado_intenso: 'Prefabricado con nivel intenso de control en la instalación',
  in_situ_intenso: 'Ejecutado in situ con nivel intenso de control de ejecución',
  normal: 'Otros casos',
};

// ── CE tabla 44.2.1.1.a — recubrimiento mínimo, corrosión por carbonatación ──

/**
 * La tabla sólo distingue dos familias de cemento y dos tramos de fck. `*` no
 * existe aquí: todas las casillas tienen valor.
 */
export type FamiliaCarbonatacion = 'CEM I' | 'otros';

/** Familia a efectos de la tabla 44.2.1.1.a: CEM I puro, o todo lo demás (incluye adiciones). */
export function familiaCarbonatacion(
  cemento: TipoCemento,
  conAdiciones: boolean,
): FamiliaCarbonatacion {
  return cemento === 'CEM I' && !conAdiciones ? 'CEM I' : 'otros';
}

interface FilaCarbonatacion {
  /** true si fck ≥ 40; false para 25 ≤ fck < 40. */
  fckAlta: boolean;
  familia: FamiliaCarbonatacion;
  cmin: Record<VidaUtil, number>;
}

/** CE tabla 44.2.1.1.a, bloque X0: cualquier cemento, fck ≥ 25. */
export const CMIN_X0: Record<VidaUtil, number> = { 50: 15, 100: 25 };

/** CE tabla 44.2.1.1.a, bloque XC1/XC2/XC3. */
export const CMIN_XC123: FilaCarbonatacion[] = [
  { familia: 'CEM I', fckAlta: false, cmin: { 50: 15, 100: 25 } },
  { familia: 'CEM I', fckAlta: true, cmin: { 50: 10, 100: 20 } },
  { familia: 'otros', fckAlta: false, cmin: { 50: 20, 100: 30 } },
  { familia: 'otros', fckAlta: true, cmin: { 50: 15, 100: 25 } },
];

/** CE tabla 44.2.1.1.a, bloque XC4. */
export const CMIN_XC4: FilaCarbonatacion[] = [
  { familia: 'CEM I', fckAlta: false, cmin: { 50: 20, 100: 30 } },
  { familia: 'CEM I', fckAlta: true, cmin: { 50: 15, 100: 25 } },
  { familia: 'otros', fckAlta: false, cmin: { 50: 25, 100: 35 } },
  { familia: 'otros', fckAlta: true, cmin: { 50: 20, 100: 30 } },
];

// ── CE tabla 44.2.1.1.b — recubrimiento mínimo, corrosión por cloruros ──────

/**
 * Familias de cemento de la tabla 44.2.1.1.b para hormigón armado:
 *  - `A`: CEM III/A, CEM III/B, CEM IV, CEM II/B-V, CEM II/A-D, u hormigón con
 *    microsílice > 6 % o cenizas volantes > 20 %.
 *  - `B`: CEM II/B-S, CEM II/B-P.
 *  - `resto`: el resto de cementos utilizables según el artículo 28.
 */
export type FamiliaCloruros = 'A' | 'B' | 'resto';

export function familiaCloruros(
  cemento: TipoCemento,
  microsilice: boolean,
  cenizasVolantes: boolean,
): FamiliaCloruros {
  if (microsilice || cenizasVolantes) return 'A';
  switch (cemento) {
    case 'CEM III/A':
    case 'CEM III/B':
    case 'CEM IV':
    case 'CEM II/B-V':
    case 'CEM II/A-D':
      return 'A';
    case 'CEM II/B-S':
    case 'CEM II/B-P':
      return 'B';
    default:
      return 'resto';
  }
}

/** Grupos de columnas de la tabla 44.2.1.1.b. XD1, XD2 y XD3 comparten columna. */
export type ColumnaCloruros = 'XS1' | 'XS2' | 'XS3' | 'XD';

/**
 * CE tabla 44.2.1.1.b, hormigón armado.
 * `null` = casilla marcada con `*`: «recubrimientos excesivos, se recomienda un
 * estudio específico». El motor lo convierte en error, no en número inventado.
 */
export const CMIN_CLORUROS_ARMADO: Record<
  FamiliaCloruros,
  Record<VidaUtil, Record<ColumnaCloruros, number | null>>
> = {
  A: {
    50: { XS1: 25, XS2: 30, XS3: 45, XD: 35 },
    100: { XS1: 30, XS2: 35, XS3: 50, XD: 40 },
  },
  B: {
    50: { XS1: 30, XS2: 35, XS3: 65, XD: 40 },
    100: { XS1: 35, XS2: 40, XS3: 70, XD: 45 },
  },
  resto: {
    50: { XS1: 40, XS2: 45, XS3: null, XD: null },
    100: { XS1: 65, XS2: null, XS3: null, XD: null },
  },
};

/**
 * CE tabla 44.2.1.1.b, hormigón pretensado. Sólo distingue dos familias:
 * `A` = CEM II/A-D o CEM I con humo de sílice > 6 %; `resto` = los demás.
 */
export const CMIN_CLORUROS_PRETENSADO: Record<
  'A' | 'resto',
  Record<VidaUtil, Record<ColumnaCloruros, number | null>>
> = {
  A: {
    50: { XS1: 30, XS2: 35, XS3: 50, XD: 40 },
    100: { XS1: 35, XS2: 40, XS3: 65, XD: 45 },
  },
  resto: {
    50: { XS1: 45, XS2: 55, XS3: null, XD: null },
    100: { XS1: null, XS2: null, XS3: null, XD: null },
  },
};

// ── CE tabla 44.3 — recubrimiento mínimo, clases XF ─────────────────────────

export type FamiliaXF = 'CEM III' | 'CEM II/A-D' | 'otros';

export function familiaXF(cemento: TipoCemento, conAdiciones: boolean): FamiliaXF {
  if (cemento === 'CEM III/A' || cemento === 'CEM III/B') return 'CEM III';
  if (cemento === 'CEM II/A-D' && !conAdiciones) return 'CEM II/A-D';
  return 'otros';
}

interface FilaXF {
  familia: FamiliaXF;
  fckAlta: boolean;
  cmin: Record<VidaUtil, number | null>;
}

/** CE tabla 44.3, bloque XF1/XF3. No tiene fila para CEM II/A-D: cae en «otros». */
export const CMIN_XF13: FilaXF[] = [
  { familia: 'CEM III', fckAlta: false, cmin: { 50: 25, 100: 50 } },
  { familia: 'CEM III', fckAlta: true, cmin: { 50: 15, 100: 25 } },
  { familia: 'otros', fckAlta: false, cmin: { 50: 20, 100: 35 } },
  { familia: 'otros', fckAlta: true, cmin: { 50: 10, 100: 20 } },
];

/** CE tabla 44.3, bloque XF2/XF4. */
export const CMIN_XF24: FilaXF[] = [
  { familia: 'CEM II/A-D', fckAlta: false, cmin: { 50: 25, 100: 50 } },
  { familia: 'CEM II/A-D', fckAlta: true, cmin: { 50: 15, 100: 35 } },
  { familia: 'CEM III', fckAlta: false, cmin: { 50: 40, 100: null } },
  { familia: 'CEM III', fckAlta: true, cmin: { 50: 20, 100: 40 } },
  { familia: 'otros', fckAlta: false, cmin: { 50: 20, 100: 40 } },
  { familia: 'otros', fckAlta: true, cmin: { 50: 10, 100: 20 } },
];

// ── CE tabla 44.4 — recubrimiento mínimo, clases XA ─────────────────────────

/**
 * XA1 con CEM III, CEM IV, CEM II/B-S, B-P, B-V, A-D, o microsílice > 6 % o
 * cenizas volantes > 20 %. El resto de cementos está marcado `*`.
 * XA2 y XA3 llevan la nota (1): los fija el autor del proyecto.
 */
export const CMIN_XA1: Record<'grupo' | 'resto', Record<VidaUtil, number | null>> = {
  grupo: { 50: 40, 100: 55 },
  resto: { 50: null, 100: null },
};

export function familiaXA1(
  cemento: TipoCemento,
  microsilice: boolean,
  cenizasVolantes: boolean,
): 'grupo' | 'resto' {
  if (microsilice || cenizasVolantes) return 'grupo';
  switch (cemento) {
    case 'CEM III/A':
    case 'CEM III/B':
    case 'CEM IV':
    case 'CEM II/B-S':
    case 'CEM II/B-P':
    case 'CEM II/B-V':
    case 'CEM II/A-D':
      return 'grupo';
    default:
      return 'resto';
  }
}

// ── CE tabla 44.5 — sobre-espesor del recubrimiento en clases XM ────────────

/**
 * Ojo: las clases XM no dan un cmin propio. El artículo 44.5 dice que el
 * recubrimiento sale «del resto de criterios (mecánicos o de durabilidad) más
 * un sobre-espesor». Es una SUMA, no un máximo.
 */
export const SOBREESPESOR_XM: Record<'XM1' | 'XM2' | 'XM3', number> = {
  XM1: 5,
  XM2: 10,
  XM3: 15,
};

// ── CE tabla 33.5.a — clases de consistencia ────────────────────────────────

export const CONSISTENCIAS: Record<
  Consistencia,
  { letra: string; etiqueta: string; asentamiento: string }
> = {
  seca: { letra: 'S', etiqueta: 'Seca', asentamiento: '0-20 mm' },
  plastica: { letra: 'P', etiqueta: 'Plástica', asentamiento: '30-40 mm' },
  blanda: { letra: 'B', etiqueta: 'Blanda', asentamiento: '50-90 mm' },
  fluida: { letra: 'F', etiqueta: 'Fluida', asentamiento: '100-150 mm' },
  liquida: { letra: 'L', etiqueta: 'Líquida', asentamiento: '160-210 mm' },
};

/**
 * CE 33.5, párrafos que siguen a la tabla 33.5.a. La tabla enumera las cinco
 * clases, pero el texto restringe tres de ellas y prescribe una cuarta; sin
 * esto, la tabla sola haría creer que las cinco están igual de disponibles.
 *
 *   «Salvo justificación específica en aplicaciones que así lo requieran, no se
 *   empleará las consistencias seca y plástica. Además, no podrá emplearse la
 *   consistencia líquida, salvo que se consiga mediante el empleo de aditivos
 *   superplastificantes.»
 *
 *   «En obras de edificación, para pilares, forjados y vigas se utilizará un
 *   hormigón de consistencia fluida salvo justificación en contra.»
 */
export const CONSISTENCIAS_DESACONSEJADAS: Consistencia[] = ['seca', 'plastica'];
export const CONSISTENCIA_CON_SUPERPLASTIFICANTE: Consistencia = 'liquida';
export const CONSISTENCIA_EDIFICACION: Consistencia = 'fluida';

/** CE 33.6 — serie recomendada de resistencias características especificadas. */
export const SERIE_FCK = [20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100];

/** CE Anejo 10 §3 — el único hormigón de limpieza utilizable se tipifica HL-150/C/TM. */
export const TIPIFICACION_HORMIGON_LIMPIEZA = 'HL-150/C/TM';
export const CEMENTO_MIN_HL = 150;

// ── CE tabla A19.2.1 — coeficientes parciales de los materiales, ELU ────────

export const GAMMA_MATERIALES = {
  hormigon: { persistente: 1.5, accidental: 1.3 },
  armaduraPasiva: { persistente: 1.15, accidental: 1.0 },
  armaduraActiva: { persistente: 1.15, accidental: 1.0 },
  /** Acero estructural: γM0 del Anejo 22; en situación accidental, 1,00. */
  aceroEstructural: { persistente: 1.05, accidental: 1.0 },
} as const;

// ── CE tabla A19.3.1 — resistencia a tracción del hormigón ──────────────────

/**
 * Valores TABULADOS de fctm y fctk;0,05, no los calculados con 0,30·fck^(2/3).
 * La diferencia importa: la tabla de anclajes de un plano sale de estos, y con
 * los calculados los números se mueven ±2 cm. (`src/data/materials.ts` guarda
 * los calculados porque los usan los módulos de sección; aquí manda la tabla.)
 */
export const FCTK_005: Record<number, number> = {
  12: 1.1, 16: 1.3, 20: 1.5, 25: 1.8, 30: 2.0, 35: 2.2, 40: 2.5, 45: 2.7,
  50: 2.9, 55: 3.0, 60: 3.1, 70: 3.2, 80: 3.4, 90: 3.5,
};

export const FCTM_TABULADA: Record<number, number> = {
  12: 1.6, 16: 1.9, 20: 2.2, 25: 2.6, 30: 2.9, 35: 3.2, 40: 3.5, 45: 3.8,
  50: 4.1, 55: 4.2, 60: 4.4, 70: 4.6, 80: 4.8, 90: 5.0,
};

// ── CE tabla 49.5.1.2.a — coeficiente m del método simplificado de anclaje ──

/**
 * El artículo 49.5 ofrece un método simplificado (lbI = m·ø² ≥ fyk·ø/20) que
 * NO da los mismos números que el Anejo 19. Se guarda aquí porque hay cuadros
 * de plano que lo citan, y porque el test golden necesita demostrar cuál de los
 * dos reproduce la tabla del usuario.
 */
export const COEFICIENTE_M: { fck: number; B400: number; B500: number }[] = [
  { fck: 25, B400: 1.2, B500: 1.5 },
  { fck: 30, B400: 1.0, B500: 1.3 },
  { fck: 35, B400: 0.9, B500: 1.2 },
  { fck: 40, B400: 0.8, B500: 1.1 },
  { fck: 45, B400: 0.7, B500: 1.0 },
  { fck: 50, B400: 0.7, B500: 1.0 },
];

// ── CE tabla 91.1 — determinación de la clase de ejecución ──────────────────

export const CLASE_EJECUCION: Record<string, ClaseEjecucion> = {
  'CC1|SC1|PC1': 1,
  'CC1|SC1|PC2': 2,
  'CC1|SC2|PC1': 2,
  'CC1|SC2|PC2': 2,
  'CC2|SC1|PC1': 2,
  'CC2|SC1|PC2': 2,
  'CC2|SC2|PC1': 3,
  'CC2|SC2|PC2': 3,
  'CC3|SC1|PC1': 3,
  'CC3|SC1|PC2': 3,
  'CC3|SC2|PC1': 3,
  'CC3|SC2|PC2': 4,
};

/**
 * CE 91.2.2.2 — categoría de ejecución. PC1: componentes sin uniones soldadas,
 * o con soldaduras hechas en taller en acero de grado inferior a S355. PC2:
 * soldaduras en acero de grado S355 o superior, soldadura en obra de elementos
 * principales, tratamiento térmico durante la fabricación, o perfiles huecos
 * con recortes en boca de lobo. Aquí sólo vive el umbral de grado, que es lo
 * único que el motor puede comprobar con los datos del cuadro.
 */
export const GRADO_ACERO_PC2 = 355;

// ── CE tabla 80.1.a — corrosividad atmosférica del acero estructural ────────

export const DESCRIPCION_CORROSIVIDAD: Record<ClaseCorrosividad, string> = {
  C1: 'Muy baja. Interiores con calefacción y atmósferas limpias: oficinas, tiendas, colegios, hoteles.',
  C2: 'Baja. Atmósferas con bajos niveles de contaminación, áreas rurales; interiores sin calefacción con posibles condensaciones.',
  C3: 'Media. Atmósferas urbanas e industriales con moderada contaminación; áreas costeras con baja salinidad.',
  C4: 'Alta. Áreas industriales y áreas costeras con salinidad moderada; plantas químicas, piscinas.',
  C5: 'Muy alta. Áreas industriales con humedad elevada y atmósfera agresiva; áreas costeras y marinas con alta salinidad.',
};

// ── Límites elásticos ───────────────────────────────────────────────────────

/** CE artículo 34 — armaduras pasivas. */
export const FYK_ACERO_PASIVO: Record<string, number> = {
  B400S: 400,
  B500S: 500,
  B400SD: 400,
  B500SD: 500,
};

/** CE artículo 34 — mallas electrosoldadas. */
export const FYK_MALLA: Record<string, number> = {
  'ME-500 T': 500,
  'ME-500 SD': 500,
};

/** CE artículo 76 / UNE-EN 10025-2 — aceros estructurales (t ≤ 16 mm). */
export const FY_ACERO_ESTRUCTURAL: Record<string, number> = {
  S235JR: 235,
  S275JR: 275,
  S355JR: 355,
  S355J2: 355,
  S450J0: 450,
};
