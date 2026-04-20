// 2UPN closed box adapter — two UPN channels welded web-to-web forming a
// rectangular closed section. No LTB (closed section → Iw = 0 and St.Venant
// torsion dominates), single buckling curve b for both axes.

import type {
  ColumnBeamSection,
  CrossSectionPrimitives,
  ReducedMoments,
} from './types';
import { buildUPNBox, type UPNBoxProfile } from '../../data/steelProfiles';

// 2UPN box: both web and flange become internal (closed box) → Tab 5.2 internal limits.
const INTERNAL_COMP_LIMITS = [33, 38, 42] as const;

function classifyElement(cOverTEps: number, limits: readonly [number, number, number]): number {
  if (cOverTEps <= limits[0]) return 1;
  if (cOverTEps <= limits[1]) return 2;
  if (cOverTEps <= limits[2]) return 3;
  return 4;
}

export class UPNBoxAdapter implements ColumnBeamSection {
  readonly kind = '2UPN' as const;
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

  /** Underlying box record — exposed for callers that need b_upn etc. */
  readonly box: UPNBoxProfile;

  constructor(box: UPNBoxProfile) {
    this.box = box;
    this.label = `2UPN ${box.size}`;
    this.A = box.A;
    this.Iy = box.Iy;
    this.Iz = box.Iz;
    this.Wpl_y = box.Wpl_y;
    this.Wpl_z = wplZForBox(box);
    this.Wel_y = box.Wel_y;
    this.Wel_z = welZForBox(box);
    this.It = box.It;
    this.Iw = 0;
    this.h = box.h;
    this.b = box.b;  // 2 · b_upn
    this.tf = box.tf;
    this.tw = box.tw;
    this.r = 0;
  }

  classify(fy: number, _mode: 'compression' | 'bending' = 'compression'): number {
    // Box elements are INTERNAL (both faces welded) except the UPN flange tips.
    // Conservative approach (matches existing steelColumns.ts):
    //   - treat both web c/t and flange c/t against INTERNAL limits
    //     (box is axially symmetric, mode has no practical effect under M+N).
    void _mode;
    const eps = Math.sqrt(235 / fy);
    const c_w = Math.max(0, this.h - 2 * this.tf);
    const c_f = Math.max(0, this.b - 2 * this.tw);  // internal distance between webs
    const classW = classifyElement(c_w / (this.tw * eps), INTERNAL_COMP_LIMITS);
    const classF = classifyElement(c_f / (this.tf * eps), INTERNAL_COMP_LIMITS);
    return Math.max(classW, classF);
  }

  getBucklingAlpha(): { alpha_y: number; alpha_z: number } {
    // Welded / rolled box — curve b both axes per EC3 Tab 6.2.
    return { alpha_y: 0.34, alpha_z: 0.34 };
  }

  getLTBAlpha(): number {
    return NaN;  // LTB doesn't apply to closed sections
  }

  computeMcr(_Lcr: number, _C1: number, _E: number, _G: number): number {
    // Closed section: Iw = 0, torsional stiffness GIt very large. Mcr → ∞
    // (numerically very large), so λ̄_LT = √(Wpl·fy / Mcr) → 0 → χ_LT = 1.
    void _Lcr; void _C1; void _E; void _G;
    return Infinity;
  }

  reduceDesignMoments(My: number, Mz: number): ReducedMoments {
    return { My, Mz };
  }

  getPrimitives(): CrossSectionPrimitives {
    // Render as two facing UPN channels. Origin at centroid.
    const { h, b, tf, tw, box } = this;
    const hx = b / 2;
    const hy = h / 2;
    const half_b_upn = box.b_upn;
    // Left UPN: web at left, flanges extend right
    // Right UPN: web at right, flanges extend left
    return {
      kind: '2UPN',
      shapes: [
        // Left UPN web
        { type: 'rect', x: -hx, y: -hy, w: tw, h: h },
        // Left UPN top flange
        { type: 'rect', x: -hx, y: -hy, w: half_b_upn, h: tf },
        // Left UPN bottom flange
        { type: 'rect', x: -hx, y: hy - tf, w: half_b_upn, h: tf },
        // Right UPN web
        { type: 'rect', x: hx - tw, y: -hy, w: tw, h: h },
        // Right UPN top flange
        { type: 'rect', x: 0, y: -hy, w: half_b_upn, h: tf },
        // Right UPN bottom flange
        { type: 'rect', x: 0, y: hy - tf, w: half_b_upn, h: tf },
        // Weld lines at centre junction (inside top flange)
        { type: 'line', x1: 0, y1: -hy + 2, x2: 0, y2: -hy + tf - 2, dashed: true },
        // Weld lines at centre junction (inside bottom flange)
        { type: 'line', x1: 0, y1: hy - tf + 2, x2: 0, y2: hy - 2, dashed: true },
      ],
      bbox: { minX: -hx, minY: -hy, maxX: hx, maxY: hy },
    };
  }
}

function wplZForBox(box: UPNBoxProfile): number {
  // Wpl_z = 2·[b_upn²·tf + tw·(h−2·tf)·(b_upn − tw/2)]   (all in cm → cm³).
  // Reproduced verbatim from steelColumns.ts for numerical compatibility.
  const b = box.b_upn / 10, hh = box.h / 10, tf = box.tf / 10, tw = box.tw / 10;
  return 2 * (b * b * tf + tw * (hh - 2 * tf) * (b - tw / 2));
}

function welZForBox(box: UPNBoxProfile): number {
  // Wel_z = Iz_box / b_upn — extreme fibre is at b_upn from the centroid.
  const b_upn_cm = box.b_upn / 10;
  return b_upn_cm > 0 ? box.Iz / b_upn_cm : 0;
}

export function makeUPNBoxBySize(size: number): UPNBoxAdapter | undefined {
  const box = buildUPNBox(size);
  return box ? new UPNBoxAdapter(box) : undefined;
}
