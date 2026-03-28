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

export interface SteelBeamInputs {
  profile: string; // e.g. 'IPE270'
  span: number;    // mm
  fyk: number;     // MPa
  MEd: number;     // kNm
  VEd: number;     // kN
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
  profile: 'IPE270',
  span: 5000,
  fyk: 275,
  MEd: 45,
  VEd: 35,
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
