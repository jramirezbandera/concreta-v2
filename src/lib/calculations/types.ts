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
