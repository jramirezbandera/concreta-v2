// Anchor-plate calculations — placas con barras corrugadas embebidas.
//
// Modelo: barras corrugadas B400S/B500S ancladas en hormigón estructural.
// Dos detalles ortogonales:
//   · bottom_anchorage (extremo embebido — transfiere tracción al hormigón):
//     prolongacion_recta | patilla | gancho | arandela_tuerca.
//   · top_connection (unión barra↔placa — detalle constructivo, sin check):
//     soldada | tuerca_arandela.
// La placa de acero se asienta sobre una capa de mortero sin retracción
// (grout), sujeta a la cabeza del macizo por el grupo de barras traccionadas
// y por compresión directa del mortero.
//
// Norma de referencia: Código Estructural (RD 470/2021), España. Anejos
// aplicables:
//   - Anejo 18 — Uniones en estructuras de acero (placa base, T-stub,
//     rigidizadores). Eurocódigo de referencia secundaria: EC3 1-8.
//   - Anejo 11 — Anclajes en hormigón (cono, pull-out, splitting, modos
//     de fallo en cortante). Eurocódigo de referencia secundaria: EN 1992-4.
//   - Anejo 19 — Hormigón estructural (longitud de anclaje §49.5, fctd).
//     Eurocódigo de referencia secundaria: EC2.
//   - Anejo 22 — Esbeltez de placa en compresión (rigidizadores §5.5).
//
// Factores parciales: γc=1.5  γs=1.15  γM0=1.05  γM2=1.25  γMc=1.5  γinst=1.0.

import type { AnchorPlateInputs } from '../../data/defaults';
import { makeISectionBySize } from '../sections';
import {
  REBAR_AREAS,
  REBAR_GRADES,
  washerBearingArea,
  anchorageAlpha1,
  anchorageAlpha2,
  needsBondAnchorage,
  needsPullout,
  type RebarDiam,
  type RebarGrade,
} from '../../data/anchorBars';
import type { CheckRow, CheckStatus } from './types';
import { toStatus } from './types';
import { formatQuantity } from '../units/format';
import type { UnitSystem } from '../units/types';

const fmtF = (v: number, system: UnitSystem) =>
  formatQuantity(v, 'force', system, { precision: 1 });

// ─── Partial safety factors ─────────────────────────────────────────────
const GAMMA_C   = 1.5;
const GAMMA_S   = 1.15;  // EC2 §2.4.2.4 — reinforcement
const GAMMA_M0  = 1.05;
const GAMMA_M2  = 1.25;
const GAMMA_MC  = 1.5;   // EN 1992-4 Tab 4.1 — concrete cone / splitting / pull-out
// Pull-out coefficient k2 per EN 1992-4 §7.2.1.5(1) / CE Anejo 11:
//   k2 = 7.5 (cracked concrete, default)
//   k2 = 10.5 (uncracked concrete, ψc,N = 1.4 applied at member level)
const PULLOUT_K2_CRACKED   = 7.5;
const PULLOUT_K2_UNCRACKED = 10.5;

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

// ─── Direccional edges (H15, PR8a) ──────────────────────────────────────
//
// El input legacy `pedestal_cX`/`pedestal_cY` asume distancias simétricas
// (mismo recubrimiento en +x y −x). PR8a añadió `pedestal_cX1/cX2/cY1/cY2`
// para permitir el caso direccional (e.g., placa de fachada cerca de un
// borde). La regla de resolución preserva backward-compat:
//   - Si los pares direccionales son simétricos (cX1==cX2 y cY1==cY2), se
//     toma el valor legacy `pedestal_cX`/`pedestal_cY`. Esto cubre estado
//     persistido pre-PR0 (donde sólo se actualizó `pedestal_cX` y los
//     direccionales quedaron en el default sembrado).
//   - Si el usuario configuró asimetría (cX1≠cX2 o cY1≠cY2), se usan los
//     valores direccionales.
function resolveEdges(inp: AnchorPlateInputs) {
  const symX = inp.pedestal_cX1 === inp.pedestal_cX2;
  const symY = inp.pedestal_cY1 === inp.pedestal_cY2;
  return {
    cX1: symX ? inp.pedestal_cX : inp.pedestal_cX1,
    cX2: symX ? inp.pedestal_cX : inp.pedestal_cX2,
    cY1: symY ? inp.pedestal_cY : inp.pedestal_cY1,
    cY2: symY ? inp.pedestal_cY : inp.pedestal_cY2,
  };
}

// ─── Direccional shear (CR6, PR8b) ──────────────────────────────────────
//
// Para edge breakout y otros modos de fallo en cortante hace falta saber
// la DIRECCIÓN del cortante. Si el usuario sólo configuró el legacy `VEd`
// (defaults siembran Vx=VEd, Vy=0), interpretamos como cortante a lo largo
// del eje fuerte (+x). Si configuró Vx/Vy direccional, esos prevalen.
// Devuelve magnitud, dirección (rad), y la pareja (c1, c2) de la cara más
// expuesta + perpendicular.
function resolveShear(inp: AnchorPlateInputs) {
  const Vx_raw = inp.Vx;
  const Vy_raw = inp.Vy;
  // Si Vx/Vy difieren no-trivialmente de (VEd, 0), el usuario los configuró.
  // En otro caso (defaults o legacy), usar VEd como Vx escalar.
  const Vx = (Math.abs(Vx_raw - inp.VEd) < 1e-9 && Math.abs(Vy_raw) < 1e-9)
    ? inp.VEd : Vx_raw;
  const Vy = (Math.abs(Vx_raw - inp.VEd) < 1e-9 && Math.abs(Vy_raw) < 1e-9)
    ? 0 : Vy_raw;
  const Vmag = Math.hypot(Vx, Vy);
  const Vangle_rad = Vmag > 1e-9 ? Math.atan2(Vy, Vx) : 0;
  const edges = resolveEdges(inp);

  // Cara más expuesta en dirección de carga: si Vx>0 carga hacia +x, c1=cX1.
  // Para ángulos intermedios proyectar: tomar la cara dominante.
  const cos = Math.cos(Vangle_rad);
  const sin = Math.sin(Vangle_rad);
  let c1: number, c2: number;
  if (Math.abs(cos) >= Math.abs(sin)) {
    c1 = cos >= 0 ? edges.cX1 : edges.cX2;
    c2 = Math.min(edges.cY1, edges.cY2);
  } else {
    c1 = sin >= 0 ? edges.cY1 : edges.cY2;
    c2 = Math.min(edges.cX1, edges.cX2);
  }
  return { Vx, Vy, Vmag, Vangle_rad, c1, c2 };
}

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
    | 'partial-lift-saturated'
    | 'axis-aligned-4'
    | 'biaxial-plastic'
    | 'biaxial-grid'
    | 'pure-tension';
  converged: boolean;
  note: string;
  phi_NA?: number;             // rad — NA angle from +x
  d_NA?: number;               // mm — NA normal offset from plate centroid
  block?: Pt[];                // compression polygon (plate-local mm)
  /** PR0 — equilibrium residuals exposed for property tests (PR7a/b).
   *  Current solvers populate these with zeros for the axis-aligned closed-form
   *  path and with the actual grid-search residual for the biaxial path. */
  residuals: {
    SN_kN: number;             // ΣF axial residual (kN)
    SMx_kNm: number;           // ΣMx residual (kNm)
    SMy_kNm: number;           // ΣMy residual (kNm)
  };
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
      residuals: { SN_kN: 0, SMx_kNm: 0, SMy_kNm: 0 },
    };
  }

  // CR2 (PR7a) — Partial-lift via rectangular plastic block equilibrium
  // (CE Anejo 18 §6.2.5 / EC3 1-8 §6.2.5).
  //
  // Compression block: depth y_c from the compressed plate edge, width
  // b_eq = plate_b (T-stub-effective width refinement deferred to a later
  // PR — current value is conservative-by-extent, anti-conservative-by-
  // saturation). Tension side: 2 corner bars at distance L_n from section
  // centroid.
  //
  // Equilibrium (taking moments about the tension bar line):
  //   ΣN = 0:  fjd·b_eq·y_c − Ft_total = NEd                          (1)
  //   ΣM = 0:  fjd·b_eq·y_c·(L_t − y_c/2) = |M| + NEd·L_n             (2)
  // where  L_t = a − bar_edge_x  (distance from tension bar to compressed edge)
  //        L_n = a/2 − bar_edge_x  (distance from section centroid to tension bar)
  //
  // Solving (2) for y_c gives the quadratic
  //   y_c² − 2·L_t·y_c + 2·(M + NEd·L_n)/A_c = 0,  A_c = fjd·b_eq
  // with the physical root y_c = L_t − √(L_t² − 2·(M + NEd·L_n)/A_c).
  //
  // If disc < 0 or y_c is outside [0, a], the section cannot satisfy
  // equilibrium with this load combination → mode 'partial-lift-saturated'
  // (caught by checkBoltTension downstream which will return util ≥ 1).
  //
  // NEd ≤ 0 (pure tension) is bug H4 — proper handling lands in PR10.
  // Until then the quadratic typically returns disc < 0 for those cases
  // and we degrade to saturated.

  const NEd_N = NEd * 1000;
  const M_Nmm = MxEd * 1e6;
  const L_t = inp.plate_a - inp.bar_edge_x;
  const L_n = inp.plate_a / 2 - inp.bar_edge_x;
  const b_eq = inp.plate_b;

  const fcd_local = inp.fck / GAMMA_C;
  const alpha_local = alphaExtension(inp);
  const fjd_local = BETA_J * alpha_local * fcd_local;
  const A_c = fjd_local * b_eq;

  const disc = L_t * L_t - 2 * (M_Nmm + NEd_N * L_n) / A_c;

  const tensionSide = sgn > 0 ? -1 : +1;
  const { FtRd_kN } = barStrengths(inp);

  if (disc < 0 || NEd <= 0) {
    // No solución física (incluido NEd<0 que es H4 — TODO PR10).
    // Forzar Ft per bar = FtRd como techo y reportar saturado.
    const Ft_total_sat = 2 * FtRd_kN;
    const Nc_sat = NEd + Ft_total_sat;
    for (const b of bars) {
      if (Math.sign(b.x) === tensionSide) {
        b.inTension = true;
        b.Ft = FtRd_kN;
      }
    }
    return {
      bolts: bars,
      Nc: Nc_sat,
      Ft_total: Ft_total_sat,
      n_t: 2,
      x_c: L_n + (inp.plate_a / 2),     // arm degenerate
      lifted: true,
      mode: 'partial-lift-saturated',
      converged: false,
      note: NEd <= 0
        ? 'NEd≤0 no soportado en solver axial — pendiente PR10 (H4)'
        : 'Sección insuficiente — sin equilibrio plástico para esta combinación',
      residuals: { SN_kN: 0, SMx_kNm: NaN, SMy_kNm: 0 },
    };
  }

  const y_c = L_t - Math.sqrt(disc);

  if (y_c <= 0 || y_c > inp.plate_a) {
    // y_c físicamente inválido → degradar a saturated.
    const Ft_total_sat = 2 * FtRd_kN;
    const Nc_sat = NEd + Ft_total_sat;
    for (const b of bars) {
      if (Math.sign(b.x) === tensionSide) {
        b.inTension = true;
        b.Ft = FtRd_kN;
      }
    }
    return {
      bolts: bars,
      Nc: Nc_sat,
      Ft_total: Ft_total_sat,
      n_t: 2,
      x_c: 0,
      lifted: true,
      mode: 'partial-lift-saturated',
      converged: false,
      note: `Profundidad bloque y_c=${y_c.toFixed(1)} mm fuera de rango físico`,
      residuals: { SN_kN: 0, SMx_kNm: NaN, SMy_kNm: 0 },
    };
  }

  const Ft_total_N = A_c * y_c - NEd_N;
  const Ft_total_raw = Math.max(0, Ft_total_N / 1000);
  const Ft_per_bar = Ft_total_raw / 2;

  // Si Ft por barra excede FtRd, el equilibrio asumido no se puede sostener
  // físicamente (las barras plastifican antes). Reportar saturado.
  const saturated = Ft_per_bar > FtRd_kN;
  const Ft_total = saturated ? 2 * FtRd_kN : Ft_total_raw;
  const Nc = NEd + Ft_total;
  const Ft_assigned = saturated ? FtRd_kN : Ft_per_bar;

  for (const b of bars) {
    if (Math.sign(b.x) === tensionSide) {
      b.inTension = true;
      b.Ft = Ft_assigned;
    }
  }

  // Brazo del bloque desde el centroide de la sección (positivo hacia
  // el lado comprimido). Para residuals SMx: si saturated, el momento
  // que la sección puede sostener es menor que el aplicado.
  const x_n_lever = inp.plate_a / 2 - y_c / 2;
  const x_c_total = L_n + x_n_lever;

  // Residual de momento (en saturated). En no-saturated el equilibrio
  // es exacto por construcción de la cuadrática.
  let SMx_residual_kNm = 0;
  if (saturated) {
    // El y_c usado arriba ya no satisface la cuadrática original. Recomputar
    // y_c a partir de Nc saturado:
    const y_c_sat = (Nc * 1000) / A_c;
    const x_n_sat = inp.plate_a / 2 - y_c_sat / 2;
    const M_int_Nmm = Nc * 1000 * x_n_sat + Ft_total * 1000 * L_n;
    SMx_residual_kNm = MxEd - M_int_Nmm / 1e6;
  }

  return {
    bolts: bars,
    Nc,
    Ft_total,
    n_t: 2,
    x_c: x_c_total,
    lifted: true,
    mode: saturated ? 'partial-lift-saturated' : 'partial-lift',
    converged: !saturated,
    note: saturated
      ? `Tracción agotada — Ft/barra ${Ft_per_bar.toFixed(1)} kN > FtRd ${FtRd_kN.toFixed(1)} kN`
      : 'Tracción parcial — bloque plástico rectangular (CE Anejo 18 §6.2.5)',
    residuals: { SN_kN: 0, SMx_kNm: SMx_residual_kNm, SMy_kNm: 0 },
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

  // PR7b — projBounds y findD se removieron: el solver ahora bisecta d
  // directamente en evaluate() para satisfacer ΣM_proj_int = ΣM_proj_ext,
  // no via objetivo de área.
  void fullA;

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

  // CR1 (PR7b) — distribución lineal de Ft proporcional al signed distance
  // al eje neutro, capada a FtRd. Reemplaza el clamp plástico previo
  // (bars[i].Ft = FtRd_per_bar_kN) que sobreestimaba la tracción y forzaba
  // a checkBoltTension a util ≡ 1.00 en todo caso biaxial.
  //
  // Modelo (CE Anejo 18 §6.2.5 plástico):
  //   - Eje neutro: línea x·cos(φ) + y·sin(φ) = d. Barras con p_i := x_i·cos +
  //     y_i·sin < d están traccionadas.
  //   - Ft_i = min(α · sd_i, FtRd), donde sd_i = d − p_i ≥ 0 y α [N/mm] es
  //     la pendiente de la distribución.
  //   - α viene determinado por ΣN: α = (fjd·A(d) − NEd)/S(d), capado a
  //     α_cap = FtRd/max_sd. Si α < 0 o α > α_cap, ΣN se viola y la
  //     búsqueda externa de φ lo recoge en el residual.
  //
  // Para cada φ: bisecar d que satisfaga la proyección del momento sobre la
  // dirección (cos, sin), es decir, (Mx_int − Mx)·cos + (My_int − My)·sin = 0.
  // El grid search externo sobre φ minimiza el componente perpendicular.
  // Esta estructura evita los dos fixed-points espurios (saturado vs lineal)
  // que aparecían cuando sólo se enforzaba ΣN.
  const FtRd_N = FtRd_per_bar_kN * 1000;

  function evaluateAtPhiD(_phi: number, d: number, cos: number, sin: number, p: number[]) {
    let S = 0, max_sd = 0;
    for (let i = 0; i < p.length; i++) {
      if (p[i] < d) {
        const sd = d - p[i];
        S += sd;
        if (sd > max_sd) max_sd = sd;
      }
    }
    const block = clipPolygonToHalfPlane(rect, cos, sin, d);
    const { A: A_block, X: Xc, Y: Yc } = polygonAreaCentroid(block);
    const Nc_N = fjd * A_block;
    const alpha_uncapped = S > 0 ? (Nc_N - NEd * 1000) / S : 0;
    const alpha_cap = max_sd > 0 ? FtRd_N / max_sd : Infinity;
    const alpha_eff = Math.max(0, Math.min(alpha_uncapped, alpha_cap));

    let Ft_total_kN = 0;
    let bar_Mx_kNmm = 0, bar_My_kNmm = 0;
    for (let i = 0; i < bars0.length; i++) {
      if (p[i] < d) {
        const sd = d - p[i];
        const Ft_N = Math.min(alpha_eff * sd, FtRd_N);
        const Ft_kN = Math.max(0, Ft_N / 1000);
        Ft_total_kN += Ft_kN;
        bar_Mx_kNmm += Ft_kN * bars0[i].x;
        bar_My_kNmm += Ft_kN * bars0[i].y;
      }
    }

    const Nc_kN = Nc_N / 1000;
    const Mx_int_kNm = (Nc_kN * Xc - bar_Mx_kNmm) / 1000;
    const My_int_kNm = (Nc_kN * Yc - bar_My_kNmm) / 1000;
    return { A_block, Nc_kN, Ft_total_kN, alpha_eff, Mx_int_kNm, My_int_kNm, block, Xc, Yc };
  }

  function evaluate(phi: number): Evaluation {
    const cos = Math.cos(phi), sin = Math.sin(phi);
    const bars = bars0.map((b) => ({ ...b, Ft: 0, inTension: false }));
    const p = bars0.map((b) => b.x * cos + b.y * sin);

    // d range: proyecciones de las esquinas del rect sobre (cos, sin).
    let dMinR = Infinity, dMaxR = -Infinity;
    for (const c of rect) {
      const proj = c.x * cos + c.y * sin;
      if (proj < dMinR) dMinR = proj;
      if (proj > dMaxR) dMaxR = proj;
    }

    // Bisección en d para satisfacer ΣM_proj_int = ΣM_proj_ext (proyección
    // sobre cos, sin). Mx_int(d) NO es monótona: alcanza 0 en ambos extremos
    // (sin bloque y bloque-uniforme-centrado) y un peak intermedio, por lo
    // que existen DOS roots (estado low-tension y estado high-tension /
    // saturado). Preferimos el low-tension scanando desde dMaxR (alto-d,
    // poco bloque) hacia dMinR; el primer cambio de signo es el solucion
    // realista para cargas moderadas. Si no hay cambio de signo (carga
    // excede capacidad), tomamos el d con menor |f|.
    const f = (d: number) => {
      const r = evaluateAtPhiD(phi, d, cos, sin, p);
      return (r.Mx_int_kNm - Mx) * cos + (r.My_int_kNm - My) * sin;
    };

    const N_SCAN = 60;
    const scanStep = (dMaxR - dMinR) / N_SCAN;
    let dBest: number | undefined;
    let fBestAbs = Infinity;
    let dFallback = dMaxR;
    let dPrev = dMaxR + 0.5;
    let fPrev = f(dPrev);
    for (let j = 0; j <= N_SCAN; j++) {
      const dCurr = dMaxR + 0.5 - (j + 1) * scanStep;
      const fCurr = f(dCurr);
      if (Math.abs(fCurr) < fBestAbs) { fBestAbs = Math.abs(fCurr); dFallback = dCurr; }
      if (fPrev * fCurr < 0) {
        // Primer cambio de signo encontrado escaneando de alto a bajo d.
        let dLo_b = dCurr, dHi_b = dPrev;
        let fLo_b = fCurr;
        let dMid = (dLo_b + dHi_b) / 2;
        for (let bi = 0; bi < 50; bi++) {
          dMid = (dLo_b + dHi_b) / 2;
          const fMid = f(dMid);
          if (Math.abs(fMid) < 0.005 || Math.abs(dHi_b - dLo_b) < 0.01) break;
          if (fLo_b * fMid < 0) { dHi_b = dMid; }
          else { dLo_b = dMid; fLo_b = fMid; }
        }
        dBest = dMid;
        break;
      }
      dPrev = dCurr;
      fPrev = fCurr;
    }
    if (dBest === undefined) {
      // Sin sign change — sección saturada o carga excede capacidad.
      dBest = dFallback;
    }

    // Evaluación final + asignación de Ft a las barras
    const r = evaluateAtPhiD(phi, dBest, cos, sin, p);
    let S = 0, max_sd = 0;
    for (let i = 0; i < bars.length; i++) {
      if (p[i] < dBest) {
        const sd = dBest - p[i];
        S += sd;
        if (sd > max_sd) max_sd = sd;
      }
    }
    const alpha_eff = r.alpha_eff;
    for (let i = 0; i < bars.length; i++) {
      if (p[i] < dBest) {
        const sd = dBest - p[i];
        const Ft_N = Math.min(alpha_eff * sd, FtRd_N);
        bars[i].Ft = Math.max(0, Ft_N / 1000);
        bars[i].inTension = bars[i].Ft > 1e-6;
      } else {
        bars[i].Ft = 0;
        bars[i].inTension = false;
      }
    }

    return {
      phi,
      d: dBest,
      bars,
      Nc_kN: r.Nc_kN,
      Ft_total_kN: r.Ft_total_kN,
      Mx_int_kNm: r.Mx_int_kNm,
      My_int_kNm: r.My_int_kNm,
      block: r.block,
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
    // Biaxial grid path: split the scalar moment residual into Mx and My
    // components for downstream property tests (PR7b). The axial residual
    // is zero by construction (Nc = NEd + Ft_total enforced in the loop).
    residuals: {
      SN_kN: 0,
      SMx_kNm: best.Mx_int_kNm - Mx,
      SMy_kNm: best.My_int_kNm - My,
    },
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────
// ─── Pure-tension solver (H4, PR10) ──────────────────────────────────────
//
// Cuando NEd < 0 (tracción axial pura — mástiles, marquesinas, anclajes
// verticales descendentes), no existe bloque de compresión bajo placa.
// Todas las barras pueden estar traccionadas; el momento crea una
// distribución asimétrica.
//
// Modelo: distribución lineal `Ft_i = a + b·x_i + c·y_i` por barra,
// resolviendo el sistema 3×3:
//   Σ Ft = a·n + b·ΣX + c·ΣY = −NEd      (ΣN, NEd<0 → positivo |NEd|)
//   Σ Ft·x = a·ΣX + b·ΣX² + c·ΣXY = Mx   (Mx en kN·mm)
//   Σ Ft·y = a·ΣY + b·ΣXY + c·ΣY² = My
//
// Cap por barra: Ft_i ≤ FtRd. Si la fórmula da Ft_i < 0 (compresión en barra
// sin contacto con hormigón), se clava a 0 (la barra simplemente no carga).
//
// PR10 minimum: single-shot solve + clamp + reporta residuals. Iterar
// excluyendo barras-a-0 y re-solver es polish futuro.
export function solvePureTension(inp: AnchorPlateInputs): SolverResult {
  const bars = generateLayout(inp);
  const NEd = inp.NEd;     // negativo
  const Mx = inp.Mx;
  const My = inp.My;
  const n = bars.length;

  if (n === 0) {
    return {
      bolts: bars, Nc: 0, Ft_total: 0, n_t: 0, x_c: 0, lifted: true,
      mode: 'pure-tension', converged: false,
      note: 'Sin barras',
      residuals: { SN_kN: -NEd, SMx_kNm: Mx, SMy_kNm: My },
    };
  }

  // Momentos geométricos del grupo (respecto al centroide = origen).
  let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
  for (const b of bars) {
    sumX += b.x;
    sumY += b.y;
    sumX2 += b.x * b.x;
    sumY2 += b.y * b.y;
    sumXY += b.x * b.y;
  }

  // Sistema lineal 3×3 — solve via Cramer's rule.
  const A: [number, number, number][] = [
    [n, sumX, sumY],
    [sumX, sumX2, sumXY],
    [sumY, sumXY, sumY2],
  ];
  const RHS: [number, number, number] = [-NEd, Mx * 1000, My * 1000];

  const det3 = (m: [number, number, number][]): number =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const D = det3(A);
  let a = 0, b = 0, c = 0;
  if (Math.abs(D) > 1e-6) {
    const A1: [number, number, number][] = [
      [RHS[0], A[0][1], A[0][2]],
      [RHS[1], A[1][1], A[1][2]],
      [RHS[2], A[2][1], A[2][2]],
    ];
    const A2: [number, number, number][] = [
      [A[0][0], RHS[0], A[0][2]],
      [A[1][0], RHS[1], A[1][2]],
      [A[2][0], RHS[2], A[2][2]],
    ];
    const A3: [number, number, number][] = [
      [A[0][0], A[0][1], RHS[0]],
      [A[1][0], A[1][1], RHS[1]],
      [A[2][0], A[2][1], RHS[2]],
    ];
    a = det3(A1) / D;
    b = det3(A2) / D;
    c = det3(A3) / D;
  } else {
    // Matriz singular (e.g., todas las barras en una línea). Fallback uniforme.
    a = -NEd / n;
    b = 0;
    c = 0;
  }

  // Asignar Ft por barra (clamp ≥ 0 + cap FtRd).
  const { FtRd_kN } = barStrengths(inp);
  let saturated = false;
  let Ft_total = 0;
  let bar_Mx_kNmm = 0, bar_My_kNmm = 0;
  for (const bar of bars) {
    const Ft_raw = a + b * bar.x + c * bar.y;
    if (Ft_raw <= 0) {
      bar.Ft = 0;
      bar.inTension = false;
    } else {
      const Ft_capped = Math.min(Ft_raw, FtRd_kN);
      if (Ft_raw > FtRd_kN) saturated = true;
      bar.Ft = Ft_capped;
      bar.inTension = true;
      Ft_total += Ft_capped;
      bar_Mx_kNmm += Ft_capped * bar.x;
      bar_My_kNmm += Ft_capped * bar.y;
    }
  }

  // Residuals tras clamp (no exact si alguna barra fue a 0):
  const SN_residual_kN = (-NEd) - Ft_total;
  const SMx_residual_kNm = Mx - bar_Mx_kNmm / 1000;
  const SMy_residual_kNm = My - bar_My_kNmm / 1000;

  // Converged si todos los residuos son ~0 (lineal puro, sin barras compresas).
  const M_ext_mag = Math.hypot(Mx, My);
  const tol_M = Math.max(0.5, 0.02 * M_ext_mag);
  const converged = Math.abs(SN_residual_kN) < 0.5
    && Math.abs(SMx_residual_kNm) < tol_M
    && Math.abs(SMy_residual_kNm) < tol_M
    && !saturated;

  return {
    bolts: bars,
    Nc: 0,
    Ft_total,
    n_t: bars.filter((b) => b.inTension).length,
    x_c: 0,
    lifted: true,
    mode: 'pure-tension',
    converged,
    note: saturated
      ? `Tracción pura saturada — barra al cap FtRd=${FtRd_kN.toFixed(1)} kN`
      : (converged
        ? 'Tracción pura — distribución lineal sin bloque de compresión'
        : 'Tracción pura con barras descomprimidas — residuos no nulos (refinar PR futura)'),
    residuals: {
      SN_kN: SN_residual_kN,
      SMx_kNm: SMx_residual_kNm,
      SMy_kNm: SMy_residual_kNm,
    },
  };
}

export function solveAnchorPlate(inp: AnchorPlateInputs): SolverResult {
  // H4 (PR10) — NEd<0 (tracción axial pura) rutea al solver dedicado en
  // lugar de degradar a 'partial-lift-saturated' (PR7a fallback).
  if (inp.NEd < 0) {
    return solvePureTension(inp);
  }

  const absMy = Math.abs(inp.My);
  const absMx = Math.abs(inp.Mx);
  const M_ext = Math.hypot(absMx, absMy);
  const NEd_safe = Math.max(inp.NEd, 1e-6);

  const nearPureCompression = M_ext < 0.01 * NEd_safe * inp.plate_a / 6 / 1000;
  const pureAxis = absMy < 1e-6;

  // CR4 — solveAxisAligned4 only models 4 corner bars (via fourCornerLayout).
  // For nLayout ∈ {6, 8, 9} we must route to solveBiaxial even under pure Mx
  // so the intermediate bars are not silently ignored.
  if ((pureAxis || nearPureCompression) && inp.bar_nLayout === 4) {
    return solveAxisAligned4(inp);
  }
  return solveBiaxial(inp);
}

// ─── Kj joint concentration factor (EC3 1-8 §6.2.5(4)) ──────────────────
// H2 (Phase 2 Tier 2) — sustituye la aproximación lineal previa
// (α = min(1+2·ed, 1+2·el)) por la fórmula real:
//   Kj = √((a1·b1) / (a·b))   con 1 ≤ Kj ≤ 3
// donde a1, b1 son las dimensiones efectivas del área de apoyo en la
// cimentación, capadas por:
//   a1 ≤ min(a + 2·ar, 5·a, a + h, 5·b1)
//   b1 ≤ min(b + 2·br, 5·b, b + h, 5·a1)
//   a1 ≥ a; b1 ≥ b
// ar, br = sobrante del macizo en cada eje (= plate_margin_x/y);
// h     = canto del macizo (pedestal_h).
// La aproximación previa subestimaba Kj hasta ≈30% en geometrías reales
// (Codex Eng F5). Cross-coupling 5·a1/5·b1 se resuelve con una pasada de
// refinamiento (suficiente — en la práctica los cross-caps rara vez vinculan).
export function bearingConcentration(inp: AnchorPlateInputs): {
  Kj: number; a1: number; b1: number;
} {
  const a = inp.plate_a;
  const b = inp.plate_b;
  const ar = inp.plate_margin_x;
  const br = inp.plate_margin_y;
  const h = inp.pedestal_h;

  // Provisional a1/b1 ignorando el cross-cap.
  const a1_prov = Math.max(a, Math.min(a + 2 * ar, 5 * a, a + h));
  const b1_prov = Math.max(b, Math.min(b + 2 * br, 5 * b, b + h));
  // Aplicar el cross-cap con los provisionales.
  const a1 = Math.max(a, Math.min(a1_prov, 5 * b1_prov));
  const b1 = Math.max(b, Math.min(b1_prov, 5 * a1));

  const Kj_raw = Math.sqrt((a1 * b1) / (a * b));
  const Kj = Math.min(3, Math.max(1, Kj_raw));
  return { Kj, a1, b1 };
}

// alias retenido para call-sites previos; firma idéntica a la implementación
// previa (devuelve un escalar multiplicador para fjd = βj · α · fcd).
export function alphaExtension(inp: AnchorPlateInputs): number {
  return bearingConcentration(inp).Kj;
}

// ─── T-stub effective area (EC3 1-8 §6.2.5(3)–(5)) ───────────────────────
export function tStubEffectiveArea(
  inp: AnchorPlateInputs,
  fjd_MPa: number,
  twoFlanges: boolean,
): { A_eff: number; c: number } {
  const section = makeISectionBySize(
    inp.sectionType as 'IPE' | 'HEA' | 'HEB' | 'IPN',
    inp.sectionSize,
  );
  if (!section) return { A_eff: inp.plate_a * inp.plate_b, c: 0 };
  const p = section;

  // EC3 1-8 §6.2.5(4) Eq 6.5: c = t · √(fyd / (3·fjd))
  // donde fyd = fyp / γM0 (resistencia de cálculo de la placa). El código
  // previo usaba fyp (característica), sobreestimando Aeff ≈ 2.4%.
  const fyp = PLATE_FY[inp.plate_steel];
  const fyd_plate = fyp / GAMMA_M0;
  const c_raw = inp.plate_t * Math.sqrt(fyd_plate / (3 * Math.max(fjd_MPa, 1e-6)));
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
  system: UnitSystem = 'si',
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
    value: fmtF(Nc_kN, system),
    limit: `${fmtF(Nc_Rd_kN, system)} (fjd=${fjd.toFixed(1)} MPa, Aeff=${(A_eff / 100).toFixed(0)} cm², c=${c.toFixed(0)})`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 18 §6.2.5',
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
  const p = makeISectionBySize(
    inp.sectionType as 'IPE' | 'HEA' | 'HEB' | 'IPN',
    inp.sectionSize,
  );
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
    article: 'CE Anejo 18 §6.2.5',
  };
}

// ─── Check 3 — Tracción en barras (EC2 §2.4.2.4 / EHE-08) ────────────────
export function checkBoltTension(
  inp: AnchorPlateInputs,
  Ft_per_bar_kN: number,
  system: UnitSystem = 'si',
): CheckRow {
  const { As, fyd, FtRd_kN } = barStrengths(inp);
  const util = Ft_per_bar_kN / Math.max(FtRd_kN, 1e-6);
  return {
    id: 'bolt-tension',
    description: 'Tracción en barras',
    value: `Ft=${fmtF(Ft_per_bar_kN, system)}`,
    limit: `FtRd=${fmtF(FtRd_kN, system)} (As=${As.toFixed(0)} mm², fyd=${fyd.toFixed(0)} MPa)`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 19 §49.5',
  };
}

// ─── Check 4 — Cortante en barras ────────────────────────────────────────
// EN 1992-4 §6.2.2: fricción bajo placa usa la envolvente permanente µ·Nc,G.
// Cortante residual se reparte entre las barras (plástico: Fv = 0.6·As·fyd).
//
// H10 (PR5) — usar bars.length (lo que el solver modeló) en vez de
// inp.bar_nLayout (lo que el usuario declaró). Aunque CR4 ya garantiza que
// el dispatcher genera el layout real, este paso protege contra divergencias
// futuras donde el solver decida ignorar barras (e.g., barras fuera del
// pedestal en geometrías inválidas).
export function checkBoltShear(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
  Nc_G_kN: number,
  system: UnitSystem = 'si',
): CheckRow {
  const mu = inp.surface_type === 'roughened' ? 0.4 : 0.2;
  const Vfric_kN = mu * Math.max(0, Nc_G_kN);

  const { FvRd_kN: FvRd_per_bar_kN } = barStrengths(inp);
  const nBars = bars.length;
  const Fv_Rd_total_kN = FvRd_per_bar_kN * nBars;

  const V_Rd_total_kN = Vfric_kN + Fv_Rd_total_kN;
  // PR8a — el cortante se trata como magnitud escalar aquí. La descomposición
  // direccional Vx/Vy se usa en checkConcreteEdgeBreakout (PR8b) donde la
  // dirección de carga afecta a c1 y al α de breakout.
  const util = inp.VEd / Math.max(V_Rd_total_kN, 1e-6);
  return {
    id: 'bolt-shear',
    description: 'Cortante en barras',
    value: `VEd=${fmtF(inp.VEd, system)}`,
    limit: `VRd=${fmtF(V_Rd_total_kN, system)} (μ·Nc,G=${fmtF(Vfric_kN, system)} + ${nBars}·FvRd)`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 11 §6.2.2',
  };
}

// ─── Check 5 — Interacción N+V en anclajes (CR6, PR8b) ──────────────────
//
// EN 1992-4 §7.2.3 / CE Anejo 11 §7.2.3 — interacción para anclajes en
// hormigón. La forma EC3 1-8 Tab 3.4 (Fv/FvRd + Ft/(1.4·FtRd) ≤ 1.0) es
// para PERNOS pre-tensados y NO aplica a barras corrugadas en hormigón.
//
// Para fallo dúctil (acero gobierna, modo de fallo es plastificación de
// la barra) — caso típico de barras corrugadas con anclaje adecuado:
//   (Nsd/NRd,s)² + (Vsd/VRd,s)² ≤ 1.0
//
// Donde:
//   NRd,s = FtRd_per_bar (capacidad de acero — barra fluye)
//   VRd,s = FvRd_per_bar  (capacidad de cortante de acero — plástico)
//   Nsd, Vsd: la solicitación máxima por barra
//
// Esta forma cuadrática (exponente 2) es menos conservadora que la lineal
// EC3 y refleja correctamente el comportamiento dúctil. Para fallo frágil
// (concrete gobierna), la norma usa exponente 1 — no implementado aquí,
// queda como TODO si se detecta hef muy somero o concrete-edge gobernando.
export function checkBoltInteraction(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
  system: UnitSystem = 'si',
): CheckRow {
  const { FtRd_kN, FvRd_kN } = barStrengths(inp);

  const mu = inp.surface_type === 'roughened' ? 0.4 : 0.2;
  const Vfric_kN = mu * Math.max(0, inp.NEd_G);
  const Vbars_kN = Math.max(0, inp.VEd - Vfric_kN);
  const FvEd_per_bar_kN = Vbars_kN / Math.max(1, bars.length);

  let FtMax_kN = 0;
  for (const b of bars) if (b.inTension && b.Ft > FtMax_kN) FtMax_kN = b.Ft;

  const ratio_n = FtMax_kN / Math.max(FtRd_kN, 1e-6);
  const ratio_v = FvEd_per_bar_kN / Math.max(FvRd_kN, 1e-6);
  // Forma cuadrática EN 1992-4 §7.2.3 ductile: (N/NRd)² + (V/VRd)² ≤ 1.
  const util = ratio_n * ratio_n + ratio_v * ratio_v;

  return {
    id: 'bolt-interaction',
    description: 'Interacción N+V en barras (dúctil)',
    value: `(${ratio_n.toFixed(2)})² + (${ratio_v.toFixed(2)})²`,
    limit: `≤ 1.00 (FvEd=${fmtF(FvEd_per_bar_kN, system)} · FtEd=${fmtF(FtMax_kN, system)})`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 11 §7.2.3',
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
      status: 'neutral',
      article: 'CE Anejo 19 §49.5',
    };
  }

  const fctd = (0.21 * Math.pow(inp.fck, 2 / 3)) / GAMMA_C;   // EC2 §3.1.6
  const fbd  = 2.25 * 1.0 * 1.0 * fctd;                        // EC2 §8.4.2, η1=η2=1
  const { fyd, FtRd_kN } = barStrengths(inp);
  const FtRd_N = FtRd_kN * 1000;

  // H14 (PR5) — cd debe derivarse de las coordenadas reales de cada barra
  // generadas por el solver, no de bar_spacing_x/y (input del usuario que
  // puede divergir del layout 6/8/9 efectivo). Por EC2 Fig. 8.3 cd es el
  // mínimo de:
  //   · recubrimiento lateral al borde de hormigón en cada eje
  //   · semi-separación clara a la barra vecina más cercana en cada eje
  // pedestal_cX/cY es la distancia barra-corner→borde del pedestal (más
  // expuesta). Para barras interiores, el recubrimiento es mayor:
  //   coverX = pedestal_cX + ((plate_a/2 − bar_edge_x) − |b.x|)
  // que se reduce a pedestal_cX para |b.x| = corner_x y crece para interiores.
  const cornerX = inp.plate_a / 2 - inp.bar_edge_x;
  const cornerY = inp.plate_b / 2 - inp.bar_edge_y;
  const edges = resolveEdges(inp);

  function cdForBar(b: AnchorBarPosition): number {
    // H15 (PR8a) — recubrimiento direccional por cara del pedestal.
    // Para una barra en b.x, las dos distancias a las caras x del pedestal son:
    //   distancia al borde +x: cX1 + (cornerX − b.x)
    //   distancia al borde -x: cX2 + (cornerX + b.x)
    // El recubrimiento relevante por eje es el min de las dos caras.
    const coverXp = edges.cX1 + (cornerX - b.x);
    const coverXm = edges.cX2 + (cornerX + b.x);
    const coverYp = edges.cY1 + (cornerY - b.y);
    const coverYm = edges.cY2 + (cornerY + b.y);
    const coverX = Math.min(coverXp, coverXm);
    const coverY = Math.min(coverYp, coverYm);
    // Distancia real a la barra vecina más cercana en cada eje.
    let nearestX = Infinity;
    let nearestY = Infinity;
    for (const o of bars) {
      if (o === b) continue;
      const dx = Math.abs(o.x - b.x);
      const dy = Math.abs(o.y - b.y);
      if (dx > 0 && dx < nearestX) nearestX = dx;
      if (dy > 0 && dy < nearestY) nearestY = dy;
    }
    const halfSpacingX = (nearestX - inp.bar_diam) / 2;
    const halfSpacingY = (nearestY - inp.bar_diam) / 2;
    return Math.min(coverX, coverY, halfSpacingX, halfSpacingY);
  }

  let lb_rqd_max = 0;
  let worstIdx = -1;
  let worstAlpha1 = 1.0;
  let worstAlpha2 = 1.0;
  let worstCd = Infinity;
  // H3 (Phase 2 Tier 2) — lb,d = α1·α2·α3·α4·α5·lb,rqd (CE Anejo 19 §49.5).
  // Implementados: α1 (forma extremo) y α2 (recubrimiento, continuo). α3
  // (transversal no soldada), α4 (transversal soldada) y α5 (presión
  // transversal) quedan a 1.0 — no exponemos armadura transversal ni
  // presión de confinamiento como inputs del módulo.
  // Restricción EC2 §8.4.4(1): α2·α3·α5 ≥ 0.7 — satisfecha porque
  // anchorageAlpha2 está acotada a 0.7.
  for (const b of bars) {
    if (!b.inTension || b.Ft <= 0) continue;
    const cd_bar = cdForBar(b);
    const alpha1 = anchorageAlpha1(inp.bottom_anchorage, cd_bar, inp.bar_diam);
    const alpha2 = anchorageAlpha2(cd_bar, inp.bar_diam);
    const Ft_N  = b.Ft * 1000;
    const lb_rqd = alpha1 * alpha2 * (inp.bar_diam / 4) * (fyd / fbd) * (Ft_N / FtRd_N);
    if (lb_rqd > lb_rqd_max) {
      lb_rqd_max = lb_rqd;
      worstIdx = b.index;
      worstAlpha1 = alpha1;
      worstAlpha2 = alpha2;
      worstCd = cd_bar;
    }
  }

  if (worstIdx === -1) {
    return {
      id: 'anchorage-length',
      description: 'Longitud de anclaje',
      value: 'Todas las barras comprimidas',
      limit: `hef=${inp.bar_hef.toFixed(0)} mm`,
      utilization: 0,
      status: 'neutral',
      article: 'CE Anejo 19 §49.5',
    };
  }

  const util = lb_rqd_max / Math.max(inp.bar_hef, 1e-6);
  return {
    id: 'anchorage-length',
    description: 'Longitud de anclaje',
    value: `lb,rqd=${lb_rqd_max.toFixed(0)} mm (barra ${worstIdx + 1}, α1=${worstAlpha1.toFixed(2)}, α2=${worstAlpha2.toFixed(2)})`,
    limit: `hef=${inp.bar_hef.toFixed(0)} mm (cd=${worstCd.toFixed(0)} mm)`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 19 §49.5',
  };
}

// ─── Check 7 — Cono de hormigón (EN 1992-4 §7.2.1.4) ─────────────────────
export function checkConcreteCone(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
  Ft_total_kN: number,
  system: UnitSystem = 'si',
): CheckRow {
  const tBars = bars.filter((b) => b.inTension && b.Ft > 0);
  if (tBars.length === 0 || Ft_total_kN < 1e-6) {
    return {
      id: 'concrete-cone',
      description: 'Cono de hormigón',
      value: 'Sin tracción en barras',
      limit: '—',
      utilization: 0,
      status: 'neutral',
      article: 'CE Anejo 11 §7.2.1.4',
    };
  }

  const hef  = inp.bar_hef;
  const s_cr = 3 * hef;
  const c_cr = 1.5 * hef;
  // EN 1992-4 §7.2.1.4: k1 = 7.7 (cracked) / 11.0 (uncracked). El input
  // concrete_cracked (M19) controla el modo; default fisurado conservador.
  const k1 = inp.concrete_cracked ? 7.7 : 11.0;

  const N0_Rd_c_kN = (k1 * Math.sqrt(inp.fck) * Math.pow(hef, 1.5)) / GAMMA_MC / 1000;
  const Ac_N0 = s_cr * s_cr;

  let x_min = Infinity, x_max = -Infinity, y_min = Infinity, y_max = -Infinity;
  for (const b of tBars) {
    if (b.x < x_min) x_min = b.x;
    if (b.x > x_max) x_max = b.x;
    if (b.y < y_min) y_min = b.y;
    if (b.y > y_max) y_max = b.y;
  }
  // H15 (PR8a) — proyección direccional del cono: cada lado del bounding box
  // del grupo tensionado se extiende por el min(c_cr, distancia direccional
  // al borde correspondiente). Para pedestal simétrico (legacy pedestal_cX/cY)
  // el resultado coincide con el modelo anterior (extX·2). Para pedestal
  // asimétrico (placa de fachada cerca de un borde), el grupo se proyecta
  // correctamente por cada cara.
  const edges = resolveEdges(inp);
  const extXp = Math.min(c_cr, edges.cX1);
  const extXm = Math.min(c_cr, edges.cX2);
  const extYp = Math.min(c_cr, edges.cY1);
  const extYm = Math.min(c_cr, edges.cY2);
  const bxA = (x_max - x_min) + extXp + extXm;
  const byA = (y_max - y_min) + extYp + extYm;
  const Ac_N = bxA * byA;

  // ψs por mínima distancia direccional al borde (cualquiera de las 4 caras).
  const c_min = Math.min(edges.cX1, edges.cX2, edges.cY1, edges.cY2);
  const psi_s = c_min >= c_cr ? 1.0 : 0.7 + (0.3 * c_min) / c_cr;

  // H1 (Phase 2 Tier 2) — factores ψec,N + ψre,N (+ ψM,N reservado).
  // Patrón replicado de checkSplitting (PR6).
  //
  // ψec,N por excentricidad del grupo tensionado (EN 1992-4 §7.2.1.4(6) /
  // CE Anejo 11). Mismo cálculo que ψec,sp: centroide ponderado por Ft.
  const sumFt = tBars.reduce((s, b) => s + b.Ft, 0);
  let eX = 0, eY = 0;
  if (sumFt > 0) {
    eX = tBars.reduce((s, b) => s + b.Ft * b.x, 0) / sumFt;
    eY = tBars.reduce((s, b) => s + b.Ft * b.y, 0) / sumFt;
  }
  const eN = Math.hypot(eX, eY);
  const psi_ec_N = 1 / (1 + 2 * eN / s_cr);

  // ψre,N por shell spalling (EN 1992-4 §7.2.1.4(8), Eq 7.7):
  //   ψre,N = 0.5 + hef/(200 mm) ≤ 1.0
  // Aplica cuando NO hay armadura transversal específica que controle el
  // shell spalling. Como el módulo no expone armadura transversal del macizo
  // como input, asumimos el caso conservador (ausencia). Para hef ≥ 100 mm
  // (caso típico, incluido FTUX hef=300) → ψre,N = 1.0.
  const psi_re_N = Math.min(1.0, 0.5 + hef / 200);

  // ψM,N (compresión adyacente, EN 1992-4 §7.2.1.4(11)) es BENEFICIOSO (≥1)
  // pero requiere el brazo entre tracción y compresión del solver y solo
  // aplica con bloque de compresión. Mantenido a 1.0 conservadoramente
  // hasta que se exponga el lever arm correcto. TODO Phase 3.
  const psi_M_N = 1.0;

  const NRd_c_kN = N0_Rd_c_kN * (Ac_N / Ac_N0) * psi_s * psi_ec_N * psi_re_N * psi_M_N;
  const util = Ft_total_kN / Math.max(NRd_c_kN, 1e-6);

  return {
    id: 'concrete-cone',
    description: 'Cono de hormigón',
    value: `Ft=${fmtF(Ft_total_kN, system)}`,
    limit: `NRd,c=${fmtF(NRd_c_kN, system)} (Ac/Ac0=${(Ac_N / Ac_N0).toFixed(2)} · ψs=${psi_s.toFixed(2)} · ψec=${psi_ec_N.toFixed(2)} · ψre=${psi_re_N.toFixed(2)})`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 11 §7.2.1.4',
  };
}

// ─── Check 8 — Arrancamiento / pull-out (EN 1992-4 §7.2.1.5) ─────────────
// Sólo aplica a 'arandela_tuerca'. Ah = (OD² − φ²)·π/4 (área anular).
// Las demás tipologías (recta, patilla, gancho, soldada) transfieren por
// adherencia y el fallo está cubierto por el check 6.
export function checkPullout(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
  system: UnitSystem = 'si',
): CheckRow {
  if (!needsPullout(inp.bottom_anchorage)) {
    return {
      id: 'pullout',
      description: 'Arrancamiento (pull-out)',
      value: 'No aplica (anclaje por adherencia)',
      limit: 'Regido por check 6 (EC2 §8.4)',
      utilization: 0,
      status: 'neutral',
      article: 'CE Anejo 11 §7.2.1.5',
    };
  }

  // EN 1992-4 §7.2.1.5(1):  NRk,p = k2 · Ah · fck
  //   k2 = 7.5  (cracked concrete)
  //   k2 = 10.5 (uncracked concrete)
  // NRd,p = NRk,p / γMc, con γMc = γc · γinst = 1.5 (γinst=1.0 cast-in).
  const k2 = inp.concrete_cracked ? PULLOUT_K2_CRACKED : PULLOUT_K2_UNCRACKED;
  const Ah_mm2 = washerBearingArea(inp.bar_diam, inp.washer_od);
  const NRd_p_kN = (k2 * Ah_mm2 * inp.fck) / GAMMA_MC / 1000;

  let FtMax_kN = 0;
  for (const b of bars) if (b.inTension && b.Ft > FtMax_kN) FtMax_kN = b.Ft;

  const crackTag = inp.concrete_cracked ? 'fisurado' : 'no fisurado';
  const util = FtMax_kN / Math.max(NRd_p_kN, 1e-6);
  return {
    id: 'pullout',
    description: 'Arrancamiento (pull-out)',
    value: `Ft=${fmtF(FtMax_kN, system)}`,
    limit: `NRd,p=${fmtF(NRd_p_kN, system)} (k2=${k2}, ${crackTag}, Ah=${Ah_mm2.toFixed(0)} mm², OD=${inp.washer_od} mm)`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 11 §7.2.1.5',
  };
}

// ─── Check 9 — Splitting / side-face blowout (EN 1992-4 §7.2.1.6) ────────
//
// CR3 (PR6) — corregido respecto a la versión previa que tenía 3 bugs:
//   1. ψh usaba √(c_min/c_cr,sp), donde c_min es DISTANCIA AL BORDE.
//      EN 1992-4 §7.2.1.6 lo define como (h/(2·hef))^(2/3), donde h es
//      el CANTO DEL MACIZO. Variable equivocada.
//   2. El sentido invertido: ψh,sp DEBE AMPLIFICAR (≥1) para macizos
//      poco profundos; el código viejo la usaba como reducción.
//   3. Multiplicaba NRd,sp por tBars.length — espurio, EN 1992-4 no lo
//      incluye; el escalado por grupo ya está en Ac/Ac0.
//
// Modelo CE Anejo 11 §7.2.1.6 (≈ EN 1992-4 §7.2.1.6):
//   NRd,sp = N0Rd,c · (Ac,N/Ac,N0) · ψh,sp · ψec,sp · ψs,sp
// donde:
//   ψh,sp = max(1, min((h/(2·hef))^(2/3), (2·c_max/hef)^(2/3)))
//     - amplifica capacidad para macizos h > 2·hef
//     - bounded por la geometría 2·c_max/hef
//   ψec,sp = 1 / (1 + 2·e/s_cr,sp), e = excentricidad del grupo tensionado
//   ψs,sp = 0.7 + 0.3·c_min/c_cr,sp  (igual que ψs,N del cono)
//   c_cr,sp = 1.5·hef,  s_cr,sp = 3·hef
//
// El check es REDUNDANTE con el cono cuando c_min ≥ c_cr,sp Y h ≥ 2·hef
// (EN 1992-4 §7.2.1.6(2)(a)) → reporta neutral.
export function checkSplitting(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
  Ft_total_kN: number,
  system: UnitSystem = 'si',
): CheckRow {
  const tBars = bars.filter((b) => b.inTension && b.Ft > 0);
  if (tBars.length === 0 || Ft_total_kN < 1e-6) {
    return {
      id: 'splitting',
      description: 'Splitting / side-face blowout',
      value: 'Sin tracción en barras',
      limit: '—',
      utilization: 0,
      status: 'neutral',
      article: 'CE Anejo 11 §7.2.1.6',
    };
  }

  const hef = inp.bar_hef;
  const c_cr_sp = 1.5 * hef;
  const s_cr_sp = 3 * hef;
  const h_pedestal = inp.pedestal_h;
  // H15 (PR8a) — direccional sobre las 4 caras (resolveEdges para legacy compat).
  const edges = resolveEdges(inp);
  const c_min = Math.min(edges.cX1, edges.cX2, edges.cY1, edges.cY2);
  const c_max = Math.max(edges.cX1, edges.cX2, edges.cY1, edges.cY2);

  if (c_min >= c_cr_sp && h_pedestal >= 2 * hef) {
    return {
      id: 'splitting',
      description: 'Splitting / side-face blowout',
      value: `c_min=${c_min.toFixed(0)}≥${c_cr_sp.toFixed(0)} mm · h=${h_pedestal.toFixed(0)}≥${(2 * hef).toFixed(0)} mm`,
      limit: 'No crítico',
      utilization: 0,
      status: 'neutral',
      article: 'CE Anejo 11 §7.2.1.6',
    };
  }

  // ψh,sp por canto del macizo (NO por distancia al borde — fix CR3)
  const psi_h_raw = Math.pow(h_pedestal / (2 * hef), 2 / 3);
  const psi_h_bound = Math.pow((2 * c_max) / hef, 2 / 3);
  const psi_h_sp = Math.max(1.0, Math.min(psi_h_raw, psi_h_bound));

  // ψec,sp por excentricidad del grupo tensionado
  const sumFt = tBars.reduce((s, b) => s + b.Ft, 0);
  let eX = 0, eY = 0;
  if (sumFt > 0) {
    eX = tBars.reduce((s, b) => s + b.Ft * b.x, 0) / sumFt;
    eY = tBars.reduce((s, b) => s + b.Ft * b.y, 0) / sumFt;
  }
  const eN = Math.hypot(eX, eY);
  const psi_ec_sp = 1 / (1 + 2 * eN / s_cr_sp);

  // ψs,sp por edge (igual estructura que ψs,N del cono)
  const psi_s_sp = c_min >= c_cr_sp ? 1.0 : 0.7 + 0.3 * c_min / c_cr_sp;

  // N0Rd,c base (cracked concrete)
  const k1 = 7.7;
  const N0_Rd_c_kN = (k1 * Math.sqrt(inp.fck) * Math.pow(hef, 1.5)) / GAMMA_MC / 1000;

  // Ac,N / Ac,N0 — geometría del grupo (proyección de conos con extensiones).
  // Usa la misma lógica que checkConcreteCone para coherencia.
  const Ac_N0 = s_cr_sp * s_cr_sp;   // (3·hef)² = s_cr,N²
  let x_min = Infinity, x_max = -Infinity, y_min = Infinity, y_max = -Infinity;
  for (const b of tBars) {
    if (b.x < x_min) x_min = b.x;
    if (b.x > x_max) x_max = b.x;
    if (b.y < y_min) y_min = b.y;
    if (b.y > y_max) y_max = b.y;
  }
  // H15 (PR8a) — proyección direccional, lado a lado.
  const extXp_sp = Math.min(c_cr_sp, edges.cX1);
  const extXm_sp = Math.min(c_cr_sp, edges.cX2);
  const extYp_sp = Math.min(c_cr_sp, edges.cY1);
  const extYm_sp = Math.min(c_cr_sp, edges.cY2);
  const bxA = (x_max - x_min) + extXp_sp + extXm_sp;
  const byA = (y_max - y_min) + extYp_sp + extYm_sp;
  const Ac_N = bxA * byA;

  // ★ NO multiplicar por tBars.length — espurio, ya capturado en Ac/Ac0.
  const NRd_sp_kN = N0_Rd_c_kN * (Ac_N / Ac_N0) * psi_h_sp * psi_ec_sp * psi_s_sp;

  const util = Ft_total_kN / Math.max(NRd_sp_kN, 1e-6);
  return {
    id: 'splitting',
    description: 'Splitting / side-face blowout',
    value: `Ft=${fmtF(Ft_total_kN, system)}`,
    limit: `NRd,sp=${fmtF(NRd_sp_kN, system)} (ψh=${psi_h_sp.toFixed(2)} · ψec=${psi_ec_sp.toFixed(2)} · ψs=${psi_s_sp.toFixed(2)})`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 11 §7.2.1.6',
  };
}

// ─── Check 10 — Rigidizadores (esbeltez + soldadura) ─────────────────────
export function checkStiffener(
  inp: AnchorPlateInputs,
  Nc_kN: number,
  system: UnitSystem = 'si',
): CheckRow {
  if (inp.rib_count === 0) {
    return {
      id: 'stiffener',
      description: 'Rigidizadores (esbeltez + soldadura)',
      value: 'Sin rigidizadores',
      limit: '—',
      utilization: 0,
      status: 'neutral',
      article: 'CE Anejo 18 §4.5.3 + Anejo 22 §5.5',
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
    value: `c/t=${slend.toFixed(1)} · F_rib=${fmtF(F_rib_kN, system)}`,
    limit: `c/t≤${slend_lim.toFixed(1)} · Fw,Rd=${fmtF(Fw_Rd_rib_kN, system)} (${governs})`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 18 §4.5.3 + Anejo 22 §5.5',
  };
}

// ─── Check 11 — Concrete edge breakout en cortante (CR6, PR8b) ──────────
//
// EN 1992-4 §7.2.2.4 / CE Anejo 11 §7.2.2.4. Pre-PR8b este modo no se
// modelaba: checkBoltShear sólo cubría steel shear + fricción. Para placas
// cerca de un borde y cortante perpendicular, este modo gobierna.
//
// Modelo (cast-in barras corrugadas, cracked concrete):
//   V0Rk,c = k1 · (lf/dnom)^β · dnom^α · √fck · c1^1.5
//     con k1 = 1.6, α = 0.5, β = 0.2, lf = min(hef, 8·dnom) (limitada per EN)
//   VRk,c = V0Rk,c · (Ac,V/Ac,V0) · ψs,V · ψh,V · ψec,V · ψα,V · ψre,V
//   VRd,c = VRk,c / γMc
//
// Simplificaciones (notadas en comments para futura iteración):
//   - ψec,V = 1 (excentricidad del grupo en V — refinable)
//   - ψα,V = 1 (carga normal al borde — refinable cuando Vx/Vy direccional)
//   - ψre,V = 1 (sin armadura transversal de refuerzo en el borde)
//   - Ac,V proyección simplificada: bounding-box del grupo + extensión 1.5·c1
//     en dirección perpendicular a la carga, clipped por c_h en el lado lejano.
export function checkConcreteEdgeBreakout(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
  system: UnitSystem = 'si',
): CheckRow {
  const shear = resolveShear(inp);
  if (shear.Vmag < 1e-6) {
    return {
      id: 'concrete-edge-breakout',
      description: 'Rotura del hormigón en cortante (edge breakout)',
      value: 'Sin cortante',
      limit: '—',
      utilization: 0,
      status: 'neutral',
      article: 'CE Anejo 11 §7.2.2.4',
    };
  }

  const dnom = inp.bar_diam;
  const hef = inp.bar_hef;
  const fck = inp.fck;
  const { c1, c2, Vmag, Vangle_rad } = shear;

  // V0Rk,c — anchor único en hormigón sin restricciones, carga normal a un borde a c1
  const k1 = 1.6;
  const alpha_exp = 0.5;
  const beta_exp = 0.2;
  const lf = Math.min(hef, 8 * dnom);
  const V0Rk_N = k1
    * Math.pow(lf / dnom, beta_exp)
    * Math.pow(dnom, alpha_exp)
    * Math.sqrt(fck)
    * Math.pow(c1, 1.5);

  // Ac,V0 (reference area: anchor a c1, half-cone in plane)
  const Ac_V0 = 4.5 * c1 * c1;

  // Ac,V — proyección del cono del grupo. Extender bounding-box del grupo
  // por 1.5·c1 en dir perpendicular a la carga; profundidad de cono = 1.5·c1.
  const cos = Math.cos(Vangle_rad);
  const sin = Math.sin(Vangle_rad);
  let perp_min = Infinity, perp_max = -Infinity;
  for (const b of bars) {
    const perp = -b.x * sin + b.y * cos;
    if (perp < perp_min) perp_min = perp;
    if (perp > perp_max) perp_max = perp;
  }
  const groupPerpWidth = bars.length > 0 ? (perp_max - perp_min) : 0;
  // Width perpendicular: extendido por 1.5·c1 en ambos lados, clipped por
  // la dimensión efectiva del macizo (c2 + simétrico).
  const widthPerp = Math.min(groupPerpWidth + 3 * c1, 2 * c2 + groupPerpWidth);
  // Depth in line with load: 1.5·c1 (single anchor) o más si grupo profundo,
  // limited by available depth before crossing back edge.
  const depthInLoad = 1.5 * c1;
  const Ac_V = widthPerp * depthInLoad;

  // ψ factors
  const psi_s = c2 >= 1.5 * c1 ? 1.0 : 0.7 + 0.3 * c2 / (1.5 * c1);
  const h_ped = inp.pedestal_h;
  const psi_h = h_ped >= 1.5 * c1 ? 1.0 : Math.sqrt((1.5 * c1) / Math.max(h_ped, 1));
  // PR8b TODO: ψec,V por excentricidad del grupo de barras en cortante
  //           ψα,V por ángulo de carga ≠ normal al borde
  //           ψre,V por armadura transversal en el borde
  const psi_ec = 1.0;
  const psi_alpha = 1.0;
  const psi_re = 1.0;

  const VRk_N = V0Rk_N * (Ac_V / Ac_V0) * psi_s * psi_h * psi_ec * psi_alpha * psi_re;
  const VRd_kN = VRk_N / GAMMA_MC / 1000;

  const util = Vmag / Math.max(VRd_kN, 1e-6);
  return {
    id: 'concrete-edge-breakout',
    description: 'Rotura del hormigón en cortante (edge breakout)',
    value: `VEd=${fmtF(Vmag, system)}`,
    limit: `VRd,c=${fmtF(VRd_kN, system)} (c1=${c1.toFixed(0)} · ψs=${psi_s.toFixed(2)} · ψh=${psi_h.toFixed(2)})`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 11 §7.2.2.4',
  };
}

// ─── Check 12 — Concrete pry-out en cortante (CR6, PR8b) ────────────────
//
// EN 1992-4 §7.2.2.3 / CE Anejo 11 §7.2.2.3. Fallo por cortante que
// arranca un cono de hormigón hacia atrás (lejos del borde cargado).
// Aplica cuando los anclajes están lejos del borde (caso "interior") y
// el cortante puede levantar el hormigón en el extremo embebido.
//
//   VRd,cp = k · NRd,c
//   donde k = 1 si hef < 60 mm, k = 2 si hef ≥ 60 mm
//
// NRd,c es la capacidad de cono para el grupo completo de anclajes en
// la geometría dada (no sólo los traccionados).
export function checkConcretePryout(
  inp: AnchorPlateInputs,
  bars: AnchorBarPosition[],
  system: UnitSystem = 'si',
): CheckRow {
  const shear = resolveShear(inp);
  if (shear.Vmag < 1e-6) {
    return {
      id: 'concrete-pryout',
      description: 'Rotura por pry-out (efecto palanca)',
      value: 'Sin cortante',
      limit: '—',
      utilization: 0,
      status: 'neutral',
      article: 'CE Anejo 11 §7.2.2.3',
    };
  }

  const hef = inp.bar_hef;
  const k_pryout = hef >= 60 ? 2.0 : 1.0;

  // NRd,c sobre el grupo completo (todas las barras del layout, no sólo
  // las traccionadas), pues en pry-out el cortante distribuye entre todas.
  const k1 = 7.7;
  const N0_Rd_c_kN = (k1 * Math.sqrt(inp.fck) * Math.pow(hef, 1.5)) / GAMMA_MC / 1000;
  const Ac_N0 = (3 * hef) ** 2;
  const c_cr = 1.5 * hef;
  const edges = resolveEdges(inp);
  let x_min = Infinity, x_max = -Infinity, y_min = Infinity, y_max = -Infinity;
  for (const b of bars) {
    if (b.x < x_min) x_min = b.x;
    if (b.x > x_max) x_max = b.x;
    if (b.y < y_min) y_min = b.y;
    if (b.y > y_max) y_max = b.y;
  }
  const extXp = Math.min(c_cr, edges.cX1);
  const extXm = Math.min(c_cr, edges.cX2);
  const extYp = Math.min(c_cr, edges.cY1);
  const extYm = Math.min(c_cr, edges.cY2);
  const bxA = (x_max - x_min) + extXp + extXm;
  const byA = (y_max - y_min) + extYp + extYm;
  const Ac_N = bxA * byA;
  const c_min = Math.min(edges.cX1, edges.cX2, edges.cY1, edges.cY2);
  const psi_s = c_min >= c_cr ? 1.0 : 0.7 + 0.3 * c_min / c_cr;
  const NRd_c_kN = N0_Rd_c_kN * (Ac_N / Ac_N0) * psi_s;

  const VRd_cp_kN = k_pryout * NRd_c_kN;
  const util = shear.Vmag / Math.max(VRd_cp_kN, 1e-6);
  return {
    id: 'concrete-pryout',
    description: 'Rotura por pry-out (efecto palanca)',
    value: `VEd=${fmtF(shear.Vmag, system)}`,
    limit: `VRd,cp=${fmtF(VRd_cp_kN, system)} (k=${k_pryout.toFixed(1)} · NRd,c=${fmtF(NRd_c_kN, system)})`,
    utilization: util,
    status: toStatus(util),
    article: 'CE Anejo 11 §7.2.2.3',
  };
}

// ─── Check 13 — Concrete shear breakout (CR6, PR8b) ─────────────────────
//
// EN 1992-4 §7.2.2.5. Sólo aplica cuando hef < 60 mm (anclaje muy somero).
// Para barras corrugadas típicas (hef ≥ 150 mm), este modo NO gobierna y
// reporta neutral.
//
// Para hef pequeño: VRd,c semejante a edge breakout pero con factores
// específicos. Implementación completa diferida — la condición de
// aplicabilidad es la que mata el modo en la inmensa mayoría de casos.
export function checkConcreteBreakoutV(
  inp: AnchorPlateInputs,
  _bars: AnchorBarPosition[],
  system: UnitSystem = 'si',
): CheckRow {
  const hef = inp.bar_hef;
  if (hef >= 60) {
    return {
      id: 'concrete-breakout-v',
      description: 'Rotura por breakout en cortante (hef somero)',
      value: `hef=${hef.toFixed(0)} ≥ 60 mm`,
      limit: 'No aplica',
      utilization: 0,
      status: 'neutral',
      article: 'CE Anejo 11 §7.2.2.5',
    };
  }
  // hef < 60: aplicar el modo. Para PR8b, fall-back conservador usando
  // edge breakout como proxy (el modo somero es más restrictivo).
  const eb = checkConcreteEdgeBreakout(inp, _bars, system);
  return {
    ...eb,
    id: 'concrete-breakout-v',
    description: 'Rotura por breakout en cortante (hef somero)',
    article: 'CE Anejo 11 §7.2.2.5',
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

export function calcAnchorPlate(
  inp: AnchorPlateInputs,
  system: UnitSystem = 'si',
): AnchorPlateResult {
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
        residuals: { SN_kN: 0, SMx_kNm: 0, SMy_kNm: 0 },
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
    checkPlateCompression(inp, solver.Nc, twoFlanges, system),
    checkPlateBending(inp, fjd),
    checkBoltTension(inp, Ft_per_bar, system),
    checkBoltShear(inp, solver.bolts, inp.NEd_G, system),
    checkBoltInteraction(inp, solver.bolts, system),
    checkAnchorageLength(inp, solver.bolts),
    checkConcreteCone(inp, solver.bolts, solver.Ft_total, system),
    checkConcreteEdgeBreakout(inp, solver.bolts, system),    // PR8b CR6
    checkConcretePryout(inp, solver.bolts, system),          // PR8b CR6
    checkConcreteBreakoutV(inp, solver.bolts, system),       // PR8b CR6
    checkPullout(inp, solver.bolts, system),
    checkSplitting(inp, solver.bolts, solver.Ft_total, system),
    checkStiffener(inp, solver.Nc, system),
  ];

  const worstUtil = checks.length > 0 ? Math.max(...checks.map((c) => c.utilization)) : 0;
  const hasFailValidation = warnings.some((w) => w.severity === 'fail');
  const overallStatus: CheckStatus = hasFailValidation ? 'fail' : toStatus(worstUtil);

  return { inp, solver, checks, worstUtil, overallStatus, warnings, valid: true, pr1Limitations };
}
