// Anchor-plate calculations — PR-3 (rebar model).
//
// Modelo: barras corrugadas EHE-08 / EC2 ancladas en hormigón. Dos detalles
// ortogonales:
//   · bottom_anchorage (extremo embebido — transfiere tracción al hormigón):
//     prolongacion_recta | patilla | gancho | arandela_tuerca.
//   · top_connection (unión barra↔placa — detalle constructivo, sin check):
//     soldada | tuerca_arandela.
// La placa de acero se asienta sobre una capa de mortero sin retracción
// (grout), sujeta a la cabeza del macizo por el grupo de barras traccionadas
// y por compresión directa del mortero.
//
// Norma: CTE DB-SE-A + EC3 parte 1-8 + EN 1992-4 + EC2 §8.4 + EHE-08.
// Factores parciales: γc=1.5  γs=1.15  γM0=1.05  γM2=1.25  γMc=1.5  γMp=1.4.

import type { AnchorPlateInputs } from '../../data/defaults';
import { getProfile } from '../../data/steelProfiles';
import {
  REBAR_AREAS,
  REBAR_GRADES,
  washerBearingArea,
  anchorageAlpha1,
  needsBondAnchorage,
  needsPullout,
  type RebarDiam,
  type RebarGrade,
} from '../../data/anchorBars';
import type { CheckRow, CheckStatus } from './types';
import { toStatus } from './types';

// ─── Partial safety factors ─────────────────────────────────────────────
const GAMMA_C   = 1.5;
const GAMMA_S   = 1.15;  // EC2 §2.4.2.4 — reinforcement
const GAMMA_M0  = 1.05;
const GAMMA_M2  = 1.25;
const GAMMA_MC  = 1.5;   // EN 1992-4 Tab 4.1 — concrete cone / splitting
const GAMMA_MP  = 1.4;   // EN 1992-4 Tab 4.1 — pullout (bearing head)

const BETA_J    = 2 / 3;  // EC3 1-8 §6.2.5 grout joint factor

// ─── Steel strengths per plate grade ─────────────────────────────────────
const PLATE_FY: Record<'S235' | 'S275' | 'S355', number> = {
  S235: 235,
  S275: 275,
  S355: 355,
};
const PLATE_FU: Record<'S235' | 'S275' | 'S355', number> = {
  S235: 360,
  S275: 430,
  S355: 490,
};
// EC3 1-8 Tab 4.1 weld correlation factor βw.
const BETA_W: Record<'S235' | 'S275' | 'S355', number> = {
  S235: 0.80,
  S275: 0.85,
  S355: 0.90,
};

// ─── Rebar design strengths per bar (helper) ─────────────────────────────
function barStrengths(inp: AnchorPlateInputs) {
  const { As }  = REBAR_AREAS[inp.bar_diam as RebarDiam];
  const { fyk } = REBAR_GRADES[inp.bar_grade as RebarGrade];
  const fyd = fyk / GAMMA_S;                       // MPa — EC2 §2.4.2.4
  // Ft,Rd = As · fyd  (plastic tensile yield of rebar)
  const FtRd_kN = (As * fyd) / 1000;               // kN
  // Fv,Rd = 0.6 · As · fyd  (plastic shear, τ_y ≈ fyd/√3 ≈ 0.58·fyd → rounded 0.6)
  const FvRd_kN = (0.6 * As * fyd) / 1000;         // kN
  return { As, fyk, fyd, FtRd_kN, FvRd_kN };
}

// ─── Geometry: bar coordinates in plate-local frame ─────────────────────
// Origin at plate centroid. +x along plate_a (strong axis), +y along plate_b (weak axis).
export interface AnchorBarPosition {
  index: number;         // 0..n-1
  x: number;             // mm
  y: number;             // mm
  Ft: number;            // kN (tension if > 0, compression ignored)
  inTension: boolean;
}

export function fourCornerLayout(
  plate_a: number,
  plate_b: number,
  edge_x: number,
  edge_y: number,
): AnchorBarPosition[] {
  const xPos = plate_a / 2 - edge_x;
  const yPos = plate_b / 2 - edge_y;
  return [
    { index: 0, x: -xPos, y: -yPos, Ft: 0, inTension: false },
    { index: 1, x: +xPos, y: -yPos, Ft: 0, inTension: false },
    { index: 2, x: -xPos, y: +yPos, Ft: 0, inTension: false },
    { index: 3, x: +xPos, y: +yPos, Ft: 0, inTension: false },
  ];
}

// ─── Generalised layout for nLayout ∈ {4, 6, 8, 9} ───────────────────────
// 4: corners. 6: corners + 2 mid-edge along x. 8: corners + 4 mid-edge.
// 9: 3×3 grid.
export function generateLayout(inp: AnchorPlateInputs): AnchorBarPosition[] {
  const { plate_a, plate_b, bar_edge_x, bar_edge_y, bar_nLayout } = inp;
  const xMax = plate_a / 2 - bar_edge_x;
  const yMax = plate_b / 2 - bar_edge_y;

  const mk = (xs: number[], ys: number[]): AnchorBarPosition[] => {
    const out: AnchorBarPosition[] = [];
    let i = 0;
    for (const y of ys) for (const x of xs) {
      out.push({ index: i++, x, y, Ft: 0, inTension: false });
    }
    return out;
  };

  if (bar_nLayout === 4) return mk([-xMax, +xMax], [-yMax, +yMax]);
  if (bar_nLayout === 6) return mk([-xMax, 0, +xMax], [-yMax, +yMax]);
  if (bar_nLayout === 8) return mk([-xMax, -xMax / 3, +xMax / 3, +xMax], [-yMax, +yMax]);
  if (bar_nLayout === 9) return mk([-xMax, 0, +xMax], [-yMax, 0, +yMax]);
  return fourCornerLayout(plate_a, plate_b, bar_edge_x, bar_edge_y);
}

// ─── Polygon helpers (Sutherland–Hodgman single-edge clip + shoelace) ─────
interface Pt { x: number; y: number; }

function clipPolygonToHalfPlane(poly: Pt[], cos: number, sin: number, d: number): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  if (n === 0) return out;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const fp = p.x * cos + p.y * sin - d;
    const fq = q.x * cos + q.y * sin - d;
    const pIn = fp >= 0;
    const qIn = fq >= 0;
    if (pIn) out.push(p);
    if (pIn !== qIn) {
      const t = fp / (fp - fq);
      out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
  }
  return out;
}

function polygonAreaCentroid(poly: Pt[]): { A: number; X: number; Y: number } {
  if (poly.length < 3) return { A: 0, X: 0, Y: 0 };
  let A2 = 0, Cx = 0, Cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    A2 += cross;
    Cx += (p.x + q.x) * cross;
    Cy += (p.y + q.y) * cross;
  }
  const A = A2 / 2;
  if (Math.abs(A) < 1e-9) return { A: 0, X: 0, Y: 0 };
  return { A: Math.abs(A), X: Cx / (6 * A), Y: Cy / (6 * A) };
}

// ─── Solver result type ─────────────────────────────────────────────────
export interface SolverResult {
  bolts: AnchorBarPosition[];  // kept as `bolts` for backward compat with UI/PDF consumers
  Nc: number;                  // kN (compressive reaction under plate)
  Ft_total: number;            // kN (total tension in bar group)
  n_t: number;                 // number of tensioned bars
  x_c: number;                 // mm (lever arm; 0 for biaxial)
  lifted: boolean;             // any bar in tension?
  mode:
    | 'uniform-compression'
    | 'partial-lift'
    | 'axis-aligned-4'
    | 'biaxial-plastic'
    | 'biaxial-grid';
  converged: boolean;
  note: string;
  phi_NA?: number;             // rad — NA angle from +x
  d_NA?: number;               // mm — NA normal offset from plate centroid
  block?: Pt[];                // compression polygon (plate-local mm)
}

// ─── Axis-aligned superposition solver (pure-Mx fast path) ───────────────
export function solveAxisAligned4(inp: AnchorPlateInputs): SolverResult {
  const bars = fourCornerLayout(inp.plate_a, inp.plate_b, inp.bar_edge_x, inp.bar_edge_y);
  const NEd  = inp.NEd;
  const MxEd = Math.abs(inp.Mx);
  const sgn  = Math.sign(inp.Mx) || 1;

  const a = inp.plate_a / 1000;
  const e = MxEd / Math.max(NEd, 1e-6);

  if (NEd > 0 && e <= a / 6 + 1e-9) {
    return {
      bolts: bars,
      Nc: NEd,
      Ft_total: 0,
      n_t: 0,
      x_c: 0,
      lifted: false,
      mode: 'uniform-compression',
      converged: true,
      note: 'Compresión uniforme bajo placa (|e| ≤ a/6)',
    };
  }

  const x_t = inp.plate_a / 2 - inp.bar_edge_x;
  const x_n = inp.plate_a / 2 - inp.bar_edge_x / 3;
  const x_c = x_t + x_n;

  const M_kNmm  = MxEd * 1000;
  const Ft_total = Math.max(0, (M_kNmm - NEd * x_n) / x_c);
  const Nc       = NEd + Ft_total;

  const tensionSide = sgn > 0 ? -1 : +1;
  for (const b of bars) {
    if (Math.sign(b.x) === tensionSide) {
      b.inTension = true;
      b.Ft = Ft_total / 2;
    }
  }

  return {
    bolts: bars,
    Nc,
    Ft_total,
    n_t: 2,
    x_c,
    lifted: true,
    mode: 'partial-lift',
    converged: true,
    note: 'Tracción parcial — bloque plástico rectangular (EC3 §6.2.5 simplif.)',
  };
}

// ─── Biaxial plastic solver ──────────────────────────────────────────────
export function solveBiaxial(inp: AnchorPlateInputs): SolverResult {
  const NEd = inp.NEd;
  const Mx = inp.Mx, My = inp.My;

  const fcd = inp.fck / GAMMA_C;
  const alpha = alphaExtension(inp);
  const fjd = BETA_J * alpha * fcd;

  const a = inp.plate_a, b = inp.plate_b;
  const rect: Pt[] = [
    { x: -a / 2, y: -b / 2 },
    { x:  a / 2, y: -b / 2 },
    { x:  a / 2, y:  b / 2 },
    { x: -a / 2, y:  b / 2 },
  ];
  const fullA = a * b;

  const { FtRd_kN: FtRd_per_bar_kN } = barStrengths(inp);
  const bars0 = generateLayout(inp);

  function projBounds(cos: number, sin: number) {
    let dMin = Infinity, dMax = -Infinity;
    for (const c of rect) {
      const p = c.x * cos + c.y * sin;
      if (p < dMin) dMin = p;
      if (p > dMax) dMax = p;
    }
    return { dMin, dMax };
  }

  function findD(cos: number, sin: number, A_target: number): number {
    const { dMin, dMax } = projBounds(cos, sin);
    if (A_target >= fullA) return dMin - 1;
    if (A_target <= 0) return dMax + 1;
    let lo = dMin, hi = dMax;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      const poly = clipPolygonToHalfPlane(rect, cos, sin, mid);
      const A = polygonAreaCentroid(poly).A;
      if (A > A_target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  interface Evaluation {
    phi: number;
    d: number;
    bars: AnchorBarPosition[];
    Nc_kN: number;
    Ft_total_kN: number;
    Mx_int_kNm: number;
    My_int_kNm: number;
    block: Pt[];
  }

  function evaluate(phi: number): Evaluation {
    const cos = Math.cos(phi), sin = Math.sin(phi);
    const bars = bars0.map((b) => ({ ...b, Ft: 0, inTension: false }));

    let tensionMask = bars.map((b) => b.x * cos + b.y * sin < 0);
    let d = 0;
    for (let iter = 0; iter < 10; iter++) {
      const nT = tensionMask.filter(Boolean).length;
      const Ft_total_kN = nT * FtRd_per_bar_kN;
      const Nc_kN = NEd + Ft_total_kN;
      const A_target = (Math.max(0, Nc_kN) * 1000) / fjd;
      d = findD(cos, sin, A_target);

      const newMask = bars.map((b) => b.x * cos + b.y * sin < d);
      const stable = tensionMask.every((t, i) => t === newMask[i]);
      tensionMask = newMask;
      if (stable) break;
    }

    const block = clipPolygonToHalfPlane(rect, cos, sin, d);
    const { A: A_block, X: Xc, Y: Yc } = polygonAreaCentroid(block);
    const Nc_kN = (fjd * A_block) / 1000;

    let Ft_total_kN = 0;
    let bar_Mx_kNmm = 0, bar_My_kNmm = 0;
    for (let i = 0; i < bars.length; i++) {
      if (tensionMask[i]) {
        bars[i].inTension = true;
        bars[i].Ft = FtRd_per_bar_kN;
        Ft_total_kN += FtRd_per_bar_kN;
        bar_Mx_kNmm += FtRd_per_bar_kN * bars[i].x;
        bar_My_kNmm += FtRd_per_bar_kN * bars[i].y;
      }
    }

    const Mx_int_kNmm = Nc_kN * Xc - bar_Mx_kNmm;
    const My_int_kNmm = Nc_kN * Yc - bar_My_kNmm;

    return {
      phi,
      d,
      bars,
      Nc_kN,
      Ft_total_kN,
      Mx_int_kNm: Mx_int_kNmm / 1000,
      My_int_kNm: My_int_kNmm / 1000,
      block,
    };
  }

  const N_GRID = 72;
  const evals: Evaluation[] = [];
  for (let i = 0; i < N_GRID; i++) {
    evals.push(evaluate((i * 2 * Math.PI) / N_GRID));
  }
  const residual = (e: Evaluation) => Math.hypot(e.Mx_int_kNm - Mx, e.My_int_kNm - My);
  let best = evals[0];
  let bestR = residual(best);
  for (const e of evals) {
    const r = residual(e);
    if (r < bestR) { best = e; bestR = r; }
  }

  let step = (2 * Math.PI) / N_GRID;
  for (let k = 0; k < 40; k++) {
    const cL = evaluate(best.phi - step);
    const cR = evaluate(best.phi + step);
    const rL = residual(cL), rR = residual(cR);
    if (rL < bestR) { best = cL; bestR = rL; }
    else if (rR < bestR) { best = cR; bestR = rR; }
    else step /= 2;
    if (step < 1e-5) break;
  }

  const M_ext_mag = Math.hypot(Mx, My);
  const tol = Math.max(0.5, 0.02 * M_ext_mag);
  const converged = bestR <= tol;

  const n_t = best.bars.filter((b) => b.inTension).length;

  return {
    bolts: best.bars,
    Nc: best.Nc_kN,
    Ft_total: best.Ft_total_kN,
    n_t,
    x_c: 0,
    lifted: n_t > 0,
    mode: converged ? 'biaxial-plastic' : 'biaxial-grid',
    converged,
    note: converged
      ? `Biaxial plástico — φ=${((best.phi * 180) / Math.PI).toFixed(1)}°, residuo ${bestR.toFixed(2)} kNm`
      : `Biaxial grid-search (APROX) — residuo ${bestR.toFixed(2)} kNm > tol ${tol.toFixed(2)}`,
    phi_NA: best.phi,
    d_NA: best.d,
    block: best.block,
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────
export function solveAnchorPlate(inp: AnchorPlateInputs): SolverResult {
  const absMy = Math.abs(inp.My);
  const absMx = Math.abs(inp.Mx);
  const M_ext = Math.hypot(absMx, absMy);
  const NEd_safe = Math.max(inp.NEd, 1e-6);

  const nearPureCompression = M_ext < 0.01 * NEd_safe * inp.plate_a / 6 / 1000;
  const pureAxis = absMy < 1e-6;

  if (pureAxis || nearPureCompression) return solveAxisAligned4(inp);
  return solveBiaxial(inp);
}

// ─── α extension factor (EC3 1-8 §6.2.5(4)) ──────────────────────────────
export function alphaExtension(inp: AnchorPlateInputs): number {
  const ed = inp.plate_margin_x / inp.plate_a;
  const el = inp.plate_margin_y / inp.plate_b;
  return Math.min(3, Math.max(1, Math.min(1 + 2 * ed, 1 + 2 * el)));
}

// ─── T-stub effective area (EC3 1-8 §6.2.5(3)–(5)) ───────────────────────
export function tStubEffectiveArea(
  inp: AnchorPlateInputs,
  fjd_MPa: number,
  twoFlanges: boolean,
): { A_eff: number; c: number } {
  const p = getProfile(inp.sectionType as 'IPE' | 'HEA' | 'HEB' | 'IPN', inp.sectionSize);
  if (!p) return { A_eff: inp.plate_a * inp.plate_b, c: 0 };

  const fyp = PLATE_FY[inp.plate_steel];
  const c_raw = inp.plate_t * Math.sqrt(fyp / (3 * Math.max(fjd_MPa, 1e-6) * 1.0));
  const c_max_strong = (inp.plate_a - p.h) / 2;
  const c_max_weak   = (inp.plate_b - p.b) / 2;
  const c = Math.max(0, Math.min(c_raw, c_max_strong, c_max_weak));

  const bf_ext = Math.min(p.b + 2 * c, inp.plate_b);
  const tf_ext = p.tf + 2 * c;
  const A_flange = bf_ext * tf_ext;

  const tw_ext = p.tw + 2 * c;
  const hw_ext = Math.max(0, p.h - 2 * p.tf - 2 * c);
  const A_web = tw_ext * hw_ext;

  const A_eff = twoFlanges ? 2 * A_flange + A_web : A_flange + A_web / 2;
  return { A_eff: Math.min(A_eff, inp.plate_a * inp.plate_b), c };
}

// ─── Check 1 — Compresión bajo placa (T-stub efectivo) ───────────────────
export function checkPlateCompression(
  inp: AnchorPlateInputs,
  Nc_kN: number,
  twoFlanges: boolean,
): CheckRow {
  const fcd   = inp.fck / GAMMA_C;
  const alpha = alphaExtension(inp);
  const fjd   = BETA_J * alpha * fcd;

  const { A_eff, c } = tStubEffectiveArea(inp, fjd, twoFlanges);
  const Nc_Rd_kN = (fjd * A_eff) / 1000;
  const util = Nc_kN / Math.max(Nc_Rd_kN, 1e-6);
  return {
    id: 'plate-compression',
    description: 'Compresión bajo placa (T-stub efectivo)',
    value: `${Nc_kN.toFixed(1)} kN`,
    limit: `${Nc_Rd_kN.toFixed(1)} kN (fjd=${fjd.toFixed(1)} MPa, Aeff=${(A_eff / 100).toFixed(0)} cm², c=${c.toFixed(0)})`,
    utilization: util,
    status: toStatus(util),
    article: 'EC3 1-8 §6.2.5',
  };
}

// ─── Check 2 — Flexión de la placa (voladizo plástico) ───────────────────
// Modelo por eje: cada rigidizador parte el voladizo del eje que cubre.
//   rib_count=0: sin rigidizadores → voladizo completo por ambos ejes.
//   rib_count=2: 2 nervios paralelos al eje fuerte (a ambos lados de las alas
//                del perfil) parten el voladizo del eje fuerte; el eje débil
//                queda sin rigidizar.
//   rib_count=4: 4 nervios (2+2) parten el voladizo en los dos ejes.
// Tomamos el peor (max) de los dos voladizos efectivos por tratarse del
// panel plástico más crítico.
export function checkPlateBending(inp: AnchorPlateInputs, fjd_MPa: number): CheckRow {
  const p = getProfile(inp.sectionType as 'IPE' | 'HEA' | 'HEB' | 'IPN', inp.sectionSize);
  const bf = p?.b ?? inp.plate_b * 0.6;
  const hc = p?.h ?? inp.plate_a * 0.6;

  const c_strong = Math.max(0, (inp.plate_a - hc) / 2);
  const c_weak   = Math.max(0, (inp.plate_b - bf) / 2);

  const c_s_eff = inp.rib_count >= 2 ? c_strong / 2 : c_strong;
  const c_w_eff = inp.rib_count >= 4 ? c_weak   / 2 : c_weak;
  const c_eff = Math.max(c_s_eff, c_w_eff);

  const m_Ed_Nmm_per_mm = (fjd_MPa * c_eff * c_eff) / 2;

  const fyd = PLATE_FY[inp.plate_steel] / GAMMA_M0;
  const m_Rd_Nmm_per_mm = (inp.plate_t * inp.plate_t * fyd) / 4;

  const util = m_Ed_Nmm_per_mm / Math.max(m_Rd_Nmm_per_mm, 1e-6);
  return {
    id: 'plate-bending',
    description: 'Flexión de la placa',
    value: `mEd=${(m_Ed_Nmm_per_mm / 1000).toFixed(2)} kNm/m`,
    limit: `mRd=${(m_Rd_Nmm_per_mm / 1000).toFixed(2)} kNm/m (c=${c_eff.toFixed(0)} mm)`,
    utilization: util,
    status: toStatus(util),
    article: 'EC3 1-8 §6.2.5',
  };
}

// ─── Check 3 — Tracción en barras (EC2 §2.4.2.4 / EHE-08) ────────────────
export function checkBoltTension(inp: AnchorPlateInputs, Ft_per_bar_kN: number): CheckRow {
  const { As, fyd, FtRd_kN } = barStrengths(inp);
  const util = Ft_per_bar_kN / Math.max(FtRd_kN, 1e-6);
  return {
    id: 'bolt-tension',
    description: 'Tracción en barras',
    value: `Ft=${Ft_per_bar_kN.toFixed(1)} kN`,
    limit: `FtRd=${FtRd_kN.toFixed(1)} kN (As=${As.toFixed(0)} mm², fyd=${fyd.toFixed(0)} MPa)`,
    utilization: util,
    status: toStatus(util),
    article: 'EC2 §2.4.2.4',
  };
}

// ─── Check 4 — Cortante en barras ────────────────────────────────────────
// EN 1992-4 §6.2.2: fricción bajo placa usa la envolvente permanente µ·Nc,G.
// Cortante residual se reparte entre las barras (plástico: Fv = 0.6·As·fyd).
export function checkBoltShear(inp: AnchorPlateInputs, Nc_G_kN: number): CheckRow {
  const mu = inp.surface_type === 'roughened' ? 0.4 : 0.2;
  const Vfric_kN = mu * Math.max(0, Nc_G_kN);

  const { FvRd_kN: FvRd_per_bar_kN } = barStrengths(inp);
  const Fv_Rd_total_kN = FvRd_per_bar_kN * inp.bar_nLayout;

  const V_Rd_total_kN = Vfric_kN + Fv_Rd_total_kN;
  const util = inp.VEd / Math.max(V_Rd_total_kN, 1e-6);
  return {
    id: 'bolt-shear',
    description: 'Cortante en barras',
    value: `VEd=${inp.VEd.toFixed(1)} kN`,
    limit: `VRd=${V_Rd_total_kN.toFixed(1)} kN (μ·Nc,G=${Vfric_kN.toFixed(1)} + ${inp.bar_nLayout}·FvRd)`,
    utilization: util,
    status: toStatus(util),
    article: 'EC2 §2.4.2.4 + EN 1992-4 §6.2.2',
  };
}

// ─── Check 5 — Interacción N+V en barras (forma EC3 Tab 3.4) ─────────────
// Para barras dúctiles de armadura usamos la misma forma de interacción que
// para pernos: (Fv/FvRd) + (Ft/(1.4·FtRd)) ≤ 1.0, con FtRd/FvRd basados en fyd.
export function checkBoltInteraction(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
): CheckRow {
  const { FtRd_kN, FvRd_kN } = barStrengths(inp);

  const mu = inp.surface_type === 'roughened' ? 0.4 : 0.2;
  const Vfric_kN = mu * Math.max(0, inp.NEd_G);
  const Vbars_kN = Math.max(0, inp.VEd - Vfric_kN);
  const FvEd_per_bar_kN = Vbars_kN / Math.max(1, inp.bar_nLayout);

  let FtMax_kN = 0;
  for (const b of bars) if (b.inTension && b.Ft > FtMax_kN) FtMax_kN = b.Ft;

  const util_v = FvEd_per_bar_kN / Math.max(FvRd_kN, 1e-6);
  const util_t = FtMax_kN / (1.4 * Math.max(FtRd_kN, 1e-6));
  const util = util_v + util_t;

  return {
    id: 'bolt-interaction',
    description: 'Interacción N+V en barras',
    value: `${util_v.toFixed(2)} + ${util_t.toFixed(2)}`,
    limit: `≤ 1.00 (FvEd=${FvEd_per_bar_kN.toFixed(1)} kN · FtEd=${FtMax_kN.toFixed(1)} kN)`,
    utilization: util,
    status: toStatus(util),
    article: 'EC3 1-8 Tab 3.4',
  };
}

// ─── Check 6 — Longitud de anclaje (EC2 §8.4) ────────────────────────────
// Aplica a barras con transferencia por adherencia (prolongación recta /
// patilla / gancho). Para arandela+tuerca la carga se transfiere por el área
// anular de apoyo de la arandela (ver check 8 — pull-out).
// La conexión superior (top_connection: soldada / tuerca+arandela) es un
// detalle constructivo que no altera la transferencia al hormigón.
export function checkAnchorageLength(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
): CheckRow {
  const mustCheckBond = needsBondAnchorage(inp.bottom_anchorage);
  if (!mustCheckBond) {
    return {
      id: 'anchorage-length',
      description: 'Longitud de anclaje',
      value: 'No aplica (carga por arandela)',
      limit: 'Regido por check 8 (pull-out EN 1992-4 §7.2.1.5)',
      utilization: 0,
      status: 'ok',
      article: 'EC2 §8.4',
    };
  }

  const fctd = (0.21 * Math.pow(inp.fck, 2 / 3)) / GAMMA_C;   // EC2 §3.1.6
  const fbd  = 2.25 * 1.0 * 1.0 * fctd;                        // EC2 §8.4.2, η1=η2=1
  const { fyd, FtRd_kN } = barStrengths(inp);
  const FtRd_N = FtRd_kN * 1000;

  // cd por EC2 Fig. 8.3: menor de recubrimiento lateral y semi-separación entre barras.
  // En placa de anclaje la barra se ancla verticalmente, así que las cotas
  // perpendiculares son pedestal_cX / pedestal_cY (al borde) y bar_spacing_x/y
  // (a la barra vecina).
  const cd = Math.min(
    inp.pedestal_cX,
    inp.pedestal_cY,
    (inp.bar_spacing_x - inp.bar_diam) / 2,
    (inp.bar_spacing_y - inp.bar_diam) / 2,
  );
  const alpha1 = anchorageAlpha1(inp.bottom_anchorage, cd, inp.bar_diam);

  let lb_rqd_max = 0;
  let worstIdx = -1;
  for (const b of bars) {
    if (!b.inTension || b.Ft <= 0) continue;
    const Ft_N  = b.Ft * 1000;
    const lb_rqd = alpha1 * (inp.bar_diam / 4) * (fyd / fbd) * (Ft_N / FtRd_N);
    if (lb_rqd > lb_rqd_max) {
      lb_rqd_max = lb_rqd;
      worstIdx = b.index;
    }
  }

  if (worstIdx === -1) {
    return {
      id: 'anchorage-length',
      description: 'Longitud de anclaje',
      value: 'Todas las barras comprimidas',
      limit: `hef=${inp.bar_hef.toFixed(0)} mm`,
      utilization: 0,
      status: 'ok',
      article: 'EC2 §8.4',
    };
  }

  const util = lb_rqd_max / Math.max(inp.bar_hef, 1e-6);
  return {
    id: 'anchorage-length',
    description: 'Longitud de anclaje',
    value: `lb,rqd=${lb_rqd_max.toFixed(0)} mm (barra ${worstIdx + 1}, α1=${alpha1.toFixed(2)})`,
    limit: `hef=${inp.bar_hef.toFixed(0)} mm (cd=${cd.toFixed(0)} mm)`,
    utilization: util,
    status: toStatus(util),
    article: 'EC2 §8.4',
  };
}

// ─── Check 7 — Cono de hormigón (EN 1992-4 §7.2.1.4) ─────────────────────
export function checkConcreteCone(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
  Ft_total_kN: number,
): CheckRow {
  const tBars = bars.filter((b) => b.inTension && b.Ft > 0);
  if (tBars.length === 0 || Ft_total_kN < 1e-6) {
    return {
      id: 'concrete-cone',
      description: 'Cono de hormigón',
      value: 'Sin tracción en barras',
      limit: '—',
      utilization: 0,
      status: 'ok',
      article: 'EN 1992-4 §7.2.1.4',
    };
  }

  const hef  = inp.bar_hef;
  const s_cr = 3 * hef;
  const c_cr = 1.5 * hef;
  const k1   = 7.7;  // hormigón fisurado

  const N0_Rd_c_kN = (k1 * Math.sqrt(inp.fck) * Math.pow(hef, 1.5)) / GAMMA_MC / 1000;
  const Ac_N0 = s_cr * s_cr;

  let x_min = Infinity, x_max = -Infinity, y_min = Infinity, y_max = -Infinity;
  for (const b of tBars) {
    if (b.x < x_min) x_min = b.x;
    if (b.x > x_max) x_max = b.x;
    if (b.y < y_min) y_min = b.y;
    if (b.y > y_max) y_max = b.y;
  }
  const extX = Math.min(c_cr, inp.pedestal_cX);
  const extY = Math.min(c_cr, inp.pedestal_cY);
  const bxA = (x_max - x_min) + 2 * extX;
  const byA = (y_max - y_min) + 2 * extY;
  const Ac_N = bxA * byA;

  const c_min = Math.min(inp.pedestal_cX, inp.pedestal_cY);
  const psi_s = c_min >= c_cr ? 1.0 : 0.7 + (0.3 * c_min) / c_cr;

  const NRd_c_kN = N0_Rd_c_kN * (Ac_N / Ac_N0) * psi_s;
  const util = Ft_total_kN / Math.max(NRd_c_kN, 1e-6);

  return {
    id: 'concrete-cone',
    description: 'Cono de hormigón',
    value: `Ft=${Ft_total_kN.toFixed(1)} kN`,
    limit: `NRd,c=${NRd_c_kN.toFixed(1)} kN (Ac/Ac0=${(Ac_N / Ac_N0).toFixed(2)} · ψs=${psi_s.toFixed(2)})`,
    utilization: util,
    status: toStatus(util),
    article: 'EN 1992-4 §7.2.1.4',
  };
}

// ─── Check 8 — Arrancamiento / pull-out (EN 1992-4 §7.2.1.5) ─────────────
// Sólo aplica a 'arandela_tuerca'. Ah = (OD² − φ²)·π/4 (área anular).
// Las demás tipologías (recta, patilla, gancho, soldada) transfieren por
// adherencia y el fallo está cubierto por el check 6.
export function checkPullout(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
): CheckRow {
  if (!needsPullout(inp.bottom_anchorage)) {
    return {
      id: 'pullout',
      description: 'Arrancamiento (pull-out)',
      value: 'No aplica (anclaje por adherencia)',
      limit: 'Regido por check 6 (EC2 §8.4)',
      utilization: 0,
      status: 'ok',
      article: 'EN 1992-4 §7.2.1.5',
    };
  }

  const Ah_mm2 = washerBearingArea(inp.bar_diam, inp.washer_od);
  const NRd_p_kN = (6 * Ah_mm2 * inp.fck) / GAMMA_MP / 1000;

  let FtMax_kN = 0;
  for (const b of bars) if (b.inTension && b.Ft > FtMax_kN) FtMax_kN = b.Ft;

  const util = FtMax_kN / Math.max(NRd_p_kN, 1e-6);
  return {
    id: 'pullout',
    description: 'Arrancamiento (pull-out)',
    value: `Ft=${FtMax_kN.toFixed(1)} kN`,
    limit: `NRd,p=${NRd_p_kN.toFixed(1)} kN (Ah=${Ah_mm2.toFixed(0)} mm², OD=${inp.washer_od} mm)`,
    utilization: util,
    status: toStatus(util),
    article: 'EN 1992-4 §7.2.1.5',
  };
}

// ─── Check 9 — Splitting / side-face blowout (EN 1992-4 §7.2.1.6) ────────
export function checkSplitting(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
  Ft_total_kN: number,
): CheckRow {
  const tBars = bars.filter((b) => b.inTension && b.Ft > 0);
  if (tBars.length === 0 || Ft_total_kN < 1e-6) {
    return {
      id: 'splitting',
      description: 'Splitting / side-face blowout',
      value: 'Sin tracción en barras',
      limit: '—',
      utilization: 0,
      status: 'ok',
      article: 'EN 1992-4 §7.2.1.6',
    };
  }

  const hef = inp.bar_hef;
  const c_cr_sp = 1.5 * hef;
  const c_min = Math.min(inp.pedestal_cX, inp.pedestal_cY);

  if (c_min >= c_cr_sp) {
    return {
      id: 'splitting',
      description: 'Splitting / side-face blowout',
      value: `c=${c_min.toFixed(0)} ≥ c_cr,sp=${c_cr_sp.toFixed(0)} mm`,
      limit: 'No crítico',
      utilization: 0,
      status: 'ok',
      article: 'EN 1992-4 §7.2.1.6',
    };
  }

  const k1 = 7.7;
  const N0_Rd_c_kN = (k1 * Math.sqrt(inp.fck) * Math.pow(hef, 1.5)) / GAMMA_MC / 1000;
  const psi_h = Math.sqrt(c_min / c_cr_sp);
  const NRd_sp_kN = N0_Rd_c_kN * tBars.length * psi_h;

  const util = Ft_total_kN / Math.max(NRd_sp_kN, 1e-6);
  return {
    id: 'splitting',
    description: 'Splitting / side-face blowout',
    value: `Ft=${Ft_total_kN.toFixed(1)} kN`,
    limit: `NRd,sp=${NRd_sp_kN.toFixed(1)} kN (c=${c_min.toFixed(0)} < ${c_cr_sp.toFixed(0)} · ψh=${psi_h.toFixed(2)})`,
    utilization: util,
    status: toStatus(util),
    article: 'EN 1992-4 §7.2.1.6',
  };
}

// ─── Check 10 — Rigidizadores (esbeltez + soldadura) ─────────────────────
export function checkStiffener(inp: AnchorPlateInputs, Nc_kN: number): CheckRow {
  if (inp.rib_count === 0) {
    return {
      id: 'stiffener',
      description: 'Rigidizadores (esbeltez + soldadura)',
      value: 'Sin rigidizadores',
      limit: '—',
      utilization: 0,
      status: 'ok',
      article: 'EC3 1-1 §5.5 + EC3 1-8 §4.5.3',
    };
  }

  const fyp = PLATE_FY[inp.plate_steel];
  const fu = PLATE_FU[inp.plate_steel];
  const betaW = BETA_W[inp.plate_steel];
  const eps = Math.sqrt(235 / fyp);

  const slend = inp.rib_h / Math.max(inp.rib_t, 1e-6);
  const slend_lim = 14 * eps;
  const util_slend = slend / slend_lim;

  const Fw_Rd_rib_kN = (2 * inp.weld_throat * inp.rib_h * fu) / (Math.sqrt(3) * betaW * GAMMA_M2) / 1000;
  const F_rib_kN = Math.max(0, Nc_kN) / (inp.rib_count + 2);
  const util_weld = F_rib_kN / Math.max(Fw_Rd_rib_kN, 1e-6);

  const util = Math.max(util_slend, util_weld);
  const governs = util_slend >= util_weld ? 'esbeltez' : 'soldadura';

  return {
    id: 'stiffener',
    description: 'Rigidizadores (esbeltez + soldadura)',
    value: `c/t=${slend.toFixed(1)} · F_rib=${F_rib_kN.toFixed(1)} kN`,
    limit: `c/t≤${slend_lim.toFixed(1)} · Fw,Rd=${Fw_Rd_rib_kN.toFixed(1)} kN (${governs})`,
    utilization: util,
    status: toStatus(util),
    article: 'EC3 1-1 §5.5 + EC3 1-8 §4.5.3',
  };
}

// ─── Validation warnings ─────────────────────────────────────────────────
export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'warn' | 'fail';
}

export function validateAnchorPlate(inp: AnchorPlateInputs): ValidationWarning[] {
  const w: ValidationWarning[] = [];
  if (inp.plate_t < 8) {
    w.push({ field: 'plate_t', message: 'Espesor placa < 8 mm (mínimo práctico EC3)', severity: 'warn' });
  }
  if (inp.bar_edge_x < 1.5 * inp.bar_diam) {
    w.push({ field: 'bar_edge_x', message: 'Distancia al borde < 1.5·φ', severity: 'warn' });
  }
  if (inp.bar_edge_y < 1.5 * inp.bar_diam) {
    w.push({ field: 'bar_edge_y', message: 'Distancia al borde < 1.5·φ', severity: 'warn' });
  }
  if (needsBondAnchorage(inp.bottom_anchorage) && inp.bar_hef < 8 * inp.bar_diam) {
    w.push({ field: 'bar_hef', message: 'Profundidad anclaje < 8·φ (EC2 §8.4 lb,min)', severity: 'warn' });
  }
  if (inp.bottom_anchorage === 'arandela_tuerca' && inp.washer_od <= inp.bar_diam) {
    w.push({ field: 'washer_od', message: 'OD arandela ≤ φ barra (sin área de apoyo)', severity: 'fail' });
  }
  return w;
}

// ─── Main entry point ────────────────────────────────────────────────────
export interface AnchorPlateResult {
  inp: AnchorPlateInputs;
  solver: SolverResult;
  checks: CheckRow[];
  worstUtil: number;
  overallStatus: CheckStatus;
  warnings: ValidationWarning[];
  valid: boolean;
  pr1Limitations: string[];
}

export function calcAnchorPlate(inp: AnchorPlateInputs): AnchorPlateResult {
  const warnings = validateAnchorPlate(inp);
  const pr1Limitations: string[] = [];

  const valid = !(inp.NEd === 0 && inp.Mx === 0 && inp.My === 0);

  if (!valid) {
    const emptyBars = fourCornerLayout(inp.plate_a, inp.plate_b, inp.bar_edge_x, inp.bar_edge_y);
    return {
      inp,
      solver: {
        bolts: emptyBars,
        Nc: 0, Ft_total: 0, n_t: 0, x_c: 0, lifted: false,
        mode: 'uniform-compression', converged: true, note: 'Sin solicitación',
      },
      checks: [],
      worstUtil: 0,
      overallStatus: 'ok',
      warnings,
      valid: false,
      pr1Limitations,
    };
  }

  const solver = solveAnchorPlate(inp);
  const Ft_per_bar = solver.n_t > 0 ? solver.Ft_total / solver.n_t : 0;

  const fcd = inp.fck / GAMMA_C;
  const alpha = alphaExtension(inp);
  const fjd = BETA_J * alpha * fcd;

  const twoFlanges = solver.mode === 'uniform-compression';

  const checks: CheckRow[] = [
    checkPlateCompression(inp, solver.Nc, twoFlanges),
    checkPlateBending(inp, fjd),
    checkBoltTension(inp, Ft_per_bar),
    checkBoltShear(inp, inp.NEd_G),
    checkBoltInteraction(inp, solver.bolts),
    checkAnchorageLength(inp, solver.bolts),
    checkConcreteCone(inp, solver.bolts, solver.Ft_total),
    checkPullout(inp, solver.bolts),
    checkSplitting(inp, solver.bolts, solver.Ft_total),
    checkStiffener(inp, solver.Nc),
  ];

  const worstUtil = checks.length > 0 ? Math.max(...checks.map((c) => c.utilization)) : 0;
  const overallStatus = toStatus(worstUtil);

  return { inp, solver, checks, worstUtil, overallStatus, warnings, valid: true, pr1Limitations };
}
