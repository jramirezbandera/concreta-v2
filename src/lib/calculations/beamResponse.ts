// Respuesta estructural EXACTA de un vano simple bajo carga repartida
// uniforme + cargas puntuales, para los 4 esquemas de apoyo de `BeamType`.
//
// Por qué existe: `BEAM_CASES` (beamCases.ts) da coeficientes cerrados
// calibrados SOLO para UDL — su propia cabecera lo dice. En cuanto entra una
// carga puntual, `MEd = wL²/8` y compañía dejan de valer y no hay forma de
// superponer coeficientes de máximos (el máximo del UDL y el de la puntual
// caen en secciones distintas). Este módulo resuelve el vano de verdad:
//
//   1. REACCIONES: superposición de las formas cerradas de cada esquema.
//   2. M(x), V(x): estática pura desde el extremo izquierdo una vez conocidas
//      las reacciones y el momento de empotramiento.
//   3. MEd / VEd: enumeración EXACTA de estaciones candidatas — V es lineal a
//      trozos (máximo en los bordes de tramo) y M cuadrática a trozos (máximo
//      en los bordes o en el punto de cortante nulo). Sin malla y sin error.
//   4. FLECHA: trabajos virtuales sobre el sistema LIBERADO biapoyado
//      (la propia ménsula en el caso de voladizo). El campo de momentos del
//      sistema liberado es estáticamente admisible también para `fp` y `ff`
//      —un empotramiento puede desarrollar momento nulo—, así que la integral
//      con el diagrama REAL devuelve la flecha real de la estructura
//      hiperestática. Integrando cúbico a trozos ⇒ Simpson por tramo es EXACTO
//      poniendo los cortes en {0, aᵢ, x₀, L}.
//
// CALIBRACIÓN frente a lo que ya estaba en producción (ver beamResponse.test.ts):
// con `loads = []` este motor reproduce EXACTAMENTE `BEAM_CASES[bc].MEd/VEd` en
// los 4 esquemas, y también `k_defl` y `k_shear` en ss, ménsula y ff. La única
// discrepancia es `fp`, cuyos dos coeficientes tabulados no eran exactos:
//   · k_defl = 8/185.185 → flecha 0.3% BAJA (el máximo exacto es
//     0.00541606·wL⁴/EI en x = (15−√33)L/16, no wL⁴/185.185EI).
//   · k_shear = 0.21 → 43% ALTA (el trabajo virtual exacto da 0.1463·wL²/GA).
// Aquí se usan los valores exactos. `BEAM_CASES` no se toca: lo comparte el
// módulo de vigas de acero y sigue siendo la fuente de C1/C2/Lcr_factor.
//
// UNIDADES: el módulo es agnóstico. `beamResponse` se usa con la convención de
// `BEAM_CASES` (w en kN/m, L en m → kN y kNm). `beamDeflection` exige
// coherencia entre sus argumentos (ver su doc).

import type { BeamType } from '../../data/defaults';

/** Carga puntual descendente. `a` se mide desde el extremo IZQUIERDO. */
export interface PointLoad {
  /** Magnitud, siempre POSITIVA (hacia abajo). */
  P: number;
  /** Posición desde el extremo izquierdo (el empotramiento en ménsula y en fp). */
  a: number;
}

export type SupportKind = 'pinned' | 'fixed';

export interface SupportReaction {
  id: 'left' | 'right';
  /** Etiqueta lista para pantalla y PDF. */
  label: string;
  /** Posición del apoyo. */
  x: number;
  kind: SupportKind;
  /** Reacción vertical, positiva hacia ARRIBA. */
  R: number;
  /** Momento de empotramiento (magnitud). 0 en apoyo articulado. */
  M: number;
}

export interface BeamResponse {
  /** 1 entrada en ménsula (el extremo libre no es apoyo), 2 en el resto. */
  reactions: SupportReaction[];
  /** máx |M(x)| */
  MEd: number;
  /** máx |V(x)| */
  VEd: number;
  /** Sección donde se da máx |M(x)|. */
  xM: number;
  /** Flector, SAGGING POSITIVO. */
  M: (x: number) => number;
  /** Cortante. En una carga puntual devuelve el valor por la IZQUIERDA. */
  V: (x: number) => number;
}

// ── Esquemas de apoyo ────────────────────────────────────────────────────────

const SUPPORTS: Record<BeamType, {
  left: { kind: SupportKind; label: string };
  right: { kind: SupportKind; label: string } | null;   // null = extremo libre
}> = {
  ss: {
    left:  { kind: 'pinned', label: 'Apoyo izquierdo' },
    right: { kind: 'pinned', label: 'Apoyo derecho' },
  },
  cantilever: {
    left:  { kind: 'fixed', label: 'Empotramiento' },
    right: null,
  },
  fp: {
    left:  { kind: 'fixed',  label: 'Empotramiento (izq.)' },
    right: { kind: 'pinned', label: 'Apoyo derecho' },
  },
  ff: {
    left:  { kind: 'fixed', label: 'Empotramiento izquierdo' },
    right: { kind: 'fixed', label: 'Empotramiento derecho' },
  },
};

/** Posición relativa del máximo de flecha BAJO UDL — semilla del barrido. */
const UDL_DEFL_ARGMAX: Record<BeamType, number> = {
  ss: 0.5,
  cantilever: 1,
  fp: (15 - Math.sqrt(33)) / 16,   // ≈ 0.5784646 desde el empotramiento
  ff: 0.5,
};

// ── Reacciones y momentos de extremo ─────────────────────────────────────────

interface EndForces {
  /** Reacción vertical izquierda (hacia arriba). */
  RL: number;
  /** Momento de empotramiento izquierdo (magnitud, hogging). */
  ML: number;
  RR: number;
  MR: number;
}

/** Reacciones del reparto uniforme `w` — coinciden con los coeficientes de BEAM_CASES. */
function udlEndForces(bc: BeamType, L: number, w: number): EndForces {
  switch (bc) {
    case 'ss':         return { RL: w * L / 2,     ML: 0,             RR: w * L / 2, MR: 0 };
    case 'cantilever': return { RL: w * L,         ML: w * L * L / 2, RR: 0,         MR: 0 };
    case 'fp':         return { RL: 5 * w * L / 8, ML: w * L * L / 8, RR: 3 * w * L / 8, MR: 0 };
    case 'ff':         return { RL: w * L / 2,     ML: w * L * L / 12, RR: w * L / 2, MR: w * L * L / 12 };
  }
}

/** Reacciones de una carga puntual P situada a distancia `a` del extremo izquierdo. */
function pointEndForces(bc: BeamType, L: number, P: number, a: number): EndForces {
  const b = L - a;
  switch (bc) {
    case 'ss':
      return { RL: P * b / L, ML: 0, RR: P * a / L, MR: 0 };
    case 'cantilever':
      return { RL: P, ML: P * a, RR: 0, MR: 0 };
    case 'fp': {
      // Ménsula apuntalada: empotrada en x=0, articulada en x=L.
      const RR = P * a * a * (3 * L - a) / (2 * L ** 3);
      const ML = P * b * (L * L - b * b) / (2 * L * L);
      return { RL: P - RR, ML, RR, MR: 0 };
    }
    case 'ff':
      return {
        RL: P * b * b * (L + 2 * a) / L ** 3,
        ML: P * a * b * b / (L * L),
        RR: P * a * a * (L + 2 * b) / L ** 3,
        MR: P * a * a * b / (L * L),
      };
  }
}

function endForces(bc: BeamType, L: number, w: number, loads: PointLoad[]): EndForces {
  const ef = udlEndForces(bc, L, w);
  for (const l of loads) {
    const p = pointEndForces(bc, L, l.P, clamp(l.a, 0, L));
    ef.RL += p.RL; ef.ML += p.ML; ef.RR += p.RR; ef.MR += p.MR;
  }
  return ef;
}

// ── Tramos: V lineal y M cuadrática dentro de cada uno ───────────────────────

interface Segment {
  x0: number;
  x1: number;
  /** V justo a la DERECHA de x0. */
  V0: number;
  /** M en x0 (continuo). */
  M0: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Puntos de corte ordenados y sin duplicados exactos (las posiciones vienen ya recortadas). */
function breakpoints(L: number, xs: number[]): number[] {
  const out = [0, L];
  for (const x of xs) {
    const c = clamp(x, 0, L);
    if (!out.includes(c)) out.push(c);
  }
  return out.sort((p, q) => p - q);
}

function buildSegments(bc: BeamType, L: number, w: number, loads: PointLoad[]): Segment[] {
  const ef = endForces(bc, L, w, loads);
  const bps = breakpoints(L, loads.map((l) => l.a));
  const segs: Segment[] = [];

  let V = ef.RL;
  let M = -ef.ML;   // hogging en el empotramiento ⇒ flector negativo (sagging positivo)

  for (let k = 0; k < bps.length - 1; k++) {
    const x0 = bps[k];
    const x1 = bps[k + 1];
    // Cargas puntuales situadas EN x0: entran al pasar a este tramo. Una carga
    // en x = L nunca aparece como x0 ⇒ va directa al apoyo derecho, correcto.
    for (const l of loads) if (clamp(l.a, 0, L) === x0) V -= l.P;
    segs.push({ x0, x1, V0: V, M0: M });
    const t = x1 - x0;
    M = M + V * t - w * t * t / 2;
    V = V - w * t;
  }
  return segs;
}

function segM(s: Segment, w: number, x: number): number {
  const t = x - s.x0;
  return s.M0 + s.V0 * t - w * t * t / 2;
}

function segV(s: Segment, w: number, x: number): number {
  return s.V0 - w * (x - s.x0);
}

function segmentAt(segs: Segment[], x: number): Segment {
  for (const s of segs) if (x >= s.x0 && x <= s.x1) return s;
  return x < segs[0].x0 ? segs[0] : segs[segs.length - 1];
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Esfuerzos y reacciones del vano. Con `loads = []` reproduce exactamente
 * `BEAM_CASES[bc].MEd(w, L)` y `.VEd(w, L)`.
 *
 * @param w  carga repartida (kN/m con la convención del módulo)
 * @param L  luz (m)
 */
export function beamResponse(bc: BeamType, L: number, w: number, loads: PointLoad[]): BeamResponse {
  const ef = endForces(bc, L, w, loads);
  const segs = buildSegments(bc, L, w, loads);

  let Mmax = 0;
  let Vmax = 0;
  let xM = 0;

  for (const s of segs) {
    const span = s.x1 - s.x0;
    if (span <= 0) continue;
    const ts = [0, span];
    // Extremo interior de M: donde V se anula.
    if (w > 0) {
      const t = s.V0 / w;
      if (t > 0 && t < span) ts.push(t);
    }
    for (const t of ts) {
      const x = s.x0 + t;
      const m = Math.abs(segM(s, w, x));
      if (m > Mmax) { Mmax = m; xM = x; }
      const v = Math.abs(segV(s, w, x));
      if (v > Vmax) Vmax = v;
    }
  }

  const sup = SUPPORTS[bc];
  const reactions: SupportReaction[] = [
    { id: 'left', label: sup.left.label, x: 0, kind: sup.left.kind, R: ef.RL, M: ef.ML },
  ];
  if (sup.right) {
    reactions.push({ id: 'right', label: sup.right.label, x: L, kind: sup.right.kind, R: ef.RR, M: ef.MR });
  }

  return {
    reactions,
    MEd: Mmax,
    VEd: Vmax,
    xM,
    M: (x) => segM(segmentAt(segs, clamp(x, 0, L)), w, clamp(x, 0, L)),
    V: (x) => segV(segmentAt(segs, clamp(x, 0, L)), w, clamp(x, 0, L)),
  };
}

// ── Flecha por trabajos virtuales ────────────────────────────────────────────

/** Flector del sistema liberado bajo carga unidad en x0. `right` = ξ está a la derecha de x0. */
function m0(bc: BeamType, L: number, x0: number, x: number, right: boolean): number {
  if (bc === 'cantilever') return right ? 0 : x - x0;
  const RL = (L - x0) / L;
  return right ? RL * x - (x - x0) : RL * x;
}

/** Cortante del sistema liberado bajo carga unidad en x0. */
function v0(bc: BeamType, L: number, x0: number, right: boolean): number {
  if (bc === 'cantilever') return right ? 0 : 1;
  const RL = (L - x0) / L;
  return right ? RL - 1 : RL;
}

export interface DeflectionCurve {
  /** máx |δ| */
  max: number;
  /** Sección del máximo. */
  xMax: number;
  /** Flecha en cualquier sección; positiva hacia ABAJO. */
  at: (x: number) => number;
}

/**
 * Flecha por trabajos virtuales (flexión + cortante). El módulo es agnóstico en
 * unidades pero exige COHERENCIA: pasando L y `a` en mm, `w` en N/mm, `P` en N,
 * `EI` en N·mm² y `GA` en N, la flecha sale en mm — que es como lo usa
 * `calcTimberBeam` (ojo: kN/m y N/mm son numéricamente lo mismo).
 *
 * @param kappa factor de forma a cortante (1.2 en sección rectangular)
 */
export function beamDeflection(
  bc: BeamType,
  L: number,
  w: number,
  loads: PointLoad[],
  EI: number,
  GA: number,
  kappa = 1.2,
): DeflectionCurve {
  const segs = buildSegments(bc, L, w, loads);
  const loadCuts = loads.map((l) => clamp(l.a, 0, L));

  const at = (x0raw: number): number => {
    const x0 = clamp(x0raw, 0, L);
    const cuts = breakpoints(L, [...loadCuts, x0]);
    let ib = 0;
    let is = 0;
    for (let k = 0; k < cuts.length - 1; k++) {
      const u = cuts[k];
      const v = cuts[k + 1];
      const span = v - u;
      if (span <= 0) continue;
      const mid = (u + v) / 2;
      const seg = segmentAt(segs, mid);
      const right = mid > x0;
      // Integrando de flexión: cúbico a trozos ⇒ Simpson exacto.
      const fB = (x: number) => segM(seg, w, x) * m0(bc, L, x0, x, right);
      // Integrando de cortante: lineal a trozos ⇒ Simpson exacto.
      const fS = (x: number) => segV(seg, w, x) * v0(bc, L, x0, right);
      ib += span / 6 * (fB(u) + 4 * fB(mid) + fB(v));
      is += span / 6 * (fS(u) + 4 * fS(mid) + fS(v));
    }
    return ib / EI + (GA > 0 ? kappa * is / GA : 0);
  };

  // Barrido: malla uniforme + posiciones de carga + máximo analítico del UDL.
  const N = 200;
  const stations: number[] = [UDL_DEFL_ARGMAX[bc] * L, ...loadCuts];
  for (let i = 0; i <= N; i++) stations.push(i * L / N);

  let xMax = stations[0];
  let best = Math.abs(at(xMax));
  for (const x of stations) {
    const d = Math.abs(at(x));
    if (d > best) { best = d; xMax = x; }
  }

  // Refinamiento ternario en el intervalo de malla alrededor del mejor punto.
  const h = L / N;
  let lo = Math.max(0, xMax - h);
  let hi = Math.min(L, xMax + h);
  for (let i = 0; i < 80 && hi - lo > 0; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (Math.abs(at(m1)) < Math.abs(at(m2))) lo = m1; else hi = m2;
  }
  const xRef = (lo + hi) / 2;
  const dRef = Math.abs(at(xRef));
  if (dRef > best) { best = dRef; xMax = xRef; }

  return { max: best, xMax, at };
}
