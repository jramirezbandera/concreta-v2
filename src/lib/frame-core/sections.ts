// frame-core — steel catalog + section stiffness/self-weight (Lane B, D12)
//
// Single source of truth for the shared steel profile table and the
// section→stiffness conversions both bar modules use:
//   - fem-analysis/presets.ts derives its legacy MAT steel entries from
//     STEEL_CATALOG (values identical — pure refactor, suite-verified).
//   - fem-analysis/autoDecompose.ts delegates its stiffness/self-weight
//     helpers here.
//   - fem2d/decompose.ts consumes these directly (no cross-feature import).
//
// SI conversions (centralized here):
//   E [kN/m²]  = E [MPa]   × 1e3
//   I [m⁴]    = I [cm⁴]  × 1e-8
//   A [m²]    = A [cm²]  × 1e-4
//   b·h [m²]  = b[cm]·h[cm] × 1e-4
//   q_sw [kN/m] = γ [kN/m³] × A [m²]

import type { RcSection } from './types';

export const GAMMA_CONCRETE = 25;   // kN/m³
export const GAMMA_STEEL = 78.5;    // kN/m³

export interface SteelProfileData {
  name: string;                     // canonical display name ('IPE 240', …)
  role: 'viga' | 'pilar';           // default duty (drives 1D MAT grouping)
  E: number;                        // MPa
  A: number;                        // cm²
  I: number;                        // cm⁴ (major axis — bending/analysis)
  /** cm⁴ — MINOR/minimum axis, for flexural buckling of axial members (the
   *  fem2d two-force check). For L angles this is the v-v minimum axis (an
   *  L 80×8 buckles about v-v at i≈1.55 cm — using the major I would
   *  overestimate capacity ~2.5×). Standard table values. */
  Iz: number;
  fy: number;                       // MPa (S275 default)
  gamma: number;                    // partial factor γ_M0
}

/** Shared rolled-profile catalog. Major-axis values moved verbatim from the
 *  1D MAT; Iz added for the fem2d axial buckling check. */
export const STEEL_CATALOG: Record<string, SteelProfileData> = {
  steel_IPE200: { name: 'IPE 200', role: 'viga',  E: 210000, A: 28.5, I: 1943,  Iz: 142.4, fy: 275, gamma: 1.05 },
  steel_IPE240: { name: 'IPE 240', role: 'viga',  E: 210000, A: 39.1, I: 3892,  Iz: 283.6, fy: 275, gamma: 1.05 },
  steel_IPE300: { name: 'IPE 300', role: 'viga',  E: 210000, A: 53.8, I: 8356,  Iz: 603.8, fy: 275, gamma: 1.05 },
  steel_IPE360: { name: 'IPE 360', role: 'viga',  E: 210000, A: 72.7, I: 16270, Iz: 1043,  fy: 275, gamma: 1.05 },
  steel_HEB160: { name: 'HEB 160', role: 'pilar', E: 210000, A: 54.3, I: 2492,  Iz: 889.2, fy: 275, gamma: 1.05 },
  steel_HEB200: { name: 'HEB 200', role: 'pilar', E: 210000, A: 78.1, I: 5696,  Iz: 2003,  fy: 275, gamma: 1.05 },
  steel_HEB240: { name: 'HEB 240', role: 'pilar', E: 210000, A: 106,  I: 11260, Iz: 3923,  fy: 275, gamma: 1.05 },
  steel_HEB300: { name: 'HEB 300', role: 'pilar', E: 210000, A: 149,  I: 25170, Iz: 8563,  fy: 275, gamma: 1.05 },
  steel_L80x8:  { name: 'L 80×8',  role: 'viga',  E: 210000, A: 12.3, I: 73.7,  Iz: 29.5,  fy: 275, gamma: 1.05 },
};

export interface SectionStiffness {
  EA: number; // kN
  EI: number; // kN·m²
}

/** Módulo elástico del hormigón que usa el SOLVER (EC2-ish 8500·∛(fck+8) MPa,
 *  kept consistent with the legacy setRcCustom helper so user-facing E is
 *  stable). ÚNICA fuente: el factor de flecha fisurada (crackedDeflection.ts)
 *  debe partir de ESTA base — mezclarla con el Ecm tabulado de materials.ts
 *  (31.5 GPa vs 27.3 a fck25) sería un error silencioso ×1.16. */
export function rcElasticModulusMPa(fck: number): number {
  return 8500 * Math.cbrt(fck + 8);
}

/** RC gross-section stiffness (E = rcElasticModulusMPa). */
export function rcStiffness(sec: RcSection): SectionStiffness {
  const E_MPa = rcElasticModulusMPa(sec.fck);
  const I_cm4 = (sec.b * Math.pow(sec.h, 3)) / 12;
  const A_cm2 = sec.b * sec.h;
  return {
    EI: E_MPa * 1e3 * I_cm4 * 1e-8,
    EA: E_MPa * 1e3 * A_cm2 * 1e-4,
  };
}

/** Steel profile stiffness from the shared catalog. null when key unknown. */
export function steelStiffness(profileKey: string): SectionStiffness | null {
  const p = STEEL_CATALOG[profileKey];
  if (!p) return null;
  return {
    EI: p.E * 1e3 * p.I * 1e-8,
    EA: p.E * 1e3 * p.A * 1e-4,
  };
}

/** Self-weight per unit length (positive magnitude, kN/m). */
export function rcSelfWeight(sec: RcSection): number {
  return GAMMA_CONCRETE * sec.b * 0.01 * sec.h * 0.01;
}

/** Self-weight per unit length (positive magnitude, kN/m). 0 if key unknown. */
export function steelSelfWeight(profileKey: string): number {
  const p = STEEL_CATALOG[profileKey];
  if (!p) return 0;
  return GAMMA_STEEL * p.A * 1e-4;
}
