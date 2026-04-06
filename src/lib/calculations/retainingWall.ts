// RC Retaining Wall (muro de contención en ménsula) — CE + CTE DB-SE-C (Spain)
// All stability calculations per unit wall width (1 m).
// Active earth pressure: Coulomb Ka (with wall friction δ).
// Seismic: Mononobe-Okabe pseudostatic method (NCSP-07 / EC8 Annex E).
// Structural design: ULS RC rectangular sections (walls have no closed stirrups).
//
// CE art. 18.2              — bending resistance
// CE Anejo 19 art. 9.6.2   — vertical minimum reinforcement (walls)
// CE Anejo 19 art. 9.6.3   — horizontal minimum reinforcement (walls)
// CE Anejo 19 art. 9.6.4   — transverse ties (walls)
// CE art. 9.1              — general minimum reinforcement (bending, footing)
// CE art. 44.2.3.2.1       — shear without transverse reinforcement
// CTE DB-SE-C §4.4 — geotechnical stability checks
// NCSE-02 / NCSP-07 — seismic stability

import { type RetainingWallInputs } from '../../data/defaults';
import { getConcrete } from '../../data/materials';
import { GAMMA_S } from '../../data/factors';
import { makeCheck, toStatus, solveRCBending, type CheckRow } from './types';
import { GAMMA_G, GAMMA_Q } from './loadGen';

export type { CheckRow } from './types';

/** Provided reinforcement area from ø+spacing notation (mm²/m). Returns 0 if either is ≤ 0. */
export function asBar(diam: number, sep: number): number {
  if (diam <= 0 || sep <= 0) return 0;
  return (Math.PI / 4) * diam * diam / sep * 1000;
}

const GAMMA_C_RC = 25;    // kN/m³ — reinforced concrete unit weight
const GAMMA_W    = 10;    // kN/m³ — water unit weight

export interface RetainingWallResult {
  valid: boolean;
  error?: string;
  // Key values
  Ka: number;
  kh_derived: number;         // kh = S · Ab (derived from inputs)
  kv_derived: number;         // kv = kh / 2 (derived from inputs)
  KAD?: number;               // only when kh > 0
  EAH_total: number;          // kN/m
  EW?: number;                // kN/m (only when hw < H_total)
  ΣV: number;                 // kN/m
  e: number;                  // eccentricity (m)
  sigma_max: number;          // kPa
  sigma_min: number;          // kPa
  FS_vuelco: number;
  FS_desliz: number;
  FS_vuelco_seis?: number;    // only when kh > 0
  FS_desliz_seis?: number;    // only when kh > 0
  seismicUnstable?: boolean;  // true if φ_eff = 0 guard was triggered
  // Structural (per m width)
  MEd_fuste: number;  As_req_fuste: number;  As_min_fuste: number;
  MEd_talon: number;  As_req_talon: number;  As_min_talon: number;
  MEd_punta: number;  As_req_punta: number;  As_min_punta: number;
  // Provided rebar (0 if zone not specified)
  As_prov_fv_int: number;
  As_prov_fv_ext: number;
  As_prov_fh:     number;
  As_prov_zs:     number;
  As_prov_zi:     number;
  As_prov_zt_inf: number;
  As_prov_zt_sup: number;
  As_prov_zt:     number;   // = inf + sup (total both faces)
  // Secondary minimums
  As_min_h_fuste:       number;
  As_min_trans_zap_inf: number;   // transverse inf (30% × As_t, min Ø12@20)
  As_min_trans_zap_sup: number;   // transverse sup (30% × As_p, min Ø12@20)
  checks: CheckRow[];
}

function invalid(error: string): RetainingWallResult {
  return {
    valid: false, error,
    Ka: 0, kh_derived: 0, kv_derived: 0, EAH_total: 0, ΣV: 0, e: 0, sigma_max: 0, sigma_min: 0,
    FS_vuelco: 0, FS_desliz: 0,
    MEd_fuste: 0, As_req_fuste: 0, As_min_fuste: 0,
    MEd_talon: 0, As_req_talon: 0, As_min_talon: 0,
    MEd_punta: 0, As_req_punta: 0, As_min_punta: 0,
    As_prov_fv_int: 0, As_prov_fv_ext: 0, As_prov_fh: 0,
    As_prov_zs: 0, As_prov_zi: 0, As_prov_zt_inf: 0, As_prov_zt_sup: 0, As_prov_zt: 0,
    As_min_h_fuste: 0, As_min_trans_zap_inf: 0, As_min_trans_zap_sup: 0,
    checks: [],
  };
}

export function calcRetainingWall(inp: RetainingWallInputs): RetainingWallResult {
  // ── 0. Input validation ──────────────────────────────────────────────────
  if (inp.H <= 0)    return invalid('H debe ser > 0');
  if (inp.hf <= 0)   return invalid('hf debe ser > 0');
  if (inp.tFuste <= 0) return invalid('tFuste debe ser > 0');
  if (inp.bPunta < 0 || inp.bTalon < 0) return invalid('Proyecciones de zapata no pueden ser negativas');

  // ── 1. Geometry (already in m) ──────────────────────────────────────────
  const H_m    = inp.H    as number;
  const hf_m   = inp.hf   as number;
  const tF_m   = inp.tFuste as number;
  const bP_m   = inp.bPunta as number;
  const bT_m   = inp.bTalon as number;
  const hw_m   = (inp.hasWater as boolean) ? (inp.hw as number) : (H_m + hf_m + 1);

  const H_total = H_m + hf_m;
  const B_m     = bP_m + tF_m + bT_m;

  if (B_m <= 0) return invalid('Anchura total de zapata debe ser > 0');

  // Effective depth guard — walls have no closed stirrups.
  // Assumed: φ_main=16mm vertical, φ_dist=12mm horizontal → cover + 6 + 8 = cover + 14mm.
  // cover and thicknesses are in m → convert to mm for structural calcs.
  const cover_mm   = (inp.cover as number) * 1000;
  const d_fuste_mm = tF_m * 1000 - cover_mm - 14;
  const d_talon_mm = hf_m * 1000 - cover_mm - 14;
  const d_punta_mm = hf_m * 1000 - cover_mm - 14;
  if (d_fuste_mm <= 0 || d_talon_mm <= 0 || d_punta_mm <= 0)
    return invalid('Recubrimiento excede el canto de la seccion');

  // ── 1b. Seismic coefficients (NCSP-07 / NCSE-02) ────────────────────────
  // kh = S · Ab · ρ  (ρ = 1 for retaining walls)
  // kv = kh / 2
  const Ab = inp.Ab as number;
  const S  = inp.S  as number;
  const kh = S * Ab;
  const kv = kh / 2;

  // ── 2. Material properties ───────────────────────────────────────────────
  const mat = getConcrete(inp.fck);
  const fcd  = mat.fcd;            // MPa
  const fyd  = inp.fyk / GAMMA_S;  // MPa
  // CE art. 9.1 — general minimum reinforcement for bending (footing)
  // As,min = max(0.26·fctm/fyk · b·d, 0.0013·b·d)
  const asMin91 = (d_mm: number): number =>
    Math.max(0.26 * mat.fctm / inp.fyk * 1000 * d_mm, 0.0013 * 1000 * d_mm);

  // ── 3. Active earth pressure coefficient (Coulomb) ───────────────────────
  const phi_r   = (inp.phi   * Math.PI) / 180;
  const delta_r = (inp.delta * Math.PI) / 180;
  const cos_phi = Math.cos(phi_r);
  const cos_d   = Math.cos(delta_r);
  const sin_d   = Math.sin(delta_r);

  // Ka = cos²(φ) / { cos(δ) · [1 + √(sin(φ+δ)·sin(φ) / cos(δ))]² }
  const Ka_radicand = Math.sin(phi_r + delta_r) * Math.sin(phi_r) / cos_d;
  const Ka_denom    = cos_d * Math.pow(1 + Math.sqrt(Math.max(Ka_radicand, 0)), 2);
  const Ka          = (cos_phi * cos_phi) / Ka_denom;

  // Rankine passive (horizontal backfill, no wall friction on passive side)
  const Kp = Math.pow(Math.tan(Math.PI / 4 + phi_r / 2), 2);

  // ── 4. Pressure zones ────────────────────────────────────────────────────
  const h_dry     = Math.min(hw_m, H_total);   // dry zone height from top (m)
  const h_wet     = H_total - h_dry;            // saturated zone height (m)
  const gamma_sub = inp.gammaSat - GAMMA_W;     // submerged unit weight (kN/m³)

  // ── 5. Active earth pressure components (per m width, kN/m) ─────────────
  const EA_dry      = 0.5 * Ka * inp.gammaSuelo * h_dry * h_dry;
  const EA_q        = Ka * inp.q * H_total;
  const EA_wet_rect = Ka * inp.gammaSuelo * h_dry * h_wet;
  const EA_wet_tri  = 0.5 * Ka * gamma_sub * h_wet * h_wet;
  const EA_soil     = EA_dry + EA_q + EA_wet_rect + EA_wet_tri;

  const EA_H_soil = EA_soil * cos_d;
  const EA_V_soil = EA_soil * sin_d;

  const EW        = 0.5 * GAMMA_W * h_wet * h_wet;  // hydrostatic (kN/m)
  const EAH_total = EA_H_soil + EW;

  // ── 6. Overturning moment arms (from toe tip) ────────────────────────────
  const arm_dry      = h_wet + h_dry / 3;  // resultant of dry triangle
  const arm_q        = H_total / 2;
  const arm_wet_rect = h_wet / 2;
  const arm_wet_tri  = h_wet / 3;
  const arm_water    = h_wet / 3;

  const Mo = EA_dry * cos_d * arm_dry
           + EA_q * cos_d * arm_q
           + EA_wet_rect * cos_d * arm_wet_rect
           + EA_wet_tri * cos_d * arm_wet_tri
           + EW * arm_water;

  // ── 7. Vertical forces and restoring moments ─────────────────────────────
  const W_fuste    = GAMMA_C_RC * tF_m * H_m;
  const W_zap      = GAMMA_C_RC * B_m  * hf_m;

  const min_hw_H   = Math.min(hw_m, H_m);
  const wet_H_heel = H_m - min_hw_H;
  const W_dry_heel = inp.gammaSuelo * min_hw_H  * bT_m;
  const W_wet_heel = wet_H_heel > 0 ? inp.gammaSat * wet_H_heel * bT_m : 0;
  const W_q_heel   = inp.q * bT_m;

  const x_fuste = bP_m + tF_m / 2;
  const x_zap   = B_m / 2;
  const x_heel  = bP_m + tF_m + bT_m / 2;

  // Hydrostatic uplift on footing base when water table is within the wall height.
  // Upward pressure = γw·h_wet, uniform over B_m → acts at B/2 from toe.
  const U_uplift = GAMMA_W * h_wet * B_m;   // kN/m (upward)

  const ΣV = W_fuste + W_zap + W_dry_heel + W_wet_heel + W_q_heel + EA_V_soil - U_uplift;

  const Mr = W_fuste * x_fuste
           + W_zap   * x_zap
           + (W_dry_heel + W_wet_heel + W_q_heel) * x_heel
           + EA_V_soil * B_m   // EA_V acts at heel face (restoring)
           - U_uplift * (B_m / 2);  // uplift acts at B/2 — reduces restoring moment

  if (ΣV <= 0) return invalid('Empuje hidrostático mayor que el peso total — zapata levanta');

  // ── 8. Static stability ──────────────────────────────────────────────────
  const Ep        = 0.5 * Kp * inp.gammaSuelo * hf_m * hf_m;  // passive on toe
  const FS_vuelco = Mo > 0 ? Mr / Mo : Infinity;
  const FS_desliz = EAH_total > 0 ? (ΣV * inp.mu + Ep) / EAH_total : Infinity;
  const e         = B_m / 2 - (Mr - Mo) / ΣV;

  // Footing stress (two branches)
  let sigma_max: number;
  let sigma_min: number;
  let a_eff: number;

  if (e <= B_m / 6) {
    // Trapezoidal — resultant inside middle third
    a_eff     = B_m;
    sigma_max = (ΣV / B_m) * (1 + 6 * e / B_m);
    sigma_min = (ΣV / B_m) * (1 - 6 * e / B_m);
  } else {
    // Triangular — resultant outside middle third
    a_eff     = 3 * (B_m / 2 - e);
    sigma_max = a_eff > 0 ? 2 * ΣV / a_eff : Infinity;
    sigma_min = 0;
  }

  // Guard: e ≥ B/3 → a_eff ≤ 0 → skip structural
  const exceedsBoundary = e >= B_m / 3;

  // ── 9. Build checks ──────────────────────────────────────────────────────
  const checks: CheckRow[] = [];

  checks.push(makeCheck(
    'vuelco', 'Estabilidad al vuelco',
    1.5, FS_vuelco,
    `FS = ${FS_vuelco.toFixed(2)}`, '≥ 1.50',
    'CTE DB-SE-C §4.4.1',
  ));
  checks.push(makeCheck(
    'deslizamiento', 'Estabilidad al deslizamiento',
    1.5, FS_desliz,
    `FS = ${FS_desliz.toFixed(2)}`, '≥ 1.50',
    'CTE DB-SE-C §4.4.2',
  ));
  checks.push(makeCheck(
    'excentricidad', 'Resultante en tercer medio (e ≤ B/6)',
    e, B_m / 6,
    `e = ${e.toFixed(3)} m`, `B/6 = ${(B_m / 6).toFixed(3)} m`,
    'CTE DB-SE-C §4.4.3',
  ));
  checks.push(makeCheck(
    'sigma-max', 'Tension maxima en zapata',
    sigma_max, inp.sigmaAdm,
    `σmax = ${sigma_max.toFixed(1)} kPa`, `σadm = ${inp.sigmaAdm.toFixed(0)} kPa`,
    'CTE DB-SE-C §4.4.4',
  ));
  // sigma-min: direct check (inverted sense — capacity must be ≥ 0).
  // Also fails when e ≥ B/3 (resultant outside kern, a_eff ≤ 0).
  const sigmaMinFail = exceedsBoundary || sigma_min < 0;
  checks.push({
    id: 'sigma-min',
    description: 'Sin tension negativa en zapata (sin levantamiento)',
    value: `σmin = ${sigma_min.toFixed(1)} kPa`,
    limit: '≥ 0 kPa',
    utilization: sigmaMinFail ? 1.5 : 0,
    status: sigmaMinFail ? 'fail' : 'ok',
    article: 'CTE DB-SE-C §4.4.4',
  });

  // ── 10. Mononobe-Okabe (seismic) — kh > 0 ───────────────────────────────
  let KAD: number | undefined;
  let FS_vuelco_seis: number | undefined;
  let FS_desliz_seis: number | undefined;
  let seismicUnstable = false;

  if (kh > 0) {
    const theta    = Math.atan(kh / (1 - kv));
    const phi_eff  = Math.max(phi_r - theta, 0);
    seismicUnstable = phi_r - theta < 0;

    const cos_pe  = Math.cos(phi_eff);
    const cos_dt  = Math.cos(delta_r + theta);
    const cos_t   = Math.cos(theta);
    const rad_arg = Math.sin(phi_eff + delta_r) * Math.sin(phi_eff) / Math.max(cos_dt, 1e-9);
    const KAD_denom = cos_t * cos_dt * Math.pow(1 + Math.sqrt(Math.max(rad_arg, 0)), 2);
    KAD = (cos_pe * cos_pe) / Math.max(KAD_denom, 1e-12);

    const EAD_soil = (
        0.5 * KAD * inp.gammaSuelo * h_dry * h_dry
      + KAD * inp.q * H_total
      + KAD * inp.gammaSuelo * h_dry * h_wet
      + 0.5 * KAD * gamma_sub * h_wet * h_wet
    ) * (1 - kv);

    const ΔEAD_H   = EAD_soil * cos_d - EA_H_soil;
    const EAH_seis = EAD_soil * cos_d + EW;
    const EAV_seis = EAD_soil * sin_d;
    const Mo_seis  = Mo + ΔEAD_H * 0.6 * H_total;  // Seed & Whitman (1970) / NCSP-07

    const ΣV_seis  = W_fuste + W_zap + W_dry_heel + W_wet_heel + W_q_heel + EAV_seis - U_uplift;
    const Mr_seis  = W_fuste * x_fuste + W_zap * x_zap
                   + (W_dry_heel + W_wet_heel + W_q_heel) * x_heel
                   + EAV_seis * B_m
                   - U_uplift * (B_m / 2);

    FS_vuelco_seis = Mo_seis > 0 ? Mr_seis / Mo_seis : Infinity;
    FS_desliz_seis = EAH_seis > 0 ? (ΣV_seis * inp.mu + Ep) / EAH_seis : Infinity;

    checks.push(makeCheck(
      'vuelco-sismico', 'Estabilidad al vuelco (sismica)',
      1.1, FS_vuelco_seis,
      `FS = ${FS_vuelco_seis.toFixed(2)}`, '≥ 1.10',
      'NCSE-02 / NCSP-07',
    ));
    checks.push(makeCheck(
      'deslizamiento-sismico', 'Estabilidad al deslizamiento (sismico)',
      1.1, FS_desliz_seis,
      `FS = ${FS_desliz_seis.toFixed(2)}`, '≥ 1.10',
      'NCSE-02 / NCSP-07',
    ));
  }

  // ── 11. Structural design (ELU) — skip if e ≥ B/3 ───────────────────────
  // Provided reinforcement (0 if zone not specified)
  const As_prov_fv_int = asBar(inp.diam_fv_int as number, inp.sep_fv_int as number);
  const As_prov_fv_ext = asBar(inp.diam_fv_ext as number, inp.sep_fv_ext as number);
  const As_prov_fh     = asBar(inp.diam_fh     as number, inp.sep_fh     as number);
  const As_prov_zs     = asBar(inp.diam_zs     as number, inp.sep_zs     as number);
  const As_prov_zi     = asBar(inp.diam_zi     as number, inp.sep_zi     as number);
  const As_prov_zt_inf = asBar(inp.diam_zt_inf as number, inp.sep_zt_inf as number);
  const As_prov_zt_sup = asBar(inp.diam_zt_sup as number, inp.sep_zt_sup as number);
  const As_prov_zt     = As_prov_zt_inf + As_prov_zt_sup;

  let MEd_fuste = 0, As_req_fuste = 0, As_min_fuste = 0;
  let MEd_talon = 0, As_req_talon = 0, As_min_talon = 0;
  let MEd_punta = 0, As_req_punta = 0, As_min_punta = 0;
  let As_t = 0, As_p = 0;
  let As_min_h_fuste = 0, As_min_trans_zap_inf = 0, As_min_trans_zap_sup = 0;

  if (!exceedsBoundary) {
    const b_w = 1000;  // per unit width (mm)

    // Footing stress at any x measured from toe tip (m), clamped to 0
    const sigmaAt = (x_m: number): number =>
      Math.max(sigma_max - (sigma_max - sigma_min) * x_m / a_eff, 0);

    // ── Fuste (stem cantilever, fixed at footing top, height H_m) ──────────
    const h_d  = Math.min(hw_m, H_m);
    const h_ws = Math.max(H_m - hw_m, 0);

    // q is a variable action (γQ=1.5); soil self-weight terms use γG=1.35
    MEd_fuste = GAMMA_G * (
        0.5 * Ka * inp.gammaSuelo * h_d * h_d * (h_d / 3 + h_ws) * cos_d
      + Ka * inp.gammaSuelo * h_d * h_ws * (h_ws / 2) * cos_d
      + 0.5 * Ka * gamma_sub * h_ws * h_ws * (h_ws / 3) * cos_d
      + 0.5 * GAMMA_W * h_ws * h_ws * (h_ws / 3)
    ) + GAMMA_Q * Ka * inp.q * H_m * (H_m / 2) * cos_d;

    const VEd_fuste = GAMMA_G * (
        0.5 * Ka * inp.gammaSuelo * h_d * h_d * cos_d
      + Ka * inp.gammaSuelo * h_d * h_ws * cos_d
      + 0.5 * Ka * gamma_sub * h_ws * h_ws * cos_d
      + 0.5 * GAMMA_W * h_ws * h_ws
    ) + GAMMA_Q * Ka * inp.q * H_m * cos_d;

    const d_f    = d_fuste_mm;
    const m_f    = MEd_fuste > 0 ? (MEd_fuste * 1e6) / (b_w * d_f * d_f * fcd) : 0;
    As_req_fuste = solveRCBending(MEd_fuste, b_w, d_f, fcd, fyd);
    // CE Anejo 19 art. 9.6.2 — vertical minimum for wall (fuste)
    // Total: 0.002·Ac (gross); split 60% tension face / 40% compression face.
    const As_min_fv_total = 0.002 * b_w * (tF_m * 1000);
    As_min_fuste          = 0.6 * As_min_fv_total;          // trasdós (tension face)
    const As_min_fv_ext_wall = 0.4 * As_min_fv_total;       // intradós (compression face)
    // CE Anejo 19 art. 9.6.3 — horizontal minimum for wall (fuste), per face
    const coef_h = inp.fyk === 400 ? 0.004 : 0.0032;
    As_min_h_fuste = (coef_h / 2) * b_w * (tF_m * 1000);
    const MIN_TRANS_ABS = 565;  // mm²/m ≈ Ø12@20 (absolute floor for transverse rebar)
    const As_f   = Math.max(isFinite(As_req_fuste) ? As_req_fuste : As_min_fuste, As_min_fuste);

    // VRd,c (CE art. 44.2.3.2.1) — walls have no stirrups; use actual ρl when provided
    const k_f    = Math.min(1 + Math.sqrt(200 / d_f), 2.0);
    const rho_f  = Math.min(
      As_prov_fv_int > 0 ? As_prov_fv_int / (b_w * d_f) : As_f / (b_w * d_f),
      0.02,
    );
    const VRdc1_f = (0.18 / 1.5) * k_f * Math.pow(rho_f * inp.fck, 1 / 3) * b_w * d_f / 1000;
    const VRdc2_f = (0.051 / 1.5) * Math.pow(k_f, 1.5) * Math.sqrt(inp.fck) * b_w * d_f / 1000;
    const VRd_c_f = Math.max(VRdc1_f, VRdc2_f);

    // Fuste bending check — upgraded when rebar specified
    if (As_prov_fv_int > 0) {
      checks.push(makeCheck(
        'fuste-bending', 'Armado longitudinal fuste ≥ As,req (flexión)',
        As_req_fuste, As_prov_fv_int,
        `As,prov = ${As_prov_fv_int.toFixed(0)} mm²/m`,
        `As,req = ${As_req_fuste.toFixed(0)} mm²/m`,
        'CE art. 18.2',
      ));
    } else {
      checks.push({
        id: 'fuste-bending',
        description: 'Flexion ELU en fuste',
        value: `MEd = ${MEd_fuste.toFixed(1)} kNm/m`,
        limit: `m = ${m_f.toFixed(3)} ≤ 0.5`,
        utilization: m_f / 0.5,
        status: toStatus(m_f / 0.5),
        article: 'CE art. 18.2',
      });
    }
    checks.push(makeCheck(
      'fuste-shear', 'Cortante ELU en fuste (sin armadura transversal)',
      VEd_fuste, VRd_c_f,
      `VEd = ${VEd_fuste.toFixed(1)} kN/m`, `VRd,c = ${VRd_c_f.toFixed(1)} kN/m`,
      'CE art. 44.2.3.2.1',
    ));
    // Fuste asmin trasdós — CE Anejo 19 art. 9.6.2 (60% of 0.002·Ac on tension face)
    if (As_prov_fv_int > 0) {
      checks.push(makeCheck(
        'fuste-asmin', 'Armadura minima fuste trasdós (60% de 0.002·Ac)',
        As_min_fuste, As_prov_fv_int,
        `As,prov = ${As_prov_fv_int.toFixed(0)} mm²/m`,
        `As,min = ${As_min_fuste.toFixed(0)} mm²/m`,
        'CE Anejo 19 art. 9.6.2',
      ));
    } else {
      const As_f_cap = isFinite(As_req_fuste) && As_req_fuste < As_min_fuste
        ? As_min_fuste * 1.001 : As_f;
      checks.push(makeCheck(
        'fuste-asmin', 'Armadura minima fuste trasdós (60% de 0.002·Ac)',
        As_min_fuste, As_f_cap,
        `As,min = ${As_min_fuste.toFixed(0)} mm²/m`, `As,prov = ${As_f.toFixed(0)} mm²/m`,
        'CE Anejo 19 art. 9.6.2',
      ));
    }
    // Fuste intradós asmin — 40% of 0.002·Ac (CE Anejo 19 art. 9.6.2)
    if (As_prov_fv_ext > 0) {
      checks.push(makeCheck(
        'fuste-asmin-ext', 'Armado cara intradós fuste ≥ As,min (40% de 0.002·Ac)',
        As_min_fv_ext_wall, As_prov_fv_ext,
        `As,prov = ${As_prov_fv_ext.toFixed(0)} mm²/m`,
        `As,min = ${As_min_fv_ext_wall.toFixed(0)} mm²/m`,
        'CE Anejo 19 art. 9.6.2',
      ));
    }
    // Fuste horizontal asmin — CE Anejo 19 art. 9.6.3 (per face)
    if (As_prov_fh > 0) {
      checks.push(makeCheck(
        'fuste-asmin-h', 'Armado horizontal fuste ≥ As,min,h (por cara)',
        As_min_h_fuste, As_prov_fh,
        `As,prov = ${As_prov_fh.toFixed(0)} mm²/m`,
        `As,min,h = ${As_min_h_fuste.toFixed(0)} mm²/m`,
        'CE Anejo 19 art. 9.6.3',
      ));
    }

    // ── Talón (heel cantilever, length bT_m) ────────────────────────────────
    if (bT_m > 0) {
      const x_heel_face  = bP_m + tF_m;
      const sigma_A_heel = sigmaAt(x_heel_face);
      const sigma_B_heel = Math.max(sigma_min, 0);

      // Cantilever fixed at stem face, free at heel tip.
      // M = ∫₀ᴸ q(x)·x dx = L²·(qA + 2·qB)/6  where qA=root, qB=free tip.
      const M_talon_up   = bT_m * bT_m * (sigma_A_heel + 2 * sigma_B_heel) / 6;
      const q_heel_down  = (W_dry_heel + W_wet_heel + W_q_heel) / bT_m + GAMMA_C_RC * hf_m;
      const M_talon_down = q_heel_down * bT_m * bT_m / 2;
      MEd_talon = GAMMA_G * Math.abs(M_talon_up - M_talon_down);

      const d_t    = d_talon_mm;
      const m_t    = MEd_talon > 0 ? (MEd_talon * 1e6) / (b_w * d_t * d_t * fcd) : 0;
      As_req_talon = solveRCBending(MEd_talon, b_w, d_t, fcd, fyd);
      // CE art. 9.1 — general minimum reinforcement for bending (footing)
      As_min_talon = asMin91(d_t);
      As_t = Math.max(isFinite(As_req_talon) ? As_req_talon : As_min_talon, As_min_talon);
      // Transverse inf minimum: engineering criterion (no normative reference for footing)
      As_min_trans_zap_inf = Math.max(0.30 * As_t, MIN_TRANS_ABS);

      if (As_prov_zs > 0) {
        checks.push(makeCheck(
          'talon-bending', 'Armado longitudinal talón ≥ As,req (flexión)',
          As_req_talon, As_prov_zs,
          `As,prov = ${As_prov_zs.toFixed(0)} mm²/m`,
          `As,req = ${As_req_talon.toFixed(0)} mm²/m`,
          'CE art. 18.2',
        ));
        checks.push(makeCheck(
          'talon-asmin', 'Armadura minima talón ≥ As,min (flexión CE art. 9.1)',
          As_min_talon, As_prov_zs,
          `As,prov = ${As_prov_zs.toFixed(0)} mm²/m`,
          `As,min = ${As_min_talon.toFixed(0)} mm²/m`,
          'CE art. 9.1',
        ));
      } else {
        checks.push({
          id: 'talon-bending',
          description: 'Flexion ELU en talon',
          value: `MEd = ${MEd_talon.toFixed(1)} kNm/m`,
          limit: `m = ${m_t.toFixed(3)} ≤ 0.5`,
          utilization: m_t / 0.5,
          status: toStatus(m_t / 0.5),
          article: 'CE art. 18.2',
        });
        const As_t_cap = isFinite(As_req_talon) && As_req_talon < As_min_talon
          ? As_min_talon * 1.001 : As_t;
        checks.push(makeCheck(
          'talon-asmin', 'Armadura minima talón ≥ As,min (flexión CE art. 9.1)',
          As_min_talon, As_t_cap,
          `As,min = ${As_min_talon.toFixed(0)} mm²/m`, `As,prov = ${As_t.toFixed(0)} mm²/m`,
          'CE art. 9.1',
        ));
      }
      // Zapata transversal inf — criterio de ingeniería (≥ 30% As,long; mín. Ø12@20)
      if (As_prov_zt_inf > 0) {
        checks.push(makeCheck(
          'zapata-asmin-trans-inf', 'Armado transversal zapata inf ≥ As,min,trans',
          As_min_trans_zap_inf, As_prov_zt_inf,
          `As,prov = ${As_prov_zt_inf.toFixed(0)} mm²/m`,
          `As,min = ${As_min_trans_zap_inf.toFixed(0)} mm²/m (30% As,long; mín. Ø12@20)`,
          'Criterio de ingeniería',
        ));
      }
    }

    // ── Punta (toe cantilever, length bP_m) ─────────────────────────────────
    if (bP_m > 0) {
      const sigma_A_punta = sigmaAt(bP_m);
      const sigma_B_punta = sigma_max;

      // Exact trapezoidal cantilever (load increases from root to tip):
      // M = L²·(σ_A + 2·σ_B)/6
      const M_punta_up   = bP_m * bP_m * (sigma_A_punta + 2 * sigma_B_punta) / 6;
      const q_punta_down = GAMMA_C_RC * hf_m;
      const M_punta_down = q_punta_down * bP_m * bP_m / 2;
      MEd_punta = GAMMA_G * Math.max(M_punta_up - M_punta_down, 0);

      const d_p    = d_punta_mm;
      const m_p    = MEd_punta > 0 ? (MEd_punta * 1e6) / (b_w * d_p * d_p * fcd) : 0;
      As_req_punta = solveRCBending(MEd_punta, b_w, d_p, fcd, fyd);
      // CE art. 9.1 — general minimum reinforcement for bending (footing)
      As_min_punta = asMin91(d_p);
      As_p = Math.max(isFinite(As_req_punta) ? As_req_punta : As_min_punta, As_min_punta);
      // Transverse sup minimum: engineering criterion (no normative reference for footing)
      As_min_trans_zap_sup = Math.max(0.30 * As_p, MIN_TRANS_ABS);

      if (As_prov_zi > 0) {
        checks.push(makeCheck(
          'punta-bending', 'Armado longitudinal punta ≥ As,req (flexión)',
          As_req_punta, As_prov_zi,
          `As,prov = ${As_prov_zi.toFixed(0)} mm²/m`,
          `As,req = ${As_req_punta.toFixed(0)} mm²/m`,
          'CE art. 18.2',
        ));
        checks.push(makeCheck(
          'punta-asmin', 'Armadura minima punta ≥ As,min (flexión CE art. 9.1)',
          As_min_punta, As_prov_zi,
          `As,prov = ${As_prov_zi.toFixed(0)} mm²/m`,
          `As,min = ${As_min_punta.toFixed(0)} mm²/m`,
          'CE art. 9.1',
        ));
      } else {
        checks.push({
          id: 'punta-bending',
          description: 'Flexion ELU en punta',
          value: `MEd = ${MEd_punta.toFixed(1)} kNm/m`,
          limit: `m = ${m_p.toFixed(3)} ≤ 0.5`,
          utilization: m_p / 0.5,
          status: toStatus(m_p / 0.5),
          article: 'CE art. 18.2',
        });
        const As_p_cap = isFinite(As_req_punta) && As_req_punta < As_min_punta
          ? As_min_punta * 1.001 : As_p;
        checks.push(makeCheck(
          'punta-asmin', 'Armadura minima punta ≥ As,min (flexión CE art. 9.1)',
          As_min_punta, As_p_cap,
          `As,min = ${As_min_punta.toFixed(0)} mm²/m`, `As,prov = ${As_p.toFixed(0)} mm²/m`,
          'CE art. 9.1',
        ));
      }
      // Zapata transversal sup — criterio de ingeniería (≥ 30% As,long; mín. Ø12@20)
      if (As_prov_zt_sup > 0) {
        checks.push(makeCheck(
          'zapata-asmin-trans-sup', 'Armado transversal zapata sup ≥ As,min,trans',
          As_min_trans_zap_sup, As_prov_zt_sup,
          `As,prov = ${As_prov_zt_sup.toFixed(0)} mm²/m`,
          `As,min = ${As_min_trans_zap_sup.toFixed(0)} mm²/m (30% As,long; mín. Ø12@20)`,
          'Criterio de ingeniería',
        ));
      }
    }
  }

  return {
    valid: true,
    Ka,
    kh_derived: kh,
    kv_derived: kv,
    KAD,
    EAH_total,
    EW: h_wet > 0 ? EW : undefined,
    ΣV,
    e,
    sigma_max,
    sigma_min,
    FS_vuelco,
    FS_desliz,
    FS_vuelco_seis,
    FS_desliz_seis,
    seismicUnstable: seismicUnstable || undefined,
    MEd_fuste, As_req_fuste, As_min_fuste,
    MEd_talon, As_req_talon, As_min_talon,
    MEd_punta, As_req_punta, As_min_punta,
    As_prov_fv_int, As_prov_fv_ext, As_prov_fh,
    As_prov_zs, As_prov_zi, As_prov_zt_inf, As_prov_zt_sup, As_prov_zt,
    As_min_h_fuste, As_min_trans_zap_inf, As_min_trans_zap_sup,
    checks,
  };
}
