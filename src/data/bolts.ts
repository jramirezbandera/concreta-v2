// Bolt reference tables for anchor-plate module.
// Grades per EN ISO 898-1. Tensile-stress areas per EN ISO 898-1 Table 2.

export type BoltGrade = '4.6' | '5.6' | '8.8' | '10.9';
export type BoltDiam  = 12 | 16 | 20 | 24 | 27 | 30 | 36;

/** Yield (fyb) and ultimate (fub) tensile strength per grade [MPa]. */
export const BOLT_GRADE_STRENGTHS: Record<BoltGrade, { fyb: number; fub: number }> = {
  '4.6':  { fyb: 240, fub: 400 },
  '5.6':  { fyb: 300, fub: 500 },
  '8.8':  { fyb: 640, fub: 800 },
  '10.9': { fyb: 900, fub: 1000 },
};

/** Tensile-stress area As [mm²] per nominal diameter. EN ISO 898-1 Tab 2. */
export const BOLT_AREAS: Record<BoltDiam, { A: number; As: number }> = {
  12: { A: 113.1, As:  84.3 },
  16: { A: 201.1, As: 157.0 },
  20: { A: 314.2, As: 245.0 },
  24: { A: 452.4, As: 353.0 },
  27: { A: 572.6, As: 459.0 },
  30: { A: 706.9, As: 561.0 },
  36: { A: 1017.9, As: 817.0 },
};

export const AVAILABLE_BOLT_DIAMS: BoltDiam[]  = [12, 16, 20, 24, 27, 30, 36];
export const AVAILABLE_BOLT_GRADES: BoltGrade[] = ['4.6', '5.6', '8.8', '10.9'];

export function getBoltStrengths(grade: BoltGrade) {
  return BOLT_GRADE_STRENGTHS[grade];
}

export function getBoltAreas(diam: BoltDiam) {
  return BOLT_AREAS[diam];
}

/** Head bearing area Ah [mm²] for a standard hex-head bolt.
 *  Approximation per EN 1992-4 guidance: Ah ≈ 2.4·φ² (hex head projection). */
export function boltHeadArea(diam: number): number {
  return 2.4 * diam * diam;
}
