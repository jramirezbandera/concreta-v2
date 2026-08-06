// RHS / SHS (rectangular / square hollow section) — EN 10210 hot-finished
// (buckling curve a) and EN 10219 cold-formed (curve c). Closed section:
// no LTB (computeMcr → ∞ → χ_LT = 1), all walls are internal parts for
// classification. SHS is just RHS with h === b (Iy = Iz).
//
// Properties are computed from h × b × t with rounded-corner geometry
// (outer radius ro / inner ri per the product standard) by exact
// composition: rounded-rect(b,h,ro) minus rounded-rect(b−2t,h−2t,ri).
// This is the same geometric model behind the EN 10219-2 Annex B /
// EN 10210-2 Annex A property tables — adapter values match published
// rows within ~1% (see test/calc/rhs.test.ts).

import type {
  ColumnBeamSection,
  CrossSectionPrimitives,
  ReducedMoments,
  ClassifyMode,
  CombinedClassifyOpts,
} from './types';

/** Manufacturing process — drives buckling curve and corner radii. */
export type RHSProcess = 'hot-finished' | 'cold-formed';

export interface RHSInputs {
  /** Overall depth (mm) — parallel to the strong axis. */
  h: number;
  /** Overall width (mm). */
  b: number;
  /** Wall thickness (mm). */
  t: number;
  process: RHSProcess;
  /**
   * Designación DECLARADA por quien construye la sección: `true` = SHS.
   * Se omite cuando nadie la declara (catálogo, adaptadores FEM, tests), y
   * entonces se deriva de la geometría (h === b).
   *
   * Existe porque la geometría NO basta para nombrar el producto: un tubo
   * definido a mano como RHS 100×100×8 es cuadrado, pero rotularlo «SHS»
   * contradice el selector de familia que el usuario acaba de rellenar —y
   * dejaba el PDF de pilares (que sí rotula por familia declarada) diciendo
   * una cosa mientras la pantalla decía otra.
   */
  square?: boolean;
}

/** EC3 Table 5.2 limits for internal parts in pure compression. */
const INTERNAL_COMP_LIMITS = [33, 38, 42] as const;
/** EC3 Table 5.2 limits for internal parts in pure bending. */
const INTERNAL_BEND_LIMITS = [72, 83, 124] as const;

function classifyElement(cOverTEps: number, limits: readonly [number, number, number]): number {
  if (cOverTEps <= limits[0]) return 1;
  if (cOverTEps <= limits[1]) return 2;
  if (cOverTEps <= limits[2]) return 3;
  return 4;
}

/** Corner radii per product standard.
 *  EN 10210-2 (hot):  ro = 1.5t, ri = 1.0t.
 *  EN 10219-2 (cold): ro = 2t (t≤6) / 2.5t (6<t≤10) / 3t (t>10); ri = ro − t. */
function cornerRadii(t: number, process: RHSProcess): { ro: number; ri: number } {
  if (process === 'hot-finished') return { ro: 1.5 * t, ri: 1.0 * t };
  const ro = t <= 6 ? 2 * t : t <= 10 ? 2.5 * t : 3 * t;
  return { ro, ri: ro - t };
}

// ── Solid rounded-rectangle property helpers (mm units) ─────────────────────
// Bending axis is the horizontal centroidal axis (extreme fibre at ±h/2).
// Each corner sliver = corner square r×r minus the quarter disc of radius r.

function areaRR(b: number, h: number, r: number): number {
  return b * h - (4 - Math.PI) * r * r;
}

function inertiaRR(b: number, h: number, r: number): number {
  const I_rect = (b * h ** 3) / 12;
  if (r <= 0) return I_rect;
  const ySq = h / 2 - r / 2;                                     // corner-square centroid
  const I_sq = r ** 4 / 12 + r * r * ySq * ySq;
  // Quarter disc: I about its own circle-centre axis is πr⁴/16; the global
  // transfer needs the CENTROID (offset e = 4r/(3π) from the centre), which
  // adds the cross term 2·A·yC·e — omitting it understates I_qd and shaves
  // several % off Iy (caught by the strip-integration oracle).
  const yC = h / 2 - r;                                          // quarter-disc circle centre
  const A_qd = (Math.PI * r * r) / 4;
  const e = (4 * r) / (3 * Math.PI);
  const I_qd = (Math.PI / 16) * r ** 4 + A_qd * (yC * yC + 2 * yC * e);
  return I_rect - 4 * (I_sq - I_qd);
}

function wplRR(b: number, h: number, r: number): number {
  const W_rect = (b * h * h) / 4;
  if (r <= 0) return W_rect;
  const Q_sq = r * r * (h / 2 - r / 2);
  const yC = h / 2 - r;
  const Q_qd = ((Math.PI * r * r) / 4) * (yC + (4 * r) / (3 * Math.PI));
  return W_rect - 4 * (Q_sq - Q_qd);
}

export class RHSAdapter implements ColumnBeamSection {
  readonly kind = 'RHS' as const;
  readonly label: string;

  readonly A: number;
  readonly Iy: number;
  readonly Iz: number;
  readonly Wpl_y: number;
  readonly Wpl_z: number;
  readonly Wel_y: number;
  readonly Wel_z: number;
  readonly It: number;
  readonly Iw: number;

  readonly h: number;
  readonly b: number;
  readonly tf: number;
  readonly tw: number;
  readonly r: number;

  readonly t: number;
  readonly process: RHSProcess;
  /**
   * Designación SHS (tubo cuadrado). Declarada por el descriptor; derivada de
   * h === b solo cuando no se declara. No interviene en ningún cálculo: SHS y
   * RHS comparten fórmulas, curva de pandeo y clasificación — es rotulación.
   */
  readonly isSquare: boolean;

  constructor({ h, b, t, process, square }: RHSInputs) {
    if (!(h > 0) || !(b > 0) || !(t > 0) || !(Math.min(h, b) > 2 * t)) {
      // Same guard philosophy as CHSAdapter: produce a harmless ZERO-valued
      // section (t = 0 ⇒ outer minus inner cancels exactly) so calc layers
      // surface a proper validation error instead of a phantom solid block.
      h = Math.max(h, 0);
      b = Math.max(b, 0);
      t = 0;
    }
    this.h = h;
    this.b = b;
    this.t = t;
    this.process = process;
    this.isSquare = square ?? h === b;
    this.tf = t;
    this.tw = t;

    const { ro, ri } = cornerRadii(t, process);
    this.r = ro;
    const bi = Math.max(0, b - 2 * t);
    const hi = Math.max(0, h - 2 * t);

    const A_mm2 = areaRR(b, h, ro) - areaRR(bi, hi, ri);
    const Iy_mm4 = inertiaRR(b, h, ro) - inertiaRR(bi, hi, ri);
    const Iz_mm4 = inertiaRR(h, b, ro) - inertiaRR(hi, bi, ri);
    const Wpl_y_mm3 = wplRR(b, h, ro) - wplRR(bi, hi, ri);
    const Wpl_z_mm3 = wplRR(h, b, ro) - wplRR(hi, bi, ri);

    // St. Venant torsion — thin-walled closed section with rounded median
    // line (EN 10210-2 Annex A / EN 10219-2 Annex B): It = t³p/3 + 4·Ap²·t/p.
    const Rc = (ro + ri) / 2;
    const p = 2 * ((h - t) + (b - t)) - 2 * Rc * (4 - Math.PI);
    const Ap = (h - t) * (b - t) - Rc * Rc * (4 - Math.PI);
    const It_mm4 = p > 0 ? (t ** 3 * p) / 3 + (4 * Ap * Ap * t) / p : 0;

    this.A = A_mm2 / 100;            // cm²
    this.Iy = Iy_mm4 / 1e4;          // cm⁴
    this.Iz = Iz_mm4 / 1e4;
    this.Wel_y = h > 0 ? Iy_mm4 / (h / 2) / 1000 : 0;  // cm³
    this.Wel_z = b > 0 ? Iz_mm4 / (b / 2) / 1000 : 0;
    this.Wpl_y = Wpl_y_mm3 / 1000;
    this.Wpl_z = Wpl_z_mm3 / 1000;
    this.It = It_mm4 / 1e4;
    this.Iw = 0;                     // closed section — warping negligible

    const tag = process === 'hot-finished' ? 'EN 10210' : 'EN 10219';
    this.label = `${this.isSquare ? 'SHS' : 'RHS'} ${h}×${b}×${t} (${tag})`;
  }

  classify(fy: number, mode: ClassifyMode = 'compression', opts?: CombinedClassifyOpts): number {
    // EC3 Tab 5.2 — all walls are internal parts. Flat width c per the
    // normative shortcut for hollow sections: c = dim − 3t.
    if (!(this.h > 0) || !(this.b > 0) || !(this.t > 0)) return 4;
    const eps = Math.sqrt(235 / fy);
    const c_f = Math.max(0, this.b - 3 * this.t);   // wall ⊥ strong axis (flange)
    const c_w = Math.max(0, this.h - 3 * this.t);   // wall ∥ strong axis (web)
    // Flange: compression limits — exact in compression/bending, conservative
    // for any moment sign in combined.
    const classF = classifyElement(c_f / (this.t * eps), INTERNAL_COMP_LIMITS);

    let classW: number;
    if (mode === 'combined' && opts) {
      // Same interpolated internal-part limits as ISectionAdapter (Tab 5.2,
      // «parts in bending and compression») with the real N+M distribution.
      const a = Math.min(1, Math.max(0, opts.alphaWeb));
      const psi = Math.min(1, Math.max(-3, opts.psiWeb));
      const lim1 = a > 0.5 ? (396 * eps) / (13 * a - 1) : (36 * eps) / Math.max(a, 1e-6);
      const lim2 = a > 0.5 ? (456 * eps) / (13 * a - 1) : (41.5 * eps) / Math.max(a, 1e-6);
      const lim3 = psi > -1
        ? (42 * eps) / (0.67 + 0.33 * psi)
        : 62 * eps * (1 - psi) * Math.sqrt(-psi);
      const ct = c_w / this.t;
      classW = ct <= lim1 ? 1 : ct <= lim2 ? 2 : ct <= lim3 ? 3 : 4;
    } else {
      const webLimits = mode === 'bending' ? INTERNAL_BEND_LIMITS : INTERNAL_COMP_LIMITS;
      classW = classifyElement(c_w / (this.t * eps), webLimits);
    }
    return Math.max(classF, classW);
  }

  getBucklingAlpha(): { alpha_y: number; alpha_z: number } {
    // CE Anejo 22 §6.3.1.2 Tab 6.2:
    //   RHS/SHS hot-finished → curve a (α = 0.21)
    //   RHS/SHS cold-formed  → curve c (α = 0.49)
    const alpha = this.process === 'hot-finished' ? 0.21 : 0.49;
    return { alpha_y: alpha, alpha_z: alpha };
  }

  getLTBAlpha(): number {
    return NaN;  // LTB doesn't apply to closed sections
  }

  shearAreaZ(): number {
    // CE Anejo 22 §6.2.6(3)(f) — RHS/SHS con carga paralela al canto h:
    // Av = A·h/(b + h).
    const A_mm2 = this.A * 100;
    return this.b + this.h > 0 ? (A_mm2 * this.h) / (this.b + this.h) : 0;
  }

  computeMcr(_Lcr: number, _C1: number, _E: number, _G: number): number {
    // Closed section: Iw = 0 and GIt is very large → Mcr → ∞, so
    // λ̄_LT = √(Wpl·fy / Mcr) → 0 → χ_LT = 1 downstream.
    void _Lcr; void _C1; void _E; void _G;
    return Infinity;
  }

  reduceDesignMoments(My: number, Mz: number): ReducedMoments {
    return { My, Mz };
  }

  getPrimitives(): CrossSectionPrimitives {
    const { h, b, t } = this;
    const hx = b / 2;
    const hy = h / 2;
    return {
      kind: 'RHS',
      shapes: [
        { type: 'rect', x: -hx, y: -hy, w: b, h: t },            // top wall
        { type: 'rect', x: -hx, y: hy - t, w: b, h: t },         // bottom wall
        { type: 'rect', x: -hx, y: -hy + t, w: t, h: h - 2 * t },// left wall
        { type: 'rect', x: hx - t, y: -hy + t, w: t, h: h - 2 * t },// right wall
      ],
      bbox: { minX: -hx, minY: -hy, maxX: hx, maxY: hy },
    };
  }
}

export function makeRHS(
  h: number,
  b: number,
  t: number,
  process: RHSProcess,
  square?: boolean,
): RHSAdapter {
  return new RHSAdapter({ h, b, t, process, square });
}
