// Timber Column calculations — EN 1995-1-1 (EC5) + EN 1995-1-2 (fire)
// Spanish National Annex: UNE-EN 1995-1-1:2016/NA
// All dimensions in mm, forces in kN/kNm as noted.
//
// User provides design values (already factored): Nd, Vd, Md.
// Moment acts on one axis only (strong or weak), from wind loading.
//
// Checks:
//   ELU: Shear (§6.1.7), Buckling+Bending interaction (§6.3.3 eq 6.23 + 6.24)
//   Fuego: Reduced section (EN 1995-1-2 §4.2.2), checks on residual section

import { type TimberColumnInputs } from '../../data/defaults';
import {
  getTimberGrade,
  getKmod,
  getGammaM,
  getBetaN,
  type LoadDurationClass,
  type ServiceClass,
} from '../../data/timberGrades';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface TimberColumnCheckRow {
  id: string;
  description: string;
  value: string;
  limit: string;
  utilization: number;
  status: CheckStatus;
  article: string;
  group: 'elu' | 'fire';
  neutral?: boolean;
  tag?: string;
}

export interface TimberColumnResult {
  valid: boolean;
  error?: string;
  // Material
  kmod: number;
  gammaM: number;
  // Design strengths (N/mm²)
  fc0_d: number;
  fm_d: number;
  fv_d: number;
  // Section geometry
  A: number;        // mm²
  iy: number;       // mm — radius of gyration strong axis
  iz: number;       // mm — radius of gyration weak axis
  // Material
  kh: number;        // size factor (EC5 §3.2/§3.3)
  // Buckling
  betaC: number;
  Lef: number;       // mm — strong axis (display)
  Lef_y: number;     // mm — strong axis
  Lef_z: number;     // mm — weak axis
  lambda_y: number;
  lambda_z: number;
  lambda_rel_y: number;
  lambda_rel_z: number;
  kc_y: number;
  kc_z: number;
  // Stresses (N/mm²)
  sigma_c: number;  // axial compression
  sigma_m: number;  // bending (on selected axis)
  tau_d: number;    // shear
  // Utilizations for individual checks
  util_623: number;
  util_624: number;
  // Fire
  fireActive: boolean;
  t_fire: number;
  betaN: number;
  dchar: number;
  def: number;
  b_ef: number;
  h_ef: number;
  kc_y_fi: number;
  kc_z_fi: number;
  sigma_c_fi: number;
  sigma_m_fi: number;
  tau_fi: number;
  // Checks
  checks: TimberColumnCheckRow[];
}

function toStatus(util: number): CheckStatus {
  if (util < 0.8) return 'ok';
  if (util < 1.0) return 'warn';
  return 'fail';
}

function mkCheck(
  id: string,
  description: string,
  demand: number,
  capacity: number,
  valueStr: string,
  limitStr: string,
  article: string,
  group: TimberColumnCheckRow['group'],
): TimberColumnCheckRow {
  const util = capacity > 0 ? demand / capacity : Infinity;
  return { id, description, value: valueStr, limit: limitStr, utilization: util, status: toStatus(util), article, group };
}

function mkNeutral(
  id: string,
  description: string,
  tag: string,
  article: string,
  group: TimberColumnCheckRow['group'],
): TimberColumnCheckRow {
  return { id, description, value: '', limit: '', utilization: 0, status: 'ok', article, group, neutral: true, tag };
}

function invalidResult(error: string): TimberColumnResult {
  return {
    valid: false, error,
    kmod: 0, gammaM: 0, kh: 1, fc0_d: 0, fm_d: 0, fv_d: 0,
    A: 0, iy: 0, iz: 0,
    betaC: 0, Lef: 0, Lef_y: 0, Lef_z: 0,
    lambda_y: 0, lambda_z: 0, lambda_rel_y: 0, lambda_rel_z: 0,
    kc_y: 0, kc_z: 0,
    sigma_c: 0, sigma_m: 0, tau_d: 0,
    util_623: 0, util_624: 0,
    fireActive: false, t_fire: 0, betaN: 0, dchar: 0, def: 0,
    b_ef: 0, h_ef: 0, kc_y_fi: 0, kc_z_fi: 0,
    sigma_c_fi: 0, sigma_m_fi: 0, tau_fi: 0,
    checks: [],
  };
}

// Compute kc buckling reduction factor from λrel and βc (EC5 §6.3.2)
function calcKc(lambda_rel: number, betaC: number): number {
  if (lambda_rel <= 0.3) return 1.0;
  const k = 0.5 * (1 + betaC * (lambda_rel - 0.3) + lambda_rel * lambda_rel);
  return 1 / (k + Math.sqrt(k * k - lambda_rel * lambda_rel));
}

// Compute relative slenderness for column buckling (EC5 §6.3.2)
function calcLambdaRel(lambda: number, fc0_k: number, E0_05_Nmm2: number): number {
  return (lambda / Math.PI) * Math.sqrt(fc0_k / E0_05_Nmm2);
}

// Compute residual section after fire (same as beams, EN 1995-1-2 §4.2.2)
// For columns: 4 faces → both b and h reduced on two sides each
//              3 faces → b reduced both sides, h reduced one side (one face protected)
function calcResidualSection(b: number, h: number, def: number, faces: number) {
  const b_ef = Math.max(b - 2 * def, 0);
  const h_ef = faces === 4
    ? Math.max(h - 2 * def, 0)
    : Math.max(h - def, 0);
  return { b_ef, h_ef };
}

export function calcTimberColumn(inp: TimberColumnInputs): TimberColumnResult {
  const grade = getTimberGrade(inp.gradeId);
  if (!grade) return invalidResult('Clase resistente no encontrada');
  if (inp.b <= 0 || inp.h <= 0) return invalidResult('Dimensiones inválidas');
  if (inp.L <= 0) return invalidResult('Longitud inválida');
  if (inp.Nd < 0) return invalidResult('El axil Nd debe ser ≥ 0');
  if (inp.Vd < 0) return invalidResult('El cortante Vd debe ser ≥ 0');
  if (inp.Md < 0) return invalidResult('El momento Md debe ser ≥ 0');
  if (inp.beta_y <= 0 || inp.beta_z <= 0) return invalidResult('Factor β inválido');

  const { b, h } = inp;
  const Nd = inp.Nd;  // kN
  const Vd = inp.Vd;  // kN
  const Md = inp.Md;  // kNm

  // ── Material parameters ────────────────────────────────────────────────────
  const kmod   = getKmod(inp.loadDuration as LoadDurationClass, inp.serviceClass as ServiceClass);
  const gammaM = getGammaM(grade.type);
  const betaC  = grade.type === 'glulam' ? 0.1 : 0.2;

  const fc0_d = kmod * grade.fc0_k / gammaM;  // N/mm²
  const fv_d  = kmod * grade.fv_k  / gammaM;  // N/mm²

  // kh — size factor (EC5 §3.2 sawn / §3.3 glulam)
  // Relevant dimension for kh is the section depth in the direction of bending.
  // For columns with single-axis moment: use h (strong axis) or b (weak axis).
  // For stability/compression only (no bending), kh does not apply to fc0.
  const bendingDim = inp.momentAxis === 'strong' ? inp.h : inp.b;  // mm
  const kh = grade.type === 'glulam'
    ? (bendingDim < 600 ? Math.min(Math.pow(600 / bendingDim, 0.1), 1.1) : 1.0)
    : (bendingDim < 150 ? Math.min(Math.pow(150 / bendingDim, 0.2), 1.3) : 1.0);

  const fm_d  = kmod * kh * grade.fm_k / gammaM;  // N/mm² — with size factor

  const E0_05_Nmm2 = grade.E0_05 * 1000;  // kN/mm² → N/mm²

  // ── Section properties ─────────────────────────────────────────────────────
  const A  = b * h;              // mm²
  // Radii of gyration: iy for strong axis (bending in h-direction), iz for weak axis (bending in b-direction)
  const iy = h / Math.sqrt(12);  // mm — strong axis (Iy = b·h³/12)
  const iz = b / Math.sqrt(12);  // mm — weak axis  (Iz = h·b³/12)
  // Section moduli
  const Wy = b * h * h / 6;     // mm³ — strong axis (moment about y-y)
  const Wz = h * b * b / 6;     // mm³ — weak axis   (moment about z-z)
  const W  = inp.momentAxis === 'strong' ? Wy : Wz;

  // ── Effective lengths (independent per axis) ──────────────────────────────
  const Lef_y = inp.beta_y * inp.L * 1000;  // mm — strong axis (y-y)
  const Lef_z = inp.beta_z * inp.L * 1000;  // mm — weak axis  (z-z)
  const Lef = Lef_y;  // kept for SVG/PDF display (strong axis governs in most cases)

  // ── Slenderness ───────────────────────────────────────────────────────────
  const lambda_y = Lef_y / iy;
  const lambda_z = Lef_z / iz;
  const lambda_rel_y = calcLambdaRel(lambda_y, grade.fc0_k, E0_05_Nmm2);
  const lambda_rel_z = calcLambdaRel(lambda_z, grade.fc0_k, E0_05_Nmm2);
  const kc_y = calcKc(lambda_rel_y, betaC);
  const kc_z = calcKc(lambda_rel_z, betaC);

  // ── Stresses ──────────────────────────────────────────────────────────────
  const sigma_c = Nd * 1e3 / A;           // N/mm² (kN → N)
  const sigma_m = Md > 0 ? Md * 1e6 / W : 0;  // N/mm² (kNm → Nmm)

  const kcr  = 0.67;  // shear area factor EC5 §6.1.7(2)
  const A_ef = kcr * A;
  const tau_d = Vd > 0 ? 1.5 * Vd * 1e3 / A_ef : 0;  // N/mm²

  // ── km — redistribution factor for rectangular sections (EC5 §6.3.3) ──────
  const km = 0.7;

  // ── EC5 §6.3.3 interaction equations ──────────────────────────────────────
  // Stress components on each axis
  const sigma_m_y = inp.momentAxis === 'strong' ? sigma_m : 0;
  const sigma_m_z = inp.momentAxis === 'weak'   ? sigma_m : 0;

  // Eq 6.23: (σc/(kcy·fc0,d))² + σm,y/fm,d + km·σm,z/fm,d ≤ 1
  const term_c_y = fc0_d > 0 && kc_y > 0 ? sigma_c / (kc_y * fc0_d) : 0;
  const term_m_y = fm_d > 0 ? sigma_m_y / fm_d : 0;
  const term_m_z = fm_d > 0 ? sigma_m_z / fm_d : 0;
  const util_623 = term_c_y * term_c_y + term_m_y + km * term_m_z;

  // Eq 6.24: (σc/(kcz·fc0,d))² + km·σm,y/fm,d + σm,z/fm,d ≤ 1
  const term_c_z = fc0_d > 0 && kc_z > 0 ? sigma_c / (kc_z * fc0_d) : 0;
  const util_624 = term_c_z * term_c_z + km * term_m_y + term_m_z;

  // ── FIRE — EN 1995-1-2 ────────────────────────────────────────────────────
  const fireActive = inp.fireResistance !== 'R0';
  const t_fire = fireActive ? parseInt(inp.fireResistance.slice(1), 10) : 0;
  const betaN  = getBetaN(grade.subtype, grade.type);
  const d0     = 7;  // mm — zero-strength layer
  const dchar  = betaN * t_fire;
  const def    = fireActive ? dchar + d0 : 0;

  const { b_ef, h_ef } = fireActive
    ? calcResidualSection(b, h, def, inp.exposedFaces)
    : { b_ef: b, h_ef: h };

  // Fire design strengths: kmod,fi = 1.0, γM,fi = 1.0
  const fc0_d_fi = grade.fc0_k;
  const fm_d_fi  = grade.fm_k;
  const fv_d_fi  = grade.fv_k;

  // Residual section properties
  const A_fi  = b_ef * h_ef;
  const iy_fi = h_ef / Math.sqrt(12);
  const iz_fi = b_ef / Math.sqrt(12);
  const Wy_fi = b_ef * h_ef * h_ef / 6;
  const Wz_fi = h_ef * b_ef * b_ef / 6;
  const W_fi  = inp.momentAxis === 'strong' ? Wy_fi : Wz_fi;

  // Buckling on residual section (independent Lef per axis)
  const lambda_y_fi = iy_fi > 0 ? Lef_y / iy_fi : Infinity;
  const lambda_z_fi = iz_fi > 0 ? Lef_z / iz_fi : Infinity;
  const lambda_rel_y_fi = calcLambdaRel(lambda_y_fi, grade.fc0_k, E0_05_Nmm2);
  const lambda_rel_z_fi = calcLambdaRel(lambda_z_fi, grade.fc0_k, E0_05_Nmm2);
  const kc_y_fi = calcKc(lambda_rel_y_fi, betaC);
  const kc_z_fi = calcKc(lambda_rel_z_fi, betaC);

  // Fire combination load (Nd_fi = etaFi × Nd)
  const etaFi = fireActive ? Math.max(0, Math.min(1, inp.etaFi)) : 0;
  const Nd_fi = etaFi * Nd;
  const Vd_fi = etaFi * Vd;
  const Md_fi = etaFi * Md;

  const sigma_c_fi = A_fi > 0 ? Nd_fi * 1e3 / A_fi : 0;
  const sigma_m_fi = W_fi > 0 && Md_fi > 0 ? Md_fi * 1e6 / W_fi : 0;
  const A_ef_fi    = kcr * A_fi;
  const tau_fi     = A_ef_fi > 0 && Vd_fi > 0 ? 1.5 * Vd_fi * 1e3 / A_ef_fi : 0;

  const sigma_m_y_fi = inp.momentAxis === 'strong' ? sigma_m_fi : 0;
  const sigma_m_z_fi = inp.momentAxis === 'weak'   ? sigma_m_fi : 0;

  const term_c_y_fi  = fc0_d_fi > 0 && kc_y_fi > 0 ? sigma_c_fi / (kc_y_fi * fc0_d_fi) : 0;
  const term_c_z_fi  = fc0_d_fi > 0 && kc_z_fi > 0 ? sigma_c_fi / (kc_z_fi * fc0_d_fi) : 0;
  const term_m_y_fi  = fm_d_fi > 0 ? sigma_m_y_fi / fm_d_fi : 0;
  const term_m_z_fi  = fm_d_fi > 0 ? sigma_m_z_fi / fm_d_fi : 0;
  const util_623_fi  = term_c_y_fi * term_c_y_fi + term_m_y_fi + km * term_m_z_fi;
  const util_624_fi  = term_c_z_fi * term_c_z_fi + km * term_m_y_fi + term_m_z_fi;

  // ── Build check rows ───────────────────────────────────────────────────────
  const checks: TimberColumnCheckRow[] = [];

  checks.push(mkNeutral('elu-header', 'ELU — Estado Límite Último', 'EC5 §6', 'EN 1995-1-1 §6', 'elu'));

  // Shear §6.1.7
  checks.push(mkCheck(
    'shear',
    'Cortante τd ≤ fv,d — Av=kcr·b·h (§6.1.7)',
    tau_d, fv_d,
    `${tau_d.toFixed(2)} N/mm²`,
    `${fv_d.toFixed(2)} N/mm²`,
    'EN 1995-1-1 §6.1.7(2) — Cortante (kcr=0.67, área efectiva)',
    'elu',
  ));

  // §6.3.3 Eq 6.23 — strong axis buckling + bending on selected axis
  const axisLabel = inp.momentAxis === 'strong' ? 'eje fuerte (y)' : 'eje débil (z)';
  const label_623 = `(σc/(kcy·fc0,d))² + σm,d/fm,d ≤ 1 — ${axisLabel}, kcy=${kc_y.toFixed(3)}`;
  checks.push({
    id: 'comb-623',
    description: label_623,
    value: util_623.toFixed(3),
    limit: '1.000',
    utilization: util_623,
    status: toStatus(util_623),
    article: 'EN 1995-1-1 §6.3.3 Eq. 6.23 — Pandeo eje fuerte + flexión',
    group: 'elu',
  });

  // §6.3.3 Eq 6.24 — weak axis buckling + km·bending
  const label_624 = `(σc/(kcz·fc0,d))² + km·σm,d/fm,d ≤ 1 — eje débil (z), kcz=${kc_z.toFixed(3)}`;
  checks.push({
    id: 'comb-624',
    description: label_624,
    value: util_624.toFixed(3),
    limit: '1.000',
    utilization: util_624,
    status: toStatus(util_624),
    article: 'EN 1995-1-1 §6.3.3 Eq. 6.24 — Pandeo eje débil + km·flexión (km=0.7)',
    group: 'elu',
  });

  // ── Fire checks ───────────────────────────────────────────────────────────
  if (fireActive) {
    const sectionLost = b_ef <= 0 || h_ef <= 0;

    checks.push(mkNeutral(
      'fire-header',
      `Fuego — R${t_fire} (${inp.exposedFaces} caras)`,
      `EN 1995-1-2`,
      'EN 1995-1-2 §4.2.2 — Método sección reducida',
      'fire',
    ));

    if (sectionLost) {
      checks.push({
        id: 'fire-section-lost',
        description: 'Sección residual agotada — aumentar dimensiones',
        value: '—',
        limit: '—',
        utilization: Infinity,
        status: 'fail',
        article: 'EN 1995-1-2 §4.2.2',
        group: 'fire',
      });
    } else {
      // Fire shear
      checks.push(mkCheck(
        'fire-shear',
        `Cortante (fuego) τfi ≤ fv,k — sección ${b_ef.toFixed(0)}×${h_ef.toFixed(0)} mm`,
        tau_fi, fv_d_fi,
        `${tau_fi.toFixed(2)} N/mm²`,
        `${fv_d_fi.toFixed(2)} N/mm²`,
        'EN 1995-1-2 §4.2.2 — Cortante en sección residual (γM,fi=1.0)',
        'fire',
      ));

      // Fire combined 6.23
      const label_623_fi = `(σc/(kcy,fi·fc0,k))² + σm,d/fm,k ≤ 1 — kcy,fi=${kc_y_fi.toFixed(3)}`;
      checks.push({
        id: 'fire-comb-623',
        description: label_623_fi,
        value: util_623_fi.toFixed(3),
        limit: '1.000',
        utilization: util_623_fi,
        status: toStatus(util_623_fi),
        article: 'EN 1995-1-2 §4.2.2 + EN 1995-1-1 §6.3.3 Eq. 6.23 — Pandeo+flexión (fuego)',
        group: 'fire',
      });

      // Fire combined 6.24
      const label_624_fi = `(σc/(kcz,fi·fc0,k))² + km·σm,d/fm,k ≤ 1 — kcz,fi=${kc_z_fi.toFixed(3)}`;
      checks.push({
        id: 'fire-comb-624',
        description: label_624_fi,
        value: util_624_fi.toFixed(3),
        limit: '1.000',
        utilization: util_624_fi,
        status: toStatus(util_624_fi),
        article: 'EN 1995-1-2 §4.2.2 + EN 1995-1-1 §6.3.3 Eq. 6.24 — Pandeo+km·flexión (fuego)',
        group: 'fire',
      });
    }
  }

  return {
    valid: true,
    kmod, gammaM, kh, fc0_d, fm_d, fv_d,
    A, iy, iz, betaC, Lef, Lef_y, Lef_z,
    lambda_y, lambda_z, lambda_rel_y, lambda_rel_z,
    kc_y, kc_z, sigma_c, sigma_m, tau_d,
    util_623, util_624,
    fireActive, t_fire, betaN, dchar, def,
    b_ef, h_ef, kc_y_fi, kc_z_fi,
    sigma_c_fi, sigma_m_fi, tau_fi,
    checks,
  };
}
