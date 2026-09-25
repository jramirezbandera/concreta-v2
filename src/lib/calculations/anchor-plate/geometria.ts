// Geometría en planta de la placa de anclaje: huella del perfil, rigidizadores,
// disposición de las barras, holguras y los dos modelos de placa que dependen
// de dónde está el acero (área eficaz de compresión y voladizo equivalente).
//
// Módulo PURO: ni React ni el motor. `anchorPlate.ts` importa de aquí y el SVG
// también, así que el dibujo y el cálculo ven exactamente la misma geometría.
//
// Convenio (el mismo que el solver): mm, origen en el centroide de la placa,
// x = eje fuerte (dimensión a, canto h del perfil), y = eje débil (dimensión
// b, ancho de ala). Los rectángulos son cerrados: [x1, x2] × [y1, y2].
//
// Cómo se rigidiza una placa en la práctica (láminas del estudio, 2026-09-23):
// las cartelas van PEGADAS a las caras del pilar y recorren la placa entera
// de borde a borde, formando un «#» alrededor del perfil:
//   · par X — paralelo al eje fuerte, en las puntas de las alas (y = ±bf/2),
//     de x = −a/2 a x = +a/2. Es el par que se ve en el alzado, achaflanado
//     a 45° hacia los bordes. `rib_count = 2` es este par.
//   · par Y — paralelo al eje débil, pegado a la cara exterior de cada ala
//     (x = ±h/2), de y = −b/2 a y = +b/2. `rib_count = 4` añade este par.
// Las barras viven en las ocho celdas que deja el «#» alrededor del pilar:
// nunca bajo el perfil ni sobre una cartela.
//
// Pilar 2UPN en cajón (2026-09-23; es el habitual de las láminas del estudio):
// dos UPN enfrentadas con las almas fuera (y = ±b/2, con b = 2·b_UPN) y las
// puntas de las alas soldadas en y = 0, así que el canto h de la UPN corre a
// lo largo del eje fuerte igual que en un perfil en I. Las cuatro caras son
// macizas: el par X se pega a las almas y el par Y a las alas, y dentro del
// cajón la placa sólo es eficaz en la corona de ancho c junto a las paredes.

import type { AnchorPlateInputs, AnchorPlateSectionType } from '../../../data/defaults';
import { makeISectionBySize, makeUPNBoxBySize } from '../../sections';
import { getSizesForTipo, getSizesUPN } from '../../../data/steelProfiles';

export interface Rect { x1: number; x2: number; y1: number; y2: number }
export interface Pt { x: number; y: number }

// ─── Familias de perfil que admite el módulo ───────────────────────────────

/** I/H laminados y el cajón de dos UPN. Es la lista del selector y la que
 *  valida el asistente. */
export const FAMILIAS_PERFIL: readonly AnchorPlateSectionType[] = ['IPE', 'HEA', 'HEB', 'IPN', '2UPN'];

/** Designaciones disponibles en la familia (en 2UPN, las de la UPN). */
export function tallasPerfil(tipo: AnchorPlateSectionType): number[] {
  return tipo === '2UPN' ? getSizesUPN() : getSizesForTipo(tipo);
}

// ─── Huella del perfil ─────────────────────────────────────────────────────

export interface Huella {
  /** 'I' para IPE/HEA/HEB/IPN; '2UPN' para el cajón de dos UPN. */
  tipo: 'I' | '2UPN';
  /** mm — canto del perfil (a lo largo de x). */
  h: number;
  /** mm — ancho del perfil a lo largo de y: el ala en un I/H, 2·b_UPN en el cajón. */
  bf: number;
  tf: number;
  tw: number;
  /** mm — radio de acuerdo alma-ala (sólo para dibujar). */
  r: number;
  /** Rectángulos macizos del perfil en planta: dos alas y el alma (I/H) o
   *  las cuatro paredes del cajón (se solapan en las esquinas). */
  walls: Rect[];
  /** false cuando el perfil no está en el catálogo y la huella es una
   *  estimación (60 % de la placa), como venía haciendo el motor. */
  catalogo: boolean;
}

export function huellaPerfil(inp: Pick<AnchorPlateInputs, 'sectionType' | 'sectionSize' | 'plate_a' | 'plate_b'>): Huella {
  if (inp.sectionType === '2UPN') {
    const p = makeUPNBoxBySize(inp.sectionSize);
    if (!p) return huellaEstimada('2UPN', inp);
    // Cajón h × b (b = 2·b_UPN): almas en y = ±b/2 a lo largo de todo el
    // canto y alas en x = ±h/2 (cada una, dos medias alas soldadas en y = 0).
    const h2 = p.h / 2, b2 = p.b / 2;
    return {
      tipo: '2UPN', h: p.h, bf: p.b, tf: p.tf, tw: p.tw, r: 0, catalogo: true,
      walls: [
        { x1: h2 - p.tf, x2: h2,         y1: -b2,       y2: b2         },   // alas +x
        { x1: -h2,       x2: -h2 + p.tf, y1: -b2,       y2: b2         },   // alas −x
        { x1: -h2,       x2: h2,         y1: b2 - p.tw, y2: b2         },   // alma +y
        { x1: -h2,       x2: h2,         y1: -b2,       y2: -b2 + p.tw },   // alma −y
      ],
    };
  }
  const p = makeISectionBySize(inp.sectionType, inp.sectionSize)?.profile;
  if (!p) return huellaEstimada('I', inp);
  const h2 = p.h / 2, b2 = p.b / 2, tw2 = p.tw / 2;
  return {
    tipo: 'I', h: p.h, bf: p.b, tf: p.tf, tw: p.tw, r: p.r, catalogo: true,
    walls: [
      { x1: h2 - p.tf, x2: h2,          y1: -b2,  y2: b2  },   // ala +x
      { x1: -h2,       x2: -h2 + p.tf,  y1: -b2,  y2: b2  },   // ala −x
      { x1: -h2 + p.tf, x2: h2 - p.tf,  y1: -tw2, y2: tw2 },   // alma
    ],
  };
}

/** Perfil fuera de catálogo: caja maciza al 60 % de la placa, como venía
 *  haciendo el motor. */
function huellaEstimada(tipo: Huella['tipo'], inp: Pick<AnchorPlateInputs, 'plate_a' | 'plate_b'>): Huella {
  const h = inp.plate_a * 0.6;
  const bf = inp.plate_b * 0.6;
  return {
    tipo, h, bf, tf: 0, tw: 0, r: 0, catalogo: false,
    walls: [{ x1: -h / 2, x2: h / 2, y1: -bf / 2, y2: bf / 2 }],
  };
}

/** Caja envolvente del perfil (h × bf). Es el «apoyo» que ve la placa. */
export function cajaPerfil(hu: Huella): Rect {
  return { x1: -hu.h / 2, x2: hu.h / 2, y1: -hu.bf / 2, y2: hu.bf / 2 };
}

// ─── Rigidizadores ─────────────────────────────────────────────────────────

export interface Rigidizador {
  /** 'x': paralelo al eje fuerte, en las puntas de las alas (en el cajón,
   *  pegado a las almas). 'y': paralelo al eje débil, en la cara exterior de
   *  las alas. */
  eje: 'x' | 'y';
  lado: 1 | -1;
  /** Planta de la chapa, de borde a borde de la placa. */
  rect: Rect;
  /** mm — vuelo desde la cara del perfil hasta el borde de la placa: es la
   *  sección por la que la cartela entrega su carga a la placa. */
  vuelo: number;
}

export function rigidizadores(
  inp: Pick<AnchorPlateInputs, 'plate_a' | 'plate_b' | 'rib_count' | 'rib_t'>,
  hu: Huella,
): Rigidizador[] {
  if (inp.rib_count < 2) return [];
  const a2 = inp.plate_a / 2, b2 = inp.plate_b / 2;
  const t = Math.max(0, inp.rib_t);
  const h2 = hu.h / 2, bf2 = hu.bf / 2;
  const out: Rigidizador[] = [];
  for (const lado of [1, -1] as const) {
    out.push({
      eje: 'x', lado,
      rect: lado > 0
        ? { x1: -a2, x2: a2, y1: bf2, y2: bf2 + t }
        : { x1: -a2, x2: a2, y1: -bf2 - t, y2: -bf2 },
      vuelo: Math.max(0, a2 - h2),
    });
  }
  if (inp.rib_count >= 4) {
    for (const lado of [1, -1] as const) {
      out.push({
        eje: 'y', lado,
        rect: lado > 0
          ? { x1: h2, x2: h2 + t, y1: -b2, y2: b2 }
          : { x1: -h2 - t, x2: -h2, y1: -b2, y2: b2 },
        vuelo: Math.max(0, b2 - bf2),
      });
    }
  }
  return out;
}

// ─── Disposición de las barras ─────────────────────────────────────────────

export type DisposicionBarras = 4 | 6 | 8 | 12;

export const DISPOSICIONES: readonly DisposicionBarras[] = [4, 6, 8, 12];

export const DISPOSICION_LABEL: Record<DisposicionBarras, string> = {
  4: 'esquinas',
  6: 'tres por extremo del eje fuerte',
  8: 'anillo (una barra centrada en cada lado)',
  12: 'anillo con pares (dos barras en cada lado)',
};

/**
 * La retícula 3×3 de 9 barras se retiró el 2026-09-23: su barra central caía
 * bajo el alma del pilar y nunca fue construible. Un estado guardado con 9 se
 * lee como el anillo de 8 (las mismas ocho barras exteriores). Cualquier otro
 * valor extraño vuelve a las cuatro esquinas.
 */
export function normalizarDisposicion(n: number): DisposicionBarras {
  if (n === 9) return 8;
  return (DISPOSICIONES as readonly number[]).includes(n) ? (n as DisposicionBarras) : 4;
}

/**
 * Coordenadas de las barras, en el orden fila (y creciente) → columna (x
 * creciente), que es el que espera el solver y el que rotula el alzado.
 *
 *   4  · esquinas (±xc, ±yc)
 *   6  · tres por extremo del eje fuerte: (±xc, {−yc, 0, +yc}). Las seis
 *        trabajan a Mx; una fila central en x = 0 no aportaría brazo.
 *   8  · anillo: esquinas + (0, ±yc) + (±xc, 0). Es la lámina tipo del estudio.
 *   12 · anillo con pares: esquinas + (±sx/2, ±yc) + (±xc, ±sy/2), donde
 *        sx/sy son la separación entre las dos barras de cada par central.
 */
export function posicionesBarras(
  inp: Pick<AnchorPlateInputs, 'plate_a' | 'plate_b' | 'bar_edge_x' | 'bar_edge_y' | 'bar_nLayout' | 'bar_spacing_x' | 'bar_spacing_y'>,
): Pt[] {
  const n = normalizarDisposicion(inp.bar_nLayout);
  const xc = inp.plate_a / 2 - inp.bar_edge_x;
  const yc = inp.plate_b / 2 - inp.bar_edge_y;
  const pts: Pt[] = [];
  for (const sy of [-1, 1]) for (const sx of [-1, 1]) pts.push({ x: sx * xc, y: sy * yc });
  if (n === 6) {
    pts.push({ x: -xc, y: 0 }, { x: xc, y: 0 });
  } else if (n === 8) {
    pts.push({ x: 0, y: -yc }, { x: 0, y: yc }, { x: -xc, y: 0 }, { x: xc, y: 0 });
  } else if (n === 12) {
    const px = Math.max(0, inp.bar_spacing_x) / 2;
    const py = Math.max(0, inp.bar_spacing_y) / 2;
    for (const sy of [-1, 1]) for (const sx of [-1, 1]) pts.push({ x: sx * px, y: sy * yc });
    for (const sy of [-1, 1]) for (const sx of [-1, 1]) pts.push({ x: sx * xc, y: sy * py });
  }
  pts.sort((p, q) => (p.y - q.y) || (p.x - q.x));
  return pts;
}

// ─── Holguras ──────────────────────────────────────────────────────────────

/** Distancia del punto al rectángulo: 0 si está dentro. */
export function distanciaARect(p: Pt, r: Rect): number {
  const dx = Math.max(r.x1 - p.x, 0, p.x - r.x2);
  const dy = Math.max(r.y1 - p.y, 0, p.y - r.y2);
  return Math.hypot(dx, dy);
}

export type CampoHolgura = 'bar_edge_x' | 'bar_edge_y' | 'bar_spacing_x' | 'bar_spacing_y';

export interface Holgura {
  indice: number;
  /** mm — del eje de la barra a la cara de acero más próxima. */
  acero: number;
  contra: 'perfil' | 'rigidizador';
  /** Entrada que movería la barra para ganar holgura (para el aviso). */
  campo: CampoHolgura;
  /** mm — al eje de la barra vecina más próxima. */
  vecina: number;
}

/**
 * Para cada barra, cuánto aire tiene: al perfil (su caja envolvente, porque
 * bajo el pilar no cabe nada), al rigidizador más cercano y a la barra vecina.
 */
export function holguras(bars: Pt[], hu: Huella, rigs: Rigidizador[]): Holgura[] {
  const caja = cajaPerfil(hu);
  const xMax = Math.max(0, ...bars.map((b) => Math.abs(b.x)));
  const yMax = Math.max(0, ...bars.map((b) => Math.abs(b.y)));
  return bars.map((b, i) => {
    let acero = distanciaARect(b, caja);
    let contra: Holgura['contra'] = 'perfil';
    let eje: 'x' | 'y' = Math.abs(b.x) >= Math.abs(b.y) ? 'x' : 'y';
    for (const r of rigs) {
      const d = distanciaARect(b, r.rect);
      if (d < acero) {
        acero = d;
        contra = 'rigidizador';
        // La cartela paralela al eje fuerte se esquiva moviendo la barra en y.
        eje = r.eje === 'x' ? 'y' : 'x';
      }
    }
    // Las barras de un par central no están en la esquina: en su eje las
    // mueve la separación del par, no la distancia al borde.
    const esParEnX = Math.abs(b.x) < xMax - 1e-6;
    const esParEnY = Math.abs(b.y) < yMax - 1e-6 && Math.abs(b.y) > 1e-6;
    const campo: CampoHolgura = eje === 'x'
      ? (esParEnX ? 'bar_spacing_x' : 'bar_edge_x')
      : (esParEnY ? 'bar_spacing_y' : 'bar_edge_y');
    let vecina = Infinity;
    bars.forEach((o, j) => {
      if (j !== i) vecina = Math.min(vecina, Math.hypot(o.x - b.x, o.y - b.y));
    });
    return { indice: i, acero, contra, campo, vecina };
  });
}

// ─── Áreas: unión de rectángulos y polígono recortado ──────────────────────

export function expandir(r: Rect, c: number): Rect {
  return { x1: r.x1 - c, x2: r.x2 + c, y1: r.y1 - c, y2: r.y2 + c };
}

export function recortar(r: Rect, clip: Rect): Rect | null {
  const x1 = Math.max(r.x1, clip.x1), x2 = Math.min(r.x2, clip.x2);
  const y1 = Math.max(r.y1, clip.y1), y2 = Math.min(r.y2, clip.y2);
  return x2 > x1 && y2 > y1 ? { x1, x2, y1, y2 } : null;
}

export function areaRect(r: Rect | null): number {
  return r ? (r.x2 - r.x1) * (r.y2 - r.y1) : 0;
}

/**
 * Área de la unión de varios rectángulos (ya recortados al contorno que
 * interese). Compresión de coordenadas: con menos de diez rectángulos la
 * rejilla es diminuta y el resultado es exacto, sin inclusión-exclusión.
 */
export function areaUnion(rects: Rect[]): number {
  const rs = rects.filter((r) => r.x2 > r.x1 && r.y2 > r.y1);
  if (rs.length === 0) return 0;
  const xs = Array.from(new Set(rs.flatMap((r) => [r.x1, r.x2]))).sort((p, q) => p - q);
  const ys = Array.from(new Set(rs.flatMap((r) => [r.y1, r.y2]))).sort((p, q) => p - q);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j + 1 < ys.length; j++) {
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (rs.some((r) => cx > r.x1 && cx < r.x2 && cy > r.y1 && cy < r.y2)) {
        area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      }
    }
  }
  return area;
}

export function areaPoligono(poly: Pt[]): number {
  if (poly.length < 3) return 0;
  let a2 = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a2 += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a2) / 2;
}

function recortarSemiplano(poly: Pt[], dentro: (p: Pt) => number): Pt[] {
  // Sutherland–Hodgman contra un semiplano; `dentro(p) ≥ 0` es dentro.
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const fp = dentro(p), fq = dentro(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq);
      out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
  }
  return out;
}

/** Polígono convexo ∩ rectángulo. */
export function recortarPoligonoARect(poly: Pt[], r: Rect): Pt[] {
  let out = poly;
  out = recortarSemiplano(out, (p) => p.x - r.x1);
  out = recortarSemiplano(out, (p) => r.x2 - p.x);
  out = recortarSemiplano(out, (p) => p.y - r.y1);
  out = recortarSemiplano(out, (p) => r.y2 - p.y);
  return out;
}

export function rectAPoligono(r: Rect): Pt[] {
  return [{ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y1 }, { x: r.x2, y: r.y2 }, { x: r.x1, y: r.y2 }];
}

// ─── Área eficaz de compresión (T-stub equivalente, CE Anejo 26 §6.2.5) ────

export interface AreaEficaz {
  /** mm² — unión de las franjas de ancho c alrededor del perfil y de las
   *  cartelas, recortada a la placa. */
  A_eff: number;
  /** mm² — franja tributaria de cada rigidizador (en el orden de `rigs`),
   *  recortada a la placa. Se usa para repartir la compresión entre cartelas. */
  franjas: Rect[];
}

/**
 * La placa sólo reparte la presión fjd a una distancia c de cada línea de
 * acero soldada a ella (c = t·√(fyd/3fjd), EC3 1-8 §6.2.5(4)). Las cartelas
 * son líneas de acero tan soldadas como las alas, así que cada una añade su
 * franja de 2c + t a lo largo de toda la placa: con el «#» completo, casi
 * toda la placa pasa a ser eficaz.
 */
export function areaEficaz(
  inp: Pick<AnchorPlateInputs, 'plate_a' | 'plate_b'>,
  hu: Huella,
  rigs: Rigidizador[],
  c: number,
): AreaEficaz {
  const placa: Rect = { x1: -inp.plate_a / 2, x2: inp.plate_a / 2, y1: -inp.plate_b / 2, y2: inp.plate_b / 2 };
  if (!hu.catalogo) return { A_eff: areaRect(placa), franjas: rigs.map(() => placa) };
  const franjas = rigs.map((r) => recortar(expandir(r.rect, c), placa) ?? { x1: 0, x2: 0, y1: 0, y2: 0 });
  const rects: Rect[] = [];
  for (const w of hu.walls) {
    const rr = recortar(expandir(w, c), placa);
    if (rr) rects.push(rr);
  }
  rects.push(...franjas);
  return { A_eff: Math.min(areaUnion(rects), areaRect(placa)), franjas };
}

// ─── Voladizo equivalente por líneas de rotura ─────────────────────────────
//
// La placa comprimida se comprueba a flexión bajo la presión fjd en el panel
// más desfavorable. Sin cartelas el panel es el voladizo clásico c desde la
// cara del perfil (m = q·c²/2). Con cartelas, la placa queda apoyada en más
// líneas y hay que decir cuánto vale eso: se resuelve por LÍNEAS DE ROTURA,
// que es el mismo modelo plástico que la resistencia m_Rd = t²·fy/4 con la
// que se compara. Cada panel devuelve el voladizo equivalente c_eq tal que
// q·c_eq²/2 = m requerido.
//
// Los mecanismos son los clásicos de Johansen para paneles con bordes
// empotrados (la placa es continua sobre cada cartela y sobre el perfil):
//   · Panel de tres lados (apoyado en el fondo y en los dos costados, libre
//     al frente), ancho w entre costados y fondo c: abanico con las dos
//     diagonales muriendo en el borde libre a d de las esquinas, o con vértice
//     interior a e del fondo y una charnela central hasta el borde libre.
//   · Esquina (dos bordes contiguos apoyados): diagonal desde la esquina
//     apoyada a un punto del borde libre opuesto.
// El máximo sobre los parámetros del mecanismo es la cota superior de
// Johansen; con w → ∞ ambos tienden al voladizo puro (k = 1/2).

/** k = m/(q·c²) del panel de tres lados con relación ρ = w/c. */
export function coefPanelTresLados(rho: number): number {
  if (!(rho > 0)) return 0;
  const N = 240;
  let k = 0;
  // Abanico: diagonales hasta el borde libre, a d̂ = d/c ≤ ρ/2 de cada esquina.
  for (let i = 1; i <= N; i++) {
    const d = (rho / 2) * (i / N);
    k = Math.max(k, (rho / 2 - d / 3) / (rho + 2 * d + 4 / d));
  }
  // Vértice interior a ê = e/c ≤ 1 del fondo, charnela central hasta el frente.
  for (let i = 1; i <= N; i++) {
    const e = i / N;
    k = Math.max(k, (e * rho * rho * (0.5 - e / 6)) / (2 * rho * rho + 8 * e));
  }
  return Math.min(0.5, k);
}

/** Voladizo equivalente del panel de tres lados: ancho w, fondo c. */
export function voladizoPanelTresLados(w: number, c: number): number {
  if (!(c > 0) || !(w > 0)) return 0;
  return c * Math.sqrt(2 * coefPanelTresLados(w / c));
}

/** Voladizo equivalente de la esquina apoyada en dos bordes contiguos, con
 *  vuelos cx y cy hasta los dos bordes libres. */
export function voladizoEsquina(cx: number, cy: number): number {
  if (!(cx > 0) || !(cy > 0)) return 0;
  const N = 240;
  const familia = (ca: number, cb: number): number => {
    // Diagonal desde la esquina apoyada hasta (d, cb) en el borde libre y = cb.
    let m = 0;
    for (let i = 1; i <= N; i++) {
      const d = ca * (i / N);
      m = Math.max(m, (cb * cb * (ca / 2 - d / 6)) / (ca + d + (2 * cb * cb) / d));
    }
    return m;
  };
  const m = Math.max(familia(cx, cy), familia(cy, cx));
  return Math.sqrt(2 * m);
}

export interface VoladizoEquivalente {
  /** mm — voladizo equivalente que gobierna. */
  c: number;
  /** Qué panel manda, para el texto de la comprobación. */
  zona: string;
}

export function voladizoEquivalente(
  inp: Pick<AnchorPlateInputs, 'plate_a' | 'plate_b' | 'rib_count' | 'rib_t'>,
  hu: Huella,
): VoladizoEquivalente {
  const cx = Math.max(0, (inp.plate_a - hu.h) / 2);
  const cy = Math.max(0, (inp.plate_b - hu.bf) / 2);
  const t = Math.max(0, inp.rib_t);
  const mejor = (cands: Array<[number, string]>): VoladizoEquivalente => {
    let out: VoladizoEquivalente = { c: 0, zona: cands[0]?.[1] ?? '' };
    for (const [c, zona] of cands) if (c > out.c) out = { c, zona };
    return out;
  };
  if (inp.rib_count < 2) {
    return mejor([[cx, 'voladizo eje fuerte'], [cy, 'voladizo eje débil']]);
  }
  if (inp.rib_count < 4) {
    // Franjas laterales entre las dos cartelas, más allá de las alas (tres
    // lados); franjas exteriores más allá de las cartelas (voladizo puro,
    // porque los extremos x = ±a/2 son libres).
    return mejor([
      [voladizoPanelTresLados(hu.bf, cx), 'franja lateral entre cartelas'],
      [Math.max(0, cy - t), 'voladizo exterior a las cartelas'],
    ]);
  }
  const cxr = Math.max(0, cx - t);
  const cyr = Math.max(0, cy - t);
  return mejor([
    [voladizoPanelTresLados(hu.bf, cxr), 'franja lateral entre cartelas'],
    [voladizoPanelTresLados(hu.h, cyr), 'celda central entre cartelas'],
    [voladizoEsquina(cxr, cyr), 'esquina'],
  ]);
}

// ─── Apoyos que ve una barra traccionada (T-stub) ──────────────────────────

export interface ApoyosBarra {
  /** mm — distancia de la barra al apoyo más próximo en el eje que gobierna. */
  m: number;
  /** mm — de la barra al borde de la placa en ese mismo eje. */
  e: number;
  /** 'x' o 'y': eje en que se mide m. */
  eje: 'x' | 'y';
  /** mm — anchura libre del panel perpendicular a m: acota la longitud eficaz. */
  anchoPanel: number;
  /** Qué apoya a la barra. */
  apoyo: 'perfil' | 'rigidizador';
}

/**
 * Para una barra en (x, y): el apoyo más cercano por cada eje (cara del
 * perfil o cara exterior de una cartela), la distancia al borde de placa en
 * ese eje y la anchura del panel en el eje perpendicular. Devuelve null si la
 * barra cae bajo el perfil o dentro de una cartela (no hay T-stub que valga).
 */
export function apoyosBarra(
  p: Pt,
  inp: Pick<AnchorPlateInputs, 'plate_a' | 'plate_b'>,
  hu: Huella,
  rigs: Rigidizador[],
): ApoyosBarra | null {
  const ax = Math.abs(p.x), ay = Math.abs(p.y);
  const a2 = inp.plate_a / 2, b2 = inp.plate_b / 2;
  const h2 = hu.h / 2, bf2 = hu.bf / 2;
  const caja = cajaPerfil(hu);
  if (distanciaARect(p, caja) <= 0) return null;
  for (const r of rigs) if (distanciaARect(p, r.rect) <= 0) return null;

  const parX = rigs.filter((r) => r.eje === 'x');
  const parY = rigs.filter((r) => r.eje === 'y');
  const tx = parX[0] ? parX[0].rect.y2 - parX[0].rect.y1 : 0;
  const ty = parY[0] ? parY[0].rect.x2 - parY[0].rect.x1 : 0;

  // Apoyo en x (una línea x = cte): cara del ala si la barra queda a la
  // altura del ala; cara exterior de la cartela Y, que recorre toda la placa.
  const candX: Array<[number, ApoyosBarra['apoyo']]> = [];
  if (ay <= bf2 && ax > h2) candX.push([ax - h2, 'perfil']);
  if (parY.length && ax > h2 + ty) candX.push([ax - h2 - ty, 'rigidizador']);
  // Apoyo en y: punta de las alas si la barra queda dentro del canto (la
  // simplificación de siempre del módulo); cara exterior de la cartela X.
  const candY: Array<[number, ApoyosBarra['apoyo']]> = [];
  if (ax <= h2 && ay > bf2) candY.push([ay - bf2, 'perfil']);
  if (parX.length && ay > bf2 + tx) candY.push([ay - bf2 - tx, 'rigidizador']);

  const minimo = (c: Array<[number, ApoyosBarra['apoyo']]>) =>
    c.reduce<[number, ApoyosBarra['apoyo']] | null>((acc, v) => (acc === null || v[0] < acc[0] ? v : acc), null);
  const mx = minimo(candX);
  const my = minimo(candY);
  if (!mx && !my) return null;

  // Anchura libre del panel perpendicular a m: entre las caras de acero que
  // flanquean la barra en el otro eje, o hasta los bordes de la placa.
  const anchoEnY = (): number => {
    // Línea de rotura paralela a y (m medido en x): límites en y.
    let lo = -b2, hi = b2;
    for (const r of parX) {
      if (r.rect.y1 >= p.y && r.rect.y1 < hi) hi = r.rect.y1;
      if (r.rect.y2 <= p.y && r.rect.y2 > lo) lo = r.rect.y2;
    }
    if (ax <= h2) {
      if (bf2 <= p.y && bf2 > lo) lo = bf2;
      if (-bf2 >= p.y && -bf2 < hi) hi = -bf2;
    }
    return Math.max(0, hi - lo);
  };
  const anchoEnX = (): number => {
    let lo = -a2, hi = a2;
    for (const r of parY) {
      if (r.rect.x1 >= p.x && r.rect.x1 < hi) hi = r.rect.x1;
      if (r.rect.x2 <= p.x && r.rect.x2 > lo) lo = r.rect.x2;
    }
    if (ay <= bf2) {
      if (h2 <= p.x && h2 > lo) lo = h2;
      if (-h2 >= p.x && -h2 < hi) hi = -h2;
    }
    return Math.max(0, hi - lo);
  };

  if (mx && (!my || mx[0] <= my[0])) {
    return { m: mx[0], e: a2 - ax, eje: 'x', anchoPanel: anchoEnY(), apoyo: mx[1] };
  }
  return { m: my![0], e: b2 - ay, eje: 'y', anchoPanel: anchoEnX(), apoyo: my![1] };
}
