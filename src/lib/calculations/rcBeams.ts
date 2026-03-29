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

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface CheckRow {
  id: string;
  description: string;
  value: string;       // computed value with units
  limit: string;       // limit value with units
  utilization: number; // 0-1+ (>=1 = fail)
  status: CheckStatus;
  article: string;
}

export interface RCBeamSectionResult {
  valid: boolean;
  error?: string;
  // Geometry
  d: number;      // effective depth (mm)
  As: number;     // tension steel area (mm2)
  Asw: number;    // stirrup area per unit length (mm2/mm)
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
  rebarSchedule: string; // e.g. "4O16 + O8/c150 (2R)"
  checks: CheckRow[];
}

export interface RCBeamResult {
  valid: boolean;
  error?: string;
  midspan: RCBeamSectionResult;
  support: RCBeamSectionResult;
}

// psi2 quasi-permanent load combination factor (CE Table 12.1)
const PSI2_MAP: Record<string, number> = {
  residential: 0.3,
  office: 0.3,
  parking: 0.6,
  roof: 0.0,
  custom: 0.0, // overridden by psi2Custom when loadType='custom'
};

function toStatus(util: number): CheckStatus {
  if (util < 0.8) return 'ok';
  if (util < 1.0) return 'warn';
  return 'fail';
}

function check(
  id: string,
  description: string,
  demand: number,
  capacity: number,
  demandStr: string,
  capacityStr: string,
  article: string,
): CheckRow {
  const util = capacity > 0 ? demand / capacity : Infinity;
  return { id, description, value: demandStr, limit: capacityStr, utilization: util, status: toStatus(util), article };
}

interface SectionInputs {
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
  nBars: number;
  barDiam: number;
  stirrupSpacing: number;
  bondClass: 'good' | 'poor';
}

function invalidSection(error: string): RCBeamSectionResult {
  return {
    valid: false, error,
    d: 0, As: 0, Asw: 0, x: 0,
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

  const stirrupArea = getBarArea(inp.stirrupDiam);
  const Asw_total = inp.stirrupLegs * stirrupArea; // mm2 per stirrup set
  const hasStirrups = inp.stirrupSpacing > 0;
  const Asw = hasStirrups ? Asw_total / inp.stirrupSpacing : 0; // mm2/mm

  const checks: CheckRow[] = [];

  // BENDING (CE art. 42) ────────────────────────────────────────────────
  // Rectangular stress block (Whitney): 0.8*x*b*fcd = As*fyd
  const x = (As * fyd) / (0.8 * inp.b * fcd);

  // Over-reinforcement limit: x <= xLimit = ecu3/(ecu3+eyd) * d
  const ecu3 = 0.0035;
  const eyd = fyd / Es;
  const xLimit = (ecu3 / (ecu3 + eyd)) * d;

  // MRd = As*fyd*(d - 0.4*x)
  const MRd = (As * fyd * (d - 0.4 * x)) / 1e6;

  checks.push(check(
    'bending',
    'Momento resistente MRd >= Md',
    inp.Md, MRd,
    `Md = ${inp.Md.toFixed(1)} kNm`,
    `MRd = ${MRd.toFixed(1)} kNm`,
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

  // MIN REINFORCEMENT (CE art. 42.3.2) ──────────────────────────────────
  const AsMinGeom = 0.0028 * inp.b * d;
  const AsMinMec = (0.04 * inp.b * inp.h * fcd) / fyd;
  const AsMin = Math.max(AsMinGeom, AsMinMec);

  checks.push(check(
    'as-min',
    'Armadura minima geometrica y mecanica',
    AsMin, As,
    `As,min = ${AsMin.toFixed(0)} mm\u00b2`,
    `As = ${As.toFixed(0)} mm\u00b2`,
    'CE art. 42.3.2',
  ));

  // MAX REINFORCEMENT (CE art. 42.3) ────────────────────────────────────
  const AsMax = 0.04 * inp.b * inp.h;
  checks.push(check(
    'as-max',
    'Armadura maxima',
    As, AsMax,
    `As = ${As.toFixed(0)} mm\u00b2`,
    `As,max = ${AsMax.toFixed(0)} mm\u00b2`,
    'CE art. 42.3',
  ));

  // SHEAR (CE art. 44) ──────────────────────────────────────────────────
  const k = Math.min(1 + Math.sqrt(200 / d), 2.0);
  const rhoL = Math.min(As / (inp.b * d), 0.02);
  const VRdc1 = ((0.18 / GAMMA_C) * k * Math.pow(rhoL * inp.fck, 1 / 3) * inp.b * d) / 1000;
  const VRdc2 = ((0.051 / GAMMA_C) * Math.pow(k, 1.5) * Math.sqrt(inp.fck) * inp.b * d) / 1000;
  const VRdc = Math.max(VRdc1, VRdc2);

  const z = 0.9 * d;
  const cotTheta = 2.5;
  const VRds = (Asw * z * fyd * cotTheta) / 1000;
  const VRdmax = (0.3 * (1 - inp.fck / 250) * fcd * inp.b * z) / 1000;
  const VRd = hasStirrups ? Math.min(VRds, VRdmax) : VRdc;

  checks.push(check(
    'shear',
    'Cortante VEd <= VRd',
    inp.VEd, VRd,
    `VEd = ${inp.VEd.toFixed(1)} kN`,
    `VRd = ${VRd.toFixed(1)} kN`,
    'CE art. 44',
  ));

  if (hasStirrups) {
    checks.push(check(
      'shear-max',
      'Aplastamiento biela comprimida VEd <= VRd,max',
      inp.VEd, VRdmax,
      `VEd = ${inp.VEd.toFixed(1)} kN`,
      `VRd,max = ${VRdmax.toFixed(1)} kN`,
      'CE art. 44',
    ));
  }

  // rho_w,min (CE art. 44.2.3.2.2) ──────────────────────────────────────
  if (hasStirrups) {
    const rhoWMin = (0.072 * Math.sqrt(inp.fck)) / inp.fyk;
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
    // sr,max = 3.4*c + 0.425*k1*k2*(phi/rhoEff), k1=0.8 k2=0.5
    const srMax = 3.4 * inp.cover + 0.425 * 0.8 * 0.5 * (inp.barDiam / rhoEff);
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

  // LAP LENGTH (CE art. 69.5.2) ──────────────────────────────────────────
  const lapFactor = inp.bondClass === 'good' ? 60 : 84;
  const lapLength = lapFactor * inp.barDiam;

  // REBAR SCHEDULE ───────────────────────────────────────────────────────
  const rebarSchedule =
    `${inp.nBars}\u00d8${inp.barDiam} + \u00d8${inp.stirrupDiam}/c${inp.stirrupSpacing} (${inp.stirrupLegs}R)`;

  return {
    valid: true,
    d, As, Asw, x, MRd,
    VRdc, VRds, VRd, VRdmax,
    wk, wkMax: wkLim,
    lapLength, rebarSchedule,
    checks,
  };
}

function globalInvalid(error: string): RCBeamResult {
  return {
    valid: false, error,
    midspan: invalidSection(error),
    support: invalidSection(error),
  };
}

export function calcRCBeam(inp: RCBeamInputs): RCBeamResult {
  // Global input validation (invalidates both sections)
  if ((inp.b as number) <= 0) return globalInvalid('Ancho b debe ser > 0 mm');
  if ((inp.h as number) <= 0) return globalInvalid('Canto h debe ser > 0 mm');
  if ((inp.cover as number) <= 0) return globalInvalid('Recubrimiento debe ser > 0 mm');
  if ((inp.fck as number) < 12 || (inp.fck as number) > 90) return globalInvalid('fck fuera de rango (12-90 MPa)');
  if (!(inp.exposureClass in wkMax)) return globalInvalid(`Clase de exposicion invalida: ${inp.exposureClass}`);
  if ((inp.midspan_nBars as number) <= 0) return globalInvalid('Numero de barras de vano debe ser > 0');
  if ((inp.support_nBars as number) <= 0) return globalInvalid('Numero de barras de apoyo debe ser > 0');

  // Quasi-permanent load factor psi2
  const psi2 = inp.loadType === 'custom'
    ? (inp.psi2Custom as number)
    : (PSI2_MAP[inp.loadType as string] ?? 0.3);

  const midspanMs = (inp.midspan_M_G as number) + psi2 * (inp.midspan_M_Q as number);
  const supportMs  = (inp.support_M_G as number)  + psi2 * (inp.support_M_Q as number);

  const midspan = calcSection({
    b:              inp.b as number,
    h:              inp.h as number,
    cover:          inp.cover as number,
    stirrupDiam:    inp.stirrupDiam as number,
    stirrupLegs:    inp.stirrupLegs as number,
    fck:            inp.fck as number,
    fyk:            inp.fyk as number,
    exposureClass:  inp.exposureClass as string,
    Md:             inp.midspan_Md as number,
    VEd:            inp.midspan_VEd as number,
    Ms:             midspanMs,
    nBars:          inp.midspan_nBars as number,
    barDiam:        inp.midspan_barDiam as number,
    stirrupSpacing: inp.midspan_stirrupSpacing as number,
    bondClass:      'good',
  });

  const support = calcSection({
    b:              inp.b as number,
    h:              inp.h as number,
    cover:          inp.cover as number,
    stirrupDiam:    inp.stirrupDiam as number,
    stirrupLegs:    inp.stirrupLegs as number,
    fck:            inp.fck as number,
    fyk:            inp.fyk as number,
    exposureClass:  inp.exposureClass as string,
    Md:             inp.support_Md as number,
    VEd:            inp.support_VEd as number,
    Ms:             supportMs,
    nBars:          inp.support_nBars as number,
    barDiam:        inp.support_barDiam as number,
    stirrupSpacing: inp.support_stirrupSpacing as number,
    bondClass:      'poor',
  });

  return { valid: true, midspan, support };
}
