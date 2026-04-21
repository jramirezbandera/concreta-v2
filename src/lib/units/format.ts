import type { Quantity, UnitSystem } from "./types";
import { CATALOG } from "./catalog";
import { toDisplay, fromDisplay } from "./convert";

export function getUnitLabel(quantity: Quantity, system: UnitSystem): string {
  const spec = CATALOG[quantity];
  return system === "si" ? spec.siUnit : spec.tecnicoUnit;
}

export function getPrecision(quantity: Quantity, system: UnitSystem): number {
  const spec = CATALOG[quantity];
  return system === "si" ? spec.precisionSi : spec.precisionTecnico;
}

export function formatQuantity(
  valueSi: number,
  quantity: Quantity,
  system: UnitSystem,
  options?: { precision?: number; withUnit?: boolean }
): string {
  if (!Number.isFinite(valueSi)) {
    if (Number.isNaN(valueSi)) return "—";
    return valueSi > 0 ? "∞" : "-∞";
  }
  const display = toDisplay(valueSi, quantity, system);
  const precision = options?.precision ?? getPrecision(quantity, system);
  const withUnit = options?.withUnit ?? true;
  const num = display.toFixed(precision);
  if (!withUnit) return num;
  return `${num} ${getUnitLabel(quantity, system)}`;
}

export function formatNumber(
  valueSi: number,
  quantity: Quantity,
  system: UnitSystem,
  precision?: number
): string {
  return formatQuantity(valueSi, quantity, system, {
    precision,
    withUnit: false,
  });
}

const PARSE_REJECT = /[eE]|[a-zA-Z]/;

export function parseQuantity(
  input: string,
  quantity: Quantity,
  system: UnitSystem
): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (PARSE_REJECT.test(trimmed)) return null;
  const normalized = trimmed.replace(",", ".");
  const display = Number(normalized);
  if (!Number.isFinite(display)) return null;
  if (display < 0) return null;
  return fromDisplay(display, quantity, system);
}
