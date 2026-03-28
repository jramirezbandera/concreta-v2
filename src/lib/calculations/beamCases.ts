// Beam case specifications — CTE DB-SE-A Spain
// Single source of truth for all 4 canonical single-span beam types under UDL.
// All force formulas: w in kN/m, L in metres → forces in kN / kNm.

import { type BeamType } from '../../data/defaults';

export interface BeamCaseSpec {
  label: string;       // Full UI label: 'Articulada–Articulada'
  labelShort: string;  // PDF compact label: 'Biarticulada'
  /** Max design bending moment (kNm). w kN/m, L m. */
  MEd: (w: number, L: number) => number;
  /** Max design shear (kN) — for shear check. */
  VEd: (w: number, L: number) => number;
  /**
   * Shear at the section of maximum moment — for M-V interaction check.
   * ss: V=0 at midspan → 0
   * cantilever/ff: max M and max V coincide at support → equals VEd
   * fp: max M at fixed support, V there = 5wL/8 → equals VEd (fp.VEd returns 5wL/8)
   */
  VEd_interaction: (w: number, L: number) => number;
  /** δ = k_defl · Mser · L² / (E · Iy). Derived from δ_max = k_δ · wL⁴/EI, using Mser = MEd_ser. */
  k_defl: number;
  /** Lcr_default = Lcr_factor × L. Cantilever: 2.0 (free-tip); others: 1.0 (conservative). */
  Lcr_factor: number;
  /** LTB equivalent uniform moment factor C₁. Cantilever: 1.0 (conservative); others: 1.13 (UDL). */
  C1: number;
}

export const BEAM_CASES: Record<BeamType, BeamCaseSpec> = {
  // ── Simply Supported (articulada–articulada) ─────────────────────────────
  // M_max = wL²/8 (midspan, sagging)
  // V_max = wL/2  (each support)
  // δ_max = 5wL⁴/(384EI) → k = 5/48 via δ = k·Mser·L²/EI, Mser = wL²/8
  // Critical M section: midspan, V=0 → no M-V interaction
  ss: {
    label:           'Articulada–Articulada',
    labelShort:      'Biarticulada',
    MEd:             (w, L) => (w * L ** 2) / 8,
    VEd:             (w, L) => (w * L) / 2,
    VEd_interaction: ()     => 0,
    k_defl:          5 / 48,
    Lcr_factor:      1.0,
    C1:              1.13,
  },

  // ── Cantilever (ménsula — fixed at left, free right) ─────────────────────
  // M_max = wL²/2  (fixed support, hogging)
  // V_max = wL     (fixed support)
  // δ_max = wL⁴/(8EI) → k = 1/4 via δ = (1/4)·Mser·L²/EI, Mser = wL²/2
  // Critical M section: fixed end, max M and max V coincide → VEd_interaction = VEd
  // Lcr = 2L: CTE DB-SE-A effective buckling length for free-tip cantilever
  // C1 = 1.0: most conservative; UDL 1.13 assumption is non-rigorous for a cantilever
  cantilever: {
    label:           'Ménsula',
    labelShort:      'Mensula',
    MEd:             (w, L) => (w * L ** 2) / 2,
    VEd:             (w, L) => w * L,
    VEd_interaction: (w, L) => w * L,
    k_defl:          1 / 4,
    Lcr_factor:      2.0,
    C1:              1.0,
  },

  // ── Fixed-Pinned (articulada–empotrada — fixed at left, pin right) ───────
  // M_max = wL²/8  (fixed support, hogging — governs over 9wL²/128 sagging)
  // V_A   = 5wL/8  (at fixed support — governing shear)
  // V_B   = 3wL/8  (at pinned support)
  // δ_max ≈ 0.005416wL⁴/EI at x≈0.4215L from fixed end
  //       → k = 8/185.185 ≈ 0.04320 (exact: M_A = wL²/8 → k = 8/185.185)
  // Critical M section: fixed support, V_A = 5wL/8 = VEd → VEd_interaction = VEd
  // Lcr = 1.0L (conservative upper bound — engineer should reduce per EC3 §6.3 if
  //             full rotational restraint is confirmed, typically 0.7L)
  fp: {
    label:           'Articulada–Empotrada',
    labelShort:      'Art-Empotrada',
    MEd:             (w, L) => (w * L ** 2) / 8,
    VEd:             (w, L) => (5 * w * L) / 8,
    VEd_interaction: (w, L) => (5 * w * L) / 8,
    k_defl:          8 / 185.185,   // ≈ 0.04320
    Lcr_factor:      1.0,
    C1:              1.13,
  },

  // ── Fixed-Fixed (biempotrada) ─────────────────────────────────────────────
  // M_max = wL²/12 (each support, hogging — governs over wL²/24 sagging midspan)
  // V_max = wL/2   (each support)
  // δ_max = wL⁴/(384EI) → k = 1/32 via δ = (1/32)·Mser·L²/EI, Mser = wL²/12
  // Critical M section: each support, max M and max V coincide → VEd_interaction = VEd
  // Lcr = 1.0L (conservative — engineer should reduce per EC3 §6.3, typically 0.5–0.7L)
  // C1 = 1.13 (simplification — actual moment gradient for ff differs; conservative)
  ff: {
    label:           'Biempotrada',
    labelShort:      'Biempotrada',
    MEd:             (w, L) => (w * L ** 2) / 12,
    VEd:             (w, L) => (w * L) / 2,
    VEd_interaction: (w, L) => (w * L) / 2,
    k_defl:          1 / 32,
    Lcr_factor:      1.0,
    C1:              1.13,
  },
};
