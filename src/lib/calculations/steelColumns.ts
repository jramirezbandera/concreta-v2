// Steel Column calculations — CE Anejo 22 (EC3); CTE DB-SE-A solo para la
// recomendación de esbeltez. Flexocompresión §6.3.3 con Método 2 (Anejo B).
// Units: mm for section dims, N/mm² for stress, kN for forces, kNm for moments.
// Section properties follow ArcelorMittal convention:
//   A in cm²  |  I in cm⁴  |  W in cm³  |  Iw in cm⁶  |  dims in mm
//
// Section behaviour (classification, buckling curves, LTB, biaxial moment
// interaction form) is delegated to ColumnBeamSection adapters in
// ../sections. This file orchestrates the EC3 flow but is section-agnostic.

import { type SteelColumnInputs } from '../../data/defaults';
import {
  createSection,
  type ColumnBeamSection,
  type SectionDescriptor,
  type SectionKind,
} from '../sections';
import { type SteelCheckRow, type SteelCheckStatus } from './steelBeams';
import { makeCheckQty, makeCheckNeutral } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────
const E  = 210000;  // N/mm² — Young's modulus
const G  = 81000;   // N/mm² — shear modulus
const γM0 = 1.05;
const γM1 = 1.05;

// ─── Result type ──────────────────────────────────────────────────────────────
/** One EC3 6.3.3 interaction inequality, linear in (My,Mz) at fixed N: cy·My + cz·Mz ≤ rhs. */
export interface InteractionLine { cy: number; cz: number; rhs: number; }

export interface SteelInteraction {
  line1: InteractionLine;   // EC3 6.61
  line2: InteractionLine;   // EC3 6.62
  My_cap: number;           // section bending resistance cap, kN·m
  Mz_cap: number;
  applied: { My: number; Mz: number };  // design moments (kN·m)
  inside: boolean;          // applied point within the biaxial envelope
}

export interface SteelColumnResult {
  valid: boolean;
  error?: string;
  sectionClass: 1 | 2 | 3 | 4;
  isBox: boolean;
  kind: SectionKind;
  // Key section / resistance values
  NRd: number;       // kN — section compression resistance (γM0)
  My_Rd: number;     // kNm — major-axis bending resistance (γM0)
  Mz_Rd: number;     // kNm — minor-axis bending resistance (γM0)
  Nb_Rd_y: number;   // kN — major-axis buckling resistance
  Nb_Rd_z: number;   // kN — minor-axis buckling resistance
  lambda_y: number;
  lambda_z: number;
  chi_y: number;
  chi_z: number;
  // LTB (open I sections with My>0 only — ∞/NaN sentinel for closed / CHS)
  Mcr: number;       // kNm
  lambda_LT: number;
  chi_LT: number;
  Mb_Rd: number;     // kNm
  // Biaxial moment resultant used by CHS interaction (cm: 0 for I / 2UPN)
  M_res?: number;    // kNm — √(My² + Mz²) for CHS
  // Interaction
  util_check1: number;
  util_check2: number;
  utilization: number;
  /** My-Mz biaxial interaction contour data — undefined for CHS (deferred). */
  interaction?: SteelInteraction;
  checks: SteelCheckRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStatus(util: number): Exclude<SteelCheckStatus, 'neutral'> {
  if (util < 0.8) return 'ok';
  if (util < 1.0) return 'warn';
  return 'fail';
}

/** Dimensionless check — keeps legacy value/limit string path (no unit conversion). */
function checkStr(
  id: string, description: string,
  demand: number, capacity: number,
  demandStr: string, capacityStr: string,
  article: string,
): SteelCheckRow {
  const util = capacity > 0 ? demand / capacity : Infinity;
  return { id, description, value: demandStr, limit: capacityStr, utilization: util, status: toStatus(util), article };
}

/** Buckling reduction factor χ from EC3 Table 6.1. */
function bucklingChi(lambda_bar: number, alpha: number): number {
  if (lambda_bar <= 0.2) return 1.0;
  const phi = 0.5 * (1 + alpha * (lambda_bar - 0.2) + lambda_bar * lambda_bar);
  return Math.min(1.0, 1 / (phi + Math.sqrt(Math.max(0, phi * phi - lambda_bar * lambda_bar))));
}

function invalidResult(
  error: string,
  sectionClass: 1 | 2 | 3 | 4 = 1,
  kind: SectionKind = 'I',
): SteelColumnResult {
  return {
    valid: false, error, sectionClass,
    kind, isBox: kind === '2UPN',
    NRd: 0, My_Rd: 0, Mz_Rd: 0, Nb_Rd_y: 0, Nb_Rd_z: 0,
    lambda_y: 0, lambda_z: 0, chi_y: 0, chi_z: 0,
    Mcr: 0, lambda_LT: 0, chi_LT: 1, Mb_Rd: 0,
    util_check1: 0, util_check2: 0, utilization: 0, checks: [],
  };
}

/** Build the polymorphic descriptor from the raw input fields. */
function buildDescriptor(inp: SteelColumnInputs): SectionDescriptor {
  switch (inp.sectionType) {
    case '2UPN':
      return { kind: '2UPN', size: inp.size };
    case 'CHS':
      return { kind: 'CHS', D: inp.chs_D, t: inp.chs_t, process: inp.chs_process };
    default:
      return { kind: 'I', tipo: inp.sectionType, size: inp.size };
  }
}

function descriptorKind(inp: SteelColumnInputs): SectionKind {
  return inp.sectionType === '2UPN' ? '2UPN' : inp.sectionType === 'CHS' ? 'CHS' : 'I';
}

// ─── Main calculator ──────────────────────────────────────────────────────────

export function calcSteelColumn(inp: SteelColumnInputs): SteelColumnResult {
  const { steel, Ly, Lz, beta_y, beta_z, Ned } = inp;
  // Momentos normalizados con |·|: un negativo inyectado (URL compartible /
  // localStorage; el teclado los rechaza vía parseQuantity) desactivaba en
  // silencio flexión, LTB e interacción (fix auditoría #92).
  const My_Ed = Math.abs(inp.My_Ed);
  const Mz_Ed = Math.abs(inp.Mz_Ed);
  const kind = descriptorKind(inp);

  // 1. Validate inputs
  if (Ly <= 0) return invalidResult('Ly debe ser mayor que 0', 1, kind);
  if (Lz <= 0) return invalidResult('Lz debe ser mayor que 0', 1, kind);
  if (Ned < 0) return invalidResult('Ned no puede ser negativo', 1, kind);
  // β ≤ 0 inyectable por URL anulaba el pandeo (Lk ≤ 0 → χ = 1); la UI
  // clampa a 0.1 pero la validación pertenece al motor (fix auditoría #93).
  if (beta_y <= 0) return invalidResult('β_y debe ser mayor que 0', 1, kind);
  if (beta_z <= 0) return invalidResult('β_z debe ser mayor que 0', 1, kind);

  // 2. Resolve polymorphic section
  const section: ColumnBeamSection | undefined = createSection(buildDescriptor(inp));
  if (!section) {
    const label =
      inp.sectionType === 'CHS'
        ? `CHS ${inp.chs_D}×${inp.chs_t}`
        : `${inp.sectionType} ${inp.size}`;
    return invalidResult(`Perfil ${label} no encontrado`, 1, kind);
  }

  const isBox = section.kind === '2UPN';
  const isCHS = section.kind === 'CHS';
  const { h, b, A, Iy, Iz, Wpl_y, Wel_y, Wpl_z, Wel_z, It: _It, Iw: _Iw } = section;
  void _It; void _Iw; // consumed by section.computeMcr

  // 3. Material strength — reduced for thick walls (CE Anejo 22 / EN 10025-2,
  //    EN 10210: 16 < t ≤ 40 mm → S275: 265, S355: 345). Afecta HEB240-400,
  //    HEA360/400, IPE550/600, 2UPN320/400 y CHS de pared gruesa (fix
  //    auditoría #89; mismo fix que steelBeams #62).
  const fy_nominal = steel === 'S355' ? 355 : 275;  // N/mm²
  const fy = section.tf > 16 ? fy_nominal - 10 : fy_nominal;

  // 4. Section classification (EC3 §5.5 Tabla 5.2). Para secciones en I el
  //    alma se clasifica con la distribución REAL N+My (α plástica, ψ
  //    elástica) en vez de compresión pura — antes todos los IPE ≥300 en
  //    S355 quedaban rechazados como clase 4 aunque con flexión dominante
  //    son clase 1-2 (fix auditoría #91). CHS/2UPN mantienen su clasificación
  //    propia (límites independientes del eje / conservadora).
  let rawClass: number;
  if (kind === 'I') {
    const A_mm2 = section.A * 100;          // cm² → mm²
    const Wel_mm3 = section.Wel_y * 1000;   // cm³ → mm³
    const c_w = section.h - 2 * section.tf - 2 * section.r;
    const N_N = Ned * 1000;
    const M_Nmm = My_Ed * 1e6;
    // α: fracción comprimida del alma en distribución plástica
    const alphaWeb = Math.min(1, Math.max(0, 0.5 * (1 + N_N / (c_w * section.tw * fy))));
    // ψ: ratio de tensiones elásticas en los extremos del alma
    const sigTop = N_N / A_mm2 + M_Nmm / Wel_mm3;
    const sigBot = N_N / A_mm2 - M_Nmm / Wel_mm3;
    const psiWeb = sigTop > 0 ? sigBot / sigTop : 1;
    rawClass = section.classify(fy, 'combined', { alphaWeb, psiWeb });
  } else {
    rawClass = section.classify(fy, 'compression');
  }
  const sectionClass = Math.min(4, Math.max(1, rawClass)) as 1 | 2 | 3 | 4;

  if (sectionClass === 4) {
    return invalidResult('Sección Clase 4 bajo la distribución N+M aplicada — no soportado en v1 (reducir Ned o aumentar perfil)', 4, kind);
  }

  // 5. Section moduli and characteristic resistances
  const usePlastic = sectionClass <= 2;
  const W_y = usePlastic ? Wpl_y : Wel_y;
  const W_z = usePlastic ? Wpl_z : Wel_z;

  // kN and kNm:  A[cm²]·fy[N/mm²]·0.1 = kN  |  W[cm³]·fy[N/mm²]/1000 = kNm
  const NRk   = A   * fy * 0.1;
  const My_Rk = W_y * fy / 1000;
  const Mz_Rk = W_z * fy / 1000;

  const NRd   = NRk   / γM0;
  const My_Rd = My_Rk / γM0;
  const Mz_Rd = Mz_Rk / γM0;

  // 6. Effective lengths
  const Lk_y = beta_y * Ly;  // mm
  const Lk_z = beta_z * Lz;  // mm

  // 7. Radii of gyration and reduced slenderness
  // i[mm] = 10·√(I[cm⁴]/A[cm²]) ;  λ1 = π·√(E/fy)
  const i_y    = 10 * Math.sqrt(Iy / A);
  const i_z    = 10 * Math.sqrt(Iz / A);
  const lambda1 = Math.PI * Math.sqrt(E / fy);

  const lambda_y = (Lk_y / i_y) / lambda1;
  const lambda_z = (Lk_z / i_z) / lambda1;

  // 8. Buckling curves (EC3 Tabla 6.2) — delegated to the section adapter
  const { alpha_y, alpha_z } = section.getBucklingAlpha();

  const chi_y = bucklingChi(lambda_y, alpha_y);
  const chi_z = bucklingChi(lambda_z, alpha_z);

  const Nb_Rd_y = chi_y * NRk / γM1;
  const Nb_Rd_z = chi_z * NRk / γM1;

  // 9. Lateral-torsional buckling
  //   - I-section (open): classical EC3 Eq. F.2 with Iz/It/Iw
  //   - 2UPN box / CHS : Mcr = ∞ → λ̄_LT = 0 → χ_LT = 1
  //   Longitud de LTB = Lz (distancia entre arriostramientos LATERALES, los
  //   que fijan el ala comprimida), no la Ly del eje fuerte: con Lz>Ly el
  //   Mcr quedaba hasta ×2.6 inflado (fix auditoría #90). C1=1.0 (momento
  //   uniforme, caso pésimo) y zg=0 son correctos aquí: el módulo solo
  //   recibe momentos de extremo, sin carga transversal — la asimetría con
  //   steelBeams (que sí usa C2·zg para UDL en ala superior) es deliberada
  //   (auditoría #98).
  const Mcr_raw = My_Ed > 0 ? section.computeMcr(Lz, 1.0, E, G) : Infinity;
  const Mcr = Mcr_raw;  // may be Infinity (closed sections) — handled below

  let lambda_LT = 0;
  let chi_LT = 1.0;
  let Mb_Rd = My_Rk / γM1;

  if (Mcr > 0 && isFinite(Mcr)) {
    lambda_LT = Math.sqrt(My_Rk / Mcr);
    const alpha_LT = section.getLTBAlpha();
    if (isFinite(alpha_LT)) {
      // χLT con el método GENERAL de §6.3.2.2 (meseta 0.2, β=1 — vía
      // bucklingChi) pero con las curvas α de la Tabla 6.5 (caso laminados):
      // mezcla DOBLEMENTE conservadora frente al caso laminados completo que
      // usa steelBeams (λLT,0=0.4, β=0.75, tope 1/λ̄²). Elección deliberada
      // del lado seguro para pilares; documentada en auditoría #95.
      chi_LT = bucklingChi(lambda_LT, alpha_LT);
      Mb_Rd  = chi_LT * My_Rk / γM1;
    }
  }
  // hasLTB: the LTB row only appears for open sections with My>0 and a finite Mcr
  const hasLTB = !isBox && !isCHS && My_Ed > 0 && isFinite(Mcr);

  // 10. Reduce biaxial moments (CHS collapses to resultant)
  const reduced = section.reduceDesignMoments(My_Ed, Mz_Ed);
  const My_int = reduced.My;
  const Mz_int = reduced.Mz;
  const M_res = reduced.M_res;

  // 11. Interaction factors — Method 2, Annex B EC3 (Cmy = Cmz = CmLT = 1.0,
  //     conservative, uniform moment). Se usan los k de clase 1-2 también
  //     para clase 3 (son mayores → lado seguro, auditoría #97).
  //   kyy = Cmy · [1 + (λ̄y − 0.2)·ny],  capped at Cmy · (1 + 0.8·ny)
  //   kzz (I/H):       Cmz · [1 + (2·λ̄z − 0.6)·nz], capped at Cmz · (1 + 1.4·nz)
  //   kzz (CHS/2UPN):  Tabla B.1 fila tubos = misma forma que kyy
  //                    (fix auditoría #96 — la fila I/H era conservadora aquí)
  const n_y = Ned / (chi_y * NRk / γM1);
  const n_z = Ned / (chi_z * NRk / γM1);

  const mu_y = Math.min(Math.max(lambda_y - 0.2, 0), 0.8);
  const mu_z = (isCHS || isBox)
    ? Math.min(Math.max(lambda_z - 0.2, 0), 0.8)
    : Math.min(Math.max(2 * lambda_z - 0.6, 0), 1.4);

  const kyy = 1 + mu_y * n_y;
  const kzz = 1 + mu_z * n_z;
  const kyz = 0.6 * kzz;

  // kzy: Tabla B.1 (0.6·kyy) SOLO para miembros no susceptibles a deformación
  // por torsión (tubos, cajones, o I sin LTB). Para I abierta con My>0 y LTB
  // aplica la Tabla B.2: kzy = 1 − 0.1·λ̄z·nz/(CmLT−0.25), con suelo
  // 1 − 0.1·nz/(CmLT−0.25) y rama λ̄z<0.4. Antes se usaba siempre 0.6·kyy y el
  // término de My en la ec. 2 quedaba hasta ×1.57 corto — verde cuando
  // debería fallar (fix auditoría #88).
  let kzy: number;
  if (hasLTB) {
    const CmLT = 1.0;
    const red = 0.1 / (CmLT - 0.25);  // = 0.1333 con CmLT=1
    kzy = lambda_z < 0.4
      ? Math.min(0.6 + lambda_z, 1 - red * lambda_z * n_z)
      : Math.max(1 - red * lambda_z * n_z, 1 - red * n_z);
  } else {
    kzy = 0.6 * kyy;
  }

  // 12. Interaction checks 6.3.3
  const denom_N_y  = chi_y  * NRk / γM1;
  const denom_N_z  = chi_z  * NRk / γM1;
  const denom_My   = chi_LT * My_Rk / γM1;    // Mb,Rd for My
  const denom_Mz   = Mz_Rk / γM1;

  const util_check1 = Ned / denom_N_y
    + (My_int > 0 ? kyy * My_int / denom_My : 0)
    + (Mz_int > 0 ? kyz * Mz_int / denom_Mz : 0);

  const util_check2 = Ned / denom_N_z
    + (My_int > 0 ? kzy * My_int / denom_My : 0)
    + (Mz_int > 0 ? kzz * Mz_int / denom_Mz : 0);

  // 13. Slenderness limit — esbeltez REDUCIDA λ̄ ≤ 2.0 (criterio de elementos
  //     principales, CTE DB-SE-A; bajo CE Anejo 22 es recomendación). El
  //     antiguo Lk/i ≤ 200 equivalía a λ̄ = 2.30 (S275) / 2.62 (S355): más
  //     laxo y dependiente del acero (fix auditoría #94).
  const SLEND_MAX = 2.0;

  // Governing utilization
  const utilization = Math.max(
    util_check1, util_check2,
    lambda_y / SLEND_MAX, lambda_z / SLEND_MAX,
    Ned > 0 ? Ned / Nb_Rd_y : 0,
    Ned > 0 ? Ned / Nb_Rd_z : 0,
  );

  // ─── Build checks array ──────────────────────────────────────────────────
  const checks: SteelCheckRow[] = [];

  // Classification
  checks.push(makeCheckNeutral('class', 'Clasificación de sección', `CLASE ${sectionClass}`, 'CE Anejo 22 (EC3) §5.5.2'));

  // Section resistances
  if (Ned > 0) {
    checks.push(makeCheckQty('NRd', 'Compresión  NEd / NRd', Ned, NRd, 'force', 'CE Anejo 22 (EC3) §6.2.4'));
  }
  if (isCHS && M_res !== undefined && M_res > 0) {
    // CHS: axisymmetric → single §6.2.5 check with resultant moment M_res.
    checks.push(makeCheckQty('MRes', `Flexión resultante  M_res = √(My²+Mz²) / M_Rd`,
      M_res, My_Rd, 'moment', 'CE Anejo 22 (EC3) §6.2.5'));
  } else {
    if (My_Ed > 0) {
      checks.push(makeCheckQty('MyRd', 'Flexión  My,Ed / My,Rd', My_Ed, My_Rd, 'moment', 'CE Anejo 22 (EC3) §6.2.5'));
    }
    if (Mz_Ed > 0) {
      checks.push(makeCheckQty('MzRd', 'Flexión  Mz,Ed / Mz,Rd', Mz_Ed, Mz_Rd, 'moment', 'CE Anejo 22 (EC3) §6.2.5'));
    }
  }

  // Buckling
  checks.push(makeCheckQty('Nby', `Pandeo eje y  (λ̄=${lambda_y.toFixed(2)}, χ=${chi_y.toFixed(2)})`,
    Ned, Nb_Rd_y, 'force', 'CE Anejo 22 (EC3) §6.3.1'));
  checks.push(makeCheckQty('Nbz', `Pandeo eje z  (λ̄=${lambda_z.toFixed(2)}, χ=${chi_z.toFixed(2)})`,
    Ned, Nb_Rd_z, 'force', 'CE Anejo 22 (EC3) §6.3.1'));

  // LTB
  if (hasLTB) {
    checks.push(makeCheckQty('LTB', `Pandeo lateral  (λ̄LT=${lambda_LT.toFixed(2)}, χLT=${chi_LT.toFixed(2)})`,
      My_Ed, Mb_Rd, 'moment', 'CE Anejo 22 (EC3) §6.3.2'));
  }

  // Interaction — dimensionless ratios (stay on legacy string path)
  checks.push({
    id: 'int1', description: 'Interacción N+My+Mz  (Ec. 1)',
    value: util_check1.toFixed(3), limit: '1.000',
    utilization: util_check1, status: toStatus(util_check1),
    article: 'CE Anejo 22 (EC3) §6.3.3',
  });
  checks.push({
    id: 'int2', description: 'Interacción N+My+Mz  (Ec. 2)',
    value: util_check2.toFixed(3), limit: '1.000',
    utilization: util_check2, status: toStatus(util_check2),
    article: 'CE Anejo 22 (EC3) §6.3.3',
  });

  // Slenderness — dimensionless reduced slenderness ratio
  checks.push(checkStr('sy',
    `Esbeltez reducida  λ̄ (eje y) = ${lambda_y.toFixed(2)}`,
    lambda_y, SLEND_MAX, lambda_y.toFixed(2), `${SLEND_MAX.toFixed(1)}`, 'CTE DB-SE-A 6.3 (recomendación)'));
  checks.push(checkStr('sz',
    `Esbeltez reducida  λ̄ (eje z) = ${lambda_z.toFixed(2)}`,
    lambda_z, SLEND_MAX, lambda_z.toFixed(2), `${SLEND_MAX.toFixed(1)}`, 'CTE DB-SE-A 6.3 (recomendación)'));

  // Silence unused geometry readouts (h, b) — kept destructured for future
  // feature hooks (e.g. utilization warnings) without re-reading from `section`.
  void h; void b;

  // Biaxial interaction contour (My-Mz). EC3 6.61/6.62 are linear in (My,Mz)
  // at fixed N → the safe region is a polygon (rectangle of section caps clipped
  // by the two interaction lines). CHS collapses biaxial moment to a resultant
  // (a different shape) — deferred.
  const interaction: SteelInteraction | undefined = isCHS ? undefined : {
    line1: { cy: kyy / denom_My, cz: kyz / denom_Mz, rhs: 1 - Ned / denom_N_y },
    line2: { cy: kzy / denom_My, cz: kzz / denom_Mz, rhs: 1 - Ned / denom_N_z },
    My_cap: My_Rd,
    Mz_cap: Mz_Rd,
    applied: { My: My_int, Mz: Mz_int },
    inside: util_check1 <= 1 + 1e-9 && util_check2 <= 1 + 1e-9,
  };

  return {
    valid: true,
    sectionClass, kind, isBox,
    NRd, My_Rd, Mz_Rd,
    Nb_Rd_y, Nb_Rd_z,
    lambda_y, lambda_z, chi_y, chi_z,
    Mcr: isFinite(Mcr) ? Mcr : 0,
    lambda_LT, chi_LT, Mb_Rd,
    M_res,
    util_check1, util_check2,
    utilization,
    interaction,
    checks,
  };
}

// === My-Mz interaction polygon =================================================
// The biaxial safe region: the rectangle [0,My_cap] x [0,Mz_cap] clipped by the
// two EC3 6.61/6.62 interaction lines. Returns the convex polygon vertices
// (kN.m). Empty array when the axial load alone exhausts capacity.

/** Sutherland-Hodgman clip — keep the half-plane cy*My + cz*Mz <= rhs. */
function clipHalfPlane(
  poly: { My: number; Mz: number }[], ln: InteractionLine,
): { My: number; Mz: number }[] {
  if (poly.length === 0) return poly;
  const out: { My: number; Mz: number }[] = [];
  const val = (p: { My: number; Mz: number }) => ln.cy * p.My + ln.cz * p.Mz - ln.rhs;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const c = poly[(i + 1) % poly.length];
    const va = val(a);
    const vc = val(c);
    const aIn = va <= 1e-9;
    const cIn = vc <= 1e-9;
    if (aIn) out.push(a);
    if (aIn !== cIn) {
      const t = va / (va - vc);
      out.push({ My: a.My + t * (c.My - a.My), Mz: a.Mz + t * (c.Mz - a.Mz) });
    }
  }
  return out;
}

/**
 * Builds the My-Mz biaxial interaction contour as a convex polygon.
 * Returns [] when the column fails on axial load alone (empty safe region).
 */
export function buildSteelInteractionPolygon(
  it: SteelInteraction,
): { My: number; Mz: number }[] {
  let poly: { My: number; Mz: number }[] = [
    { My: 0, Mz: 0 },
    { My: it.My_cap, Mz: 0 },
    { My: it.My_cap, Mz: it.Mz_cap },
    { My: 0, Mz: it.Mz_cap },
  ];
  poly = clipHalfPlane(poly, it.line1);
  poly = clipHalfPlane(poly, it.line2);
  return poly.length >= 3 ? poly : [];
}
