// FTUX defaults — all produce CUMPLE at ~65-80% utilization on first open.
// Override order: URL query params > localStorage > these defaults.

export interface RCBeamInputs {
  [key: string]: string | number | boolean;
  b: number;           // width (mm)
  h: number;           // total depth (mm)
  cover: number;       // mechanical cover (mm)
  nBars: number;       // number of tension bars
  barDiam: number;     // bar diameter (mm)
  stirrupDiam: number; // stirrup diameter (mm)
  stirrupSpacing: number; // stirrup spacing (mm)
  stirrupLegs: number; // number of stirrup legs
  fck: number;         // characteristic concrete strength (MPa)
  fyk: number;         // characteristic steel strength (MPa)
  exposureClass: string; // XC1–XC4
  Md: number;          // design bending moment (kNm)
  VEd: number;         // design shear force (kN)
  Ms: number;          // quasi-permanent SLS moment (kNm)
  psi2: number;        // ψ2·Qk/(Gk+Qk) ratio (dimensionless, 0–1)
}

export interface RCColumnInputs {
  b: number;
  h: number;
  cover: number;
  nBars: number;
  barDiam: number;
  fck: number;
  fyk: number;
  Nd: number;   // design axial force (kN)
  Md: number;   // design bending moment (kNm)
  Lk: number;   // buckling length (m)
}

export type BeamType = 'ss' | 'cantilever' | 'fp' | 'ff';

/** ELS serviceability combination for deflection check (CTE DB-SE Tabla 4.2). */
export type ElsCombo = 'characteristic' | 'frequent' | 'quasi-permanent';

export interface SteelBeamInputs {
  [key: string]: string | number | boolean;
  tipo: 'IPE' | 'HEA' | 'HEB';
  size: number;
  steel: 'S275' | 'S355';
  beamType: BeamType;
  MEd: number;
  VEd: number;
  /**
   * @internal — always overridden by effectiveInputs in index.tsx.
   * Do not read from raw state. Set by deriveFromLoads() per beam type.
   */
  VEd_interaction: number;
  Lcr: number;
  Mser: number;
  L: number;
  deflLimit: number;   // denominator of L/n admissible deflection limit (e.g. 300)
  elsCombo: ElsCombo;  // ELS combination type for deflection
  // Load generator
  useCategory: string;  // 'A1'|'A2'|'B'|'C1'|'C2'|'C3'|'D1'|'E1'|'G1'|'custom'
  gk: number;           // additional permanent surface load (kN/m²)
  qk: number;           // variable surface load (kN/m²) — prefilled from category
  bTrib: number;        // tributary width (m)
}

export interface FootingInputs {
  bc: number;   // column width (mm)
  hc: number;   // column depth (mm)
  a: number;    // footing length (mm)
  b: number;    // footing width (mm)
  h: number;    // footing depth (mm)
  cover: number;
  nBars: number;
  barDiam: number;
  fck: number;
  fyk: number;
  Nd: number;   // column axial load (kN)
  qadm: number; // admissible soil pressure (kPa)
}

export const rcBeamDefaults: RCBeamInputs = {
  b: 300,
  h: 500,
  cover: 30,
  nBars: 4,
  barDiam: 16,
  stirrupDiam: 8,
  stirrupSpacing: 200,
  stirrupLegs: 2,
  fck: 25,
  fyk: 500,
  exposureClass: 'XC1',
  Md: 85,
  VEd: 65,
  Ms: 55,
  psi2: 0.3,
};

export const rcColumnDefaults: RCColumnInputs = {
  b: 300,
  h: 300,
  cover: 30,
  nBars: 4,
  barDiam: 16,
  fck: 25,
  fyk: 500,
  Nd: 500,
  Md: 30,
  Lk: 3.5,
};

export const steelBeamDefaults: SteelBeamInputs = {
  tipo: 'IPE',
  size: 300,
  steel: 'S275',
  beamType: 'ss',
  MEd: 80,
  VEd: 60,
  VEd_interaction: 0,
  Lcr: 6000,   // autoLcr = 1.0 × L = 6000mm for ss default
  Mser: 50,
  L: 6000,
  deflLimit: 300,
  elsCombo: 'characteristic',
  useCategory: 'A1',
  gk: 1.0,
  qk: 2.0,
  bTrib: 3.0,
};

export const footingDefaults: FootingInputs = {
  bc: 300,
  hc: 300,
  a: 1200,
  b: 1200,
  h: 500,
  cover: 50,
  nBars: 5,
  barDiam: 12,
  fck: 25,
  fyk: 500,
  Nd: 450,
  qadm: 200,
};
