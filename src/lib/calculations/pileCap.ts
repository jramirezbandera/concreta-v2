// Pile cap (encepado de micropilotes) — CE art. 48 / CTE DB-SE-C §5.1.4
// n = 2, 3, or 4 micropiles. Strut-and-tie method (bielas y tirantes).
// All units: mm, MPa, kN unless noted.
//
// CE art. 48   — strut-and-tie model, strut angle limits
// CE art. 48.3 — nodal zone capacity (C-C-T node, k=0.60)
// CE art. 69   — anchorage length
// CE art. 9.1  — minimum reinforcement
// CE art. 42.3 — maximum bar spacing
// CTE DB-SE-C §5.1.4 — geometric requirements (spacing, edge, depth)
//
// IMPORTANT: A_node = π·d_p²/4 (circular pile cross-section).
// Using d_p² (square) would be non-conservative — overestimates area → underestimates stress.

import { type PileCapInputs } from '../../data/defaults';
import { getConcrete } from '../../data/materials';
import { getBarArea } from '../../data/rebar';
import { GAMMA_S } from '../../data/factors';
import { type CheckRow, makeCheck } from './types';

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

  // Cap dimensions [mm]
  L_x: number;
  L_y: number;
  e_borde: number;  // actual edge distance (= e_min by construction)
  e_min: number;
  s_min: number;
  h_min: number;

  // Strut geometry
  z_eff: number;      // effective depth to tie centroid [mm]
  a_crit: number;     // horizontal distance to critical pile [mm]
  theta_deg: number;  // strut angle from horizontal [°]

  // Strut force and capacity
  Fs_max: number;        // [kN]
  A_node: number;        // circular pile cross-section area [mm²]
  sigma_strut: number;   // [MPa]
  sigma_Rd_max: number;  // [MPa]

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
  L_x: 0, L_y: 0, e_borde: 0, e_min: 0, s_min: 0, h_min: 0,
  z_eff: 0, a_crit: 0, theta_deg: 0,
  Fs_max: 0, A_node: 0, sigma_strut: 0, sigma_Rd_max: 0,
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

function getCapDimensions(
  n: number, s: number, d_p: number, b_col: number, h_col: number,
): { L_x: number; L_y: number; e_borde: number } {
  const e = Math.max(1.5 * d_p, 300);  // edge distance (= e_min)

  if (n === 2) {
    // Piles aligned in x; cap y based on column width
    const L_x = s + 2 * e;
    const L_y = Math.max(b_col, h_col, d_p) + 2 * e;
    return { L_x, L_y, e_borde: e };
  }
  if (n === 3) {
    const h_tri = s * Math.sqrt(3) / 2;
    const extent_x = s;
    const extent_y = h_tri;             // from bottom row to top pile = s√3/2
    return { L_x: extent_x + 2 * e, L_y: extent_y + 2 * e, e_borde: e };
  }
  // n === 4
  return { L_x: s + 2 * e, L_y: s + 2 * e, e_borde: e };
}

// ── As_min (CE art. 9.1) ───────────────────────────────────────────────────

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

  // For n=2 aligned in x: Σyi²=0 → Mx is statically inadmissible
  if (n === 2 && Math.abs(Mx_Ed) > 0) {
    return invalid('2 pilotes alineados en X no pueden resistir Mx_Ed ≠ 0. Usar n=4 o girar el encepado.');
  }

  // ── Material properties ──────────────────────────────────────────────────
  const mat  = getConcrete(fck);
  const fctm = mat.fctm;     // MPa
  const fcd  = mat.fcd;      // MPa
  const fyd  = fyk / GAMMA_S; // MPa

  // ── Pile positions ────────────────────────────────────────────────────────
  const pilePos = getPilePositions(n, s);

  // ── Navier reactions ──────────────────────────────────────────────────────
  const sumXi2 = pilePos.reduce((acc, p) => acc + p.x * p.x, 0);  // mm²
  const sumYi2 = pilePos.reduce((acc, p) => acc + p.y * p.y, 0);

  const reactions = pilePos.map((p) => {
    let R = N_Ed / n;
    if (sumYi2 > 0) R += (Mx_Ed * 1000 * p.y) / sumYi2;
    if (sumXi2 > 0) R += (My_Ed * 1000 * p.x) / sumXi2;
    return R;
  });

  const R_max = Math.max(...reactions);
  const R_min = Math.min(...reactions);

  // ── Cap dimensions ────────────────────────────────────────────────────────
  const { L_x, L_y, e_borde } = getCapDimensions(n, s, d_p, b_col, h_col);
  const e_min = e_borde;  // same formula, always equal

  // ── Geometric checks limits ───────────────────────────────────────────────
  const s_min = Math.max(3 * d_p, 750);
  const h_min = Math.max(400, 2 * d_p + cover + phi_tie);

  // ── Strut-and-tie geometry ────────────────────────────────────────────────
  const z_eff = h_enc - cover - phi_tie / 2;  // cover = bottom cover to tie centroid
  if (z_eff <= 0) return invalid('z_eff ≤ 0: canto o recubrimiento incompatible');

  // Horizontal distance from column centroid to CRITICAL pile (R_max)
  const critIdx = reactions.indexOf(R_max);
  const critPile = pilePos[critIdx];
  const a_crit = Math.sqrt(critPile.x * critPile.x + critPile.y * critPile.y);

  // For n=2: a_crit = s/2 (always, pile is exactly in x)
  // For n=3: all piles equidistant (s/√3), a_crit = s/√3
  // For n=4: diagonal distance = s/√2

  const theta_rad = Math.atan2(z_eff, a_crit);
  const theta_deg = theta_rad * (180 / Math.PI);

  // ── Strut force & capacity (CE art. 48.3) ────────────────────────────────
  const Fs_max = R_max / Math.sin(theta_rad);          // [kN]
  const A_node = Math.PI * d_p * d_p / 4;             // circular micropile cross-section [mm²]
  const sigma_strut = (Fs_max * 1000) / A_node;       // [MPa]
  const sigma_Rd_max = 0.60 * (1 - fck / 250) * fcd; // [MPa] — C-C-T node, k=0.60

  // ── Tie forces ────────────────────────────────────────────────────────────
  let Ft_x: number;
  let Ft_y: number | null = null;

  if (n === 2) {
    Ft_x = R_max * (s / 2) / z_eff;
  } else if (n === 3) {
    // Conservative: Ft = R_max * a_crit / z_eff (each pile → centroid)
    Ft_x = R_max * a_crit / z_eff;
  } else {
    // n === 4: piles at (±a, ±a), a = s/2
    const a = s / 2;
    // Tie-x (x-direction): max(sum reactions on x+ side, x- side)
    const R_x_plus  = reactions[1] + reactions[3]; // piles 2,4 (x=+a)
    const R_x_minus = reactions[0] + reactions[2]; // piles 1,3 (x=-a)
    Ft_x = Math.max(R_x_plus, R_x_minus) * a / z_eff;
    // Tie-y (y-direction): max(sum reactions on y+ side, y- side)
    const R_y_plus  = reactions[2] + reactions[3]; // piles 3,4 (y=+a)
    const R_y_minus = reactions[0] + reactions[1]; // piles 1,2 (y=-a)
    Ft_y = Math.max(R_y_plus, R_y_minus) * a / z_eff;
  }

  // ── Tie reinforcement ─────────────────────────────────────────────────────
  const A_phi = getBarArea(phi_tie);   // mm² per bar
  const s_max = Math.min(250, 15 * phi_tie);

  // Width b for As_min per direction
  const b_x = (n === 2 || n === 3) ? L_y : L_y;  // perp. to tie-x
  const b_y = L_x;                                 // perp. to tie-y (n=4 only)

  const As_tie_x = Ft_x * 1000 / fyd;
  const As_min_x = calcAsMin(fctm, fyk, b_x, z_eff);
  const As_adopted_x = Math.max(As_tie_x, As_min_x);
  const n_bars_x = Math.ceil(As_adopted_x / A_phi);
  const As_prov_x = n_bars_x * A_phi;

  // Bar spacing (x tie)
  const b_tie_x = (n === 2 || n === 3) ? L_y : L_y;
  const s_bar_x = n_bars_x > 1
    ? (b_tie_x - 2 * cover) / (n_bars_x - 1)
    : 999;  // single bar: flag as warn

  let As_tie_y: number | null = null;
  let As_min_y: number | null = null;
  let As_adopted_y: number | null = null;
  let n_bars_y: number | null = null;
  let As_prov_y: number | null = null;
  let s_bar_y: number | null = null;

  if (n === 4 && Ft_y !== null) {
    As_tie_y = Ft_y * 1000 / fyd;
    As_min_y = calcAsMin(fctm, fyk, b_y, z_eff);
    As_adopted_y = Math.max(As_tie_y, As_min_y);
    n_bars_y = Math.ceil(As_adopted_y / A_phi);
    As_prov_y = n_bars_y * A_phi;
    s_bar_y = n_bars_y > 1
      ? (b_y - 2 * cover) / (n_bars_y - 1)
      : 999;
  }

  // ── Anchorage (CE art. 69) ────────────────────────────────────────────────
  const fctd = fctm / 1.5;
  const fbd  = 2.25 * fctd;                              // good bond, straight bars
  const lb   = (phi_tie / 4) * (fyd / fbd);             // basic anchorage length [mm]
  const lb_net = Math.max(0.3 * lb, 10 * phi_tie, 100); // minimum net anchorage [mm]
  const c_top = Math.max(40, phi_tie);
  const lb_avail = h_enc - cover - c_top;               // available length [mm]

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

  // 2. Cap depth
  checks.push(makeCheck(
    'cap-depth',
    'Canto mínimo encepado h',
    h_min, h_enc,
    `${h_min.toFixed(0)} mm`,
    `${h_enc.toFixed(0)} mm`,
    'CTE DB-SE-C §5.1',
  ));

  // 3. Pile reaction vs R_adm
  checks.push(makeCheck(
    'pile-react-max',
    'Reacción máxima pilote R_max',
    R_max, R_adm,
    `${R_max.toFixed(1)} kN`,
    `${R_adm.toFixed(0)} kN`,
    '—',
  ));

  // 4. Tension pile (conditional warn — micropiles can resist tension)
  if (R_min < 0) {
    checks.push({
      id: 'pile-react-tension',
      description: 'Pilote a tracción — verificar R_trac con proveedor',
      value: `${R_min.toFixed(1)} kN`,
      limit: '0 kN',
      utilization: Math.abs(R_min) / R_adm,
      status: 'warn',
      article: '—',
    });
  }

  // 5. Strut angle
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
      value: `${theta_deg.toFixed(1)}°`,
      limit: '26.5° – 63.5°',
      utilization: theta_util,
      status: theta_status,
      article: 'CE art. 48 / EHE-08 art. 58',
    });
  }

  // 6. Strut capacity — CE art. 48.3
  checks.push(makeCheck(
    'strut-capacity',
    'Tensión nodal biela (nodo C-C-T)',
    sigma_strut, sigma_Rd_max,
    `${sigma_strut.toFixed(2)} MPa`,
    `${sigma_Rd_max.toFixed(2)} MPa`,
    'CE art. 48.3',
  ));

  // 7. Tie reinforcement x
  {
    const checkId = n === 3 ? 'tie-steel-3p' : 'tie-steel-x';
    const checkDesc = n === 3
      ? 'Armadura tirante (n=3, conserv.)'
      : 'Armadura tirante dirección x';
    checks.push(makeCheck(
      checkId,
      checkDesc,
      As_min_x, As_prov_x,
      `${As_min_x.toFixed(0)} mm²`,
      `${As_prov_x.toFixed(0)} mm²`,
      'CE art. 9.1',
    ));
  }

  // 8. Tie reinforcement y (n=4 only)
  if (n === 4 && As_min_y !== null && As_prov_y !== null) {
    checks.push(makeCheck(
      'tie-steel-y',
      'Armadura tirante dirección y',
      As_min_y, As_prov_y,
      `${As_min_y.toFixed(0)} mm²`,
      `${As_prov_y.toFixed(0)} mm²`,
      'CE art. 9.1',
    ));
  }

  // 9. Bar spacing
  {
    if (n_bars_x === 1) {
      checks.push({
        id: 'bar-spacing',
        description: 'Separación barras tirante — 1 barra insuficiente, usar mín. 2',
        value: '1 barra',
        limit: '≥ 2 barras',
        utilization: 0.99,
        status: 'warn',
        article: 'CE art. 42.3',
      });
    } else {
      checks.push(makeCheck(
        'bar-spacing',
        'Separación barras tirante s_bar',
        s_bar_x, s_max,
        `${s_bar_x.toFixed(0)} mm`,
        `${s_max.toFixed(0)} mm`,
        'CE art. 42.3',
      ));
    }
  }

  // 10. Anchorage
  checks.push(makeCheck(
    'anchorage',
    'Longitud de anclaje',
    lb_net, lb_avail,
    `${lb_net.toFixed(0)} mm`,
    `${lb_avail.toFixed(0)} mm`,
    'CE art. 69',
  ));

  return {
    valid: true,
    pilePos,
    reactions,
    R_max, R_min,
    L_x, L_y, e_borde, e_min, s_min, h_min,
    z_eff, a_crit, theta_deg,
    Fs_max, A_node, sigma_strut, sigma_Rd_max,
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
