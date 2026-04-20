// T-section bending solver — CE art. 21 (b_eff), art. 42 (flexión)
// All units: mm, MPa, kN, kNm.

export interface TSectionResult {
  x: number;      // neutral axis depth (mm)
  MRd: number;    // design bending resistance (kNm)
  branch: 'rect-bEff' | 'rect-bw' | 't-real';  // which branch was used
  z: number;      // mechanical arm (mm)
}

/**
 * Rectangular Whitney block — used for M- (apoyo reticular = b_w) and losa maciza.
 *   0.8·x·b·fcd = As·fyd
 *   MRd = As·fyd·(d − 0.4·x)
 */
export function solveRectangular(
  b: number, d: number, As: number, fcd: number, fyd: number,
): { x: number; MRd: number; z: number } {
  const x = (As * fyd) / (0.8 * b * fcd);
  const MRd = (As * fyd * (d - 0.4 * x)) / 1e6;  // N·mm → kN·m
  return { x, MRd, z: d - 0.4 * x };
}

/**
 * T-section (vano reticular) — branches by neutral axis position:
 *   x ≤ h_f → rectangular b_eff × d (ala entera en compresión)
 *   x >  h_f → T real: As_web = As − Asf, equilibrium on b_w
 * where Asf = (b_eff − b_w)·h_f·fcd / fyd (acero ficticio equivalente al ala saliente).
 *
 * MRd (T-real) = As_web·fyd·(d − 0.4·x) + Asf·fyd·(d − h_f/2)
 *
 * Fallback: if Asf ≥ As (ala sola bastaría) use rect-bEff branch.
 */
export function solveTSection(
  bEff: number, bWeb: number, hFlange: number, d: number,
  As: number, fcd: number, fyd: number,
): TSectionResult {
  // 1) try rectangular on b_eff
  const rect = solveRectangular(bEff, d, As, fcd, fyd);
  if (rect.x <= hFlange) {
    return { x: rect.x, MRd: rect.MRd, branch: 'rect-bEff', z: rect.z };
  }

  // 2) T real — Asf equivalent to flange overhang
  const Asf = ((bEff - bWeb) * hFlange * fcd) / fyd;
  if (Asf >= As) {
    // overhang alone exceeds tension steel → fallback to rect on b_eff
    return { x: rect.x, MRd: rect.MRd, branch: 'rect-bEff', z: rect.z };
  }

  const AsWeb = As - Asf;
  const x = (AsWeb * fyd) / (0.8 * bWeb * fcd);
  const MRdWeb   = (AsWeb * fyd * (d - 0.4 * x)) / 1e6;
  const MRdFlange = (Asf  * fyd * (d - hFlange / 2)) / 1e6;
  const MRd = MRdWeb + MRdFlange;
  return { x, MRd, branch: 't-real', z: d - 0.4 * x };
}

/**
 * b_eff — CE art. 21. Simplification:
 *   b_eff = min(intereje, L0 / 5)
 * where L0 = l0Factor · L (tipoVano dependent).
 * Never below b_w.
 */
export function computeBEff(
  intereje: number, spanLength: number, l0Factor: number, bWeb: number,
): number {
  const L0 = l0Factor * spanLength;
  const candidate = Math.min(intereje, L0 / 5);
  return Math.max(candidate, bWeb);
}
