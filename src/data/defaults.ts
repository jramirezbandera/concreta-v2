// FTUX defaults — all produce CUMPLE at ~65-80% utilization on first open.
// Override order: URL query params > localStorage > these defaults.

export interface RCBeamInputs {
  [key: string]: string | number | boolean;
  // Shared geometry + materials
  b: number;              // width (mm)
  h: number;              // total depth (mm)
  cover: number;          // mechanical cover (mm)
  stirrupDiam: number;    // stirrup diameter (mm) — shared across sections
  stirrupLegs: number;    // number of stirrup legs — shared
  fck: number;            // characteristic concrete strength (MPa)
  fyk: number;            // characteristic steel strength (MPa)
  exposureClass: string;  // XC1–XC4
  loadType: string;       // 'residential'|'office'|'parking'|'roof'|'custom'
  psi2Custom: number;     // psi2 value when loadType='custom'
  // Midspan (Vano) — bottom bars, positive bending
  midspan_Md: number;             // design moment (kNm)
  midspan_VEd: number;            // design shear (kN)
  midspan_M_G: number;            // SLS moment from permanent loads (kNm)
  midspan_M_Q: number;            // SLS moment from variable loads (kNm)
  midspan_nBars: number;          // number of bottom bars
  midspan_barDiam: number;        // bottom bar diameter (mm)
  midspan_stirrupSpacing: number; // stirrup spacing at midspan (mm)
  // Support (Apoyo) — top bars, negative bending
  support_Md: number;
  support_VEd: number;
  support_M_G: number;
  support_M_Q: number;
  support_nBars: number;
  support_barDiam: number;
  support_stirrupSpacing: number;
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
  gk: number;           // additional permanent surface load (kN/m2)
  qk: number;           // variable surface load (kN/m2) — prefilled from category
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
  stirrupDiam: 8,
  stirrupLegs: 2,
  fck: 25,
  fyk: 500,
  exposureClass: 'XC1',
  loadType: 'residential',
  psi2Custom: 0.3,
  // Midspan — d = 500 - 30 - 8 - 8 = 454 mm
  midspan_Md: 85,
  midspan_VEd: 65,
  midspan_M_G: 45,
  midspan_M_Q: 20,
  midspan_nBars: 4,
  midspan_barDiam: 16,
  midspan_stirrupSpacing: 150,
  // Support
  support_Md: 65,
  support_VEd: 65,
  support_M_G: 35,
  support_M_Q: 15,
  support_nBars: 3,
  support_barDiam: 16,
  support_stirrupSpacing: 100,
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
  Lcr: 6000,   // autoLcr = 1.0 x L = 6000mm for ss default
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
