// RC Beam calculations — Codigo Estructural (CE) Spain
// All units: mm, MPa, kN, kNm unless noted.
//
// CE art. 39     — Concrete material properties
// CE art. 42     — Bending resistance (ELU Flexion simple)
// CE art. 42.3   — Reinforcement limits
// CE art. 44     — Shear resistance (ELU Cortante)
// CE art. 44.2.3 — rho_w,min (minimum transverse reinforcement ratio)
// CE art. 49.2.4 — Crack width (ELS Fisuracion)
// CE art. 69.4   — Bar spacing
// CE art. 69.5.2 — Lap lengths

import { type RCBeamInputs } from '../../data/defaults';
import { getConcrete, getFyd, Es } from '../../data/materials';
import { getBarArea } from '../../data/rebar';
import { GAMMA_C, wkMax } from '../../data/factors';
import { type CheckRow, type CheckStatus, toStatus, makeCheck as check, makeCheckQty } from './types';
import { solveAtULU } from './rcBeamsSection';

export type { CheckStatus, CheckRow } from './types';

export interface RCBeamSectionResult {
  valid: boolean;
  error?: string;
  // Geometry
  d: number;        // effective depth (mm) — from compression face to tension steel centroid
  As: number;       // tension steel area (mm2)
  AsComp: number;   // compression steel area (mm2)
  Asw: number;      // stirrup area per unit length (mm2/mm)
  // Bending
  x: number;      // neutral axis depth (mm)
  MRd: number;    // design bending resistance (kNm)
  // Shear
  VRdc: number;   // shear without stirrups (kN)
  VRds: number;   // shear with stirrups (kN)
  VRd: number;    // governing shear resistance (kN)
  VRdmax: number; // max strut crushing (kN)
  // Cracking
  wk: number;     // crack width (mm)
  wkMax: number;  // limit for exposure class (mm)
  // Rebar info
  lapLength: number;     // minimum lap length (mm)
  rebarSchedule: string; // e.g. "4Ø16(t) + 2Ø12(c) + Ø8/c150 (2R)"
  checks: CheckRow[];
}

export interface RCBeamResult {
  valid: boolean;
  error?: string;
  vano: RCBeamSectionResult;    // midspan — positive bending M+
  apoyo: RCBeamSectionResult;   // support — negative bending M-
}

// psi2 quasi-permanent load combination factor (CE Table 12.1)
const PSI2_MAP: Record<string, number> = {
  residential: 0.3,
  office: 0.3,
  parking: 0.6,
  roof: 0.0,
  custom: 0.0, // overridden by psi2Custom when loadType='custom'
};


export interface SectionInputs {
  b: number;
  h: number;
  cover: number;
  stirrupDiam: number;
  stirrupLegs: number;
  fck: number;
  fyk: number;
  exposureClass: string;
  Md: number;
  VEd: number;
  Ms: number;             // quasi-permanent SLS moment (kNm)
  nBars: number;          // tension bars
  barDiam: number;        // tension bar diameter
  nBarsComp: number;      // compression bars
  barDiamComp: number;    // compression bar diameter
  stirrupSpacing: number;
  bondClass: 'good' | 'poor';
}

/**
 * Extracts SectionInputs (used by both calcRCBeam and solveSectionAtMoment)
 * from RCBeamInputs for the given section kind. M+ uses vano fields with
 * bottom-reinforcement-as-tension; M− uses apoyo fields with top-as-tension.
 *
 * Mode 'simple' V1: sagging only → use 'vano' kind (bottom = tension, top = compression).
 */
export function pickSectionInputs(state: RCBeamInputs, kind: 'vano' | 'apoyo'): SectionInputs {
  const isVano = kind === 'vano';
  // Los momentos se introducen como magnitudes (|M-| en apoyo). Se normaliza
  // el signo con Math.abs() — un M- tecleado con su signo natural no debe
  // desactivar checks en silencio ni romper solveSectionAtMoment (throw con
  // Md<0 durante el render del modo simple). Fix auditoría #60.
  return {
    b: state.b,
    h: state.h,
    cover: state.cover,
    stirrupDiam: isVano ? state.vano_stirrupDiam : state.apoyo_stirrupDiam,
    stirrupLegs: isVano ? state.vano_stirrupLegs : state.apoyo_stirrupLegs,
    fck: state.fck,
    fyk: state.fyk,
    exposureClass: state.exposureClass,
    Md: Math.abs(isVano ? state.vano_Md : state.apoyo_Md),
    VEd: Math.abs(isVano ? state.vano_VEd : state.apoyo_VEd),
    // Cuasipermanente = M_G + psi2·M_Q (NO psi2·(M_G+M_Q); fix auditoría #71),
    // idéntica a la de calcRCBeam.
    Ms: Math.abs(isVano
      ? (state.vano_M_G + psi2Quasi(state) * state.vano_M_Q)
      : (state.apoyo_M_G + psi2Quasi(state) * state.apoyo_M_Q)),
    nBars: isVano ? state.vano_bot_nBars : state.apoyo_top_nBars,
    barDiam: isVano ? state.vano_bot_barDiam : state.apoyo_top_barDiam,
    nBarsComp: isVano ? state.vano_top_nBars : state.apoyo_bot_nBars,
    barDiamComp: isVano ? state.vano_top_barDiam : state.apoyo_bot_barDiam,
    stirrupSpacing: isVano ? state.vano_stirrupSpacing : state.apoyo_stirrupSpacing,
    // CE Anejo 19 §69.5.1.2: bondClass depends on bar POSITION, not user choice.
    // Vano tension bars are at the bottom (favorable position → 'good'); apoyo
    // tension bars are at the top (unfavorable for h > 250 mm → 'poor').
    // Matches the hardcoded values in calcRCBeam at the two calcSection sites.
    bondClass: isVano ? 'good' : 'poor',
  };
}

function psi2Quasi(state: RCBeamInputs): number {
  const lt = state.loadType;
  if (lt === 'custom') return state.psi2Custom;
  return PSI2_MAP[lt] ?? 0.3;
}

function invalidSection(error: string): RCBeamSectionResult {
  return {
    valid: false, error,
    d: 0, As: 0, AsComp: 0, Asw: 0, x: 0,
    MRd: 0, VRdc: 0, VRds: 0, VRd: 0, VRdmax: 0,
    wk: 0, wkMax: 0, lapLength: 0, rebarSchedule: '',
    checks: [],
  };
}

function calcSection(inp: SectionInputs): RCBeamSectionResult {
  // Per-section geometry validation
  if (inp.h <= inp.cover + inp.stirrupDiam + inp.barDiam / 2)
    return invalidSection('Canto insuficiente para el diametro de barra');

  const mat = getConcrete(inp.fck);
  const fcd = mat.fcd;
  const fyd = getFyd(inp.fyk);

  // Effective depth: d = h - cover - stirrupDiam - barDiam/2  (CE art. 42)
  const d = inp.h - inp.cover - inp.stirrupDiam - inp.barDiam / 2;

  const barArea = getBarArea(inp.barDiam);
  const As = inp.nBars * barArea;

  const barAreaComp = getBarArea(inp.barDiamComp);
  const AsComp = inp.nBarsComp * barAreaComp;

  const stirrupArea = getBarArea(inp.stirrupDiam);
  const Asw_total = inp.stirrupLegs * stirrupArea; // mm2 per stirrup set
  const hasStirrups = inp.stirrupSpacing > 0;
  const Asw = hasStirrups ? Asw_total / inp.stirrupSpacing : 0; // mm2/mm

  const checks: CheckRow[] = [];

  // BENDING (CE art. 42) ────────────────────────────────────────────────
  // Over-reinforcement limit: x <= xLimit = ecu3/(ecu3+eyd) * d
  const ecu3 = 0.0035;
  const eyd = fyd / Es;
  const xLimit = (ecu3 / (ecu3 + eyd)) * d;

  // MRd y x salen del solver de compatibilidad de deformaciones — parábola-
  // rectángulo CE 21.3.3 + diagrama de pivotes CE 21.3.4 (solveAtULU). Es la
  // ÚNICA fuente de verdad para la capacidad última: el mismo motor que
  // alimenta los diagramas de fuerzas de la vista simple, así que header y
  // dibujo nunca discrepan. Resuelve correctamente secciones infra- y
  // sobre-armadas (en éstas el acero no plastifica) e incluye la contribución
  // del acero comprimido. Sustituye al bloque de Whitney As·fyd/(0.8·b·fcd),
  // que para secciones sobrearmadas divergía (x → ∞, MRd negativo).
  const ulu = solveAtULU(inp, mat);
  const x = ulu.x;
  const MRd = ulu.M_kNm;

  checks.push(makeCheckQty(
    'bending',
    'Momento resistente MRd >= Md',
    inp.Md, MRd,
    'moment',
    'CE art. 42',
  ));

  // Over-reinforcement warn — fixes P2 silent gap in TODOS.md
  if (x > xLimit) {
    checks.push({
      id: 'bending-over',
      description: 'Seccion sobrearmada (x > x,lim)',
      value: `x = ${x.toFixed(0)} mm`,
      limit: `x,lim = ${xLimit.toFixed(0)} mm`,
      utilization: x / xLimit,
      status: 'warn',
      article: 'CE art. 42',
    });
  }

  // MIN REINFORCEMENT tension bars ──────────────────────────────────────
  // Geometric minimum (CE art. 42.3.5 Tabla 42.3.5): 2.8‰ of the GROSS
  // cross-section area b·h (NOT b·d). Using b·d understates As,min by
  // ~10 % for typical cover/depth and is unconservative.
  // Mechanical minimum (CE art. 42.3.2): 0.04·Ac·fcd/fyd, also on b·h.
  const AsMinGeom = 0.0028 * inp.b * inp.h;
  const AsMinMec  = (0.04 * inp.b * inp.h * fcd) / fyd;
  const AsMin     = Math.max(AsMinGeom, AsMinMec);

  checks.push(check(
    'as-min',
    'Armadura minima traccion',
    AsMin, As,
    `As,min = ${AsMin.toFixed(0)} mm\u00b2`,
    `As = ${As.toFixed(0)} mm\u00b2`,
    'CE art. 42.3.2',
  ));

  // MIN REINFORCEMENT compression bars — constructive minimum (CE art. 42.3.3)
  // Tension As,min formula applies only to tension steel (CE art. 42.3.2 "traccionada").
  // For compression bars: constructive minimum 0.001·b·d (two bars minimum).
  const AsMinComp = 0.001 * inp.b * d;
  checks.push(check(
    'as-min-comp',
    'Armadura minima compresion (constructiva)',
    AsMinComp, AsComp,
    `As,c,min = ${AsMinComp.toFixed(0)} mm\u00b2`,
    `As,c = ${AsComp.toFixed(0)} mm\u00b2`,
    'CE art. 42.3.3',
  ));

  // MAX REINFORCEMENT total (CE art. 42.3) ─────────────────────────────
  const AsTotal = As + AsComp;
  const AsMax = 0.04 * inp.b * inp.h;
  checks.push(check(
    'as-max',
    'Armadura maxima total (traccion + compresion)',
    AsTotal, AsMax,
    `As,tot = ${AsTotal.toFixed(0)} mm\u00b2`,
    `As,max = ${AsMax.toFixed(0)} mm\u00b2`,
    'CE art. 42.3',
  ));

  // SHEAR (CE art. 44) ──────────────────────────────────────────────────
  const k = Math.min(1 + Math.sqrt(200 / d), 2.0);
  const rhoL = Math.min(As / (inp.b * d), 0.02);
  // (100·rho_l·fck)^(1/3) — el 100 es parte de la formula EC2 6.2.a
  // (fix auditoría #68; mismo fix que rcSlabs #38).
  const VRdc1 = ((0.18 / GAMMA_C) * k * Math.pow(100 * rhoL * inp.fck, 1 / 3) * inp.b * d) / 1000;
  const VRdc2 = ((0.051 / GAMMA_C) * Math.pow(k, 1.5) * Math.sqrt(inp.fck) * inp.b * d) / 1000;
  const VRdc = Math.max(VRdc1, VRdc2);

  const z = 0.9 * d;
  const cotTheta = 2.5;
  const VRds = (Asw * z * fyd * cotTheta) / 1000;
  // VRd,max con el MISMO θ que VRd,s (CE Anejo 19 §6.2.3(3)): para cotθ=2.5
  // el divisor es (cotθ+tanθ)=2.9, no el 0.3·fcd·b·z de θ=45° (fix auditoría
  // #59; mismo fix que rcSlabs #3).
  const nu1 = 0.6 * (1 - inp.fck / 250);
  const VRdmax = (nu1 * fcd * inp.b * z / (cotTheta + 1 / cotTheta)) / 1000;
  const VRd = hasStirrups ? Math.min(VRds, VRdmax) : VRdc;

  checks.push(makeCheckQty(
    'shear',
    'Cortante VEd <= VRd',
    inp.VEd, VRd,
    'force',
    'CE art. 44',
  ));

  if (hasStirrups) {
    checks.push(makeCheckQty(
      'shear-max',
      'Aplastamiento biela comprimida VEd <= VRd,max',
      inp.VEd, VRdmax,
      'force',
      'CE art. 44',
    ));
  }

  // rho_w,min (CE Anejo 19 / EC2 §9.2.2 ec. 9.5N: 0.08·√fck/fyk) ─────────
  if (hasStirrups) {
    const rhoWMin = (0.08 * Math.sqrt(inp.fck)) / inp.fyk;
    const rhoW = Asw_total / (inp.stirrupSpacing * inp.b);
    const rhoWUtil = rhoWMin / rhoW; // < 1 = rhoW >= rhoWMin = ok

    let rhoWStatus: CheckStatus;
    if (rhoWUtil >= 1.0) {
      rhoWStatus = 'fail';
    } else if (inp.stirrupSpacing > 0.75 * d) {
      rhoWStatus = 'warn'; // ratio ok but spacing > 0.75*d
    } else {
      rhoWStatus = 'ok';
    }

    checks.push({
      id: 'rho-w-min',
      description: 'Cuantia minima de armadura transversal',
      value: `\u03c1w = ${rhoW.toFixed(5)}`,
      limit: `\u03c1w,min = ${rhoWMin.toFixed(5)}`,
      utilization: rhoWUtil,
      status: rhoWStatus,
      article: 'CE art. 44.2.3.2.2',
    });

    // MAX STIRRUP SPACING (CE art. 44.2.3.4) ─────────────────────────────
    const sMax = Math.min(0.75 * d, 300);
    checks.push(check(
      'stirrup-spacing-max',
      'Separacion maxima entre estribos',
      inp.stirrupSpacing, sMax,
      `s = ${inp.stirrupSpacing} mm`,
      `s,max = ${sMax.toFixed(0)} mm`,
      'CE art. 44.2.3.4',
    ));

    // TRANSVERSE STIRRUP LEG SPACING (CE Anejo 19 art. 9.2.2(8)) ─────────
    // stirrupLegs >= 2 garantizado por la UI; el guard evita la division por
    // cero (s_t = Infinity) si llega un 1 por via programatica (auditoría #64).
    if (inp.stirrupLegs >= 2) {
      const innerWidth = inp.b - 2 * inp.cover - 2 * inp.stirrupDiam;
      const s_t = innerWidth / (inp.stirrupLegs - 1);
      const s_t_max = Math.min(0.75 * d, 600);
      checks.push(check(
        'stirrup-legs-spacing',
        'Separacion transversal de ramas de cercos',
        s_t, s_t_max,
        `s_t = ${s_t.toFixed(0)} mm`,
        `s_t,max = ${s_t_max.toFixed(0)} mm`,
        'CE Anejo 19 art. 9.2.2(8)',
      ));
    }
  } else {
    // Sin cercos: en vigas la armadura transversal minima es OBLIGATORIA
    // (CE Anejo 19 §9.2.2(4)-(5)) — no es una configuracion verificable.
    // Fila fail explicita en vez de silencio (fix auditoría #69).
    const rhoWMin = (0.08 * Math.sqrt(inp.fck)) / inp.fyk;
    checks.push({
      id: 'rho-w-min',
      description: 'Cuantia minima de armadura transversal (obligatoria en vigas)',
      value: 'ρw = 0 (sin cercos)',
      limit: `ρw,min = ${rhoWMin.toFixed(5)}`,
      utilization: Infinity,
      status: 'fail',
      article: 'CE Anejo 19 art. 9.2.2',
    });
  }

  // BAR SPACING (CE art. 69.4) ──────────────────────────────────────────
  if (inp.nBars === 1) {
    checks.push({
      id: 'bar-spacing',
      description: 'Separacion entre barras',
      value: 'N/A',
      limit: 'Barra unica',
      utilization: 0,
      status: 'ok',
      article: 'CE art. 69.4',
    });
  } else {
    // Net space remaining after placing all bars side-by-side within stirrups
    const available = inp.b - 2 * inp.cover - 2 * inp.stirrupDiam - inp.nBars * inp.barDiam;

    if (available <= 0) {
      checks.push({
        id: 'bar-spacing-impossible',
        description: 'Barras no caben en la seccion',
        value: `Espacio disponible: ${available.toFixed(0)} mm`,
        limit: '> 0 mm',
        utilization: Infinity,
        status: 'fail',
        article: 'CE art. 69.4',
      });
    } else {
      const spacing = available / (inp.nBars - 1);
      const minLimit = Math.max(inp.barDiam, 20);
      const maxLimit = Math.min(300, 3 * inp.h);

      let spacingStatus: CheckStatus;
      let spacingUtil: number;

      if (spacing < minLimit) {
        spacingStatus = 'fail';
        spacingUtil = minLimit / spacing; // > 1 = fail (too narrow)
      } else if (spacing > maxLimit) {
        spacingStatus = 'fail';
        spacingUtil = spacing / maxLimit; // > 1 = fail (too wide)
      } else {
        spacingUtil = spacing / maxLimit;
        spacingStatus = toStatus(spacingUtil);
      }

      checks.push({
        id: 'bar-spacing',
        description: 'Separacion entre barras',
        value: `s = ${spacing.toFixed(0)} mm`,
        limit: `${minLimit}-${maxLimit} mm`,
        utilization: spacingUtil,
        status: spacingStatus,
        article: 'CE art. 69.4',
      });
    }
  }

  // CRACKING (CE art. 49.2.4) ────────────────────────────────────────────
  const Ecm_MPa = mat.Ecm * 1000; // GPa -> MPa
  const n = Es / Ecm_MPa;
  const A_coef = 0.5 * inp.b;
  const B_coef = n * As;
  const C_coef = -n * As * d;
  const xCr = (-B_coef + Math.sqrt(B_coef ** 2 - 4 * A_coef * C_coef)) / (2 * A_coef);
  const Icr = (inp.b * xCr ** 3) / 3 + n * As * (d - xCr) ** 2;

  let wk = 0;
  if (inp.Ms > 0) {
    const sigmaS = (inp.Ms * 1e6 * (d - xCr) * n) / Icr;
    const hMinusD = inp.h - d;
    const AcEff = Math.min(
      2.5 * hMinusD * inp.b,
      ((inp.h - xCr) / 3) * inp.b,
      (inp.h / 2) * inp.b,
    );
    const rhoEff = As / AcEff;
    // sr,max = 3.4*c + 0.425*k1*k2*(phi/rhoEff), k1=0.8 k2=0.5.
    // c = recubrimiento de la armadura LONGITUDINAL (cover + estribo), no el
    // recubrimiento nominal al estribo (EC2 7.3.4; fix auditoría #66).
    const cLong = inp.cover + inp.stirrupDiam;
    let srMax = 3.4 * cLong + 0.425 * 0.8 * 0.5 * (inp.barDiam / rhoEff);
    // Limite de validez EC2 7.3.4(3): la formula solo vale si la separacion
    // entre ejes de barras <= 5(c + phi/2); si no, sr,max = 1.3(h - x)
    // (fix auditoría #70). nBars=1 → separacion no definida → rama conservadora.
    const barSpacingAxis = inp.nBars > 1
      ? (inp.b - 2 * cLong - inp.barDiam) / (inp.nBars - 1)
      : Infinity;
    if (barSpacingAxis > 5 * (cLong + inp.barDiam / 2)) {
      srMax = 1.3 * (inp.h - xCr);
    }
    const kt = 0.4;
    const esmEcm1 = (sigmaS - kt * (mat.fctm / rhoEff) * (1 + n * rhoEff)) / Es;
    const esmEcm2 = (0.6 * sigmaS) / Es;
    wk = srMax * Math.max(esmEcm1, esmEcm2, 0);
  }

  const wkLim = wkMax[inp.exposureClass] ?? 0.3;

  checks.push(check(
    'cracking',
    `Ancho de fisura wk <= wmax (clase ${inp.exposureClass})`,
    wk, wkLim,
    `wk = ${wk.toFixed(3)} mm`,
    `wmax = ${wkLim.toFixed(2)} mm`,
    'CE art. 49.2.4',
  ));

  // LAP LENGTH (CE Anejo 19 §8.7.3 / EC2) ────────────────────────────────
  // l0 = α6·lb,rqd ≥ l0,min con lb,rqd = (φ/4)·(σsd/fbd), σsd = fyd,
  // fbd = 2.25·η1·η2·fctd, fctd = 0.7·fctm/γc, α6 = 1.5 (100% solapado),
  // l0,min = max(0.3·α6·lb,rqd; 15φ; 200 mm).
  // Antes: 60φ/84φ fijos, calibrados solo para C25+B500 — quedaban cortos
  // para fck<25 o B600 (fix auditoría #65).
  const eta1 = inp.bondClass === 'good' ? 1.0 : 0.7;
  const eta2 = inp.barDiam <= 32 ? 1.0 : (132 - inp.barDiam) / 100;
  const fctd = (0.7 * mat.fctm) / GAMMA_C;
  const fbd = 2.25 * eta1 * eta2 * fctd;
  const alpha6 = 1.5;
  const lbRqd = (inp.barDiam / 4) * (fyd / fbd);
  const lapLength = Math.max(alpha6 * lbRqd, 15 * inp.barDiam, 200);

  // REBAR SCHEDULE ───────────────────────────────────────────────────────
  const rebarSchedule =
    `${inp.nBars}\u00d8${inp.barDiam}(t) + ${inp.nBarsComp}\u00d8${inp.barDiamComp}(c) + \u00d8${inp.stirrupDiam}/c${inp.stirrupSpacing} (${inp.stirrupLegs}R)`;

  return {
    valid: true,
    d, As, AsComp, Asw, x, MRd,
    VRdc, VRds, VRd, VRdmax,
    wk, wkMax: wkLim,
    lapLength, rebarSchedule,
    checks,
  };
}

function globalInvalid(error: string): RCBeamResult {
  return {
    valid: false, error,
    vano: invalidSection(error),
    apoyo: invalidSection(error),
  };
}

export function calcRCBeam(inp: RCBeamInputs): RCBeamResult {
  // Global input validation (invalidates both sections)
  if ((inp.b as number) <= 0) return globalInvalid('Ancho b debe ser > 0 mm');
  if ((inp.h as number) <= 0) return globalInvalid('Canto h debe ser > 0 mm');
  if ((inp.cover as number) <= 0) return globalInvalid('Recubrimiento debe ser > 0 mm');
  if ((inp.fck as number) < 12 || (inp.fck as number) > 90) return globalInvalid('fck fuera de rango (12-90 MPa)');
  if (!(inp.exposureClass in wkMax)) return globalInvalid(`Clase de exposicion invalida: ${inp.exposureClass}`);
  if ((inp.vano_bot_nBars as number) <= 0) return globalInvalid('Numero de barras de vano (traccion) debe ser > 0');
  if ((inp.apoyo_top_nBars as number) <= 0) return globalInvalid('Numero de barras de apoyo (traccion) debe ser > 0');

  // Quasi-permanent load factor psi2
  const psi2 = inp.loadType === 'custom'
    ? (inp.psi2Custom as number)
    : (PSI2_MAP[inp.loadType as string] ?? 0.3);

  // Los momentos se introducen como magnitudes (|M-| en apoyo). Math.abs()
  // evita que un valor negativo (M- con su signo natural) desactive en
  // silencio la fisuración (Ms>0) o dé utilización negativa → verde en
  // flexión (fix auditoría #60; mismo patrón que rcSlabs #53).
  const vanoMs  = Math.abs((inp.vano_M_G  as number) + psi2 * (inp.vano_M_Q  as number));
  const apoyoMs = Math.abs((inp.apoyo_M_G as number) + psi2 * (inp.apoyo_M_Q as number));

  const vano = calcSection({
    b:              inp.b as number,
    h:              inp.h as number,
    cover:          inp.cover as number,
    stirrupDiam:    inp.vano_stirrupDiam as number,
    stirrupLegs:    inp.vano_stirrupLegs as number,
    fck:            inp.fck as number,
    fyk:            inp.fyk as number,
    exposureClass:  inp.exposureClass as string,
    Md:             Math.abs(inp.vano_Md as number),
    VEd:            Math.abs(inp.vano_VEd as number),
    Ms:             vanoMs,
    nBars:          inp.vano_bot_nBars as number,
    barDiam:        inp.vano_bot_barDiam as number,
    nBarsComp:      inp.vano_top_nBars as number,
    barDiamComp:    inp.vano_top_barDiam as number,
    stirrupSpacing: inp.vano_stirrupSpacing as number,
    bondClass:      'good',
  });

  const apoyo = calcSection({
    b:              inp.b as number,
    h:              inp.h as number,
    cover:          inp.cover as number,
    stirrupDiam:    inp.apoyo_stirrupDiam as number,
    stirrupLegs:    inp.apoyo_stirrupLegs as number,
    fck:            inp.fck as number,
    fyk:            inp.fyk as number,
    exposureClass:  inp.exposureClass as string,
    Md:             Math.abs(inp.apoyo_Md as number),
    VEd:            Math.abs(inp.apoyo_VEd as number),
    Ms:             apoyoMs,
    nBars:          inp.apoyo_top_nBars as number,
    barDiam:        inp.apoyo_top_barDiam as number,
    nBarsComp:      inp.apoyo_bot_nBars as number,
    barDiamComp:    inp.apoyo_bot_barDiam as number,
    stirrupSpacing: inp.apoyo_stirrupSpacing as number,
    bondClass:      'poor',
  });

  return { valid: true, vano, apoyo };
}
