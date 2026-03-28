// RC Beam calculations — Código Estructural (CE) Spain
// All units: mm, MPa, kN, kNm unless noted.
//
// Key articles:
//   CE art. 39   — Concrete material properties
//   CE art. 42   — Bending resistance (ELU Flexión simple)
//   CE art. 42.3 — Reinforcement limits
//   CE art. 44   — Shear resistance (ELU Cortante)
//   CE art. 49   — Crack width (ELS Fisuración)

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
  utilization: number; // 0–1+ (>=1 = fail)
  status: CheckStatus;
  article: string;
}

export interface RCBeamResult {
  valid: boolean;
  error?: string;
  // Geometry
  d: number;          // effective depth (mm)
  As: number;         // tension steel area (mm²)
  Asw: number;        // stirrup area per unit length (mm²/mm)
  // Bending
  x: number;          // neutral axis depth (mm)
  MRd: number;        // design bending resistance (kNm)
  // Shear
  VRdc: number;       // shear without stirrups (kN)
  VRds: number;       // shear with stirrups (kN)
  VRd: number;        // governing shear resistance (kN)
  VRdmax: number;     // max strut crushing (kN)
  // Cracking
  wk: number;         // crack width (mm)
  wkMax: number;      // limit for exposure class (mm)
  // Checks
  checks: CheckRow[];
}

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
  return {
    id,
    description,
    value: demandStr,
    limit: capacityStr,
    utilization: util,
    status: toStatus(util),
    article,
  };
}

export function calcRCBeam(inp: RCBeamInputs): RCBeamResult {
  // --- Input validation ---
  if (inp.b <= 0) return invalid('Ancho b debe ser > 0 mm');
  if (inp.h <= 0) return invalid('Canto h debe ser > 0 mm');
  if (inp.cover <= 0) return invalid('Recubrimiento debe ser > 0 mm');
  if (inp.nBars <= 0) return invalid('Número de barras debe ser > 0');
  if (inp.barDiam <= 0) return invalid('Diámetro de barra debe ser > 0 mm');
  if (inp.h <= inp.cover + inp.barDiam / 2)
    return invalid('Canto insuficiente para recubrimiento');
  if (inp.fck < 12 || inp.fck > 90) return invalid('fck fuera de rango (12–90 MPa)');
  if (!(inp.exposureClass in wkMax)) return invalid(`Clase de exposición inválida: ${inp.exposureClass}`);

  const mat = getConcrete(inp.fck);
  const _fcd = mat.fcd;      // MPa
  const _fyd = getFyd(inp.fyk); // MPa

  // Effective depth
  const d = inp.h - inp.cover - inp.barDiam / 2;

  // Tension steel area (mm²)
  const barArea = getBarArea(inp.barDiam);
  const As = inp.nBars * barArea;

  // Stirrup area (mm²) — total legs × single bar area
  const stirrupArea = getBarArea(inp.stirrupDiam);
  const Asw_total = inp.stirrupLegs * stirrupArea; // mm² per stirrup set
  const Asw = Asw_total / inp.stirrupSpacing;       // mm²/mm

  const checks: CheckRow[] = [];

  // ─── BENDING (CE art. 42) ───────────────────────────────────────
  // Rectangular stress block (CE art. 39.5, Whitney block):
  //   Equilibrium: 0.8·x·b·fcd = As·fyd  →  x = As·fyd / (0.8·b·fcd)
  const x = (As * _fyd) / (0.8 * inp.b * _fcd);

  // Strain check: x/d <= εcu3/(εcu3 + εyd)  (domain 2–3 boundary)
  // εcu3 = 0.0035, εyd = fyd/Es
  const ecu3 = 0.0035;
  const eyd = _fyd / Es;
  const xLimit = (ecu3 / (ecu3 + eyd)) * d;
  if (x > xLimit) {
    // Over-reinforced — compression reinforcement needed. Flag but continue.
  }

  // MRd = As·fyd·(d - 0.4·x)  [kNm = N·mm / 1e6]
  const MRd = (As * _fyd * (d - 0.4 * x)) / 1e6;

  checks.push(
    check(
      'bending',
      'Momento resistente MRd ≥ Md',
      inp.Md,
      MRd,
      `Md = ${inp.Md.toFixed(1)} kNm`,
      `MRd = ${MRd.toFixed(1)} kNm`,
      'CE art. 42',
    ),
  );

  // ─── MIN REINFORCEMENT (CE art. 42.3.2) ─────────────────────────
  // Geometric: As,min,geom = 0.0028·b·d
  const AsMinGeom = 0.0028 * inp.b * d;
  // Mechanical: As·fyd >= 0.04·Ac·fcd  → As,min,mec = 0.04·b·h·fcd/fyd
  const AsMinMec = (0.04 * inp.b * inp.h * _fcd) / _fyd;
  const AsMin = Math.max(AsMinGeom, AsMinMec);

  checks.push(
    check(
      'as-min',
      'Armadura mínima geométrica y mecánica',
      AsMin,
      As,
      `As,min = ${AsMin.toFixed(0)} mm²`,
      `As = ${As.toFixed(0)} mm²`,
      'CE art. 42.3.2',
    ),
  );

  // ─── MAX REINFORCEMENT (CE art. 42.3) ────────────────────────────
  const AsMax = 0.04 * inp.b * inp.h;
  checks.push(
    check(
      'as-max',
      'Armadura máxima',
      As,
      AsMax,
      `As = ${As.toFixed(0)} mm²`,
      `As,max = ${AsMax.toFixed(0)} mm²`,
      'CE art. 42.3',
    ),
  );

  // ─── SHEAR (CE art. 44) ──────────────────────────────────────────
  // Without stirrups (CE art. 44.2.3.2.1):
  //   VRd,c = max( (0.18/γc)·k·(ρl·fck)^(1/3)·bw·d ,
  //               (0.051/γc)·k^(3/2)·fck^(1/2)·bw·d )
  const k = Math.min(1 + Math.sqrt(200 / d), 2.0);
  const rhoL = Math.min(As / (inp.b * d), 0.02);
  const VRdc1 = ((0.18 / GAMMA_C) * k * Math.pow(rhoL * inp.fck, 1 / 3) * inp.b * d) / 1000; // kN
  const VRdc2 = ((0.051 / GAMMA_C) * Math.pow(k, 1.5) * Math.sqrt(inp.fck) * inp.b * d) / 1000;
  const VRdc = Math.max(VRdc1, VRdc2);

  // With stirrups (CE art. 44.2.3.2.2):
  //   z = 0.9·d,  cot θ = 2.5 (θ ≈ 21.8°)
  //   VRd,s = (Asw/s)·z·fyd·cot θ
  const z = 0.9 * d;
  const cotTheta = 2.5;
  const VRds = (Asw * z * _fyd * cotTheta) / 1000; // kN

  // Max strut crushing (CE art. 44.2.3.3.2):
  //   VRd,max = 0.3·(1 - fck/250)·fcd·bw·z
  const VRdmax = (0.3 * (1 - inp.fck / 250) * _fcd * inp.b * z) / 1000; // kN

  // Governing: if stirrups present, use VRds (bounded by VRdmax); else VRdc
  const hasStirrups = Asw > 0 && inp.stirrupSpacing > 0;
  const VRd = hasStirrups ? Math.min(VRds, VRdmax) : VRdc;

  checks.push(
    check(
      'shear',
      'Cortante VEd ≤ VRd',
      inp.VEd,
      VRd,
      `VEd = ${inp.VEd.toFixed(1)} kN`,
      `VRd = ${VRd.toFixed(1)} kN`,
      'CE art. 44',
    ),
  );

  if (hasStirrups) {
    checks.push(
      check(
        'shear-max',
        'Aplastamiento biela comprimida VEd ≤ VRd,max',
        inp.VEd,
        VRdmax,
        `VEd = ${inp.VEd.toFixed(1)} kN`,
        `VRd,max = ${VRdmax.toFixed(1)} kN`,
        'CE art. 44',
      ),
    );
  }

  // ─── CRACKING (CE art. 49.2.4) ──────────────────────────────────
  // Cracked section neutral axis (service state):
  //   n = Es / Ecm  (modular ratio)
  //   b·x²/2 = n·As·(d - x)  →  quadratic: 0.5b·x² + n·As·x - n·As·d = 0
  const Ecm_MPa = mat.Ecm * 1000; // GPa → MPa
  const n = Es / Ecm_MPa;
  const A_coef = 0.5 * inp.b;
  const B_coef = n * As;
  const C_coef = -n * As * d;
  const xCr = (-B_coef + Math.sqrt(B_coef ** 2 - 4 * A_coef * C_coef)) / (2 * A_coef);

  // Steel stress under service moment:
  //   I_cr = b·xCr³/3 + n·As·(d - xCr)²
  const Icr = (inp.b * xCr ** 3) / 3 + n * As * (d - xCr) ** 2;
  const sigmaS = (inp.Ms * 1e6 * (d - xCr) * n) / Icr; // MPa (Ms in kNm → Nmm)

  // Maximum crack spacing (CE art. 49.2.4):
  //   sr,max = 3.4·c + 0.425·k1·k2·φ/ρp,eff
  //   k1=0.8 (high bond), k2=0.5 (pure bending), c = cover
  //   ρp,eff = As / Ac,eff,  Ac,eff = min(2.5·(h-d)·b, (h-xCr)/3·b, h/2·b)
  const c = inp.cover;
  const hMinusD = inp.h - d; // distance from tension face to rebar centroid
  const AcEff = Math.min(2.5 * hMinusD * inp.b, ((inp.h - xCr) / 3) * inp.b, (inp.h / 2) * inp.b);
  const rhoEff = As / AcEff;
  const k1 = 0.8;
  const k2 = 0.5;
  const srMax = 3.4 * c + 0.425 * k1 * k2 * (inp.barDiam / rhoEff);

  // Mean strain difference (CE art. 49.2.4):
  //   εsm - εcm = max( (σs - kt·fctm·(1+n·ρp,eff)/ρp,eff) / Es ,  0.6·σs/Es )
  //   kt = 0.4 (long-term loading)
  const kt = 0.4;
  const esmEcm1 = (sigmaS - kt * (mat.fctm / rhoEff) * (1 + n * rhoEff)) / Es;
  const esmEcm2 = (0.6 * sigmaS) / Es;
  const esmEcm = Math.max(esmEcm1, esmEcm2, 0);

  // Crack width:
  const wk = srMax * esmEcm;
  const wkLim = wkMax[inp.exposureClass] ?? 0.3;

  checks.push(
    check(
      'cracking',
      `Ancho de fisura wk ≤ wmax (clase ${inp.exposureClass})`,
      wk,
      wkLim,
      `wk = ${wk.toFixed(3)} mm`,
      `wmax = ${wkLim.toFixed(2)} mm`,
      'CE art. 49.2.4',
    ),
  );

  return {
    valid: true,
    d,
    As,
    Asw,
    x,
    MRd,
    VRdc,
    VRds,
    VRd,
    VRdmax,
    wk,
    wkMax: wkLim,
    checks,
  };
}

function invalid(error: string): RCBeamResult {
  return {
    valid: false,
    error,
    d: 0, As: 0, Asw: 0, x: 0,
    MRd: 0, VRdc: 0, VRds: 0, VRd: 0, VRdmax: 0,
    wk: 0, wkMax: 0,
    checks: [],
  };
}
