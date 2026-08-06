// Steel Beam calculations — CTE DB-SE-A Spain
// All units: mm, N, MPa (unless noted), results in kN/kNm.
//
// Key articles:
//   CTE DB-SE-A 5.5    — Section classification
//   CTE DB-SE-A 6.2.5  — Bending resistance
//   CTE DB-SE-A 6.2.6  — Shear resistance
//   CTE DB-SE-A 6.2.8  — M-V interaction
//   CE Anejo 22 §6.3.2.3 — Lateral-torsional buckling (rolled sections)
//   CTE DB-SE   4.3.3  — Deflection (SLS)

import { type SteelBeamInputs } from '../../data/defaults';
import { type SteelProfile } from '../../data/steelProfiles';
import {
  createSection,
  ISectionAdapter,
  type ColumnBeamSection,
  type SectionDescriptor,
} from '../sections';
import { BEAM_CASES } from './beamCases';
import { type CheckRow, type CheckStatus, makeCheckQty, WARN_UTIL } from './types';

// CTE DB-SE-A constants
const E = 210000;   // N/mm²  — Young's modulus
const G = 81000;    // N/mm²  — Shear modulus
const γM0 = 1.05;
const γM1 = 1.05;

// Re-export the unified types under the legacy steel names so the 5 existing
// consumers (SteelBeamsResults, SteelColumnsResults, pdf/steelBeams,
// pdf/steelColumns, calculations/steelColumns) keep working without churn.
export type SteelCheckStatus = CheckStatus;
export type SteelCheckRow = CheckRow;

export interface SteelBeamResult {
  valid: boolean;
  error?: string;
  /** Catalog record — set only for I/H families (IPE/HEA/HEB/IPN). */
  profile: SteelProfile | undefined;
  /** Polymorphic section adapter (always set on valid results) — label,
   *  dims and primitives for SVG/PDF; tubes/2UPN have no `profile`. */
  section?: ColumnBeamSection;
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
  if (util < WARN_UTIL) return 'ok';
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
  section?: ColumnBeamSection,
): SteelBeamResult {
  return {
    valid: false,
    error,
    profile: profile as SteelProfile,
    section,
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

/** Build the polymorphic descriptor from the raw input fields (mirror of
 *  steelColumns.buildDescriptor — SHS collapses to RHS with b = h). */
function buildBeamDescriptor(inp: SteelBeamInputs): SectionDescriptor {
  switch (inp.tipo) {
    case '2UPN':
      return { kind: '2UPN', size: inp.size };
    case 'CHS':
      return { kind: 'CHS', D: inp.chs_D, t: inp.chs_t, process: inp.tube_process };
    case 'SHS':
      return { kind: 'RHS', h: inp.rhs_h, b: inp.rhs_h, t: inp.rhs_t, process: inp.tube_process, square: true };
    case 'RHS':
      // `square: false` aunque salga h === b: la familia la declara el usuario
      // en el selector y el rótulo no puede desmentirla.
      return { kind: 'RHS', h: inp.rhs_h, b: inp.rhs_b, t: inp.rhs_t, process: inp.tube_process, square: false };
    default:
      return { kind: 'I', tipo: inp.tipo, size: inp.size };
  }
}

export function calcSteelBeam(inp: SteelBeamInputs): SteelBeamResult {
  // 1. Resolve polymorphic section (classification / LTB / buckling curves /
  //    shear area are the same code path used by steelColumns).
  const section = createSection(buildBeamDescriptor(inp));
  if (!section) {
    return invalidResult('Perfil no encontrado', undefined);
  }
  // Tubos degenerados (t=0, dims ≤ 2t…): el adapter produce sección nula en
  // vez de lanzar — rechazo explícito.
  if (section.kind !== 'I' && !(section.A > 0)) {
    return invalidResult('Dimensiones de tubo no válidas (se requiere h, b, D > 2t y t > 0)', undefined);
  }
  /** Catalog record — only I/H families carry one (SVG/PDF back-compat). */
  const profile = section instanceof ISectionAdapter ? section.profile : undefined;

  // 2. Convert units: cm/cm²/cm³/cm⁴ → mm (retained for shear-area
  //    and deflection formulas that still work in raw units).
  const Iy_mm   = section.Iy * 1e4;       // cm⁴ → mm⁴
  const Wpl_y_mm = section.Wpl_y * 1e3;   // cm³ → mm³
  const Wel_y_mm = section.Wel_y * 1e3;   // cm³ → mm³

  // 3. Steel yield strength — reduced for thick flanges/walls (CTE DB-SE-A
  //    Tabla 4.1 / EN 10025-2, EN 10210/10219: 16 < t ≤ 40 mm → S275: 265,
  //    S355: 345). El catálogo I incluye ~14 perfiles con tf > 16; usar el fy
  //    nominal sobreestimaba las resistencias 3-4% (auditoría #62).
  const fy_nominal = inp.steel === 'S275' ? 275 : 355;
  const fy = section.tf > 16 ? fy_nominal - 10 : fy_nominal;

  // 4. Section classification (CTE 5.5) — bending mode: outstand flange +
  //    internal web in bending (limits 72/83/124·ε).
  const sectionClass = Math.min(4, Math.max(1, section.classify(fy, 'bending'))) as 1 | 2 | 3 | 4;

  // 4b. Class 4 — not supported in v1
  if (sectionClass === 4) {
    const classRow = checkNeutral(
      'classification',
      'Clasificación sección (CTE 5.5)',
      'CLASE 4',
      'CTE DB-SE-A 5.5',
    );
    // La sección resuelta viaja con el resultado inválido: el bloque de
    // propiedades se pinta junto al aviso «elija un perfil más robusto», y
    // los dos lectores de `result.section` (SVG y etiqueta del PDF) dejan de
    // caer al fallback `${tipo} ${size}`, que en un tubo imprime basura.
    return invalidResult(
      'Sección clase 4 — no implementado en v1',
      profile,
      4,
      'class4',
      [classRow],
      section,
    );
  }

  // 5. W for bending (class 1–2: plastic; class 3: elastic)
  const W_bend = sectionClass <= 2 ? Wpl_y_mm : Wel_y_mm;

  // 6. Bending resistance (CTE 6.2.5)
  const Mc_Rd = (W_bend * fy) / γM0 / 1e6;     // kNm
  const eta_M = Mc_Rd > 0 ? inp.MEd / Mc_Rd : Infinity;

  // 7. Shear resistance (CTE 6.2.6) — Av delegado al adapter (§6.2.6(3):
  //    fórmula de alma para I, A·h/(b+h) para RHS/SHS, 2A/π para CHS, suma
  //    de almas para 2UPN). Para I es la fórmula histórica movida verbatim.
  const Av = section.shearAreaZ();
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
    const hw = section.h - 2 * section.tf;
    if (section.kind === 'I') {
      if (sectionClass <= 2) {
        const Aw = section.tw * hw;
        const Wpl_y_red = Wpl_y_mm - (rho * Aw * Aw) / (4 * section.tw);
        Mv_Rd = (Wpl_y_red * fy) / γM0 / 1e6;
      } else {
        // Class 3 (auditoría #72): EC3/CTE 6.2.8(3) — limite elastico reducido
        // (1−ρ)·fy en el area de cortante (alma). Criterio elastico de primera
        // plastificacion: el alma alcanza (1−ρ)·fy en y=hw/2 → la capacidad es
        // min(Wel·fy, (1−ρ)·fy·Iy/(hw/2)).
        const M_web_limited = ((1 - rho) * fy * Iy_mm) / (hw / 2) / γM0 / 1e6;
        Mv_Rd = Math.min(Mc_Rd, M_web_limited);
      }
    } else if (section.kind === 'RHS' || section.kind === '2UPN') {
      if (sectionClass <= 2) {
        // Dos almas de espesor tw y canto hw: módulo plástico del bloque de
        // almas = Aw²/(8·tw) (análogo de §6.2.8(5) para cajón). hw = h − 2·tf
        // incluye la esquina → reducción ligeramente mayor (lado seguro).
        const Aw = 2 * section.tw * hw;
        const Wpl_y_red = Wpl_y_mm - (rho * Aw * Aw) / (8 * section.tw);
        Mv_Rd = Math.min(Mc_Rd, (Wpl_y_red * fy) / γM0 / 1e6);
      } else {
        // Clase 3: primera plastificación del alma en la fibra extrema
        // (las almas de un tubo llegan a ±h/2) con (1−ρ)·fy.
        Mv_Rd = (1 - rho) * Mc_Rd;
      }
    } else {
      // CHS: área de cortante distribuida — reducción global (1−ρ)·Mc,Rd
      // (§6.2.8(3), lado seguro).
      Mv_Rd = (1 - rho) * Mc_Rd;
    }
  }
  const eta_MV = Mv_Rd > 0 ? inp.MEd / Mv_Rd : Infinity;

  // 9. LTB (CE Anejo 22 / CE Anejo 22 §6.3.2.3, caso laminados) — Mcr y α_LT delegados
  //    al section adapter. Mcr incluye el término de altura de aplicación de
  //    la carga C2·zg con zg=+h/2 (UDL gravitatoria en ala superior,
  //    desestabilizante — auditoría #61). Secciones cerradas (2UPN/SHS/RHS/
  //    CHS): Mcr = ∞ → λ̄LT = 0 → χLT = 1 (no vuelcan).
  const C1 = BEAM_CASES[inp.beamType].C1;
  const C2 = BEAM_CASES[inp.beamType].C2;
  const zg = section.h / 2;  // mm — carga en ala superior
  const Mcr = section.computeMcr(inp.Lcr, C1, E, G, C2, zg);  // kNm (∞ en cerradas)

  const lambda_LT = Math.sqrt((W_bend * fy) / (Mcr * 1e6));
  const αLT = section.getLTBAlpha();
  const λLT_0 = 0.4;
  const β = 0.75;

  let chi_LT = 1.0;
  if (lambda_LT > λLT_0) {
    const Φ_LT = 0.5 * (1 + αLT * (lambda_LT - λLT_0) + β * lambda_LT ** 2);
    const disc = Math.max(0, Φ_LT ** 2 - β * lambda_LT ** 2);
    // Tope adicional χLT ≤ 1/λ̄² de la ec. 6.57 (auditoría #63): con β=0.75 la
    // fórmula puede superar el límite elástico Mcr (χ > 1/λ̄² ⇒ Mb,Rd > Mcr).
    chi_LT = Math.min(1.0, 1.0 / lambda_LT ** 2, 1.0 / (Φ_LT + Math.sqrt(disc)));
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
    makeCheckQty(
      'bending',
      'Flexión Mc,Rd (CTE DB-SE-A §6.2.5)',
      inp.MEd,
      Mc_Rd,
      'moment',
      'CTE DB-SE-A §6.2.5 — Resistencia a flexión',
    ),
  );

  checks.push(
    makeCheckQty(
      'shear',
      'Cortante Vc,Rd (CTE DB-SE-A §6.2.6)',
      inp.VEd,
      Vc_Rd,
      'force',
      'CTE DB-SE-A §6.2.6 — Resistencia a cortante',
    ),
  );

  // For ss beam type VEd_interaction=0 — skip M-V row (would always show 0%, duplicate bending).
  // For cantilever/fp/ff the critical section has significant shear — show the check.
  if (VEd_interaction > 0) {
    checks.push(
      makeCheckQty(
        'interaction',
        'Interacción M-V (CTE DB-SE-A §6.2.8)',
        inp.MEd,
        Mv_Rd,
        'moment',
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
        'CE Anejo 22 §6.3.2 — Pandeo lateral torsional',
      ),
    );
  }

  // Cita el método realmente implementado: caso laminados de EC3/CE Anejo 22
  // §6.3.2.3 (λLT,0=0.4, β=0.75, curvas Tabla 6.5), no el método general del
  // CTE DB-SE-A §6.3.2 (λLT,0=0.2, β=1), que daría χLT menores (auditoría #73).
  checks.push(
    makeCheckQty(
      'ltb',
      'Pandeo lateral Mb,Rd (CE Anejo 22 §6.3.2.3)',
      inp.MEd,
      Mb_Rd,
      'moment',
      'CE Anejo 22 §6.3.2.3 — Pandeo lateral torsional (LTB), secciones laminadas',
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
    section,
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
