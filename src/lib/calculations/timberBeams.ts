// Timber Beam calculations — EN 1995-1-1 (EC5) + EN 1995-1-2 (fire)
// Spanish National Annex: UNE-EN 1995-1-1:2016/NA
// All dimensions in mm, forces in N/kN/kNm as noted.
//
// Checks:
//   ELU: Bending (§6.1.6), Shear (§6.1.7), LTB (§6.3.3)
//   ELS: Deflection instantánea (L/300), final (L/250), activa (L/350) §7.2 + NA
//   Fuego: Sección reducida (§4.2.2, EN 1995-1-2)

import { type TimberBeamInputs } from '../../data/defaults';
import {
  getTimberGrade,
  getKmod,
  getKdef,
  getGammaM,
  getBetaN,
  type LoadDurationClass,
  type ServiceClass,
} from '../../data/timberGrades';
import { BEAM_CASES } from './beamCases';

// γG, γQ ULS
const γG = 1.35;
const γQ = 1.50;
// ψ2 — quasi-permanent combination factor for ELS final + fire
const PSI2_TABLE: Record<string, number> = {
  residential: 0.30,
  office:      0.30,
  storage:     0.80,
  roof:        0.00,
  custom:      0.30, // placeholder — overridden by psi2Custom
};

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface TimberCheckRow {
  id: string;
  description: string;
  value: string;
  limit: string;
  utilization: number;
  status: CheckStatus;
  article: string;
  group: 'elu' | 'els' | 'fire';
  neutral?: boolean;
  tag?: string;
}

export interface TimberBeamResult {
  valid: boolean;
  error?: string;
  // Material
  kmod: number;
  kdef: number;
  gammaM: number;
  psi2: number;
  kh: number;       // size factor (EC5 §3.2/§3.3)
  kcr: number;      // shear crack factor (EC5 §6.1.7(2)) — always 0.67
  ksys: number;     // system strength factor (EC5 §6.6) — 1.10 or 1.0
  // Derived design strengths
  fm_d: number;     // N/mm²  (without kh — reference)
  fm_d_kh: number;  // N/mm²  (with kh — governs bending check)
  fv_d: number;     // N/mm²
  // ELU forces
  MEd: number;      // kNm
  VEd: number;      // kN
  // ELU checks
  sigma_m: number;  // N/mm²
  tau_d: number;    // N/mm²
  // LTB
  sigma_m_crit: number;
  lambda_rel_m: number;
  kcrit: number;
  // ELS deflections (mm)
  u_inst: number;
  u_fin: number;
  u_active: number;
  u_inst_lim: number;
  u_fin_lim: number;
  u_active_lim: number;
  // Fire
  fireActive: boolean;
  t_fire: number;           // min
  betaN: number;            // mm/min
  dchar: number;            // mm
  def: number;              // mm effective
  b_ef: number;             // mm residual width
  h_ef: number;             // mm residual height
  MEd_fi: number;           // kNm fire combination
  VEd_fi: number;           // kN
  sigma_m_fi: number;       // N/mm²
  tau_fi: number;           // N/mm²
  fm_k_fi: number;          // N/mm² = fm_k (γM,fi = 1.0)
  fv_k_fi: number;          // N/mm²
  // Results
  checks: TimberCheckRow[];
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
  group: TimberCheckRow['group'],
): TimberCheckRow {
  const util = capacity > 0 ? demand / capacity : Infinity;
  return { id, description, value: valueStr, limit: limitStr, utilization: util, status: toStatus(util), article, group };
}

function mkNeutral(
  id: string,
  description: string,
  tag: string,
  article: string,
  group: TimberCheckRow['group'],
): TimberCheckRow {
  return { id, description, value: '', limit: '', utilization: 0, status: 'ok', article, group, neutral: true, tag };
}

function invalidResult(error: string): TimberBeamResult {
  return {
    valid: false, error,
    kmod: 0, kdef: 0, gammaM: 0, psi2: 0, kh: 1.0, kcr: 0.67, ksys: 1.0,
    fm_d: 0, fm_d_kh: 0, fv_d: 0,
    MEd: 0, VEd: 0, sigma_m: 0, tau_d: 0,
    sigma_m_crit: 0, lambda_rel_m: 0, kcrit: 0,
    u_inst: 0, u_fin: 0, u_active: 0,
    u_inst_lim: 0, u_fin_lim: 0, u_active_lim: 0,
    fireActive: false, t_fire: 0, betaN: 0, dchar: 0, def: 0,
    b_ef: 0, h_ef: 0, MEd_fi: 0, VEd_fi: 0,
    sigma_m_fi: 0, tau_fi: 0, fm_k_fi: 0, fv_k_fi: 0,
    checks: [],
  };
}

export function calcTimberBeam(inp: TimberBeamInputs): TimberBeamResult {
  const grade = getTimberGrade(inp.gradeId);
  if (!grade) return invalidResult('Clase resistente no encontrada');
  if (inp.b <= 0 || inp.h <= 0) return invalidResult('Dimensiones inválidas');
  if (inp.L <= 0) return invalidResult('Luz inválida');
  if (inp.gk < 0 || inp.qk < 0) return invalidResult('Cargas negativas no permitidas');
  if (inp.b > inp.h) return invalidResult('La sección debe tener h ≥ b (viga, no pilar)');

  const { b, h, L } = inp;
  const bc = inp.beamType;

  // ── Material parameters ────────────────────────────────────────────────────
  const kmod   = getKmod(inp.loadDuration as LoadDurationClass, inp.serviceClass as ServiceClass);
  const kdef   = getKdef(grade.type, inp.serviceClass as ServiceClass);
  const gammaM = getGammaM(grade.type);
  const psi2   = inp.loadType === 'custom' ? inp.psi2Custom : (PSI2_TABLE[inp.loadType] ?? 0.30);

  const fm_d = kmod * grade.fm_k / gammaM;   // N/mm²  (without kh — kept for reference)
  const fv_d = kmod * grade.fv_k / gammaM;   // N/mm²

  // ── Section properties ────────────────────────────────────────────────────
  const A = b * h;                    // mm²
  const W = b * h * h / 6;           // mm³
  const I = b * h * h * h / 12;      // mm⁴

  // ── ELU — combined design load ────────────────────────────────────────────
  const w_elu = γG * inp.gk + γQ * inp.qk;   // kN/m
  const L_m   = L;                            // m (already)
  const MEd   = BEAM_CASES[bc].MEd(w_elu, L_m);   // kNm
  const VEd   = BEAM_CASES[bc].VEd(w_elu, L_m);   // kN

  // ── kh — size factor (EC5 §3.2 sawn / §3.3 glulam) ──────────────────────
  // For sawn timber: if h < 150mm → kh = min((150/h)^0.2, 1.3). Else kh=1.0.
  // For glulam:      if h < 600mm → kh = min((600/h)^0.1, 1.1). Else kh=1.0.
  // Applied to fm,k before dividing by γM.
  let kh: number;
  if (grade.type === 'glulam') {
    kh = h < 600 ? Math.min(Math.pow(600 / h, 0.1), 1.1) : 1.0;
  } else {
    kh = h < 150 ? Math.min(Math.pow(150 / h, 0.2), 1.3) : 1.0;
  }
  const fm_d_kh = kmod * kh * grade.fm_k / gammaM;   // N/mm² — with size factor

  // ── ksys — system strength factor (EC5 §6.6) ─────────────────────────────
  // Applies when ≥ 4 parallel members share load via a distributing element
  // (floor/roof decking). ksys = 1.10. Only bending & axial — NOT shear, ELS, fire.
  const ksys = inp.isSystem ? 1.10 : 1.0;
  const fm_d_sys = ksys * fm_d_kh;   // N/mm² — effective bending capacity with ksys

  // ── ELU — Flexión (EC5 §6.1.6) ───────────────────────────────────────────
  const sigma_m = MEd * 1e6 / W;   // N/mm²  (MEd kNm → Nmm)

  // ── kcr — crack factor for shear area (EC5 §6.1.7(2)) ────────────────────
  // Av_ef = kcr × b × h (rectangular section).
  // kcr = 0.67 for solid timber and glulam (EN 1995-1-1 §6.1.7(2)).
  // Without this the shear capacity is 1/0.67 ≈ 1.5× overestimated — unsafe.
  const kcr   = 0.67;
  const A_ef  = kcr * A;   // mm² — effective shear area

  // ── ELU — Cortante (EC5 §6.1.7) ──────────────────────────────────────────
  // τd = 1.5 × VEd / A_ef ≤ fv,d
  const tau_d = 1.5 * VEd * 1e3 / A_ef;   // N/mm²

  // ── ELU — LTB (EC5 §6.3.3) — rectangular section ─────────────────────────
  // Effective length Lef: conservative values per EC5 Table 6.1
  const Lef_m = bc === 'cantilever' ? 2.0 * L_m : L_m;   // m
  const Lef   = Lef_m * 1000;                              // mm

  // Critical bending stress (rectangular section, major axis bending):
  // σm,crit = 0.78 × b² × E0,05 / (h × Lef)
  const E0_05_Nmm2 = grade.E0_05 * 1000;   // kN/mm² → N/mm²
  const sigma_m_crit = 0.78 * b * b * E0_05_Nmm2 / (h * Lef);

  // Relative slenderness for bending
  const lambda_rel_m = Math.sqrt(grade.fm_k / sigma_m_crit);

  let kcrit: number;
  if (lambda_rel_m <= 0.75) {
    kcrit = 1.0;
  } else if (lambda_rel_m <= 1.40) {
    kcrit = 1.56 - 0.75 * lambda_rel_m;
  } else {
    kcrit = 1.0 / (lambda_rel_m * lambda_rel_m);
  }

  const fm_d_eff = kcrit * fm_d_sys;   // effective bending strength after LTB (kh + ksys + kcrit)

  // ── ELS — Deflections (EC5 §7.2 + Spanish NA) ────────────────────────────
  // E0_mean in kN/mm² → N/mm²
  const E_mm2 = grade.E0_mean * 1000;   // N/mm²
  const L_mm  = L_m * 1000;             // mm

  const k_defl = BEAM_CASES[bc].k_defl;

  // Instantaneous deflections from permanent and variable loads separately
  // w[N/mm] = w[kN/m] × 1000 / 1000 = w[kN/m] numerically (units cancel)
  const u_inst_G2 = k_defl * inp.gk * L_mm ** 4 / (E_mm2 * I);
  const u_inst_Q  = k_defl * (inp.qk * 1.0) * L_mm ** 4 / (E_mm2 * I);
  const u_inst    = u_inst_G2 + u_inst_Q;

  // Long-term (final) deflections
  const u_fin_G = u_inst_G2 * (1 + kdef);
  const u_fin_Q = u_inst_Q  * (1 + psi2 * kdef);
  const u_fin   = u_fin_G + u_fin_Q;

  // Active deflection (variable part only, long-term) — governs over tabiquería
  const u_active = u_inst_Q * (1 + psi2 * kdef);

  // Admissible limits — Spanish NA NA.7.2.2
  const u_inst_lim   = L_mm / 300;
  const u_fin_lim    = L_mm / 250;
  const u_active_lim = L_mm / 350;

  // ── FIRE — EN 1995-1-2 (sección reducida) ────────────────────────────────
  const fireActive = inp.fireResistance !== 'R0';
  const t_fire = fireActive ? parseInt(inp.fireResistance.slice(1), 10) : 0;
  const betaN  = getBetaN(grade.subtype, grade.type);
  const d0     = 7;   // mm — zero-strength layer (EN 1995-1-2 §3.4.3(4))
  const dchar  = betaN * t_fire;                // mm — char depth
  const def    = fireActive ? dchar + d0 : 0;  // mm — effective penetration

  // Residual section
  const b_ef = fireActive ? Math.max(b - 2 * def, 0) : b;
  const h_ef = fireActive
    ? (inp.exposedFaces === 4 ? Math.max(h - 2 * def, 0) : Math.max(h - def, 0))
    : h;

  const A_fi = b_ef * h_ef;
  const W_fi = b_ef * h_ef * h_ef / 6;

  // Fire combination loads (EN 1995-1-2 §4.1, γG,fi = γQ,fi = 1.0)
  const w_fi  = inp.gk + psi2 * inp.qk;   // kN/m
  const MEd_fi = fireActive ? BEAM_CASES[bc].MEd(w_fi, L_m) : 0;
  const VEd_fi = fireActive ? BEAM_CASES[bc].VEd(w_fi, L_m) : 0;

  // Fire design strengths: kmod,fi = 1.0, γM,fi = 1.0
  const fm_k_fi = grade.fm_k;
  const fv_k_fi = grade.fv_k;

  const A_fi_ef    = kcr * A_fi;   // effective shear area in fire section
  const sigma_m_fi = (fireActive && W_fi > 0)     ? MEd_fi * 1e6 / W_fi : 0;
  const tau_fi     = (fireActive && A_fi_ef > 0)  ? 1.5 * VEd_fi * 1e3 / A_fi_ef : 0;

  // ── Build check rows ───────────────────────────────────────────────────────
  const checks: TimberCheckRow[] = [];

  // — ELU header —
  checks.push(mkNeutral('elu-header', 'ELU — Estado Límite Último', 'EC5 §6', 'EN 1995-1-1 §6', 'elu'));

  // Bending (uses fm_d_sys = ksys × kmod×kh×fm_k/γM)
  const khLabel   = kh   > 1.0 ? `·kh=${kh.toFixed(3)}`   : '';
  const ksysLabel = ksys > 1.0 ? `·ksys=${ksys.toFixed(2)}` : '';
  checks.push(mkCheck(
    'bending',
    `Flexión σm,d ≤ kmod${khLabel}${ksysLabel}·fm,k/γM (§6.1.6)`,
    sigma_m, fm_d_sys,
    `${sigma_m.toFixed(2)} N/mm²`,
    `${fm_d_sys.toFixed(2)} N/mm²`,
    'EN 1995-1-1 §6.1.6 — Resistencia a flexión (con factor de tamaño kh y sistema ksys)',
    'elu',
  ));

  // Shear
  checks.push(mkCheck(
    'shear',
    'Cortante τd ≤ fv,d — Av=kcr·b·h (§6.1.7)',
    tau_d, fv_d,
    `${tau_d.toFixed(2)} N/mm²`,
    `${fv_d.toFixed(2)} N/mm²`,
    'EN 1995-1-1 §6.1.7(2) — Cortante (kcr=0.67, área efectiva)',
    'elu',
  ));

  // LTB
  const ltbUtil = fm_d_eff > 0 ? sigma_m / fm_d_eff : Infinity;
  const kcritLabel = lambda_rel_m <= 0.75
    ? `kcrit=1.0 (λrel,m=${lambda_rel_m.toFixed(2)} ≤ 0.75)`
    : `kcrit=${kcrit.toFixed(3)} (λrel,m=${lambda_rel_m.toFixed(2)})`;
  checks.push({
    id: 'ltb',
    description: `Pandeo lateral σm,d ≤ kcrit·fm,d (§6.3.3) — ${kcritLabel}`,
    value: `${sigma_m.toFixed(2)} N/mm²`,
    limit: `${fm_d_eff.toFixed(2)} N/mm²`,
    utilization: ltbUtil,
    status: toStatus(ltbUtil),
    article: 'EN 1995-1-1 §6.3.3 — Pandeo lateral (vuelco lateral)',
    group: 'elu',
  });

  // — ELS header —
  checks.push(mkNeutral('els-header', 'ELS — Estado Límite de Servicio', 'EC5 §7.2', 'EN 1995-1-1 §7.2 + NA España', 'els'));

  checks.push(mkCheck(
    'defl-inst',
    `Flecha instantánea u_inst ≤ L/300`,
    u_inst, u_inst_lim,
    `${u_inst.toFixed(1)} mm`,
    `${u_inst_lim.toFixed(1)} mm  (L/300)`,
    'EN 1995-1-1 §7.2 / NA España NA.7.2.2',
    'els',
  ));

  checks.push(mkCheck(
    'defl-fin',
    `Flecha final u_fin ≤ L/250`,
    u_fin, u_fin_lim,
    `${u_fin.toFixed(1)} mm`,
    `${u_fin_lim.toFixed(1)} mm  (L/250)`,
    'EN 1995-1-1 §7.2 / NA España NA.7.2.2',
    'els',
  ));

  checks.push(mkCheck(
    'defl-active',
    `Flecha activa u_active ≤ L/350`,
    u_active, u_active_lim,
    `${u_active.toFixed(1)} mm`,
    `${u_active_lim.toFixed(1)} mm  (L/350)`,
    'EN 1995-1-1 §7.2(2) / NA España — flecha activa (tabiquería)',
    'els',
  ));

  // — FIRE checks —
  if (fireActive) {
    checks.push(mkNeutral(
      'fire-header',
      `Incendio ${inp.fireResistance} — Sección reducida`,
      `def=${def.toFixed(1)} mm`,
      'EN 1995-1-2 §4.2.2',
      'fire',
    ));

    if (W_fi > 0) {
      checks.push(mkCheck(
        'fire-bending',
        `Incendio — Flexión σm,fi ≤ fm,k`,
        sigma_m_fi, fm_k_fi,
        `${sigma_m_fi.toFixed(2)} N/mm²`,
        `${fm_k_fi.toFixed(2)} N/mm²`,
        'EN 1995-1-2 §4.2.2 — Flexión en incendio (γM,fi=1.0)',
        'fire',
      ));

      checks.push(mkCheck(
        'fire-shear',
        `Incendio — Cortante τfi ≤ fv,k`,
        tau_fi, fv_k_fi,
        `${tau_fi.toFixed(2)} N/mm²`,
        `${fv_k_fi.toFixed(2)} N/mm²`,
        'EN 1995-1-2 §4.2.2 — Cortante en incendio (γM,fi=1.0)',
        'fire',
      ));
    } else {
      checks.push(mkNeutral(
        'fire-section-lost',
        'Sección residual nula — sección insuficiente para el tiempo de exposición',
        'INCUMPLE',
        'EN 1995-1-2 §4.2.2',
        'fire',
      ));
    }
  }

  return {
    valid: true,
    kmod, kdef, gammaM, psi2, kh, kcr, ksys,
    fm_d, fm_d_kh, fv_d,
    MEd, VEd,
    sigma_m, tau_d,
    sigma_m_crit, lambda_rel_m, kcrit,
    u_inst, u_fin, u_active,
    u_inst_lim, u_fin_lim, u_active_lim,
    fireActive, t_fire, betaN, dchar, def,
    b_ef, h_ef,
    MEd_fi, VEd_fi,
    sigma_m_fi, tau_fi,
    fm_k_fi, fv_k_fi,
    checks,
  };
}
