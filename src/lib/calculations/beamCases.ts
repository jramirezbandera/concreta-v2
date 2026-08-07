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
  /**
   * LTB load-height factor C₂ (EC3 Eq. F.2 / NCCI SN003): the module's loads
   * are gravity UDL physically applied on the TOP flange (zg=+h/2,
   * destabilizing), so Mcr must include the −C2·zg reduction (auditoría #61).
   * UDL fork-supported: C2=0.454 (used for ss; reused for fp/ff as the
   * conservative pairing of their C1=1.13 simplification). Cantilever: F.2
   * with Lcr=2L is itself an approximation; C2=0.45 keeps the destabilizing
   * penalty in the conservative direction.
   */
  C2: number;
  /**
   * Shear-deflection coefficient: δ_shear = k_shear · w · L² / (G · A_v=A/1.2)
   * con κ=1.2 (rectangular) YA incluido: δs = κ·ΔM/(G·A) evaluada en el punto
   * de flecha máxima. ss/ff: 1.2·(wL²/8)/wL² = 0.15; fp: 1.2·0.175 ≈ 0.21;
   * ménsula: 1.2·(wL²/2)/wL² = 0.6.
   *
   * YA NO LO CONSUME NINGÚN MOTOR: vigas de madera pasó a `beamDeflection`
   * (beamResponse.ts), que integra el término de cortante por trabajos
   * virtuales para poder superponer cargas puntuales; en acero siempre fue
   * despreciable (E/G≈2.6). Sobrevive como ANCLA DE CALIBRACIÓN —
   * beamResponse.test.ts comprueba que el motor general reproduce estos
   * valores EXACTAMENTE en ss, ménsula y ff. En `fp` no los reproduce, y el
   * bueno es el del motor: ver la nota de `fp` más abajo.
   */
  k_shear: number;
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
    C2:              0.454,
    k_shear:         0.15,
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
    C2:              0.45,
    k_shear:         0.6,
  },

  // ── Fixed-Pinned (articulada–empotrada — fixed at left, pin right) ───────
  // M_max = wL²/8  (fixed support, hogging — governs over 9wL²/128 sagging)
  // V_A   = 5wL/8  (at fixed support — governing shear)
  // V_B   = 3wL/8  (at pinned support)
  // δ_max ≈ 0.005416wL⁴/EI at x≈0.4215L from fixed end
  //       → k = 8/185.185 ≈ 0.04320 (exact: M_A = wL²/8 → k = 8/185.185)
  //
  // OJO — LOS DOS COEFICIENTES DE FLECHA DE `fp` SON APROXIMACIONES, y son las
  // ÚNICAS de la tabla que no son exactas (ss, ménsula y ff sí lo son; anclado
  // en beamResponse.test.ts). Los valores exactos, resueltos al integrar el
  // vano de verdad:
  //   · máximo en x = (15−√33)L/16 = 0.5784646·L desde el empotramiento (no
  //     0.4215·L: ese es el número medido desde el APOYO, el comentario de
  //     arriba lo cuenta desde el lado equivocado);
  //   · δ_max = 0.00541606·wL⁴/EI → k_defl = 8/184.636 = 0.043329. El 8/185.185
  //     de aquí se queda un 0.3% CORTO (lado inseguro).
  //   · k_shear exacto = 0.14630, no 0.21 (aquel salía de una regla ΔM/(G·A)
  //     que solo vale cuando flexión y cortante pican en la misma sección).
  // Vigas de madera ya no los usa. Vigas de acero sigue leyendo `k_defl`: no se
  // ha tocado para no mover en silencio un resultado de otro módulo, pero el
  // valor bueno queda escrito aquí.
  // Critical M section: fixed support, V_A = 5wL/8 = VEd → VEd_interaction = VEd
  // Lcr = 1.0L (conservative upper bound — engineer should reduce per CE Anejo 22 §6.3 if
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
    C2:              0.454,
    k_shear:         0.21,
  },

  // ── Fixed-Fixed (biempotrada) ─────────────────────────────────────────────
  // M_max = wL²/12 (each support, hogging — governs over wL²/24 sagging midspan)
  // V_max = wL/2   (each support)
  // δ_max = wL⁴/(384EI) → k = 1/32 via δ = (1/32)·Mser·L²/EI, Mser = wL²/12
  // Critical M section: each support, max M and max V coincide → VEd_interaction = VEd
  // Lcr = 1.0L (conservative — engineer should reduce per CE Anejo 22 §6.3, typically 0.5–0.7L)
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
    C2:              0.454,
    k_shear:         0.15,
  },
};
