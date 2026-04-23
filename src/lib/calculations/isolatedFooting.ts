// Isolated footing — sigma_adm input + stress distribution classification
//
// Loads: single set {N, Mx, My, H} + global toggle mayoradas/sin_mayorar + γ.
//   SLS  → bearing & distribution
//   ELU  → overturning, sliding, armado
//
// Distribution classification (per ex/B/6, ey/L/6):
//   trapezoidal           : ex ≤ B/6 AND ey ≤ L/6  (closed form)
//   bitriangular_uniaxial : exactly one excentr beyond core  (closed form Meyerhof)
//   bitriangular_biaxial  : both beyond core         (Newton-Raphson)
//   overturning_fail      : ex ≥ B/2 OR ey ≥ L/2 OR NR diverges
//
// Armado gating (CE art. 55):
//   rigid    (v_max ≤ 2h) → strut-tie active, bending/shear/punching neutral
//   flexible (v_max > 2h) → strut-tie neutral, bending/shear/punching active

import { type IsolatedFootingInputs } from '../../data/defaults';
import { getConcrete } from '../../data/materials';
import { getBarArea } from '../../data/rebar';
import { type CheckRow, makeCheck, makeCheckQty, makeCheckNeutral, toStatus } from './types';

export type { CheckRow } from './types';

export type DistributionType =
  | 'trapezoidal'
  | 'bitriangular_uniaxial'
  | 'bitriangular_biaxial'
  | 'overturning_fail';

export interface IsolatedFootingResult {
  valid: boolean;
  error?: string;

  // ── Cargas derivadas ──
  N_sls: number; Mx_sls: number; My_sls: number; H_sls: number;
  N_elu: number; Mx_elu: number; My_elu: number; H_elu: number;

  // ── Excentricidad SLS ──
  ex_sls: number; ey_sls: number;
  ex_over_B6: number;
  ey_over_L6: number;

  // ── Distribución ──
  distributionType: DistributionType;
  sigma_max: number;
  sigma_min: number;
  loaded_area_fraction: number;
  bearing_check: { utilization: number; status: 'ok' | 'warn' | 'fail' };

  // ── Estabilidad ──
  W_footing: number; W_soil: number;
  M_stab_x: number; M_dest_x: number; FS_overturn_x: number;
  M_stab_y: number; M_dest_y: number; FS_overturn_y: number;
  Rd_slide: number; FS_sliding: number;

  // ── ELU armado ──
  sigma_Ed_uniform: number;
  d_x: number; d_y: number;
  isRigid: boolean; v_max: number;

  // ── Cantilevers / spans (mm) ──
  ax: number; ay: number;
  ell_x: number; ell_y: number;

  // ── Bending / strut-tie ──
  MEd_x: number; MEd_y: number;
  Td_x: number; Td_y: number;
  As_req_x: number; As_req_y: number;
  As_min_x: number; As_min_y: number;
  As_adopted_x: number; As_adopted_y: number;
  As_prov_x: number; As_prov_y: number;

  // ── Shear ──
  VEd_x: number; VEd_y: number;
  VRd_x: number; VRd_y: number;

  // ── Punching ──
  d_avg: number; u1: number;
  vEd_punch: number; vRdc_punch: number;

  checks: CheckRow[];
}

const GAMMA_C_RC = 25;       // kN/m³ — reinforced concrete unit weight
const FS_VUELCO_MIN = 1.5;   // CTE DB-SE-C §4.4.2
const FS_SLIDE_MIN = 1.5;    // CTE DB-SE-C §4.4.3
const NR_MAX_ITER = 50;
const NR_TOL = 0.005;        // dimensionless residuals (/N) tolerance

const EMPTY: IsolatedFootingResult = {
  valid: false,
  N_sls: 0, Mx_sls: 0, My_sls: 0, H_sls: 0,
  N_elu: 0, Mx_elu: 0, My_elu: 0, H_elu: 0,
  ex_sls: 0, ey_sls: 0, ex_over_B6: 0, ey_over_L6: 0,
  distributionType: 'trapezoidal',
  sigma_max: 0, sigma_min: 0, loaded_area_fraction: 0,
  bearing_check: { utilization: 0, status: 'ok' },
  W_footing: 0, W_soil: 0,
  M_stab_x: 0, M_dest_x: 0, FS_overturn_x: 0,
  M_stab_y: 0, M_dest_y: 0, FS_overturn_y: 0,
  Rd_slide: 0, FS_sliding: 0,
  sigma_Ed_uniform: 0, d_x: 0, d_y: 0, isRigid: false, v_max: 0,
  ax: 0, ay: 0, ell_x: 0, ell_y: 0,
  MEd_x: 0, MEd_y: 0, Td_x: 0, Td_y: 0,
  As_req_x: 0, As_req_y: 0, As_min_x: 0, As_min_y: 0,
  As_adopted_x: 0, As_adopted_y: 0, As_prov_x: 0, As_prov_y: 0,
  VEd_x: 0, VEd_y: 0, VRd_x: 0, VRd_y: 0,
  d_avg: 0, u1: 0, vEd_punch: 0, vRdc_punch: 0,
  checks: [],
};

function invalid(msg: string): IsolatedFootingResult {
  return { ...EMPTY, error: msg };
}

// ── Derive SLS / ELU loads from single input set + toggle ────────────────────
function deriveLoads(inp: IsolatedFootingInputs) {
  const f = inp.loadFactor;
  const factored = inp.loadsAreFactored;
  if (factored) {
    return {
      N_sls: inp.N / f, Mx_sls: inp.Mx / f, My_sls: inp.My / f, H_sls: inp.H / f,
      N_elu: inp.N,     Mx_elu: inp.Mx,     My_elu: inp.My,     H_elu: inp.H,
    };
  }
  return {
    N_sls: inp.N,     Mx_sls: inp.Mx,     My_sls: inp.My,     H_sls: inp.H,
    N_elu: inp.N * f, Mx_elu: inp.Mx * f, My_elu: inp.My * f, H_elu: inp.H * f,
  };
}

// ── Classify distribution from ex, ey vs B/6, L/6 ────────────────────────────
function classifyDistribution(ex: number, ey: number, B: number, L: number): DistributionType {
  if (ex >= B / 2 || ey >= L / 2) return 'overturning_fail';
  const overX = ex > B / 6;
  const overY = ey > L / 6;
  if (!overX && !overY) return 'trapezoidal';
  if (overX && overY)   return 'bitriangular_biaxial';
  return 'bitriangular_uniaxial';
}

// ── Newton-Raphson for biaxial bitriangular ──────────────────────────────────
// Linear pressure: σ(x, y) = a + bx·x + by·y over the loaded region (σ ≥ 0).
// Three unknowns (a, bx, by), three equilibrium residuals (N, Mx, My).
// Loaded region = polygon where σ ≥ 0; integrals computed by adaptive sampling
// over a grid (16×16 cells → ~256 evaluations per residual, fast).
//
// Returns sigma_max, sigma_min (=0 by definition for partial contact),
// loaded_area_fraction, or null on divergence.
interface BiaxialNRResult {
  sigma_max: number;
  loaded_area_fraction: number;
}

function solveBiaxialNR(
  N: number, Mx_app: number, My_app: number,
  B: number, L: number,
): BiaxialNRResult | null {
  // Coordinates: x ∈ [-B/2, B/2] (along B), y ∈ [-L/2, L/2] (along L).
  // Mx applied = moment about x-axis (positive y-side compressed)
  // My applied = moment about y-axis (positive x-side compressed)
  // Sign of moments collapsed to absolute since we already know the high-corner.
  // Place high corner at (+B/2, +L/2) by orienting eccentricities positive.
  const Mx = Math.abs(Mx_app);
  const My = Math.abs(My_app);

  const cellsX = 16;
  const cellsY = 16;
  const dx = B / cellsX;
  const dy = L / cellsY;
  const dA = dx * dy;

  // Compute (ΣF, ΣMx, ΣMy) over loaded region for given (a, bx, by)
  function integrate(a: number, bx: number, by: number) {
    let F = 0, Mx_int = 0, My_int = 0, A_loaded = 0;
    for (let i = 0; i < cellsX; i++) {
      const x = -B / 2 + (i + 0.5) * dx;
      for (let j = 0; j < cellsY; j++) {
        const y = -L / 2 + (j + 0.5) * dy;
        const sigma = a + bx * x + by * y;
        if (sigma > 0) {
          F      += sigma * dA;
          Mx_int += sigma * y * dA;   // moment about x-axis
          My_int += sigma * x * dA;   // moment about y-axis
          A_loaded += dA;
        }
      }
    }
    return { F, Mx: Mx_int, My: My_int, A_loaded };
  }

  // Initial guess: assume full contact trapezoid
  const A = B * L;
  let a = N / A;
  let bx = (12 * My) / (A * B * B);   // σ-slope along x
  let by = (12 * Mx) / (A * L * L);   // σ-slope along y

  for (let iter = 0; iter < NR_MAX_ITER; iter++) {
    const f0 = integrate(a, bx, by);
    const r1 = (f0.F - N) / N;
    const r2 = (f0.Mx - Mx) / N;
    const r3 = (f0.My - My) / N;
    const maxRes = Math.max(Math.abs(r1), Math.abs(r2), Math.abs(r3));
    if (maxRes < NR_TOL) {
      // Compute σmax at corner (+B/2, +L/2) — guaranteed peak in loaded region
      const sigmaMax = a + bx * (B / 2) + by * (L / 2);
      if (sigmaMax <= 0 || !isFinite(sigmaMax)) return null;
      return { sigma_max: sigmaMax, loaded_area_fraction: f0.A_loaded / A };
    }

    // Numeric Jacobian (forward differences on a, bx, by)
    const ha  = Math.max(Math.abs(a)  * 1e-4, 1e-3);
    const hbx = Math.max(Math.abs(bx) * 1e-4, 1e-3);
    const hby = Math.max(Math.abs(by) * 1e-4, 1e-3);

    const fa  = integrate(a + ha, bx, by);
    const fbx = integrate(a, bx + hbx, by);
    const fby = integrate(a, bx, by + hby);

    // Jacobian rows: ∂(F, Mx, My) / ∂(a, bx, by)
    const J = [
      [(fa.F  - f0.F)  / ha, (fbx.F  - f0.F)  / hbx, (fby.F  - f0.F)  / hby],
      [(fa.Mx - f0.Mx) / ha, (fbx.Mx - f0.Mx) / hbx, (fby.Mx - f0.Mx) / hby],
      [(fa.My - f0.My) / ha, (fbx.My - f0.My) / hbx, (fby.My - f0.My) / hby],
    ];
    const r = [-(f0.F - N), -(f0.Mx - Mx), -(f0.My - My)];

    const delta = solve3x3(J, r);
    if (!delta) return null;
    a  += delta[0];
    bx += delta[1];
    by += delta[2];

    if (!isFinite(a) || !isFinite(bx) || !isFinite(by)) return null;
  }
  return null; // did not converge
}

function solve3x3(A: number[][], b: number[]): number[] | null {
  // Cramer's rule for a 3×3 system
  function det3(m: number[][]): number {
    return (
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
  }
  const D = det3(A);
  if (Math.abs(D) < 1e-12) return null;
  const M0 = [[b[0], A[0][1], A[0][2]], [b[1], A[1][1], A[1][2]], [b[2], A[2][1], A[2][2]]];
  const M1 = [[A[0][0], b[0], A[0][2]], [A[1][0], b[1], A[1][2]], [A[2][0], b[2], A[2][2]]];
  const M2 = [[A[0][0], A[0][1], b[0]], [A[1][0], A[1][1], b[1]], [A[2][0], A[2][1], b[2]]];
  return [det3(M0) / D, det3(M1) / D, det3(M2) / D];
}

// ── Solve stress (σmax, σmin, loaded fraction) for given distribution type ───
interface StressResult {
  sigma_max: number;
  sigma_min: number;
  loaded_area_fraction: number;
  distributionType: DistributionType;
}

function solveStress(
  dist: DistributionType,
  ex: number, ey: number,
  N: number, B: number, L: number,
): StressResult {
  if (dist === 'overturning_fail') {
    return { sigma_max: Infinity, sigma_min: 0, loaded_area_fraction: 0, distributionType: 'overturning_fail' };
  }

  const A = B * L;
  const sigma_c = N / A;

  if (dist === 'trapezoidal') {
    // Closed form: σ = N/A · (1 ± 6e/B ± 6e/L). Boundary ex=B/6 → σmin=0.
    const sigma_max = sigma_c * (1 + 6 * ex / B + 6 * ey / L);
    const sigma_min = sigma_c * (1 - 6 * ex / B - 6 * ey / L);
    return {
      sigma_max,
      sigma_min: Math.max(sigma_min, 0),
      loaded_area_fraction: 1.0,
      distributionType: 'trapezoidal',
    };
  }

  if (dist === 'bitriangular_uniaxial') {
    // One eccentricity beyond core. Meyerhof closed form on the dominant axis.
    // Loaded region is a triangle (in 1D: a strip of width = 3·(B/2 − ex)).
    // σmax = 2N / [3·L · (B/2 − ex)]  (when ex governs)
    let sigma_max: number;
    let loaded_fraction: number;
    if (ex > B / 6) {
      const lc = 3 * (B / 2 - ex);
      if (lc <= 0) return { sigma_max: Infinity, sigma_min: 0, loaded_area_fraction: 0, distributionType: 'overturning_fail' };
      sigma_max = (2 * N) / (3 * L * (B / 2 - ex));
      loaded_fraction = lc / B;
    } else {
      const lc = 3 * (L / 2 - ey);
      if (lc <= 0) return { sigma_max: Infinity, sigma_min: 0, loaded_area_fraction: 0, distributionType: 'overturning_fail' };
      sigma_max = (2 * N) / (3 * B * (L / 2 - ey));
      loaded_fraction = lc / L;
    }
    return {
      sigma_max,
      sigma_min: 0,
      loaded_area_fraction: loaded_fraction,
      distributionType: 'bitriangular_uniaxial',
    };
  }

  // bitriangular_biaxial → Newton-Raphson
  // Mx_app and My_app reconstructed from ex, ey, N
  const Mx_app = ey * N;
  const My_app = ex * N;
  const nr = solveBiaxialNR(N, Mx_app, My_app, B, L);
  if (!nr) {
    return { sigma_max: Infinity, sigma_min: 0, loaded_area_fraction: 0, distributionType: 'overturning_fail' };
  }
  return {
    sigma_max: nr.sigma_max,
    sigma_min: 0,
    loaded_area_fraction: nr.loaded_area_fraction,
    distributionType: 'bitriangular_biaxial',
  };
}

export function calcIsolatedFooting(inp: IsolatedFootingInputs): IsolatedFootingResult {
  // ── Validation ────────────────────────────────────────────────────────────
  const B  = inp.B, L = inp.L, h = inp.h, bc = inp.bc, hc = inp.hc, Df = inp.Df;
  const cover = inp.cover;

  if (B <= 0 || L <= 0 || h <= 0) return invalid('B, L y h deben ser > 0');
  if (bc <= 0 || hc <= 0) return invalid('bc y hc deben ser > 0');
  if (bc >= B || hc >= L) return invalid('El pilar debe ser menor que la zapata');
  if (Df <= 0) return invalid('Df debe ser > 0');
  if (h > Df) return invalid('El canto h no puede superar la profundidad Df');
  if (cover <= 0) return invalid('Recubrimiento debe ser > 0');
  if (inp.s_x <= 0 || inp.s_y <= 0) return invalid('Separación de barras debe ser > 0');
  if (inp.phi_x <= 0 || inp.phi_y <= 0) return invalid('Diámetro de barras debe ser > 0');
  if (inp.sigma_adm <= 0) return invalid('σadm debe ser > 0');
  if (inp.loadFactor <= 0) return invalid('Factor de mayoración debe ser > 0');
  if (inp.N <= 0) return invalid('N debe ser > 0 (compresión)');

  // ── Loads ─────────────────────────────────────────────────────────────────
  const { N_sls, Mx_sls, My_sls, H_sls, N_elu, Mx_elu, My_elu, H_elu } = deriveLoads(inp);

  // ── Self weights ──────────────────────────────────────────────────────────
  const W_footing = GAMMA_C_RC * B * L * h;
  const W_soil = inp.gamma_soil_kN_m3 * Math.max(Df - h, 0) * (B * L - bc * hc);

  // ── SLS bearing: distribution + σmax check ────────────────────────────────
  const Ntot_sls = N_sls + W_footing + W_soil;
  const ex_sls = Math.abs(My_sls / Ntot_sls);
  const ey_sls = Math.abs(Mx_sls / Ntot_sls);
  const ex_over_B6 = ex_sls / (B / 6);
  const ey_over_L6 = ey_sls / (L / 6);

  const dist = classifyDistribution(ex_sls, ey_sls, B, L);
  const stress = solveStress(dist, ex_sls, ey_sls, Ntot_sls, B, L);

  const bearing_util = stress.sigma_max === Infinity ? Infinity : stress.sigma_max / inp.sigma_adm;
  const bearing_status: 'ok' | 'warn' | 'fail' = toStatus(bearing_util);

  // ── ELU overturning (weights stabilize, M_elu + H_elu·h destabilize) ──────
  // Convention: FS_overturn_x = tipping in x direction (about y-axis edge),
  //   destabilizing = |My_elu| + |H_elu|·h, arm = B/2.
  const M_dest_x = Math.abs(My_elu) + Math.abs(H_elu) * h;
  const M_dest_y = Math.abs(Mx_elu) + Math.abs(H_elu) * h;
  const M_stab_x = (W_footing + W_soil) * (B / 2);
  const M_stab_y = (W_footing + W_soil) * (L / 2);
  const FS_overturn_x = M_dest_x > 0 ? M_stab_x / M_dest_x : Infinity;
  const FS_overturn_y = M_dest_y > 0 ? M_stab_y / M_dest_y : Infinity;

  // ── ELU sliding ───────────────────────────────────────────────────────────
  const Rd_slide = inp.mu_friction * (N_elu + W_footing + W_soil);
  const FS_sliding = Math.abs(H_elu) > 0 ? Rd_slide / Math.abs(H_elu) : Infinity;

  // ── ELU armado: effective uniform pressure on Meyerhof B'×L' ──────────────
  const ex_Ed = Math.abs(My_elu / N_elu);
  const ey_Ed = Math.abs(Mx_elu / N_elu);
  const B_Ed  = Math.max(B - 2 * ex_Ed, 0.01);
  const L_Ed  = Math.max(L - 2 * ey_Ed, 0.01);
  const sigma_Ed_uniform = N_elu / (B_Ed * L_Ed);  // kPa

  // ── Effective depths (mm) ─────────────────────────────────────────────────
  const d_x = h * 1000 - cover - inp.phi_x / 2;
  const d_y = h * 1000 - cover - inp.phi_x - inp.phi_y / 2;
  if (d_x <= 0 || d_y <= 0) return invalid('Canto insuficiente para el recubrimiento indicado');

  // ── Materials ─────────────────────────────────────────────────────────────
  const mat = getConcrete(inp.fck);
  const fcd = mat.fcd;
  const fctm = mat.fctm;
  const fyd = inp.fyk / 1.15;

  // ── Cantilever arms (mm) ──────────────────────────────────────────────────
  const ax = ((B - bc) / 2) * 1000;
  const ay = ((L - hc) / 2) * 1000;

  // ── Rigid/flexible classification ─────────────────────────────────────────
  const v_max_x = (B - bc) / 2;
  const v_max_y = (L - hc) / 2;
  const v_max = Math.max(v_max_x, v_max_y);
  const isRigid = v_max <= 2 * h;

  // ── Bending at column face (always computed; check active only if flexible)
  const MEd_x = sigma_Ed_uniform * Math.pow(ax / 1000, 2) / 2;   // kNm/m
  const MEd_y = sigma_Ed_uniform * Math.pow(ay / 1000, 2) / 2;

  function reqAs(MEd: number, d: number): number {
    if (MEd <= 0) return 0;
    const mu_dim = (MEd * 1e6) / (1000 * d * d * fcd);
    if (mu_dim >= 0.5) return Infinity;
    const omega = 1 - Math.sqrt(1 - 2 * mu_dim);
    return (omega * 1000 * d * fcd) / fyd;
  }
  function minAs(d: number): number {
    return Math.max(0.26 * fctm / inp.fyk * 1000 * d, 0.0013 * 1000 * d);
  }

  const As_req_bend_x = reqAs(MEd_x, d_x);
  const As_req_bend_y = reqAs(MEd_y, d_y);

  // ── Strut-tie tie force (CE art. 55.2 / EHE-08 art. 58.4.1.2) ─────────────
  const Td_x = sigma_Ed_uniform * L * B * (B - bc) / (6.8 * (d_x / 1000));   // kN
  const Td_y = sigma_Ed_uniform * B * L * (L - hc) / (6.8 * (d_y / 1000));   // kN
  const As_req_tie_x = (Td_x * 1000 / fyd) / L;   // mm²/m (spread across L)
  const As_req_tie_y = (Td_y * 1000 / fyd) / B;   // mm²/m (spread across B)

  const As_req_x = isRigid ? As_req_tie_x : As_req_bend_x;
  const As_req_y = isRigid ? As_req_tie_y : As_req_bend_y;
  const As_min_x = minAs(d_x);
  const As_min_y = minAs(d_y);
  const As_adopted_x = Math.max(As_req_x, As_min_x);
  const As_adopted_y = Math.max(As_req_y, As_min_y);
  const As_prov_x = (getBarArea(inp.phi_x) / inp.s_x) * 1000;
  const As_prov_y = (getBarArea(inp.phi_y) / inp.s_y) * 1000;

  // ── Shear (CE art. 44, at d from column face) ─────────────────────────────
  const ell_x = Math.max(ax - d_x, 0);
  const ell_y = Math.max(ay - d_y, 0);
  const VEd_x = sigma_Ed_uniform * (ell_x / 1000);   // kN/m
  const VEd_y = sigma_Ed_uniform * (ell_y / 1000);

  const k_sh_x = Math.min(1 + Math.sqrt(200 / d_x), 2.0);
  const rhoL_x = Math.min(As_prov_x / (1000 * d_x), 0.02);
  const vRdc_x = Math.max(
    (0.18 / 1.5) * k_sh_x * Math.pow(100 * rhoL_x * inp.fck, 1 / 3),
    0.035 * Math.pow(k_sh_x, 1.5) * Math.sqrt(inp.fck),
  );
  const k_sh_y = Math.min(1 + Math.sqrt(200 / d_y), 2.0);
  const rhoL_y = Math.min(As_prov_y / (1000 * d_y), 0.02);
  const vRdc_y = Math.max(
    (0.18 / 1.5) * k_sh_y * Math.pow(100 * rhoL_y * inp.fck, 1 / 3),
    0.035 * Math.pow(k_sh_y, 1.5) * Math.sqrt(inp.fck),
  );
  const VRd_x = vRdc_x * 1000;
  const VRd_y = vRdc_y * 1000;

  // ── Punching (CE art. 46, β=1.0) ──────────────────────────────────────────
  const d_avg = (d_x + d_y) / 2;
  const u1_rect = 2 * (bc * 1000 + hc * 1000) + 2 * Math.PI * 2 * d_avg;
  const vEd_punch = (1.0 * N_elu * 1000) / (u1_rect * d_avg);   // MPa
  const k_p = Math.min(1 + Math.sqrt(200 / d_avg), 2.0);
  const rhoL_avg = Math.min((As_prov_x + As_prov_y) / 2 / (1000 * d_avg), 0.02);
  const vRdc_punch = Math.max(
    (0.18 / 1.5) * k_p * Math.pow(100 * rhoL_avg * inp.fck, 1 / 3),
    0.035 * Math.pow(k_p, 1.5) * Math.sqrt(inp.fck),
  );

  // ── Build checks[] ────────────────────────────────────────────────────────
  const checks: CheckRow[] = [];

  // Bearing (σmax ≤ σadm)
  if (stress.sigma_max === Infinity) {
    checks.push({
      id: 'bearing',
      description: 'σmax ≤ σadm — vuelco geométrico',
      valueStr: '∞',
      limitNum: inp.sigma_adm,
      limitQty: 'soilPressure',
      utilization: Infinity,
      status: 'fail',
      article: 'CTE DB-SE-C 4.4.1',
    });
  } else {
    checks.push(makeCheckQty(
      'bearing', 'σmax ≤ σadm',
      stress.sigma_max, inp.sigma_adm,
      'soilPressure', 'CTE DB-SE-C 4.4.1',
    ));
  }

  // Overturning x (only if destabilizing moment exists)
  if (M_dest_x > 0) {
    const u_x = FS_VUELCO_MIN / FS_overturn_x;
    checks.push({
      id: 'overturn-x',
      description: 'Vuelco dir. x (FS ≥ 1.5)',
      value: `FS = ${FS_overturn_x.toFixed(2)}`,
      limit: `≥ ${FS_VUELCO_MIN.toFixed(2)}`,
      utilization: u_x,
      status: toStatus(u_x),
      article: 'CTE DB-SE-C 4.4.2',
    });
  }
  if (M_dest_y > 0) {
    const u_y = FS_VUELCO_MIN / FS_overturn_y;
    checks.push({
      id: 'overturn-y',
      description: 'Vuelco dir. y (FS ≥ 1.5)',
      value: `FS = ${FS_overturn_y.toFixed(2)}`,
      limit: `≥ ${FS_VUELCO_MIN.toFixed(2)}`,
      utilization: u_y,
      status: toStatus(u_y),
      article: 'CTE DB-SE-C 4.4.2',
    });
  }

  // Sliding (only if H_elu > 0)
  if (Math.abs(H_elu) > 0) {
    const u_s = FS_SLIDE_MIN / FS_sliding;
    checks.push({
      id: 'sliding',
      description: 'Deslizamiento (FS ≥ 1.5)',
      value: `FS = ${FS_sliding.toFixed(2)}`,
      limit: `≥ ${FS_SLIDE_MIN.toFixed(2)}`,
      utilization: u_s,
      status: toStatus(u_s),
      article: 'CTE DB-SE-C 4.4.3',
    });
  }

  // ── ELU group: armado (gated by isRigid) ──────────────────────────────────
  // Flexible: bending + shear + punching active, strut-tie neutral
  // Rigid:    strut-tie active, bending + shear + punching neutral
  if (isRigid) {
    // Strut-tie active
    pushBendingOrTie(checks, 'biela-tirante-x', 'Armadura dir. x (biela-tirante)', As_adopted_x, As_prov_x, As_req_x, 'CE art. 55.2 / EHE 58.4.1.2');
    pushBendingOrTie(checks, 'biela-tirante-y', 'Armadura dir. y (biela-tirante)', As_adopted_y, As_prov_y, As_req_y, 'CE art. 55.2 / EHE 58.4.1.2');
    // Bending neutral
    checks.push(makeCheckNeutral('flexion-x', 'Flexión dir. x', 'rígida — N/A', 'CE art. 9.1'));
    checks.push(makeCheckNeutral('flexion-y', 'Flexión dir. y', 'rígida — N/A', 'CE art. 9.1'));
    // Shear neutral
    checks.push(makeCheckNeutral('cortante-x', 'Cortante dir. x', 'rígida — N/A', 'CE art. 44'));
    checks.push(makeCheckNeutral('cortante-y', 'Cortante dir. y', 'rígida — N/A', 'CE art. 44'));
    // Punching neutral
    checks.push(makeCheckNeutral('punzonamiento', 'Punzonamiento', 'rígida — N/A', 'CE art. 46'));
  } else {
    // Strut-tie neutral
    checks.push(makeCheckNeutral('biela-tirante-x', 'Armadura dir. x (biela-tirante)', 'flexible — N/A', 'CE art. 55.2'));
    checks.push(makeCheckNeutral('biela-tirante-y', 'Armadura dir. y (biela-tirante)', 'flexible — N/A', 'CE art. 55.2'));
    // Bending active
    pushBendingOrTie(checks, 'flexion-x', 'Armadura flexión dir. x', As_adopted_x, As_prov_x, As_req_x, 'CE art. 9.1');
    pushBendingOrTie(checks, 'flexion-y', 'Armadura flexión dir. y', As_adopted_y, As_prov_y, As_req_y, 'CE art. 9.1');
    // Shear active
    if (ell_x > 0) {
      checks.push(makeCheckQty('cortante-x', 'Cortante dir. x (a d del pilar)', VEd_x, VRd_x, 'linearLoad', 'CE art. 44'));
    } else {
      checks.push(makeCheckNeutral('cortante-x', 'Cortante dir. x', 'd ≥ ax — N/A', 'CE art. 44'));
    }
    if (ell_y > 0) {
      checks.push(makeCheckQty('cortante-y', 'Cortante dir. y (a d del pilar)', VEd_y, VRd_y, 'linearLoad', 'CE art. 44'));
    } else {
      checks.push(makeCheckNeutral('cortante-y', 'Cortante dir. y', 'd ≥ ay — N/A', 'CE art. 44'));
    }
    // Punching active
    checks.push(makeCheckQty('punzonamiento', 'Punzonamiento (a 2d del pilar)', vEd_punch, vRdc_punch, 'stress', 'CE art. 46'));
  }

  // Cuantía mínima x/y (always active)
  checks.push(makeCheck(
    'cuantia-min-x', 'Cuantía mínima dir. x',
    As_min_x, As_prov_x,
    `${As_min_x.toFixed(0)} mm²/m`, `${As_prov_x.toFixed(0)} mm²/m`,
    'CE art. 42.3',
  ));
  checks.push(makeCheck(
    'cuantia-min-y', 'Cuantía mínima dir. y',
    As_min_y, As_prov_y,
    `${As_min_y.toFixed(0)} mm²/m`, `${As_prov_y.toFixed(0)} mm²/m`,
    'CE art. 42.3',
  ));

  // Separación x/y (always active, max 300 mm)
  const s_max = 300;
  checks.push({
    id: 'separacion-x',
    description: 'Separación barras dir. x',
    value: `${inp.s_x.toFixed(0)} mm`,
    limit: `${s_max} mm`,
    utilization: inp.s_x / s_max,
    status: toStatus(inp.s_x / s_max),
    article: 'CE art. 42.3',
  });
  checks.push({
    id: 'separacion-y',
    description: 'Separación barras dir. y',
    value: `${inp.s_y.toFixed(0)} mm`,
    limit: `${s_max} mm`,
    utilization: inp.s_y / s_max,
    status: toStatus(inp.s_y / s_max),
    article: 'CE art. 42.3',
  });

  const overall_fail = checks.some((c) => c.status === 'fail');

  return {
    valid: !overall_fail,
    N_sls, Mx_sls, My_sls, H_sls,
    N_elu, Mx_elu, My_elu, H_elu,
    ex_sls, ey_sls, ex_over_B6, ey_over_L6,
    distributionType: stress.distributionType,
    sigma_max: stress.sigma_max,
    sigma_min: stress.sigma_min,
    loaded_area_fraction: stress.loaded_area_fraction,
    bearing_check: { utilization: bearing_util, status: bearing_status },
    W_footing, W_soil,
    M_stab_x, M_dest_x, FS_overturn_x,
    M_stab_y, M_dest_y, FS_overturn_y,
    Rd_slide, FS_sliding,
    sigma_Ed_uniform, d_x, d_y, isRigid, v_max,
    ax, ay, ell_x, ell_y,
    MEd_x, MEd_y, Td_x, Td_y,
    As_req_x, As_req_y, As_min_x, As_min_y,
    As_adopted_x, As_adopted_y, As_prov_x, As_prov_y,
    VEd_x, VEd_y, VRd_x, VRd_y,
    d_avg, u1: u1_rect, vEd_punch, vRdc_punch,
    checks,
  };
}

function pushBendingOrTie(
  checks: CheckRow[],
  id: string, description: string,
  As_adopted: number, As_prov: number, As_req: number,
  article: string,
): void {
  if (As_req === Infinity) {
    checks.push({
      id, description: `${description} — sección sobrearmada`,
      value: '∞', limit: `${As_prov.toFixed(0)} mm²/m`,
      utilization: 2, status: 'fail', article,
    });
    return;
  }
  checks.push(makeCheck(
    id, description,
    As_adopted, As_prov,
    `${As_adopted.toFixed(0)} mm²/m`, `${As_prov.toFixed(0)} mm²/m`,
    article,
  ));
}
