/**
 * Presión del viento sobre los paramentos verticales (DB SE-AE, tabla D.3).
 *
 *   qe,zona = qb · ce(h) · cpe,zona                                      (3.1)
 *
 * Cada fachada se reparte según la figura de la tabla D.3: la cara de
 * barlovento es la zona D, la de sotavento la E, y las dos fachadas
 * paralelas al viento llevan A (los primeros e/10 desde la arista de
 * barlovento), B (hasta e) y C (el resto, d − e), con e = min(b, 2h). El
 * coeficiente sale de la tabla interpolando en h/d (5, 1, 0,25) y en el área
 * de influencia (10, 5, 2, 1 m²), como autoriza el Anejo D.3-2.
 *
 * Es el complemento local de la fuerza por planta: ésta usa los coeficientes
 * globales de la tabla 3.5 para la estructura (art. 3.3.4-1); las zonas de
 * la D.3 son para carpinterías, aplacados, anclajes o correas de fachada
 * (art. 3.3.4-3) y para naves sin forjados (art. 3.3.5).
 *
 * Es lo que hace el bloque «ALZADO FRONTAL / LATERAL» de la hoja «DOS AGUAS»
 * del estudio; el test documenta en qué se separa (áreas con una altura de
 * alero mal calculada, la zona B sin recortar a la fachada, y un IF anidado
 * que manda toda área ≤ 5 m² a la fila de 1 m²).
 *
 * Ninguna función de este fichero contiene un número de la norma: todos
 * vienen de `tablasAE.ts`.
 */

import { interpolar } from './interp';
import {
  AREAS_TABLA_D3,
  ESBELTECES_TABLA_D3,
  GEOMETRIA_D3,
  TABLA_D3,
  type ZonaParamento,
} from './tablasAE';

// ── Entrada ─────────────────────────────────────────────────────────────────

export interface ParamentosInput {
  /** Altura del edificio sobre rasante, m: la h de la figura (la coronación si la cubierta es inclinada). */
  h: number;
  /** Altura de las fachadas hasta el último forjado o el alero, m: para las áreas. */
  alturaFachada: number;
  /** Dimensiones en planta, m. */
  dimensiones: { x: number; y: number };
  /** qb · ce a la altura h, kN/m². */
  qe: number;
  /** Área de influencia del elemento comprobado, m² (Anejo D.3-3). Si falta, la de cada zona. */
  areaInfluencia?: number;
}

// ── Salida ──────────────────────────────────────────────────────────────────

export interface ZonaParamentoResuelta {
  zona: ZonaParamento;
  /** Dónde está, en lenguaje de obra. */
  descripcion: string;
  /** Fachadas iguales que llevan la zona (A, B y C van en las dos laterales). */
  piezas: number;
  /** Ancho en planta de la zona, m. */
  ancho: number;
  /** Área de una pieza, m²: ancho × altura de fachada. */
  area: number;
  /** Área de influencia con la que se ha escogido el coeficiente, m². */
  A: number;
  cpe: number;
  /** qe · cpe, kN/m²; negativa es succión. */
  presion: number;
}

export interface DireccionParamentos {
  /** Eje paralelo al viento, como en `DireccionViento`. */
  eje: 'x' | 'y';
  /** Dimensión paralela al viento, m. */
  d: number;
  /** Dimensión perpendicular al viento (la fachada de barlovento), m. */
  b: number;
  /** e = min(b, 2h), m. */
  e: number;
  /** h/d. */
  esbeltez: number;
  /** Sólo las zonas que existen: sin C cuando d ≤ e, sin B cuando d ≤ e/10. */
  zonas: ZonaParamentoResuelta[];
}

export interface ParamentosResultado {
  h: number;
  alturaFachada: number;
  qe: number;
  /** null = la de cada zona. */
  areaInfluencia: number | null;
  x: DireccionParamentos;
  y: DireccionParamentos;
  notas: string[];
  avisos: string[];
  errores: string[];
}

// ── Zonas de la figura ──────────────────────────────────────────────────────

export const DESCRIPCION_ZONAS_D3: Record<ZonaParamento, string> = {
  A: 'fachadas laterales, primeros e/10 desde la arista de barlovento',
  B: 'fachadas laterales, de e/10 hasta e',
  C: 'fachadas laterales, resto (más allá de e)',
  D: 'fachada de barlovento',
  E: 'fachada de sotavento',
};

/**
 * Figura D.3: anchos de A, B y C en las fachadas paralelas al viento, con
 * e = min(b, 2h) y recortados a lo que mide la fachada d. Una zona que no
 * cabe sale con ancho cero.
 */
export function zonasLaterales(b: number, d: number, h: number): { e: number; A: number; B: number; C: number } {
  const e = Math.max(0, Math.min(b, 2 * h));
  const A = Math.min(e / GEOMETRIA_D3.divisorA, d);
  const B = Math.max(0, Math.min(e, d) - A);
  const C = Math.max(0, d - e);
  return { e, A, B, C };
}

// ── Coeficientes ────────────────────────────────────────────────────────────

/**
 * Tabla D.3 interpolada en h/d y en el área de influencia (Anejo D.3-2). Las
 * columnas de h/d y las filas de área van en orden descendente en la norma;
 * se invierten para `interpolar`, que acota en los extremos («≥ 10», «≤ 1»,
 * «≤ 0,25» y, por el mismo criterio, h/d ≥ 5).
 */
export function coeficienteParamento(zona: ZonaParamento, esbeltez: number, A: number): number {
  const esbelteces = [...ESBELTECES_TABLA_D3].reverse();
  const porArea = TABLA_D3[zona].map((fila) => interpolar(esbeltez, esbelteces, [...fila].reverse()));
  return interpolar(A, [...AREAS_TABLA_D3].reverse(), [...porArea].reverse());
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

export function calcularParamentos(input: ParamentosInput): ParamentosResultado {
  const errores: string[] = [];
  const avisos: string[] = [];
  const notas: string[] = [];
  const { h, alturaFachada, qe } = input;

  if (!(h > 0) || !(alturaFachada > 0)) errores.push('La altura del edificio y la de las fachadas tienen que ser mayores que cero.');
  if (!(input.dimensiones.x > 0) || !(input.dimensiones.y > 0)) {
    errores.push('Las dimensiones en planta tienen que ser mayores que cero.');
  }
  if (input.areaInfluencia !== undefined && !(input.areaInfluencia > 0)) {
    errores.push('El área de influencia tiene que ser mayor que cero.');
  }

  const direccion = (eje: 'x' | 'y'): DireccionParamentos => {
    const d = input.dimensiones[eje];
    const b = input.dimensiones[eje === 'x' ? 'y' : 'x'];
    const { e, A, B, C } = zonasLaterales(b, d, h);
    const esbeltez = d > 0 ? h / d : 0;
    const zona = (z: ZonaParamento, piezas: number, ancho: number): ZonaParamentoResuelta => {
      const area = ancho * alturaFachada;
      const areaInfluencia = input.areaInfluencia ?? area;
      const cpe = coeficienteParamento(z, esbeltez, areaInfluencia);
      return { zona: z, descripcion: DESCRIPCION_ZONAS_D3[z], piezas, ancho, area, A: areaInfluencia, cpe, presion: cpe * qe };
    };
    const zonas = [zona('A', 2, A), zona('B', 2, B), zona('C', 2, C), zona('D', 1, b), zona('E', 1, b)];
    return { eje, d, b, e, esbeltez, zonas: zonas.filter((z) => z.ancho > 0) };
  };

  notas.push(
    'Coeficientes de presión exterior de la tabla D.3 (Anejo D.3) para −45º < θ < 45º alrededor de la normal a cada fachada, aplicados a la presión qb·ce a la altura del edificio, del lado de la seguridad para los elementos más bajos.',
    'Las zonas de fachada son para las comprobaciones locales —carpinterías, acristalamientos, aplacados, anclajes, correas— (art. 3.3.4-3) y para naves sin forjados (art. 3.3.5); la estructura del edificio de pisos va con los coeficientes globales de la tabla 3.5.',
    'Entre las filas de área (10, 5, 2 y 1 m²) y entre las columnas de h/d (5, 1 y 0,25) de la tabla D.3 se interpola linealmente (Anejo D.3-2).',
  );
  if (input.areaInfluencia === undefined) {
    notas.push('El área de influencia de cada zona de fachada es la de la propia zona (ancho por altura de fachada), que es lo que ve un cerramiento grande; para carpinterías o anclajes se toma la del elemento (Anejo D.3-3).');
  } else {
    notas.push(`Área de influencia de ${input.areaInfluencia} m² en las fachadas, la del elemento comprobado (Anejo D.3-3).`);
  }

  return {
    h,
    alturaFachada,
    qe,
    areaInfluencia: input.areaInfluencia ?? null,
    x: direccion('x'),
    y: direccion('y'),
    notas,
    avisos,
    errores,
  };
}
