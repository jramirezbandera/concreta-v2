// FTUX defaults — all produce CUMPLE at ~65-80% utilization on first open.
// Override order: URL query params > localStorage > these defaults.

export interface RCBeamInputs {
  [key: string]: string | number | boolean;
  // Shared geometry + materials
  b: number;              // width (mm)
  h: number;              // total depth (mm)
  cover: number;          // mechanical cover (mm)
  fck: number;            // characteristic concrete strength (MPa)
  fyk: number;            // characteristic steel strength (MPa)
  exposureClass: string;  // XC1–XC4
  loadType: string;       // 'residential'|'office'|'parking'|'roof'|'custom'
  psi2Custom: number;     // psi2 value when loadType='custom'
  // Vano (midspan) — positive bending M+
  vano_Md: number;               // design moment (kNm)
  vano_VEd: number;              // design shear (kN)
  vano_M_G: number;              // SLS moment from permanent loads (kNm)
  vano_M_Q: number;              // SLS moment from variable loads (kNm)
  vano_bot_nBars: number;        // tension bars (bottom, M+)
  vano_bot_barDiam: number;
  vano_top_nBars: number;        // compression bars (top, M+)
  vano_top_barDiam: number;
  vano_stirrupDiam: number;
  vano_stirrupSpacing: number;
  vano_stirrupLegs: number;
  // Apoyo (support) — negative bending M-
  apoyo_Md: number;
  apoyo_VEd: number;
  apoyo_M_G: number;
  apoyo_M_Q: number;
  apoyo_top_nBars: number;       // tension bars (top, M-)
  apoyo_top_barDiam: number;
  apoyo_bot_nBars: number;       // compression bars (bottom, M-)
  apoyo_bot_barDiam: number;
  apoyo_stirrupDiam: number;
  apoyo_stirrupSpacing: number;
  apoyo_stirrupLegs: number;
}

export interface RCColumnInputs {
  [key: string]: string | number | boolean;
  b: number;
  h: number;
  cover: number;
  cornerBarDiam: number;   // mm — 4 corner bars (always present)
  nBarsX: number;          // intermediate bars per face on top/bottom faces (≥ 0)
  barDiamX: number;        // mm — diameter of top/bottom intermediate bars
  nBarsY: number;          // intermediate bars per face on left/right faces (≥ 0)
  barDiamY: number;        // mm — diameter of left/right intermediate bars
  stirrupDiam: number;
  stirrupSpacing: number;
  fck: number;
  fyk: number;
  Nd: number;    // design axial force (kN), compression positive
  MEdy: number;  // design moment about y-axis (kNm), uses h dimension
  MEdz: number;  // design moment about z-axis (kNm), uses b dimension
  L: number;     // real column length (m)
  beta: number;  // effective length factor β — Lk = L × β
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
  fck: 25,
  fyk: 500,
  exposureClass: 'XC1',
  loadType: 'residential',
  psi2Custom: 0.3,
  // Vano — tension bottom d=500-30-8-8=454mm, compression top 2Ø12
  vano_Md: 85,
  vano_VEd: 65,
  vano_M_G: 45,
  vano_M_Q: 20,
  vano_bot_nBars: 4,
  vano_bot_barDiam: 16,
  vano_top_nBars: 2,
  vano_top_barDiam: 12,
  vano_stirrupDiam: 8,
  vano_stirrupSpacing: 150,
  vano_stirrupLegs: 2,
  // Apoyo — tension top 3Ø16, compression bottom 2Ø12
  apoyo_Md: 65,
  apoyo_VEd: 65,
  apoyo_M_G: 35,
  apoyo_M_Q: 15,
  apoyo_top_nBars: 3,
  apoyo_top_barDiam: 16,
  apoyo_bot_nBars: 2,
  apoyo_bot_barDiam: 12,
  apoyo_stirrupDiam: 8,
  apoyo_stirrupSpacing: 100,
  apoyo_stirrupLegs: 2,
};

export const rcColumnDefaults: RCColumnInputs = {
  b: 300,
  h: 300,
  cover: 30,
  cornerBarDiam: 16,
  nBarsX: 0,
  barDiamX: 12,
  nBarsY: 0,
  barDiamY: 12,
  stirrupDiam: 6,
  stirrupSpacing: 150,
  fck: 25,
  fyk: 500,
  Nd: 500,
  MEdy: 30,
  MEdz: 10,
  L: 3.5,
  beta: 1,
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

export type ColumnBCType = 'ff' | 'pp' | 'pf' | 'fc' | 'custom';
export type SteelColumnSectionType = 'HEA' | 'HEB' | 'IPE' | '2UPN';

export interface SteelColumnInputs {
  [key: string]: string | number | boolean;
  sectionType: SteelColumnSectionType;
  size: number;
  steel: 'S275' | 'S355';
  // Geometry — independent unbraced lengths per axis
  Ly: number;      // unbraced length y-y (strong axis) in mm
  Lz: number;      // unbraced length z-z (weak axis) in mm
  bcType: ColumnBCType;
  /** β about y-y — only editable when bcType='custom' */
  beta_y: number;
  /** β about z-z — only editable when bcType='custom' */
  beta_z: number;
  // Loads (ULS)
  Ned: number;    // axial force (kN), positive = compression
  My_Ed: number;  // major-axis moment (kNm)
  Mz_Ed: number;  // minor-axis moment (kNm)
}

export const steelColumnDefaults: SteelColumnInputs = {
  sectionType: 'HEB',
  size: 200,
  steel: 'S275',
  Ly: 3500,
  Lz: 3500,
  bcType: 'pp',
  beta_y: 1.0,
  beta_z: 1.0,
  Ned: 400,
  My_Ed: 50,
  Mz_Ed: 8,
};

export interface RetainingWallInputs {
  [key: string]: string | number | boolean;
  // Geometry (m)
  H: number;        // clear stem height above footing top
  hf: number;       // footing thickness
  tFuste: number;   // stem thickness (uniform)
  bPunta: number;   // toe projection
  bTalon: number;   // heel projection
  // Materials
  fck: number;      // N/mm²
  fyk: number;      // N/mm²
  cover: number;    // m
  // Backfill
  gammaSuelo: number;   // dry/bulk unit weight (kN/m³)
  gammaSat: number;     // saturated unit weight (kN/m³)
  phi: number;          // internal friction angle (°)
  delta: number;        // wall friction angle (°)
  q: number;            // uniform surcharge on backfill (kN/m²)
  sigmaAdm: number;     // admissible bearing capacity (kPa)
  mu: number;           // base friction coefficient
  // Water table
  hasWater: boolean; // toggle: true = water table active
  hw: number;        // depth to water table from top of wall (m), used when hasWater=true
  // Seismic (NCSP-07 / NCSE-02) — kh and kv are derived internally
  Ab: number;       // aceleración sísmica básica (fraction of g, from hazard map)
  S: number;        // coeficiente de amplificación del terreno (NCSE-02 §2.2)
  // Rebar — ø (mm) + spacing (mm) per zone; 0 = zone not specified (sizing mode)
  diam_fv_int: number;  sep_fv_int: number;  // fuste vertical, cara trasdós (main bending)
  diam_fv_ext: number;  sep_fv_ext: number;  // fuste vertical, cara intradós (compression face)
  diam_fh:     number;  sep_fh:     number;  // fuste horizontal, per face (shrinkage)
  diam_zs:     number;  sep_zs:     number;  // zapata superior — talón (tension on top)
  diam_zi:     number;  sep_zi:     number;  // zapata inferior — punta (tension on bottom)
  diam_zt_inf: number;  sep_zt_inf: number;  // zapata transversal — cara inferior
  diam_zt_sup: number;  sep_zt_sup: number;  // zapata transversal — cara superior (opcional)
}

export const retainingWallDefaults: RetainingWallInputs = {
  H: 3.0,
  hf: 0.5,
  tFuste: 0.3,
  bPunta: 0.6,
  bTalon: 1.5,
  fck: 25,
  fyk: 500,
  cover: 0.04,
  gammaSuelo: 18,
  gammaSat: 20,
  phi: 30,
  delta: 10,
  q: 0,
  sigmaAdm: 200,
  mu: 0.40,
  hasWater: false,
  hw: 2.0,
  Ab: 0,
  S: 1.0,
  // Rebar — all default 0 (sizing mode)
  diam_fv_int: 0, sep_fv_int: 200,
  diam_fv_ext: 0, sep_fv_ext: 200,
  diam_fh:     0, sep_fh:     200,
  diam_zs:     0, sep_zs:     200,
  diam_zi:     0, sep_zi:     200,
  diam_zt_inf: 0, sep_zt_inf: 200,
  diam_zt_sup: 0, sep_zt_sup: 200,
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
