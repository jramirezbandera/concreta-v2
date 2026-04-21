// Steel Column calculations — CTE DB-SE-A / EC3
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
  const { steel, Ly, Lz, beta_y, beta_z, Ned, My_Ed, Mz_Ed } = inp;
  const kind = descriptorKind(inp);

  // 1. Validate inputs
  if (Ly <= 0) return invalidResult('Ly debe ser mayor que 0', 1, kind);
  if (Lz <= 0) return invalidResult('Lz debe ser mayor que 0', 1, kind);
  if (Ned < 0) return invalidResult('Ned no puede ser negativo', 1, kind);

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

  // 3. Material strength
  const fy = steel === 'S355' ? 355 : 275;  // N/mm²

  // 4. Section classification (EC3 §5.5 Tabla 5.2) — compression mode
  const sectionClass = Math.min(4, Math.max(1, section.classify(fy, 'compression'))) as 1 | 2 | 3 | 4;

  if (sectionClass === 4) {
    return invalidResult('Sección Clase 4 — no soportado en v1', 4, kind);
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
  const Mcr_raw = My_Ed > 0 ? section.computeMcr(Ly, 1.0, E, G) : Infinity;
  const Mcr = Mcr_raw;  // may be Infinity (closed sections) — handled below

  let lambda_LT = 0;
  let chi_LT = 1.0;
  let Mb_Rd = My_Rk / γM1;

  if (Mcr > 0 && isFinite(Mcr)) {
    lambda_LT = Math.sqrt(My_Rk / Mcr);
    const alpha_LT = section.getLTBAlpha();
    if (isFinite(alpha_LT)) {
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

  // 11. Interaction factors — Method 2, Annex B EC3 Tabla B.1 (I/H Class 1&2)
  //     Cmy = Cmz = 1.0 (conservative, uniform moment)
  //   kyy = Cmy · [1 + (λ̄y − 0.2)·ny],  capped at Cmy · (1 + 0.8·ny)
  //   kzz = Cmz · [1 + (2·λ̄z − 0.6)·nz], capped at Cmz · (1 + 1.4·nz)
  const n_y = Ned / (chi_y * NRk / γM1);
  const n_z = Ned / (chi_z * NRk / γM1);

  const mu_y = Math.min(Math.max(lambda_y - 0.2, 0), 0.8);
  const mu_z = Math.min(Math.max(2 * lambda_z - 0.6, 0), 1.4);

  const kyy = 1 + mu_y * n_y;
  const kzz = 1 + mu_z * n_z;
  const kyz = 0.6 * kzz;
  const kzy = 0.6 * kyy;

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

  // 13. Slenderness limits (Lk/i ≤ 200)
  const slend_y = i_y > 0 ? Lk_y / i_y : Infinity;
  const slend_z = i_z > 0 ? Lk_z / i_z : Infinity;
  const SLEND_MAX = 200;

  // Governing utilization
  const utilization = Math.max(
    util_check1, util_check2,
    slend_y / SLEND_MAX, slend_z / SLEND_MAX,
    Ned > 0 ? Ned / Nb_Rd_y : 0,
    Ned > 0 ? Ned / Nb_Rd_z : 0,
  );

  // ─── Build checks array ──────────────────────────────────────────────────
  const checks: SteelCheckRow[] = [];

  // Classification
  checks.push(makeCheckNeutral('class', 'Clasificación de sección', `CLASE ${sectionClass}`, 'CE DB-SE-A 5.5.2'));

  // Section resistances
  if (Ned > 0) {
    checks.push(makeCheckQty('NRd', 'Compresión  NEd / NRd', Ned, NRd, 'force', 'CE DB-SE-A 6.2.4'));
  }
  if (isCHS && M_res !== undefined && M_res > 0) {
    // CHS: axisymmetric → single §6.2.5 check with resultant moment M_res.
    checks.push(makeCheckQty('MRes', `Flexión resultante  M_res = √(My²+Mz²) / M_Rd`,
      M_res, My_Rd, 'moment', 'CE DB-SE-A 6.2.5'));
  } else {
    if (My_Ed > 0) {
      checks.push(makeCheckQty('MyRd', 'Flexión  My,Ed / My,Rd', My_Ed, My_Rd, 'moment', 'CE DB-SE-A 6.2.5'));
    }
    if (Mz_Ed > 0) {
      checks.push(makeCheckQty('MzRd', 'Flexión  Mz,Ed / Mz,Rd', Mz_Ed, Mz_Rd, 'moment', 'CE DB-SE-A 6.2.5'));
    }
  }

  // Buckling
  checks.push(makeCheckQty('Nby', `Pandeo eje y  (λ̄=${lambda_y.toFixed(2)}, χ=${chi_y.toFixed(2)})`,
    Ned, Nb_Rd_y, 'force', 'CE DB-SE-A 6.3.1'));
  checks.push(makeCheckQty('Nbz', `Pandeo eje z  (λ̄=${lambda_z.toFixed(2)}, χ=${chi_z.toFixed(2)})`,
    Ned, Nb_Rd_z, 'force', 'CE DB-SE-A 6.3.1'));

  // LTB
  if (hasLTB) {
    checks.push(makeCheckQty('LTB', `Pandeo lateral  (λ̄LT=${lambda_LT.toFixed(2)}, χLT=${chi_LT.toFixed(2)})`,
      My_Ed, Mb_Rd, 'moment', 'CE DB-SE-A 6.3.2'));
  }

  // Interaction — dimensionless ratios (stay on legacy string path)
  checks.push({
    id: 'int1', description: 'Interacción N+My+Mz  (Ec. 1)',
    value: util_check1.toFixed(3), limit: '1.000',
    utilization: util_check1, status: toStatus(util_check1),
    article: 'CE DB-SE-A 6.3.3',
  });
  checks.push({
    id: 'int2', description: 'Interacción N+My+Mz  (Ec. 2)',
    value: util_check2.toFixed(3), limit: '1.000',
    utilization: util_check2, status: toStatus(util_check2),
    article: 'CE DB-SE-A 6.3.3',
  });

  // Slenderness — dimensionless integer ratio
  checks.push(checkStr('sy',
    `Esbeltez  Lk/i (eje y) = ${slend_y.toFixed(0)}`,
    slend_y, SLEND_MAX, slend_y.toFixed(0), `${SLEND_MAX}`, 'CE DB-SE-A 6.3.1.3'));
  checks.push(checkStr('sz',
    `Esbeltez  Lk/i (eje z) = ${slend_z.toFixed(0)}`,
    slend_z, SLEND_MAX, slend_z.toFixed(0), `${SLEND_MAX}`, 'CE DB-SE-A 6.3.1.3'));

  // Silence unused geometry readouts (h, b) — kept destructured for future
  // feature hooks (e.g. utilization warnings) without re-reading from `section`.
  void h; void b;

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
    checks,
  };
}
