export type UnitSystem = "si" | "tecnico";

export type Quantity =
  | "force"
  | "moment"
  | "linearLoad"
  | "areaLoad"
  | "stress"
  | "youngModulus";

export type QuantitySpec = {
  siUnit: string;
  tecnicoUnit: string;
  toTecnico: number;
  precisionSi: number;
  precisionTecnico: number;
};
