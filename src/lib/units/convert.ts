import type { Quantity, UnitSystem } from "./types";
import { CATALOG } from "./catalog";

export function toDisplay(
  valueSi: number,
  quantity: Quantity,
  system: UnitSystem
): number {
  if (system === "si") return valueSi;
  return valueSi * CATALOG[quantity].toTecnico;
}

export function fromDisplay(
  displayValue: number,
  quantity: Quantity,
  system: UnitSystem
): number {
  if (system === "si") return displayValue;
  return displayValue / CATALOG[quantity].toTecnico;
}
