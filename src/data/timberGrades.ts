// Timber strength classes — EN 338:2016 (aserrada) + EN 14080:2013 (laminada)
// Properties per the screenshot table + normative sources.
// Units: fm_k, ft0_k, ft90_k, fc0_k, fc90_k, fv_k in N/mm²
//        E0_mean, E0_05, E90_mean, G_mean in kN/mm² (= GPa)
//        rho_k, rho_mean in kg/m³

export type TimberType = 'sawn' | 'glulam';
export type TimberSubtype = 'softwood' | 'hardwood';  // governs βn in fire

export interface TimberGrade {
  id: string;
  label: string;
  type: TimberType;
  subtype: TimberSubtype;
  // Resistance (N/mm²)
  fm_k:   number;
  ft0_k:  number;
  ft90_k: number;
  fc0_k:  number;
  fc90_k: number;
  fv_k:   number;
  // Stiffness (kN/mm²)
  E0_mean:  number;
  E0_05:    number;
  E90_mean: number;
  G_mean:   number;
  // Density (kg/m³)
  rho_k:    number;
  rho_mean: number;
}

// ── Conífera y Chopo — Madera Aserrada (C-class, EN 338:2016) ────────────────
const SOFTWOOD_SAWN: TimberGrade[] = [
  { id: 'C14', label: 'C14', type: 'sawn', subtype: 'softwood',
    fm_k: 14,   ft0_k: 7.2,  ft90_k: 0.4, fc0_k: 16,   fc90_k: 2.0, fv_k: 3.0,
    E0_mean: 7.0,  E0_05: 4.7,  E90_mean: 0.23, G_mean: 0.44,
    rho_k: 290, rho_mean: 350 },
  { id: 'C16', label: 'C16', type: 'sawn', subtype: 'softwood',
    fm_k: 16,   ft0_k: 8.5,  ft90_k: 0.4, fc0_k: 17,   fc90_k: 2.2, fv_k: 3.2,
    E0_mean: 8.0,  E0_05: 5.4,  E90_mean: 0.27, G_mean: 0.50,
    rho_k: 310, rho_mean: 370 },
  { id: 'C18', label: 'C18', type: 'sawn', subtype: 'softwood',
    fm_k: 18,   ft0_k: 10.0, ft90_k: 0.4, fc0_k: 18,   fc90_k: 2.2, fv_k: 3.4,
    E0_mean: 9.0,  E0_05: 6.0,  E90_mean: 0.30, G_mean: 0.56,
    rho_k: 320, rho_mean: 380 },
  { id: 'C22', label: 'C22', type: 'sawn', subtype: 'softwood',
    fm_k: 22,   ft0_k: 13.0, ft90_k: 0.4, fc0_k: 19,   fc90_k: 2.4, fv_k: 3.8,
    E0_mean: 10.0, E0_05: 6.7,  E90_mean: 0.33, G_mean: 0.63,
    rho_k: 340, rho_mean: 410 },
  { id: 'C24', label: 'C24', type: 'sawn', subtype: 'softwood',
    fm_k: 24,   ft0_k: 14.5, ft90_k: 0.4, fc0_k: 21,   fc90_k: 2.5, fv_k: 4.0,
    E0_mean: 11.0, E0_05: 7.4,  E90_mean: 0.37, G_mean: 0.69,
    rho_k: 350, rho_mean: 420 },
  { id: 'C27', label: 'C27', type: 'sawn', subtype: 'softwood',
    fm_k: 27,   ft0_k: 16.5, ft90_k: 0.4, fc0_k: 22,   fc90_k: 2.5, fv_k: 4.0,
    E0_mean: 11.5, E0_05: 7.7,  E90_mean: 0.38, G_mean: 0.72,
    rho_k: 360, rho_mean: 420 },
  { id: 'C30', label: 'C30', type: 'sawn', subtype: 'softwood',
    fm_k: 30,   ft0_k: 19.0, ft90_k: 0.4, fc0_k: 24,   fc90_k: 2.7, fv_k: 4.0,
    E0_mean: 12.0, E0_05: 8.0,  E90_mean: 0.40, G_mean: 0.75,
    rho_k: 380, rho_mean: 460 },
  { id: 'C35', label: 'C35', type: 'sawn', subtype: 'softwood',
    fm_k: 35,   ft0_k: 22.5, ft90_k: 0.4, fc0_k: 25,   fc90_k: 2.7, fv_k: 4.0,
    E0_mean: 13.0, E0_05: 8.7,  E90_mean: 0.43, G_mean: 0.81,
    rho_k: 400, rho_mean: 480 },
  { id: 'C40', label: 'C40', type: 'sawn', subtype: 'softwood',
    fm_k: 40,   ft0_k: 26.0, ft90_k: 0.4, fc0_k: 27,   fc90_k: 2.8, fv_k: 4.0,
    E0_mean: 14.0, E0_05: 9.4,  E90_mean: 0.47, G_mean: 0.88,
    rho_k: 400, rho_mean: 480 },
];

// ── Frondosas — Madera Aserrada (D-class, EN 338:2016) ───────────────────────
const HARDWOOD_SAWN: TimberGrade[] = [
  { id: 'D30', label: 'D30', type: 'sawn', subtype: 'hardwood',
    fm_k: 30,   ft0_k: 18.0, ft90_k: 0.6, fc0_k: 24,   fc90_k: 5.3, fv_k: 3.9,
    E0_mean: 11.0, E0_05: 9.2,  E90_mean: 0.73, G_mean: 0.69,
    rho_k: 530, rho_mean: 640 },
  { id: 'D35', label: 'D35', type: 'sawn', subtype: 'hardwood',
    fm_k: 35,   ft0_k: 21.0, ft90_k: 0.6, fc0_k: 25,   fc90_k: 5.4, fv_k: 4.1,
    E0_mean: 12.0, E0_05: 10.1, E90_mean: 0.80, G_mean: 0.75,
    rho_k: 560, rho_mean: 670 },
  { id: 'D40', label: 'D40', type: 'sawn', subtype: 'hardwood',
    fm_k: 40,   ft0_k: 24.0, ft90_k: 0.6, fc0_k: 27,   fc90_k: 5.5, fv_k: 4.2,
    E0_mean: 13.0, E0_05: 10.9, E90_mean: 0.87, G_mean: 0.81,
    rho_k: 590, rho_mean: 700 },
  { id: 'D50', label: 'D50', type: 'sawn', subtype: 'hardwood',
    fm_k: 50,   ft0_k: 30.0, ft90_k: 0.6, fc0_k: 30,   fc90_k: 6.2, fv_k: 4.5,
    E0_mean: 14.0, E0_05: 11.8, E90_mean: 0.93, G_mean: 0.88,
    rho_k: 650, rho_mean: 780 },
  { id: 'D60', label: 'D60', type: 'sawn', subtype: 'hardwood',
    fm_k: 60,   ft0_k: 36.0, ft90_k: 0.6, fc0_k: 33,   fc90_k: 10.5, fv_k: 4.8,
    E0_mean: 17.0, E0_05: 14.3, E90_mean: 1.13, G_mean: 1.06,
    rho_k: 700, rho_mean: 840 },
  { id: 'D70', label: 'D70', type: 'sawn', subtype: 'hardwood',
    fm_k: 70,   ft0_k: 42.0, ft90_k: 0.6, fc0_k: 36,   fc90_k: 12.0, fv_k: 5.0,
    E0_mean: 20.0, E0_05: 16.8, E90_mean: 1.33, G_mean: 1.25,
    rho_k: 800, rho_mean: 1080 },
];

// ── Madera Laminada Encolada homogénea (GL-h, EN 14080:2013) ─────────────────
const GLULAM: TimberGrade[] = [
  { id: 'GL24h', label: 'GL24h', type: 'glulam', subtype: 'softwood',
    fm_k: 24.0, ft0_k: 19.2, ft90_k: 0.50, fc0_k: 24.0, fc90_k: 2.5, fv_k: 3.5,
    E0_mean: 11.5, E0_05: 9.6,  E90_mean: 0.30, G_mean: 0.65,
    rho_k: 385, rho_mean: 420 },
  { id: 'GL28h', label: 'GL28h', type: 'glulam', subtype: 'softwood',
    fm_k: 28.0, ft0_k: 22.3, ft90_k: 0.50, fc0_k: 28.0, fc90_k: 2.5, fv_k: 3.5,
    E0_mean: 12.6, E0_05: 10.5, E90_mean: 0.30, G_mean: 0.65,
    rho_k: 425, rho_mean: 460 },
  { id: 'GL30h', label: 'GL30h', type: 'glulam', subtype: 'softwood',
    fm_k: 30.0, ft0_k: 24.0, ft90_k: 0.50, fc0_k: 30.0, fc90_k: 2.5, fv_k: 3.5,
    E0_mean: 13.6, E0_05: 11.3, E90_mean: 0.30, G_mean: 0.65,
    rho_k: 430, rho_mean: 480 },
  { id: 'GL36h', label: 'GL36h', type: 'glulam', subtype: 'softwood',
    fm_k: 36.0, ft0_k: 25.6, ft90_k: 0.50, fc0_k: 32.0, fc90_k: 2.5, fv_k: 3.5,
    E0_mean: 14.2, E0_05: 11.8, E90_mean: 0.30, G_mean: 0.65,
    rho_k: 440, rho_mean: 490 },
];

export const TIMBER_GRADES: TimberGrade[] = [
  ...SOFTWOOD_SAWN,
  ...HARDWOOD_SAWN,
  ...GLULAM,
];

export function getTimberGrade(id: string): TimberGrade | undefined {
  return TIMBER_GRADES.find((g) => g.id === id);
}

// kmod — EC5 Table 3.1 (aserrada + laminada homogénea, same values)
// Rows: loadDurationClass; Cols: serviceClass 1 / 2 / 3
const KMOD_TABLE: Record<string, [number, number, number]> = {
  permanent:     [0.60, 0.60, 0.50],
  long:          [0.70, 0.70, 0.55],
  medium:        [0.80, 0.80, 0.65],
  short:         [0.90, 0.90, 0.70],
  instantaneous: [1.10, 1.10, 0.90],
};

// kdef — EC5 Table 3.2 (aserrada + laminada)
const KDEF_TABLE: Record<string, [number, number, number]> = {
  sawn:   [0.60, 0.80, 2.00],
  glulam: [0.60, 0.80, 2.00],
};

export type LoadDurationClass = 'permanent' | 'long' | 'medium' | 'short' | 'instantaneous';
export type ServiceClass = 1 | 2 | 3;

export function getKmod(loadDuration: LoadDurationClass, serviceClass: ServiceClass): number {
  return KMOD_TABLE[loadDuration][serviceClass - 1];
}

export function getKdef(type: TimberType, serviceClass: ServiceClass): number {
  return KDEF_TABLE[type][serviceClass - 1];
}

/** γM per EC5 §2.4.1 + Spanish NA */
export function getGammaM(type: TimberType): number {
  return type === 'glulam' ? 1.25 : 1.30;
}

/** βn (mm/min) per EN 1995-1-2 Table 3.1 — notional charring rate */
export function getBetaN(subtype: TimberSubtype, type: TimberType): number {
  if (subtype === 'hardwood') return 0.70;
  if (type === 'glulam') return 0.70;
  return 0.80;  // softwood sawn
}
