// Steel profile catalogue — ArcelorMittal standard values
// Units: h, b, tf, tw, r in mm; A in cm²; Iy, Iz, It in cm⁴; Wpl_y, Wel_y in cm³; Iw in cm⁶

export interface SteelProfile {
  key: string;
  tipo: 'IPE' | 'HEA' | 'HEB';
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
  tipo: 'IPE' | 'HEA' | 'HEB',
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
];

export function getProfile(tipo: 'IPE' | 'HEA' | 'HEB', size: number): SteelProfile | undefined {
  return STEEL_PROFILES.find((p) => p.tipo === tipo && p.size === size);
}

export function getSizesForTipo(tipo: 'IPE' | 'HEA' | 'HEB'): number[] {
  return STEEL_PROFILES.filter((p) => p.tipo === tipo).map((p) => p.size);
}
