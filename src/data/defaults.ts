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
  tipo: 'IPE' | 'HEA' | 'HEB' | 'IPN';
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

// ── Punching shear (CE art. 6.4) ─────────────────────────────────────────────

export type PunchingMode = 'pilar' | 'carga-puntual';
export type PunchingPosition = 'interior' | 'borde' | 'esquina';

export interface PunchingInputs {
  [key: string]: string | number | boolean;
  mode:          PunchingMode;      // 'pilar' | 'carga-puntual'
  cx:            number;            // mm — column/area dim x (or Ø if circular)
  cy:            number;            // mm — column/area dim y (= cx if circular)
  isCircular:    boolean;           // only active when position='interior'
  d:             number;            // mm — effective depth of slab
  fck:           number;            // MPa
  fyk:           number;            // MPa — flexural reinforcement steel
  barDiamSup:    number;            // mm — top face rebar diameter
  sSup:          number;            // mm — top face bar spacing
  barDiamInf:    number;            // mm — bottom face rebar diameter
  sInf:          number;            // mm — bottom face bar spacing
  VEd:           number;            // kN — design force ELU
  position:      PunchingPosition;  // 'interior' | 'borde' | 'esquina'
  hasShearReinf: boolean;
  swDiam:        number;            // mm — stirrup bar diameter
  swLegs:        number;            // number of stirrup legs per stirrup group
  sr:            number;            // mm — radial spacing between stirrup rows
  fywk:          number;            // MPa — stirrup characteristic strength
}

export const punchingDefaults: PunchingInputs = {
  mode:          'pilar',
  cx:            300,
  cy:            300,
  isCircular:    false,
  d:             200,     // mm — solid slab h≈250, cover≈40, rebar≈10
  fck:           25,
  fyk:           500,
  barDiamSup:    12,     // Ø12@150 → As=0.754mm²/mm → ρl≈0.377% → vRdc≈0.507MPa
  sSup:          150,
  barDiamInf:    12,
  sInf:          150,
  VEd:           300,    // kN — produces ~80% util on vRd,c at FTUX
  position:      'interior',
  hasShearReinf: false,
  swDiam:        8,      // mm — typical stirrup diameter
  swLegs:        2,
  sr:            100,    // mm — radial spacing between stirrup rows
  fywk:          500,
};

// ── Composite steel section (Steiner + EC3 classification) ───────────────────

export type CompositeSectionMode = 'custom' | 'reinforced';
export type CompositePlatePos = 'top' | 'bottom' | 'left' | 'right' | 'custom';
export type SteelGrade = 'S235' | 'S275' | 'S355' | 'S450';

export interface PlateEntry {
  id: string;
  b: number;             // mm — horizontal width in cross-section
  t: number;             // mm — vertical thickness (ignored for left/right)
  posType: CompositePlatePos;
  customYBottom: number; // mm — only used when posType='custom'
}

export interface CompositeSectionInputs {
  mode: CompositeSectionMode;
  profileType: 'IPE' | 'HEA' | 'HEB';
  profileSize: number;
  grade: SteelGrade;
  plates: PlateEntry[];
}

export const compositeSectionDefaults: CompositeSectionInputs = {
  mode: 'reinforced',
  profileType: 'IPE',
  profileSize: 300,
  grade: 'S275',
  plates: [
    { id: 'p1', b: 200, t: 15, posType: 'top', customYBottom: 0 },
  ],
};

// ── Pile caps — Encepados de micropilotes (CE art. 48 / CTE DB-SE-C §5.1.4) ──

export interface PileCapInputs {
  [key: string]: string | number | boolean;
  n:        number;  // 2 | 3 | 4 — number of micropiles
  d_p:      number;  // mm — pile diameter
  s:        number;  // mm — pile spacing c/c
  h_enc:    number;  // mm — cap depth
  b_col:    number;  // mm — column width (x)
  h_col:    number;  // mm — column depth (y)
  fck:      number;  // MPa
  fyk:      number;  // MPa
  cover:    number;  // mm — bottom cover to tie bar centroid
  phi_tie:  number;  // mm — tie bar diameter
  N_Ed:     number;  // kN — design axial (compression > 0)
  Mx_Ed:    number;  // kNm — moment about x-axis (Navier)
  My_Ed:    number;  // kNm — moment about y-axis
  R_adm:    number;  // kN — admissible pile capacity
}

// FTUX defaults: all checks CUMPLE at ~60-75% utilization on first open.
// Verified hand-calc: σ_strut=6.2MPa vs σ_Rd=9.0MPa → 69%; lb_net≈108mm vs lb_avail≈720mm → 15%.
export const pileCapDefaults: PileCapInputs = {
  n:       2,
  d_p:     200,
  s:       1200,
  h_enc:   800,
  b_col:   400,
  h_col:   400,
  fck:     25,
  fyk:     500,
  cover:   60,
  phi_tie: 12,
  N_Ed:    300,
  Mx_Ed:   0,
  My_Ed:   0,
  R_adm:   250,
};

// ── Empresillado — RC column jacketed with 4 equal-leg L-angles (EC3 §6.4) ──

export interface EmpresalladoInputs {
  [key: string]: string | number | boolean;
  // Existing column geometry
  bc: number;       // column width parallel to x-axis (cm)
  hc: number;       // column depth parallel to y-axis (cm)
  L: number;        // free height / inter-storey height (m)
  // Design loads (ULS)
  N_Ed: number;     // axial compression (kN)
  Mx_Ed: number;    // bending about x-axis (kNm)
  My_Ed: number;    // bending about y-axis (kNm)
  Vd: number;       // design shear in column section (kN); VEd = max(Vd, NEd/500) per EC3 §6.4.3.1
  // L-angle profile
  perfil: string;   // AngleProfile key, e.g. 'L100x10'
  fy: number;       // steel yield strength (MPa), typically 275 or 355
  // Global buckling length factors (frame boundary conditions, independent of batten fixity)
  // Batten plates use fixed lk_local = 0.5×s (welded = fixed-fixed, per EC3 §6.4.2.1 Table 6.8)
  beta_x: number;   // global buckling factor x-axis (0.5=fixed-fixed, 0.7=pin-fixed, 1.0=pin-pin)
  beta_y: number;   // global buckling factor y-axis
  // Batten plates (pletinas)
  s: number;        // batten spacing c/c (cm)
  lp: number;       // batten length (cm) — must be < s
  bp: number;       // batten width (cm)
  tp: number;       // batten thickness (mm)
}

export const empresalladoDefaults: EmpresalladoInputs = {
  bc: 30,    // cm
  hc: 30,    // cm
  L: 3.0,   // m
  N_Ed: 500,
  Mx_Ed: 20,
  My_Ed: 10,
  Vd: 0,
  perfil: 'L100x10',
  fy: 275,
  beta_x: 0.5,
  beta_y: 0.5,
  s: 40,    // cm
  lp: 12,   // cm
  bp: 10,   // cm
  tp: 10,   // mm
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

// ── Isolated footing (CTE DB-SE-C art. 4.3.2/4.3.3 + CE armado) ──────────────

export type FootingSoilType = 'cohesive' | 'granular';

export interface IsolatedFootingInputs {
  [key: string]: string | number | boolean;
  // Geometry (m)
  B:          number;  // footing width — x direction
  L:          number;  // footing length — y direction
  h:          number;  // footing height
  bc:         number;  // column width x
  hc:         number;  // column depth y
  Df:         number;  // foundation depth from ground surface
  cover:      number;  // mm — cover to bar centroid (bottom)
  // SLS loads (soil checks)
  N_k:        number;  // kN — vertical (compression +)
  Mx_k:       number;  // kNm — moment about x axis (→ eccentricity in y)
  My_k:       number;  // kNm — moment about y axis (→ eccentricity in x)
  H_k:        number;  // kN — horizontal (for sliding check)
  // ELU loads (structural checks)
  N_Ed:       number;  // kN
  Mx_Ed:      number;  // kNm
  My_Ed:      number;  // kNm
  // Materials
  fck:        number;  // MPa
  fyk:        number;  // MPa
  // Reinforcement (user-defined)
  phi_x:      number;  // mm — bar diameter, x-direction (parallel to B)
  s_x:        number;  // mm — spacing x bars
  phi_y:      number;  // mm — bar diameter, y-direction (parallel to L)
  s_y:        number;  // mm — spacing y bars
  // Soil model
  soilType:   FootingSoilType;
  // Cohesive (art. 4.3.2 — Hansen formula)
  c_soil:     number;  // kPa — cohesion
  phi_soil:   number;  // ° — friction angle
  gamma_soil: number;  // kN/m³ — unit weight of soil
  gamma_R:    number;  // — bearing capacity resistance factor (safety factor)
  // Granular (art. 4.3.3 — NSPT method)
  N_spt:      number;  // — representative NSPT in influence zone
  // Sliding
  mu:         number;  // — friction coefficient tanδ at footing base
  c_base:     number;  // kPa — base adhesion (= c_soil cohesive, 0 granular)
}

// FTUX defaults — all checks CUMPLE at ~60-75% on first open.
// Verified hand-calc:
//   σmax_SLS = 300/(1.8·1.8) = 92.6 kPa
//   qadm (c=20kPa, φ=15°, Df=0.8m) ≈ 153 kPa → util = 60.5% → OK
//   MEd_x = 138.9·0.7²/2 = 34 kNm/m → As_req=183mm²/m < As_min=712mm²/m
//   As_prov(Ø16@200) = 1005mm²/m → util_min=70.8% → OK
//   Punching util ≈ 28% → OK
export const isolatedFootingDefaults: IsolatedFootingInputs = {
  B: 1.8, L: 1.8, h: 0.6, bc: 0.4, hc: 0.4, Df: 0.8, cover: 60,
  N_k: 300, Mx_k: 0, My_k: 0, H_k: 0,
  N_Ed: 450, Mx_Ed: 0, My_Ed: 0,
  fck: 25, fyk: 500,
  phi_x: 16, s_x: 200, phi_y: 16, s_y: 200,
  soilType: 'cohesive',
  c_soil: 20, phi_soil: 15, gamma_soil: 18, gamma_R: 3.0,
  N_spt: 15,
  mu: 0.40, c_base: 0,
};

// ── Timber Beams (EC5 EN 1995-1-1) ───────────────────────────────────────────

export interface TimberBeamInputs {
  [key: string]: string | number | boolean;
  gradeId: string;       // 'C24', 'GL28h', etc.
  b: number;             // mm — section width
  h: number;             // mm — section height (h ≥ b)
  beamType: BeamType;
  L: number;             // m — span
  gk: number;            // kN/m — permanent UDL
  qk: number;            // kN/m — variable UDL
  serviceClass: 1 | 2 | 3;
  loadDuration: string;  // LoadDurationClass
  loadType: string;      // 'residential'|'office'|'storage'|'roof'|'custom'
  psi2Custom: number;
  fireResistance: string;  // FireResistance
  exposedFaces: number;    // 3 | 4
  isSystem: boolean;       // EC5 §6.6 — ksys=1.10 when part of load-sharing system
}

// FTUX defaults: C24 150×400, L=5m biart., g=2kN/m q=3kN/m → ~70% util
export const timberBeamDefaults: TimberBeamInputs = {
  gradeId: 'C24',
  b: 150,
  h: 400,
  beamType: 'ss',
  L: 5,
  gk: 2.0,
  qk: 3.0,
  serviceClass: 1,
  loadDuration: 'medium',
  loadType: 'residential',
  psi2Custom: 0.30,
  fireResistance: 'R0',
  exposedFaces: 3,
  isSystem: false,
};

// ── Timber Columns (EC5 EN 1995-1-1 §6.3) ────────────────────────────────────

export interface TimberColumnInputs {
  [key: string]: string | number | boolean;
  gradeId: string;          // 'C24', 'GL28h', etc.
  b: number;                // mm — section width
  h: number;                // mm — section height
  L: number;                // m — column height
  beta_y: number;           // effective length factor — strong axis (y-y, buckling in h-direction)
  beta_z: number;           // effective length factor — weak axis  (z-z, buckling in b-direction)
  Nd: number;               // kN — design axial compression (user-factored)
  Vd: number;               // kN — design shear (user-factored)
  Md: number;               // kNm — design moment (user-factored)
  momentAxis: string;       // 'strong' | 'weak' — axis moment acts on
  serviceClass: 1 | 2 | 3;
  loadDuration: string;     // LoadDurationClass
  fireResistance: string;   // 'R0'|'R30'|'R60'|'R90'|'R120'
  exposedFaces: number;     // 3 | 4
  etaFi: number;            // fire load reduction factor (0–1); used only when fireResistance !== 'R0'
}

// FTUX defaults: C24 160×160, L=3m, Nd=80kN wind moment → ~65% util
export const timberColumnDefaults: TimberColumnInputs = {
  gradeId: 'C24',
  b: 160,
  h: 160,
  L: 3.0,
  beta_y: 1.0,
  beta_z: 1.0,
  Nd: 80,
  Vd: 5,
  Md: 8,
  momentAxis: 'strong',
  serviceClass: 1,
  loadDuration: 'medium',
  fireResistance: 'R0',
  exposedFaces: 4,
  etaFi: 0.65,
};
