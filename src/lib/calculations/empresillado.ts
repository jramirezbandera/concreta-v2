// Empresillado — EC3 EN 1993-1-1 §6.4 battened built-up column
// 4 equal-leg L-angles at corners of an existing RC column.
// Checks: chord compression, local buckling (eje v), global buckling, pletinas.
//
// Unit convention inside this function:
//   All lengths converted to cm at the top.
//   Forces in kN, moments in kNm, stresses in kN/cm² (= 100·MPa).
//   Profile data: A [cm²], I1 [cm⁴], iv [cm], e [cm].

import { type EmpresalladoInputs } from '../../data/defaults';
import { getAngleProfile } from '../../data/angleProfiles';
import { makeCheck, type CheckRow } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────
const γM0 = 1.05;
const γM1 = 1.05;

// Buckling curve b (hot-rolled angle) — EC3 Table 6.2
const α = 0.34;

// ─── Result type ─────────────────────────────────────────────────────────────
export interface EmpresalladoResult {
  valid: boolean;
  error?: string;

  // Geometry (cm)
  dx: number;         // chord centroid x-offset from column center
  dy: number;
  hx: number;         // distance between chord centroids in x
  hy: number;
  I_X: number;        // compound moment of inertia about X (cm⁴)
  I_Y: number;
  i_X: number;        // compound radius of gyration (cm)
  i_Y: number;

  // Chord force
  N_chord_max: number; // kN — most compressed chord

  // Resistance
  N_pl_Rd: number;     // kN — section resistance of one chord
  N_bv_Rd: number;     // kN — local buckling resistance of one chord

  // Local buckling
  lambda_v: number;
  chi_v: number;

  // Global buckling
  lambda_0X: number;
  lambda_0Y: number;
  lambda_vl: number;
  lambda_effX: number;
  lambda_effY: number;
  chi_X: number;
  chi_Y: number;
  chi: number;
  N_b_Rd: number;      // kN — global buckling resistance of compound section

  // Pletina
  V_Ed: number;        // kN
  M_Ed_pl: number;     // kNm
  M_Rd_pl: number;     // kNm
  V_Rd_pl: number;     // kN

  // Check rows for result panel
  checks: CheckRow[];
  utilization: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bucklingChi(lambda_bar: number): number {
  if (lambda_bar <= 0) return 1.0;
  const phi = 0.5 * (1 + α * (lambda_bar - 0.2) + lambda_bar * lambda_bar);
  return Math.min(1.0, 1 / (phi + Math.sqrt(Math.max(0, phi * phi - lambda_bar * lambda_bar))));
}

// ─── Main calculation ─────────────────────────────────────────────────────────

export function calcEmpresillado(inp: EmpresalladoInputs): EmpresalladoResult {
  const { N_Ed, Mx_Ed, My_Ed, Vd, fy, beta_x, beta_y } = inp;

  // ── Unit conversion ───────────────────────────────────────────────────────
  // Inputs: bc/hc in cm, L in m, s/lp/bp in cm, tp in mm
  const bc_cm = inp.bc;          // cm (already)
  const hc_cm = inp.hc;          // cm (already)
  const L_cm  = inp.L  * 100;   // m → cm
  const s_cm  = inp.s;           // cm (already)
  const lp_cm = inp.lp;          // cm (already)
  const bp_mm = inp.bp * 10;    // cm → mm (W_pl and V_Rd formulas require mm)
  const tp_mm = inp.tp;          // mm (already)

  // ── Profile lookup ────────────────────────────────────────────────────────
  const profile = getAngleProfile(inp.perfil);
  if (!profile) {
    return { valid: false, error: `Perfil "${inp.perfil}" no encontrado en el catálogo`, dx: 0, dy: 0, hx: 0, hy: 0, I_X: 0, I_Y: 0, i_X: 0, i_Y: 0, N_chord_max: 0, N_pl_Rd: 0, N_bv_Rd: 0, lambda_v: 0, chi_v: 0, lambda_0X: 0, lambda_0Y: 0, lambda_vl: 0, lambda_effX: 0, lambda_effY: 0, chi_X: 0, chi_Y: 0, chi: 0, N_b_Rd: 0, V_Ed: 0, M_Ed_pl: 0, M_Rd_pl: 0, V_Rd_pl: 0, checks: [], utilization: 0 };
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const s0_cm = s_cm - lp_cm;
  if (s0_cm <= 0) {
    return { valid: false, error: 's debe ser mayor que lp (separación libre s₀ = s − lp ≤ 0)', dx: 0, dy: 0, hx: 0, hy: 0, I_X: 0, I_Y: 0, i_X: 0, i_Y: 0, N_chord_max: 0, N_pl_Rd: 0, N_bv_Rd: 0, lambda_v: 0, chi_v: 0, lambda_0X: 0, lambda_0Y: 0, lambda_vl: 0, lambda_effX: 0, lambda_effY: 0, chi_X: 0, chi_Y: 0, chi: 0, N_b_Rd: 0, V_Ed: 0, M_Ed_pl: 0, M_Rd_pl: 0, V_Rd_pl: 0, checks: [], utilization: 0 };
  }

  const { A, I1, iv, e } = profile;

  // ── Geometry ──────────────────────────────────────────────────────────────
  // Chord centroids are outside the column (L is clamped externally)
  const dx = bc_cm / 2 + e;   // cm — x-offset from column center
  const dy = hc_cm / 2 + e;   // cm — y-offset from column center
  const hx = 2 * dx;           // cm — span between chord centroids in x (My lever arm)
  const hy = 2 * dy;           // cm — span between chord centroids in y (Mx lever arm)

  // ── Compound section ──────────────────────────────────────────────────────
  // I_X: bending about X-axis → chords at ±dy from X
  const I_X = 4 * (I1 + A * dy * dy);   // cm⁴
  // I_Y: bending about Y-axis → chords at ±dx from Y
  const I_Y = 4 * (I1 + A * dx * dx);   // cm⁴
  const i_X = Math.sqrt(I_X / (4 * A));  // cm
  const i_Y = Math.sqrt(I_Y / (4 * A));  // cm

  // ── Steel resistance: 1 N/mm² = 0.1 kN/cm² (since 1 cm² = 100 mm²) ────────
  const fy_cm = fy / 10;   // kN/cm²

  // ── Chord force ───────────────────────────────────────────────────────────
  // N [kN], Mx [kNm], hy [cm] → convert Mx to kN·cm: Mx*100 / hy gives kN
  // N_chord = N/4 + |Mx|/(2·hy_m) + |My|/(2·hx_m)
  // with hy_m = hy/100, hx_m = hx/100:
  const N_chord_max =
    N_Ed / 4 +
    (Math.abs(Mx_Ed) * 100) / (2 * hy) +
    (Math.abs(My_Ed) * 100) / (2 * hx);

  // ── Chord section resistance ──────────────────────────────────────────────
  const N_pl_Rd = (A * fy_cm) / γM0;   // kN — one chord

  // ── Local buckling (eje v) ────────────────────────────────────────────────
  // Pletinas are welded (biempotradas): lk_local = 0.5 × s per EC3 §6.4.2.1 Table 6.8
  const ε = Math.sqrt(235 / fy);
  const lk_local_cm = 0.5 * s_cm;
  const lambda_v = (lk_local_cm / iv) / (93.9 * ε);
  const chi_v = bucklingChi(lambda_v);
  const N_bv_Rd = (chi_v * A * fy_cm) / γM1;

  // ── Global buckling (EC3 §6.4.3.1) ───────────────────────────────────────
  const Lk_X = beta_x * L_cm;
  const Lk_Y = beta_y * L_cm;
  const lambda_0X = (Lk_X / i_X) / (93.9 * ε);
  const lambda_0Y = (Lk_Y / i_Y) / (93.9 * ε);
  // Local slenderness correction (identical to λ̄_v above)
  const lambda_vl = lambda_v;
  const lambda_effX = Math.sqrt(lambda_0X * lambda_0X + lambda_vl * lambda_vl);
  const lambda_effY = Math.sqrt(lambda_0Y * lambda_0Y + lambda_vl * lambda_vl);
  const chi_X = bucklingChi(lambda_effX);
  const chi_Y = bucklingChi(lambda_effY);
  const chi = Math.min(chi_X, chi_Y);
  const N_b_Rd = (chi * 4 * A * fy_cm) / γM1;   // kN — compound section

  // ── Pletinas (batten plates) ──────────────────────────────────────────────
  // VEd = max(Vd_actual, NEd/500) — EC3 §6.4.3.1: notional shear is minimum floor
  const V_Ed = Math.max(Vd, N_Ed / 500);
  // M_Ed_pl = VEd · s / 4 — EC3 §6.4.3.2, 2-face system, biempotradas (fixed-fixed)
  // s in cm → convert to m for kNm
  const M_Ed_pl = V_Ed * (s_cm / 100) / 4;   // kNm

  // Batten plate section (all mm):
  const W_pl_mm3 = bp_mm * tp_mm * tp_mm / 4;           // mm³ — plastic modulus
  const M_Rd_pl  = (W_pl_mm3 * fy) / (γM0 * 1e6);      // kNm  (N·mm → kNm ÷1e6)
  const V_Rd_pl  = (bp_mm * tp_mm * fy) / (Math.sqrt(3) * γM0 * 1000);  // kN

  // ── Check rows ────────────────────────────────────────────────────────────
  const checks: CheckRow[] = [
    makeCheck(
      'cordones',
      'Cordones — compresión (N_chord / N_pl,Rd)',
      N_chord_max, N_pl_Rd,
      `${N_chord_max.toFixed(1)} kN`,
      `${N_pl_Rd.toFixed(1)} kN`,
      'EC3 §6.4.2',
    ),
    makeCheck(
      'pandeo-local',
      'Pandeo local eje v (N_chord / N_bv,Rd)',
      N_chord_max, N_bv_Rd,
      `${N_chord_max.toFixed(1)} kN`,
      `${N_bv_Rd.toFixed(1)} kN`,
      'EC3 §6.4 / §6.3.1',
    ),
    makeCheck(
      'pandeo-global',
      'Pandeo global (N_Ed / N_b,Rd)',
      N_Ed, N_b_Rd,
      `${N_Ed.toFixed(1)} kN`,
      `${N_b_Rd.toFixed(1)} kN`,
      'EC3 §6.4.3.1',
    ),
    makeCheck(
      'pletina-flexion',
      'Pletinas — flexión (η_M)',
      M_Ed_pl, M_Rd_pl,
      `${M_Ed_pl.toFixed(3)} kNm`,
      `${M_Rd_pl.toFixed(3)} kNm`,
      'EC3 §6.4.3.2',
    ),
    makeCheck(
      'pletina-cortante',
      'Pletinas — cortante (η_V)',
      V_Ed, V_Rd_pl,
      `${V_Ed.toFixed(2)} kN`,
      `${V_Rd_pl.toFixed(1)} kN`,
      'EC3 §6.4.3.2',
    ),
  ];

  const utilization = Math.max(...checks.map((c) => c.utilization));

  return {
    valid: true,
    dx, dy, hx, hy,
    I_X, I_Y, i_X, i_Y,
    N_chord_max,
    N_pl_Rd,
    N_bv_Rd,
    lambda_v,
    chi_v,
    lambda_0X,
    lambda_0Y,
    lambda_vl,
    lambda_effX,
    lambda_effY,
    chi_X,
    chi_Y,
    chi,
    N_b_Rd,
    V_Ed,
    M_Ed_pl,
    M_Rd_pl,
    V_Rd_pl,
    checks,
    utilization,
  };
}
