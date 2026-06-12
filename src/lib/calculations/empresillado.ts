// Empresillado — EC3 EN 1993-1-1 §6.4 battened built-up column
// Modelo de SEGUNDO ORDEN §6.4.1 (fix auditoría #125): MEd amplificado con
// e0=L/500 y 1/(1−N/Ncr−N/Sv); VEd = π·MEd/L + Vd; cordón con ec. 6.69 y
// flexión Vierendeel (§6.4.3.1(1)); presillas con su cortante interno T.
// 4 equal-leg L-angles at corners of an existing RC column.
// Checks: chord compression, local buckling (eje v), global buckling, pletinas.
//
// Unit convention inside this function:
//   All lengths converted to cm at the top.
//   Forces in kN, moments in kNm, stresses in kN/cm² (= 100·MPa).
//   Profile data: A [cm²], I1 [cm⁴], iv [cm], e [cm].

import { type EmpresalladoInputs } from '../../data/defaults';
import { getAngleProfile } from '../../data/angleProfiles';
import { makeCheckQty, type CheckRow } from './types';

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
  A_ang: number;       // cm² — área de un angular (para tests/PDF)

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

  // Segundo orden EC3 §6.4.1
  Ncr_X: number;       // kN — carga crítica de la pieza compuesta
  Ncr_Y: number;
  Sv_X: number;        // kN — rigidez a cortante del sistema de presillas
  Sv_Y: number;
  MEd_IIX: number;     // kNm — momento amplificado (e0 + M_I)
  MEd_IIY: number;

  // Pletina
  V_Ed: number;        // kN — π·MEd/L + Vd (dirección pésima)
  M_Ed_pl: number;     // kNm
  M_Rd_pl: number;     // kNm
  V_Rd_pl: number;     // kN
  T_pl: number;        // kN — cortante interno de la presilla (VEd/2)·s/h0

  // Cordón — flexión Vierendeel
  M_ch: number;        // kNm
  M_el_Rd: number;     // kNm — capacidad elástica del angular

  // Check rows for result panel
  checks: CheckRow[];
  utilization: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function invalidResult(error: string): EmpresalladoResult {
  return {
    valid: false, error,
    dx: 0, dy: 0, hx: 0, hy: 0,
    I_X: 0, I_Y: 0, i_X: 0, i_Y: 0,
    N_chord_max: 0, A_ang: 0, N_pl_Rd: 0, N_bv_Rd: 0,
    lambda_v: 0, chi_v: 0,
    lambda_0X: 0, lambda_0Y: 0, lambda_vl: 0,
    lambda_effX: 0, lambda_effY: 0,
    chi_X: 0, chi_Y: 0, chi: 0, N_b_Rd: 0,
    Ncr_X: 0, Ncr_Y: 0, Sv_X: 0, Sv_Y: 0, MEd_IIX: 0, MEd_IIY: 0,
    V_Ed: 0, M_Ed_pl: 0, M_Rd_pl: 0, V_Rd_pl: 0, T_pl: 0,
    M_ch: 0, M_el_Rd: 0,
    checks: [], utilization: 0,
  };
}

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
    return invalidResult(`Perfil "${inp.perfil}" no encontrado en el catálogo`);
  }

  // ── Validation ────────────────────────────────────────────────────────────
  // Positividad (fix auditoría #127: el NumberField no aplicaba min y
  // geometrías negativas producían resultados «válidos» en verde).
  if (bc_cm <= 0 || hc_cm <= 0) return invalidResult('Dimensiones del pilar inválidas (bc, hc > 0)');
  if (inp.L <= 0) return invalidResult('Longitud inválida (L > 0)');
  if (s_cm <= 0 || lp_cm <= 0 || inp.bp <= 0 || tp_mm <= 0) return invalidResult('Dimensiones de presilla inválidas');
  if (beta_x <= 0 || beta_y <= 0) return invalidResult('Factor β inválido (> 0)');
  if (N_Ed < 0) return invalidResult('El axil N_Ed debe ser ≥ 0 (compresión)');
  if (Vd < 0) return invalidResult('El cortante Vd debe ser ≥ 0');

  const s0_cm = s_cm - lp_cm;
  if (s0_cm <= 0) {
    return invalidResult('s debe ser mayor que lp (separación libre s₀ = s − lp ≤ 0)');
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

  // ── Modelo de SEGUNDO ORDEN — EC3 §6.4.1 (fix auditoría #125) ────────────
  // Antes el cordón era de primer orden y VEd = max(Vd, N/500): sin la
  // imperfección e0 = L/500, sin la amplificación 1/(1−N/Ncr−N/Sv) y con un
  // cortante nocional ~3-25× corto (flip verde→fail demostrado en la
  // auditoría). Por eje (los momentos actúan en ambos):
  //   MEd = (N·e0 + |M_I|) / (1 − N/Ncr − N/Sv)        [ec. 6.69]
  //   Ncr = π²·E·Ieff / L²   (L física: e0 y el modo de imperfección viven
  //                           en la luz libre; con β<1 es además conservador)
  //   Sv  = 24·E·Ich,eq / (s²·(1 + (2·Ich,eq/(n·Ib))·(h0/s))) ≤ 2π²·E·Ich,eq/s²
  //         [ec. 6.73] con Ich,eq = 2·I1 (par de angulares por «cordón»
  //         equivalente), n = 2 planos de presillas por dirección,
  //         Ib = tp·bp³/12 (presilla en su plano)
  //   VEd = π·MEd/L + Vd  (§6.4.1(7); el cortante real se SUMA, no se
  //         envuelve — auditoría #125/A3)
  const E_steel = 21000;                      // kN/cm²
  const e0_cm   = L_cm / 500;                 // imperfección equivalente
  const Ib_cm4  = (tp_mm / 10) * Math.pow(inp.bp, 3) / 12;  // cm⁴
  const Ich_eq  = 2 * I1;                     // cm⁴

  const secondOrder = (I_eff: number, h0: number, M_I_kNm: number) => {
    const Ncr = (Math.PI * Math.PI * E_steel * I_eff) / (L_cm * L_cm);  // kN
    const Sv_raw = (24 * E_steel * Ich_eq) /
      (s_cm * s_cm * (1 + ((2 * Ich_eq) / (2 * Ib_cm4)) * (h0 / s_cm)));
    const Sv = Math.min(Sv_raw, (2 * Math.PI * Math.PI * E_steel * Ich_eq) / (s_cm * s_cm));
    const denom = 1 - N_Ed / Ncr - N_Ed / Sv;
    if (denom <= 0.05) return { Ncr, Sv, MEd: Infinity };  // cerca del crítico
    const MEd = (N_Ed * (e0_cm / 100) + Math.abs(M_I_kNm)) / denom;  // kNm
    return { Ncr, Sv, MEd };
  };

  const soX = secondOrder(I_X, hy, Mx_Ed);   // flexión sobre X (brazo hy)
  const soY = secondOrder(I_Y, hx, My_Ed);
  const { Ncr: Ncr_X, Sv: Sv_X, MEd: MEd_IIX } = soX;
  const { Ncr: Ncr_Y, Sv: Sv_Y, MEd: MEd_IIY } = soY;

  if (!isFinite(MEd_IIX) || !isFinite(MEd_IIY)) {
    return invalidResult('N_Ed demasiado próximo a la carga crítica de la pieza compuesta (amplificación divergente) — aumentar perfil o reducir L');
  }

  // ── Chord force (ec. 6.69 generalizada a 4 cordones, con I exacta) ────────
  // N_ch = N/4 + MEd_X·A·dy/I_X + MEd_Y·A·dx/I_Y   [kNm → kN·cm con ×100]
  const N_chord_max =
    N_Ed / 4 +
    (MEd_IIX * 100 * A * dy) / I_X +
    (MEd_IIY * 100 * A * dx) / I_Y;

  // Cortantes de cálculo por dirección (§6.4.1(7) + Vd aditivo)
  const V_Ed_X = (Math.PI * MEd_IIX) / (L_cm / 100) + Vd;  // kN
  const V_Ed_Y = (Math.PI * MEd_IIY) / (L_cm / 100) + Vd;

  // ── Chord section resistance ──────────────────────────────────────────────
  const N_pl_Rd = (A * fy_cm) / γM0;   // kN — one chord

  // ── Local buckling (eje v) ────────────────────────────────────────────────
  // EC3 §6.4.3.1(3): for battened compound members, the chord buckling
  // length between consecutive battens equals the distance between battens
  // (centre-to-centre spacing s), NOT 0.5·s. Using 0.5 assumes ideal fixity
  // at the batten, which EC3 does not recognise for this check — it
  // systematically under-reports chord local buckling utilization
  // (λ halved → χ higher → N_bv,Rd inflated).
  const ε = Math.sqrt(235 / fy);
  const lk_local_cm = s_cm;
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
  // VEd gobernante para flexión de presilla; para el cortante interno de la
  // presilla el esfuerzo real es T = (VEd/2)·s/h0 (fix auditoría #128 —
  // antes se comparaba contra el V total: conservador ×1.8 con defaults pero
  // NO conservador con s > 2·h0, cruce alcanzable).
  const V_Ed = Math.max(V_Ed_X, V_Ed_Y);
  // M_Ed_pl = (VEd/2)·(s/2) — 2 planos por dirección, biempotradas
  const M_Ed_pl = V_Ed * (s_cm / 100) / 4;   // kNm
  const T_pl = Math.max(
    (V_Ed_X / 2) * (s_cm / hy),
    (V_Ed_Y / 2) * (s_cm / hx),
  );  // kN — cortante interno de la presilla

  // Batten plate section (all mm):
  // The batten bends in the plane of the column face (horizontal axis).
  // Cross-section for bending: height = bp (vertical extent), width = tp (out-of-plane thickness).
  // W_pl = tp × bp² / 4  (strong-axis bending; bp >> tp in all practical cases)
  const W_pl_mm3 = tp_mm * bp_mm * bp_mm / 4;           // mm³ — plastic modulus
  const M_Rd_pl  = (W_pl_mm3 * fy) / (γM0 * 1e6);      // kNm  (N·mm → kNm ÷1e6)
  const V_Rd_pl  = (bp_mm * tp_mm * fy) / (Math.sqrt(3) * γM0 * 1000);  // kN

  // ── Flexión Vierendeel del cordón (EC3 §6.4.3.1(1), fix auditoría #126) ───
  // M_ch = VEd·s/8 por cordón (V repartido en 2 planos, punto de inflexión a
  // media distancia entre presillas). Capacidad elástica del angular sobre el
  // eje paralelo al ala: Wel = I1/(b − e).
  const M_ch = V_Ed * (s_cm / 100) / 8;                       // kNm
  const Wel_ang = I1 / Math.max(profile.b / 10 - e, 0.1);    // cm³
  const M_el_Rd = (Wel_ang * fy_cm) / γM0 / 100;              // kNm (kN·cm → kNm)
  const util_chord_int = N_chord_max / N_bv_Rd + M_ch / M_el_Rd;

  // ── Check rows ────────────────────────────────────────────────────────────
  const checks: CheckRow[] = [
    makeCheckQty('cordones', 'Cordones — compresión (N_chord / N_pl,Rd)',
      N_chord_max, N_pl_Rd, 'force', 'EC3 §6.4.2'),
    makeCheckQty('pandeo-local', 'Pandeo local eje v (N_chord / N_bv,Rd)',
      N_chord_max, N_bv_Rd, 'force', 'EC3 §6.4 / §6.3.1'),
    {
      id: 'cordon-interaccion',
      description: `Cordón — pandeo + flexión Vierendeel: N/N_bv,Rd + M_ch/M_el,Rd (M_ch=${M_ch.toFixed(2)} kNm)`,
      value: util_chord_int.toFixed(3),
      limit: '1.000',
      utilization: util_chord_int,
      status: util_chord_int < 0.8 ? 'ok' : util_chord_int < 1.0 ? 'warn' : 'fail',
      article: 'EC3 §6.4.3.1(1) — Cordón a axil + momento local',
    },
    makeCheckQty('pandeo-global', 'Pandeo global (N_Ed / N_b,Rd)',
      N_Ed, N_b_Rd, 'force', 'EC3 §6.4.3.1'),
    makeCheckQty('pletina-flexion', 'Pletinas — flexión (η_M)',
      M_Ed_pl, M_Rd_pl, 'moment', 'EC3 §6.4.3.2'),
    makeCheckQty('pletina-cortante', 'Pletinas — cortante interno T=(VEd/2)·s/h₀',
      T_pl, V_Rd_pl, 'force', 'EC3 §6.4.3.2'),
    {
      id: 'sep-presillas',
      description: 'Separación de presillas s ≤ 50·i_v',
      value: `s = ${s_cm.toFixed(0)} cm`,
      limit: `≤ ${(50 * iv).toFixed(0)} cm`,
      utilization: s_cm / (50 * iv),
      status: s_cm / (50 * iv) < 0.8 ? 'ok' : s_cm / (50 * iv) < 1.0 ? 'warn' : 'fail',
      article: 'Práctica EA/CTE — limitación de esbeltez local',
    },
    {
      id: 'scope-note',
      description: 'Capacidad solo del empresillado (pilar RC despreciado, lado seguro); unión presilla-cordón (soldadura) no comprobada — verificar aparte',
      value: '',
      limit: '',
      utilization: 0,
      status: 'neutral',
      article: 'EC3 §6.4 — hipótesis del modelo',
      neutral: true,
      tag: 'LÍMITES',
    },
  ];

  const utilization = Math.max(...checks.filter((c) => !c.neutral).map((c) => c.utilization));

  return {
    valid: true,
    dx, dy, hx, hy,
    I_X, I_Y, i_X, i_Y,
    N_chord_max,
    A_ang: A,
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
    Ncr_X, Ncr_Y, Sv_X, Sv_Y, MEd_IIX, MEd_IIY,
    V_Ed,
    M_Ed_pl,
    M_Rd_pl,
    V_Rd_pl,
    T_pl,
    M_ch, M_el_Rd,
    checks,
    utilization,
  };
}
