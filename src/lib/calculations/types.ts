// Shared check types for every calculation module (RC, steel, timber, geo).
//
// Status taxonomy
// ───────────────
//   ok / warn / fail  → utilization-driven verdicts.
//   neutral           → informational rows (e.g. "CLASE 1") with no bar.
//
// Display path
// ────────────
// A check row carries the value/limit twice when possible:
//   • valueNum + valueQty (and limitNum + limitQty) — SI numeric, converted
//     and formatted at render time via lib/units/format.formatQuantity().
//   • valueStr + limitStr — pre-formatted string fallback for cases that do
//     not fit a single Quantity (e.g. "∞", "3 barras", boolean flags,
//     dimensionless ratios). Renderers prefer the numeric path when both
//     fields are present.
//
// Both paths are optional so legacy rows that still carry the old
// `value`/`limit` strings keep working until the per-module sweep upgrades
// them. The renderer falls back to those string fields when nothing else
// is set.

import type { Quantity } from "../units/types";

export type CheckStatus = "ok" | "warn" | "fail" | "neutral";

export interface CheckRow {
  id: string;
  description: string;

  /** SI numeric value (preferred — converts and formats at render time). */
  valueNum?: number;
  /** Quantity for `valueNum`; required when `valueNum` is set. */
  valueQty?: Quantity;
  /** Pre-formatted fallback when the value is not a single Quantity. */
  valueStr?: string;

  /** SI numeric limit (preferred). */
  limitNum?: number;
  /** Quantity for `limitNum`; required when `limitNum` is set. */
  limitQty?: Quantity;
  /** Pre-formatted limit fallback. */
  limitStr?: string;

  /** Legacy pre-formatted value (kept until the sweep migrates each module). */
  value?: string;
  /** Legacy pre-formatted limit. */
  limit?: string;

  utilization: number;
  status: CheckStatus;
  article: string;

  /** Classification row — render with no utilization bar. */
  neutral?: boolean;
  /** Short tag rendered next to the description (e.g. 'CLASE 1'). */
  tag?: string;
}

export function toStatus(util: number): Exclude<CheckStatus, "neutral"> {
  if (util < 0.8) return "ok";
  if (util < 1.0) return "warn";
  return "fail";
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
  return {
    id,
    description,
    value: demandStr,
    limit: capacityStr,
    utilization: util,
    status: toStatus(util),
    article,
  };
}

/**
 * Build a check row from SI numeric demand and capacity, pinned to a Quantity
 * so the renderer can format both values in the active unit system.
 */
export function makeCheckQty(
  id: string,
  description: string,
  demandSi: number,
  capacitySi: number,
  quantity: Quantity,
  article: string,
): CheckRow {
  const util = capacitySi > 0 ? demandSi / capacitySi : Infinity;
  return {
    id,
    description,
    valueNum: demandSi,
    valueQty: quantity,
    limitNum: capacitySi,
    limitQty: quantity,
    utilization: util,
    status: toStatus(util),
    article,
  };
}

/** Informational check with no utilization bar (e.g. section classification). */
export function makeCheckNeutral(
  id: string,
  description: string,
  tag: string,
  article: string,
): CheckRow {
  return {
    id,
    description,
    value: "",
    limit: "",
    utilization: 0,
    status: "neutral",
    article,
    neutral: true,
    tag,
  };
}
