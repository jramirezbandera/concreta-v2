// RC Column calculations — Codigo Estructural (CE) Spain
// Rectangular section under combined axial compression + biaxial bending.
// All units: mm, MPa, kN, kNm unless noted.
//
// CE art. 39     — Concrete material properties
// CE art. 42     — Bending resistance (ELU Flexocompresion)
// CE art. 42.3   — Reinforcement limits for columns
// CE art. 43     — Second-order effects (slenderness)
// CE art. 43.5.3 — Nominal curvature method
// CE art. 69.4   — Bar spacing
// CE art. 69.4.3 — Transverse reinforcement for columns
// CE Anejo 19 art. 5.8.9 — Biaxial bending simplified criterion

import { type RCColumnInputs } from '../../data/defaults';
import { getConcrete, getFyd, Es } from '../../data/materials';
import { getBarArea } from '../../data/rebar';
import { type CheckRow, toStatus, makeCheck } from './types';

export type { CheckStatus, CheckRow } from './types';

export interface RCColumnResult {
  valid: boolean;
  error?: string;
  // Geometry
  d_y: number;      // effective depth for y-axis bending (mm)
  d_z: number;      // effective depth for z-axis bending (mm)
  d_prime: number;  // compression bar centroid depth (same for both axes) (mm)
  As_total: number; // total steel area (mm²)
  // Slenderness
  lambda_y: number;
  lambda_z: number;
  Lk: number;       // effective buckling length (m)
  // Eccentricities — y-axis
  e1_y: number; e_imp_y: number; e2_y: number; e_tot_y: number;
  MEd_tot_y: number; // kNm
  // Eccentricities — z-axis
  e1_z: number; e_imp_z: number; e2_z: number; e_tot_z: number;
  MEd_tot_z: number; // kNm
  // N-M interaction
  NRd_max: number;   // kN
  x_star_y: number;  // neutral axis depth for y-axis (mm)
  x_star_z: number;  // neutral axis depth for z-axis (mm)
  MRdy: number;      // kNm
  MRdz: number;      // kNm
  ned: number;       // NEd / NRd_max
  a: number;         // biaxial exponent
  biaxialUtil: number; // (MEdy/MRdy)^a + (MEdz/MRdz)^a
  // Rebar info
  rebarSchedule: string;
  lapLength: number;
  // Checks
  checks: CheckRow[];
}

const ecu3 = 0.0035;

interface BarGroup { y: number; area: number; }

/**
 * Concrete + steel N-M capacity at neutral axis depth x.
 * @param x     neutral axis depth from compression face (mm)
 * @param width section dimension perpendicular to bending (mm)
 * @param depth section dimension in bending direction (mm)
 * @param bars  array of {y: distance from compression face (mm), area: mm²}
 */
function calcNM(
  x: number,
  width: number,
  depth: number,
  bars: BarGroup[],
  fcd: number,
  fyd: number,
): { NRd: number; MRd: number } {
  const xn = Math.min(x, depth);    // cap at full depth — full section in compression
  const Nc = fcd * 0.8 * xn * width;
  const yc = 0.4 * xn;              // depth of Nc resultant from compression face

  let NRd = Nc;
  let MRd = Nc * (depth / 2 - yc);  // moment about section centroid

  for (const bar of bars) {
    const eps = ecu3 * (x - bar.y) / x;                            // positive = compression
    const sig = Math.max(-fyd, Math.min(fyd, Es * eps));
    NRd += bar.area * sig;
    MRd += bar.area * sig * (depth / 2 - bar.y);
  }

  return { NRd, MRd };
}

/**
 * Binary search for x_star and resulting MRd for one bending axis.
 * Returns MRd in N·mm.
 */
function computeAxis(
  NEd_N: number,
  depth: number,
  width: number,
  bars: BarGroup[],
  fcd: number,
  fyd: number,
  NRd_max: number,
  NRd_Whitney: number,
): { MRd_Nmm: number; x_star: number; ndMaxFailed: boolean } {
  if (NEd_N >= NRd_max) {
    return { MRd_Nmm: 0, x_star: depth, ndMaxFailed: true };
  }
  if (NEd_N >= NRd_Whitney) {
    // Gap zone: binary search cannot converge — use x = depth (full compression state)
    const { MRd } = calcNM(depth, width, depth, bars, fcd, fyd);
    return { MRd_Nmm: MRd, x_star: depth, ndMaxFailed: false };
  }
  // Normal range: binary search in [1, 2*depth]
  let xLo = 1;
  let xHi = 2 * depth;
  for (let i = 0; i < 60; i++) {
    const xMid = (xLo + xHi) / 2;
    if (calcNM(xMid, width, depth, bars, fcd, fyd).NRd < NEd_N) {
      xLo = xMid;
    } else {
      xHi = xMid;
    }
  }
  const x_star = (xLo + xHi) / 2;
  const { MRd } = calcNM(x_star, width, depth, bars, fcd, fyd);
  return { MRd_Nmm: MRd, x_star, ndMaxFailed: false };
}

/** Interpolate biaxial exponent a from NEd/NRd_max (CE Anejo 19 art. 5.8.9(4)). */
function interpExponent(ned: number): number {
  if (ned <= 0.1) return 1.0;
  if (ned <= 0.7) return 1.0 + (ned - 0.1) / 0.6 * 0.5;  // 1.0 → 1.5
  if (ned <= 1.0) return 1.5 + (ned - 0.7) / 0.3 * 0.5;  // 1.5 → 2.0
  return 2.0; // clamped — ned can exceed 1.0 in gap zone (NRd_Whitney > NRd_max)
}

export function calcRCColumn(inp: RCColumnInputs): RCColumnResult {
  const {
    b, h, cover,
    cornerBarDiam, nBarsX, barDiamX, nBarsY, barDiamY,
    stirrupDiam, stirrupSpacing,
    fck, fyk,
    Nd, MEdy, MEdz,
    L, beta,
  } = inp;

  const Lk = L * beta;
  const Lk_mm = Lk * 1000;

  const invalid = (error: string): RCColumnResult => ({
    valid: false, error,
    d_y: 0, d_z: 0, d_prime: 0, As_total: 0,
    lambda_y: 0, lambda_z: 0, Lk: 0,
    e1_y: 0, e_imp_y: 0, e2_y: 0, e_tot_y: 0, MEd_tot_y: 0,
    e1_z: 0, e_imp_z: 0, e2_z: 0, e_tot_z: 0, MEd_tot_z: 0,
    NRd_max: 0, x_star_y: 0, x_star_z: 0, MRdy: 0, MRdz: 0,
    ned: 0, a: 0, biaxialUtil: 0,
    rebarSchedule: '', lapLength: 0,
    checks: [],
  });

  // ── Input validation ───────────────────────────────────────────────────────
  if (Nd < 1) return invalid('NEd debe ser \u2265 1 kN (m\u00f3dulo para flexocompresi\u00f3n)');
  if (cornerBarDiam < 6) return invalid('Di\u00e1metro de barra esquina debe ser \u2265 6 mm');
  if (nBarsX < 0 || nBarsY < 0) return invalid('El n\u00famero de barras intermedias no puede ser negativo');

  const mat = getConcrete(fck);
  const fcd = mat.fcd;
  const fyd = getFyd(fyk);

  // ── Step 1: Derived geometry ───────────────────────────────────────────────
  const cornerArea = getBarArea(cornerBarDiam);
  const areaX      = getBarArea(barDiamX);
  const areaY      = getBarArea(barDiamY);
  const As_total   = 4 * cornerArea + 2 * nBarsX * areaX + 2 * nBarsY * areaY;

  const d_prime = cover + stirrupDiam + cornerBarDiam / 2;
  const d_y     = h - cover - stirrupDiam - cornerBarDiam / 2; // y-axis, depth = h
  const d_z     = b - cover - stirrupDiam - cornerBarDiam / 2; // z-axis, depth = b

  if (d_y <= d_prime) return invalid('Canto insuficiente para el di\u00e1metro de barra esquina');
  if (d_z <= d_prime) return invalid('Ancho insuficiente para el di\u00e1metro de barra esquina');

  // ── Step 2: Bar position arrays ────────────────────────────────────────────
  // Y-axis: neutral axis horizontal, depth = h, width = b
  // Primary faces: top (compression) + bottom (tension). Side bars = left/right face (nBarsY).
  const As_top = 2 * cornerArea + nBarsX * areaX;
  const barsY: BarGroup[] = [
    { y: d_prime, area: As_top },
    { y: d_y,     area: As_top },
  ];
  for (let i = 1; i <= nBarsY; i++) {
    const yi = d_prime + i * (h - 2 * d_prime) / (nBarsY + 1);
    barsY.push({ y: yi, area: 2 * areaY });
  }

  // Z-axis: neutral axis vertical, depth = b, width = h
  // Primary faces: left + right. Side bars = top/bottom face (nBarsX).
  const As_left = 2 * cornerArea + nBarsY * areaY;
  const barsZ: BarGroup[] = [
    { y: d_prime, area: As_left },
    { y: d_z,     area: As_left },
  ];
  for (let i = 1; i <= nBarsX; i++) {
    const zi = d_prime + i * (b - 2 * d_prime) / (nBarsX + 1);
    barsZ.push({ y: zi, area: 2 * areaX });
  }

  // ── Step 3: Slenderness per axis ───────────────────────────────────────────
  const lambda_y = Lk_mm / (h / Math.sqrt(12));  // strong axis (iy = h/√12)
  const lambda_z = Lk_mm / (b / Math.sqrt(12));  // weak axis  (iz = b/√12)

  // ── Step 4: Second-order eccentricities (CE art. 43.5.3) ──────────────────
  const NEd_N = Nd * 1e3;  // N

  const e0y = Math.abs(MEdy) * 1e6 / NEd_N;
  const e1_y = Math.max(e0y, Math.max(h / 30, 20));
  const e_imp_y = Lk_mm / 400;
  const curv_y = fyd / (Es * 0.45 * d_y);
  const e2_y = lambda_y > 25 ? curv_y * Lk_mm * Lk_mm / 10 : 0;
  const e_tot_y = e1_y + e_imp_y + e2_y;
  const MEd_tot_y = NEd_N * e_tot_y / 1e6;  // kNm

  const e0z = Math.abs(MEdz) * 1e6 / NEd_N;
  const e1_z = Math.max(e0z, Math.max(b / 30, 20));
  const e_imp_z = Lk_mm / 400;
  const curv_z = fyd / (Es * 0.45 * d_z);
  const e2_z = lambda_z > 25 ? curv_z * Lk_mm * Lk_mm / 10 : 0;
  const e_tot_z = e1_z + e_imp_z + e2_z;
  const MEd_tot_z = NEd_N * e_tot_z / 1e6;  // kNm

  // ── Step 5: Pure compression capacity + Whitney guard ─────────────────────
  const NRd_max     = fcd * (b * h - As_total) + fyd * As_total;  // N (net area, CE art. 39)
  const NRd_Whitney = fcd * 0.8 * b * h + As_total * fyd;         // N (Whitney block at full depth)

  // ── Step 6: N-M interaction for both axes ─────────────────────────────────
  const axisY = computeAxis(NEd_N, h, b, barsY, fcd, fyd, NRd_max, NRd_Whitney);
  const axisZ = computeAxis(NEd_N, b, h, barsZ, fcd, fyd, NRd_max, NRd_Whitney);

  const ndMaxFailed = axisY.ndMaxFailed; // same result for both axes (same NRd_max)
  const MRdy = axisY.MRd_Nmm / 1e6;     // kNm
  const MRdz = axisZ.MRd_Nmm / 1e6;     // kNm

  // ── Step 7: Biaxial check (CE Anejo 19 art. 5.8.9) ────────────────────────
  const ned = NEd_N / NRd_max;
  const a   = interpExponent(ned);

  let biaxialUtil: number;
  if (ndMaxFailed) {
    biaxialUtil = Infinity;
  } else {
    const termY = MRdy > 0 ? Math.pow(MEd_tot_y / MRdy, a) : 0;
    const termZ = MRdz > 0 ? Math.pow(MEd_tot_z / MRdz, a) : 0;
    biaxialUtil = termY + termZ;
  }

  // ── Step 8: Conditions 5.38a/b ────────────────────────────────────────────
  const cond_a = (lambda_y / lambda_z <= 2) && (lambda_z / lambda_y <= 2);

  const ey_norm = e_tot_y / h;
  const ez_norm = e_tot_z / b;
  const eccRatio = Math.max(ey_norm, ez_norm) / Math.max(Math.min(ey_norm, ez_norm), 1e-9);
  const cond_b = eccRatio >= 5.0;

  // ── Rebar schedule & lap length ────────────────────────────────────────────
  let rebarSchedule = `4\u00d8${cornerBarDiam}c`;
  if (nBarsX > 0) rebarSchedule += ` + ${2 * nBarsX}\u00d8${barDiamX}x`;
  if (nBarsY > 0) rebarSchedule += ` + ${2 * nBarsY}\u00d8${barDiamY}y`;
  rebarSchedule += ` (\u00d8${stirrupDiam}/c${stirrupSpacing})`;

  const fctm = mat.fctm;
  const fbd_poor = 2.25 * 0.7 * fctm;
  const lb_rqd = (cornerBarDiam / 4) * (fyd / fbd_poor);
  const lapLength = Math.ceil(Math.max(lb_rqd, 15 * cornerBarDiam, 200) / 5) * 5;

  // ── Checks ─────────────────────────────────────────────────────────────────
  type CheckStatus = 'ok' | 'warn' | 'fail';
  const checks: import('./types').CheckRow[] = [];

  // lambda-y
  {
    const status: CheckStatus = lambda_y <= 100 ? 'ok' : 'warn';
    checks.push({
      id: 'lambda-y',
      description: `Esbeltez \u03bby = ${lambda_y.toFixed(1)} — ${lambda_y <= 25 ? 'pilar corto (eje y)' : 'pilar esbelto, 2\u00ba orden (eje y)'}`,
      value: `\u03bby = ${lambda_y.toFixed(1)}`,
      limit: '\u03bb \u2264 100',
      utilization: lambda_y / 100,
      status,
      article: 'CE art. 43.5',
    });
  }

  // lambda-z
  {
    const status: CheckStatus = lambda_z <= 100 ? 'ok' : 'warn';
    checks.push({
      id: 'lambda-z',
      description: `Esbeltez \u03bbz = ${lambda_z.toFixed(1)} — ${lambda_z <= 25 ? 'pilar corto (eje z)' : 'pilar esbelto, 2\u00ba orden (eje z)'}`,
      value: `\u03bbz = ${lambda_z.toFixed(1)}`,
      limit: '\u03bb \u2264 100',
      utilization: lambda_z / 100,
      status,
      article: 'CE art. 43.5',
    });
  }

  // nd-max
  checks.push(makeCheck(
    'nd-max',
    'NEd \u2264 NRd,max (aplastamiento por compresi\u00f3n pura)',
    NEd_N / 1e3,
    NRd_max / 1e3,
    `${(NEd_N / 1e3).toFixed(1)} kN`,
    `${(NRd_max / 1e3).toFixed(1)} kN`,
    'CE art. 42',
  ));

  // nm-y (informational)
  if (ndMaxFailed) {
    checks.push({
      id: 'nm-y',
      description: 'MEd,tot,y \u2264 MRdy \u2014 N/A (aplastamiento governa)',
      value: '\u2014', limit: '\u2014', utilization: NaN, status: 'fail',
      article: 'CE art. 42 + 43',
    });
  } else {
    checks.push({
      id: 'nm-y',
      description: `MEd,tot,y vs MRdy — ${MEd_tot_y.toFixed(1)} / ${MRdy.toFixed(1)} kNm`,
      value: `${MEd_tot_y.toFixed(1)} kNm`,
      limit: `${MRdy.toFixed(1)} kNm`,
      utilization: MRdy > 0 ? MEd_tot_y / MRdy : Infinity,
      status: MRdy > 0 && MEd_tot_y <= MRdy ? 'ok' : 'fail',
      article: 'CE art. 42 + 43',
    });
  }

  // nm-z (informational)
  if (ndMaxFailed) {
    checks.push({
      id: 'nm-z',
      description: 'MEd,tot,z \u2264 MRdz \u2014 N/A (aplastamiento governa)',
      value: '\u2014', limit: '\u2014', utilization: NaN, status: 'fail',
      article: 'CE art. 42 + 43',
    });
  } else {
    checks.push({
      id: 'nm-z',
      description: `MEd,tot,z vs MRdz — ${MEd_tot_z.toFixed(1)} / ${MRdz.toFixed(1)} kNm`,
      value: `${MEd_tot_z.toFixed(1)} kNm`,
      limit: `${MRdz.toFixed(1)} kNm`,
      utilization: MRdz > 0 ? MEd_tot_z / MRdz : Infinity,
      status: MRdz > 0 && MEd_tot_z <= MRdz ? 'ok' : 'fail',
      article: 'CE art. 42 + 43',
    });
  }

  // cond-5.38a (informational)
  checks.push({
    id: 'cond-5.38a',
    description: `Cond. 5.38a: \u03bby/\u03bbz \u2264 2 y \u03bbz/\u03bby \u2264 2 — ${cond_a ? 'cumple' : 'no cumple'}`,
    value: `${(lambda_y / lambda_z).toFixed(2)} / ${(lambda_z / lambda_y).toFixed(2)}`,
    limit: '\u2264 2.0',
    utilization: NaN,
    status: 'ok',  // informational only — never fails
    article: 'CE Anejo 19 art. 5.8.9',
  });

  // cond-5.38b (informational)
  checks.push({
    id: 'cond-5.38b',
    description: `Cond. 5.38b: ratio excentricidades = ${eccRatio.toFixed(2)} — ${cond_b ? 'uniaxial dominante' : 'biaxial requerido'}`,
    value: eccRatio > 1000 ? '\u221e' : eccRatio.toFixed(2),
    limit: '\u2265 5.0 \u00f3 \u2264 0.2',
    utilization: NaN,
    status: 'ok',  // informational only
    article: 'CE Anejo 19 art. 5.8.9',
  });

  // biaxial-check (governing)
  if (ndMaxFailed) {
    checks.push({
      id: 'biaxial-check',
      description: 'Flexi\u00f3n esviada (biaxial) \u2014 N/A (aplastamiento governa)',
      value: '\u2014', limit: '\u2264 1.0', utilization: Infinity, status: 'fail',
      article: 'CE Anejo 19 art. 5.8.9',
    });
  } else {
    checks.push({
      id: 'biaxial-check',
      description: `Flexi\u00f3n esviada: (MEdy/MRdy)\u1d43 + (MEdz/MRdz)\u1d43 \u2264 1.0  (a=${a.toFixed(2)})`,
      value: biaxialUtil.toFixed(3),
      limit: '\u2264 1.0',
      utilization: biaxialUtil,
      status: toStatus(biaxialUtil),
      article: 'CE Anejo 19 art. 5.8.9',
    });
  }

  // as-min
  const As_min = 0.003 * b * h;
  checks.push(makeCheck(
    'as-min',
    'Armadura m\u00ednima: As \u2265 0.003\u00b7b\u00b7h',
    As_min, As_total,
    `${As_total.toFixed(0)} mm\u00b2`,
    `\u2265 ${As_min.toFixed(0)} mm\u00b2`,
    'CE art. 42.3.1',
  ));

  // as-max
  const As_max = 0.04 * b * h;
  checks.push(makeCheck(
    'as-max',
    'Armadura m\u00e1xima: As \u2264 0.04\u00b7b\u00b7h',
    As_total, As_max,
    `${As_total.toFixed(0)} mm\u00b2`,
    `\u2264 ${As_max.toFixed(0)} mm\u00b2`,
    'CE art. 42.3',
  ));

  // nBars-min: 4 corners + intermediates = at least 4
  const totalBars = 4 + 2 * nBarsX + 2 * nBarsY;
  {
    const status: CheckStatus = totalBars >= 4 ? 'ok' : 'fail';
    checks.push({
      id: 'nBars-min',
      description: 'M\u00ednimo 4 barras en secci\u00f3n rectangular',
      value: `${totalBars} barras`,
      limit: '\u2265 4 barras',
      utilization: 4 / Math.max(totalBars, 1),
      status,
      article: 'CE art. 42.3',
    });
  }

  // bar-spacing-x: clear spacing on top/bottom faces
  {
    const nPerFaceX = 2 + nBarsX; // 2 corner bars + intermediates
    const innerX = b - 2 * (cover + stirrupDiam) - 2 * cornerBarDiam;
    let clearX: number;
    if (nBarsX === 0) {
      clearX = innerX; // only 2 corner bars, full inner width available
    } else {
      clearX = (innerX - nBarsX * barDiamX) / (nBarsX + 1);
    }
    const sMinX = Math.max(barDiamX, cornerBarDiam, 20);
    const effectiveClear = nPerFaceX <= 1 ? innerX : clearX;
    const status: CheckStatus = effectiveClear < 0 ? 'fail' : effectiveClear < sMinX ? 'fail' : 'ok';
    checks.push({
      id: 'bar-spacing-x',
      description: 'Separaci\u00f3n libre cara X (sup./inf.)',
      value: effectiveClear < 0 ? 'No caben' : `${effectiveClear.toFixed(0)} mm`,
      limit: `\u2265 ${sMinX} mm`,
      utilization: effectiveClear > 0 ? sMinX / effectiveClear : Infinity,
      status,
      article: 'CE art. 69.4.1',
    });
  }

  // bar-spacing-y: clear spacing on left/right faces
  {
    const innerY = h - 2 * (cover + stirrupDiam) - 2 * cornerBarDiam;
    let clearY: number;
    if (nBarsY === 0) {
      clearY = innerY;
    } else {
      clearY = (innerY - nBarsY * barDiamY) / (nBarsY + 1);
    }
    const sMinY = Math.max(barDiamY, cornerBarDiam, 20);
    const status: CheckStatus = clearY < 0 ? 'fail' : clearY < sMinY ? 'fail' : 'ok';
    checks.push({
      id: 'bar-spacing-y',
      description: 'Separaci\u00f3n libre cara Y (laterales)',
      value: clearY < 0 ? 'No caben' : `${clearY.toFixed(0)} mm`,
      limit: `\u2265 ${sMinY} mm`,
      utilization: clearY > 0 ? sMinY / clearY : Infinity,
      status,
      article: 'CE art. 69.4.1',
    });
  }

  // stirrup-diam: ≥ max(φ_max_long/4, 6mm) — CE art. 69.4.3
  {
    const maxLongDiam = Math.max(cornerBarDiam, barDiamX, barDiamY);
    const stirrupDemand = Math.max(maxLongDiam / 4, 6);
    const status: CheckStatus = stirrupDiam >= stirrupDemand ? 'ok' : 'fail';
    checks.push({
      id: 'stirrup-diam',
      description: `Di\u00e1metro m\u00ednimo estribo \u2265 max(\u03c6max/4, 6 mm)`,
      value: `\u00d8${stirrupDiam} mm`,
      limit: `\u2265 \u00d8${stirrupDemand.toFixed(0)} mm`,
      utilization: stirrupDemand / stirrupDiam,
      status,
      article: 'CE art. 69.4.3',
    });
  }

  // stirrup-spacing: ≤ min(12·φ_corner, min(b,h), 300mm) — CE art. 69.4.3
  {
    const sMax = Math.min(12 * cornerBarDiam, Math.min(b, h), 300);
    const status: CheckStatus = stirrupSpacing <= sMax ? 'ok' : 'fail';
    checks.push({
      id: 'stirrup-spacing',
      description: 'Separaci\u00f3n m\u00e1xima de estribos \u2264 min(12\u03c6c, min(b,h), 300 mm)',
      value: `${stirrupSpacing} mm`,
      limit: `\u2264 ${sMax} mm`,
      utilization: stirrupSpacing / sMax,
      status,
      article: 'CE art. 69.4.3',
    });
  }

  return {
    valid: true,
    d_y, d_z, d_prime, As_total,
    lambda_y, lambda_z, Lk,
    e1_y, e_imp_y, e2_y, e_tot_y, MEd_tot_y,
    e1_z, e_imp_z, e2_z, e_tot_z, MEd_tot_z,
    NRd_max: NRd_max / 1e3,
    x_star_y: axisY.x_star,
    x_star_z: axisZ.x_star,
    MRdy, MRdz,
    ned, a, biaxialUtil,
    rebarSchedule, lapLength,
    checks,
  };
}
