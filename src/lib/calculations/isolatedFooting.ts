// Isolated footing — CTE DB-SE-C art. 4.3.2/4.3.3 (soil) + CE armado (structural)
// All geometry in m/kN/kPa; rebar in mm/mm².
//
// Soil checks (SLS): bearing, eccentricity, sliding
// Structural checks (ELU): bending-x/y, shear-x/y, punching, spacing-x/y
// Punching: CE art. 46 (vRd,c only — no shear reinforcement in footing)

import { type IsolatedFootingInputs } from '../../data/defaults';
import { getConcrete } from '../../data/materials';
import { getBarArea } from '../../data/rebar';
import { type CheckRow, makeCheck, makeCheckQty, toStatus } from './types';

export type { CheckRow } from './types';

export interface IsolatedFootingResult {
  valid:          boolean;
  error?:         string;

  // Eccentricities (m)
  ex:             number;
  ey:             number;
  B_eff:          number;  // m — Meyerhof effective width  B' = B - 2|ex|
  L_eff:          number;  // m — Meyerhof effective length L' = L - 2|ey|

  // Stability (CTE DB-SE-C §4.4.1)
  W_zap:          number;  // kN — concrete self-weight
  W_soil:         number;  // kN — soil over footing
  N_total_k:      number;  // kN — N_k + W_zap + W_soil
  FS_vuelco_x:    number;  // (N_total · B/2) / |My_k|
  FS_vuelco_y:    number;  // (N_total · L/2) / |Mx_k|

  // SLS pressure distribution (full contact assumed for display)
  sigma_max:      number;  // kPa — peak corner pressure (SLS)
  sigma_min:      number;  // kPa — min corner pressure (SLS, <0 → tension)
  sigma_eff:      number;  // kPa — Meyerhof uniform (used for bearing check)

  // Bearing capacity (cohesive art. 4.3.2)
  qh:             number;  // kPa — ultimate capacity (before γ_R)
  qadm:           number;  // kPa — admissible (qh/γ_R cohesive, direct granular)

  // Sliding
  Rd_slide:       number;  // kN

  // ELU structural
  sigma_Ed:       number;  // kPa — ELU effective pressure (over B'_Ed × L'_Ed)
  d_x:            number;  // mm — effective depth, x bars (top layer)
  d_y:            number;  // mm — effective depth, y bars (bottom layer)
  ax:             number;  // mm — cantilever arm x
  ay:             number;  // mm — cantilever arm y

  // Rigid/flexible classification (CE art. 55.1 / EHE-08 art. 58.2.1)
  // Rigid: max(v_x, v_y) ≤ 2·h → strut-and-tie (biela-tirante)
  // Flexible: max(v_x, v_y) > 2·h → beam bending + punching
  v_max_x:        number;  // m — cantilever x = (B − bc)/2
  v_max_y:        number;  // m — cantilever y = (L − hc)/2
  is_rigid:       boolean; // true if max(v_x, v_y) ≤ 2·h

  // Bending (flexible) OR biela-tirante (rigid), unified As_req_{x,y}
  // For flexible footings: MEd_{x,y} drives As_req_{x,y} via RC bending solver.
  // For rigid footings:    Td_{x,y} drives As_req_{x,y} via tie equilibrium.
  MEd_x:          number;  // kNm/m — bending moment at column face (always computed, informational for rigid)
  MEd_y:          number;  // kNm/m
  Td_x:           number;  // kN — biela-tirante tie force dir. x (EHE art. 58.4.1.2)
  Td_y:           number;  // kN — dir. y
  As_req_x:       number;  // mm²/m — governing demand (method depends on is_rigid)
  As_req_y:       number;  // mm²/m
  As_min_x:       number;  // mm²/m
  As_min_y:       number;  // mm²/m
  As_adopted_x:   number;  // mm²/m
  As_adopted_y:   number;  // mm²/m
  As_prov_x:      number;  // mm²/m
  As_prov_y:      number;  // mm²/m

  // Shear (per m width, at d from column face)
  ell_x:          number;  // mm — shear span x (ax - d_x, clamped ≥ 0)
  ell_y:          number;  // mm — shear span y (ay - d_y, clamped ≥ 0)
  VEd_x:          number;  // kN/m
  VEd_y:          number;  // kN/m
  vRdc:           number;  // MPa — CE art. 44 shear resistance (based on d_x, rho_x)
  VRd_x:          number;  // kN/m
  VRd_y:          number;  // kN/m

  // Punching (CE art. 46)
  d_avg:          number;  // mm — average effective depth
  u1:             number;  // mm — critical perimeter at 2d from column
  vEd_punch:      number;  // MPa — punching shear stress
  vRdc_punch:     number;  // MPa — resistance

  checks:         CheckRow[];
}

const GAMMA_C_RC = 25;      // kN/m³ — reinforced concrete unit weight
const FS_VUELCO_MIN = 1.5;  // CTE DB-SE-C §4.4.1 — stability against overturning

const EMPTY: IsolatedFootingResult = {
  valid: false, ex: 0, ey: 0, B_eff: 0, L_eff: 0,
  W_zap: 0, W_soil: 0, N_total_k: 0, FS_vuelco_x: 0, FS_vuelco_y: 0,
  sigma_max: 0, sigma_min: 0, sigma_eff: 0,
  qh: 0, qadm: 0, Rd_slide: 0,
  sigma_Ed: 0, d_x: 0, d_y: 0, ax: 0, ay: 0,
  v_max_x: 0, v_max_y: 0, is_rigid: false,
  MEd_x: 0, MEd_y: 0, Td_x: 0, Td_y: 0,
  As_req_x: 0, As_req_y: 0, As_min_x: 0, As_min_y: 0,
  As_adopted_x: 0, As_adopted_y: 0, As_prov_x: 0, As_prov_y: 0,
  ell_x: 0, ell_y: 0, VEd_x: 0, VEd_y: 0,
  vRdc: 0, VRd_x: 0, VRd_y: 0,
  d_avg: 0, u1: 0, vEd_punch: 0, vRdc_punch: 0,
  checks: [],
};

function invalid(msg: string): IsolatedFootingResult {
  return { ...EMPTY, error: msg };
}

const DEG = Math.PI / 180;

export function calcIsolatedFooting(inp: IsolatedFootingInputs): IsolatedFootingResult {
  // ── Basic validation ────────────────────────────────────────────────────────
  const B  = inp.B  as number;
  const L  = inp.L  as number;
  const h  = inp.h  as number;
  const bc = inp.bc as number;
  const hc = inp.hc as number;
  const Df = inp.Df as number;
  const cover = inp.cover as number;  // mm

  const N_k   = inp.N_k   as number;
  const Mx_k  = inp.Mx_k  as number;
  const My_k  = inp.My_k  as number;
  const H_k   = inp.H_k   as number;
  const N_Ed  = inp.N_Ed  as number;
  const Mx_Ed = inp.Mx_Ed as number;
  const My_Ed = inp.My_Ed as number;

  const fck  = inp.fck  as number;
  const fyk  = inp.fyk  as number;

  const phi_x = inp.phi_x as number;  // mm
  const s_x   = inp.s_x   as number;  // mm
  const phi_y = inp.phi_y as number;  // mm
  const s_y   = inp.s_y   as number;  // mm

  const soilType   = inp.soilType   as string;
  const c_soil     = inp.c_soil     as number;  // kPa
  const phi_soil   = inp.phi_soil   as number;  // °
  const gamma_soil = inp.gamma_soil as number;  // kN/m³
  const gamma_R    = inp.gamma_R    as number;
  const N_spt      = inp.N_spt      as number;
  const mu         = inp.mu         as number;
  const c_base     = inp.c_base     as number;  // kPa

  if (B <= 0 || L <= 0 || h <= 0) return invalid('B, L y h deben ser > 0');
  if (bc <= 0 || hc <= 0) return invalid('bc y hc deben ser > 0');
  if (bc >= B || hc >= L) return invalid('El pilar debe ser menor que la zapata');
  if (Df <= 0) return invalid('Df debe ser > 0');
  if (N_k <= 0) return invalid('N_k debe ser > 0 (compresión)');
  if (N_Ed <= 0) return invalid('N_Ed debe ser > 0');
  if (cover <= 0) return invalid('Recubrimiento debe ser > 0');
  if (h > Df) return invalid('El canto h no puede superar la profundidad de cimentación Df');
  if (s_x <= 0 || s_y <= 0) return invalid('Separación de barras debe ser > 0');
  if (phi_x <= 0 || phi_y <= 0) return invalid('Diámetro de barras debe ser > 0');

  const mat  = getConcrete(fck);
  const fcd  = mat.fcd;   // MPa
  const fctm = mat.fctm;  // MPa
  const fyd  = fyk / 1.15;  // MPa

  // ── Effective depths (mm) ────────────────────────────────────────────────────
  // x bars in bottom layer (parallel to B, larger d_x — governs bending-x)
  // y bars in second layer above (parallel to L, smaller d_y)
  const d_x = h * 1000 - cover - phi_x / 2;            // mm
  const d_y = h * 1000 - cover - phi_x - phi_y / 2;    // mm

  if (d_x <= 0 || d_y <= 0) return invalid('Canto insuficiente para el recubrimiento indicado');

  // ── SLS eccentricities (m) ───────────────────────────────────────────────────
  const ex = Math.abs(My_k / N_k);   // eccentricity in x (from My)
  const ey = Math.abs(Mx_k / N_k);   // eccentricity in y (from Mx)

  // Meyerhof effective dimensions
  const B_eff = Math.max(B - 2 * ex, 0);
  const L_eff = Math.max(L - 2 * ey, 0);

  if (B_eff <= 0 || L_eff <= 0) return invalid('Excentricidad excesiva: B\' ≤ 0 o L\' ≤ 0 (vuelco)');

  // Full-contact pressure distribution (trapezoid, for display)
  const A_full = B * L;
  const sigma_c = N_k / A_full;
  const sigma_max = sigma_c * (1 + 6 * ex / B + 6 * ey / L);
  const sigma_min = sigma_c * (1 - 6 * ex / B - 6 * ey / L);

  // Meyerhof uniform pressure on effective area (for bearing check)
  const sigma_eff = N_k / (B_eff * L_eff);

  // ── Bearing capacity ─────────────────────────────────────────────────────────
  let qh   = 0;
  let qadm = 0;

  if (soilType === 'cohesive') {
    const phi_rad = phi_soil * DEG;
    const q = gamma_soil * Df;  // kPa — overburden

    // Bearing capacity factors (Meyerhof generalised — standard form)
    const Nq = Math.exp(Math.PI * Math.tan(phi_rad)) * Math.pow(Math.tan(45 * DEG + phi_rad / 2), 2);
    const Nc = phi_soil > 0
      ? (Nq - 1) / Math.tan(phi_rad)
      : Math.PI + 2;   // ≈ 5.14 undrained
    const Ng = 2 * (Nq + 1) * Math.tan(phi_rad);

    // Hansen shape factors
    const rat = B_eff / L_eff;
    const sc = 1 + rat * (Nq / Nc);
    const sq = 1 + rat * Math.sin(phi_rad);
    const sg = Math.max(1 - 0.4 * rat, 0.6);

    // Hansen depth factors (Df/B')
    const ratio = Df / B_eff;
    const k = ratio <= 1 ? ratio : Math.atan(ratio);  // rad when Df/B'>1
    const dc = 1 + 0.4 * k;
    const dq = phi_soil > 0
      ? 1 + 2 * Math.tan(phi_rad) * Math.pow(1 - Math.sin(phi_rad), 2) * k
      : 1;
    const dg = 1;

    qh = c_soil * Nc * sc * dc
       + q * Nq * sq * dq
       + 0.5 * gamma_soil * B_eff * Ng * sg * dg;
    qadm = qh / gamma_R;
  } else {
    // Granular — CTE DB-SE-C art. 4.3.3 (NSPT method, settlement ≤ 25mm)
    qadm = B_eff <= 1.2
      ? 24 * N_spt * B_eff
      : 16 * N_spt * Math.pow((B_eff + 0.3) / B_eff, 2);
    qh = qadm;  // no separate γ_R in this method
  }

  // ── Stability against overturning (CTE DB-SE-C §4.4.1) ───────────────────────
  // Characteristic self-weight + soil cover above footing + applied vertical load.
  // Check both axes: FS = M_resist / M_overturn ≥ 1.5
  //   About y-axis (tipping in x direction): M_overturn = |My_k|, arm = B/2
  //   About x-axis (tipping in y direction): M_overturn = |Mx_k|, arm = L/2
  const W_zap  = GAMMA_C_RC * B * L * h;                                // kN
  const h_soil = Math.max(Df - h, 0);
  const W_soil = gamma_soil * h_soil * (B * L - bc * hc);               // kN
  const N_total_k = N_k + W_zap + W_soil;                                // kN

  const M_stab_x = N_total_k * (B / 2);   // kNm — restoring about y-axis
  const M_stab_y = N_total_k * (L / 2);   // kNm — restoring about x-axis
  const FS_vuelco_x = Math.abs(My_k) > 0 ? M_stab_x / Math.abs(My_k) : Infinity;
  const FS_vuelco_y = Math.abs(Mx_k) > 0 ? M_stab_y / Math.abs(Mx_k) : Infinity;

  // ── Sliding (SLS) ────────────────────────────────────────────────────────────
  const Rd_slide = N_k * mu + c_base * B * L;   // kN

  // ── ELU effective pressure ───────────────────────────────────────────────────
  const ex_Ed  = Math.abs(My_Ed / N_Ed);
  const ey_Ed  = Math.abs(Mx_Ed / N_Ed);
  const B_Ed   = Math.max(B - 2 * ex_Ed, 0.01);
  const L_Ed   = Math.max(L - 2 * ey_Ed, 0.01);
  const sigma_Ed = N_Ed / (B_Ed * L_Ed);  // kPa

  // ── Cantilever arms (mm) ─────────────────────────────────────────────────────
  const ax = ((B - bc) / 2) * 1000;   // mm — x arm (from column face to footing edge)
  const ay = ((L - hc) / 2) * 1000;   // mm — y arm

  // ── Rigid/flexible classification (CE art. 55.1 / EHE-08 art. 58.2.1) ────────
  // Rigid if max(v_x, v_y) ≤ 2·h. Rigid footings behave as compression struts;
  // flexible footings behave as beams/slabs. Different methods apply:
  //   Rigid:    biela-tirante (strut-and-tie) → Td = Nd·(B−bc)/(6.8·d)
  //             No punching (strut behaviour, no flexural shear transfer)
  //   Flexible: standard bending at column face + punching at 2d perimeter
  // Using flexible bending on rigid footings UNDER-ESTIMATES steel by ~40-50%.
  const v_max_x = (B - bc) / 2;         // m
  const v_max_y = (L - hc) / 2;         // m
  const v_max   = Math.max(v_max_x, v_max_y);
  const is_rigid = v_max <= 2 * h;

  // ── Bending at column face (always computed — used when flexible, displayed always) ──
  // Moment at column face: MEd = σ_Ed · arm² / 2
  const MEd_x = sigma_Ed * Math.pow(ax / 1000, 2) / 2;   // kNm/m
  const MEd_y = sigma_Ed * Math.pow(ay / 1000, 2) / 2;   // kNm/m

  function reqAs(MEd: number, d: number): number {
    if (MEd <= 0) return 0;
    const mu_dim = (MEd * 1e6) / (1000 * d * d * fcd);  // dimensionless
    if (mu_dim >= 0.5) return Infinity;
    const omega = 1 - Math.sqrt(1 - 2 * mu_dim);
    return (omega * 1000 * d * fcd) / fyd;  // mm²/m
  }

  function minAs(d: number): number {
    return Math.max(0.26 * fctm / fyk * 1000 * d, 0.0013 * 1000 * d);  // mm²/m
  }

  const As_req_bend_x = reqAs(MEd_x, d_x);
  const As_req_bend_y = reqAs(MEd_y, d_y);

  // ── Biela-tirante tie force (CE art. 55.2 / EHE-08 art. 58.4.1.2) ────────────
  // Concentric derivation: R₁d = σ_Ed·(B/2)·L, x₁ = B/4 from column axis, a₁ = bc
  //   Td = R₁d·(x₁ − 0.25·a₁)/(0.85·d) = σ_Ed·L·B·(B − bc)/(6.8·d)
  // Eccentric: σ_Ed is Meyerhof-amplified (N_Ed/(B'·L')), applied over full (B×L)
  // footprint → conservative (over-estimates the half-footing resultant).
  // Units: σ_Ed [kPa] · L [m] · B [m] · (B−bc) [m] / (6.8 · d_x [m]) = [kN]
  const Td_x = sigma_Ed * L * B * (B - bc) / (6.8 * (d_x / 1000));  // kN
  const Td_y = sigma_Ed * B * L * (L - hc) / (6.8 * (d_y / 1000));  // kN
  // Tie area (total across perpendicular width) → per meter for UI consistency
  const As_req_tie_x = (Td_x * 1000 / fyd) / L;   // mm²/m (spread across L)
  const As_req_tie_y = (Td_y * 1000 / fyd) / B;   // mm²/m (spread across B)

  // Governing demand: method depends on classification
  const As_req_x = is_rigid ? As_req_tie_x : As_req_bend_x;
  const As_req_y = is_rigid ? As_req_tie_y : As_req_bend_y;
  const As_min_x = minAs(d_x);
  const As_min_y = minAs(d_y);
  const As_adopted_x = Math.max(As_req_x, As_min_x);
  const As_adopted_y = Math.max(As_req_y, As_min_y);

  // Provided (Aφ / s * 1000 mm)
  const As_prov_x = (getBarArea(phi_x) / s_x) * 1000;  // mm²/m
  const As_prov_y = (getBarArea(phi_y) / s_y) * 1000;  // mm²/m

  // ── Shear (CE art. 44, at d from column face) ────────────────────────────────
  const ell_x = Math.max(ax - d_x, 0);   // mm
  const ell_y = Math.max(ay - d_y, 0);   // mm

  const VEd_x = sigma_Ed * (ell_x / 1000);   // kN/m
  const VEd_y = sigma_Ed * (ell_y / 1000);   // kN/m

  // vRd,c — using d_x and ρ_x (conservative: same vRdc for both directions)
  const k_sh = Math.min(1 + Math.sqrt(200 / d_x), 2.0);
  const rhoL_x = Math.min(As_prov_x / (1000 * d_x), 0.02);  // dimensionless
  const vRdc_x = Math.max(
    (0.18 / 1.5) * k_sh * Math.pow(100 * rhoL_x * fck, 1 / 3),
    0.035 * Math.pow(k_sh, 1.5) * Math.sqrt(fck),
  );  // MPa
  // For y direction, use d_y and rhoL_y
  const k_sh_y = Math.min(1 + Math.sqrt(200 / d_y), 2.0);
  const rhoL_y = Math.min(As_prov_y / (1000 * d_y), 0.02);
  const vRdc_y = Math.max(
    (0.18 / 1.5) * k_sh_y * Math.pow(100 * rhoL_y * fck, 1 / 3),
    0.035 * Math.pow(k_sh_y, 1.5) * Math.sqrt(fck),
  );  // MPa

  const vRdc = vRdc_x;  // for result display (x direction, typically critical)
  const VRd_x = vRdc_x * 1000;   // kN/m
  const VRd_y = vRdc_y * 1000;   // kN/m

  // ── Punching (CE art. 46 — interior column, β=1.0) ──────────────────────────
  const d_avg = (d_x + d_y) / 2;   // mm
  // u1 = rectangular perimeter at 2d from column faces (rounded corners, CE art. 46)
  const u1_rect = 2 * (bc * 1000 + hc * 1000) + 2 * Math.PI * 2 * d_avg;

  const vEd_punch = (1.0 * N_Ed * 1000) / (u1_rect * d_avg);   // MPa

  const k_p = Math.min(1 + Math.sqrt(200 / d_avg), 2.0);
  const rhoL_avg = Math.min((As_prov_x + As_prov_y) / 2 / (1000 * d_avg), 0.02);
  const vRdc_punch = Math.max(
    (0.18 / 1.5) * k_p * Math.pow(100 * rhoL_avg * fck, 1 / 3),
    0.035 * Math.pow(k_p, 1.5) * Math.sqrt(fck),
  );  // MPa

  // ── Check rows ───────────────────────────────────────────────────────────────
  const checks: CheckRow[] = [];

  // Bearing
  checks.push(makeCheck(
    'bearing',
    'Presión bajo zapata',
    sigma_eff, qadm,
    `${sigma_eff.toFixed(1)} kPa`, `${qadm.toFixed(1)} kPa`,
    'DB-SE-C art. 4.3.2/4.3.3',
  ));

  // Tension (only if sigma_min < 0)
  if (sigma_min < 0) {
    checks.push({
      id: 'tension',
      description: 'Contacto parcial — tracción bajo zapata',
      value: `σmin=${sigma_min.toFixed(1)} kPa`,
      limit: '0 kPa',
      utilization: 0.85,  // always WARN (partial contact, not failure)
      status: 'warn',
      article: 'DB-SE-C',
    });
  }

  // Eccentricity x
  const util_ex = ex / (B / 6);
  checks.push({
    id: 'eccentricity-x',
    description: 'Excentricidad ex ≤ B/6 (núcleo central)',
    value: `|ex|=${(ex * 1000).toFixed(0)} mm`,
    limit: `B/6=${(B / 6 * 1000).toFixed(0)} mm`,
    utilization: ex > 0 ? util_ex : 0,
    status: ex > B / 6 ? 'warn' : 'ok',
    article: 'CTE DB-SE-C',
  });

  // Eccentricity y
  const util_ey = ey / (L / 6);
  checks.push({
    id: 'eccentricity-y',
    description: 'Excentricidad ey ≤ L/6 (núcleo central)',
    value: `|ey|=${(ey * 1000).toFixed(0)} mm`,
    limit: `L/6=${(L / 6 * 1000).toFixed(0)} mm`,
    utilization: ey > 0 ? util_ey : 0,
    status: ey > L / 6 ? 'warn' : 'ok',
    article: 'CTE DB-SE-C',
  });

  // Overturning about y-axis (M_overturn = |My_k|, tipping in x direction)
  if (Math.abs(My_k) > 0) {
    checks.push({
      id: 'overturning-x',
      description: 'Estabilidad al vuelco (eje y, dir. x)',
      value: `FS = ${FS_vuelco_x.toFixed(2)}`,
      limit: `≥ ${FS_VUELCO_MIN.toFixed(2)}`,
      utilization: FS_VUELCO_MIN / FS_vuelco_x,
      status: FS_vuelco_x >= FS_VUELCO_MIN ? 'ok' : 'fail',
      article: 'CTE DB-SE-C §4.4.1',
    });
  }

  // Overturning about x-axis (M_overturn = |Mx_k|, tipping in y direction)
  if (Math.abs(Mx_k) > 0) {
    checks.push({
      id: 'overturning-y',
      description: 'Estabilidad al vuelco (eje x, dir. y)',
      value: `FS = ${FS_vuelco_y.toFixed(2)}`,
      limit: `≥ ${FS_VUELCO_MIN.toFixed(2)}`,
      utilization: FS_VUELCO_MIN / FS_vuelco_y,
      status: FS_vuelco_y >= FS_VUELCO_MIN ? 'ok' : 'fail',
      article: 'CTE DB-SE-C §4.4.1',
    });
  }

  // Sliding (only if H_k > 0)
  if (H_k > 0) {
    checks.push(makeCheckQty(
      'sliding',
      'Deslizamiento H_k ≤ Rd',
      H_k, Rd_slide,
      'force',
      'DB-SE-C',
    ));
  }

  // Classification info row (always present — informational, always "ok")
  const v_ratio = v_max / h;
  checks.push({
    id: 'footing-class',
    description: is_rigid
      ? 'Clasificación — rígida (biela-tirante, CE art. 55.2)'
      : 'Clasificación — flexible (flexión + punzonamiento, CE art. 55.1)',
    value: `v_max/h = ${v_ratio.toFixed(2)}`,
    limit: is_rigid ? '≤ 2.00 (rígida)' : '> 2.00 (flexible)',
    utilization: 0,
    status: 'ok',
    article: 'CE art. 55 / EHE-08 art. 58.2.1',
  });

  // Bending x (label depends on method)
  const bending_label_x = is_rigid ? 'Armadura dir. x (biela-tirante)' : 'Armadura flexión dir. x';
  const bending_art_x = is_rigid ? 'CE art. 55.2 / EHE art. 58.4.1.2' : 'CE art. 9.1';
  if (As_req_x === Infinity) {
    checks.push({
      id: 'bending-x', description: `${bending_label_x} — sección sobrearmada`,
      value: '∞', limit: `${As_prov_x.toFixed(0)} mm²/m`,
      utilization: 2, status: 'fail', article: bending_art_x,
    });
  } else {
    checks.push(makeCheck(
      'bending-x', bending_label_x,
      As_adopted_x, As_prov_x,
      `${As_adopted_x.toFixed(0)} mm²/m`, `${As_prov_x.toFixed(0)} mm²/m`,
      bending_art_x,
    ));
  }

  // Bending y
  const bending_label_y = is_rigid ? 'Armadura dir. y (biela-tirante)' : 'Armadura flexión dir. y';
  const bending_art_y = is_rigid ? 'CE art. 55.2 / EHE art. 58.4.1.2' : 'CE art. 9.1';
  if (As_req_y === Infinity) {
    checks.push({
      id: 'bending-y', description: `${bending_label_y} — sección sobrearmada`,
      value: '∞', limit: `${As_prov_y.toFixed(0)} mm²/m`,
      utilization: 2, status: 'fail', article: bending_art_y,
    });
  } else {
    checks.push(makeCheck(
      'bending-y', bending_label_y,
      As_adopted_y, As_prov_y,
      `${As_adopted_y.toFixed(0)} mm²/m`, `${As_prov_y.toFixed(0)} mm²/m`,
      bending_art_y,
    ));
  }

  // Shear x (only if critical section exists)
  if (ell_x > 0) {
    checks.push(makeCheckQty(
      'shear-x', 'Cortante dir. x (a d del pilar)',
      VEd_x, VRd_x,
      'linearLoad',
      'CE art. 44',
    ));
  }

  // Shear y
  if (ell_y > 0) {
    checks.push(makeCheckQty(
      'shear-y', 'Cortante dir. y (a d del pilar)',
      VEd_y, VRd_y,
      'linearLoad',
      'CE art. 44',
    ));
  }

  // Punching — only applies to flexible footings.
  // Rigid footings transfer load through compression struts; the 2d critical
  // perimeter at d_avg ~ h lies near or beyond the footing edge and the shear
  // flow assumed by CE art. 46 does not represent the real failure mode.
  if (!is_rigid) {
    checks.push(makeCheckQty(
      'punching', 'Punzonamiento (a 2d del pilar)',
      vEd_punch, vRdc_punch,
      'stress',
      'CE art. 46',
    ));
  }

  // Spacing x
  const s_max = 300;  // mm — CE art. 42.3
  checks.push({
    id: 'spacing-x',
    description: 'Separación barras dir. x',
    value: `${s_x.toFixed(0)} mm`,
    limit: `${s_max} mm`,
    utilization: s_x / s_max,
    status: toStatus(s_x / s_max),
    article: 'CE art. 42.3',
  });

  // Spacing y
  checks.push({
    id: 'spacing-y',
    description: 'Separación barras dir. y',
    value: `${s_y.toFixed(0)} mm`,
    limit: `${s_max} mm`,
    utilization: s_y / s_max,
    status: toStatus(s_y / s_max),
    article: 'CE art. 42.3',
  });

  const overall_fail = checks.some((c) => c.status === 'fail');

  return {
    valid: !overall_fail,
    ex, ey, B_eff, L_eff,
    W_zap, W_soil, N_total_k, FS_vuelco_x, FS_vuelco_y,
    sigma_max, sigma_min, sigma_eff,
    qh, qadm,
    Rd_slide,
    sigma_Ed, d_x, d_y, ax, ay,
    v_max_x, v_max_y, is_rigid,
    MEd_x, MEd_y, Td_x, Td_y,
    As_req_x, As_req_y, As_min_x, As_min_y,
    As_adopted_x, As_adopted_y, As_prov_x, As_prov_y,
    ell_x, ell_y, VEd_x, VEd_y,
    vRdc, VRd_x, VRd_y,
    d_avg, u1: u1_rect, vEd_punch, vRdc_punch,
    checks,
  };
}
