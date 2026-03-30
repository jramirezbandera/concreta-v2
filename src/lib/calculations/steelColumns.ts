// Steel Column calculations — CTE DB-SE-A / EC3
// Units: mm for section dims, N/mm² for stress, kN for forces, kNm for moments.
// Section properties follow ArcelorMittal convention:
//   A in cm²  |  I in cm⁴  |  W in cm³  |  Iw in cm⁶  |  dims in mm

import { type SteelColumnInputs } from '../../data/defaults';
import { getProfile, buildUPNBox } from '../../data/steelProfiles';
import { type SteelCheckRow, type SteelCheckStatus } from './steelBeams';

// ─── Constants ────────────────────────────────────────────────────────────────
const E  = 210000;  // N/mm² — Young's modulus
const G  = 81000;   // N/mm² — shear modulus
const γM0 = 1.05;
const γM1 = 1.05;

// ─── Result type ──────────────────────────────────────────────────────────────
export interface SteelColumnResult {
  valid: boolean;
  error?: string;
  sectionClass: 1 | 2 | 3 | 4;
  isBox: boolean;
  // Key section / resistance values
  NRd: number;       // kN — section compression resistance (γM0)
  My_Rd: number;     // kNm — major-axis bending resistance (γM0)
  Mz_Rd: number;     // kNm — minor-axis bending resistance (γM0)
  Nb_Rd_y: number;   // kN — major-axis buckling resistance
  Nb_Rd_z: number;   // kN — minor-axis buckling resistance
  lambda_y: number;
  lambda_z: number;
  chi_y: number;
  chi_z: number;
  // LTB (I sections with My>0 only)
  Mcr: number;       // kNm
  lambda_LT: number;
  chi_LT: number;
  Mb_Rd: number;     // kNm
  // Interaction
  util_check1: number;
  util_check2: number;
  utilization: number;
  checks: SteelCheckRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStatus(util: number): SteelCheckStatus {
  if (util < 0.8) return 'ok';
  if (util < 1.0) return 'warn';
  return 'fail';
}

function check(
  id: string, description: string,
  demand: number, capacity: number,
  demandStr: string, capacityStr: string,
  article: string,
): SteelCheckRow {
  const util = capacity > 0 ? demand / capacity : Infinity;
  return { id, description, value: demandStr, limit: capacityStr, utilization: util, status: toStatus(util), article };
}

function checkNeutral(id: string, description: string, tag: string, article: string): SteelCheckRow {
  return { id, description, value: '', limit: '', utilization: 0, status: 'neutral', article, neutral: true, tag };
}

/** Buckling reduction factor χ from EC3 Table 6.1. */
function bucklingChi(lambda_bar: number, alpha: number): number {
  if (lambda_bar <= 0.2) return 1.0;
  const phi = 0.5 * (1 + alpha * (lambda_bar - 0.2) + lambda_bar * lambda_bar);
  return Math.min(1.0, 1 / (phi + Math.sqrt(Math.max(0, phi * phi - lambda_bar * lambda_bar))));
}

/**
 * Plastic section modulus about z-z (cm³) computed from section geometry.
 * For I sections: Wpl,z = b²·tf/2 + (h−2tf)·tw²/4  (all in cm)
 * For 2UPN box:   Wpl,z = 2·[b_upn²·tf + tw·(h−2tf)·(b_upn−tw/2)]  (all in cm)
 */
function wplZ(h_mm: number, b_mm: number, tf_mm: number, tw_mm: number, isBox: boolean, b_upn_mm: number): number {
  if (isBox) {
    const b = b_upn_mm / 10; const hh = h_mm / 10; const tf = tf_mm / 10; const tw = tw_mm / 10;
    return 2 * (b * b * tf + tw * (hh - 2 * tf) * (b - tw / 2));
  } else {
    const b = b_mm / 10; const hh = h_mm / 10; const tf = tf_mm / 10; const tw = tw_mm / 10;
    return b * b * tf / 2 + (hh - 2 * tf) * tw * tw / 4;
  }
}

/**
 * Elastic section modulus about z-z (cm³).
 * I section:  Wel,z = Iz / (b/2)
 * 2UPN box:   Wel,z = Iz / b_upn  (extreme fiber at b_upn from z-axis)
 */
function welZ(Iz_cm4: number, b_mm: number, isBox: boolean, b_upn_mm: number): number {
  const ext = isBox ? b_upn_mm / 10 : (b_mm / 10) / 2;
  return ext > 0 ? Iz_cm4 / ext : 0;
}

function invalidResult(
  error: string,
  sectionClass: 1 | 2 | 3 | 4 = 1,
  isBox = false,
): SteelColumnResult {
  return {
    valid: false, error, sectionClass, isBox,
    NRd: 0, My_Rd: 0, Mz_Rd: 0, Nb_Rd_y: 0, Nb_Rd_z: 0,
    lambda_y: 0, lambda_z: 0, chi_y: 0, chi_z: 0,
    Mcr: 0, lambda_LT: 0, chi_LT: 1, Mb_Rd: 0,
    util_check1: 0, util_check2: 0, utilization: 0, checks: [],
  };
}

// ─── Main calculator ──────────────────────────────────────────────────────────

export function calcSteelColumn(inp: SteelColumnInputs): SteelColumnResult {
  const { sectionType, size, steel, Ly, Lz, beta_y, beta_z, Ned, My_Ed, Mz_Ed } = inp;

  // 1. Validate inputs
  if (Ly <= 0) return invalidResult('Ly debe ser mayor que 0', 1, sectionType === '2UPN');
  if (Lz <= 0) return invalidResult('Lz debe ser mayor que 0', 1, sectionType === '2UPN');
  if (Ned < 0) return invalidResult('Ned no puede ser negativo', 1, sectionType === '2UPN');

  // 2. Retrieve section geometry
  let h: number, b: number, tf: number, tw: number, r: number;
  let A: number, Iy: number, Iz: number, Wpl_y: number, Wel_y: number, It: number, Iw: number;
  let b_upn = 0;
  const isBox = sectionType === '2UPN';

  if (isBox) {
    const box = buildUPNBox(size);
    if (!box) return invalidResult(`Perfil 2UPN ${size} no encontrado`, 1, true);
    h = box.h; b = box.b; tf = box.tf; tw = box.tw; r = 0;
    A = box.A; Iy = box.Iy; Iz = box.Iz;
    Wpl_y = box.Wpl_y; Wel_y = box.Wel_y;
    It = box.It; Iw = box.Iw;
    b_upn = box.b_upn;
  } else {
    const prof = getProfile(sectionType as 'IPE' | 'HEA' | 'HEB', size);
    if (!prof) return invalidResult(`Perfil ${sectionType} ${size} no encontrado`, 1, false);
    h = prof.h; b = prof.b; tf = prof.tf; tw = prof.tw; r = prof.r;
    A = prof.A; Iy = prof.Iy; Iz = prof.Iz;
    Wpl_y = prof.Wpl_y; Wel_y = prof.Wel_y;
    It = prof.It; Iw = prof.Iw;
  }

  // 3. Material strength and slenderness reference
  const fy = steel === 'S355' ? 355 : 275;  // N/mm²
  const eps = Math.sqrt(235 / fy);

  // 4. Section classification
  let cf_tf: number, cw_tw: number;
  let flangeClass: number, webClass: number;

  if (isBox) {
    // Internal elements (both ends attached) — box section
    cf_tf = 2 * (b_upn - tw) / tf;   // full internal flange width / tf
    cw_tw = (h - 2 * tf) / tw;        // clear web height / tw
    flangeClass = cf_tf <= 33 * eps ? 1 : cf_tf <= 38 * eps ? 2 : cf_tf <= 42 * eps ? 3 : 4;
    webClass    = cw_tw <= 33 * eps ? 1 : cw_tw <= 38 * eps ? 2 : cw_tw <= 42 * eps ? 3 : 4;
  } else {
    // Outstand flange + internal web (I section, pure compression)
    const c_f = (b - tw - 2 * r) / 2;
    const c_w = h - 2 * tf - 2 * r;
    cf_tf = c_f / tf;
    cw_tw = c_w / tw;
    flangeClass = cf_tf <= 9 * eps ? 1 : cf_tf <= 10 * eps ? 2 : cf_tf <= 14 * eps ? 3 : 4;
    webClass    = cw_tw <= 33 * eps ? 1 : cw_tw <= 38 * eps ? 2 : cw_tw <= 42 * eps ? 3 : 4;
  }

  const sectionClass = Math.max(flangeClass, webClass) as 1 | 2 | 3 | 4;

  if (sectionClass === 4) {
    return invalidResult('Sección Clase 4 — no soportado en v1', 4, isBox);
  }

  // 5. Section moduli and characteristic resistances
  const usePlastic = sectionClass <= 2;
  const W_y   = usePlastic ? Wpl_y : Wel_y;
  const Wpl_z = wplZ(h, b, tf, tw, isBox, b_upn);
  const Wel_z = welZ(Iz, b, isBox, b_upn);
  const W_z   = usePlastic ? Wpl_z : Wel_z;

  // kN and kNm:  A[cm²]·fy[N/mm²]·0.1 = kN  |  W[cm³]·fy[N/mm²]/1000 = kNm
  const NRk   = A   * fy * 0.1;
  const My_Rk = W_y * fy / 1000;
  const Mz_Rk = W_z * fy / 1000;

  const NRd   = NRk   / γM0;
  const My_Rd = My_Rk / γM0;
  const Mz_Rd = Mz_Rk / γM0;

  // 6. Effective lengths
  const Lk_y = beta_y * Ly;  // mm
  const Lk_z = beta_z * Lz;  // mm

  // 7. Radii of gyration and reduced slenderness
  // i[mm] = 10·√(I[cm⁴]/A[cm²]) ;  λ1 = π·√(E/fy)
  const i_y    = 10 * Math.sqrt(Iy / A);
  const i_z    = 10 * Math.sqrt(Iz / A);
  const lambda1 = Math.PI * Math.sqrt(E / fy);

  const lambda_y = (Lk_y / i_y) / lambda1;
  const lambda_z = (Lk_z / i_z) / lambda1;

  // 8. Buckling curves (EC3 Table 6.2)
  //   2UPN box (welded): curve b both axes  (α = 0.34)
  //   IPE (h/b > 1.2, tf ≤ 40): y → a (0.21), z → b (0.34)
  //   HEA/HEB (h/b ≤ 1.2, tf ≤ 40): y → b (0.34), z → c (0.49)
  //   Any section, tf > 40: y → c (0.49), z → d (0.76)
  let alpha_y: number, alpha_z: number;
  if (isBox) {
    alpha_y = 0.34; alpha_z = 0.34;
  } else if (tf > 40) {
    alpha_y = 0.49; alpha_z = 0.76;
  } else if (h / b > 1.2) {
    alpha_y = 0.21; alpha_z = 0.34;  // IPE-like
  } else {
    alpha_y = 0.34; alpha_z = 0.49;  // HEA/HEB-like
  }

  const chi_y = bucklingChi(lambda_y, alpha_y);
  const chi_z = bucklingChi(lambda_z, alpha_z);

  const Nb_Rd_y = chi_y * NRk / γM1;
  const Nb_Rd_z = chi_z * NRk / γM1;

  // 9. Lateral-torsional buckling (open I sections, My > 0)
  const hasLTB = !isBox && My_Ed > 0;
  let Mcr = Infinity, lambda_LT = 0, chi_LT = 1.0, Mb_Rd = My_Rk / γM1;

  if (hasLTB) {
    // C1 = 1 (conservative), LTB length = Ly (y-axis unbraced length)
    const L_ltb  = Ly;
    const Iz_mm4 = Iz * 1e4;          // cm⁴ → mm⁴
    const It_mm4 = It * 1e4;          // cm⁴ → mm⁴
    const Iw_mm6 = Iw * 1e6;          // cm⁶ → mm⁶

    const factor1 = Math.PI * Math.PI * E * Iz_mm4 / (L_ltb * L_ltb);  // N
    const term2   = Iw_mm6 / Iz_mm4
                  + L_ltb * L_ltb * G * It_mm4 / (Math.PI * Math.PI * E * Iz_mm4); // mm²

    if (term2 > 0 && isFinite(term2)) {
      const Mcr_Nmm = factor1 * Math.sqrt(term2);
      Mcr = Mcr_Nmm / 1e6;  // N·mm → kNm
    }

    if (Mcr > 0 && isFinite(Mcr)) {
      lambda_LT = Math.sqrt(My_Rk / Mcr);  // both in kNm
      // α_LT: h/b > 2 → curve b (0.34), h/b ≤ 2 → curve c (0.49)
      const alpha_LT = (h / b > 2) ? 0.34 : 0.49;
      chi_LT = bucklingChi(lambda_LT, alpha_LT);
      Mb_Rd  = chi_LT * My_Rk / γM1;
    }
  }

  // 10. Interaction factors — Method 2, Annex B EC3 (Cmy = Cmz = 1.0)
  const mu_y = Math.min(Math.max(lambda_y - 0.2, 0), 0.8);
  const mu_z = Math.min(Math.max(lambda_z - 0.2, 0), 0.8);

  // Normalized axial force relative to each buckling resistance
  const n_y = Ned / (chi_y * NRk / γM1);
  const n_z = Ned / (chi_z * NRk / γM1);

  const kyy = 1 + mu_y * n_y;
  const kzz = 1 + mu_z * n_z;
  const kyz = 0.6 * kzz;
  const kzy = 0.6 * kyy;

  // 11. Interaction checks 6.3.3
  const denom_N_y  = chi_y  * NRk / γM1;
  const denom_N_z  = chi_z  * NRk / γM1;
  const denom_My   = chi_LT * My_Rk / γM1;    // Mb,Rd for My
  const denom_Mz   = Mz_Rk / γM1;

  const util_check1 = Ned / denom_N_y
    + (My_Ed > 0 ? kyy * My_Ed / denom_My : 0)
    + (Mz_Ed > 0 ? kyz * Mz_Ed / denom_Mz : 0);

  const util_check2 = Ned / denom_N_z
    + (My_Ed > 0 ? kzy * My_Ed / denom_My : 0)
    + (Mz_Ed > 0 ? kzz * Mz_Ed / denom_Mz : 0);

  // 12. Slenderness limits (Lk/i ≤ 200)
  const slend_y = i_y > 0 ? Lk_y / i_y : Infinity;
  const slend_z = i_z > 0 ? Lk_z / i_z : Infinity;
  const SLEND_MAX = 200;

  // Governing utilization
  const utilization = Math.max(
    util_check1, util_check2,
    slend_y / SLEND_MAX, slend_z / SLEND_MAX,
    Ned > 0 ? Ned / Nb_Rd_y : 0,
    Ned > 0 ? Ned / Nb_Rd_z : 0,
  );

  // ─── Build checks array ──────────────────────────────────────────────────
  const checks: SteelCheckRow[] = [];

  // Classification
  checks.push(checkNeutral('class', 'Clasificación de sección', `CLASE ${sectionClass}`, 'CE DB-SE-A 5.5.2'));

  // Section resistances
  if (Ned > 0) {
    checks.push(check('NRd', 'Compresión  NEd / NRd', Ned, NRd,
      `${Ned.toFixed(0)} kN`, `${NRd.toFixed(0)} kN`, 'CE DB-SE-A 6.2.4'));
  }
  if (My_Ed > 0) {
    checks.push(check('MyRd', 'Flexión  My,Ed / My,Rd', My_Ed, My_Rd,
      `${My_Ed.toFixed(1)} kNm`, `${My_Rd.toFixed(1)} kNm`, 'CE DB-SE-A 6.2.5'));
  }
  if (Mz_Ed > 0) {
    checks.push(check('MzRd', 'Flexión  Mz,Ed / Mz,Rd', Mz_Ed, Mz_Rd,
      `${Mz_Ed.toFixed(1)} kNm`, `${Mz_Rd.toFixed(1)} kNm`, 'CE DB-SE-A 6.2.5'));
  }

  // Buckling
  checks.push(check('Nby', `Pandeo eje y  (λ̄=${lambda_y.toFixed(2)}, χ=${chi_y.toFixed(2)})`,
    Ned, Nb_Rd_y, `${Ned.toFixed(0)} kN`, `${Nb_Rd_y.toFixed(0)} kN`, 'CE DB-SE-A 6.3.1'));
  checks.push(check('Nbz', `Pandeo eje z  (λ̄=${lambda_z.toFixed(2)}, χ=${chi_z.toFixed(2)})`,
    Ned, Nb_Rd_z, `${Ned.toFixed(0)} kN`, `${Nb_Rd_z.toFixed(0)} kN`, 'CE DB-SE-A 6.3.1'));

  // LTB
  if (hasLTB && isFinite(Mcr)) {
    checks.push(check('LTB', `Pandeo lateral  (λ̄LT=${lambda_LT.toFixed(2)}, χLT=${chi_LT.toFixed(2)})`,
      My_Ed, Mb_Rd, `${My_Ed.toFixed(1)} kNm`, `${Mb_Rd.toFixed(1)} kNm`, 'CE DB-SE-A 6.3.2'));
  }

  // Interaction
  checks.push({
    id: 'int1', description: 'Interacción N+My+Mz  (Ec. 1)',
    value: util_check1.toFixed(3), limit: '1.000',
    utilization: util_check1, status: toStatus(util_check1),
    article: 'CE DB-SE-A 6.3.3',
  });
  checks.push({
    id: 'int2', description: 'Interacción N+My+Mz  (Ec. 2)',
    value: util_check2.toFixed(3), limit: '1.000',
    utilization: util_check2, status: toStatus(util_check2),
    article: 'CE DB-SE-A 6.3.3',
  });

  // Slenderness
  checks.push(check('sy',
    `Esbeltez  Lk/i (eje y) = ${slend_y.toFixed(0)}`,
    slend_y, SLEND_MAX, slend_y.toFixed(0), `${SLEND_MAX}`, 'CE DB-SE-A 6.3.1.3'));
  checks.push(check('sz',
    `Esbeltez  Lk/i (eje z) = ${slend_z.toFixed(0)}`,
    slend_z, SLEND_MAX, slend_z.toFixed(0), `${SLEND_MAX}`, 'CE DB-SE-A 6.3.1.3'));

  return {
    valid: true,
    sectionClass, isBox,
    NRd, My_Rd, Mz_Rd,
    Nb_Rd_y, Nb_Rd_z,
    lambda_y, lambda_z, chi_y, chi_z,
    Mcr: isFinite(Mcr) ? Mcr : 0,
    lambda_LT, chi_LT, Mb_Rd,
    util_check1, util_check2,
    utilization,
    checks,
  };
}
