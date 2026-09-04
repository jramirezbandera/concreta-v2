// Timber frame member — bloque de resistencia EC5 alimentado por ESFUERZOS,
// para las barras de madera del módulo FEM 2D (pórticos y cerchas).
//
// A diferencia de calcTimberBeam (acoplado a BEAM_CASES: calcula MEd/VEd desde
// gk/qk sin mayorar), esta función recibe los esfuerzos de cálculo de UNA
// combinación ya mayorada (N con signo, |M| eje fuerte, |V|) y el kmod de esa
// combinación (la acción de duración más corta presente, EC5 §3.1.3(2) — el
// llamador itera combinaciones y se queda con la peor η por fila).
//
// Comprobaciones:
//   - Cortante §6.1.7(2) (kcr = 0.67, área eficaz).
//   - Compresión (N < 0): interacción pandeo + flexión ecs. 6.23/6.24
//     (§6.3.2(3), término de compresión LINEAL — mismo criterio que
//     calcTimberColumn) y vuelco lateral + compresión ec. 6.35 (§6.3.3(4)).
//   - Tracción (N > 0): flexotracción §6.2.3 ec. 6.17 (σt/ft0,d + σm/fm,d) y
//     vuelco lateral del canto comprimido por flexión (conservador: kcrit sin
//     el alivio de la tracción).
//   - Flexión pura (N ≈ 0): §6.1.6 con kh + vuelco §6.3.3 (kcrit).
//   - La flecha (ELS con kdef) NO va aquí: la calcula el llamador con la δ
//     real del solver (fem2d/checks.ts), igual que acero y HA.
//
// Sin fuego: el FEM 2D no modela la situación accidental de incendio para
// ningún material (misma limitación que acero/HA).

import {
  getTimberGrade,
  getKmod,
  getGammaM,
  getKh,
  type LoadDurationClass,
  type ServiceClass,
} from '../../data/timberGrades';
import { calcKc, calcLambdaRel } from './timberColumns';

/** Sección rectangular de madera de una barra del FEM 2D (b, h en mm; h es el
 *  canto EN el plano del pórtico — la flexión del solver es de eje fuerte). */
export interface TimberFrameSection {
  gradeId: string;
  b: number; // mm — ancho (fuera del plano)
  h: number; // mm — canto (en el plano)
  serviceClass: ServiceClass;
}

export interface TimberFrameMemberInputs {
  section: TimberFrameSection;
  /** Longitud de pandeo EN el plano (m) — β = 1 · L en el FEM 2D (emparejada
   *  con la amplificación αcr, mismo criterio que acero/HA). */
  Lef_y: number;
  /** Longitud de pandeo FUERA del plano (m) — separación de correas o L. */
  Lef_z: number;
  /** Longitud base de vuelco lateral (m) — separación de correas o L. La
   *  longitud eficaz interna añade +2h (carga en el borde comprimido, lado
   *  seguro para forma de momento desconocida). */
  Lltb: number;
  /** Clase de duración de la COMBINACIÓN (su acción más corta, §3.1.3(2)). */
  loadDuration: LoadDurationClass;
  /** Axil CON SIGNO (kN): + tracción, − compresión. */
  N: number;
  /** |M| de eje fuerte (kN·m). */
  M: number;
  /** |V| (kN). */
  V: number;
}

export interface TimberFrameCheckRow {
  id: string;
  description: string;
  value: string;
  limit: string;
  utilization: number;
  article: string;
}

export interface TimberFrameResult {
  valid: boolean;
  error?: string;
  // Factores y resistencias de cálculo (N/mm²)
  kmod: number;
  gammaM: number;
  kh: number;
  fm_d: number;   // con kh
  fc0_d: number;
  ft0_d: number;
  fv_d: number;
  // Tensiones (N/mm²)
  sigma_m: number;
  sigma_N: number; // |N|/A (compresión o tracción según el signo de N)
  tau_d: number;
  // Pandeo de pieza comprimida
  lambda_rel_y: number;
  lambda_rel_z: number;
  kc_y: number;
  kc_z: number;
  // Vuelco lateral
  sigma_m_crit: number;
  lambda_rel_m: number;
  kcrit: number;
  checks: TimberFrameCheckRow[];
}

/** km — factor de redistribución de secciones rectangulares (EC5 §6.1.6(2)). */
const KM = 0.7;
/** kcr — factor de fisuración del área de cortante (EC5 §6.1.7(2)). */
const KCR = 0.67;
/** Suelo de ruido para los esfuerzos (kN / kN·m). */
const EPS = 1e-6;

function invalid(error: string): TimberFrameResult {
  return {
    valid: false, error,
    kmod: 0, gammaM: 0, kh: 1, fm_d: 0, fc0_d: 0, ft0_d: 0, fv_d: 0,
    sigma_m: 0, sigma_N: 0, tau_d: 0,
    lambda_rel_y: 0, lambda_rel_z: 0, kc_y: 0, kc_z: 0,
    sigma_m_crit: 0, lambda_rel_m: 0, kcrit: 1,
    checks: [],
  };
}

export function calcTimberFrameMember(inp: TimberFrameMemberInputs): TimberFrameResult {
  const { b, h } = inp.section;
  const grade = getTimberGrade(inp.section.gradeId);
  if (!grade) return invalid(`Clase resistente '${inp.section.gradeId}' no encontrada`);
  if (b <= 0 || h <= 0) return invalid('Dimensiones inválidas');
  if (inp.Lef_y <= 0 || inp.Lef_z <= 0 || inp.Lltb <= 0) return invalid('Longitudes de pandeo inválidas');

  // ── Material ───────────────────────────────────────────────────────────────
  const kmod = getKmod(inp.loadDuration, inp.section.serviceClass);
  const gammaM = getGammaM(grade.type);
  const betaC = grade.type === 'glulam' ? 0.1 : 0.2;
  const E0_05_Nmm2 = grade.E0_05 * 1000;

  // kh — factor de tamaño (EC5 §3.2(3) aserrada con ρk ≤ 700 / §3.3(3)
  // laminada) sobre el canto de flexión h. Solo a fm (a ft0 se omite: lado
  // seguro).
  const kh = getKh(grade, h);

  const fm_d = kmod * kh * grade.fm_k / gammaM;
  const fc0_d = kmod * grade.fc0_k / gammaM;
  const ft0_d = kmod * grade.ft0_k / gammaM;
  const fv_d = kmod * grade.fv_k / gammaM;

  // ── Sección ────────────────────────────────────────────────────────────────
  const A = b * h;             // mm²
  const W = b * h * h / 6;     // mm³ — eje fuerte
  const iy = h / Math.sqrt(12); // mm — pandeo en el plano
  const iz = b / Math.sqrt(12); // mm — pandeo fuera del plano

  // ── Tensiones ──────────────────────────────────────────────────────────────
  const M = Math.abs(inp.M);
  const V = Math.abs(inp.V);
  const sigma_m = M > EPS ? M * 1e6 / W : 0;
  const sigma_N = Math.abs(inp.N) > EPS ? Math.abs(inp.N) * 1e3 / A : 0;
  const tau_d = V > EPS ? 1.5 * V * 1e3 / (KCR * A) : 0;

  // ── Pandeo de pieza comprimida (§6.3.2) ────────────────────────────────────
  const lambda_y = inp.Lef_y * 1000 / iy;
  const lambda_z = inp.Lef_z * 1000 / iz;
  const lambda_rel_y = calcLambdaRel(lambda_y, grade.fc0_k, E0_05_Nmm2);
  const lambda_rel_z = calcLambdaRel(lambda_z, grade.fc0_k, E0_05_Nmm2);
  const kc_y = calcKc(lambda_rel_y, betaC);
  const kc_z = calcKc(lambda_rel_z, betaC);

  // ── Vuelco lateral (§6.3.3) — Lef = Lltb + 2h (carga en borde comprimido) ──
  const LefLtb = inp.Lltb * 1000 + 2 * h; // mm
  const sigma_m_crit = 0.78 * b * b * E0_05_Nmm2 / (h * LefLtb);
  const lambda_rel_m = Math.sqrt(grade.fm_k / sigma_m_crit);
  const kcrit = lambda_rel_m <= 0.75 ? 1.0
    : lambda_rel_m <= 1.40 ? 1.56 - 0.75 * lambda_rel_m
    : 1.0 / (lambda_rel_m * lambda_rel_m);

  // ── Filas ──────────────────────────────────────────────────────────────────
  const checks: TimberFrameCheckRow[] = [];
  const hasM = M > EPS;
  const isCompression = inp.N < -EPS;
  const isTension = inp.N > EPS;

  if (V > EPS) {
    checks.push({
      id: 'shear',
      description: 'Cortante τd ≤ fv,d (Av = kcr·b·h)',
      value: `${tau_d.toFixed(2)} N/mm²`,
      limit: `${fv_d.toFixed(2)} N/mm²`,
      utilization: fv_d > 0 ? tau_d / fv_d : Infinity,
      article: 'EN 1995-1-1 §6.1.7(2)',
    });
  }

  if (isCompression) {
    const term_c_y = fc0_d > 0 && kc_y > 0 ? sigma_N / (kc_y * fc0_d) : Infinity;
    const term_c_z = fc0_d > 0 && kc_z > 0 ? sigma_N / (kc_z * fc0_d) : Infinity;
    const term_m = fm_d > 0 ? sigma_m / fm_d : 0;
    const util_623 = term_c_y + term_m;
    const util_624 = term_c_z + KM * term_m;
    checks.push({
      id: 'comb-623',
      description: hasM
        ? `Pandeo en el plano + flexión: σc/(kc,y·fc0,d) + σm/fm,d ≤ 1 — kc,y = ${kc_y.toFixed(3)}`
        : `Pandeo en el plano: σc/(kc,y·fc0,d) ≤ 1 — kc,y = ${kc_y.toFixed(3)}`,
      value: util_623.toFixed(3),
      limit: '1.000',
      utilization: util_623,
      article: 'EN 1995-1-1 §6.3.2(3) Ec. 6.23',
    }, {
      id: 'comb-624',
      description: hasM
        ? `Pandeo fuera del plano + flexión: σc/(kc,z·fc0,d) + km·σm/fm,d ≤ 1 — kc,z = ${kc_z.toFixed(3)}, km = ${KM}`
        : `Pandeo fuera del plano: σc/(kc,z·fc0,d) ≤ 1 — kc,z = ${kc_z.toFixed(3)}`,
      value: util_624.toFixed(3),
      limit: '1.000',
      utilization: util_624,
      article: 'EN 1995-1-1 §6.3.2(3) Ec. 6.24',
    });
    if (hasM) {
      const m_ratio = fm_d > 0 && kcrit > 0 ? sigma_m / (kcrit * fm_d) : Infinity;
      const util_635 = m_ratio * m_ratio + term_c_z;
      checks.push({
        id: 'comb-635',
        description: `Vuelco lateral + compresión: (σm/(kcrit·fm,d))² + σc/(kc,z·fc0,d) ≤ 1 — kcrit = ${kcrit.toFixed(3)}`,
        value: util_635.toFixed(3),
        limit: '1.000',
        utilization: util_635,
        article: 'EN 1995-1-1 §6.3.3(4) Ec. 6.35',
      });
    }
  }

  if (isTension) {
    const util_t = (ft0_d > 0 ? sigma_N / ft0_d : Infinity) + (fm_d > 0 ? sigma_m / fm_d : 0);
    checks.push({
      id: 'tension-bending',
      description: hasM
        ? 'Flexotracción: σt/ft0,d + σm/fm,d ≤ 1'
        : 'Tracción: σt ≤ ft0,d',
      value: util_t.toFixed(3),
      limit: '1.000',
      utilization: util_t,
      article: 'EN 1995-1-1 §6.2.3 Ec. 6.17',
    });
  }

  if (!isCompression && hasM) {
    if (!isTension) {
      checks.push({
        id: 'bending',
        description: 'Flexión σm,d ≤ fm,d (con kh)',
        value: `${sigma_m.toFixed(2)} N/mm²`,
        limit: `${fm_d.toFixed(2)} N/mm²`,
        utilization: fm_d > 0 ? sigma_m / fm_d : Infinity,
        article: 'EN 1995-1-1 §6.1.6',
      });
    }
    // Vuelco lateral del canto comprimido por flexión. Con tracción axil es
    // conservador (la tracción estabiliza el vuelco y aquí se ignora).
    const fm_eff = kcrit * fm_d;
    checks.push({
      id: 'ltb',
      description: `Vuelco lateral σm,d ≤ kcrit·fm,d — kcrit = ${kcrit.toFixed(3)} (λrel,m = ${lambda_rel_m.toFixed(2)})`,
      value: `${sigma_m.toFixed(2)} N/mm²`,
      limit: `${fm_eff.toFixed(2)} N/mm²`,
      utilization: fm_eff > 0 ? sigma_m / fm_eff : Infinity,
      article: 'EN 1995-1-1 §6.3.3',
    });
  }

  return {
    valid: true,
    kmod, gammaM, kh, fm_d, fc0_d, ft0_d, fv_d,
    sigma_m, sigma_N, tau_d,
    lambda_rel_y, lambda_rel_z, kc_y, kc_z,
    sigma_m_crit, lambda_rel_m, kcrit,
    checks,
  };
}
