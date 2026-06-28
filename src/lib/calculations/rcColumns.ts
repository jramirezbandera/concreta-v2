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
import { type CheckRow, toStatus, makeCheck, makeCheckQty } from './types';

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
  // ── Circular section (aditivo; solo poblado cuando sectionType === 'circular') ──
  // Los campos rectangulares espejo (lambda_y/z, MRdy/z, d_y/z, biaxialUtil) se
  // rellenan también en circular para que los consumidores no ramifiquen donde no
  // es necesario. Estos son los específicos del círculo.
  sectionType: 'rectangular' | 'circular';
  D?: number;          // diámetro (mm)
  lambda?: number;     // esbeltez única = Lk/(D/4)
  d_circ?: number;     // canto eficaz curvatura = D/2 + i_s (mm)
  M_res?: number;      // momento resultante solicitante = hypot(MEd_tot_y, MEd_tot_z) (kNm)
  e_tot_res?: number;  // excentricidad total en la dirección resultante (mm)
  MRd?: number;        // momento resistente único (kNm)
  x_star?: number;     // profundidad de fibra neutra circular (mm)
  resUtil?: number;    // M_res / MRd
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
    // Gap zone (NRd_Whitney ≤ NEd < NRd_max) — la rama de pivote C (εc2 a
    // 3h/7, CE Anejo 19 art. 6.1) no está modelada en calcNM: el barrido
    // Whitney se agota en ~NRd_Whitney con un momento residual M_plateau y
    // la capacidad real decae hasta (NRd_max, M=0). Interpolación lineal
    // entre ambos puntos — la misma aproximación que envelopeCapacityM usa
    // para el diagrama N-M — en lugar de congelar el MRd del estado Whitney
    // (que corresponde a un axil MENOR que el aplicado: no conservador).
    const plateau = calcNM(2 * depth, width, depth, bars, fcd, fyd);
    const span = NRd_max - NRd_Whitney;
    const f = span > 1e-9 ? Math.min(1, Math.max(0, (NRd_max - NEd_N) / span)) : 0;
    return { MRd_Nmm: plateau.MRd * f, x_star: depth, ndMaxFailed: false };
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
  return 2.0; // clamp defensivo (NRd_Whitney < NRd_max siempre; ned < 1 en zona gap)
}

// ── Section model — geometry + materials + bar groups + axial capacities ────
// Construcción de barsY/barsZ + NRd_max/NRd_Whitney extraída como helper
// compartido por calcRCColumn y buildColumnInteraction: una sola fuente para
// el modelo de sección, sin forkear el motor (autoplan eng review 2026-05-17).
interface SectionModel {
  mat: ReturnType<typeof getConcrete>;
  fcd: number;
  fyd: number;
  As_total: number;
  d_prime: number;
  d_y: number;
  d_z: number;
  barsY: BarGroup[];
  barsZ: BarGroup[];
  NRd_max: number;      // N — compresión pura, área neta (CE art. 39)
  NRd_Whitney: number;  // N — bloque de Whitney a canto completo
}

function buildSectionModel(inp: RCColumnInputs): SectionModel | { error: string } {
  const { b, h, cover, cornerBarDiam, nBarsX, barDiamX, nBarsY, barDiamY,
          stirrupDiam, fck, fyk } = inp;

  if (cornerBarDiam < 6) return { error: 'Diámetro de barra esquina debe ser ≥ 6 mm' };
  if (nBarsX < 0 || nBarsY < 0) return { error: 'El número de barras intermedias no puede ser negativo' };

  const mat = getConcrete(fck);
  const fcd = mat.fcd;
  const fyd = getFyd(fyk);

  const cornerArea = getBarArea(cornerBarDiam);
  const areaX = getBarArea(barDiamX);
  const areaY = getBarArea(barDiamY);
  const As_total = 4 * cornerArea + 2 * nBarsX * areaX + 2 * nBarsY * areaY;

  const d_prime = cover + stirrupDiam + cornerBarDiam / 2;
  const d_y = h - cover - stirrupDiam - cornerBarDiam / 2; // y-axis, depth = h
  const d_z = b - cover - stirrupDiam - cornerBarDiam / 2; // z-axis, depth = b

  if (d_y <= d_prime) return { error: 'Canto insuficiente para el diámetro de barra esquina' };
  if (d_z <= d_prime) return { error: 'Ancho insuficiente para el diámetro de barra esquina' };

  // Y-axis: depth = h, width = b. Caras primarias sup/inf; barras laterales izq/der.
  const As_top = 2 * cornerArea + nBarsX * areaX;
  const barsY: BarGroup[] = [
    { y: d_prime, area: As_top },
    { y: d_y, area: As_top },
  ];
  for (let i = 1; i <= nBarsY; i++) {
    barsY.push({ y: d_prime + i * (h - 2 * d_prime) / (nBarsY + 1), area: 2 * areaY });
  }

  // Z-axis: depth = b, width = h. Caras primarias izq/der; barras laterales sup/inf.
  const As_left = 2 * cornerArea + nBarsY * areaY;
  const barsZ: BarGroup[] = [
    { y: d_prime, area: As_left },
    { y: d_z, area: As_left },
  ];
  for (let i = 1; i <= nBarsX; i++) {
    barsZ.push({ y: d_prime + i * (b - 2 * d_prime) / (nBarsX + 1), area: 2 * areaX });
  }

  // En compresión centrada εc se limita a εc2 = 0.002 (pivote C): la tensión
  // del acero no puede superar Es·0.002 = 400 N/mm² (f_yc,d). Para B500S
  // (fyd=434.8) usar fyd sobreestimaba NRd_max ~2% del lado inseguro;
  // coherente ahora con el check as-min-mech (CE Anejo 19 §6.1 / EHE art.40.2).
  const fyc_d_max = Math.min(fyd, 400);
  const NRd_max = fcd * (b * h - As_total) + fyc_d_max * As_total;
  // NRd_Whitney sí usa fyd: a x = canto completo las barras superan εyd.
  const NRd_Whitney = fcd * 0.8 * b * h + As_total * fyd;

  return { mat, fcd, fyd, As_total, d_prime, d_y, d_z, barsY, barsZ, NRd_max, NRd_Whitney };
}

export function calcRCColumn(inp: RCColumnInputs): RCColumnResult {
  // Fork por forma de sección. El camino rectangular queda intacto (true fork,
  // decisión D1/T1 de la revisión): el motor circular vive en calcRCColumnCirc
  // con su propio solver, sin tocar calcNM/computeAxis rectangulares.
  if ((inp.sectionType ?? 'rectangular') === 'circular') return calcRCColumnCirc(inp);

  const {
    b, h, cover,
    cornerBarDiam, nBarsX, barDiamX, nBarsY, barDiamY,
    stirrupDiam, stirrupSpacing,
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
    sectionType: 'rectangular',
    checks: [],
  });

  // ── Input validation ───────────────────────────────────────────────────────
  if (Nd < 1) return invalid('NEd debe ser \u2265 1 kN (m\u00f3dulo para flexocompresi\u00f3n)');

  const sm = buildSectionModel(inp);
  if ('error' in sm) return invalid(sm.error);
  const {
    mat, fcd, fyd, As_total, d_prime, d_y, d_z, barsY, barsZ, NRd_max, NRd_Whitney,
  } = sm;

  // ── Step 3: Slenderness per axis ───────────────────────────────────────────
  const lambda_y = Lk_mm / (h / Math.sqrt(12));  // strong axis (iy = h/√12)
  const lambda_z = Lk_mm / (b / Math.sqrt(12));  // weak axis  (iz = b/√12)

  // ── Step 4: Second-order eccentricities (CE art. 43.5.3) ──────────────────
  const NEd_N = Nd * 1e3;  // N

  // Método de curvatura nominal: 1/r = Kr·Kφ·(1/r0) con 1/r0 = εyd/(0.45·d)
  // (CE Anejo 19 art. 5.8.8.3). Kr = 1 (lado seguro). Kφ = 1 + β·φef ≥ 1
  // (expr. 5.37, β = 0.35 + fck/200 − λ/150) corrige por fluencia — omitirlo
  // subestima e2 un 20-40% en el rango 25 < λ ≲ 70 donde el 2º orden gobierna.
  const phiEf = inp.phiEf ?? 2.0;
  const Kphi_y = Math.max(1, 1 + (0.35 + inp.fck / 200 - lambda_y / 150) * phiEf);
  const Kphi_z = Math.max(1, 1 + (0.35 + inp.fck / 200 - lambda_z / 150) * phiEf);

  // Umbral para despreciar el 2º orden: λ_lim = 20·A·B·C/√n (CE Anejo 19
  // expr. 5.13N; con los defaults A=0.7, B=1.1, C=0.7 → 10.78/√n) capado al
  // 25 anterior. El corte fijo en 25 solo es seguro con n ≤ ~0.19: con axil
  // alto la norma exige considerar e2 desde esbelteces menores.
  const n_ax = NEd_N / (b * h * fcd);
  const lambda_lim = Math.min(
    (20 * 0.7 * 1.1 * 0.7) / Math.sqrt(Math.max(n_ax, 1e-9)),
    25,
  );

  const e0y = Math.abs(MEdy) * 1e6 / NEd_N;
  const e1_y = Math.max(e0y, Math.max(h / 30, 20));
  const e_imp_y = Lk_mm / 400;
  const curv_y = Kphi_y * fyd / (Es * 0.45 * d_y);
  const e2_y = lambda_y > lambda_lim ? curv_y * Lk_mm * Lk_mm / 10 : 0;
  const e_tot_y = e1_y + e_imp_y + e2_y;
  const MEd_tot_y = NEd_N * e_tot_y / 1e6;  // kNm

  const e0z = Math.abs(MEdz) * 1e6 / NEd_N;
  const e1_z = Math.max(e0z, Math.max(b / 30, 20));
  const e_imp_z = Lk_mm / 400;
  const curv_z = Kphi_z * fyd / (Es * 0.45 * d_z);
  const e2_z = lambda_z > lambda_lim ? curv_z * Lk_mm * Lk_mm / 10 : 0;
  const e_tot_z = e1_z + e_imp_z + e2_z;
  const MEd_tot_z = NEd_N * e_tot_z / 1e6;  // kNm

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

  // Longitud de solape (CE Anejo 19 arts. 8.4.2 + 8.7.3):
  //   fctd = αct·fctk,0.05/γc = 0.7·fctm/1.5
  //   fbd = 2.25·η1·η2·fctd (η1 = 1.0: barras verticales de pilar, buena adherencia)
  //   l0 = α6·lb,rqd con α6 = 1.5 (100% de barras solapadas en la misma sección)
  //   l0,min = max(0.3·α6·lb,rqd, 15Ø, 200)
  const fctm = mat.fctm;
  const fctd = (0.7 * fctm) / 1.5;
  const fbd = 2.25 * fctd;
  const lb_rqd = (cornerBarDiam / 4) * (fyd / fbd);
  const alpha6 = 1.5;
  const l0 = alpha6 * lb_rqd;
  const l0_min = Math.max(0.3 * l0, 15 * cornerBarDiam, 200);
  const lapLength = Math.ceil(Math.max(l0, l0_min) / 5) * 5;

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
  checks.push(makeCheckQty(
    'nd-max',
    'NEd \u2264 NRd,max (aplastamiento por compresi\u00f3n pura)',
    NEd_N / 1e3,
    NRd_max / 1e3,
    'force',
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
      ...makeCheckQty(
        'nm-y',
        'MEd,tot,y vs MRdy',
        MEd_tot_y, MRdy,
        'moment',
        'CE art. 42 + 43',
      ),
      status: MRdy > 0 && MEd_tot_y <= MRdy ? 'ok' : 'fail',
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
      ...makeCheckQty(
        'nm-z',
        'MEd,tot,z vs MRdz',
        MEd_tot_z, MRdz,
        'moment',
        'CE art. 42 + 43',
      ),
      status: MRdz > 0 && MEd_tot_z <= MRdz ? 'ok' : 'fail',
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

  // as-min geom (CE art. 42.3.1 — cuantía geométrica)
  // Cuant\u00eda geom\u00e9trica m\u00ednima 0.002\u00b7Ac (CE Anejo 19 art. 9.5.2 / EC2 \u00a79.5.2).
  // El 0.003 anterior no correspond\u00eda a ninguna referencia; la rama mec\u00e1nica
  // (0.10\u00b7NEd/f_yc,d) cubre la necesidad estructural por separado.
  const As_min = 0.002 * b * h;
  checks.push(makeCheck(
    'as-min',
    'Armadura m\u00ednima geom.: As \u2265 0.002\u00b7b\u00b7h',
    As_min, As_total,
    `${As_total.toFixed(0)} mm\u00b2`,
    `\u2265 ${As_min.toFixed(0)} mm\u00b2`,
    'CE Anejo 19 art. 9.5.2',
  ));

  // as-min mech (CE art. 42.3.1 — cuantía mecánica dependiente de carga)
  // As · f_yc,d ≥ 0.10 · N_Ed,    con f_yc,d = min(f_yd, 400 N/mm²)
  // Gobierna en pilares muy cargados con sección sobredimensionada.
  const fyc_d = Math.min(fyd, 400);                   // N/mm²
  const As_min_mech = 0.10 * NEd_N / fyc_d;           // mm²
  checks.push(makeCheck(
    'as-min-mech',
    'Armadura m\u00ednima mec.: As\u00b7f_yc,d \u2265 0.10\u00b7N_Ed',
    As_min_mech, As_total,
    `${As_total.toFixed(0)} mm\u00b2`,
    `\u2265 ${As_min_mech.toFixed(0)} mm\u00b2`,
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

  // stirrup-spacing: ≤ min(12·φ_min, min(b,h), 300mm) — CE Anejo 19 art. 9.5.3
  // El cerco arriostra la barra longitudinal MÁS FINA (la más propensa a
  // pandear): el límite usa el Ø mínimo presente, no el de esquina. Con
  // esquinas Ø25 e intermedias Ø12, 12·Ømin = 144 mm, no 300.
  {
    const minLongDiam = Math.min(
      cornerBarDiam,
      ...(nBarsX > 0 ? [barDiamX] : []),
      ...(nBarsY > 0 ? [barDiamY] : []),
    );
    const sMax = Math.min(12 * minLongDiam, Math.min(b, h), 300);
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
    sectionType: 'rectangular',
    checks,
  };
}

// ── Circular section (true fork) ────────────────────────────────────────────
// Soporte de pilar de sección circular. Motor SEPARADO del rectangular
// (decisión D1/T1): calcNM/computeAxis rectangulares quedan byte-idénticos.
//
// Hipótesis (Anejo 19 / EC2, confirmadas en investigación normativa 2026-06-28):
//   · Bloque de Whitney circular: profundidad a = 0.8·x desde la fibra más
//     comprimida; la zona comprimida es un segmento (casquete) circular. La
//     compresión total (Nc = fcd·πR²) se alcanza en a = D ⇒ x ≥ 1.25·D.
//   · Esbeltez única i = D/4 (simetría polar); flexión esviada → momento
//     resultante M = √(MEdy²+MEdz²) ≤ MRd (como el módulo de acero CHS).
//   · n barras iguales en un anillo de radio r_s, en θ_i = 2π·i/n (una barra en
//     la fibra superior ⇒ orientación simétrica al plano de flexión, D2).
//   · Nº mínimo de barras = 4 (Anejo 19 §9.5.2(4); el "6" era práctica EHE-08).

/** Nº mínimo de barras longitudinales en pilar circular — Anejo 19 §9.5.2(4). */
export const NBARS_MIN_CIRC = 4;
/** Nº de tiras para integrar el segmento (reservado; el motor usa forma cerrada). */
// (la fuerza de hormigón usa la fórmula cerrada de área+centroide de segmento,
//  más exacta en el centroide de casquetes someros que la integración por tiras)

/**
 * Compresión del hormigón en un segmento (casquete) circular bajo bloque de
 * Whitney. Devuelve la fuerza Nc y la profundidad yc de su resultante desde la
 * fibra más comprimida (juega el papel del 0.4·x rectangular).
 *
 * Forma cerrada del casquete de profundidad a = 0.8·x (≤ D):
 *   α = acos((R−a)/R)                        semiángulo del casquete
 *   A = R²·(α − sinα·cosα)                    área del segmento
 *   ȳc_centro = (2R·sin³α)/(3·(α − sinα·cosα))  centroide desde el centro, hacia arriba
 *   yc = R − ȳc_centro                         profundidad desde la fibra superior
 * Límite a→0 bien definido (ȳc_centro→R ⇒ yc→0); a=D ⇒ α=π ⇒ A=πR², yc=R.
 */
export function segmentConcrete(D: number, x: number, fcd: number): { Nc: number; yc: number } {
  const R = D / 2;
  const a = Math.min(0.8 * x, D);
  if (a <= 1e-9 * D) return { Nc: 0, yc: 0 };
  const cosA = Math.max(-1, Math.min(1, (R - a) / R));
  const alpha = Math.acos(cosA);
  const denom = alpha - Math.sin(alpha) * Math.cos(alpha);          // = A / R²
  const area = R * R * denom;
  const yc_from_center = denom > 1e-12
    ? (2 * R * Math.pow(Math.sin(alpha), 3)) / (3 * denom)
    : R; // límite α→0
  const yc = R - yc_from_center;
  return { Nc: fcd * area, yc };
}

/**
 * N-M de la sección circular para una profundidad de fibra neutra x.
 * Réplica del bucle de acero de calcNM, con el hormigón del segmento circular.
 * Momentos referidos al centro de la sección (D/2).
 */
function calcNMCirc(
  x: number, D: number, bars: BarGroup[], fcd: number, fyd: number,
): { NRd: number; MRd: number } {
  const { Nc, yc } = segmentConcrete(D, x, fcd);
  let NRd = Nc;
  let MRd = Nc * (D / 2 - yc);
  for (const bar of bars) {
    const eps = ecu3 * (x - bar.y) / x;
    const sig = Math.max(-fyd, Math.min(fyd, Es * eps));
    NRd += bar.area * sig;
    MRd += bar.area * sig * (D / 2 - bar.y);
  }
  return { NRd, MRd };
}

/** Búsqueda binaria de x* y MRd para la sección circular (depth = D). */
function computeAxisCirc(
  NEd_N: number, D: number, bars: BarGroup[], fcd: number, fyd: number,
  NRd_max: number, NRd_Whitney: number,
): { MRd_Nmm: number; x_star: number; ndMaxFailed: boolean } {
  if (NEd_N >= NRd_max) {
    return { MRd_Nmm: 0, x_star: D, ndMaxFailed: true };
  }
  if (NEd_N >= NRd_Whitney) {
    // Zona gap: a x = 2D el bloque satura (a = min(0.8·2D, D) = D, círculo lleno).
    // Misma interpolación lineal que el motor rectangular entre el plateau de
    // Whitney y (NRd_max, M=0). Para anillo simétrico plateau.MRd ≈ 0.
    const plateau = calcNMCirc(2 * D, D, bars, fcd, fyd);
    const span = NRd_max - NRd_Whitney;
    const f = span > 1e-9 ? Math.min(1, Math.max(0, (NRd_max - NEd_N) / span)) : 0;
    return { MRd_Nmm: plateau.MRd * f, x_star: D, ndMaxFailed: false };
  }
  let xLo = 1;
  let xHi = 2 * D;
  for (let i = 0; i < 60; i++) {
    const xMid = (xLo + xHi) / 2;
    if (calcNMCirc(xMid, D, bars, fcd, fyd).NRd < NEd_N) xLo = xMid;
    else xHi = xMid;
  }
  const x_star = (xLo + xHi) / 2;
  const { MRd } = calcNMCirc(x_star, D, bars, fcd, fyd);
  return { MRd_Nmm: MRd, x_star, ndMaxFailed: false };
}

interface CircSectionModel {
  mat: ReturnType<typeof getConcrete>;
  fcd: number;
  fyd: number;
  As_total: number;
  D: number;
  r_s: number;          // radio del anillo de barras (mm)
  barsCirc: BarGroup[];
  d_circ: number;       // canto eficaz curvatura = D/2 + i_s
  nBars: number;
  circBarDiam: number;
  Ac: number;
  NRd_max: number;
  NRd_Whitney: number;
}

function buildSectionModelCirc(inp: RCColumnInputs): CircSectionModel | { error: string } {
  const D = inp.D ?? 350;
  const n = inp.nBarsCirc ?? NBARS_MIN_CIRC;
  const circBarDiam = inp.circBarDiam ?? 16;
  const { cover, stirrupDiam, fck, fyk } = inp;

  if (circBarDiam < 6) return { error: 'Diámetro de barra debe ser ≥ 6 mm' };
  if (n < NBARS_MIN_CIRC) return { error: `Mínimo ${NBARS_MIN_CIRC} barras en sección circular (Anejo 19 §9.5.2)` };

  const mat = getConcrete(fck);
  const fcd = mat.fcd;
  const fyd = getFyd(fyk);

  const R = D / 2;
  const r_s = (D - 2 * cover - 2 * stirrupDiam - circBarDiam) / 2;
  if (r_s <= 0) return { error: 'Diámetro insuficiente para el recubrimiento y las barras' };

  const Abar = getBarArea(circBarDiam);
  const As_total = n * Abar;

  // Anillo de n barras en θ_i = 2π·i/n; θ=0 sitúa una barra en la fibra superior
  // (orientación simétrica al plano de flexión — decisión D2).
  const barsCirc: BarGroup[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    barsCirc.push({ y: R - r_s * Math.cos(t), area: Abar });
  }

  const i_s = r_s / Math.SQRT2;        // I_s = As·r_s²/2 ⇒ i_s = r_s/√2 (EC2 §5.8.8.3)
  const d_circ = R + i_s;
  const Ac = Math.PI * R * R;

  // εc2 = 0.002 limita σ_acero a 400 N/mm² en compresión centrada (= rectangular).
  const fyc_d_max = Math.min(fyd, 400);
  const NRd_max = fcd * (Ac - As_total) + fyc_d_max * As_total;
  // Saturación del barrido de Whitney CIRCULAR: a diferencia del rectangular
  // (Nc = fcd·0.8·b·h tope), segmentConcrete satura en el círculo COMPLETO
  // (a = min(0.8x, D) → Nc = fcd·Ac a x ≥ 1.25D), por lo que el axil máximo del
  // barrido es fcd·Ac + As·fyd, NO 0.8·fcd·Ac. Copiar el 0.8 disparaba la zona
  // gap ~0.2·fcd·Ac antes de tiempo y colapsaba MRd→0 para pilares muy cargados.
  // Con este valor NRd_Whitney > NRd_max, así que la rama gap nunca se alcanza
  // (ndMaxFailed gobierna a NEd ≥ NRd_max) y la bisección cubre todo NEd < NRd_max.
  const NRd_Whitney = fcd * Ac + As_total * fyd;

  return { mat, fcd, fyd, As_total, D, r_s, barsCirc, d_circ, nBars: n, circBarDiam, Ac, NRd_max, NRd_Whitney };
}

function calcRCColumnCirc(inp: RCColumnInputs): RCColumnResult {
  const { cover, stirrupDiam, stirrupSpacing, Nd, MEdy, MEdz, L, beta } = inp;
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
    sectionType: 'circular',
    checks: [],
  });

  if (Nd < 1) return invalid('NEd debe ser ≥ 1 kN (módulo para flexocompresión)');

  const sm = buildSectionModelCirc(inp);
  if ('error' in sm) return invalid(sm.error);
  const {
    mat, fcd, fyd, As_total, D, r_s, barsCirc, d_circ, nBars, circBarDiam, Ac, NRd_max, NRd_Whitney,
  } = sm;

  const NEd_N = Nd * 1e3;

  // ── Esbeltez única (simetría polar): i = D/4 ───────────────────────────────
  const lambda = Lk_mm / (D / 4);

  // ── 2º orden en la dirección RESULTANTE (decisión T2) ──────────────────────
  // Se aplica UNA sola vez la excentricidad mínima, la imperfección y e2 sobre
  // el momento de 1er orden resultante M1 = √(MEdy²+MEdz²). NO se combinan dos
  // e_tot por eje con hypot (eso metía un √2 fantasma con momento en un eje).
  const phiEf = inp.phiEf ?? 2.0;
  const Kphi = Math.max(1, 1 + (0.35 + inp.fck / 200 - lambda / 150) * phiEf);
  const n_ax = NEd_N / (Ac * fcd);
  const lambda_lim = Math.min((20 * 0.7 * 1.1 * 0.7) / Math.sqrt(Math.max(n_ax, 1e-9)), 25);

  const M1 = Math.hypot(MEdy, MEdz);                       // 1er orden resultante (kNm)
  const e0 = (M1 * 1e6) / NEd_N;                            // mm
  const e1 = Math.max(e0, Math.max(D / 30, 20));           // excentricidad mínima (única)
  const e_imp = Lk_mm / 400;                                // imperfección (única)
  const curv = (Kphi * fyd) / (Es * 0.45 * d_circ);
  const e2 = lambda > lambda_lim ? (curv * Lk_mm * Lk_mm) / 10 : 0;
  const e_tot = e1 + e_imp + e2;
  const M_res = (NEd_N * e_tot) / 1e6;                      // kNm

  // ── Capacidad N-M (una sola dirección, simetría polar) ─────────────────────
  const axis = computeAxisCirc(NEd_N, D, barsCirc, fcd, fyd, NRd_max, NRd_Whitney);
  const ndMaxFailed = axis.ndMaxFailed;
  const MRd = axis.MRd_Nmm / 1e6;                           // kNm
  const resUtil = ndMaxFailed ? Infinity : (MRd > 0 ? M_res / MRd : Infinity);
  const d_prime = cover + stirrupDiam + circBarDiam / 2;

  // ── Despiece + solape (geometría-agnóstico, usa circBarDiam) ───────────────
  const rebarSchedule = `${nBars}Ø${circBarDiam} (Ø${stirrupDiam}/c${stirrupSpacing})`;
  const fctm = mat.fctm;
  const fctd = (0.7 * fctm) / 1.5;
  const fbd = 2.25 * fctd;
  const lb_rqd = (circBarDiam / 4) * (fyd / fbd);
  const l0 = 1.5 * lb_rqd;
  const l0_min = Math.max(0.3 * l0, 15 * circBarDiam, 200);
  const lapLength = Math.ceil(Math.max(l0, l0_min) / 5) * 5;

  // ── Checks ─────────────────────────────────────────────────────────────────
  type CheckStatus = 'ok' | 'warn' | 'fail';
  const checks: CheckRow[] = [];

  // lambda (única)
  checks.push({
    id: 'lambda',
    description: `Esbeltez λ = ${lambda.toFixed(1)} — ${lambda <= 25 ? 'pilar corto' : 'pilar esbelto, 2º orden'}`,
    value: `λ = ${lambda.toFixed(1)}`,
    limit: 'λ ≤ 100',
    utilization: lambda / 100,
    status: (lambda <= 100 ? 'ok' : 'warn') as CheckStatus,
    article: 'CE art. 43.5',
  });

  // nd-max
  checks.push(makeCheckQty(
    'nd-max',
    'NEd ≤ NRd,max (aplastamiento por compresión pura)',
    NEd_N / 1e3, NRd_max / 1e3, 'force', 'CE art. 42',
  ));

  // flexion-check (gobernante)
  if (ndMaxFailed) {
    checks.push({
      id: 'flexion-check',
      description: 'Flexocompresión (M_res ≤ MRd) — N/A (aplastamiento gobierna)',
      value: '—', limit: '≤ 1.0', utilization: Infinity, status: 'fail',
      article: 'CE art. 42 + 43',
    });
  } else {
    checks.push({
      id: 'flexion-check',
      description: 'Flexocompresión: M_res = √(MEdy²+MEdz²) ≤ MRd',
      valueNum: M_res, valueQty: 'moment',
      limitNum: MRd, limitQty: 'moment',
      utilization: resUtil,
      status: toStatus(resUtil),
      article: 'CE art. 42 + 43',
    });
  }

  // nm-res (informativo)
  checks.push({
    id: 'nm-res',
    description: `Momento resultante M_res / MRd  (λ=${lambda.toFixed(0)}, e_tot=${e_tot.toFixed(0)} mm)`,
    valueNum: M_res, valueQty: 'moment',
    limitNum: MRd, limitQty: 'moment',
    utilization: ndMaxFailed ? Infinity : resUtil,
    status: 'ok',
    article: 'CE Anejo 19 §5.8.8',
  });

  // as-min geom
  const As_min = 0.002 * Ac;
  checks.push(makeCheck(
    'as-min',
    'Armadura mínima geom.: As ≥ 0.002·Ac',
    As_min, As_total,
    `${As_total.toFixed(0)} mm²`, `≥ ${As_min.toFixed(0)} mm²`,
    'CE Anejo 19 art. 9.5.2',
  ));

  // as-min mech
  const fyc_d = Math.min(fyd, 400);
  const As_min_mech = (0.10 * NEd_N) / fyc_d;
  checks.push(makeCheck(
    'as-min-mech',
    'Armadura mínima mec.: As·f_yc,d ≥ 0.10·N_Ed',
    As_min_mech, As_total,
    `${As_total.toFixed(0)} mm²`, `≥ ${As_min_mech.toFixed(0)} mm²`,
    'CE art. 42.3.1',
  ));

  // as-max
  const As_max = 0.04 * Ac;
  checks.push(makeCheck(
    'as-max',
    'Armadura máxima: As ≤ 0.04·Ac',
    As_total, As_max,
    `${As_total.toFixed(0)} mm²`, `≤ ${As_max.toFixed(0)} mm²`,
    'CE art. 42.3',
  ));

  // nBars-min (Anejo 19 §9.5.2(4): mínimo 4 en sección circular)
  {
    const status: CheckStatus = nBars >= NBARS_MIN_CIRC ? 'ok' : 'fail';
    checks.push({
      id: 'nBars-min',
      description: `Mínimo ${NBARS_MIN_CIRC} barras en sección circular`,
      value: `${nBars} barras`,
      limit: `≥ ${NBARS_MIN_CIRC} barras`,
      utilization: NBARS_MIN_CIRC / Math.max(nBars, 1),
      status,
      article: 'CE Anejo 19 art. 9.5.2',
    });
  }

  // bar-spacing-circ: separación libre por CUERDA entre barras adyacentes del anillo
  {
    const clear = 2 * r_s * Math.sin(Math.PI / nBars) - circBarDiam;
    const sMin = Math.max(circBarDiam, 20);
    const status: CheckStatus = clear < 0 ? 'fail' : clear < sMin ? 'fail' : 'ok';
    checks.push({
      id: 'bar-spacing-circ',
      description: 'Separación libre entre barras del anillo (cuerda)',
      value: clear < 0 ? 'No caben' : `${clear.toFixed(0)} mm`,
      limit: `≥ ${sMin} mm`,
      utilization: clear > 0 ? sMin / clear : Infinity,
      status,
      article: 'CE art. 69.4.1',
    });
  }

  // stirrup-diam: ≥ max(φ_long/4, 6 mm)
  {
    const stirrupDemand = Math.max(circBarDiam / 4, 6);
    const status: CheckStatus = stirrupDiam >= stirrupDemand ? 'ok' : 'fail';
    checks.push({
      id: 'stirrup-diam',
      description: 'Diámetro mínimo cerco ≥ max(φ/4, 6 mm)',
      value: `Ø${stirrupDiam} mm`,
      limit: `≥ Ø${stirrupDemand.toFixed(0)} mm`,
      utilization: stirrupDemand / stirrupDiam,
      status,
      article: 'CE art. 69.4.3',
    });
  }

  // stirrup-spacing: ≤ min(12·φ, D, 300 mm)
  // El término least-dimension es D para sección circular. Se mantiene el
  // coeficiente 12 del módulo rectangular por coherencia (Anejo 19 §9.5.3(3)
  // permite 15·φ; 12 es conservador y consistente entre ambas formas).
  {
    const sMax = Math.min(12 * circBarDiam, D, 300);
    const status: CheckStatus = stirrupSpacing <= sMax ? 'ok' : 'fail';
    checks.push({
      id: 'stirrup-spacing',
      description: 'Separación máxima de cercos ≤ min(12φ, D, 300 mm)',
      value: `${stirrupSpacing} mm`,
      limit: `≤ ${sMax} mm`,
      utilization: stirrupSpacing / sMax,
      status,
      article: 'CE art. 69.4.3',
    });
  }

  return {
    valid: true,
    d_y: d_circ, d_z: d_circ, d_prime, As_total,
    lambda_y: lambda, lambda_z: lambda, Lk,
    e1_y: e1, e_imp_y: e_imp, e2_y: e2, e_tot_y: e_tot, MEd_tot_y: M_res,
    e1_z: e1, e_imp_z: e_imp, e2_z: e2, e_tot_z: e_tot, MEd_tot_z: M_res,
    NRd_max: NRd_max / 1e3,
    x_star_y: axis.x_star, x_star_z: axis.x_star,
    MRdy: MRd, MRdz: MRd,
    ned: NEd_N / NRd_max, a: 1, biaxialUtil: resUtil,
    rebarSchedule, lapLength,
    sectionType: 'circular',
    D, lambda, d_circ, M_res, e_tot_res: e_tot, MRd, x_star: axis.x_star, resUtil,
    checks,
  };
}

// === N-M interaction diagram (capacity envelope) ============================
// Sweeps the calcNM primitive over neutral-axis depth x to trace the column's
// N-M capacity envelope. Consumed by RCColumnInteractionSVG.

export interface InteractionPoint {
  N: number;  // axial force (kN, compression positive)
  M: number;  // bending moment (kN.m)
}

export interface AxisInteraction {
  axis: 'y' | 'z';
  reinforced: InteractionPoint[];  // envelope with the actual rebar
  plain: InteractionPoint[];       // envelope of the plain concrete section
  applied: InteractionPoint;       // (NEd, MEd_tot) for this axis
  inside: boolean;                 // applied point within the reinforced envelope
  utilization: number;             // applied.M / capacity-M at applied.N
  governing: boolean;              // the higher-utilization axis
}

export interface ColumnInteractionResult {
  valid: boolean;
  y: AxisInteraction | null;
  z: AxisInteraction | null;
}

// Traces one N-M capacity envelope by sweeping the neutral-axis depth x.
//
// calcNM(x) is monotonic non-decreasing in N but plateaus once the concrete
// block clamps at x=depth and every bar saturates at fyd: beyond that point N
// is flat while M keeps changing, which would draw a spurious vertical tail.
// We trim the curve where N stops increasing and (reinforced only) append the
// true pure-compression point (NRd_max, 0) -- the swept curve only reaches
// NRd_Whitney, which carries a residual 0.8-block eccentricity.
//
// Sampling is non-uniform (x ~ t^2) so the high-curvature tension nose near
// x->0 is well resolved. Only the M >= 0 quadrant is drawn.
function sweepEnvelope(
  depth: number, width: number, bars: BarGroup[],
  fcd: number, fyd: number, compressionN: number,
): InteractionPoint[] {
  const pts: InteractionPoint[] = [];
  const AsTot = bars.reduce((sum, bar) => sum + bar.area, 0);

  // Pure-tension endpoint: all steel yielded in tension, concrete cracked out.
  if (AsTot > 0) pts.push({ N: -AsTot * fyd / 1e3, M: 0 });

  const N_SAMPLES = 80;
  const xMax = 1.6 * depth;
  let prevN = -Infinity;
  let started = false;
  for (let i = 1; i <= N_SAMPLES; i++) {
    const t = i / N_SAMPLES;
    const x = t * t * xMax + depth / 4000;   // non-uniform: dense near x->0
    const { NRd, MRd } = calcNM(x, width, depth, bars, fcd, fyd);
    const N = NRd / 1e3;
    const M = MRd / 1e6;
    if (started && N <= prevN + 1e-6) break;  // trim flat / non-monotone tail
    if (M < 0) {
      if (started) break;
      continue;
    }
    pts.push({ N, M });
    prevN = N;
    started = true;
  }

  // Pure-compression endpoint, M=0 — closes the curve on the N axis.
  // Reinforced: NRd_max (net area + steel). Plain: fcd·area (gross concrete).
  pts.push({ N: compressionN / 1e3, M: 0 });
  return pts;
}

// Versión circular del barrido (depth = D, hormigón del segmento circular).
function sweepEnvelopeCirc(
  D: number, bars: BarGroup[], fcd: number, fyd: number, compressionN: number,
): InteractionPoint[] {
  const pts: InteractionPoint[] = [];
  const AsTot = bars.reduce((sum, bar) => sum + bar.area, 0);
  if (AsTot > 0) pts.push({ N: -AsTot * fyd / 1e3, M: 0 });

  const N_SAMPLES = 80;
  const xMax = 1.6 * D;
  const compN = compressionN / 1e3;
  let prevN = -Infinity;
  let started = false;
  for (let i = 1; i <= N_SAMPLES; i++) {
    const t = i / N_SAMPLES;
    const x = t * t * xMax + D / 4000;
    const { NRd, MRd } = calcNMCirc(x, D, bars, fcd, fyd);
    const N = NRd / 1e3;
    const M = MRd / 1e6;
    // El bloque circular satura en fcd·Ac + As·fyd (> NRd_max armado): recortar
    // en compressionN para que la nariz de compresión no sobrepase el punto de
    // cierre (NRd_max) y la curva quede monótona en N.
    if (started && N > compN) break;
    if (started && N <= prevN + 1e-6) break;
    if (M < 0) { if (started) break; continue; }
    pts.push({ N, M });
    prevN = N;
    started = true;
  }
  pts.push({ N: compressionN / 1e3, M: 0 });
  return pts;
}

// M capacity of an envelope at axial N (linear interpolation). null if N out of range.
function envelopeCapacityM(curve: InteractionPoint[], N: number): number | null {
  if (curve.length < 2) return null;
  if (N < curve[0].N || N > curve[curve.length - 1].N) return null;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const c = curve[i + 1];
    if (N >= a.N && N <= c.N) {
      if (c.N - a.N < 1e-9) return Math.max(a.M, c.M);
      const f = (N - a.N) / (c.N - a.N);
      return a.M + f * (c.M - a.M);
    }
  }
  return null;
}

// Builds both N-M interaction diagrams (y and z axes) for a column.
// `inside` is derived from the drawn curve itself (interpolating the reinforced
// envelope at N = NEd), never from the engine N-M check, so the marker can
// never contradict the curve.
export function buildColumnInteraction(
  inp: RCColumnInputs, result: RCColumnResult,
): ColumnInteractionResult {
  if (!result.valid) return { valid: false, y: null, z: null };

  // ── Circular: una sola envolvente (simetría polar) → se devuelve como `y`,
  // con z: null. Los consumidores renderizan POSITIVAMENTE este caso de un
  // diagrama (no se apoyan en el guard y && z, que lo suprimiría).
  if ((inp.sectionType ?? 'rectangular') === 'circular') {
    const smc = buildSectionModelCirc(inp);
    if ('error' in smc) return { valid: false, y: null, z: null };
    const { fcd, fyd, barsCirc, D, NRd_max, Ac } = smc;
    const reinforced = sweepEnvelopeCirc(D, barsCirc, fcd, fyd, NRd_max);
    const plain = sweepEnvelopeCirc(D, [], fcd, fyd, fcd * Ac);
    const applied: InteractionPoint = { N: inp.Nd, M: result.M_res ?? result.MEd_tot_y };
    const Mcap = envelopeCapacityM(reinforced, applied.N);
    const inside = Mcap !== null && applied.M <= Mcap + 1e-9;
    const utilization = Mcap !== null && Mcap > 1e-9 ? applied.M / Mcap : Infinity;
    const y: AxisInteraction = { axis: 'y', reinforced, plain, applied, inside, utilization, governing: true };
    return { valid: true, y, z: null };
  }

  const sm = buildSectionModel(inp);
  if ('error' in sm) return { valid: false, y: null, z: null };
  const { fcd, fyd, barsY, barsZ, NRd_max } = sm;

  const buildAxis = (
    axis: 'y' | 'z', depth: number, width: number,
    bars: BarGroup[], MEd_tot: number,
  ): AxisInteraction => {
    const reinforced = sweepEnvelope(depth, width, bars, fcd, fyd, NRd_max);
    // Plain concrete: pure-compression capacity is fcd·(gross area) = fcd·depth·width.
    const plain = sweepEnvelope(depth, width, [], fcd, fyd, fcd * depth * width);
    const applied: InteractionPoint = { N: inp.Nd, M: MEd_tot };
    const Mcap = envelopeCapacityM(reinforced, applied.N);
    const inside = Mcap !== null && applied.M <= Mcap + 1e-9;
    const utilization = Mcap !== null && Mcap > 1e-9 ? applied.M / Mcap : Infinity;
    return { axis, reinforced, plain, applied, inside, utilization, governing: false };
  };

  const y = buildAxis('y', inp.h, inp.b, barsY, result.MEd_tot_y);
  const z = buildAxis('z', inp.b, inp.h, barsZ, result.MEd_tot_z);
  if (y.utilization >= z.utilization) y.governing = true;
  else z.governing = true;

  return { valid: true, y, z };
}
