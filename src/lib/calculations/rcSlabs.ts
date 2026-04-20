// Forjados — Reticular (sección T por nervio) + Losa maciza (franja 1m)
// CE art. 21 (b_eff), art. 42 (flexión), art. 42.3 (cuantías), art. 44 (cortante),
// art. 49.2.4 (fisuración), art. 69.4 (separación barras).
// All units: mm, MPa, kN, kNm.

import { type ForjadosInputs } from '../../data/defaults';
import { getConcrete, getFyd, Es } from '../../data/materials';
import { getBarArea } from '../../data/rebar';
import { GAMMA_C, wkMax } from '../../data/factors';
import { getL0Factor } from '../../data/forjadoTipologias';
import { solveTSection, solveRectangular, computeBEff } from './rcTSection';
import { type CheckRow, type CheckStatus, toStatus, makeCheck as check } from './types';

export type { CheckStatus, CheckRow } from './types';

// ── Anchorage (CE art. 69.5.1.1) ─────────────────────────────────────────────
// lb_rqd = (Ø/4)·(σsd/fbd); lb_min = max(0.3·lb_rqd, 10·Ø, 100 mm).
// fbd = 2.25·η1·η2·fctd; fctd = fctm/1.5.
// Posición I (buena adherencia): barra en cara inferior, o en losas con h ≤ 300 mm.
// Posición II (mala adherencia): barras superiores con h > 300 mm → η1 = 0.7.

export interface AnchorageInfo {
  phi:      number;
  lb_rqd:   number;
  lb_min:   number;
  position: 'I' | 'II';
}

export function computeAnchorage(
  phi:  number,
  fctm: number,   // MPa
  fyd:  number,   // MPa
  cara: 'inf' | 'sup',
  h:    number,   // mm
): AnchorageInfo {
  const fctd = fctm / 1.5;
  const position: 'I' | 'II' = cara === 'inf' || h <= 300 ? 'I' : 'II';
  const eta1 = position === 'I' ? 1.0 : 0.7;
  const eta2 = 1.0;   // Ø ≤ 32 mm
  const fbd = 2.25 * eta1 * eta2 * fctd;
  const lb_rqd = (phi / 4) * (fyd / fbd);
  const lb_min = Math.max(0.3 * lb_rqd, 10 * phi, 100);
  return { phi, lb_rqd, lb_min, position };
}

export interface ForjadosSectionResult {
  valid:     boolean;
  error?:    string;
  // Geometry
  b:         number;  // width used for flexión (b_eff reticular vano / b_w reticular apoyo / 1000 maciza)
  d:         number;  // effective depth (mm)
  As:        number;  // tension steel (mm²), aggregate = AsBase + AsRef
  AsBase:    number;  // base bundle tension area (mm²)
  AsRef:     number;  // refuerzo bundle tension area (mm²)
  AsComp:    number;  // compression steel (mm²)
  // Bending
  x:         number;
  MRd:       number;
  branch:    'rect-bEff' | 'rect-bw' | 't-real' | 'rect';
  // Fisuración
  wk:        number;
  wkLim:     number;
  checks:    CheckRow[];
}

export interface ForjadosResult {
  valid:     boolean;
  error?:    string;
  variant:   'reticular' | 'maciza';
  bEff:      number;   // mm — only meaningful for reticular vano (0 for maciza)
  L0:        number;   // mm — only meaningful for reticular (0 for maciza)
  vano:      ForjadosSectionResult;
  apoyo:     ForjadosSectionResult;
  // Shear (single VEd, computed once per variant with the governing section depth)
  VRdc:      number;
  VRds:      number;
  VRd:       number;
  VRdmax:    number;
  shearChecks: CheckRow[];
  infoChecks:  CheckRow[];  // non-blocking: armadura reparto (maciza), biaxial note, etc.
}

const PSI2_MAP: Record<string, number> = {
  residential: 0.3,
  office: 0.3,
  parking: 0.6,
  roof: 0.0,
  custom: 0.0,
};

function invalidSection(error: string): ForjadosSectionResult {
  return {
    valid: false, error,
    b: 0, d: 0, As: 0, AsBase: 0, AsRef: 0, AsComp: 0,
    x: 0, MRd: 0, branch: 'rect',
    wk: 0, wkLim: 0, checks: [],
  };
}

interface SectionCalcInputs {
  // geometry branch
  variant: 'reticular' | 'maciza';
  zone:    'vano' | 'apoyo';
  b:       number;   // width used for flexión (b_eff / b_w / 1000)
  d:       number;
  h:       number;   // total depth, used for As,min on full b·h
  cover:   number;
  bEff:    number;   // only for reticular vano T-section; else === b
  bWeb:    number;
  hFlange: number;
  // materials
  fck: number; fyk: number;
  // steel
  As: number; AsBase: number; AsRef: number; AsComp: number;
  barDiamTens: number; nBarsTens: number;
  // SLS for wk
  Ms: number;
  exposureClass: string;
  // maciza-only: main bar spacing (for spacing check)
  macSpacing: number;  // mm, 0 if reticular
}

function calcSection(inp: SectionCalcInputs): ForjadosSectionResult {
  const mat = getConcrete(inp.fck);
  const fcd = mat.fcd;
  const fyd = getFyd(inp.fyk);
  const checks: CheckRow[] = [];

  // BENDING ──────────────────────────────────────────────────────────────
  let x: number;
  let MRd: number;
  let branch: ForjadosSectionResult['branch'];

  if (inp.variant === 'reticular' && inp.zone === 'vano') {
    const sol = solveTSection(inp.bEff, inp.bWeb, inp.hFlange, inp.d, inp.As, fcd, fyd);
    x = sol.x; MRd = sol.MRd; branch = sol.branch;
  } else {
    // reticular apoyo → rectangular on b_w (nervio comprimido)
    // maciza ambos   → rectangular 1000 × d
    const sol = solveRectangular(inp.b, inp.d, inp.As, fcd, fyd);
    x = sol.x; MRd = sol.MRd;
    branch = inp.variant === 'reticular' ? 'rect-bw' : 'rect';
  }

  // Demand: caller injects via Md — we just render MRd vs 0 as placeholder
  // Actual Md check is aggregated by caller (needs access to input Md).
  // We push MRd row for PDF; caller will set utilization.
  // (Implementation: we push the flexión check from caller side via appendFlexionCheck.)

  // Over-reinforcement limit
  const ecu3 = 0.0035;
  const eyd = fyd / Es;
  const xLimit = (ecu3 / (ecu3 + eyd)) * inp.d;
  if (x > xLimit) {
    checks.push({
      id: 'bending-over',
      description: 'Sección sobrearmada (x > x,lim)',
      value: `x = ${x.toFixed(0)} mm`,
      limit: `x,lim = ${xLimit.toFixed(0)} mm`,
      utilization: x / xLimit,
      status: 'warn',
      article: 'CE art. 42',
    });
  }

  // MIN REINFORCEMENT tension (CE art. 42.3.2 / 42.3.5) ──────────────────
  // Use b (flexión width) × h — for reticular vano this is b_eff; for apoyo it is b_w;
  // for maciza 1000. This matches CE Tabla 42.3.5 (sección que resiste).
  const bRef = inp.variant === 'reticular' && inp.zone === 'vano' ? inp.bWeb : inp.b;
  const AsMinGeom = 0.0028 * bRef * inp.h;
  const AsMinMec  = (0.04 * bRef * inp.h * fcd) / fyd;
  const AsMin     = Math.max(AsMinGeom, AsMinMec);

  checks.push(check(
    'as-min',
    'Armadura mínima tracción',
    AsMin, inp.As,
    `As,min = ${AsMin.toFixed(0)} mm²`,
    `As = ${inp.As.toFixed(0)} mm²`,
    'CE art. 42.3.2',
  ));

  // MAX REINFORCEMENT total (CE art. 42.3) ──────────────────────────────
  const AsTotal = inp.As + inp.AsComp;
  const AsMax = 0.04 * bRef * inp.h;
  checks.push(check(
    'as-max',
    'Armadura máxima total',
    AsTotal, AsMax,
    `As,tot = ${AsTotal.toFixed(0)} mm²`,
    `As,max = ${AsMax.toFixed(0)} mm²`,
    'CE art. 42.3',
  ));

  // BAR SPACING (CE art. 69.4) ──────────────────────────────────────────
  if (inp.variant === 'reticular') {
    if (inp.nBarsTens > 1) {
      const available = inp.bWeb - 2 * inp.cover - inp.nBarsTens * inp.barDiamTens;
      if (available <= 0) {
        checks.push({
          id: 'bar-spacing-impossible',
          description: 'Barras no caben en el nervio',
          value: `Espacio: ${available.toFixed(0)} mm`,
          limit: '> 0 mm',
          utilization: Infinity, status: 'fail',
          article: 'CE art. 69.4',
        });
      } else {
        const spacing = available / (inp.nBarsTens - 1);
        const minLimit = Math.max(inp.barDiamTens, 20);
        const maxLimit = Math.min(300, 3 * inp.h);
        let status: CheckStatus;
        let util: number;
        if (spacing < minLimit) { status = 'fail'; util = minLimit / spacing; }
        else if (spacing > maxLimit) { status = 'fail'; util = spacing / maxLimit; }
        else { util = spacing / maxLimit; status = toStatus(util); }
        checks.push({
          id: 'bar-spacing',
          description: 'Separación entre barras (nervio)',
          value: `s = ${spacing.toFixed(0)} mm`,
          limit: `${minLimit}–${maxLimit} mm`,
          utilization: util, status, article: 'CE art. 69.4',
        });
      }
    }
  } else {
    // maciza: check spacing between main bars ≤ min(3·h, 400)
    const sMax = Math.min(3 * inp.h, 400);
    checks.push(check(
      'bar-spacing-maciza',
      'Separación máxima entre barras',
      inp.macSpacing, sMax,
      `s = ${inp.macSpacing.toFixed(0)} mm`,
      `s,max = ${sMax.toFixed(0)} mm`,
      'CE art. 69.4',
    ));
  }

  // FISURACIÓN (CE art. 49.2.4) — only when exposureClass ≠ XC1 ──────────
  let wk = 0;
  const wkLim = wkMax[inp.exposureClass] ?? 0.3;
  if (inp.exposureClass !== 'XC1' && inp.Ms > 0) {
    const Ecm_MPa = mat.Ecm * 1000;
    const n = Es / Ecm_MPa;
    // For wk we use bEff (reticular vano) or b (others) as the compression width
    const bWk = inp.variant === 'reticular' && inp.zone === 'vano' ? inp.bEff : inp.b;
    const A_coef = 0.5 * bWk;
    const B_coef = n * inp.As;
    const C_coef = -n * inp.As * inp.d;
    const xCr = (-B_coef + Math.sqrt(B_coef ** 2 - 4 * A_coef * C_coef)) / (2 * A_coef);
    const Icr = (bWk * xCr ** 3) / 3 + n * inp.As * (inp.d - xCr) ** 2;
    const sigmaS = (inp.Ms * 1e6 * (inp.d - xCr) * n) / Icr;
    // Effective tension area — use b_w for reticular (nervio), b for maciza
    const bEffTension = inp.variant === 'reticular' ? inp.bWeb : inp.b;
    const hMinusD = inp.h - inp.d;
    const AcEff = Math.min(
      2.5 * hMinusD * bEffTension,
      ((inp.h - xCr) / 3) * bEffTension,
      (inp.h / 2) * bEffTension,
    );
    const rhoEff = inp.As / AcEff;
    const srMax = 3.4 * inp.cover + 0.425 * 0.8 * 0.5 * (inp.barDiamTens / rhoEff);
    const kt = 0.4;
    const esmEcm1 = (sigmaS - kt * (mat.fctm / rhoEff) * (1 + n * rhoEff)) / Es;
    const esmEcm2 = (0.6 * sigmaS) / Es;
    wk = srMax * Math.max(esmEcm1, esmEcm2, 0);

    checks.push(check(
      'cracking',
      `Ancho de fisura wk ≤ wmax (${inp.exposureClass})`,
      wk, wkLim,
      `wk = ${wk.toFixed(3)} mm`,
      `wmax = ${wkLim.toFixed(2)} mm`,
      'CE art. 49.2.4',
    ));
  }

  return {
    valid: true,
    b: inp.b, d: inp.d,
    As: inp.As, AsBase: inp.AsBase, AsRef: inp.AsRef, AsComp: inp.AsComp,
    x, MRd, branch, wk, wkLim, checks,
  };
}

function globalInvalid(error: string, variant: 'reticular' | 'maciza'): ForjadosResult {
  const sec = invalidSection(error);
  return {
    valid: false, error, variant, bEff: 0, L0: 0,
    vano: sec, apoyo: sec,
    VRdc: 0, VRds: 0, VRd: 0, VRdmax: 0,
    shearChecks: [], infoChecks: [],
  };
}

export function calcForjados(inp: ForjadosInputs): ForjadosResult {
  // ── Input validation ─────────────────────────────────────────────────
  const variant = inp.variant as 'reticular' | 'maciza';
  if ((inp.h as number) <= 0) return globalInvalid('Canto h debe ser > 0 mm', variant);
  if ((inp.cover as number) <= 0) return globalInvalid('Recubrimiento debe ser > 0 mm', variant);
  if ((inp.fck as number) < 12 || (inp.fck as number) > 90)
    return globalInvalid('fck fuera de rango (12–90 MPa)', variant);
  if (!(inp.exposureClass in wkMax))
    return globalInvalid(`Clase de exposición inválida: ${inp.exposureClass}`, variant);

  if (variant === 'reticular') {
    if ((inp.bWeb as number) <= 0) return globalInvalid('b_w debe ser > 0 mm', variant);
    if ((inp.intereje as number) <= 0) return globalInvalid('Intereje debe ser > 0 mm', variant);
    if ((inp.hFlange as number) <= 0) return globalInvalid('Capa de compresión h_f debe ser > 0 mm', variant);
    if ((inp.spanLength as number) <= 0) return globalInvalid('Luz L debe ser > 0 mm', variant);
    // Base es obligatoria (montaje continuo); refuerzos pueden ser 0.
    if ((inp.base_inf_nBars as number) <= 0) return globalInvalid('Barras montaje inferior > 0', variant);
    if ((inp.base_sup_nBars as number) <= 0) return globalInvalid('Barras montaje superior > 0', variant);
  } else {
    // Parrilla base obligatoria en ambas caras; refuerzos pueden ser 0.
    if ((inp.base_inf_phi_mac as number) <= 0) return globalInvalid('Ø parrilla inferior > 0 mm', variant);
    if ((inp.base_inf_s_mac   as number) <= 0) return globalInvalid('Separación parrilla inferior > 0 mm', variant);
    if ((inp.base_sup_phi_mac as number) <= 0) return globalInvalid('Ø parrilla superior > 0 mm', variant);
    if ((inp.base_sup_s_mac   as number) <= 0) return globalInvalid('Separación parrilla superior > 0 mm', variant);
  }

  const h       = inp.h as number;
  const cover   = inp.cover as number;
  const fck     = inp.fck as number;
  const fyk     = inp.fyk as number;
  const exposureClass = inp.exposureClass as string;

  // SLS Ms per zone (for wk when XC2+)
  const psi2 = inp.loadType === 'custom' ? (inp.psi2Custom as number) : (PSI2_MAP[inp.loadType as string] ?? 0.3);
  const vanoMs  = (inp.vano_M_G  as number) + psi2 * (inp.vano_M_Q  as number);
  const apoyoMs = (inp.apoyo_M_G as number) + psi2 * (inp.apoyo_M_Q as number);

  // Material
  const mat = getConcrete(fck);
  const fcd = mat.fcd;
  const fyd = getFyd(fyk);

  // ── Reticular vs maciza geometry + As ─────────────────────────────────
  let bEff = 0;
  let L0 = 0;
  let bFlexVano:  number;
  let bFlexApoyo: number;
  let bWeb:       number;
  let hFlange:    number;
  let dVano:      number;
  let dApoyo:     number;
  let AsVano:      number;
  let AsVanoBase:  number;
  let AsVanoRef:   number;
  let AsVanoComp:  number;
  let AsApoyo:     number;
  let AsApoyoBase: number;
  let AsApoyoRef:  number;
  let AsApoyoComp: number;
  let barDiamVano:  number;
  let nBarsVano:    number;
  let barDiamApoyo: number;
  let nBarsApoyo:   number;
  let macSpacingVano  = 0;
  let macSpacingApoyo = 0;

  // Active bar bundles tracked for anchorage checks (only bundles with area > 0).
  interface BarBundle {
    id:   'base-inf' | 'base-sup' | 'refuerzo-vano-inf' | 'refuerzo-apoyo-sup';
    label: string;          // e.g. "Montaje inferior 2Ø12"
    phi:   number;          // max Ø of the bundle (driver of lb_rqd)
    cara:  'inf' | 'sup';
    zone:  'vano' | 'apoyo'; // which section's checks list to append
  }
  const bundlesVano:  BarBundle[] = [];
  const bundlesApoyo: BarBundle[] = [];

  if (variant === 'reticular') {
    bWeb    = inp.bWeb as number;
    hFlange = inp.hFlange as number;
    const intereje   = inp.intereje as number;
    const spanLength = inp.spanLength as number;
    const l0Factor   = getL0Factor(inp.tipoVano as 'biapoyado' | 'continuo-extremo' | 'continuo-interior' | 'voladizo');
    L0   = l0Factor * spanLength;
    bEff = computeBEff(intereje, spanLength, l0Factor, bWeb);

    // vano: T-section (b_eff for rect branch, b_w for web)
    // apoyo: rectangular on b_w
    bFlexVano  = bEff;
    bFlexApoyo = bWeb;

    // Base reticular — montaje continuo del nervio (sup + inf).
    const nBaseInf   = inp.base_inf_nBars   as number;
    const phiBaseInf = inp.base_inf_barDiam as number;
    const nBaseSup   = inp.base_sup_nBars   as number;
    const phiBaseSup = inp.base_sup_barDiam as number;
    const AsBaseInf  = nBaseInf * getBarArea(phiBaseInf);
    const AsBaseSup  = nBaseSup * getBarArea(phiBaseSup);

    // Refuerzos zonales — adicionales a la base en cara traccionada.
    const nRefV   = inp.refuerzo_vano_inf_nBars    as number;
    const phiRefV = inp.refuerzo_vano_inf_barDiam  as number;
    const nRefA   = inp.refuerzo_apoyo_sup_nBars   as number;
    const phiRefA = inp.refuerzo_apoyo_sup_barDiam as number;
    const AsRefV  = nRefV * getBarArea(phiRefV);
    const AsRefA  = nRefA * getBarArea(phiRefA);

    // Vano (M+): tracción en cara inferior = base_inf + refuerzo_vano_inf; comp = base_sup.
    AsVanoBase  = AsBaseInf;
    AsVanoRef   = AsRefV;
    AsVano      = AsBaseInf + AsRefV;
    AsVanoComp  = AsBaseSup;
    // Apoyo (M−): tracción en cara superior = base_sup + refuerzo_apoyo_sup; comp = base_inf.
    AsApoyoBase = AsBaseSup;
    AsApoyoRef  = AsRefA;
    AsApoyo     = AsBaseSup + AsRefA;
    AsApoyoComp = AsBaseInf;

    // d uses the max Ø of the tension face (conservative — centroid hugs the larger bar).
    const phiTensVano  = nRefV > 0 ? Math.max(phiBaseInf, phiRefV) : phiBaseInf;
    const phiTensApoyo = nRefA > 0 ? Math.max(phiBaseSup, phiRefA) : phiBaseSup;
    barDiamVano  = phiTensVano;
    nBarsVano    = nBaseInf + nRefV;
    barDiamApoyo = phiTensApoyo;
    nBarsApoyo   = nBaseSup + nRefA;

    const stirrupV = inp.stirrupsEnabled ? (inp.vano_stirrupDiam  as number) : 0;
    const stirrupA = inp.stirrupsEnabled ? (inp.apoyo_stirrupDiam as number) : 0;
    dVano  = h - cover - stirrupV - phiTensVano  / 2;
    dApoyo = h - cover - stirrupA - phiTensApoyo / 2;

    // Bundles for anchorage — skip bundles with zero area.
    if (AsBaseInf > 0) bundlesVano.push({
      id: 'base-inf', label: `Montaje inferior ${nBaseInf}Ø${phiBaseInf}`,
      phi: phiBaseInf, cara: 'inf', zone: 'vano',
    });
    if (AsRefV > 0) bundlesVano.push({
      id: 'refuerzo-vano-inf', label: `Refuerzo vano inferior ${nRefV}Ø${phiRefV}`,
      phi: phiRefV, cara: 'inf', zone: 'vano',
    });
    if (AsBaseSup > 0) bundlesApoyo.push({
      id: 'base-sup', label: `Montaje superior ${nBaseSup}Ø${phiBaseSup}`,
      phi: phiBaseSup, cara: 'sup', zone: 'apoyo',
    });
    if (AsRefA > 0) bundlesApoyo.push({
      id: 'refuerzo-apoyo-sup', label: `Refuerzo apoyo superior ${nRefA}Ø${phiRefA}`,
      phi: phiRefA, cara: 'sup', zone: 'apoyo',
    });
  } else {
    // Losa maciza — franja 1000 mm.
    bWeb       = 1000;
    hFlange    = 0;
    bFlexVano  = 1000;
    bFlexApoyo = 1000;

    // Parrilla base Ø/s → As = (π·Ø²/4) · (1000 / s) por metro.
    const phiBI = inp.base_inf_phi_mac as number;
    const sBI   = inp.base_inf_s_mac   as number;
    const phiBS = inp.base_sup_phi_mac as number;
    const sBS   = inp.base_sup_s_mac   as number;
    const AsBaseInf = getBarArea(phiBI) * (1000 / sBI);
    const AsBaseSup = getBarArea(phiBS) * (1000 / sBS);

    // Refuerzos zonales — parrillas extra superpuestas (phi=0 ó s=0 ⇒ sin refuerzo).
    const phiRV = inp.refuerzo_vano_inf_phi_mac   as number;
    const sRV   = inp.refuerzo_vano_inf_s_mac     as number;
    const phiRA = inp.refuerzo_apoyo_sup_phi_mac  as number;
    const sRA   = inp.refuerzo_apoyo_sup_s_mac    as number;
    const AsRefV = phiRV > 0 && sRV > 0 ? getBarArea(phiRV) * (1000 / sRV) : 0;
    const AsRefA = phiRA > 0 && sRA > 0 ? getBarArea(phiRA) * (1000 / sRA) : 0;

    AsVanoBase  = AsBaseInf;
    AsVanoRef   = AsRefV;
    AsVano      = AsBaseInf + AsRefV;
    AsApoyoBase = AsBaseSup;
    AsApoyoRef  = AsRefA;
    AsApoyo     = AsBaseSup + AsRefA;
    AsVanoComp  = 0;
    AsApoyoComp = 0;

    const phiTensVano  = AsRefV > 0 ? Math.max(phiBI, phiRV) : phiBI;
    const phiTensApoyo = AsRefA > 0 ? Math.max(phiBS, phiRA) : phiBS;
    barDiamVano  = phiTensVano;  nBarsVano  = Math.floor(1000 / sBI);
    barDiamApoyo = phiTensApoyo; nBarsApoyo = Math.floor(1000 / sBS);
    // Spacing check uses base grid spacing (governs — parrilla base is continuous).
    macSpacingVano  = sBI;
    macSpacingApoyo = sBS;

    const stirrupV = inp.stirrupsEnabled ? (inp.vano_stirrupDiam  as number) : 0;
    const stirrupA = inp.stirrupsEnabled ? (inp.apoyo_stirrupDiam as number) : 0;
    dVano  = h - cover - stirrupV - phiTensVano  / 2;
    dApoyo = h - cover - stirrupA - phiTensApoyo / 2;

    if (AsBaseInf > 0) bundlesVano.push({
      id: 'base-inf', label: `Parrilla inferior Ø${phiBI}/${sBI}`,
      phi: phiBI, cara: 'inf', zone: 'vano',
    });
    if (AsRefV > 0) bundlesVano.push({
      id: 'refuerzo-vano-inf', label: `Refuerzo vano inferior Ø${phiRV}/${sRV}`,
      phi: phiRV, cara: 'inf', zone: 'vano',
    });
    if (AsBaseSup > 0) bundlesApoyo.push({
      id: 'base-sup', label: `Parrilla superior Ø${phiBS}/${sBS}`,
      phi: phiBS, cara: 'sup', zone: 'apoyo',
    });
    if (AsRefA > 0) bundlesApoyo.push({
      id: 'refuerzo-apoyo-sup', label: `Refuerzo apoyo superior Ø${phiRA}/${sRA}`,
      phi: phiRA, cara: 'sup', zone: 'apoyo',
    });
  }

  if (dVano  <= 0) return globalInvalid('Canto útil vano ≤ 0 — revise h, recubrimiento, Ø', variant);
  if (dApoyo <= 0) return globalInvalid('Canto útil apoyo ≤ 0', variant);

  // ── Section calcs ─────────────────────────────────────────────────────
  const vano = calcSection({
    variant, zone: 'vano',
    b: bFlexVano, d: dVano, h, cover,
    bEff: variant === 'reticular' ? bEff : bFlexVano,
    bWeb, hFlange,
    fck, fyk,
    As: AsVano, AsBase: AsVanoBase, AsRef: AsVanoRef, AsComp: AsVanoComp,
    barDiamTens: barDiamVano, nBarsTens: nBarsVano,
    Ms: vanoMs, exposureClass,
    macSpacing: macSpacingVano,
  });
  const apoyo = calcSection({
    variant, zone: 'apoyo',
    b: bFlexApoyo, d: dApoyo, h, cover,
    bEff: bFlexApoyo,
    bWeb, hFlange,
    fck, fyk,
    As: AsApoyo, AsBase: AsApoyoBase, AsRef: AsApoyoRef, AsComp: AsApoyoComp,
    barDiamTens: barDiamApoyo, nBarsTens: nBarsApoyo,
    Ms: apoyoMs, exposureClass,
    macSpacing: macSpacingApoyo,
  });

  // ── Flexión check rows (prepend to each section's checks) ─────────────
  vano.checks.unshift(check(
    'bending',
    variant === 'reticular' ? 'Momento vano MRd ≥ Md (sección T)' : 'Momento vano MRd ≥ Md',
    inp.vano_Md as number, vano.MRd,
    `Md = ${(inp.vano_Md as number).toFixed(1)} kNm`,
    `MRd = ${vano.MRd.toFixed(1)} kNm`,
    'CE art. 42',
  ));
  apoyo.checks.unshift(check(
    'bending',
    variant === 'reticular' ? 'Momento apoyo MRd ≥ |M-| (b_w)' : 'Momento apoyo MRd ≥ |M-|',
    inp.apoyo_Md as number, apoyo.MRd,
    `|M-| = ${(inp.apoyo_Md as number).toFixed(1)} kNm`,
    `MRd = ${apoyo.MRd.toFixed(1)} kNm`,
    'CE art. 42',
  ));

  // ── Anchorage (CE art. 69.5.1.1) — info per bar bundle ────────────────
  // Report lb_rqd and lb_min for each non-empty bundle (base + refuerzo) in
  // each zone. Status is always 'ok' / utilization 0 (non-blocking info).
  const appendAnchorage = (sec: ForjadosSectionResult, bundles: BarBundle[]) => {
    for (const b of bundles) {
      const a = computeAnchorage(b.phi, mat.fctm, fyd, b.cara, h);
      sec.checks.push({
        id: `anchorage-${b.id}`,
        description: `Anclaje ${b.label} — Pos. ${a.position}`,
        value: `lb,rqd = ${a.lb_rqd.toFixed(0)} mm`,
        limit: `lb,min = ${a.lb_min.toFixed(0)} mm`,
        utilization: 0,
        status: 'ok',
        article: 'CE art. 69.5.1.1',
      });
    }
  };
  appendAnchorage(vano,  bundlesVano);
  appendAnchorage(apoyo, bundlesApoyo);

  // ── Shear (CE art. 44) — single VEd, governing section depth ──────────
  // Use the smaller d (more conservative), and b = b_w (reticular) or 1000 (maciza).
  const dShear = Math.min(dVano, dApoyo);
  const bShear = variant === 'reticular' ? bWeb : 1000;
  const AsShear = Math.min(AsVano, AsApoyo);  // conservative: lower rhoL
  const k = Math.min(1 + Math.sqrt(200 / dShear), 2.0);
  const rhoL = Math.min(AsShear / (bShear * dShear), 0.02);
  const VRdc1 = ((0.18 / GAMMA_C) * k * Math.pow(rhoL * fck, 1 / 3) * bShear * dShear) / 1000;
  const VRdc2 = ((0.051 / GAMMA_C) * Math.pow(k, 1.5) * Math.sqrt(fck) * bShear * dShear) / 1000;
  const VRdc = Math.max(VRdc1, VRdc2);

  const shearChecks: CheckRow[] = [];
  const VEd = inp.VEd as number;
  let VRds = 0;
  let VRdmax = 0;
  let VRd = VRdc;

  if (inp.stirrupsEnabled) {
    // Use apoyo stirrup config (where cortante typically governs)
    const stirrupDiam    = inp.apoyo_stirrupDiam as number;
    const stirrupLegs    = inp.apoyo_stirrupLegs as number;
    const stirrupSpacing = inp.apoyo_stirrupSpacing as number;
    const Asw_total = stirrupLegs * getBarArea(stirrupDiam);
    const Asw = stirrupSpacing > 0 ? Asw_total / stirrupSpacing : 0;
    const z = 0.9 * dShear;
    const cotTheta = 2.5;
    VRds   = (Asw * z * fyd * cotTheta) / 1000;
    VRdmax = (0.3 * (1 - fck / 250) * fcd * bShear * z) / 1000;
    VRd    = Math.min(VRds, VRdmax);

    shearChecks.push(check(
      'shear',
      'Cortante VEd ≤ VRd (con cercos)',
      VEd, VRd,
      `VEd = ${VEd.toFixed(1)} kN`,
      `VRd = ${VRd.toFixed(1)} kN`,
      'CE art. 44',
    ));
    shearChecks.push(check(
      'shear-max',
      'Aplastamiento biela VEd ≤ VRd,max',
      VEd, VRdmax,
      `VEd = ${VEd.toFixed(1)} kN`,
      `VRd,max = ${VRdmax.toFixed(1)} kN`,
      'CE art. 44',
    ));

    // ρw,min
    const rhoWMin = (0.072 * Math.sqrt(fck)) / fyk;
    const rhoW = Asw_total / (stirrupSpacing * bShear);
    const rhoWUtil = rhoWMin / rhoW;
    let rhoWStatus: CheckStatus;
    if (rhoWUtil >= 1.0) rhoWStatus = 'fail';
    else if (stirrupSpacing > 0.75 * dShear) rhoWStatus = 'warn';
    else rhoWStatus = 'ok';
    shearChecks.push({
      id: 'rho-w-min',
      description: 'Cuantía mínima armadura transversal',
      value: `ρw = ${rhoW.toFixed(5)}`,
      limit: `ρw,min = ${rhoWMin.toFixed(5)}`,
      utilization: rhoWUtil, status: rhoWStatus,
      article: 'CE art. 44.2.3.2.2',
    });

    // Max stirrup spacing
    const sMax = Math.min(0.75 * dShear, 300);
    shearChecks.push(check(
      'stirrup-spacing-max',
      'Separación máxima entre cercos',
      stirrupSpacing, sMax,
      `s = ${stirrupSpacing.toFixed(0)} mm`,
      `s,max = ${sMax.toFixed(0)} mm`,
      'CE art. 44.2.3.4',
    ));
  } else {
    shearChecks.push(check(
      'shear',
      'Cortante VEd ≤ VRd,c (sin cercos)',
      VEd, VRdc,
      `VEd = ${VEd.toFixed(1)} kN`,
      `VRd,c = ${VRdc.toFixed(1)} kN`,
      'CE art. 44.2',
    ));
  }

  // ── Info-only checks (non-blocking) ───────────────────────────────────
  const infoChecks: CheckRow[] = [];
  if (variant === 'maciza') {
    // Armadura de reparto (CE art. 42.3.6) ≥ 20% armadura principal
    const AsMainPerM = AsVano; // mm²/m
    const AsRepMin = 0.2 * AsMainPerM;
    infoChecks.push({
      id: 'armadura-reparto',
      description: 'Armadura de reparto (≥ 20% principal) — verificar en plano',
      value: `—`,
      limit: `As,rep,min ≈ ${AsRepMin.toFixed(0)} mm²/m`,
      utilization: 0, status: 'ok',
      article: 'CE art. 42.3.6',
    });
  }
  if (variant === 'reticular') {
    infoChecks.push({
      id: 'biaxial-note',
      description: 'Verifica una dirección — bidireccional requiere 2 ejecuciones',
      value: `—`,
      limit: `Info`,
      utilization: 0, status: 'ok',
      article: 'v1',
    });
  }

  return {
    valid: true, variant, bEff, L0,
    vano, apoyo,
    VRdc, VRds, VRd, VRdmax,
    shearChecks, infoChecks,
  };
}
