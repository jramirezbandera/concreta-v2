// Timber Beam calculations — EN 1995-1-1 (EC5) + EN 1995-1-2 (fire)
// Spanish National Annex: UNE-EN 1995-1-1:2016/NA
// All dimensions in mm, forces in N/kN/kNm as noted.
//
// Checks:
//   ELU: Bending (§6.1.6), Shear (§6.1.7), LTB (§6.3.3)
//   ELS: CTE DB-SE 4.3.3 — integridad (activa, L/500-300 según tabiquería),
//        confort (sobrecarga inst., L/350), apariencia (final, L/300)
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
  // ELS deflections (mm) — CTE DB-SE 4.3.3
  u_inst: number;        // instantánea total G+Q (informativa)
  u_fin: number;         // final total (apariencia, comb. característica)
  u_active: number;      // ACTIVA = u_G·kdef + u_Q·(1+ψ2·kdef) (integridad)
  u_confort: number;     // instantánea de la sobrecarga (confort)
  u_inst_lim: number;
  u_fin_lim: number;
  u_active_lim: number;
  u_confort_lim: number;
  // ELU combination bookkeeping
  permGoverns: boolean;  // la combinación solo-permanente gobierna (EC5 §3.1.3(2))
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
  kfi: number;              // 1.25 aserrada / 1.15 glulam (EN 1995-1-2 §2.3)
  kcrit_fi: number;         // LTB en fuego (1.0 si arriostrada / 3 caras)
  fm_k_fi: number;          // N/mm² = kfi·fm_k (γM,fi = 1.0)
  fv_k_fi: number;          // N/mm² = kfi·fv_k
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
    u_inst: 0, u_fin: 0, u_active: 0, u_confort: 0,
    u_inst_lim: 0, u_fin_lim: 0, u_active_lim: 0, u_confort_lim: 0,
    permGoverns: false,
    fireActive: false, t_fire: 0, betaN: 0, dchar: 0, def: 0,
    b_ef: 0, h_ef: 0, MEd_fi: 0, VEd_fi: 0,
    sigma_m_fi: 0, tau_fi: 0, kfi: 0, kcrit_fi: 1, fm_k_fi: 0, fv_k_fi: 0,
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
  const kmod_user = getKmod(inp.loadDuration as LoadDurationClass, inp.serviceClass as ServiceClass);
  const kdef   = getKdef(grade.type, inp.serviceClass as ServiceClass);
  const gammaM = getGammaM(grade.type);
  const psi2   = inp.loadType === 'custom' ? inp.psi2Custom : (PSI2_TABLE[inp.loadType] ?? 0.30);

  // ── ELU — combinaciones (EC5 §3.1.3(2), fix auditoría #113) ───────────────
  // Cada combinación se verifica con el kmod de su acción más corta. Además
  // de la combinación G+Q del usuario hay que comprobar la SOLO-PERMANENTE
  // (1.35·gk con kmod permanente): gobierna cuando qk < ~0.3·gk. Como demanda
  // ∝ w y capacidad ∝ kmod, gobierna la combinación con mayor w/kmod.
  const kmod_perm = getKmod('permanent', inp.serviceClass as ServiceClass);
  const w_main = γG * inp.gk + γQ * inp.qk;   // kN/m
  const w_perm = γG * inp.gk;                  // kN/m
  const permGoverns = w_perm / kmod_perm > w_main / kmod_user;
  const w_elu = permGoverns ? w_perm : w_main;
  const kmod  = permGoverns ? kmod_perm : kmod_user;

  const fm_d = kmod * grade.fm_k / gammaM;   // N/mm²  (without kh — kept for reference)
  const fv_d = kmod * grade.fv_k / gammaM;   // N/mm²

  // ── Section properties ────────────────────────────────────────────────────
  const A = b * h;                    // mm²
  const W = b * h * h / 6;           // mm³
  const I = b * h * h * h / 12;      // mm⁴

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
  // Lef per EC5 Tabla 6.1 CON la corrección de carga en el borde COMPRIMIDO
  // (+2h, el caso físico habitual de UDL sobre el cordón superior): ss/ff/fp
  // UDL → 0.9·L + 2h; ménsula UDL → 0.5·L + 2h. Antes se usaba 1.0·L sin +2h
  // (no conservador para L < 20h) y 2.0·L en ménsula sin respaldo en la tabla
  // (fix auditoría #112).
  const lefFactor = bc === 'cantilever' ? 0.5 : 0.9;
  const Lef = lefFactor * L_m * 1000 + 2 * h;   // mm

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

  // ── ELS — Flechas (CTE DB-SE 4.3.3 — fixes auditoría #109, #110, #114) ───
  // Flexión: δ = k_defl · Mser · L² / (E·I)  (contrato BEAM_CASES.k_defl).
  // Cortante: δs = k_shear · w · L² / (G·A) con κ=1.2 incluido — en madera
  // E/G ≈ 16 y vale un 6-10% de la flecha (antes omitida, #114).
  const E_mm2 = grade.E0_mean * 1000;   // N/mm²
  const G_mm2 = grade.G_mean * 1000;    // N/mm²
  const L_mm  = L_m * 1000;             // mm

  const k_defl  = BEAM_CASES[bc].k_defl;
  const k_shear = BEAM_CASES[bc].k_shear;

  // Service-level (characteristic) moments from gk and qk separately
  const Mser_G = BEAM_CASES[bc].MEd(inp.gk, L_m);   // kNm
  const Mser_Q = BEAM_CASES[bc].MEd(inp.qk, L_m);   // kNm

  // Instantaneous deflections (flexión + cortante) — w kN/m = N/mm
  const u_inst_G2 = k_defl * Mser_G * 1e6 * L_mm ** 2 / (E_mm2 * I)
                  + k_shear * inp.gk * L_mm ** 2 / (G_mm2 * A);
  const u_inst_Q  = k_defl * Mser_Q * 1e6 * L_mm ** 2 / (E_mm2 * I)
                  + k_shear * inp.qk * L_mm ** 2 / (G_mm2 * A);
  const u_inst    = u_inst_G2 + u_inst_Q;

  // Final total (combinación característica con fluencia EC5 §2.2.3)
  const u_fin_G = u_inst_G2 * (1 + kdef);
  const u_fin_Q = u_inst_Q  * (1 + psi2 * kdef);
  const u_fin   = u_fin_G + u_fin_Q;

  // INTEGRIDAD — flecha ACTIVA: la producida después de construir los
  // elementos frágiles = u_fin − u_inst,G = u_G·kdef + u_Q·(1+ψ2·kdef).
  // Antes se omitía la fluencia diferida de G (u_G·kdef — hasta el 83% del
  // valor con kdef=2.0), fix auditoría #109.
  const u_active = u_inst_G2 * kdef + u_inst_Q * (1 + psi2 * kdef);

  // CONFORT — sobrecarga característica, solo flecha instantánea
  const u_confort = u_inst_Q;

  // Límites CTE DB-SE 4.3.3 (fix #110 — antes límites mezclados citando un
  // «NA España» inexistente): integridad según tabiquería (L/500 frágiles,
  // L/400 ordinarios, L/300 sin tabiques); confort L/350; apariencia L/300
  // (el check de apariencia usa u_fin de la combinación característica,
  // ligeramente conservador frente a la casi permanente del CTE).
  const integDenom = inp.partitionType === 'fragile' ? 500
                   : inp.partitionType === 'none'    ? 300
                   : 400;
  const u_active_lim  = L_mm / integDenom;
  const u_confort_lim = L_mm / 350;
  const u_fin_lim     = L_mm / 300;
  const u_inst_lim    = L_mm / 300;   // informativo (no es check CTE)

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

  // Fire design strengths: fd,fi = kfi·fk (percentil 20%) con kmod,fi = 1.0 y
  // γM,fi = 1.0 — EN 1995-1-2 §2.3/Tabla 2.1: kfi = 1.25 aserrada / 1.15
  // glulam. Antes se usaba fk directamente (−13/−20% de capacidad sin
  // documentar), fix auditoría #117.
  const kfi = grade.type === 'glulam' ? 1.15 : 1.25;
  const fm_k_fi = kfi * grade.fm_k;
  const fv_k_fi = kfi * grade.fv_k;

  const A_fi_ef    = kcr * A_fi;   // effective shear area in fire section
  const sigma_m_fi = (fireActive && W_fi > 0)     ? MEd_fi * 1e6 / W_fi : 0;
  const tau_fi     = (fireActive && A_fi_ef > 0)  ? 1.5 * VEd_fi * 1e3 / A_fi_ef : 0;

  // LTB en situación de incendio (fix auditoría #111): la sección residual es
  // muy esbelta (R60 con defaults: 40×345, h/b≈8.6). Con 3 caras expuestas se
  // presume tablero superior que arriostra el borde comprimido (kcrit,fi=1);
  // con 4 caras expuestas no hay arriostramiento y §6.3.3 aplica con la
  // geometría residual.
  let kcrit_fi = 1.0;
  if (fireActive && inp.exposedFaces === 4 && b_ef > 0 && h_ef > 0) {
    const sigma_m_crit_fi = 0.78 * b_ef * b_ef * E0_05_Nmm2 / (h_ef * Lef);
    const lambda_rel_fi = Math.sqrt(fm_k_fi / sigma_m_crit_fi);
    kcrit_fi = lambda_rel_fi <= 0.75 ? 1.0
             : lambda_rel_fi <= 1.40 ? 1.56 - 0.75 * lambda_rel_fi
             : 1.0 / (lambda_rel_fi * lambda_rel_fi);
  }

  // ── Build check rows ───────────────────────────────────────────────────────
  const checks: TimberCheckRow[] = [];

  // — ELU header —
  checks.push(mkNeutral('elu-header', 'ELU — Estado Límite Último', 'EC5 §6', 'EN 1995-1-1 §6', 'elu'));

  // Combinación que gobierna (fix #113)
  if (permGoverns) {
    checks.push(mkNeutral(
      'elu-perm-combo',
      `Gobierna la combinación solo-permanente: 1.35·gk con kmod=${kmod.toFixed(2)} (EC5 §3.1.3(2))`,
      'G SOLO',
      'EN 1995-1-1 §3.1.3(2)',
      'elu',
    ));
  }

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

  // — ELS header — límites del CTE DB-SE 4.3.3 (fix #110: España no tiene
  // Anejo Nacional publicado a EC5; las flechas van por DB-SE)
  checks.push(mkNeutral('els-header', 'ELS — Estado Límite de Servicio', 'CTE DB-SE 4.3.3', 'CTE DB-SE 4.3.3 + EC5 §7.2 (fluencia)', 'els'));

  const partLabel = inp.partitionType === 'fragile' ? 'tabiques frágiles'
                  : inp.partitionType === 'none'    ? 'sin tabiques'
                  : 'tabiques ordinarios';
  checks.push(mkCheck(
    'defl-active',
    `Integridad — flecha activa (u_G·kdef + u_Q·(1+ψ2·kdef)) ≤ L/${integDenom} (${partLabel})`,
    u_active, u_active_lim,
    `${u_active.toFixed(1)} mm`,
    `${u_active_lim.toFixed(1)} mm  (L/${integDenom})`,
    'CTE DB-SE 4.3.3.1.a — integridad de elementos constructivos',
    'els',
  ));

  checks.push(mkCheck(
    'defl-confort',
    `Confort — sobrecarga instantánea u_Q ≤ L/350`,
    u_confort, u_confort_lim,
    `${u_confort.toFixed(1)} mm`,
    `${u_confort_lim.toFixed(1)} mm  (L/350)`,
    'CTE DB-SE 4.3.3.1.b — confort de usuarios',
    'els',
  ));

  checks.push(mkCheck(
    'defl-fin',
    `Apariencia — flecha final u_fin ≤ L/300`,
    u_fin, u_fin_lim,
    `${u_fin.toFixed(1)} mm`,
    `${u_fin_lim.toFixed(1)} mm  (L/300)`,
    'CTE DB-SE 4.3.3.1.c — apariencia (comb. característica con fluencia, lado seguro)',
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
        `Incendio — Flexión σm,fi ≤ kfi·fm,k (kfi=${kfi.toFixed(2)})`,
        sigma_m_fi, fm_k_fi,
        `${sigma_m_fi.toFixed(2)} N/mm²`,
        `${fm_k_fi.toFixed(2)} N/mm²`,
        'EN 1995-1-2 §4.2.2 + §2.3 — Flexión en incendio (f20 = kfi·fk, γM,fi=1.0)',
        'fire',
      ));

      checks.push(mkCheck(
        'fire-shear',
        `Incendio — Cortante τfi ≤ kfi·fv,k`,
        tau_fi, fv_k_fi,
        `${tau_fi.toFixed(2)} N/mm²`,
        `${fv_k_fi.toFixed(2)} N/mm²`,
        'EN 1995-1-2 §4.2.2 + §2.3 — Cortante en incendio (γM,fi=1.0)',
        'fire',
      ));

      // LTB en fuego — solo con 4 caras expuestas (sin tablero que arriostre);
      // la sección residual es muy esbelta (fix auditoría #111)
      if (inp.exposedFaces === 4) {
        const fm_fi_eff = kcrit_fi * fm_k_fi;
        checks.push(mkCheck(
          'fire-ltb',
          `Incendio — Pandeo lateral σm,fi ≤ kcrit,fi·kfi·fm,k (kcrit,fi=${kcrit_fi.toFixed(2)}, sección residual ${b_ef.toFixed(0)}×${h_ef.toFixed(0)})`,
          sigma_m_fi, fm_fi_eff,
          `${sigma_m_fi.toFixed(2)} N/mm²`,
          `${fm_fi_eff.toFixed(2)} N/mm²`,
          'EN 1995-1-2 §4.2.2 + EN 1995-1-1 §6.3.3 — LTB de la sección residual (4 caras, sin arriostrar)',
          'fire',
        ));
      }
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

  // Límites declarados del módulo (fix auditoría #115/#116): visibles en UI
  // y PDF para que el gap de alcance no sea silencioso.
  checks.push(mkNeutral(
    'scope-note',
    'No incluido: compresión perpendicular en apoyos (EC5 §6.1.5) ni vibración de forjados (§7.3) — verificar aparte si aplican',
    'LÍMITES',
    'EN 1995-1-1 §6.1.5 / §7.3',
    'els',
  ));

  return {
    valid: true,
    kmod, kdef, gammaM, psi2, kh, kcr, ksys,
    fm_d, fm_d_kh, fv_d,
    MEd, VEd,
    sigma_m, tau_d,
    sigma_m_crit, lambda_rel_m, kcrit,
    u_inst, u_fin, u_active, u_confort,
    u_inst_lim, u_fin_lim, u_active_lim, u_confort_lim,
    permGoverns,
    fireActive, t_fire, betaN, dchar, def,
    b_ef, h_ef,
    MEd_fi, VEd_fi,
    sigma_m_fi, tau_fi,
    kfi, kcrit_fi, fm_k_fi, fv_k_fi,
    checks,
  };
}
