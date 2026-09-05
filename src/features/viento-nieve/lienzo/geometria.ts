/**
 * Geometría de los dibujos, pura: dónde va cada zona de la cubierta en planta
 * y cómo se despliegan las cuatro fachadas.
 *
 * El motor (`lib/acciones/dosAguas.ts`, `paramentos.ts`) ya da el TAMAÑO de
 * cada zona —piezas, ancho, fondo— y su coeficiente; aquí sólo se COLOCAN,
 * siguiendo las figuras D.6 y D.3 del DB SE-AE. Las zonas que el motor ha
 * filtrado por no caber (área cero) no se pintan. Todo en metros y en las
 * coordenadas del edificio: X hacia la derecha, Y hacia abajo en el papel,
 * el viento según X entrando por la izquierda y el viento según Y por arriba.
 */

import type { DireccionResuelta, ZonaResuelta } from '../../../lib/acciones/dosAguas';
import type { DireccionParamentos, ZonaParamentoResuelta } from '../../../lib/acciones/paramentos';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RectZonaCubierta extends Rect {
  zona: ZonaResuelta;
}

export interface PlantaCubierta {
  /** Lados del edificio en planta, m. */
  ancho: number;
  fondo: number;
  /** Eje del edificio por el que sopla el viento en esta dirección. */
  viento: 'x' | 'y';
  /** La cumbrera, de extremo a extremo. */
  cumbrera: { x1: number; y1: number; x2: number; y2: number };
  rects: RectZonaCubierta[];
}

/** Rectángulos de una zona en el marco del viento: u perpendicular al viento (0..b), v a favor del viento (0..d). */
type Pieza = { u: number; v: number; w: number; h: number };

function porZona<T extends { zona: string }>(zonas: readonly T[]): Map<string, T> {
  return new Map(zonas.map((z) => [z.zona, z]));
}

/**
 * Figura D.6 con el viento entrando por v = 0.
 * Perpendicular a la cumbrera: el alero de barlovento es v = 0, la cumbrera
 * está a v = d/2; F son los dos rincones del alero, G el resto del alero, H
 * hasta la cumbrera, J la banda tras la cumbrera, I el resto.
 * Paralela: el hastial de barlovento es v = 0 y la cumbrera corre a lo largo
 * de v por u = b/2; por faldón, F en el rincón del alero, G junto a la
 * cumbrera, H hasta e/2 e I el resto.
 */
function piezasEnMarcoDelViento(d: DireccionResuelta): { zona: ZonaResuelta; piezas: Pieza[] }[] {
  const z = porZona(d.zonas);
  const out: { zona: ZonaResuelta; piezas: Pieza[] }[] = [];
  const { b } = d;
  const pon = (zona: ZonaResuelta | undefined, piezas: Pieza[]) => {
    if (zona && piezas.length) out.push({ zona, piezas: piezas.filter((p) => p.w > 0 && p.h > 0) });
  };

  if (d.direccion === 'perpendicular') {
    const F = z.get('F'), G = z.get('G'), H = z.get('H'), J = z.get('J'), I = z.get('I');
    const banda = F?.fondo ?? G?.fondo ?? 0;
    const anchoF = F?.ancho ?? 0;
    pon(F, [
      { u: 0, v: 0, w: anchoF, h: banda },
      { u: b - anchoF, v: 0, w: anchoF, h: banda },
    ]);
    pon(G, [{ u: anchoF, v: 0, w: b - 2 * anchoF, h: banda }]);
    const vH = banda;
    pon(H, [{ u: 0, v: vH, w: b, h: H?.fondo ?? 0 }]);
    const cumbrera = d.d / 2;
    pon(J, [{ u: 0, v: cumbrera, w: b, h: J?.fondo ?? 0 }]);
    pon(I, [{ u: 0, v: cumbrera + (J?.fondo ?? 0), w: b, h: I?.fondo ?? 0 }]);
    return out;
  }

  const F = z.get('F'), G = z.get('G'), H = z.get('H'), I = z.get('I');
  const medio = b / 2;
  const anchoF = F?.ancho ?? 0;
  const fondoBorde = F?.fondo ?? G?.fondo ?? 0;
  pon(F, [
    { u: 0, v: 0, w: anchoF, h: fondoBorde },
    { u: b - anchoF, v: 0, w: anchoF, h: fondoBorde },
  ]);
  pon(G, [
    { u: anchoF, v: 0, w: medio - anchoF, h: fondoBorde },
    { u: medio, v: 0, w: medio - anchoF, h: fondoBorde },
  ]);
  const vH = fondoBorde;
  const fondoH = H?.fondo ?? 0;
  pon(H, [
    { u: 0, v: vH, w: medio, h: fondoH },
    { u: medio, v: vH, w: medio, h: fondoH },
  ]);
  const vI = vH + fondoH;
  pon(I, [
    { u: 0, v: vI, w: medio, h: I?.fondo ?? 0 },
    { u: medio, v: vI, w: medio, h: I?.fondo ?? 0 },
  ]);
  return out;
}

/**
 * Las zonas de una dirección colocadas en la planta del edificio. El marco del
 * viento coincide con el del edificio cuando el viento sopla según Y (entra
 * por arriba); cuando sopla según X se giran los ejes (entra por la izquierda).
 */
export function zonasCubiertaEnPlanta(d: DireccionResuelta, cumbrera: 'x' | 'y', dimensiones: { x: number; y: number }): PlantaCubierta {
  // Perpendicular a una cumbrera ∥ X es viento según Y; paralela a ella, según X.
  const viento: 'x' | 'y' = (d.direccion === 'perpendicular') === (cumbrera === 'x') ? 'y' : 'x';
  const aPlanta = (p: Pieza): Rect => (viento === 'y' ? { x: p.u, y: p.v, w: p.w, h: p.h } : { x: p.v, y: p.u, w: p.h, h: p.w });
  const rects: RectZonaCubierta[] = [];
  for (const { zona, piezas } of piezasEnMarcoDelViento(d)) {
    for (const p of piezas) rects.push({ zona, ...aPlanta(p) });
  }
  const { x, y } = dimensiones;
  const linea = cumbrera === 'x' ? { x1: 0, y1: y / 2, x2: x, y2: y / 2 } : { x1: x / 2, y1: 0, x2: x / 2, y2: y };
  return { ancho: x, fondo: y, viento, cumbrera: linea, rects };
}

// ── Fachadas ────────────────────────────────────────────────────────────────

export interface TramoFachada {
  /** Zona de la tabla D.3 que ocupa el tramo. */
  zona: ZonaParamentoResuelta;
  /** Desde el inicio del segmento, m. */
  x0: number;
  ancho: number;
}

export interface SegmentoFachada {
  /** D y E son las fachadas perpendiculares al viento; las laterales, las paralelas. */
  nombre: 'D' | 'lateral' | 'E' | 'lateral2';
  rotulo: string;
  /** Desde el inicio del desarrollo, m. */
  x0: number;
  ancho: number;
  tramos: TramoFachada[];
  /** Fachada con hastial: lleva el triángulo hasta la coronación. */
  hastial: boolean;
}

export interface Desarrollo {
  segmentos: SegmentoFachada[];
  /** Ancho total del desarrollo, m: 2b + 2d. */
  total: number;
}

/**
 * Las cuatro fachadas desplegadas en línea, D · lateral · E · lateral, con
 * las zonas de la tabla D.3 a su ancho real. En las laterales A empieza en
 * la arista de barlovento (la que toca a D): en la primera va a la izquierda
 * y en la segunda, que cierra el desarrollo contra D, a la derecha. Cuando la
 * cumbrera es paralela al viento, D y E son los hastiales; si es
 * perpendicular, lo son las laterales.
 */
export function desarrolloFachadas(d: DireccionParamentos, cumbrera: 'x' | 'y' | null): Desarrollo {
  const z = porZona(d.zonas);
  const D = z.get('D');
  const E = z.get('E');
  const laterales = (['A', 'B', 'C'] as const).map((k) => z.get(k)).filter((x): x is ZonaParamentoResuelta => x !== undefined);
  const hastialDE = cumbrera !== null && cumbrera === d.eje;
  const hastialLat = cumbrera !== null && cumbrera !== d.eje;

  const segmentos: SegmentoFachada[] = [];
  let x0 = 0;
  const unaZona = (zona: ZonaParamentoResuelta | undefined, ancho: number): TramoFachada[] => (zona ? [{ zona, x0: 0, ancho }] : []);

  segmentos.push({ nombre: 'D', rotulo: 'D · barlovento', x0, ancho: d.b, tramos: unaZona(D, d.b), hastial: hastialDE });
  x0 += d.b;

  const tramosLateral = (desdeIzquierda: boolean): TramoFachada[] => {
    const orden = desdeIzquierda ? laterales : [...laterales].reverse();
    let acum = 0;
    return orden.map((zona) => {
      const t = { zona, x0: acum, ancho: zona.ancho };
      acum += zona.ancho;
      return t;
    });
  };
  segmentos.push({ nombre: 'lateral', rotulo: 'lateral', x0, ancho: d.d, tramos: tramosLateral(true), hastial: hastialLat });
  x0 += d.d;
  segmentos.push({ nombre: 'E', rotulo: 'E · sotavento', x0, ancho: d.b, tramos: unaZona(E, d.b), hastial: hastialDE });
  x0 += d.b;
  segmentos.push({ nombre: 'lateral2', rotulo: 'lateral', x0, ancho: d.d, tramos: tramosLateral(false), hastial: hastialLat });
  x0 += d.d;

  return { segmentos, total: x0 };
}

/** Escala que cabe en un hueco de píxeles: metros → píxeles, con margen a los lados. */
export function escalaQueCabe(anchoM: number, altoM: number, anchoPx: number, altoPx: number): number {
  if (anchoM <= 0 || altoM <= 0) return 1;
  return Math.min(anchoPx / anchoM, altoPx / altoM);
}
