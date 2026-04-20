// CHS (Circular Hollow Section) — EN 10210 hot-finished (curve a) and
// EN 10219 cold-formed (curve c). Axially symmetric: Iy = Iz, no LTB,
// biaxial moments collapse to the resultant M_res = √(My² + Mz²) for the
// interaction check but are kept separate for §6.2.5 per-axis resistance
// (same Wpl,y = Wpl,z means M_res vs Wpl suffices).

import type {
  ColumnBeamSection,
  CrossSectionPrimitives,
  ReducedMoments,
} from './types';

/** Manufacturing process — drives the buckling curve selection. */
export type CHSProcess = 'hot-finished' | 'cold-formed';

export interface CHSInputs {
  /** Outer diameter in mm. */
  D: number;
  /** Wall thickness in mm. */
  t: number;
  process: CHSProcess;
}

/** A subset of commercial EN 10210 / 10219 CHS sizes for the catalog datalist. */
export const CHS_COMMERCIAL_DIAMETERS: readonly number[] = [
  42.4, 48.3, 60.3, 76.1, 88.9, 101.6, 114.3, 139.7, 168.3, 193.7,
  219.1, 244.5, 273.0, 323.9, 355.6, 406.4, 457.0, 508.0,
];
/** Typical commercial wall thicknesses in mm. */
export const CHS_COMMERCIAL_THICKNESSES: readonly number[] = [
  2.6, 2.9, 3.2, 3.6, 4.0, 4.5, 5.0, 5.6, 6.3, 7.1, 8.0, 8.8,
  10.0, 11.0, 12.5, 14.2, 16.0, 17.5, 20.0, 22.0, 25.0,
];

export class CHSAdapter implements ColumnBeamSection {
  readonly kind = 'CHS' as const;
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

  readonly D: number;      // outer diameter (mm)
  readonly t: number;      // wall thickness (mm)
  readonly dInner: number; // inner diameter (mm) = D − 2t
  readonly process: CHSProcess;

  constructor({ D, t, process }: CHSInputs) {
    if (!(D > 0) || !(t > 0) || !(D > 2 * t)) {
      // Caller is expected to guard against invalid inputs; we still produce
      // a harmless zero-valued section rather than throw, so calc layers can
      // surface a proper validation error.
      D = Math.max(D, 0);
      t = Math.max(t, 0);
    }
    this.D = D;
    this.t = t;
    this.process = process;
    const d = Math.max(0, D - 2 * t);
    this.dInner = d;

    // mm² / mm⁴ / mm³ → converted to cm units the rest of the app uses.
    const A_mm2 = (Math.PI * (D * D - d * d)) / 4;
    const I_mm4 = (Math.PI * (D ** 4 - d ** 4)) / 64;
    const Wel_mm3 = D > 0 ? (2 * I_mm4) / D : 0;
    const Wpl_mm3 = (D ** 3 - d ** 3) / 6;
    const It_mm4 = 2 * I_mm4; // exact for closed circular ring (St.Venant = polar)

    this.A = A_mm2 / 100;          // cm²
    this.Iy = I_mm4 / 1e4;          // cm⁴
    this.Iz = I_mm4 / 1e4;
    this.Wel_y = Wel_mm3 / 1000;    // cm³
    this.Wel_z = Wel_mm3 / 1000;
    this.Wpl_y = Wpl_mm3 / 1000;
    this.Wpl_z = Wpl_mm3 / 1000;
    this.It = It_mm4 / 1e4;
    this.Iw = 0;

    this.h = D;
    this.b = D;
    this.tf = t;
    this.tw = t;
    this.r = 0;

    const Dstr = formatDiameter(D);
    const tag = process === 'hot-finished' ? 'EN 10210' : 'EN 10219';
    this.label = `CHS ${Dstr}×${t} (${tag})`;
  }

  classify(fy: number, _mode: 'compression' | 'bending' = 'compression'): number {
    // EC3 §5.5 Tabla 5.2 — tubular: D/t limits use ε² = 235/fy.
    //   Class 1: D/t ≤ 50·ε²
    //   Class 2: D/t ≤ 70·ε²
    //   Class 3: D/t ≤ 90·ε²
    // Beyond → Class 4 (rejected by caller).
    void _mode;
    if (!(this.D > 0) || !(this.t > 0)) return 4;
    const epsSq = 235 / fy;
    const ratio = this.D / this.t;
    if (ratio <= 50 * epsSq) return 1;
    if (ratio <= 70 * epsSq) return 2;
    if (ratio <= 90 * epsSq) return 3;
    return 4;
  }

  getBucklingAlpha(): { alpha_y: number; alpha_z: number } {
    // EC3 §6.3.1.2 Tab 6.2:
    //   CHS hot-finished → curve a (α = 0.21)
    //   CHS cold-formed  → curve c (α = 0.49)
    const alpha = this.process === 'hot-finished' ? 0.21 : 0.49;
    return { alpha_y: alpha, alpha_z: alpha };
  }

  getLTBAlpha(): number {
    return NaN;
  }

  computeMcr(_Lcr: number, _C1: number, _E: number, _G: number): number {
    // Axisymmetric: elastic critical moment is infinite (any rotation about
    // the bending axis is equivalent). Sentinel → χ_LT = 1 downstream.
    void _Lcr; void _C1; void _E; void _G;
    return Infinity;
  }

  reduceDesignMoments(My: number, Mz: number): ReducedMoments {
    // Collapse biaxial moments to their resultant for the interaction check.
    // Wpl_y = Wpl_z so this is equivalent to a single §6.2.5 check with M_res.
    const M_res = Math.sqrt(My * My + Mz * Mz);
    return { My: M_res, Mz: 0, M_res };
  }

  getPrimitives(): CrossSectionPrimitives {
    const R = this.D / 2;
    const rIn = Math.max(0, R - this.t);
    return {
      kind: 'CHS',
      shapes: [{ type: 'ring', cx: 0, cy: 0, rOuter: R, rInner: rIn }],
      bbox: { minX: -R, minY: -R, maxX: R, maxY: R },
    };
  }
}

function formatDiameter(D: number): string {
  // Commercial sizes often carry one decimal (e.g. 168.3, 219.1); drop
  // trailing zeros for neat labels.
  return Number.isInteger(D) ? String(D) : D.toFixed(1);
}

export function makeCHS(D: number, t: number, process: CHSProcess): CHSAdapter {
  return new CHSAdapter({ D, t, process });
}
