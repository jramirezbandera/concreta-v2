// Punzonamiento — modo "pilar metálico con crucetas UPN".
//
// A steel column lands on a concrete footing (zapata) through a welded END PLATE.
// Four UPN channel arms ("crucetas") welded to the plate edges spread the axil N
// over a larger area so the concrete does not punch through.
//
// v1 scope: INTERIOR position + ZAPATA substrate, HEB/HEA/IPE columns only.
//
// Model (see design doc Javier-main-design-20260606-162704):
//   • Single bearing pressure f_jd = βj·α·fcd (EC3/CE Anejo 18 §6.2.5, α=1 in v1),
//     reused from ./ec3BasePlate — same constant as anchorPlate.ts.
//   • Each arm is an effective rigid spreader over L_eff only. L_eff,max is the
//     length at which uniform f_jd over the arm exhausts its plastic moment:
//       M_Rd = f_jd·b_eff·L_eff,max²/2  →  L_eff,max = √(2·M_Rd/(f_jd·b_eff)).
//     Using L_eff (not the geometric arm length) makes "uniform f_jd" conservative
//     for both punching and arm bending at once.
//   • b_eff = min(b_UPN, t_w + 2·c_f) with c_f the EC3 flange effective overhang.
//   • Failure surfaces (all → CheckRow): bearing capacity V_cap, global punching
//     u1, local core u_core, per-arm tip u_tip, plate crushing u0 (vRd,max), UPN
//     bending, UPN shear, UPN class, fillet weld.
//   • If the chosen UPN fails, the smallest UPN that would pass is suggested
//     (the user's choice is NOT auto-changed — eng-review Code-Quality decision).
//
// All units: mm, MPa, kN unless noted.

import {
  type PunchingInputs,
  type CrucetaSteel,
  type CrucetaSubstrate,
  type PunchingPosition,
} from '../../data/defaults';
import { getConcrete } from '../../data/materials';
import { getUPN, getSizesUPN, type UPNProfile } from '../../data/steelProfiles';
import { type CheckRow, makeCheck, makeCheckNeutral } from './types';
import { fjd as ec3Fjd, effectiveOverhang, concentrationKj } from './ec3BasePlate';
import { type PunchingResult, type CrucetaDetail, betaForPosition, sidesForPosition } from './punching';

// Re-export so existing importers (and tests) keep resolving from cruceta.
export { sidesForPosition } from './punching';

const GAMMA_M0 = 1.05;
const GAMMA_M2 = 1.25;

// Steel strengths by grade (EN 10025).
const STEEL_FY: Record<CrucetaSteel, number> = { S275: 275, S355: 355 };
const STEEL_FU: Record<CrucetaSteel, number> = { S275: 430, S355: 490 };
// EC3-1-8 Tab 4.1 weld correlation factor βw.
const BETA_W: Record<CrucetaSteel, number> = { S275: 0.85, S355: 0.90 };

// ─── Cross control perimeters (closed-form, position-aware) ───────────────────
export interface CrossPerimeters {
  u0:    number;   // mm — plate-face perimeter (crushing)
  u1:    number;   // mm — enlarged cross control perimeter at 2d
  uCore: number;   // mm — bare-plate control perimeter at 2d
  uTip:  number;   // mm — per-arm tip control perimeter at 2d
  Acruz: number;   // mm² — cross contact area (plate + arms), used for relief
}

/**
 * Plate straight perimeter facing the slab, by position. A free edge drops the
 * plate edge facing it (and its arm). Convention (mirrors punching.ts):
 *   plateA ∥ free edge, plateB ⊥ free edge (toward the slab interior).
 *   • interior: all 4 edges       → 2(A+B)
 *   • borde:    drop one A-edge    → A + 2B
 *   • esquina:  drop one A + one B → A + B
 * Dropping edges shortens every perimeter → higher vEd → conservative (safe).
 */
function plateStraightPerim(plateA: number, plateB: number, position: PunchingPosition): number {
  if (position === 'borde')   return plateA + 2 * plateB;
  if (position === 'esquina') return plateA + plateB;
  return 2 * (plateA + plateB); // interior
}

/** Fraction of the full 2d round-off present, by position (mirrors punching.ts
 *  arc reduction: interior 4πd, borde 2πd, esquina πd → 1, ½, ¼ of 2π·(2d)). */
function arcFraction(position: PunchingPosition): number {
  if (position === 'borde')   return 0.5;
  if (position === 'esquina') return 0.25;
  return 1; // interior
}

/**
 * Closed-form control perimeters for a cruciform (eng-review 2A; v2 extends to
 * borde/esquina — Crucetas V2 #1).
 *
 * The exact Minkowski 2d-offset of the plus-shaped outline has an arc term that
 * ranges from 2π·(2d) (notches fully fused — typical, large 2d) up to 10π·(2d)
 * (notches fully open — long arms / small 2d). We use the LOWER bound 2π·(2d)
 * for interior, scaled by arcFraction at a free edge: it is EXACT in the fused
 * regime and CONSERVATIVE (shorter u1 → higher vEd) in the open regime. The
 * straight part plateStraight + 2·nArms·Leff is exact in both regimes.
 *
 *   u1    = plateStraight + 2·nArms·Leff + 2π·(2d)·arcFrac
 *   u0    = plateStraight                              (plate face, no offset)
 *   uCore = plateStraight + 2π·(2d)·arcFrac            (bare plate at 2d)
 *   uTip  = 2·Leff + bEff + π·(2d)        (one arm strip: 2 sides + end + round)
 *
 * ⚠️ NOT PRODUCTION for borde/esquina (reverted 2026-06-07 eng-review, Codex):
 * dropping an arm shortens u1, BUT this form does NOT truncate the 2d offset of
 * the REMAINING arms (or uTip) at the free edge, and there is no edge-distance
 * input — so for a real edge column (free edge within 2d of a parallel arm) it
 * OVERSTATES u1/uTip and UNDERSTATES vEd (unsafe). calcCruceta therefore rejects
 * non-interior. The borde/esquina branches are kept here only as the seed for the
 * future edge model (TODOS "Crucetas V2.next — borde/esquina con distancia al
 * borde + perímetros truncados"). Interior is exact/unaffected.
 */
export function crossControlPerimeter(
  plateA: number, plateB: number, bEff: number, Leff: number,
  d: number, nArms: number, position: PunchingPosition = 'interior',
): CrossPerimeters {
  const r = 2 * d;
  const straight = plateStraightPerim(plateA, plateB, position);
  const arc = 2 * Math.PI * r * arcFraction(position);
  const u0 = straight;
  const uCore = straight + arc;
  const u1 = straight + 2 * nArms * Leff + arc;
  const uTip = 2 * Leff + bEff + Math.PI * r;
  const Acruz = plateA * plateB + nArms * bEff * Leff;
  return { u0, u1, uCore, uTip, Acruz };
}

// ─── UPN section classification (EC3 §5.5 Tabla 5.2, simplified) ───────────────
/** Class of a UPN channel in major-axis bending. Conservative outstand/web check. */
function classifyUPN(upn: UPNProfile, fy: number): 1 | 2 | 3 | 4 {
  const eps = Math.sqrt(235 / fy);
  // Flange: outstand part of a channel flange ≈ (b − tw). Compression outstand
  // limits: class1 9ε, class2 10ε, class3 14ε.
  const cFlange = Math.max(upn.b - upn.tw, 0);
  const flangeRatio = cFlange / upn.tf;
  const flangeClass = flangeRatio <= 9 * eps ? 1 : flangeRatio <= 10 * eps ? 2 : flangeRatio <= 14 * eps ? 3 : 4;
  // Web in bending (internal part): class1 72ε, class2 83ε, class3 124ε.
  const cWeb = Math.max(upn.h - 2 * upn.tf, 0);
  const webRatio = cWeb / upn.tw;
  const webClass = webRatio <= 72 * eps ? 1 : webRatio <= 83 * eps ? 2 : webRatio <= 124 * eps ? 3 : 4;
  return Math.max(flangeClass, webClass) as 1 | 2 | 3 | 4;
}

// ─── Per-profile evaluation ───────────────────────────────────────────────────
interface ProfileEval {
  detail: Omit<CrucetaDetail, 'suggestedUpn'>;
  checks: CheckRow[];
  vRdc: number;
  vRdmax: number;
  vEd: number;   // at u1
  vEd0: number;  // at u0
  passes: boolean;
}

interface Ctx {
  fcd: number; vRdc: number; vRdmax: number;
  fy: number; fu: number; betaW: number;
  d: number; beta: number; nArms: number;
  position: PunchingPosition;
  plateA: number; plateB: number; A_col: number;
  V_N: number;            // design load (N) after relief
  reliefApplied: boolean;
  armLength: number;      // user manual arm length (0 = auto)
  weldThroat: number;     // mm
  steelGrade: CrucetaSteel;
  // α (Kj) concentration (Crucetas V2 #6) — only for zapata with footing dims.
  useConcentration: boolean;
  substrate: CrucetaSubstrate;
  footB: number; footL: number; footH: number; // mm — footing plan + depth
}

/** Geometry derived from one bearing concentration α (closed-form, no perimeter). */
function deriveGeom(upn: UPNProfile, c: Ctx, alpha: number) {
  const fjd = ec3Fjd(c.fcd, alpha);              // MPa
  const fyd = c.fy / GAMMA_M0;                    // MPa
  const cf = effectiveOverhang(upn.tf, fyd, fjd);
  const bEff = Math.min(upn.b, upn.tw + 2 * cf);  // mm
  const upnClass = classifyUPN(upn, c.fy);
  // Wpl if class ≤ 2, else Wel (cm³ → mm³)
  const W = (upnClass <= 2 ? upn.Wpl_y : upn.Wel_y) * 1000; // mm³
  const MRd_Nmm = (W * c.fy) / GAMMA_M0;          // N·mm
  // Effective reach: M = fjd·bEff·L²/2 ≤ MRd  →  Lmax = √(2·MRd/(fjd·bEff))
  const LeffMax = Math.sqrt((2 * MRd_Nmm) / (fjd * bEff));
  const Larm = c.armLength > 0 ? c.armLength : LeffMax;
  const Leff = Math.min(Larm, LeffMax);
  const Acruz = c.plateA * c.plateB + c.nArms * bEff * Leff; // mm² — loaded area
  return { fjd, cf, bEff, upnClass, MRd_Nmm, LeffMax, Larm, Leff, Acruz };
}

/**
 * Bearing concentration α = Kj (EC3 §6.2.5(4)), Crucetas V2 #6. Only applied for
 * a zapata with footing dims (we know the spread area); for forjado we keep α=1
 * (no reliable surrounding-concrete extent → conservative). The cross footprint
 * Acruz couples to α through f_jd→b_eff→L_eff, so we iterate (design doc: |Δf_jd|
 * < 0.1% or 5 iters). The loaded area is taken as an equivalent square √Acruz.
 */
function solveAlpha(upn: UPNProfile, c: Ctx): { alpha: number; Kj: number } {
  if (!c.useConcentration || c.substrate !== 'zapata' || c.footB <= 0 || c.footL <= 0) {
    return { alpha: 1, Kj: 1 };
  }
  let alpha = 1;
  let geom = deriveGeom(upn, c, alpha);
  for (let i = 0; i < 5; i++) {
    const a0 = Math.sqrt(geom.Acruz);                  // equivalent loaded square
    const ar = Math.max(0, (c.footB - a0) / 2);
    const br = Math.max(0, (c.footL - a0) / 2);
    const { Kj } = concentrationKj(a0, a0, ar, br, c.footH);
    const next = deriveGeom(upn, c, Kj);
    const dfjd = Math.abs(next.fjd - geom.fjd) / Math.max(geom.fjd, 1e-9);
    alpha = Kj; geom = next;
    if (dfjd < 0.001) break;
  }
  return { alpha, Kj: alpha };
}

function evalProfile(upnSize: number, c: Ctx): ProfileEval | null {
  const upn = getUPN(upnSize);
  if (!upn) return null;

  const { alpha, Kj } = solveAlpha(upn, c);
  const g = deriveGeom(upn, c, alpha);
  const { fjd, cf, bEff, upnClass, MRd_Nmm, LeffMax, Larm, Leff, Acruz } = g;
  const MRd = MRd_Nmm / 1e6;                     // kN·m

  const { u0, u1, uCore, uTip } = crossControlPerimeter(
    c.plateA, c.plateB, bEff, Leff, c.d, c.nArms, c.position,
  );

  // ── Capacity vs demand ─────────────────────────────────────────────────────
  // f_jd is the bearing CAPACITY ceiling: it bounds L_eff,max (above) and V_cap.
  // The DEMAND uses the actual uniform bearing σ_act = V/A_cruz (≤ f_jd while
  // V ≤ V_cap). Using one demand pressure everywhere avoids capacity-stacking
  // (Codex #8): each surface sees its real share of V, not the full f_jd block.
  const Vcap_N = fjd * Acruz;                                 // N
  const sigAct = c.V_N / Acruz;                               // MPa, demand pressure
  const Varm_N = sigAct * bEff * Leff;                        // N, one arm's share
  const Vcore_N = sigAct * c.A_col;                           // N, plate's share

  // Demand stresses
  const vEd  = (c.beta * c.V_N) / (u1 * c.d);                 // MPa, global
  const vEd0 = (c.beta * c.V_N) / (u0 * c.d);                 // MPa, plate face
  const vEdCore = (c.beta * Vcore_N) / (uCore * c.d);         // MPa, local core
  const vEdTip  = (c.beta * Varm_N) / (uTip * c.d);           // MPa, arm tip

  // UPN bending / shear — actual demand pressure σ_act
  const MEd_Nmm = (sigAct * bEff * Leff * Leff) / 2;          // N·mm at root
  const MEd = MEd_Nmm / 1e6;                                  // kN·m
  const Av = upn.h * upn.tw;                                  // mm², web shear area
  const VplRd_N = (Av * c.fy) / (Math.sqrt(3) * GAMMA_M0);    // N
  const VEd_arm = Varm_N;                                     // N (= bearing reaction)

  // Weld (simplified, CTE DB-SE-A 8.6.2 directional resultant ≤ fvw,d)
  const lw = 2 * upn.h;                                       // mm, two runs along depth (conservative)
  const a = c.weldThroat;
  const Aw = a * lw;                                          // mm²
  const Ww = (a * lw * lw) / 6;                               // mm³, line weld bending modulus
  const tauW = VEd_arm / Math.max(Aw, 1e-6);                  // MPa
  const sigW = MEd_Nmm / Math.max(Ww, 1e-6);                  // MPa
  const weldRes = Math.sqrt(sigW * sigW + tauW * tauW);       // MPa
  const fvwd = c.fu / (Math.sqrt(3) * c.betaW * GAMMA_M2);    // MPa

  const checks: CheckRow[] = [];

  // Section class (informational)
  checks.push(makeCheckNeutral('cru-class', 'Clase de sección UPN', `CLASE ${upnClass}`, 'CE DB-SE-A 5.5'));

  // Bearing capacity of the cross
  checks.push(makeCheck(
    'cru-cap', 'N ≤ capacidad de reparto (aplastamiento)',
    c.V_N / 1000, Vcap_N / 1000,
    `${(c.V_N / 1000).toFixed(0)} kN`, `${(Vcap_N / 1000).toFixed(0)} kN`,
    'CE Anejo 18 §6.2.5',
  ));

  // Global punching at u1
  checks.push(makeCheck(
    'cru-punz', 'vEd ≤ vRd,c (punzonamiento, perímetro cruz u1)',
    vEd, c.vRdc, `${vEd.toFixed(3)} N/mm²`, `${c.vRdc.toFixed(3)} N/mm²`, 'CE art. 6.4.4',
  ));

  // Local core punching
  checks.push(makeCheck(
    'cru-core', 'vEd,core ≤ vRd,c (núcleo de la placa)',
    vEdCore, c.vRdc, `${vEdCore.toFixed(3)} N/mm²`, `${c.vRdc.toFixed(3)} N/mm²`, 'CE art. 6.4.4',
  ));

  // Per-arm tip punching
  checks.push(makeCheck(
    'cru-tip', 'vEd,tip ≤ vRd,c (extremo de brazo)',
    vEdTip, c.vRdc, `${vEdTip.toFixed(3)} N/mm²`, `${c.vRdc.toFixed(3)} N/mm²`, 'CE art. 6.4.4',
  ));

  // Plate-face crushing
  checks.push(makeCheck(
    'cru-crush', 'vEd,0 ≤ vRd,max (aplastamiento en placa, u0)',
    vEd0, c.vRdmax, `${vEd0.toFixed(3)} N/mm²`, `${c.vRdmax.toFixed(3)} N/mm²`, 'CE art. 6.4.5(3)',
  ));

  // UPN bending
  checks.push(makeCheck(
    'cru-upn-m', 'MEd ≤ M_Rd (flexión cruceta UPN)',
    MEd, MRd, `${MEd.toFixed(2)} kN·m`, `${MRd.toFixed(2)} kN·m`, 'CE DB-SE-A 6.2.6',
  ));

  // UPN shear
  checks.push(makeCheck(
    'cru-upn-v', 'VEd ≤ Vpl,Rd (cortante cruceta UPN)',
    VEd_arm / 1000, VplRd_N / 1000,
    `${(VEd_arm / 1000).toFixed(0)} kN`, `${(VplRd_N / 1000).toFixed(0)} kN`, 'CE DB-SE-A 6.2.4',
  ));

  // Weld
  checks.push(makeCheck(
    'cru-weld', 'τ_w ≤ f_vw,d (soldadura cruceta-placa, simplificado)',
    weldRes, fvwd, `${weldRes.toFixed(1)} N/mm²`, `${fvwd.toFixed(1)} N/mm²`, 'CE DB-SE-A 8.6.2',
  ));

  // Class 4 not supported → force fail
  const classOk = upnClass <= 3;
  const passes = classOk && checks.every((ch) => ch.status !== 'fail');

  const detail: Omit<CrucetaDetail, 'suggestedUpn'> = {
    upnSize, steelGrade: c.steelGrade, upnClass,
    fjd, Kj, bEff, cf, MRd, LeffMax, Leff, Larm,
    Vdesign: c.V_N / 1000, Vcap: Vcap_N / 1000, Varm: Varm_N / 1000, Vcore: Vcore_N / 1000,
    u0, u1, uCore, uTip, Au1: Acruz, nArms: c.nArms, beta: c.beta,
    position: c.position, reliefApplied: c.reliefApplied,
  };

  return { detail, checks, vRdc: c.vRdc, vRdmax: c.vRdmax, vEd, vEd0, passes };
}

// ─── Public entry ─────────────────────────────────────────────────────────────
function invalid(msg: string): PunchingResult {
  return {
    valid: false, error: msg, beta: 0, u0: 0, u1: 0, k: 0, rhoL: 0, rhoLMin: 0,
    rhoLClamped: false, vMin: 0, vRdc: 0, vRdmax: 0, vEd: 0, vEd0: 0, uout: 0, rOut: 0,
    asSup: 0, asInf: 0, aswPerRow: 0, checks: [],
  };
}

export function calcCruceta(inp: PunchingInputs): PunchingResult {
  // ── Validation ───────────────────────────────────────────────────────────
  if (inp.d <= 0) return invalid('d debe ser > 0');
  if (inp.VEd <= 0) return invalid('VEd (axil N) debe ser > 0');
  if (inp.fck < 12 || inp.fck > 90) return invalid('fck fuera de rango (12–90 N/mm²)');
  if (inp.plateA <= 0 || inp.plateB <= 0) return invalid('Dimensiones de placa deben ser > 0');
  if (inp.plateT <= 0) return invalid('Espesor de placa debe ser > 0');
  if (inp.weldThroat <= 0) return invalid('Garganta de soldadura debe ser > 0');
  if (!getUPN(inp.upnSize)) return invalid(`Perfil UPN ${inp.upnSize} no encontrado`);
  // Scope gate: only INTERIOR + ZAPATA are validated as safe. Borde/esquina and
  // forjado were reverted after the 2026-06-07 eng-review (Codex outside voice):
  // the cross control perimeter does NOT truncate the 2d offset / uTip at the free
  // edge and has no edge-distance input, so it can underestimate vEd for a real
  // edge column (unsafe). The closed form lives in crossControlPerimeter for the
  // future edge model, but is NOT wired to the product. See TODOS "Crucetas V2.next".
  if (inp.position !== 'interior') {
    return invalid('Crucetas: solo posición interior está validada (borde/esquina en desarrollo)');
  }
  if (inp.substrate !== 'zapata') {
    return invalid('Crucetas: solo sustrato zapata está validado (forjado en desarrollo)');
  }
  if (inp.soilRelief && (inp.footB <= 0 || inp.footL <= 0)) {
    return invalid('Dimensiones de zapata deben ser > 0 para descontar terreno');
  }
  if (inp.useConcentration && (inp.footB <= 0 || inp.footL <= 0)) {
    return invalid('Dimensiones de zapata deben ser > 0 para el factor de concentración');
  }

  const mat = getConcrete(inp.fck);
  const fcd = mat.fcd;
  const fy = STEEL_FY[inp.steelGrade];
  const fu = STEEL_FU[inp.steelGrade];
  const betaW = BETA_W[inp.steelGrade];
  const d = inp.d;
  const nArms = sidesForPosition(inp.position);
  // β eccentricity factor (CE art. 6.4.3) — shared helper, single source with
  // the plain mode. Conservative for the cross (the cruciform spread tends to
  // re-center the reaction); flagged for validation (design doc Open Q #2).
  const beta = betaForPosition(inp.position);

  // vRd,c (CE 6.4.4). ρl uses the reinforcement in the TENSION face crossing the
  // control perimeter: for a zapata that is the bottom mat (footing cantilevers
  // up on soil pressure → bottom tension), for a forjado it depends on the moment
  // sign. The input (barDiamSup/sSup) is labelled "armado cara traccionada" in the
  // UI — the user supplies the tension-face mesh for their case (eng-review B,
  // 2026-06-07). Same vRd,c model as calcPunching otherwise.
  const k = Math.min(1 + Math.sqrt(200 / d), 2.0);
  const asTension = (Math.PI * (inp.barDiamSup / 2) ** 2) / inp.sSup; // mm²/mm
  const rhoLRaw = asTension / d;
  const rhoLMin = Math.max(0.26 * mat.fctm / inp.fyk, 0.0013);
  const rhoL = Math.max(Math.min(rhoLRaw, 0.02), rhoLMin);
  const vMin = 0.035 * Math.pow(k, 1.5) * Math.sqrt(inp.fck);
  const vRdc = Math.max((0.18 / 1.5) * k * Math.pow(100 * rhoL * inp.fck, 1 / 3), vMin);
  const nu = 0.6 * (1 - inp.fck / 250);
  const vRdmax = 0.4 * nu * fcd;

  const A_col = inp.plateA * inp.plateB; // mm² — plate bears on concrete (Codex #2)

  // Design load with optional soil relief (real cross area, Codex #9).
  // A_u1 conservative = cross contact area (smaller than the true enclosed area
  // → less relief → safe). Computed per-profile below; here use a first estimate
  // with the chosen profile's geometry by running the eval once.
  const baseCtx: Ctx = {
    fcd, vRdc, vRdmax, fy, fu, betaW, d, beta, nArms, position: inp.position,
    plateA: inp.plateA, plateB: inp.plateB, A_col,
    V_N: inp.VEd * 1000, reliefApplied: false,
    armLength: inp.armLength, weldThroat: inp.weldThroat, steelGrade: inp.steelGrade,
    useConcentration: inp.useConcentration, substrate: inp.substrate,
    footB: inp.footB, footL: inp.footL, footH: inp.footH,
  };

  // Resolve soil relief using the chosen profile's cross area.
  let ctx = baseCtx;
  if (inp.soilRelief && inp.substrate === 'zapata') {
    const probe = evalProfile(inp.upnSize, baseCtx);
    if (probe) {
      const reliefN = inp.soilPressure * (probe.detail.Au1 / 1e6) * 1000; // kN/m²·m²·1000 = N
      const Vred = Math.max(0, inp.VEd * 1000 - reliefN);
      ctx = { ...baseCtx, V_N: Vred, reliefApplied: true };
    }
  }

  const chosen = evalProfile(inp.upnSize, ctx);
  if (!chosen) return invalid(`Perfil UPN ${inp.upnSize} no encontrado`);

  // Suggestion: smallest UPN that passes (do NOT auto-switch — Code-Quality A).
  let suggestedUpn: number | null = null;
  if (!chosen.passes) {
    for (const size of getSizesUPN()) {
      const ev = evalProfile(size, ctx);
      if (ev && ev.passes) { suggestedUpn = size; break; }
    }
  }

  const cruceta: CrucetaDetail = { ...chosen.detail, suggestedUpn };

  // Add a suggestion row if the chosen profile fails.
  const checks = [...chosen.checks];
  if (!chosen.passes && suggestedUpn !== null) {
    checks.push({
      id: 'cru-suggest',
      description: 'Sugerencia de perfil',
      value: `UPN ${inp.upnSize} no cumple`,
      limit: `prueba UPN ${suggestedUpn}`,
      utilization: 0,
      status: 'neutral',
      article: '—',
      neutral: true,
      tag: `UPN ${suggestedUpn}`,
    });
  } else if (!chosen.passes && suggestedUpn === null) {
    checks.push({
      id: 'cru-suggest',
      description: 'Ningún UPN de la gama reparte lo suficiente',
      value: 'revisar canto d, fck o placa',
      limit: '—',
      utilization: 0,
      status: 'neutral',
      article: '—',
      neutral: true,
    });
  }

  return {
    valid: chosen.passes,
    beta,
    u0: cruceta.u0,
    u1: cruceta.u1,
    k,
    rhoL,
    rhoLMin,
    rhoLClamped: false,
    vMin,
    vRdc,
    vRdmax,
    vEd: chosen.vEd,
    vEd0: chosen.vEd0,
    uout: 0,
    rOut: 0,
    asSup: asTension,
    asInf: 0,
    aswPerRow: 0,
    checks,
    cruceta,
  };
}
