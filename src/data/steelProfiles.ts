// Steel profile catalogue — ArcelorMittal standard values
// Units: h, b, tf, tw, r in mm; A in cm²; Iy, Iz, It in cm⁴; Wpl_y, Wel_y in cm³; Iw in cm⁶

export interface SteelProfile {
  key: string;
  tipo: 'IPE' | 'HEA' | 'HEB' | 'IPN';
  size: number;
  label: string;
  h: number;      // total height (mm)
  b: number;      // flange width (mm)
  tf: number;     // flange thickness (mm)
  tw: number;     // web thickness (mm)
  r: number;      // fillet radius (mm)
  A: number;      // cross-sectional area (cm²)
  Iy: number;     // second moment of area about y-y (cm⁴)
  Iz: number;     // second moment of area about z-z (cm⁴)
  Wpl_y: number;  // plastic section modulus (cm³)
  Wel_y: number;  // elastic section modulus (cm³)
  It: number;     // St. Venant torsional constant (cm⁴)
  Iw: number;     // warping constant (cm⁶)
}

// IPE sections
const IPE_DATA: Array<[number, number, number, number, number, number, number, number, number, number, number, number, number]> = [
  // size,  h,   b,   tf,  tw,  r,   A,    Iy,    Iz,   Wpl_y, Wel_y, It,   Iw
  [160,  160,  82,  7.4, 5.0,  9, 20.1,   869,  68.3,   123,   109,  3.60,    3990],
  [200,  200, 100,  8.5, 5.6, 12, 28.5,  1943,   142,   220,   194,  6.98,   12990],
  [240,  240, 120,  9.8, 6.2, 15, 39.1,  3892,   284,   367,   324, 12.9,    36920],
  [270,  270, 135, 10.2, 6.6, 15, 45.9,  5790,   420,   484,   429, 15.9,    70580],
  [300,  300, 150, 10.7, 7.1, 15, 53.8,  8356,   604,   628,   557, 20.1,   125900],
  [330,  330, 160, 11.5, 7.5, 18, 62.6, 11770,   788,   804,   713, 28.2,   198100],
  [360,  360, 170, 12.7, 8.0, 18, 72.7, 16270,  1043,  1019,   904, 37.3,   313600],
  [400,  400, 180, 13.5, 8.6, 21, 84.5, 23130,  1318,  1307,  1156, 51.1,   490000],
  [450,  450, 190, 14.6, 9.4, 21, 98.8, 33740,  1676,  1702,  1500, 66.9,   791000],
  [500,  500, 200, 16.0,10.2, 21,  116, 48200,  2142,  2194,  1928, 89.3,  1249000],
  [550,  550, 210, 17.2,11.1, 24,  134, 67120,  2668,  2787,  2441,  123,  1869000],
  [600,  600, 220, 19.0,12.0, 24,  156, 92080,  3387,  3512,  3069,  165,  2846000],
];

// IPN sections — DIN 1025-1 / ArcelorMittal standard catalogue
const IPN_DATA: Array<[number, number, number, number, number, number, number, number, number, number, number, number, number]> = [
  // size,  h,   b,   tf,   tw,    r,    A,     Iy,    Iz,  Wpl_y,  Wel_y,   It,       Iw
  [ 80,   80,  42,  5.9,  3.9,  3.9,  7.58,   77.8,   6.29,   20.0,   19.5, 0.700,      338],
  [100,  100,  50,  6.8,  4.5,  4.5, 10.6,   171,    12.2,   36.6,   34.2, 1.20,      1050],
  [120,  120,  58,  7.7,  5.1,  5.1, 14.2,   328,    21.5,   60.0,   54.7, 2.01,      2750],
  [140,  140,  66,  8.6,  5.7,  5.7, 18.3,   573,    35.2,   91.8,   81.9, 3.16,      6290],
  [160,  160,  74,  9.5,  6.3,  6.3, 22.8,   935,    54.7,  134,    117,   4.79,     13200],
  [180,  180,  82, 10.4,  6.9,  6.9, 27.9,  1450,    81.3,  193,    161,   7.01,     26100],
  [200,  200,  90, 11.3,  7.5,  7.5, 33.4,  2140,   117,    272,    214,   9.98,     47800],
  [220,  220,  98, 12.2,  8.1,  8.1, 39.5,  3060,   162,    370,    278,  13.9,      83200],
  [240,  240, 106, 13.1,  8.7,  8.7, 46.1,  4250,   221,    489,    354,  18.9,     138000],
  [260,  260, 113, 14.1,  9.4,  9.4, 53.3,  5740,   288,    636,    442,  25.7,     214000],
  [280,  280, 119, 15.2, 10.1, 10.1, 61.0,  7590,   364,    806,    542,  34.2,     316000],
  [300,  300, 125, 16.2, 10.8, 10.8, 69.0,  9800,   451,   1010,    653,  45.0,     451000],
  [320,  320, 131, 17.3, 11.5, 11.5, 77.7, 12510,   555,   1250,    782,  58.6,     626000],
  [340,  340, 137, 18.3, 12.2, 12.2, 86.7, 15700,   674,   1530,    924,  75.2,     855000],
  [360,  360, 143, 19.5, 13.0, 13.0, 97.0, 19610,   818,   1870,   1090,  98.0,    1150000],
  [380,  380, 149, 20.5, 13.7, 13.7,  107, 24010,   975,   2230,   1260, 124,      1530000],
  [400,  400, 155, 21.6, 14.4, 14.4,  118, 29210,  1160,   2650,   1460, 155,      2010000],
  [450,  450, 170, 24.3, 16.2, 16.2,  147, 45850,  1730,   4080,   2040, 248,      3840000],
  [500,  500, 185, 27.0, 18.0, 18.0,  179, 68740,  2480,   5930,   2750, 384,      6820000],
  [550,  550, 200, 30.0, 19.0, 19.0,  212, 99180,  3490,   8270,   3610, 573,     11700000],
  [600,  600, 215, 32.4, 21.6, 21.6,  254,139000,  4680,  11600,   4630, 836,     18900000],
];

// HEA sections
const HEA_DATA: Array<[number, number, number, number, number, number, number, number, number, number, number, number, number]> = [
  // size,  h,   b,   tf,  tw,  r,   A,    Iy,    Iz,   Wpl_y, Wel_y, It,   Iw
  [160,  152, 160,  9.0, 6.0, 15, 38.8,  1673,   479,   245,   220,  8.12,   31170],
  [200,  190, 200, 10.0, 6.5, 18, 53.8,  3692,  1336,   429,   389, 14.7,   105600],
  [240,  230, 240, 12.0, 7.5, 21, 76.8,  7763,  2769,   745,   675, 31.2,   282800],
  [280,  270, 280, 13.0, 8.0, 24, 97.3, 13670,  4763,  1112,  1013, 51.7,   621200],
  [300,  290, 300, 14.0, 8.5, 27,  112, 18260,  6310,  1383,  1260, 69.6,  1008000],
  [320,  310, 300, 15.5, 9.0, 27,  124, 22930,  6985,  1628,  1479, 93.1,  1378000],
  [360,  350, 300, 17.5,10.0, 27,  143, 33090,  7887,  2088,  1891,  141,  2159000],
  [400,  390, 300, 19.0,11.0, 27,  159, 45070,  8564,  2562,  2311,  202,  3092000],
];

// HEB sections
const HEB_DATA: Array<[number, number, number, number, number, number, number, number, number, number, number, number, number]> = [
  // size,  h,   b,   tf,  tw,  r,   A,    Iy,    Iz,   Wpl_y, Wel_y, It,   Iw
  [160,  160, 160, 13.0, 8.0, 15, 54.3,  2492,   889,   354,   311, 31.2,    47070],
  [200,  200, 200, 15.0, 9.0, 18, 78.1,  5696,  2003,   642,   570, 59.3,   171100],
  [240,  240, 240, 17.0,10.0, 21,  106, 11260,  3923,  1053,   938,  103,   486900],
  [280,  280, 280, 18.0,10.5, 24,  131, 19270,  6595,  1534,  1376,  144,  1009000],
  [300,  300, 300, 19.0,11.0, 27,  149, 25170,  8563,  1869,  1678,  185,  1688000],
  [320,  320, 300, 20.5,11.5, 27,  161, 30820,  9239,  2149,  1926,  225,  2383000],
  [360,  360, 300, 22.5,12.5, 27,  181, 43190, 10140,  2683,  2400,  313,  3690000],
  [400,  400, 300, 24.0,13.5, 27,  197, 57680, 10820,  3240,  2884,  355,  5383000],
];

function buildProfiles(
  tipo: 'IPE' | 'HEA' | 'HEB' | 'IPN',
  data: Array<[number, number, number, number, number, number, number, number, number, number, number, number, number]>,
): SteelProfile[] {
  return data.map(([size, h, b, tf, tw, r, A, Iy, Iz, Wpl_y, Wel_y, It, Iw]) => ({
    key: `${tipo}${size}`,
    tipo,
    size,
    label: `${tipo} ${size}`,
    h, b, tf, tw, r,
    A, Iy, Iz,
    Wpl_y, Wel_y,
    It, Iw,
  }));
}

export const STEEL_PROFILES: SteelProfile[] = [
  ...buildProfiles('IPE', IPE_DATA),
  ...buildProfiles('HEA', HEA_DATA),
  ...buildProfiles('HEB', HEB_DATA),
  ...buildProfiles('IPN', IPN_DATA),
];

export function getProfile(tipo: 'IPE' | 'HEA' | 'HEB' | 'IPN', size: number): SteelProfile | undefined {
  return STEEL_PROFILES.find((p) => p.tipo === tipo && p.size === size);
}

export function getSizesForTipo(tipo: 'IPE' | 'HEA' | 'HEB' | 'IPN'): number[] {
  return STEEL_PROFILES.filter((p) => p.tipo === tipo).map((p) => p.size);
}

// ---------------------------------------------------------------------------
// UPN channel sections — ArcelorMittal standard catalogue
// Units: h, b, tf, tw in mm; A in cm²; Iy, Iz in cm⁴; Wpl_y, Wel_y in cm³; It in cm⁴; e1 in mm
// e1 = distance from outer web face to UPN centroid (needed for Iz_box)
// ---------------------------------------------------------------------------

export interface UPNProfile {
  size: number;
  h: number; b: number; tf: number; tw: number;
  A: number; Iy: number; Iz: number;
  Wpl_y: number; Wel_y: number; It: number;
  e1: number;
}

// size, h, b, tf, tw, A, Iy, Iz, Wpl_y, Wel_y, It, e1
const UPN_DATA: Array<[number,number,number,number,number,number,number,number,number,number,number,number]> = [
  [ 80,  80,  45,  8.0,  6.0,  11.0,   106,  19.4,   33.6,   26.5,   2.42, 14.4],
  [100, 100,  50,  8.5,  6.0,  13.5,   206,  29.3,   51.5,   41.2,   3.42, 15.5],
  [120, 120,  55,  9.0,  7.0,  17.0,   364,  43.2,   76.4,   60.7,   5.64, 17.0],
  [140, 140,  60, 10.0,  7.0,  20.4,   605,  62.7,  109.0,   86.4,   8.71, 18.6],
  [160, 160,  65, 10.5,  7.5,  24.0,   925,  85.3,  148.0,  116.0,  12.50, 19.8],
  [180, 180,  70, 11.0,  8.0,  28.0,  1350, 114.0,  195.0,  150.0,  17.70, 21.2],
  [200, 200,  75, 11.5,  8.5,  32.2,  1910, 148.0,  251.0,  191.0,  23.80, 22.5],
  [220, 220,  80, 12.5,  9.0,  37.4,  2690, 195.0,  322.0,  245.0,  34.70, 24.0],
  [240, 240,  85, 13.0,  9.5,  42.3,  3600, 248.0,  400.0,  300.0,  44.40, 25.1],
  [260, 260,  90, 14.0, 10.0,  48.3,  4820, 317.0,  497.0,  371.0,  62.40, 26.6],
  [280, 280,  95, 15.0, 10.0,  53.3,  6280, 399.0,  608.0,  449.0,  82.50, 27.7],
  [300, 300, 100, 16.0, 10.0,  58.8,  8030, 495.0,  739.0,  535.0, 108.00, 28.8],
  [320, 320, 100, 17.5, 10.5,  65.2, 10870, 597.0,  942.0,  679.0, 158.00, 30.0],
  [350, 350, 100, 16.0, 12.0,  66.0, 13210, 570.0, 1043.0,  755.0, 136.00, 27.6],
  [380, 380, 102, 16.0, 13.5,  70.4, 16160, 615.0, 1183.0,  851.0, 149.00, 27.4],
  [400, 400, 110, 18.0, 14.0,  91.5, 23130, 846.0, 1590.0, 1160.0, 243.00, 30.3],
];

export const UPN_PROFILES: UPNProfile[] = UPN_DATA.map(
  ([size, h, b, tf, tw, A, Iy, Iz, Wpl_y, Wel_y, It, e1]) =>
    ({ size, h, b, tf, tw, A, Iy, Iz, Wpl_y, Wel_y, It, e1 }),
);

export function getUPN(size: number): UPNProfile | undefined {
  return UPN_PROFILES.find((p) => p.size === size);
}

export function getSizesUPN(): number[] {
  return UPN_PROFILES.map((p) => p.size);
}

// ---------------------------------------------------------------------------
// 2UPN cajón cerrado — composite closed-box section (zero gap, flanges welded)
// Webs on the outside (left/right), flanges forming the inner top/bottom walls.
// Box dims: H = h_UPN, B_total = 2 * b_UPN
// ---------------------------------------------------------------------------

export interface UPNBoxProfile {
  isBox: true;
  size: number;
  /** Single UPN flange width (mm) — half the box total width. */
  b_upn: number;
  /** Box total height = h_UPN (mm) */
  h: number;
  /** Box total width = 2 * b_UPN (mm) */
  b: number;
  /** Flange thickness = tf_UPN (mm) */
  tf: number;
  /** Web thickness = tw_UPN (mm) */
  tw: number;
  A: number;     // 2 · A_UPN                                  (cm²)
  Iy: number;    // 2 · Iy_UPN                                 (cm⁴)
  Iz: number;    // 2·Iz_UPN + 2·A_UPN·(b_upn − e1)²          (cm⁴)
  Wpl_y: number; // 2 · Wpl_y_UPN                              (cm³)
  Wel_y: number; // Iy_box / (h/2)                             (cm³)
  It: number;    // Bredt 4·Am²/Σ(ds/t)                       (cm⁴)
  Iw: number;    // 0 — closed section                        (cm⁶)
}

export function buildUPNBox(size: number): UPNBoxProfile | undefined {
  const upn = getUPN(size);
  if (!upn) return undefined;

  const { h, b: b_upn, tf, tw, A: A1, Iy: Iy1, Iz: Iz1, Wpl_y: Wply1, e1 } = upn;

  const A = 2 * A1;
  const Iy = 2 * Iy1;

  // Iz: parallel-axis theorem — centroid-to-z-axis distance = (b_upn − e1)
  const d_cm = (b_upn - e1) / 10; // mm → cm
  const Iz = 2 * Iz1 + 2 * A1 * d_cm * d_cm;

  const Wpl_y = 2 * Wply1;

  // Wel_y = Iy_box / (h/2 in cm)  →  20·Iy_box / h_mm
  const Wel_y = (20 * Iy) / h;

  // Bredt torsion — using median-line dimensions
  const h_m = h - tf;          // mm — median web height
  const b_m = 2 * b_upn - tw;  // mm — median box width (web-to-web centre)
  const Am_cm2 = (h_m * b_m) / 100; // mm² → cm²
  const sum_ds_t = 2 * h_m / tw + 2 * b_m / tf; // dimensionless (mm/mm)
  const It = (4 * Am_cm2 * Am_cm2) / sum_ds_t;

  return {
    isBox: true,
    size,
    b_upn,
    h, b: 2 * b_upn,
    tf, tw,
    A, Iy, Iz,
    Wpl_y, Wel_y,
    It, Iw: 0,
  };
}
