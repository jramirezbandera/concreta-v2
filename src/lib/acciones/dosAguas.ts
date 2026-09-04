/**
 * Presión del viento sobre una cubierta a dos aguas (DB SE-AE, Anejo D.6).
 *
 *   qe,zona = qb · ce(h) · cpe,zona                                      (3.1)
 *   cpe,A = cpe,1 + (cpe,10 − cpe,1) · log10 A,   1 m² < A < 10 m²      (D.4)
 *
 * La cubierta se reparte en las zonas F, G, H, I y J de la figura de la
 * tabla D.6, con e = min(b, 2h): b es la dimensión perpendicular al viento,
 * d la paralela y h la altura de coronación. Se estudian las dos direcciones
 * de la norma: viento perpendicular a la cumbrera (θ = 0º, tabla a) y
 * paralelo (θ = 90º, tabla b). Cada zona recibe su coeficiente interpolando
 * la pendiente en la tabla (D.3-2) —la serie de succión y la de presión por
 * separado, que para eso están los «±0,0»— y, si su área de influencia queda
 * entre 1 y 10 m², la fórmula D.4.
 *
 * Es lo que hace la hoja «DOS AGUAS» del estudio, con las diferencias que
 * documenta el test: la hoja escalona cpe,10 / cpe,1 en 10 m² en vez de
 * aplicar la D.4, su tabla de cpe,1 con viento paralelo es una copia de la
 * de cpe,10, y aproxima las áreas de H e I en esa dirección.
 *
 * Ninguna función de este fichero contiene un número de la norma: todos
 * vienen de `tablasAE.ts`.
 */

import {
  AREA_CPE,
  GEOMETRIA_D6,
  PENDIENTE_CASI_PLANA,
  PENDIENTE_D6,
  TABLA_D6_PARALELA,
  TABLA_D6_PERPENDICULAR,
  ZONAS_D6_PARALELA,
  ZONAS_D6_PERPENDICULAR,
  type FilaD6,
  type ZonaDosAguas,
} from './tablasAE';

// ── Entrada ─────────────────────────────────────────────────────────────────

/** Perpendicular a la cumbrera (θ = 0º) o paralela a ella (θ = 90º). */
export type DireccionCubierta = 'perpendicular' | 'paralela';

export interface DosAguasInput {
  /** Pendiente de los faldones, grados sexagesimales; negativa si bajan hacia el centro. */
  pendiente: number;
  /** Altura de coronación (el punto más alto de la cubierta) sobre rasante, m. */
  alturaCoronacion: number;
  /** Longitud de la cumbrera, m. */
  longitudCumbrera: number;
  /** Dimensión en planta perpendicular a la cumbrera (los dos faldones proyectados), m. */
  anchoCubierta: number;
  /** qb · ce a la altura de coronación, kN/m². */
  qe: number;
  /**
   * Área de influencia del elemento que se comprueba, m² (Anejo D.3-3). Si
   * falta, la de cada zona en planta: lo que ve la estructura general.
   */
  areaInfluencia?: number;
}

// ── Salida ──────────────────────────────────────────────────────────────────

/** Coeficiente de presión exterior de una zona: succión (≤ 0) y/o presión (≥ 0), D.3-2. */
export interface Cpe {
  succion: number | null;
  presion: number | null;
}

export interface ZonaEnPlanta {
  zona: ZonaDosAguas;
  /** Dónde está, en lenguaje de obra. */
  descripcion: string;
  /** Rectángulos iguales que forman la zona (F son dos rincones). */
  piezas: number;
  /** Cada rectángulo en planta: ancho paralelo a la fachada de barlovento, m. */
  ancho: number;
  /** Fondo en la dirección del viento, m. */
  fondo: number;
  /** Área en planta de UNA pieza, m². */
  area: number;
}

export interface ZonaResuelta extends ZonaEnPlanta {
  /** Área de influencia con la que se ha escogido el coeficiente, m². */
  A: number;
  cpe10: Cpe;
  cpe1: Cpe;
  /** El coeficiente adoptado para A (D.4 entre 1 y 10 m²). */
  cpe: Cpe;
  /** qe · cpe, kN/m²; la succión es negativa. */
  succion: number | null;
  presion: number | null;
}

export interface DireccionResuelta {
  direccion: DireccionCubierta;
  /** Ángulo θ de la norma. */
  theta: 0 | 90;
  /** Dimensión perpendicular al viento, m. */
  b: number;
  /** Dimensión paralela al viento, m. */
  d: number;
  /** e = min(b, 2h), m. */
  e: number;
  zonas: ZonaResuelta[];
}

export interface DosAguasResultado {
  pendiente: number;
  alturaCoronacion: number;
  qe: number;
  /** null = la de cada zona. */
  areaInfluencia: number | null;
  perpendicular: DireccionResuelta;
  paralela: DireccionResuelta;
  notas: string[];
  avisos: string[];
  errores: string[];
}

// ── Zonas de la figura ──────────────────────────────────────────────────────

export const DESCRIPCION_ZONAS: Record<DireccionCubierta, Partial<Record<ZonaDosAguas, string>>> = {
  perpendicular: {
    F: 'rincones del alero a barlovento',
    G: 'resto del alero a barlovento',
    H: 'faldón a barlovento, hasta la cumbrera',
    I: 'faldón a sotavento, más allá de la banda de la cumbrera',
    J: 'faldón a sotavento, banda junto a la cumbrera',
  },
  paralela: {
    F: 'rincones del hastial a barlovento, uno por faldón',
    G: 'resto del borde del hastial, por faldón',
    H: 'de la banda del hastial hasta e/2, por faldón',
    I: 'resto del faldón, más allá de e/2',
  },
};

/** Figura D.6: e = min(b, 2h). */
export function parametroE(b: number, h: number): number {
  return Math.max(0, Math.min(b, 2 * h));
}

/**
 * Las zonas en planta de la figura D.6 para una dirección: b perpendicular
 * al viento, d paralela, h la altura de coronación. Con viento perpendicular
 * a la cumbrera b ES la cumbrera y cada faldón tiene d/2 de fondo; con viento
 * paralelo b es el hastial, cada faldón tiene b/2 de ancho y d es la
 * cumbrera. Una banda que no cabe en el faldón se recorta, y una zona que se
 * queda sin sitio sale con fondo cero.
 */
export function zonasEnPlanta(direccion: DireccionCubierta, b: number, d: number, h: number): { e: number; zonas: ZonaEnPlanta[] } {
  const e = parametroE(b, h);
  const anchoF = e / GEOMETRIA_D6.divisorF;
  const descripcion = DESCRIPCION_ZONAS[direccion];
  const zona = (z: ZonaDosAguas, piezas: number, ancho: number, fondo: number): ZonaEnPlanta => ({
    zona: z,
    descripcion: descripcion[z] ?? '',
    piezas,
    ancho,
    fondo,
    area: ancho * fondo,
  });

  if (direccion === 'perpendicular') {
    const faldon = d / 2;
    const banda = Math.min(e / GEOMETRIA_D6.divisorBanda, faldon);
    return {
      e,
      zonas: [
        zona('F', 2, anchoF, banda),
        zona('G', 1, Math.max(0, b - 2 * anchoF), banda),
        zona('H', 1, b, Math.max(0, faldon - banda)),
        zona('I', 1, b, Math.max(0, faldon - banda)),
        zona('J', 1, b, banda),
      ],
    };
  }

  const faldon = b / 2;
  const banda = Math.min(e / GEOMETRIA_D6.divisorBanda, d);
  const hastaH = Math.min(e / GEOMETRIA_D6.divisorH, d);
  return {
    e,
    zonas: [
      zona('F', 2, anchoF, banda),
      zona('G', 2, Math.max(0, faldon - anchoF), banda),
      zona('H', 2, faldon, Math.max(0, hastaH - banda)),
      zona('I', 2, faldon, Math.max(0, d - e / GEOMETRIA_D6.divisorH)),
    ],
  };
}

// ── Coeficientes ────────────────────────────────────────────────────────────

/**
 * Una serie (succión o presión) de una zona, interpolada en la pendiente. Una
 * fila exacta devuelve su casilla tal cual; entre dos filas se interpola sólo
 * si las dos tienen la serie —si a una le falta, la serie no aplica en ese
 * tramo—; fuera de la tabla no hay valor.
 */
function serie(tabla: FilaD6[], indice: number, cual: 'A10' | 'A1', lado: 0 | 1, pendiente: number): number | null {
  const exacta = tabla.find((f) => f.alpha === pendiente);
  if (exacta) return exacta[cual][indice][lado];
  if (pendiente < tabla[0].alpha || pendiente > tabla[tabla.length - 1].alpha) return null;
  let k = 1;
  while (tabla[k].alpha < pendiente) k++;
  const inferior = tabla[k - 1][cual][indice][lado];
  const superior = tabla[k][cual][indice][lado];
  if (inferior === null || superior === null) return null;
  const t = (pendiente - tabla[k - 1].alpha) / (tabla[k].alpha - tabla[k - 1].alpha);
  return inferior + t * (superior - inferior);
}

/** Tabla D.6 interpolada en la pendiente: cpe,10 o cpe,1 de una zona. */
export function coeficienteTabulado(direccion: DireccionCubierta, zona: ZonaDosAguas, pendiente: number, cual: 'A10' | 'A1'): Cpe {
  const tabla = direccion === 'perpendicular' ? TABLA_D6_PERPENDICULAR : TABLA_D6_PARALELA;
  const zonas = direccion === 'perpendicular' ? ZONAS_D6_PERPENDICULAR : ZONAS_D6_PARALELA;
  const i = zonas.indexOf(zona);
  if (i < 0) {
    throw new Error(`La zona ${zona} no existe con viento ${direccion === 'perpendicular' ? 'perpendicular' : 'paralelo'} a la cumbrera`);
  }
  return {
    succion: serie(tabla, i, cual, 0, pendiente),
    presion: serie(tabla, i, cual, 1, pendiente),
  };
}

/** Anejo D.3-4: el coeficiente para un área de influencia A, con la fórmula D.4 entre 1 y 10 m². */
export function coeficienteParaArea(cpe10: Cpe, cpe1: Cpe, A: number): Cpe {
  const mezcla = (c10: number | null, c1: number | null): number | null => {
    if (A >= AREA_CPE.global) return c10;
    if (A <= AREA_CPE.local) return c1;
    if (c10 === null || c1 === null) return c10 ?? c1;
    return c1 + (c10 - c1) * Math.log10(A);
  };
  return { succion: mezcla(cpe10.succion, cpe1.succion), presion: mezcla(cpe10.presion, cpe1.presion) };
}

/**
 * Altura de coronación que se deduce del último forjado: lo que sube el
 * faldón desde el alero, H + (ancho/2)·tan α. Con α ≤ 0 el punto más alto es
 * el propio alero.
 */
export function alturaCoronacionDesdeForjado(H: number, anchoCubierta: number, pendiente: number): number {
  return H + (anchoCubierta / 2) * Math.tan((Math.max(pendiente, 0) * Math.PI) / 180);
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

export function calcularDosAguas(input: DosAguasInput): DosAguasResultado {
  const errores: string[] = [];
  const avisos: string[] = [];
  const notas: string[] = [];
  const { pendiente, alturaCoronacion: h, longitudCumbrera, anchoCubierta, qe } = input;

  if (!(pendiente >= PENDIENTE_D6.min && pendiente <= PENDIENTE_D6.max)) {
    errores.push(`La tabla D.6 cubre pendientes entre ${PENDIENTE_D6.min}º y ${PENDIENTE_D6.max}º; la cubierta tiene ${pendiente}º.`);
  } else if (Math.abs(pendiente) < PENDIENTE_CASI_PLANA) {
    avisos.push(
      `Con ${pendiente}º la cubierta es casi plana: la tabla D.6 no tiene valores entre −${PENDIENTE_CASI_PLANA}º y ${PENDIENTE_CASI_PLANA}º y se interpola a través de ellos; considere la tabla D.4 de cubiertas planas.`,
    );
  }
  if (!(h > 0)) errores.push('La altura de coronación tiene que ser mayor que cero.');
  if (!(longitudCumbrera > 0) || !(anchoCubierta > 0)) {
    errores.push('La cumbrera y el ancho de la cubierta tienen que ser mayores que cero.');
  }
  if (input.areaInfluencia !== undefined && !(input.areaInfluencia > 0)) {
    errores.push('El área de influencia tiene que ser mayor que cero.');
  }

  let hayD4 = false;
  const resolver = (direccion: DireccionCubierta): DireccionResuelta => {
    const b = direccion === 'perpendicular' ? longitudCumbrera : anchoCubierta;
    const d = direccion === 'perpendicular' ? anchoCubierta : longitudCumbrera;
    const { e, zonas } = zonasEnPlanta(direccion, b, d, h);
    return {
      direccion,
      theta: direccion === 'perpendicular' ? 0 : 90,
      b,
      d,
      e,
      zonas: zonas.map((z): ZonaResuelta => {
        const cpe10 = coeficienteTabulado(direccion, z.zona, pendiente, 'A10');
        const cpe1 = coeficienteTabulado(direccion, z.zona, pendiente, 'A1');
        const A = input.areaInfluencia ?? z.area;
        if (A > AREA_CPE.local && A < AREA_CPE.global) hayD4 = true;
        const cpe = coeficienteParaArea(cpe10, cpe1, A);
        return {
          ...z,
          A,
          cpe10,
          cpe1,
          cpe,
          succion: cpe.succion === null ? null : cpe.succion * qe,
          presion: cpe.presion === null ? null : cpe.presion * qe,
        };
      }),
    };
  };
  const perpendicular = resolver('perpendicular');
  const paralela = resolver('paralela');

  notas.push(
    'Coeficientes de presión exterior de la tabla D.6 (Anejo D.3), que recogen el pésimo de las direcciones de viento de cada caso, aplicados a la presión dinámica por el coeficiente de exposición a la altura de coronación (art. 3.3.5-2).',
    'Donde la tabla da dos valores de distinto signo la zona puede pasar de succión a presión: se consideran las dos posibilidades y no se mezclan en una misma cara (Anejo D.3-2 y nota de la tabla D.6).',
  );
  if (input.areaInfluencia === undefined) {
    notas.push('El área de influencia de cada zona es la de la propia zona en planta, que es lo que ve la estructura general; para correas, paneles o anclajes se toma la del elemento (Anejo D.3-3).');
  } else {
    notas.push(`Área de influencia de ${input.areaInfluencia} m², la del elemento comprobado (Anejo D.3-3).`);
  }
  if (hayD4) {
    notas.push(`Áreas de influencia entre ${AREA_CPE.local} y ${AREA_CPE.global} m²: cpe,A = cpe,1 + (cpe,10 − cpe,1)·log10 A (Anejo D.3-4, fórmula D.4).`);
  }

  return {
    pendiente,
    alturaCoronacion: h,
    qe,
    areaInfluencia: input.areaInfluencia ?? null,
    perpendicular,
    paralela,
    notas,
    avisos,
    errores,
  };
}
