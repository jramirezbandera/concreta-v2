// Pile cap (encepado de micropilotes) — Código Estructural (CE) / CTE DB-SE-C §5.1.4
// n = 2, 3, or 4 micropiles. Strut-and-tie method (bielas y tirantes).
// All units: mm, MPa, kN unless noted.
//
// NORMA DE APLICACIÓN: Código Estructural (RD 470/2021) + Anejo 19 (EC2).
// La EHE-08 está DEROGADA: se cita solo como origen de la geometría de modelo
// consolidada en la práctica española, nunca como exigencia.
//
// Modelo adoptado (fix auditoría adenda 2, #75-87) — B&T conforme a CE Anejo
// 19 §6.5, con la geometría de la práctica consolidada (ex-EHE 58.4.1.2):
//   - brazo mecánico z = 0.85·d (el nodo de compresión está dentro del pilar,
//     no en la fibra superior) y brazo horizontal desde el punto a 0.25·a del
//     eje del pilar (v + 0.25a), por dirección (#78)
//   - tirantes EN BANDA sobre los pilotes (ancho d_p + 2·cover), no repartidos
//     en todo el ancho del encepado (#80, #86)
//   - fyd de tirantes = fyk/γs SIN tope de 400 N/mm² — el tope era de
//     EHE 58.4.1.1 y el CE Anejo 19 §6.5.3 no lo recoge (#85)
//   - reacciones con peso propio del encepado (25 kN/m³, mayorado γG=1.35) (#77)
//   - n=3 (encepado rígido de tres pilotes, Calavera fig. 14-9 / ex-EHE
//     58.4.1.2.2): planta TRIANGULAR — triángulo de lado s ampliado la
//     distancia a borde e por cada lado y esquinas achaflanadas a e del eje
//     de cada pilote (hexágono), no un rectángulo Lx × Ly. Cotas de obra: s,
//     e y h. Tirantes en banda sobre los tres lados: el radial del pilote más
//     cargado Hd = R·a_eff/z se reparte en los dos lados concurrentes,
//     T = Hd/(2·cos30°) = 0,68·R/d·(0,58·s − 0,25·a). Rigidez: s ≤ 2,6·h.
//   - anclaje con fctd = 0.7·fctm/γc y demanda = lbd de la patilla (α1=0.7),
//     desarrollable en rama horizontal + rama vertical (CE Anejo 19 §8.4.4) (#75)
//   - armadura secundaria (ex-EHE 58.4.1.4): superior ≥ 10 % de la inferior,
//     cercos verticales y armadura horizontal de las caras con cuantía ≥ 4‰
//     del área perpendicular (ancho de referencia ≤ h/2), más los criterios
//     mecánicos de la práctica (cercos ≥ N_Ed/(1,5·n), horizontal ≥ T/4). La
//     dispone el usuario (Ø, separación, ramas) y se comprueba requerido vs
//     dispuesto. Bajo CE es recomendación (Anejo 19 §9.8.1 no la exige con
//     carácter general, #79), pero se comprueba como el resto de la práctica
//     consolidada del módulo.
//
// CE Anejo 19 §6.5 — strut-and-tie model, strut angle limits
// CE Anejo 19 §6.5.2 — strut crushing 0.60·ν'·fcd (lado seguro frente al nodo
//   C-C-T de §6.5.4, k2=0.85·ν'·fcd) — ver check 'strut-capacity'
// CE Anejo 19 §6.5.4 — nodo C-C-C bajo el pilar (k1=1.0·ν'·fcd)
// CE Anejo 19 §8.4.4   — anchorage length
// CE Anejo 19 §9.2.1.1  — minimum reinforcement
// CE Anejo 19 §8.2 — maximum bar spacing
// CTE DB-SE-C §5.1.4 — geometric requirements (spacing, edge, depth)
//
// IMPORTANT — área del nodo comprimido (A_node):
//   - Sin placa de reparto: π·d_p²/4 (sección circular del micro). Usar d_p²
//     sería inseguro: infla el área → subestima la tensión.
//   - Con placa de reparto en cabeza (práctica habitual): la biela apoya en la
//     placa → A_node = π·d_plate²/4 (circular) o d_plate² (cuadrada). El
//     dimensionado de la propia placa (espesor, cartelas, soldadura) NO se
//     comprueba aquí — se avisa con una fila informativa.

import { type PileCapInputs } from '../../data/defaults';
import { getConcrete } from '../../data/materials';
import { getBarArea } from '../../data/rebar';
import { GAMMA_S } from '../../data/factors';
import { type CheckRow, makeCheck, makeCheckQty } from './types';
import { dec } from '../units/format';

export type { CheckRow } from './types';

export interface PilePos {
  x: number;  // mm from group centroid
  y: number;
}

export interface PileCapResult {
  valid: boolean;
  error?: string;

  // Pile positions [mm] from group centroid
  pilePos: PilePos[];

  // Navier reactions [kN]
  reactions: number[];
  R_max: number;
  R_min: number;

  // Cap dimensions [mm] — para n=3 son la ENVOLVENTE del hexágono
  L_x: number;
  L_y: number;
  /** Contorno en planta (mm desde el centroide del grupo), antihorario:
   *  rectángulo para n=2/4, hexágono (triángulo achaflanado) para n=3. */
  outline: PilePos[];
  A_cap: number;    // área en planta real [mm²] (la del contorno)
  e_borde: number;  // actual MIN axis-to-edge distance (≥ e_min en modo auto)
  e_min: number;
  s_min: number;
  h_min: number;

  // Self-weight [kN] — characteristic, included in reactions with γG=1.35
  W_cap: number;

  // Strut geometry
  d_eff: number;      // effective depth to tie centroid [mm]
  z_eff: number;      // mechanical lever arm = 0.85·d_eff [mm]
  a_crit: number;     // horizontal distance pile↔column AXIS [mm]
  a_eff: number;      // horizontal arm pile↔column quarter point [mm]
  theta_deg: number;  // strut angle from horizontal [°]

  // Strut force and capacity
  Fs_max: number;        // [kN]
  A_node: number;        // circular pile cross-section area [mm²]
  sigma_strut: number;   // [MPa]
  sigma_Rd_max: number;  // [MPa]

  // Column node (C-C-C, CE Anejo 19 §6.5.4)
  sigma_col: number;     // [MPa]
  sigma_Rd_col: number;  // [MPa]

  // Armadura secundaria (ex-EHE 58.4.1.4) — requerida vs dispuesta
  As_top_req: number;    // superior ≥ 10 % de la inferior dispuesta [mm² por banda]
  As_top_prov: number;   // n_top·A(φ_top) [mm²]
  b_ref: number;         // ancho de referencia del 4‰: min(ancho, h/2) [mm]
  As_cv_min: number;     // cercos verticales, 4‰ [mm²/m de longitud]
  As_cv_mech: number;    // cercos verticales, N_Ed/(1,5·n) repartido en L [mm²/m]
  As_cv_req: number;     // el mayor de los dos [mm²/m]
  As_cv_prov: number;    // ramas·A(φ_cv)·1000/s_cv [mm²/m]
  As_ch_min: number;     // horizontal de caras, 4‰ [mm²/m de altura]
  As_ch_mech: number;    // horizontal de caras, T/4 repartido en h [mm²/m]
  As_ch_req: number;
  As_ch_prov: number;    // 2·A(φ_ch)·1000/s_ch (dos caras) [mm²/m]

  // Tie band width over piles [mm]
  w_band: number;

  // Tie forces [kN]
  Ft_x: number;
  Ft_y: number | null;   // null for n=2,3

  // Material
  fyd: number;  // [MPa]

  // Tie reinforcement
  As_tie_x: number;
  As_tie_y: number | null;
  As_min_x: number;
  As_min_y: number | null;
  As_adopted_x: number;
  As_adopted_y: number | null;
  n_bars_x: number;
  n_bars_y: number | null;
  As_prov_x: number;
  As_prov_y: number | null;
  s_bar_x: number;
  s_bar_y: number | null;
  s_max: number;

  // Anchorage [mm]
  lb: number;
  lb_net: number;
  lb_avail: number;

  checks: CheckRow[];
}

const EMPTY: PileCapResult = {
  valid: false,
  pilePos: [], reactions: [], R_max: 0, R_min: 0,
  L_x: 0, L_y: 0, outline: [], A_cap: 0, e_borde: 0, e_min: 0, s_min: 0, h_min: 0,
  W_cap: 0,
  d_eff: 0, z_eff: 0, a_crit: 0, a_eff: 0, theta_deg: 0,
  Fs_max: 0, A_node: 0, sigma_strut: 0, sigma_Rd_max: 0,
  sigma_col: 0, sigma_Rd_col: 0,
  As_top_req: 0, As_top_prov: 0, b_ref: 0,
  As_cv_min: 0, As_cv_mech: 0, As_cv_req: 0, As_cv_prov: 0,
  As_ch_min: 0, As_ch_mech: 0, As_ch_req: 0, As_ch_prov: 0,
  w_band: 0,
  Ft_x: 0, Ft_y: null,
  fyd: 0,
  As_tie_x: 0, As_tie_y: null,
  As_min_x: 0, As_min_y: null,
  As_adopted_x: 0, As_adopted_y: null,
  n_bars_x: 0, n_bars_y: null,
  As_prov_x: 0, As_prov_y: null,
  s_bar_x: 0, s_bar_y: null,
  s_max: 0,
  lb: 0, lb_net: 0, lb_avail: 0,
  checks: [],
};

function invalid(msg: string): PileCapResult {
  return { ...EMPTY, error: msg };
}

// ── Pile positions (group centroid at origin) ──────────────────────────────

function getPilePositions(n: number, s: number): PilePos[] {
  if (n === 2) {
    return [{ x: -s / 2, y: 0 }, { x: s / 2, y: 0 }];
  }
  if (n === 3) {
    // Equilateral triangle, pile A at top (+y)
    const h = s * Math.sqrt(3) / 2;         // triangle height
    return [
      { x: 0,     y:  2 * h / 3 },          // A (top)
      { x: -s / 2, y: -h / 3 },             // B (bottom-left)
      { x:  s / 2, y: -h / 3 },             // C (bottom-right)
    ];
  }
  // n === 4: square
  const a = s / 2;
  return [
    { x: -a, y: -a },
    { x:  a, y: -a },
    { x: -a, y:  a },
    { x:  a, y:  a },
  ];
}

// ── Cap dimensions ─────────────────────────────────────────────────────────

// Edge distance mínima: regla de buena práctica española (tradición ex-EHE
// 58.8.2) eje de pilote a borde ≥ d_p/2 + 250 mm — antes max(1.5·d_p, 300)
// quedaba corto para d_p < 250, reduciendo confinamiento del nodo y anclaje
// horizontal (fix auditoría #87).
export function minEdgeDistance(d_p: number): number {
  return Math.max(d_p / 2 + 250, 1.5 * d_p, 300);
}

/** Bounding box de los EJES de pilotes [mm]. El encepado se centra en esta caja. */
function pileExtents(n: number, s: number): { ext_x: number; ext_y: number } {
  if (n === 2) return { ext_x: s, ext_y: 0 };
  if (n === 3) return { ext_x: s, ext_y: s * Math.sqrt(3) / 2 };
  return { ext_x: s, ext_y: s };  // n === 4
}

/** Redondeo hacia ARRIBA a múltiplo de 50 mm (cota ejecutable en obra). */
const roundUp50 = (v: number) => Math.ceil(v / 50) * 50;

const SQRT3 = Math.sqrt(3);

/** Rectángulo L_x × L_y centrado en el origen, antihorario. */
function rectOutline(L_x: number, L_y: number): PilePos[] {
  const a = L_x / 2;
  const b = L_y / 2;
  return [{ x: -a, y: -b }, { x: a, y: -b }, { x: a, y: b }, { x: -a, y: b }];
}

/**
 * Contorno del encepado de 3 pilotes (Calavera fig. 14-9, práctica ex-EHE):
 * el triángulo equilátero de los ejes, ampliado e hacia fuera por cada lado,
 * con cada esquina achaflanada por una recta perpendicular al radio del
 * pilote a distancia e de su eje. Cada pilote queda a e de sus tres bordes.
 * Hexágono antihorario: chaflán superior (A), inferior izquierdo (B) e
 * inferior derecho (C). Medio chaflán = e·tan30° = e/√3; la envolvente mide
 * s + 2·e·(2/√3) de ancho (vértices a la altura de los pilotes inferiores) y
 * s·√3/2 + 2·e de alto.
 */
export function triCapOutline(s: number, e: number): PilePos[] {
  const t = e / SQRT3;
  const pts: PilePos[] = [];
  for (const p of getPilePositions(3, s)) {
    const r = Math.hypot(p.x, p.y);
    const ux = p.x / r;
    const uy = p.y / r;          // radial unitario centroide → pilote
    const vx = -uy;
    const vy = ux;               // giro +90°
    pts.push({ x: p.x + e * ux - t * vx, y: p.y + e * uy - t * vy });
    pts.push({ x: p.x + e * ux + t * vx, y: p.y + e * uy + t * vy });
  }
  return pts;
}

/** Área de un polígono simple (shoelace), positiva si es antihorario. */
export function polygonArea(pts: PilePos[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Polígono convexo antihorario desplazado hacia dentro una distancia c
 *  (recubrimiento): cada arista se traslada según su normal interior y los
 *  vértices son las intersecciones de aristas consecutivas. */
export function insetPolygon(pts: PilePos[], c: number): PilePos[] {
  const n = pts.length;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return { px: p.x - (dy / len) * c, py: p.y + (dx / len) * c, dx, dy };
  });
  return lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n];
    const det = l0.dx * l1.dy - l0.dy * l1.dx;
    if (Math.abs(det) < 1e-9) return { x: l1.px, y: l1.py };
    const t = ((l1.px - l0.px) * l1.dy - (l1.py - l0.py) * l1.dx) / det;
    return { x: l0.px + l0.dx * t, y: l0.py + l0.dy * t };
  });
}

function polygonBBox(pts: PilePos[]): { L_x: number; L_y: number } {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    L_x: Math.max(...xs) - Math.min(...xs),
    L_y: Math.max(...ys) - Math.min(...ys),
  };
}

/** ¿Cabe el rectángulo b × h centrado en el origen dentro del polígono convexo
 *  antihorario? (las 4 esquinas a la izquierda de cada arista, con tolerancia). */
function rectFitsConvex(pts: PilePos[], b: number, h: number): boolean {
  const corners = [
    { x: -b / 2, y: -h / 2 }, { x: b / 2, y: -h / 2 },
    { x: b / 2, y: h / 2 }, { x: -b / 2, y: h / 2 },
  ];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    for (const c of corners) {
      const cross = (q.x - p.x) * (c.y - p.y) - (q.y - p.y) * (c.x - p.x);
      if (cross < -1e-6) return false;
    }
  }
  return true;
}

/**
 * Distancia a borde e que necesita el pilar b_col × h_col para caber en la
 * planta triangular de separación s: la mayor proyección de una esquina del
 * pilar sobre las normales de los tres lados (distancia centroide–lado
 * s/(2√3) + e) y sobre los tres radios de los chaflanes (s/√3 + e).
 */
function edgeNeededByColumn3(s: number, b_col: number, h_col: number): number {
  const corners = [
    { x: -b_col / 2, y: -h_col / 2 }, { x: b_col / 2, y: -h_col / 2 },
    { x: b_col / 2, y: h_col / 2 }, { x: -b_col / 2, y: h_col / 2 },
  ];
  const sideN = [{ x: 0, y: -1 }, { x: -SQRT3 / 2, y: 0.5 }, { x: SQRT3 / 2, y: 0.5 }];
  const chamferU = [{ x: 0, y: 1 }, { x: -SQRT3 / 2, y: -0.5 }, { x: SQRT3 / 2, y: -0.5 }];
  let need = 0;
  for (const c of corners) {
    for (const nrm of sideN) need = Math.max(need, c.x * nrm.x + c.y * nrm.y - s / (2 * SQRT3));
    for (const u of chamferU) need = Math.max(need, c.x * u.x + c.y * u.y - s / SQRT3);
  }
  return need;
}

/**
 * Distancia eje de pilote a borde AUTOMÁTICA del encepado de 3 pilotes: la
 * mínima de buena práctica (o la que exija el pilar para caber), redondeada
 * hacia arriba a 5 cm. Es la cota «C» de los planos de encepados de tres
 * micropilotes (Ø180 → e_min = 340 → 350 mm).
 */
export function autoEdge3(d_p: number, s: number, b_col: number, h_col: number): number {
  return roundUp50(Math.max(minEdgeDistance(d_p), edgeNeededByColumn3(s, b_col, h_col)));
}

/**
 * Dimensiones en planta AUTOMÁTICAS: extensión del grupo + 2·e_min por
 * dirección, redondeadas hacia arriba a 5 cm. Para n=2 la dirección y no tiene
 * pilotes: manda el mayor de pilar y pilote. Para n=3 la planta es triangular
 * y lo que se fija es e (autoEdge3); Lx × Ly devuelven su ENVOLVENTE, sin
 * redondear (las cotas de obra son s y e). Exportada para que el panel de
 * entradas muestre el valor auto y lo siembre al pasar a modo manual.
 */
export function autoCapDims(
  n: number, s: number, d_p: number, b_col: number, h_col: number,
): { L_x: number; L_y: number } {
  if (n === 3) {
    return polygonBBox(triCapOutline(s, autoEdge3(d_p, s, b_col, h_col)));
  }
  const e = minEdgeDistance(d_p);
  const { ext_x, ext_y } = pileExtents(n, s);
  const L_x = roundUp50(ext_x + 2 * e);
  const L_y = n === 2
    ? roundUp50(Math.max(b_col, h_col, d_p) + 2 * e)
    : roundUp50(ext_y + 2 * e);
  return { L_x, L_y };
}

// ── As_min (CE Anejo 19 §9.2.1.1) ───────────────────────────────────────────────────

function calcAsMin(fctm: number, fyk: number, b: number, d: number): number {
  return Math.max(
    0.26 * (fctm / fyk) * b * d,
    0.0013 * b * d,
  );
}

// ── Main calculation ───────────────────────────────────────────────────────

export function calcPileCap(inp: PileCapInputs): PileCapResult {
  const n       = inp.n as number;
  const d_p     = inp.d_p as number;
  const s       = inp.s as number;
  const h_enc   = inp.h_enc as number;
  // dims_auto puede faltar en estados guardados anteriores a este campo → auto.
  const dims_auto = (inp.dims_auto as boolean | undefined) ?? true;
  // Placa de reparto en cabeza de micro (puede faltar en estados antiguos →
  // sin placa). Forma defensiva: cualquier valor ≠ 'cuad' se trata como 'circ'.
  const plate_on = (inp.plate_on as boolean | undefined) ?? false;
  const plate_shape: 'circ' | 'cuad' = inp.plate_shape === 'cuad' ? 'cuad' : 'circ';
  const d_plate = (inp.d_plate as number | undefined) ?? 0;
  const b_col   = inp.b_col as number;
  const h_col   = inp.h_col as number;
  const fck     = inp.fck as number;
  const fyk     = inp.fyk as number;
  const cover   = inp.cover as number;
  const phi_tie = inp.phi_tie as number;
  const N_Ed    = inp.N_Ed as number;
  const Mx_Ed   = inp.Mx_Ed as number;
  const My_Ed   = inp.My_Ed as number;
  const R_adm   = inp.R_adm as number;
  // Armadura secundaria dispuesta (pueden faltar en estados guardados antes
  // de este campo → valores por defecto del módulo).
  const phi_top = (inp.phi_top as number | undefined) ?? 12;
  const n_top   = (inp.n_top as number | undefined) ?? 2;
  const phi_cv  = (inp.phi_cv as number | undefined) ?? 12;
  const s_cv    = (inp.s_cv as number | undefined) ?? 100;
  const n_cv    = (inp.n_cv as number | undefined) ?? 2;
  const phi_ch  = (inp.phi_ch as number | undefined) ?? 12;
  const s_ch    = (inp.s_ch as number | undefined) ?? 100;

  // ── Input validation ──────────────────────────────────────────────────────
  if (n !== 2 && n !== 3 && n !== 4) return invalid('n debe ser 2, 3 ó 4 micropilotes');
  if (d_p <= 0)  return invalid('Diámetro de pilote debe ser > 0');
  if (s <= 0)    return invalid('Separación entre pilotes debe ser > 0');
  if (h_enc <= 0) return invalid('Canto del encepado debe ser > 0');
  if (N_Ed <= 0)  return invalid('Axil N_Ed debe ser > 0 (compresión)');
  if (R_adm <= 0) return invalid('R_adm debe ser > 0');
  if (fck < 20 || fck > 50) return invalid('fck fuera de rango (20–50 MPa)');
  if (cover <= 0) return invalid('Recubrimiento debe ser > 0');
  if (phi_tie <= 0) return invalid('Diámetro tirante debe ser > 0');
  if (!(s_cv > 0) || !(s_ch > 0)) {
    return invalid('Separación de cercos y de armadura horizontal debe ser > 0');
  }
  if (!(n_cv >= 1) || !(n_top >= 0)) return invalid('Ramas de cerco ≥ 1 y barras superiores ≥ 0');
  if (plate_on) {
    if (!(d_plate > 0)) return invalid('Dimensión de la placa de reparto debe ser > 0');
    if (d_plate < d_p) {
      return invalid('La placa de reparto debe cubrir la cabeza del micro: Ø/lado ≥ d_p');
    }
    if (d_plate > s) {
      return invalid('Las placas de pilotes contiguos se solapan: Ø/lado de placa ≤ s');
    }
  }

  // For n=2 aligned in x: Σyi²=0 → Mx is statically inadmissible
  if (n === 2 && Math.abs(Mx_Ed) > 0) {
    return invalid('2 pilotes alineados en X no pueden resistir Mx_Ed ≠ 0. Usar n=4 o girar el encepado.');
  }

  // ── Material properties ──────────────────────────────────────────────────
  const mat  = getConcrete(fck);
  const fctm = mat.fctm;     // MPa
  const fcd  = mat.fcd;      // MPa
  // fyd de tirantes = fyk/γs (CE Anejo 19 §6.5.3). El tope de 400 N/mm² era
  // de la EHE-08 58.4.1.1 (derogada) y el CE no lo recoge (#85).
  const fyd  = fyk / GAMMA_S; // MPa

  // ── Pile positions & cap dimensions ──────────────────────────────────────
  const pilePos = getPilePositions(n, s);
  const e_min = minEdgeDistance(d_p);
  const { ext_x, ext_y } = pileExtents(n, s);

  // Dimensiones en planta: automáticas (e_min a borde, redondeo a 5 cm) o
  // definidas por el usuario. En manual NO se impone e_min: se comprueba como
  // check ('edge-distance') para que el usuario decida cotas de obra exactas.
  //
  // n=3: planta TRIANGULAR (triángulo achaflanado, ver triCapOutline). La cota
  // es e, la distancia de eje de pilote a borde; Lx × Ly es solo su envolvente.
  // n=2/4: rectángulo Lx × Ly centrado en la caja de ejes de pilotes.
  let L_x: number;
  let L_y: number;
  let e_borde: number;
  let outline: PilePos[];
  if (n === 3) {
    const e = dims_auto ? autoEdge3(d_p, s, b_col, h_col) : (inp.e_man as number);
    if (!(e > 0)) return invalid('La distancia de eje de pilote a borde e debe ser > 0');
    if (e < d_p / 2) {
      return invalid('Los pilotes no caben en planta: aumenta e (eje a borde < d_p/2)');
    }
    if (plate_on && e < d_plate / 2) {
      return invalid('La placa de reparto no cabe en planta: aumenta e o reduce la placa');
    }
    outline = triCapOutline(s, e);
    ({ L_x, L_y } = polygonBBox(outline));
    e_borde = e;
    if (!rectFitsConvex(outline, b_col, h_col)) {
      return invalid('El pilar no cabe en la planta triangular: aumenta e o la separación s');
    }
  } else {
    if (dims_auto) {
      ({ L_x, L_y } = autoCapDims(n, s, d_p, b_col, h_col));
    } else {
      L_x = inp.L_x as number;
      L_y = inp.L_y as number;
      if (!(L_x > 0) || !(L_y > 0)) return invalid('Dimensiones en planta Lx y Ly deben ser > 0');
      if (b_col > L_x || h_col > L_y) {
        return invalid('El pilar no cabe en planta: se requiere Lx ≥ b_col y Ly ≥ h_col');
      }
    }

    // Distancia REAL de eje de pilote a borde por dirección (encepado centrado
    // en la caja de ejes de pilotes; para n=2, e_y = L_y/2).
    const e_x = (L_x - ext_x) / 2;
    const e_y = (L_y - ext_y) / 2;
    e_borde = Math.min(e_x, e_y);
    if (e_x < d_p / 2 || e_y < d_p / 2) {
      return invalid('Los pilotes no caben en planta: aumenta Lx/Ly (eje a borde < d_p/2)');
    }
    if (plate_on && (e_x < d_plate / 2 || e_y < d_plate / 2)) {
      return invalid('La placa de reparto no cabe en planta: aumenta Lx/Ly o reduce la placa');
    }
    outline = rectOutline(L_x, L_y);
  }
  const A_cap = polygonArea(outline);  // mm² — la del contorno real, no la envolvente

  // ── Navier reactions ──────────────────────────────────────────────────────
  // Incluyen el peso propio del encepado (25 kN/m³, mayorado γG=1.35) —
  // omitirlo dejaba R_max un ~14% corto con defaults (fix auditoría #77).
  // Con el área real: para n=3 la envolvente Lx·Ly sobrestimaba el hexágono.
  const W_cap = 25e-9 * A_cap * h_enc;  // kN (característico)
  const sumXi2 = pilePos.reduce((acc, p) => acc + p.x * p.x, 0);  // mm²
  const sumYi2 = pilePos.reduce((acc, p) => acc + p.y * p.y, 0);

  const reactions = pilePos.map((p) => {
    let R = (N_Ed + 1.35 * W_cap) / n;
    if (sumYi2 > 0) R += (Mx_Ed * 1000 * p.y) / sumYi2;
    if (sumXi2 > 0) R += (My_Ed * 1000 * p.x) / sumXi2;
    return R;
  });

  const R_max = Math.max(...reactions);
  const R_min = Math.min(...reactions);

  // ── Geometric checks limits ───────────────────────────────────────────────
  const s_min = Math.max(3 * d_p, 750);
  const h_min = Math.max(400, 2 * d_p + cover + phi_tie);

  // ── Strut-and-tie geometry (CE Anejo 19 §6.5; geometría ex-EHE 58.4.1.2) ──
  // Brazo mecánico z = 0.85·d (el nodo de compresión está dentro del pilar,
  // no en la fibra superior) y brazo horizontal desde el punto a 0.25·a del
  // eje del pilar — fix auditoría #78 (antes z = d completo y brazo al
  // centroide del pilar, error de signo variable −8%/+2%).
  const d_eff = h_enc - cover - phi_tie / 2;  // cover = bottom cover to tie centroid
  if (d_eff <= 0) return invalid('d_eff ≤ 0: canto o recubrimiento incompatible');
  const z_eff = 0.85 * d_eff;

  // Horizontal distance from column AXIS to CRITICAL pile (R_max)
  const critIdx = reactions.indexOf(R_max);
  const critPile = pilePos[critIdx];
  const a_crit = Math.sqrt(critPile.x * critPile.x + critPile.y * critPile.y);

  // For n=2: a_crit = s/2 · For n=3: s/√3 (all equidistant) · For n=4: s/√2
  // a_eff: descontando 0.25·a_col en la dirección radial de la biela. Para
  // n=3/4 (dirección radial oblicua) se usa min(b_col, h_col): descontar de
  // menos agranda a_eff → θ más tendida y Fs mayor (lado seguro). El clamp
  // evita degenerar con pilares enormes respecto a s.
  const col_radial = n === 2 ? b_col : Math.min(b_col, h_col);
  const a_eff = Math.max(a_crit - 0.25 * col_radial, 50);

  const theta_rad = Math.atan2(z_eff, a_eff);
  const theta_deg = theta_rad * (180 / Math.PI);

  // ── Strut force & capacity ────────────────────────────────────────────────
  // σRd,max = 0.60·ν'·fcd es la BIELA fisurada de CE Anejo 19 §6.5.2 — lado
  // seguro frente al nodo C-C-T de §6.5.4 (k2 = 0.85·ν'·fcd). La etiqueta
  // anterior («C-C-T node, k=0.60») citaba mal la norma (fix auditoría #83).
  const Fs_max = R_max / Math.sin(theta_rad);          // [kN]
  // Área del nodo comprimido: con placa de reparto en cabeza la biela apoya en
  // la placa (Ø o lado d_plate); sin placa, en la sección circular del micro.
  const A_node = plate_on
    ? (plate_shape === 'cuad' ? d_plate * d_plate : Math.PI * d_plate * d_plate / 4)
    : Math.PI * d_p * d_p / 4;                        // [mm²]
  const sigma_strut = (Fs_max * 1000) / A_node;       // [MPa]
  const nu_prime = 1 - fck / 250;
  const sigma_Rd_max = 0.60 * nu_prime * fcd;         // [MPa] — biela §6.5.2 (lado seguro)

  // Nodo C-C-C bajo el pilar (CE Anejo 19 §6.5.4, k1 = 1.0·ν'·fcd) — antes
  // sin comprobar; alcanzable como pésimo con pilar pequeño muy cargado y
  // micropilotes grandes (fix auditoría #83).
  const sigma_col = (N_Ed * 1000) / (b_col * h_col);  // [MPa]
  const sigma_Rd_col = 1.0 * nu_prime * fcd;          // [MPa]

  // ── Tie forces — EN BANDA sobre pilotes (CE Anejo 19 §6.5.3; ex-EHE 58.4.1.2)
  // Cada banda se arma para su pilote más cargado: Td = R_max·brazo/z.
  let Ft_x: number;
  let Ft_y: number | null = null;

  if (n === 2) {
    // 58.4.1.2.1.1: Td = R·(v + 0.25a)/z, brazo = s/2 − 0.25·b_col
    Ft_x = R_max * Math.max(s / 2 - 0.25 * b_col, 50) / z_eff;
  } else if (n === 3) {
    // Tirantes EN LOS LADOS del triángulo (Calavera fig. 14-9, ex-EHE
    // 58.4.1.2.2; fix auditoría #80: antes se despiezaba todo en X y el
    // tirante del pilote superior quedaba sin barras). El radial del pilote
    // más cargado, Hd = R·a_eff/z, se descompone en los dos lados
    // concurrentes: T = Hd/(2·cos30°) = Hd/√3. Con z = 0,85·d y
    // a_eff = 0,58·s − 0,25·a queda T = 0,68·R/d·(0,58·s − 0,25·a), la
    // expresión de la práctica. (Hasta ahora se aplicaba 0,681·Hd: ese 0,68
    // ya lleva dentro el 1/0,85 del brazo, y al dividir además por z salía
    // un 18 % por encima de la referencia.)
    Ft_x = R_max * a_eff / z_eff / SQRT3;   // per side (3 lados iguales)
  } else {
    // n === 4 (58.4.1.2.1.2): bandas sobre cada fila de pilotes, por
    // dirección; cada banda se arma para su pilote más cargado.
    Ft_x = R_max * Math.max(s / 2 - 0.25 * b_col, 50) / z_eff;  // per band ∥ x
    Ft_y = R_max * Math.max(s / 2 - 0.25 * h_col, 50) / z_eff;  // per band ∥ y
  }

  // ── Tie reinforcement — EN BANDA sobre los pilotes ────────────────────────
  // Práctica consolidada (ex-EHE 58.4.1.1): la armadura principal va en bandas de ancho
  // el diámetro del pilote más dos veces la distancia de su cara superior al
  // c.d.g. de la armadura (≈ cover con pilote enrasado): w_band = d_p + 2·cover
  // (fix auditoría #86 — antes se repartía en todo el ancho del encepado).
  const A_phi = getBarArea(phi_tie);   // mm² per bar
  const s_max = Math.min(250, 15 * phi_tie);
  const s_bar_min = Math.max(20, phi_tie);  // CE Anejo 19 §8.2 (árido fino supuesto)
  const w_band = Math.min(d_p + 2 * cover, Math.min(L_x, L_y) - 2 * cover);

  // Width b for As_min per direction (sección completa — mínimo geométrico)
  const b_x = L_y;   // perp. to tie-x
  const b_y = L_x;   // perp. to tie-y (n=4 only)

  const As_tie_x = Ft_x * 1000 / fyd;
  const As_min_x = calcAsMin(fctm, fyk, b_x, d_eff);
  const As_adopted_x = Math.max(As_tie_x, As_min_x);
  const n_bars_x = Math.ceil(As_adopted_x / A_phi);
  const As_prov_x = n_bars_x * A_phi;
  const s_bar_x = n_bars_x > 1 ? w_band / (n_bars_x - 1) : 999;  // single bar: flag as warn

  let As_tie_y: number | null = null;
  let As_min_y: number | null = null;
  let As_adopted_y: number | null = null;
  let n_bars_y: number | null = null;
  let As_prov_y: number | null = null;
  let s_bar_y: number | null = null;

  if (n === 4 && Ft_y !== null) {
    As_tie_y = Ft_y * 1000 / fyd;
    As_min_y = calcAsMin(fctm, fyk, b_y, d_eff);
    As_adopted_y = Math.max(As_tie_y, As_min_y);
    n_bars_y = Math.ceil(As_adopted_y / A_phi);
    As_prov_y = n_bars_y * A_phi;
    s_bar_y = n_bars_y > 1 ? w_band / (n_bars_y - 1) : 999;
  }

  // ── Anchorage (CE Anejo 19 §8.4.4) — fix auditoría #75 ───────────
  // fctd con el 0.7 de fctk,0.05 (antes fctm/1.5: fbd inflado ×1.43) y
  // demanda = lbd de la barra DOBLADA (patilla vertical, α1=0.7, supone
  // c_d ≥ 3φ — cumplido con cover ≥ 3φ habitual), reducida por
  // As_adoptada/As_prov, no el mínimo absoluto 0.3·lb que hacía el check
  // estructuralmente incapaz de fallar. Longitud disponible = rama
  // horizontal (e_borde − cover, desde el eje del pilote al inicio del
  // doblado) + rama vertical (h − cover − c_top).
  const fctd = (0.7 * fctm) / 1.5;
  const fbd  = 2.25 * fctd;                              // good bond
  const lb   = (phi_tie / 4) * (fyd / fbd);             // basic anchorage length [mm]
  const alpha1 = 0.7;                                    // barra doblada (patilla)
  const As_ratio = Math.min(As_adopted_x / As_prov_x, 1);
  const lb_net = Math.max(alpha1 * lb * As_ratio, 0.3 * lb, 10 * phi_tie, 100); // lbd requerida [mm]
  const c_top = Math.max(40, phi_tie);
  const lb_avail = (e_borde - cover) + (h_enc - cover - c_top); // horizontal + vertical [mm]

  // ── Armadura secundaria (ex-EHE 58.4.1.4) — dispuesta por el usuario ──────
  // a) superior ≥ 10 % de la capacidad de la inferior (por banda);
  // b) cercos verticales y armadura horizontal de las caras con cuantía ≥ 4‰
  //    del área de la sección perpendicular a su dirección; si el ancho supera
  //    la mitad del canto, se toma b_ref = h/2. Por metro: 0,004·b_ref·1000.
  // c) criterios mecánicos de la práctica (hoja del estudio): capacidad total
  //    de los cercos ≥ N_Ed/(1,5·n) repartida en la longitud L_x, y de la
  //    armadura horizontal ≥ T/4 repartida en el canto. Gobierna el mayor.
  // (Antes la retícula horizontal usaba min(h, L_y/2), que no es la sección
  // perpendicular a las barras: es la misma b_ref que la vertical.)
  const As_top_req  = 0.1 * Math.max(As_prov_x, As_prov_y ?? 0);
  const As_top_prov = n_top * getBarArea(phi_top);
  const b_ref = Math.min(L_x, L_y, h_enc / 2);
  const As_cv_min  = 0.004 * b_ref * 1000;                                // mm²/m
  const As_cv_mech = (N_Ed / (1.5 * n)) * 1000 / fyd / (L_x / 1000);    // mm²/m
  const As_cv_req  = Math.max(As_cv_min, As_cv_mech);
  const As_cv_prov = n_cv * getBarArea(phi_cv) * 1000 / s_cv;            // mm²/m
  const As_ch_min  = 0.004 * b_ref * 1000;                                // mm²/m de altura
  const As_ch_mech = (Ft_x / 4) * 1000 / fyd / (h_enc / 1000);           // mm²/m
  const As_ch_req  = Math.max(As_ch_min, As_ch_mech);
  const As_ch_prov = 2 * getBarArea(phi_ch) * 1000 / s_ch;               // dos caras

  // ── Build checks ──────────────────────────────────────────────────────────
  const checks: CheckRow[] = [];

  // 1. Pile spacing
  checks.push(makeCheck(
    'spacing',
    'Separación entre pilotes s',
    s_min, s,
    `${s_min.toFixed(0)} mm`,
    `${s.toFixed(0)} mm`,
    'CTE DB-SE-C §5.1.4',
  ));

  // 2. Edge distance — mínimo de buena práctica (ex-EHE 58.8.2). Binario
  //    ok/fail: en modo auto e_borde queda por construcción a ≤5 cm de e_min y
  //    el warn de 95% saltaría siempre sin margen real que señalar.
  checks.push({
    id: 'edge-distance',
    description: 'Distancia eje pilote a borde e',
    value: `${e_min.toFixed(0)} mm`,
    limit: `${e_borde.toFixed(0)} mm`,
    utilization: e_borde > 0 ? e_min / e_borde : Infinity,
    status: e_borde + 1e-9 >= e_min ? 'ok' : 'fail',
    article: 'Práctica ex-EHE 58.8.2',
  });

  // 3. Cap depth
  checks.push(makeCheck(
    'cap-depth',
    'Canto mínimo encepado h',
    h_min, h_enc,
    `${h_min.toFixed(0)} mm`,
    `${h_enc.toFixed(0)} mm`,
    'CTE DB-SE-C §5.1',
  ));

  // 3b. Rigidez del encepado — condición de aplicabilidad del modelo de
  //     bielas y tirantes. n=3: l ≤ 2,6·h (Calavera fig. 14-9). n=2/4: vuelo
  //     de la cara del pilar al eje del pilote v ≤ 2·h (ex-EHE 58.2.1).
  if (n === 3) {
    checks.push(makeCheck(
      'rigidity',
      'Encepado rígido: separación s ≤ 2,6·h',
      s, 2.6 * h_enc,
      `${s.toFixed(0)} mm`,
      `${(2.6 * h_enc).toFixed(0)} mm`,
      'Calavera fig. 14-9 (encepado rígido de 3 pilotes)',
    ));
  } else {
    const v_max = n === 2
      ? s / 2 - b_col / 2
      : Math.max(s / 2 - b_col / 2, s / 2 - h_col / 2);
    checks.push(makeCheck(
      'rigidity',
      'Encepado rígido: vuelo cara pilar–eje pilote v ≤ 2·h',
      v_max, 2 * h_enc,
      `${v_max.toFixed(0)} mm`,
      `${(2 * h_enc).toFixed(0)} mm`,
      'Práctica ex-EHE 58.2.1',
    ));
  }

  // 4. Pile reaction vs R_adm
  checks.push(makeCheckQty(
    'pile-react-max',
    'Reacción máxima pilote R_max',
    R_max, R_adm, 'force',
    '—',
  ));

  // 5. Tension pile (conditional warn — micropiles can resist tension).
  //    Sin ratio numérico: R_adm es capacidad a COMPRESIÓN y usarla como
  //    denominador de una tracción era engañoso (fix auditoría #84).
  if (R_min < 0) {
    checks.push({
      id: 'pile-react-tension',
      description: 'Pilote a tracción — verificar R_t,Rd con proveedor',
      valueNum: R_min, valueQty: 'force',
      limitStr: 'R_t,Rd (no introducida)',
      utilization: 0,
      status: 'warn',
      article: '—',
    });
  }

  // 6. Strut angle
  {
    const theta_min_deg = 26.5;
    const theta_max_deg = 63.5;
    let theta_util: number;
    let theta_status: CheckRow['status'];
    if (theta_deg < theta_min_deg) {
      theta_util = theta_min_deg / theta_deg;
      theta_status = 'fail';
    } else if (theta_deg > theta_max_deg) {
      theta_util = theta_deg / theta_max_deg;
      theta_status = 'warn';
    } else {
      theta_util = theta_min_deg / theta_deg;
      theta_status = 'ok';
    }
    checks.push({
      id: 'strut-angle',
      description: 'Ángulo biela θ (aumentar h_enc si INCUMPLE)',
      value: `${dec(theta_deg, 1)}°`,
      limit: '26,5° – 63,5°',
      utilization: theta_util,
      status: theta_status,
      article: 'CE Anejo 19 §6.5',
    });
  }

  // 7. Strut capacity — CE Anejo 19 §6.5
  checks.push(makeCheckQty(
    'strut-capacity',
    plate_on
      ? `Tensión nodal biela (nodo C-C-T, placa ${plate_shape === 'cuad' ? '□' : 'Ø'}${d_plate.toFixed(0)})`
      : 'Tensión nodal biela (nodo C-C-T, micro Ø' + d_p.toFixed(0) + ')',
    sigma_strut, sigma_Rd_max, 'stress',
    'CE Anejo 19 §6.5',
  ));

  // 7b. Placa de reparto — informativa: agranda el apoyo del nodo, pero su
  //     propio dimensionado (espesor, cartelas, soldadura al tubo) es un
  //     cálculo de estructura metálica que este módulo no realiza.
  if (plate_on) {
    checks.push({
      id: 'plate-info',
      description: `Placa de reparto ${plate_shape === 'cuad' ? 'cuadrada, lado' : 'circular, Ø'} ${d_plate.toFixed(0)} mm (A_nodo = ${A_node.toFixed(0)} mm²) — dimensionar espesor, cartelas y soldadura aparte`,
      value: '',
      limit: '',
      utilization: 0,
      status: 'neutral',
      article: '—',
      neutral: true,
      tag: 'PLACA',
    });
  }

  // 8. Tie reinforcement x
  {
    // Utilización = demanda del tirante vs acero dispuesto (fix auditoría #82:
    // antes comparaba As_min vs As_prov, siempre verde por construcción y sin
    // que As_tie apareciera en ningún check). As_min sigue garantizado porque
    // n_bars sale de max(As_tie, As_min).
    const checkId = n === 3 ? 'tie-steel-3p' : 'tie-steel-x';
    const checkDesc = n === 3
      ? 'Armadura tirante por lado (n=3)'
      : 'Armadura tirante dirección x (banda)';
    checks.push(makeCheck(
      checkId,
      checkDesc,
      As_tie_x, As_prov_x,
      `${As_tie_x.toFixed(0)} mm²`,
      `${As_prov_x.toFixed(0)} mm²`,
      'CE Anejo 19 §6.5.3 / art. 9.1',
    ));
  }

  // 9. Tie reinforcement y (n=4 only)
  if (n === 4 && As_tie_y !== null && As_prov_y !== null) {
    checks.push(makeCheck(
      'tie-steel-y',
      'Armadura tirante dirección y (banda)',
      As_tie_y, As_prov_y,
      `${As_tie_y.toFixed(0)} mm²`,
      `${As_prov_y.toFixed(0)} mm²`,
      'CE Anejo 19 §6.5.3 / art. 9.1',
    ));
  }

  // 10. Bar spacing — máxima y MÍNIMA (congestión, fix auditoría #82), peor
  //    dirección cuando n=4.
  {
    const s_bar_worst = s_bar_y !== null ? Math.min(s_bar_x, s_bar_y) : s_bar_x;
    if (n_bars_x === 1) {
      checks.push({
        id: 'bar-spacing',
        description: 'Separación barras tirante — 1 barra insuficiente, usar mín. 2',
        value: '1 barra',
        limit: '≥ 2 barras',
        utilization: 0.99,
        status: 'warn',
        article: 'CE Anejo 19 §8.2',
      });
    } else {
      checks.push(makeCheck(
        'bar-spacing',
        'Separación barras tirante s_bar (banda)',
        s_bar_worst, s_max,
        `${s_bar_worst.toFixed(0)} mm`,
        `${s_max.toFixed(0)} mm`,
        'CE Anejo 19 §8.2',
      ));
      checks.push(makeCheck(
        'bar-spacing-min',
        'Separación mínima entre barras (congestión)',
        s_bar_min, s_bar_worst,
        `${s_bar_min.toFixed(0)} mm`,
        `${s_bar_worst.toFixed(0)} mm`,
        'CE Anejo 19 §8.2',
      ));
    }
  }

  // 11. Anchorage — demanda lbd (patilla α1=0.7) vs horizontal + rama vertical
  checks.push(makeCheck(
    'anchorage',
    'Longitud de anclaje tirante (lbd patilla)',
    lb_net, lb_avail,
    `${lb_net.toFixed(0)} mm`,
    `${lb_avail.toFixed(0)} mm`,
    'CE Anejo 19 §8.4.4',
  ));

  // 12. Column node C-C-C (CE Anejo 19 §6.5.4, k1 = 1.0) — fix auditoría #83
  checks.push(makeCheckQty(
    'node-column',
    'Tensión nodal bajo pilar (nodo C-C-C)',
    sigma_col, sigma_Rd_col, 'stress',
    'CE Anejo 19 §6.5.4',
  ));

  // 13. Armadura secundaria dispuesta vs requerida (ex-EHE 58.4.1.4). Bajo CE
  //     es recomendación (Anejo 19 §9.8.1 no la exige con carácter general).
  checks.push(makeCheck(
    'top-steel',
    `Armadura superior ${n_top}Ø${phi_top} por banda (≥ 10 % de la inferior)`,
    As_top_req, As_top_prov,
    `${As_top_req.toFixed(0)} mm²`,
    `${As_top_prov.toFixed(0)} mm²`,
    'Práctica ex-EHE 58.4.1.4',
  ));
  checks.push(makeCheck(
    'stirrups-v',
    `Cercos verticales Ø${phi_cv} c/${s_cv} (${n_cv} ramas) — ${As_cv_mech > As_cv_min ? 'N_Ed/(1,5·n)' : `0,4 % · b_ref ${b_ref.toFixed(0)}`}`,
    As_cv_req, As_cv_prov,
    `${As_cv_req.toFixed(0)} mm²/m`,
    `${As_cv_prov.toFixed(0)} mm²/m`,
    'Práctica ex-EHE 58.4.1.4',
  ));
  checks.push(makeCheck(
    'face-steel-h',
    `Armadura horizontal de caras Ø${phi_ch} c/${s_ch} (2 caras) — ${As_ch_mech > As_ch_min ? 'T/4' : `0,4 % · b_ref ${b_ref.toFixed(0)}`}`,
    As_ch_req, As_ch_prov,
    `${As_ch_req.toFixed(0)} mm²/m`,
    `${As_ch_prov.toFixed(0)} mm²/m`,
    'Práctica ex-EHE 58.4.1.4',
  ));

  return {
    valid: true,
    pilePos,
    reactions,
    R_max, R_min,
    L_x, L_y, outline, A_cap, e_borde, e_min, s_min, h_min,
    W_cap,
    d_eff, z_eff, a_crit, a_eff, theta_deg,
    Fs_max, A_node, sigma_strut, sigma_Rd_max,
    sigma_col, sigma_Rd_col,
    As_top_req, As_top_prov, b_ref,
    As_cv_min, As_cv_mech, As_cv_req, As_cv_prov,
    As_ch_min, As_ch_mech, As_ch_req, As_ch_prov,
    w_band,
    Ft_x, Ft_y,
    fyd,
    As_tie_x, As_tie_y,
    As_min_x, As_min_y,
    As_adopted_x, As_adopted_y,
    n_bars_x, n_bars_y,
    As_prov_x, As_prov_y,
    s_bar_x, s_bar_y,
    s_max,
    lb, lb_net, lb_avail,
    checks,
  };
}
