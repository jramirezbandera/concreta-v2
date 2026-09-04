// Timber strength classes — EN 338:2016 (aserrada) + EN 14080:2013 (laminada)
// Properties per the screenshot table + normative sources.
//
// Aserrada: las tablas 1 y 3 de la UNE-EN 338:2016 COMPLETAS —doce clases C y
// catorce D—, transcritas el 2026-09-04 y fijadas en
// src/test/calc/timberGrades.golden.test.ts.
//
// Al transcribirlas aparecieron seis densidades que no eran de esa edición:
// C27 rho_mean 420→430 y C35 rho_k/rho_mean 400/480→390/470 (C35 llevaba
// copiadas las de C40); y D35 560/670→540/650, D40 590/700→550/660,
// D50 650/780→620/740 y D70 rho_mean 1080→960, que son las de la EN 338:2003.
// El resto de propiedades de esas filas sí eran las de 2016. rho_mean entra en
// el peso propio de las barras (frame-core/sections.ts), así que un error ahí
// no rompe nada: sólo pesa de más o de menos.
//
// OJO al mezclar ediciones: el anejo E del CTE DB SE-M reproduce la EN 338
// ANTERIOR y sus números no coinciden (C24 fc0,k 22 frente a 21; C40 rho_k 420
// frente a 400; D30 fc90,k 8,0 frente a 5,3). Este catálogo está entero en
// EN 338:2016, que es lo que decidió la auditoría #118 al corregir C22.
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
    fm_k: 14, ft0_k: 7.2, ft90_k: 0.4, fc0_k: 16, fc90_k: 2.0, fv_k: 3.0,
    E0_mean: 7.0, E0_05: 4.7, E90_mean: 0.23, G_mean: 0.44,
    rho_k: 290, rho_mean: 350 },
  { id: 'C16', label: 'C16', type: 'sawn', subtype: 'softwood',
    fm_k: 16, ft0_k: 8.5, ft90_k: 0.4, fc0_k: 17, fc90_k: 2.2, fv_k: 3.2,
    E0_mean: 8.0, E0_05: 5.4, E90_mean: 0.27, G_mean: 0.50,
    rho_k: 310, rho_mean: 370 },
  { id: 'C18', label: 'C18', type: 'sawn', subtype: 'softwood',
    fm_k: 18, ft0_k: 10, ft90_k: 0.4, fc0_k: 18, fc90_k: 2.2, fv_k: 3.4,
    E0_mean: 9.0, E0_05: 6.0, E90_mean: 0.30, G_mean: 0.56,
    rho_k: 320, rho_mean: 380 },
  { id: 'C20', label: 'C20', type: 'sawn', subtype: 'softwood',
    fm_k: 20, ft0_k: 11.5, ft90_k: 0.4, fc0_k: 19, fc90_k: 2.3, fv_k: 3.6,
    E0_mean: 9.5, E0_05: 6.4, E90_mean: 0.32, G_mean: 0.59,
    rho_k: 330, rho_mean: 400 },
  { id: 'C22', label: 'C22', type: 'sawn', subtype: 'softwood',
    fm_k: 22, ft0_k: 13, ft90_k: 0.4, fc0_k: 20, fc90_k: 2.4, fv_k: 3.8,
    E0_mean: 10.0, E0_05: 6.7, E90_mean: 0.33, G_mean: 0.63,
    rho_k: 340, rho_mean: 410 },
  { id: 'C24', label: 'C24', type: 'sawn', subtype: 'softwood',
    fm_k: 24, ft0_k: 14.5, ft90_k: 0.4, fc0_k: 21, fc90_k: 2.5, fv_k: 4.0,
    E0_mean: 11.0, E0_05: 7.4, E90_mean: 0.37, G_mean: 0.69,
    rho_k: 350, rho_mean: 420 },
  { id: 'C27', label: 'C27', type: 'sawn', subtype: 'softwood',
    fm_k: 27, ft0_k: 16.5, ft90_k: 0.4, fc0_k: 22, fc90_k: 2.5, fv_k: 4.0,
    E0_mean: 11.5, E0_05: 7.7, E90_mean: 0.38, G_mean: 0.72,
    rho_k: 360, rho_mean: 430 },
  { id: 'C30', label: 'C30', type: 'sawn', subtype: 'softwood',
    fm_k: 30, ft0_k: 19, ft90_k: 0.4, fc0_k: 24, fc90_k: 2.7, fv_k: 4.0,
    E0_mean: 12.0, E0_05: 8.0, E90_mean: 0.40, G_mean: 0.75,
    rho_k: 380, rho_mean: 460 },
  { id: 'C35', label: 'C35', type: 'sawn', subtype: 'softwood',
    fm_k: 35, ft0_k: 22.5, ft90_k: 0.4, fc0_k: 25, fc90_k: 2.7, fv_k: 4.0,
    E0_mean: 13.0, E0_05: 8.7, E90_mean: 0.43, G_mean: 0.81,
    rho_k: 390, rho_mean: 470 },
  { id: 'C40', label: 'C40', type: 'sawn', subtype: 'softwood',
    fm_k: 40, ft0_k: 26, ft90_k: 0.4, fc0_k: 27, fc90_k: 2.8, fv_k: 4.0,
    E0_mean: 14.0, E0_05: 9.4, E90_mean: 0.47, G_mean: 0.88,
    rho_k: 400, rho_mean: 480 },
  { id: 'C45', label: 'C45', type: 'sawn', subtype: 'softwood',
    fm_k: 45, ft0_k: 30, ft90_k: 0.4, fc0_k: 29, fc90_k: 2.9, fv_k: 4.0,
    E0_mean: 15.0, E0_05: 10.1, E90_mean: 0.50, G_mean: 0.94,
    rho_k: 410, rho_mean: 490 },
  { id: 'C50', label: 'C50', type: 'sawn', subtype: 'softwood',
    fm_k: 50, ft0_k: 33.5, ft90_k: 0.4, fc0_k: 30, fc90_k: 3.0, fv_k: 4.0,
    E0_mean: 16.0, E0_05: 10.7, E90_mean: 0.53, G_mean: 1.00,
    rho_k: 430, rho_mean: 520 },
];

// ── Frondosas — Madera Aserrada (D-class, EN 338:2016) ───────────────────────
const HARDWOOD_SAWN: TimberGrade[] = [
  { id: 'D18', label: 'D18', type: 'sawn', subtype: 'hardwood',
    fm_k: 18, ft0_k: 11, ft90_k: 0.6, fc0_k: 18, fc90_k: 4.8, fv_k: 3.5,
    E0_mean: 9.5, E0_05: 8.0, E90_mean: 0.63, G_mean: 0.59,
    rho_k: 475, rho_mean: 570 },
  { id: 'D24', label: 'D24', type: 'sawn', subtype: 'hardwood',
    fm_k: 24, ft0_k: 14, ft90_k: 0.6, fc0_k: 21, fc90_k: 4.9, fv_k: 3.7,
    E0_mean: 10.0, E0_05: 8.4, E90_mean: 0.67, G_mean: 0.63,
    rho_k: 485, rho_mean: 580 },
  { id: 'D27', label: 'D27', type: 'sawn', subtype: 'hardwood',
    fm_k: 27, ft0_k: 16, ft90_k: 0.6, fc0_k: 22, fc90_k: 5.1, fv_k: 3.8,
    E0_mean: 10.5, E0_05: 8.8, E90_mean: 0.70, G_mean: 0.66,
    rho_k: 510, rho_mean: 610 },
  { id: 'D30', label: 'D30', type: 'sawn', subtype: 'hardwood',
    fm_k: 30, ft0_k: 18, ft90_k: 0.6, fc0_k: 24, fc90_k: 5.3, fv_k: 3.9,
    E0_mean: 11.0, E0_05: 9.2, E90_mean: 0.73, G_mean: 0.69,
    rho_k: 530, rho_mean: 640 },
  { id: 'D35', label: 'D35', type: 'sawn', subtype: 'hardwood',
    fm_k: 35, ft0_k: 21, ft90_k: 0.6, fc0_k: 25, fc90_k: 5.4, fv_k: 4.1,
    E0_mean: 12.0, E0_05: 10.1, E90_mean: 0.80, G_mean: 0.75,
    rho_k: 540, rho_mean: 650 },
  { id: 'D40', label: 'D40', type: 'sawn', subtype: 'hardwood',
    fm_k: 40, ft0_k: 24, ft90_k: 0.6, fc0_k: 27, fc90_k: 5.5, fv_k: 4.2,
    E0_mean: 13.0, E0_05: 10.9, E90_mean: 0.87, G_mean: 0.81,
    rho_k: 550, rho_mean: 660 },
  { id: 'D45', label: 'D45', type: 'sawn', subtype: 'hardwood',
    fm_k: 45, ft0_k: 27, ft90_k: 0.6, fc0_k: 29, fc90_k: 5.8, fv_k: 4.4,
    E0_mean: 13.5, E0_05: 11.3, E90_mean: 0.90, G_mean: 0.84,
    rho_k: 580, rho_mean: 700 },
  { id: 'D50', label: 'D50', type: 'sawn', subtype: 'hardwood',
    fm_k: 50, ft0_k: 30, ft90_k: 0.6, fc0_k: 30, fc90_k: 6.2, fv_k: 4.5,
    E0_mean: 14.0, E0_05: 11.8, E90_mean: 0.93, G_mean: 0.88,
    rho_k: 620, rho_mean: 740 },
  { id: 'D55', label: 'D55', type: 'sawn', subtype: 'hardwood',
    fm_k: 55, ft0_k: 33, ft90_k: 0.6, fc0_k: 32, fc90_k: 6.6, fv_k: 4.7,
    E0_mean: 15.5, E0_05: 13.0, E90_mean: 1.03, G_mean: 0.97,
    rho_k: 660, rho_mean: 790 },
  { id: 'D60', label: 'D60', type: 'sawn', subtype: 'hardwood',
    fm_k: 60, ft0_k: 36, ft90_k: 0.6, fc0_k: 33, fc90_k: 10.5, fv_k: 4.8,
    E0_mean: 17.0, E0_05: 14.3, E90_mean: 1.13, G_mean: 1.06,
    rho_k: 700, rho_mean: 840 },
  { id: 'D65', label: 'D65', type: 'sawn', subtype: 'hardwood',
    fm_k: 65, ft0_k: 39, ft90_k: 0.6, fc0_k: 35, fc90_k: 11.3, fv_k: 5.0,
    E0_mean: 18.5, E0_05: 15.5, E90_mean: 1.23, G_mean: 1.16,
    rho_k: 750, rho_mean: 900 },
  { id: 'D70', label: 'D70', type: 'sawn', subtype: 'hardwood',
    fm_k: 70, ft0_k: 42, ft90_k: 0.6, fc0_k: 36, fc90_k: 12.0, fv_k: 5.0,
    E0_mean: 20.0, E0_05: 16.8, E90_mean: 1.33, G_mean: 1.25,
    rho_k: 800, rho_mean: 960 },
  { id: 'D75', label: 'D75', type: 'sawn', subtype: 'hardwood',
    fm_k: 75, ft0_k: 45, ft90_k: 0.6, fc0_k: 37, fc90_k: 12.8, fv_k: 5.0,
    E0_mean: 22.0, E0_05: 18.5, E90_mean: 1.47, G_mean: 1.38,
    rho_k: 850, rho_mean: 1020 },
  { id: 'D80', label: 'D80', type: 'sawn', subtype: 'hardwood',
    fm_k: 80, ft0_k: 48, ft90_k: 0.6, fc0_k: 38, fc90_k: 13.5, fv_k: 5.0,
    E0_mean: 24.0, E0_05: 20.2, E90_mean: 1.60, G_mean: 1.50,
    rho_k: 900, rho_mean: 1080 },
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
  // Fix auditoría #108: la antigua entrada 'GL36h' no existe en EN 14080:2013
  // (la gama termina en GL32h) — sus propiedades eran exactamente las de GL32h
  // pero con fm_k=36 (+12.5% no conservador). Renombrada con fm_k correcto.
  { id: 'GL32h', label: 'GL32h', type: 'glulam', subtype: 'softwood',
    fm_k: 32.0, ft0_k: 25.6, ft90_k: 0.50, fc0_k: 32.0, fc90_k: 2.5, fv_k: 3.5,
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

/**
 * kh — factor de tamaño sobre fm,k (y ft,0,k) — EN 1995-1-1 §3.2(3) y §3.3(3).
 *
 *   maciza:   h < 150 → min((150/h)^0,2; 1,3)   SÓLO si ρk ≤ 700 kg/m³
 *   laminada: h < 600 → min((600/h)^0,1; 1,1)
 *
 * La condición de densidad no es un detalle: el §3.2(3) la pone en la primera
 * línea («madera maciza de sección rectangular con una densidad característica
 * ρk ≤ 700 kg/m³»). Las frondosas D65 a D80 (ρk 750–900) no tienen bonificación
 * de tamaño, y darles hasta un 30 % más de fm,d en cantos pequeños es del lado
 * inseguro. Los tres motores (vigas, pilares, barras FEM) lo calculaban cada
 * uno por su cuenta y ninguno miraba la densidad.
 *
 * @param h canto en flexión (o anchura en tracción), mm.
 */
export function getKh(grade: TimberGrade, h: number): number {
  if (grade.type === 'glulam') {
    return h < 600 ? Math.min(Math.pow(600 / h, 0.1), 1.1) : 1.0;
  }
  if (grade.rho_k > 700) return 1.0;
  return h < 150 ? Math.min(Math.pow(150 / h, 0.2), 1.3) : 1.0;
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
