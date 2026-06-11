// Pile cap (encepado de micropilotes) — CE art. 48 / EHE-08 art. 58.4.1 / CTE DB-SE-C §5.1.4
// n = 2, 3, or 4 micropiles. Strut-and-tie method (bielas y tirantes).
// All units: mm, MPa, kN unless noted.
//
// Modelo adoptado (fix auditoría adenda 2, #75-87): EHE-08 58.4.1.2 explícito —
//   - brazo mecánico z = 0.85·d (nodo de compresión dentro del pilar, no en la
//     fibra superior) y brazo horizontal desde el punto a 0.25·a del eje del
//     pilar (v + 0.25a), por dirección (#78)
//   - tirantes EN BANDA sobre los pilotes (ancho d_p + 2·cover), no repartidos
//     en todo el ancho del encepado (#80, #86)
//   - fyd de tirantes capado a 400 N/mm² (EHE 58.4.1.1, control de fisuración
//     del tirante) (#85)
//   - reacciones con peso propio del encepado (25 kN/m³, mayorado γG=1.35) (#77)
//   - anclaje con fctd = 0.7·fctm/γc y demanda = lbd de la patilla (α1=0.7),
//     desarrollable en rama horizontal + rama vertical (#75)
//   - armadura secundaria de encepado rígido (EHE 58.4.1.4): superior ≥ 10%
//     de la inferior y retícula h+v ≥ 4‰ (#79)
//
// CE art. 48 / EHE-08 art. 58 — strut-and-tie model, strut angle limits
// CE Anejo 19 §6.5.2 — strut crushing 0.60·ν'·fcd (lado seguro frente al nodo
//   C-C-T de §6.5.4, k2=0.85·ν'·fcd) — ver check 'strut-capacity'
// CE Anejo 19 §6.5.4 — nodo C-C-C bajo el pilar (k1=1.0·ν'·fcd)
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

  // Secondary reinforcement (EHE-08 58.4.1.4)
  As_top_req: number;    // top steel ≥ 10% of bottom [mm²]
  As_grid_v: number;     // vertical grid (cercos) [mm²/m]
  As_grid_h: number;     // horizontal grid [mm²/m]

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
  L_x: 0, L_y: 0, e_borde: 0, e_min: 0, s_min: 0, h_min: 0,
  W_cap: 0,
  d_eff: 0, z_eff: 0, a_crit: 0, a_eff: 0, theta_deg: 0,
  Fs_max: 0, A_node: 0, sigma_strut: 0, sigma_Rd_max: 0,
  sigma_col: 0, sigma_Rd_col: 0,
  As_top_req: 0, As_grid_v: 0, As_grid_h: 0,
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

function getCapDimensions(
  n: number, s: number, d_p: number, b_col: number, h_col: number,
): { L_x: number; L_y: number; e_borde: number } {
  // Edge distance: regla práctica española (EHE 58.8.2-tradición) eje de
  // pilote a borde ≥ d_p/2 + 250 mm — antes max(1.5·d_p, 300) quedaba corto
  // para d_p < 250, reduciendo confinamiento del nodo y anclaje horizontal
  // (fix auditoría #87).
  const e = Math.max(d_p / 2 + 250, 1.5 * d_p, 300);  // edge distance (= e_min)

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
  // fyd de tirantes capado a 400 N/mm² — EHE-08 58.4.1.1, control de
  // fisuración del tirante en cimentaciones B&T (fix auditoría #85).
  const fyd  = Math.min(fyk / GAMMA_S, 400); // MPa

  // ── Pile positions & cap dimensions ──────────────────────────────────────
  const pilePos = getPilePositions(n, s);
  const { L_x, L_y, e_borde } = getCapDimensions(n, s, d_p, b_col, h_col);
  const e_min = e_borde;  // same formula, always equal

  // ── Navier reactions ──────────────────────────────────────────────────────
  // Incluyen el peso propio del encepado (25 kN/m³, mayorado γG=1.35) —
  // omitirlo dejaba R_max un ~14% corto con defaults (fix auditoría #77).
  const W_cap = 25e-9 * L_x * L_y * h_enc;  // kN (característico)
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

  // ── Strut-and-tie geometry (EHE-08 58.4.1.2) ─────────────────────────────
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
  const A_node = Math.PI * d_p * d_p / 4;             // circular micropile cross-section [mm²]
  const sigma_strut = (Fs_max * 1000) / A_node;       // [MPa]
  const nu_prime = 1 - fck / 250;
  const sigma_Rd_max = 0.60 * nu_prime * fcd;         // [MPa] — biela §6.5.2 (lado seguro)

  // Nodo C-C-C bajo el pilar (CE Anejo 19 §6.5.4, k1 = 1.0·ν'·fcd) — antes
  // sin comprobar; alcanzable como pésimo con pilar pequeño muy cargado y
  // micropilotes grandes (fix auditoría #83).
  const sigma_col = (N_Ed * 1000) / (b_col * h_col);  // [MPa]
  const sigma_Rd_col = 1.0 * nu_prime * fcd;          // [MPa]

  // ── Tie forces — EN BANDA sobre pilotes (EHE-08 58.4.1.2) ────────────────
  // Cada banda se arma para su pilote más cargado: Td = R_max·brazo/z.
  let Ft_x: number;
  let Ft_y: number | null = null;

  if (n === 2) {
    // 58.4.1.2.1.1: Td = R·(v + 0.25a)/z, brazo = s/2 − 0.25·b_col
    Ft_x = R_max * Math.max(s / 2 - 0.25 * b_col, 50) / z_eff;
  } else if (n === 3) {
    // Tirantes EN LOS LADOS del triángulo (coherente con el SVG y con un
    // armado físicamente válido — fix auditoría #80; antes se despiezaba
    // todo en X y el tirante del pilote superior quedaba sin barras).
    // Descomposición exacta del radial en los dos lados concurrentes:
    // T_lado = T_radial/(2·cos30°) = T_radial/√3, con margen 1.18 alineado
    // con el 0.68 de la práctica EHE/Calavera (1.18/√3 = 0.681).
    Ft_x = 0.681 * R_max * a_eff / z_eff;   // per side (3 lados iguales)
  } else {
    // n === 4 (58.4.1.2.1.2): bandas sobre cada fila de pilotes, por
    // dirección; cada banda se arma para su pilote más cargado.
    Ft_x = R_max * Math.max(s / 2 - 0.25 * b_col, 50) / z_eff;  // per band ∥ x
    Ft_y = R_max * Math.max(s / 2 - 0.25 * h_col, 50) / z_eff;  // per band ∥ y
  }

  // ── Tie reinforcement — EN BANDA sobre los pilotes ────────────────────────
  // EHE 58.4.1.1: la armadura principal se concentra en bandas cuyo ancho es
  // el diámetro del pilote más dos veces la distancia de su cara superior al
  // c.d.g. de la armadura (≈ cover con pilote enrasado): w_band = d_p + 2·cover
  // (fix auditoría #86 — antes se repartía en todo el ancho del encepado).
  const A_phi = getBarArea(phi_tie);   // mm² per bar
  const s_max = Math.min(250, 15 * phi_tie);
  const s_bar_min = Math.max(20, phi_tie);  // CE art. 69.4 (árido fino supuesto)
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

  // ── Anchorage (CE art. 69 / Anejo 19 §8.4) — fix auditoría #75 ───────────
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

  // ── Armadura secundaria (EHE-08 58.4.1.4) — fix auditoría #79 ────────────
  // a) superior ≥ 10% de la capacidad de la inferior; b) retícula horizontal
  // y vertical con cuantía ≥ 4‰ del área de la sección perpendicular, con
  // ancho de referencia ≤ h/2.
  const As_top_req = 0.1 * As_prov_x;
  const As_grid_v = 4 * Math.min(L_y, h_enc / 2);  // mm²/m (0.004·w_ref·1000mm/m)
  const As_grid_h = 4 * Math.min(h_enc, L_y / 2);  // mm²/m

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

  // 4. Tension pile (conditional warn — micropiles can resist tension).
  //    Sin ratio numérico: R_adm es capacidad a COMPRESIÓN y usarla como
  //    denominador de una tracción era engañoso (fix auditoría #84).
  if (R_min < 0) {
    checks.push({
      id: 'pile-react-tension',
      description: 'Pilote a tracción — verificar R_t,Rd con proveedor',
      value: `${R_min.toFixed(1)} kN`,
      limit: 'R_t,Rd (no introducida)',
      utilization: 0,
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
      'EHE-08 art. 58.4.1.2 / CE art. 9.1',
    ));
  }

  // 8. Tie reinforcement y (n=4 only)
  if (n === 4 && As_tie_y !== null && As_prov_y !== null) {
    checks.push(makeCheck(
      'tie-steel-y',
      'Armadura tirante dirección y (banda)',
      As_tie_y, As_prov_y,
      `${As_tie_y.toFixed(0)} mm²`,
      `${As_prov_y.toFixed(0)} mm²`,
      'EHE-08 art. 58.4.1.2 / CE art. 9.1',
    ));
  }

  // 9. Bar spacing — máxima y MÍNIMA (congestión, fix auditoría #82), peor
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
        article: 'CE art. 42.3',
      });
    } else {
      checks.push(makeCheck(
        'bar-spacing',
        'Separación barras tirante s_bar (banda)',
        s_bar_worst, s_max,
        `${s_bar_worst.toFixed(0)} mm`,
        `${s_max.toFixed(0)} mm`,
        'CE art. 42.3',
      ));
      checks.push(makeCheck(
        'bar-spacing-min',
        'Separación mínima entre barras (congestión)',
        s_bar_min, s_bar_worst,
        `${s_bar_min.toFixed(0)} mm`,
        `${s_bar_worst.toFixed(0)} mm`,
        'CE art. 69.4',
      ));
    }
  }

  // 10. Anchorage — demanda lbd (patilla α1=0.7) vs horizontal + rama vertical
  checks.push(makeCheck(
    'anchorage',
    'Longitud de anclaje tirante (lbd patilla)',
    lb_net, lb_avail,
    `${lb_net.toFixed(0)} mm`,
    `${lb_avail.toFixed(0)} mm`,
    'CE art. 69 / Anejo 19 §8.4',
  ));

  // 11. Column node C-C-C (CE Anejo 19 §6.5.4, k1 = 1.0) — fix auditoría #83
  checks.push(makeCheck(
    'node-column',
    'Tensión nodal bajo pilar (nodo C-C-C)',
    sigma_col, sigma_Rd_col,
    `${sigma_col.toFixed(2)} MPa`,
    `${sigma_Rd_col.toFixed(2)} MPa`,
    'CE Anejo 19 §6.5.4',
  ));

  // 12. Armadura secundaria requerida (informativa) — fix auditoría #79
  checks.push({
    id: 'secondary-rebar',
    description: `Armadura secundaria: superior ≥ ${As_top_req.toFixed(0)} mm² (10% inf.); retícula h+v ≥ 4‰ (V ${As_grid_v.toFixed(0)} mm²/m, H ${As_grid_h.toFixed(0)} mm²/m)`,
    value: '',
    limit: '',
    utilization: 0,
    status: 'neutral',
    article: 'EHE-08 art. 58.4.1.4',
    neutral: true,
    tag: 'REQUERIDA',
  });

  return {
    valid: true,
    pilePos,
    reactions,
    R_max, R_min,
    L_x, L_y, e_borde, e_min, s_min, h_min,
    W_cap,
    d_eff, z_eff, a_crit, a_eff, theta_deg,
    Fs_max, A_node, sigma_strut, sigma_Rd_max,
    sigma_col, sigma_Rd_col,
    As_top_req, As_grid_v, As_grid_h,
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
