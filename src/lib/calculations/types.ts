// Shared check types for RC calculation modules (rcBeams, rcColumns).
// Steel modules use SteelCheckStatus / SteelCheckRow (different — has 'neutral' status).

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface CheckRow {
  id: string;
  description: string;
  value: string;       // computed value with units
  limit: string;       // limit value with units
  utilization: number; // 0-1+ (>=1 = fail)
  status: CheckStatus;
  article: string;
}

export function toStatus(util: number): CheckStatus {
  if (util < 0.8) return 'ok';
  if (util < 1.0) return 'warn';
  return 'fail';
}

// Inverse RC bending solver — shared by retainingWall.ts and other modules.
// Returns As_req (mm²) to resist MEd_kNm in a rectangular section (b × d).
// Returns Infinity if the section is over-reinforced (m ≥ 0.5).
export function solveRCBending(
  MEd_kNm: number,
  b: number,    // mm
  d: number,    // mm
  fcd: number,  // MPa
  fyd: number,  // MPa
): number {
  if (MEd_kNm <= 0) return 0;
  const m = (MEd_kNm * 1e6) / (b * d * d * fcd);
  if (m >= 0.5) return Infinity;
  return (1 - Math.sqrt(1 - 2 * m)) * b * d * fcd / fyd;
}

export function makeCheck(
  id: string,
  description: string,
  demand: number,
  capacity: number,
  demandStr: string,
  capacityStr: string,
  article: string,
): CheckRow {
  const util = capacity > 0 ? demand / capacity : Infinity;
  return { id, description, value: demandStr, limit: capacityStr, utilization: util, status: toStatus(util), article };
}
