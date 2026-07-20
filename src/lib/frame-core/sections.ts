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

import { getTimberGrade } from '../../data/timberGrades';
import { STEEL_SECTION_ENTRIES } from '../sections/catalog';
import type { RcSection, TimberSection } from './types';

export const GAMMA_CONCRETE = 25;   // kN/m³
export const GAMMA_STEEL = 78.5;    // kN/m³
/** g para pasar ρ_mean (kg/m³) a peso (kN/m³) — mismo valor que units/catalog. */
const GRAVITY = 9.80665; // m/s²

export interface SteelProfileData {
  name: string;                     // canonical display name ('IPE 240', …)
  role: 'viga' | 'pilar';           // default duty (drives 1D MAT grouping)
  E: number;                        // MPa
  A: number;                        // cm²
  I: number;                        // cm⁴ (major axis — bending/analysis)
  /** cm⁴ — MINOR/minimum axis, for flexural buckling of axial members (the
   *  fem2d two-force check). For L angles this is the v-v minimum axis (an
   *  L 80×8 buckles about v-v at i≈1.55 cm — using the major I would
   *  overestimate capacity ~2.5×). For 2UPN boxes Iz_box can EXCEED Iy, so
   *  the derivation stores the minimum of both axes. */
  Iz: number;
  fy: number;                       // MPa (S275 default)
  gamma: number;                    // partial factor γ_M0
}

/** Shared profile catalog — DERIVED from the unified named registry
 *  (lib/sections/catalog.ts). The 9 historic literal keys (steel_IPE…,
 *  steel_HEB…, steel_L80x8) resolve to identical values (suite-guarded);
 *  every other UI-reachable key (full IPE/HEA/HEB/IPN series, 2UPN, SHS/RHS/
 *  CHS tubes) now resolves too — a missing key used to yield silent
 *  EI = 0 bars in the 1D solver. */
export const STEEL_CATALOG: Record<string, SteelProfileData> = Object.fromEntries(
  STEEL_SECTION_ENTRIES.map((e) => [e.key, {
    name: e.label,
    role: e.role,
    E: 210000,
    A: e.A,
    I: e.Iy,
    Iz: Math.min(e.Iy, e.Iz),
    fy: 275,
    gamma: 1.05,
  }]),
);

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

/** Timber section stiffness — E0,mean de la clase resistente (análisis
 *  elástico de esfuerzos, EC5 §2.2.2), sección bruta b×h en mm. null cuando
 *  la clase no existe en el catálogo. */
export function timberStiffness(sec: TimberSection): SectionStiffness | null {
  const g = getTimberGrade(sec.gradeId);
  if (!g) return null;
  const E_MPa = g.E0_mean * 1000;             // kN/mm² → MPa
  const I_m4 = (sec.b * Math.pow(sec.h, 3)) / 12 * 1e-12; // mm⁴ → m⁴
  const A_m2 = sec.b * sec.h * 1e-6;          // mm² → m²
  return {
    EI: E_MPa * 1e3 * I_m4,
    EA: E_MPa * 1e3 * A_m2,
  };
}

/** Self-weight per unit length (positive magnitude, kN/m) con ρ_mean de la
 *  clase. 0 if the grade is unknown. */
export function timberSelfWeight(sec: TimberSection): number {
  const g = getTimberGrade(sec.gradeId);
  if (!g) return 0;
  const gamma = (g.rho_mean * GRAVITY) / 1000; // kg/m³ → kN/m³
  return gamma * sec.b * sec.h * 1e-6;
}
