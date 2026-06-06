// EC3-1-8 / CE Anejo 18 §6.2.5 — base-plate bearing primitives.
//
// Pure scalar formulas with NO input-object coupling, shared by:
//   • anchorPlate.ts — full base-plate / anchor solver
//   • cruceta.ts     — UPN cruciform spreader on concrete (punzonamiento)
//
// Keeping these in one place guarantees both modules use the same βj and the
// same effective-overhang formula (single source of truth for the norm).

/** Grout/joint bearing factor βj (EC3-1-8 §6.2.5(7)). 2/3 for bedded joints. */
export const BETA_J = 2 / 3;

/**
 * Concrete bearing strength of the joint, f_jd (MPa):
 *   f_jd = βj · α · fcd
 * α is the EC3 §6.2.5(4) concentration factor Kj (1 ≤ α ≤ 3); pass α = 1 for
 * no concentration (conservative).
 */
export function fjd(fcd: number, alpha = 1, betaj: number = BETA_J): number {
  return betaj * alpha * fcd;
}

/**
 * Effective cantilever overhang c (mm), EC3-1-8 §6.2.5(4) Eq 6.5:
 *   c = t · √(fyd / (3·f_jd))
 * The length over which a steel plate/flange of thickness t (mm) and design
 * yield fyd (MPa) spreads bearing pressure f_jd (MPa) while staying effectively
 * rigid. Guarded against f_jd → 0.
 */
export function effectiveOverhang(t: number, fyd: number, fjd_MPa: number): number {
  return t * Math.sqrt(fyd / (3 * Math.max(fjd_MPa, 1e-6)));
}

/**
 * Joint concentration factor Kj, EC3-1-8 §6.2.5(4):
 *   Kj = √((a1·b1) / (a·b))     with 1 ≤ Kj ≤ 3
 * where (a,b) is the loaded area and (a1,b1) the effective bearing area on the
 * foundation, capped per the standard:
 *   a1 ≤ min(a + 2·ar, 5·a, a + h, 5·b1),  a1 ≥ a
 *   b1 ≤ min(b + 2·br, 5·b, b + h, 5·a1),  b1 ≥ b
 * ar/br = foundation overhang each side (mm); h = foundation depth (mm). The
 * 5·a1 ↔ 5·b1 cross-cap is resolved with one refinement pass (the cross-caps
 * rarely bind in practice). Single source of truth for anchorPlate.ts and
 * cruceta.ts so both modules share one Kj.
 */
export function concentrationKj(
  a: number, b: number, ar: number, br: number, h: number,
): { Kj: number; a1: number; b1: number } {
  // Provisional a1/b1 ignoring the cross-cap.
  const a1_prov = Math.max(a, Math.min(a + 2 * ar, 5 * a, a + h));
  const b1_prov = Math.max(b, Math.min(b + 2 * br, 5 * b, b + h));
  // Apply the cross-cap with the provisionals.
  const a1 = Math.max(a, Math.min(a1_prov, 5 * b1_prov));
  const b1 = Math.max(b, Math.min(b1_prov, 5 * a1));

  const Kj = Math.min(3, Math.max(1, Math.sqrt((a1 * b1) / (a * b))));
  return { Kj, a1, b1 };
}
