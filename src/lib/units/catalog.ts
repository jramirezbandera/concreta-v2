import type { Quantity, QuantitySpec } from "./types";

export const CATALOG: Record<Quantity, QuantitySpec> = {
  force: {
    siUnit: "kN",
    tecnicoUnit: "Tn",
    toTecnico: 0.101971621,
    precisionSi: 2,
    precisionTecnico: 2,
  },
  moment: {
    siUnit: "kNm",
    tecnicoUnit: "mt",
    toTecnico: 0.101971621,
    precisionSi: 2,
    precisionTecnico: 2,
  },
  linearLoad: {
    siUnit: "kN/m",
    tecnicoUnit: "kg/m",
    toTecnico: 101.971621,
    precisionSi: 2,
    precisionTecnico: 0,
  },
  areaLoad: {
    siUnit: "kN/m²",
    tecnicoUnit: "kg/m²",
    toTecnico: 101.971621,
    precisionSi: 2,
    precisionTecnico: 0,
  },
  stress: {
    siUnit: "N/mm²",
    tecnicoUnit: "kg/cm²",
    toTecnico: 10.1971621,
    precisionSi: 1,
    precisionTecnico: 1,
  },
  // Soil bearing pressure — kPa, not MPa. 1 kg/cm² = 98.0665 kPa.
  soilPressure: {
    siUnit: "kPa",
    tecnicoUnit: "kg/cm²",
    toTecnico: 1 / 98.0665,
    precisionSi: 1,
    precisionTecnico: 2,
  },
  youngModulus: {
    siUnit: "N/mm²",
    tecnicoUnit: "kg/cm²",
    toTecnico: 10.1971621,
    precisionSi: 0,
    precisionTecnico: 0,
  },
};
