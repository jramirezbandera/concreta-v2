// I-section adapter (IPE / HEA / HEB / IPN) — wraps the steel-profile catalog
// and encodes EC3 classification, buckling curves, and LTB behaviour for
// rolled open symmetric I/H profiles.

import type {
  SectionGeometry,
  ColumnBeamSection,
  CrossSectionPrimitives,
  ReducedMoments,
} from './types';
import { getProfile, type SteelProfile } from '../../data/steelProfiles';

type SteelTipo = 'IPE' | 'HEA' | 'HEB' | 'IPN';

/** EC3 Table 5.2 limits for outstand flange in pure compression. */
const FLANGE_COMP_LIMITS = [9, 10, 14] as const;  // c/(t·ε)
/** EC3 Table 5.2 limits for internal web in pure compression. */
const WEB_COMP_LIMITS = [33, 38, 42] as const;
/** EC3 Table 5.2 limits for internal web in pure bending. */
const WEB_BEND_LIMITS = [72, 83, 124] as const;

function classifyElement(cOverTEps: number, limits: readonly [number, number, number]): number {
  if (cOverTEps <= limits[0]) return 1;
  if (cOverTEps <= limits[1]) return 2;
  if (cOverTEps <= limits[2]) return 3;
  return 4;
}

export class ISectionAdapter implements ColumnBeamSection {
  readonly kind = 'I' as const;
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

  /** Underlying catalog record — exposed for callers that need it. */
  readonly profile: SteelProfile;

  constructor(profile: SteelProfile) {
    this.profile = profile;
    this.label = profile.label;
    this.A = profile.A;
    this.Iy = profile.Iy;
    this.Iz = profile.Iz;
    this.Wpl_y = profile.Wpl_y;
    // Wpl_z / Wel_z aren't carried by the catalog — derived from geometry.
    this.Wpl_z = wplZForI(profile);
    this.Wel_y = profile.Wel_y;
    this.Wel_z = welZForI(profile);
    this.It = profile.It;
    this.Iw = profile.Iw;
    this.h = profile.h;
    this.b = profile.b;
    this.tf = profile.tf;
    this.tw = profile.tw;
    this.r = profile.r;
  }

  classify(fy: number, mode: 'compression' | 'bending' = 'compression'): number {
    const eps = Math.sqrt(235 / fy);
    const c_f = (this.b - this.tw - 2 * this.r) / 2;
    const c_w = this.h - 2 * this.tf - 2 * this.r;
    const classF = classifyElement(c_f / (this.tf * eps), FLANGE_COMP_LIMITS);
    const webLimits = mode === 'bending' ? WEB_BEND_LIMITS : WEB_COMP_LIMITS;
    const classW = classifyElement(c_w / (this.tw * eps), webLimits);
    return Math.max(classF, classW);
  }

  getBucklingAlpha(): { alpha_y: number; alpha_z: number } {
    // EC3 §6.3.1.2 Tabla 6.2 (S275/S355) — rolled I/H:
    //   h/b > 1.2 and tf ≤ 40mm → curve a (y) / curve b (z)
    //   h/b ≤ 1.2 and tf ≤ 100mm → curve b (y) / curve c (z)
    // IPE is always slender (h/b > 1) and treated with curve a/b.
    const hb = this.h / this.b;
    const isSlender = this.profile.tipo === 'IPE' || hb > 1.2;
    return isSlender
      ? { alpha_y: 0.21, alpha_z: 0.34 }  // curve a / curve b
      : { alpha_y: 0.34, alpha_z: 0.49 }; // curve b / curve c
  }

  getLTBAlpha(): number {
    // EC3 §6.3.2.3 Tabla 6.5 — rolled I/H:
    //   h/b ≤ 2 → curve b (α = 0.34)
    //   h/b > 2 → curve c (α = 0.49)
    return this.h / this.b <= 2 ? 0.34 : 0.49;
  }

  computeMcr(Lcr: number, C1: number, E: number, G: number): number {
    // EC3 Eq. F.2 — classical LTB formula for doubly-symmetric sections.
    const Iz_mm4 = this.Iz * 1e4;
    const It_mm4 = this.It * 1e4;
    const Iw_mm6 = this.Iw * 1e6;
    const L = Lcr;
    const factor1 = (Math.PI * Math.PI * E * Iz_mm4) / (L * L);  // N
    const term2 = Iw_mm6 / Iz_mm4 + (L * L * G * It_mm4) / (Math.PI * Math.PI * E * Iz_mm4);
    if (!(term2 > 0) || !isFinite(term2)) return Infinity;
    return (C1 * factor1 * Math.sqrt(term2)) / 1e6; // N·mm → kNm
  }

  reduceDesignMoments(My: number, Mz: number): ReducedMoments {
    return { My, Mz };
  }

  getPrimitives(): CrossSectionPrimitives {
    // Centre the I-section on the centroid. +x right, +y down; h vertical.
    const { h, b, tf, tw } = this;
    const hx = b / 2;
    const hy = h / 2;
    return {
      kind: 'I',
      shapes: [
        // Top flange
        { type: 'rect', x: -hx, y: -hy, w: b, h: tf },
        // Bottom flange
        { type: 'rect', x: -hx, y: hy - tf, w: b, h: tf },
        // Web
        { type: 'rect', x: -tw / 2, y: -hy + tf, w: tw, h: h - 2 * tf },
      ],
      bbox: { minX: -hx, minY: -hy, maxX: hx, maxY: hy },
    };
  }
}

// ─── Helpers — Wpl_z / Wel_z for I-section when not on catalog ────────────────
// Derived from steelColumns.ts to keep numerical compatibility.

function wplZForI(p: SteelProfile): number {
  // Wpl_z for I-section (plastic modulus about weak axis)
  //   = 2 · [b²·tf/4] + tw·(h−2tf)²·tw/4 … simplified standard expression:
  //   = b²·tf/2 + (h−2tf)·tw²/4
  // Units: mm³; divide by 1000 → cm³.
  const h = p.h, b = p.b, tf = p.tf, tw = p.tw;
  const wpl_mm3 = (b * b * tf) / 2 + ((h - 2 * tf) * tw * tw) / 4;
  return wpl_mm3 / 1000;
}

function welZForI(p: SteelProfile): number {
  // Wel_z = Iz / (b/2) — Iz in cm⁴, b/2 in cm → cm³.
  return (p.Iz * 2) / (p.b / 10);
}

/** Factory helper used by callers that still key by (tipo, size). */
export function makeISectionBySize(tipo: SteelTipo, size: number): ISectionAdapter | undefined {
  const p = getProfile(tipo, size);
  return p ? new ISectionAdapter(p) : undefined;
}

// Re-export SectionGeometry type path for convenience.
export type { SectionGeometry };
