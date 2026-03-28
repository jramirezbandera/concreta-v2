// Steel Beam calculations — CTE DB-SE-A Spain
// All units: mm, N, MPa (unless noted), results in kN/kNm.
//
// Key articles:
//   CTE DB-SE-A 5.5    — Section classification
//   CTE DB-SE-A 6.2.5  — Bending resistance
//   CTE DB-SE-A 6.2.6  — Shear resistance
//   CTE DB-SE-A 6.2.8  — M-V interaction
//   CTE DB-SE-A 6.3.2  — Lateral-torsional buckling (LTB)
//   CTE DB-SE   4.3.3  — Deflection (SLS)

import { type SteelBeamInputs } from '../../data/defaults';
import { getProfile, type SteelProfile } from '../../data/steelProfiles';
import { BEAM_CASES } from './beamCases';

// CTE DB-SE-A constants
const E = 210000;   // N/mm²  — Young's modulus
const G = 81000;    // N/mm²  — Shear modulus
const γM0 = 1.05;
const γM1 = 1.05;

export type SteelCheckStatus = 'ok' | 'warn' | 'fail' | 'neutral';

export interface SteelCheckRow {
  id: string;
  description: string;
  value: string;
  limit: string;
  utilization: number;
  status: SteelCheckStatus;
  article: string;
  neutral?: boolean;  // classification row — no bar
  tag?: string;       // e.g. 'CLASE 1'
}

export interface SteelBeamResult {
  valid: boolean;
  error?: string;
  profile: SteelProfile;
  sectionClass: 1 | 2 | 3 | 4;
  // Bending
  Mc_Rd: number;
  eta_M: number;
  // Shear
  Av: number;
  Vc_Rd: number;
  eta_V: number;
  // M-V interaction
  VEd_interaction: number;
  rho: number;
  Mv_Rd: number;
  eta_MV: number;
  // LTB
  Mcr: number;
  lambda_LT: number;
  chi_LT: number;
  Mb_Rd: number;
  eta_LTB: number;
  // Deflection
  delta_max: number;
  delta_adm: number;
  eta_delta: number;
  // Governing
  governing: 'bending' | 'shear' | 'interaction' | 'ltb' | 'deflection' | 'class4';
  utilization: number;
  checks: SteelCheckRow[];
}

function toStatus(util: number): SteelCheckStatus {
  if (util < 0.8) return 'ok';
  if (util < 1.0) return 'warn';
  return 'fail';
}

function check(
  id: string,
  description: string,
  demand: number,
  capacity: number,
  demandStr: string,
  capacityStr: string,
  article: string,
): SteelCheckRow {
  const util = capacity > 0 ? demand / capacity : Infinity;
  return {
    id,
    description,
    value: demandStr,
    limit: capacityStr,
    utilization: util,
    status: toStatus(util),
    article,
  };
}

function checkNeutral(id: string, description: string, tag: string, article: string): SteelCheckRow {
  return {
    id,
    description,
    value: '',
    limit: '',
    utilization: 0,
    status: 'neutral',
    article,
    neutral: true,
    tag,
  };
}

function invalidResult(
  error: string,
  profile: SteelProfile | undefined,
  sectionClass: 1 | 2 | 3 | 4 = 1,
  governing: SteelBeamResult['governing'] = 'bending',
  checks: SteelCheckRow[] = [],
): SteelBeamResult {
  return {
    valid: false,
    error,
    profile: profile as SteelProfile,
    sectionClass,
    Mc_Rd: 0, eta_M: 0,
    Av: 0, Vc_Rd: 0, eta_V: 0,
    VEd_interaction: 0, rho: 0, Mv_Rd: 0, eta_MV: 0,
    Mcr: 0, lambda_LT: 0, chi_LT: 0, Mb_Rd: 0, eta_LTB: 0,
    delta_max: 0, delta_adm: 0, eta_delta: 0,
    governing,
    utilization: 0,
    checks,
  };
}

export function calcSteelBeam(inp: SteelBeamInputs): SteelBeamResult {
  // 1. Look up profile
  const profile = getProfile(inp.tipo, inp.size);
  if (!profile) {
    return invalidResult('Perfil no encontrado', undefined);
  }

  // 2. Convert units: cm/cm²/cm³/cm⁴/cm⁶ → mm
  const A_mm    = profile.A * 100;        // cm² → mm²
  const Iy_mm   = profile.Iy * 1e4;       // cm⁴ → mm⁴
  const Iz_mm   = profile.Iz * 1e4;       // cm⁴ → mm⁴
  const Wpl_y_mm = profile.Wpl_y * 1e3;   // cm³ → mm³
  const Wel_y_mm = profile.Wel_y * 1e3;   // cm³ → mm³
  const It_mm   = profile.It * 1e4;       // cm⁴ → mm⁴
  const Iw_mm   = profile.Iw * 1e6;       // cm⁶ → mm⁶

  // 3. Steel yield strength
  const fy = inp.steel === 'S275' ? 275 : 355;

  // 4. Section classification (CTE 5.5)
  const ε = Math.sqrt(235 / fy);
  const c_f = (profile.b - profile.tw - 2 * profile.r) / 2;
  const c_w = profile.h - 2 * profile.tf - 2 * profile.r;
  const ratio_f = c_f / profile.tf;
  const ratio_w = c_w / profile.tw;

  const class_f: number = ratio_f <= 9 * ε ? 1 : ratio_f <= 10 * ε ? 2 : ratio_f <= 14 * ε ? 3 : 4;
  const class_w: number = ratio_w <= 72 * ε ? 1 : ratio_w <= 83 * ε ? 2 : ratio_w <= 124 * ε ? 3 : 4;
  const sectionClass = Math.max(class_f, class_w) as 1 | 2 | 3 | 4;

  // 4b. Class 4 — not supported in v1
  if (sectionClass === 4) {
    const classRow = checkNeutral(
      'classification',
      'Clasificación sección (CTE 5.5)',
      'CLASE 4',
      'CTE DB-SE-A 5.5',
    );
    return invalidResult(
      'Sección clase 4 — no implementado en v1',
      profile,
      4,
      'class4',
      [classRow],
    );
  }

  // 5. W for bending (class 1–2: plastic; class 3: elastic)
  const W_bend = sectionClass <= 2 ? Wpl_y_mm : Wel_y_mm;

  // 6. Bending resistance (CTE 6.2.5)
  const Mc_Rd = (W_bend * fy) / γM0 / 1e6;     // kNm
  const eta_M = Mc_Rd > 0 ? inp.MEd / Mc_Rd : Infinity;

  // 7. Shear resistance (CTE 6.2.6)
  let Av = A_mm - 2 * profile.b * profile.tf + (profile.tw + 2 * profile.r) * profile.tf;
  Av = Math.max(Av, profile.tw * (profile.h - 2 * profile.tf));
  const Vc_Rd = (Av * (fy / Math.sqrt(3))) / γM0 / 1000;   // kN
  const eta_V = Vc_Rd > 0 ? inp.VEd / Vc_Rd : Infinity;

  // 8. M-V interaction (CTE 6.2.8)
  // VEd_interaction is the shear at the critical M section (beam-type specific).
  // Always provided via effectiveInputs from index.tsx (set by deriveFromLoads).
  const VEd_interaction = inp.VEd_interaction;

  let rho = 0;
  let Mv_Rd = Mc_Rd;

  if (VEd_interaction / Vc_Rd > 0.5) {
    rho = Math.pow(2 * VEd_interaction / Vc_Rd - 1, 2);
    if (sectionClass <= 2) {
      const Aw = profile.tw * (profile.h - 2 * profile.tf);
      const Wpl_y_red = Wpl_y_mm - (rho * Aw * Aw) / (4 * profile.tw);
      Mv_Rd = (Wpl_y_red * fy) / γM0 / 1e6;
    }
    // Class 3: no reduction — Mv_Rd = Mc_Rd
  }
  const eta_MV = Mv_Rd > 0 ? inp.MEd / Mv_Rd : Infinity;

  // 9. LTB (CTE 6.3.2)
  const C1 = BEAM_CASES[inp.beamType].C1;
  const Mcr_Nmm =
    C1 *
    ((Math.PI ** 2 * E * Iz_mm) / inp.Lcr ** 2) *
    Math.sqrt(Iw_mm / Iz_mm + (inp.Lcr ** 2 * G * It_mm) / (Math.PI ** 2 * E * Iz_mm));
  const Mcr = Mcr_Nmm / 1e6;   // kNm

  const lambda_LT = Math.sqrt((W_bend * fy) / (Mcr * 1e6));
  const αLT = profile.h / profile.b <= 2 ? 0.34 : 0.49;
  const λLT_0 = 0.4;
  const β = 0.75;

  let chi_LT = 1.0;
  if (lambda_LT > λLT_0) {
    const Φ_LT = 0.5 * (1 + αLT * (lambda_LT - λLT_0) + β * lambda_LT ** 2);
    const disc = Math.max(0, Φ_LT ** 2 - β * lambda_LT ** 2);
    chi_LT = Math.min(1.0, 1.0 / (Φ_LT + Math.sqrt(disc)));
  }

  const Mb_Rd = (chi_LT * W_bend * fy) / γM1 / 1e6;   // kNm
  const eta_LTB = Mb_Rd > 0 ? inp.MEd / Mb_Rd : Infinity;

  // 10. Deflection (CTE DB-SE 4.3.3)
  const k = BEAM_CASES[inp.beamType].k_defl;
  const delta_max = (k * inp.Mser * 1e6 * inp.L ** 2) / (E * Iy_mm);   // mm
  const delta_adm = inp.L / inp.deflLimit;
  const eta_delta = delta_adm > 0 ? delta_max / delta_adm : Infinity;

  // 11. Build check rows
  const checks: SteelCheckRow[] = [];

  checks.push(
    checkNeutral(
      'classification',
      'Clasificación sección (CTE DB-SE-A §5.5)',
      `CLASE ${sectionClass}`,
      'CTE DB-SE-A §5.5 — Clasificación de secciones transversales',
    ),
  );

  checks.push(
    check(
      'bending',
      'Flexión Mc,Rd (CTE DB-SE-A §6.2.5)',
      inp.MEd,
      Mc_Rd,
      `${inp.MEd.toFixed(1)} kNm`,
      `${Mc_Rd.toFixed(1)} kNm`,
      'CTE DB-SE-A §6.2.5 — Resistencia a flexión',
    ),
  );

  checks.push(
    check(
      'shear',
      'Cortante Vc,Rd (CTE DB-SE-A §6.2.6)',
      inp.VEd,
      Vc_Rd,
      `${inp.VEd.toFixed(1)} kN`,
      `${Vc_Rd.toFixed(1)} kN`,
      'CTE DB-SE-A §6.2.6 — Resistencia a cortante',
    ),
  );

  // For ss beam type VEd_interaction=0 — skip M-V row (would always show 0%, duplicate bending).
  // For cantilever/fp/ff the critical section has significant shear — show the check.
  if (VEd_interaction > 0) {
    checks.push(
      check(
        'interaction',
        'Interacción M-V (CTE DB-SE-A §6.2.8)',
        inp.MEd,
        Mv_Rd,
        `${inp.MEd.toFixed(1)} kNm`,
        `${Mv_Rd.toFixed(1)} kNm`,
        'CTE DB-SE-A §6.2.8 — Interacción cortante y flexión',
      ),
    );
  }

  // Warn if Lcr > L: physically unusual (cantilevered or conservative assumption may be valid,
  // but most common case is an input error). Result is conservative, not unconservative.
  if (inp.Lcr > inp.L) {
    checks.push(
      checkNeutral(
        'lcr-warning',
        `Lcr (${(inp.Lcr / 1000).toFixed(2)} m) > L (${(inp.L / 1000).toFixed(2)} m) — verificar longitud de pandeo`,
        'REVISAR',
        'CTE DB-SE-A §6.3.2 — Pandeo lateral torsional',
      ),
    );
  }

  checks.push(
    check(
      'ltb',
      'Pandeo lateral Mb,Rd (CTE DB-SE-A §6.3.2)',
      inp.MEd,
      Mb_Rd,
      `${inp.MEd.toFixed(1)} kNm`,
      `${Mb_Rd.toFixed(1)} kNm`,
      'CTE DB-SE-A §6.3.2 — Pandeo lateral torsional (LTB)',
    ),
  );

  checks.push(
    check(
      'deflection',
      'Flecha δmax (CTE DB-SE §4.3.3)',
      delta_max,
      delta_adm,
      `${delta_max.toFixed(1)} mm`,
      `L/${inp.deflLimit} = ${delta_adm.toFixed(1)} mm`,
      'CTE DB-SE §4.3.3 — Estados límite de servicio. Flechas',
    ),
  );

  // 12. Governing check
  const etas = {
    bending: eta_M,
    shear: eta_V,
    interaction: eta_MV,
    ltb: eta_LTB,
    deflection: eta_delta,
  } as const;

  let governing: SteelBeamResult['governing'] = 'bending';
  let utilization = 0;
  for (const [key, val] of Object.entries(etas)) {
    if (val > utilization) {
      utilization = val;
      governing = key as keyof typeof etas;
    }
  }

  return {
    valid: true,
    profile,
    sectionClass,
    Mc_Rd, eta_M,
    Av, Vc_Rd, eta_V,
    VEd_interaction, rho, Mv_Rd, eta_MV,
    Mcr, lambda_LT, chi_LT, Mb_Rd, eta_LTB,
    delta_max, delta_adm, eta_delta,
    governing,
    utilization,
    checks,
  };
}
