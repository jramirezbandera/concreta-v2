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
import { getBarArea } from '../../data/rebar';
import { getUPN, getSizesUPN, type UPNProfile } from '../../data/steelProfiles';
import { type CheckRow, makeCheck, makeCheckNeutral } from './types';
import { effectiveOverhang } from './ec3BasePlate';
import { crossPerimetersClipped } from './crossPerimeter';
import { type PunchingResult, type CrucetaDetail, betaForPosition, sidesForPosition } from './punching';

// Re-export so existing importers (and tests) keep resolving from cruceta.
export { sidesForPosition } from './punching';

const GAMMA_M0 = 1.05;
const GAMMA_M2 = 1.25;

// Longitud de brazo del DETALLE TIPO (pilar metálico embebido en forjado): la
// cruceta se construye a L ≥ luz/8 y ≥ 50 cm, a centro de canto. Es una regla
// CONSTRUCTIVA probada (no hay mínimo normativo: EC2 no tiene shearhead y ACI
// 318-19 lo retiró). La longitud la manda la construcción, no la optimización del
// acero; el acero solo pone el techo (L_eff,duro, donde el brazo partiría).
const MIN_CONSTRUCTIVE_ARM = 500; // mm — ≥50 cm del detalle tipo
const SPAN_ARM_FRACTION = 8;      // L ≥ luz/8

// Tabla del detalle tipo (forjado): canto del forjado (mm) → UPN recomendado. El
// canto se estima desde el canto útil d con un recubrimiento mecánico nominal.
// Es GUÍA (no normativa): avisa si el perfil queda por debajo de la tabla o si no
// cabe a media altura del canto.
const CANTO_UPN_TABLE: ReadonlyArray<readonly [number, number]> = [
  [220, 100], [250, 120], [300, 140], [350, 160],
];
const TABLE_COVER = 40;      // mm — d → canto (recubrimiento mecánico nominal)
const FIT_CLEARANCE = 25;    // mm — holgura mínima del UPN a cada cara del canto
function recommendedUPNForCanto(cantoMm: number): number {
  let upn = CANTO_UPN_TABLE[0][1];
  for (const [canto, size] of CANTO_UPN_TABLE) if (cantoMm >= canto) upn = size;
  return upn;
}

// Alcance del acero (shearhead): el brazo reparte MIENTRAS el acero aguante. El cap
// duro (util=1.0) es donde el brazo partiría por flexión/soldadura/cortante.
// MAX_AUTO_ARM acota la bisección con cargas muy bajas.
const MAX_AUTO_ARM = 1500; // mm

// Resistencias de acero de UN brazo, independientes de la longitud: garganta de
// soldadura (Aw área, Ww módulo de la línea de soldadura, f_vw,d) y cortante
// plástico del alma Vpl,Rd. ÚNICA FUENTE de estas fórmulas: la usan tanto la
// búsqueda de alcance (steelReach) como las filas de verificación (evalProfile),
// para que el límite que persigue el L_eff y el que muestra el check no deriven.
interface ArmSteel {
  Aw: number;     // mm² — área de garganta (dos cordones a lo largo del canto)
  Ww: number;     // mm³ — módulo a flexión de la línea de soldadura
  fvwd: number;   // MPa — resistencia de cálculo del cordón (CE DB-SE-A 8.6.2)
  VplRd: number;  // N — cortante plástico del alma del UPN
}
function armSteel(upn: UPNProfile, c: Ctx): ArmSteel {
  const lw = 2 * upn.h, a = c.weldThroat;       // mm — dos cordones (conservador)
  return {
    Aw: Math.max(a * lw, 1e-6),
    Ww: Math.max((a * lw * lw) / 6, 1e-6),
    fvwd: c.fu / (Math.sqrt(3) * c.betaW * GAMMA_M2),
    VplRd: (upn.h * upn.tw * c.fy) / (Math.sqrt(3) * GAMMA_M0),
  };
}

/**
 * Utilización GOBERNANTE del acero de un brazo bajo apoyo uniforme σ sobre un
 * alcance L: máx(flexión M_Rd, soldadura f_vw,d, cortante Vpl,Rd). Crece monótona
 * con L (premisa de la bisección en steelReach). Fórmula única compartida con las
 * filas de verificación de evalProfile.
 */
function steelUtil(s: ArmSteel, MRd_Nmm: number, bEff: number, sig: number, L: number): number {
  const MEd = (sig * bEff * L * L) / 2;
  const Varm = sig * bEff * L;
  const bend = MEd / MRd_Nmm;
  const weld = Math.sqrt((MEd / s.Ww) ** 2 + (Varm / s.Aw) ** 2) / s.fvwd;
  const shear = Varm / s.VplRd;
  return Math.max(bend, weld, shear);
}

/**
 * Alcance eficaz del brazo limitado por la RESISTENCIA DEL ACERO (mecanismo de
 * cabeza de cortante): el cono no se forma a través del acero intacto, así que el
 * brazo extiende la sección crítica hasta donde su propia resistencia (flexión
 * M_Rd, soldadura f_vw,d, cortante Vpl,Rd) bajo la carga real lo permite. Devuelve
 * la longitud L donde la utilización gobernante del acero = `target`. Bisección
 * (la util crece monótona con L). ⚠ Usa σ_act uniforme e IGNORA el anclaje del
 * brazo (fila amber) — la fuerza real que cruza el cono es el hand-calc §6.7.
 */
function steelReach(upn: UPNProfile, c: Ctx, bEff: number, MRd_Nmm: number, target: number): number {
  const s = armSteel(upn, c);
  const util = (L: number): number =>
    steelUtil(s, MRd_Nmm, bEff, c.V_N / (c.A_col + c.nArms * bEff * L), L); // σ_act = V/A
  if (util(MAX_AUTO_ARM) <= target) return MAX_AUTO_ARM;
  let lo = 1, hi = MAX_AUTO_ARM;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (util(m) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// Steel strengths by grade (EN 10025).
const STEEL_FY: Record<CrucetaSteel, number> = { S275: 275, S355: 355 };
const STEEL_FU: Record<CrucetaSteel, number> = { S275: 430, S355: 490 };
// EC3-1-8 Tab 4.1 weld correlation factor βw.
const BETA_W: Record<CrucetaSteel, number> = { S275: 0.85, S355: 0.90 };

// Control perimeters now come from ./crossPerimeter (crossPerimetersClipped) — a
// validated numerical engine that truncates the 2d offset at the free edge. It
// replaced an earlier closed form that overstated u1 for the non-convex cross
// (dilation swallows the arm roots) → unconservative; see eng-review 2026-06-07.

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
  vRdcs?: number;       // forjado with shear reinforcement
  aswPerRow: number;    // mm² — stirrup area per radial row (0 if no reinf)
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
  spanL: number;          // mm — luz del vano (regla constructiva luz/8)
  weldThroat: number;     // mm
  steelGrade: CrucetaSteel;
  substrate: CrucetaSubstrate;
  armThrough: boolean;                          // cruceta pasante soldada al pilar
  hasRepartoSup: boolean; hasRepartoInf: boolean; // armadura de reparto del detalle
  edgeY: number; edgeX: number;                 // mm — free-edge clear distances
  // Punching shear reinforcement (forjado only — thin transfer slab).
  hasShearReinf: boolean;
  swDiam: number; swLegs: number; sr: number; fywk: number;
}

/**
 * Geometry of the EMBEDDED confined cross (interim conservative model, 2026-06-07,
 * post /office-hours redesign). The real detail is a UPN cross embedded mid-depth
 * acting as a SHEARHEAD: the punching cone cannot form through the intact steel, so
 * the arm pushes the critical section outward. INTERIM, pending the engineer's hand-calc:
 *  • f_geom = fcd for c_f / b_eff and V_cap (f_cap = 2/3·fcd, conservative). NO
 *    confinement claimed above fcd (Ac1=Ac0) → f constant, no iteration.
 *  • L_eff = SHEARHEAD reach: the arm spreads until its OWN steel (bending/weld/
 *    shear) governs (steelReach), not a base-plate rigidity limit. ⚠ Uses uniform
 *    σ_act and ignores arm anchorage (amber row) — the cone-crossing force is the §6.7.
 * PENDING engineer validation: Ac1/confinement >fcd, anchorage, cone force, cover,
 * delamination.
 */
function deriveGeom(upn: UPNProfile, c: Ctx) {
  const fGeom = c.fcd;                             // MPa — fcd (no confinement >fcd)
  const fyd = c.fy / GAMMA_M0;                     // MPa
  const cf = effectiveOverhang(upn.tf, fyd, fGeom);
  const bEff = Math.min(upn.b, upn.tw + 2 * cf);   // mm
  const upnClass = classifyUPN(upn, c.fy);
  // Wpl if class ≤ 2, else Wel (cm³ → mm³)
  const W = (upnClass <= 2 ? upn.Wpl_y : upn.Wel_y) * 1000; // mm³
  const MRd_Nmm = (W * c.fy) / GAMMA_M0;           // N·mm
  // Longitud del brazo: la manda el DETALLE TIPO (constructiva), no el acero.
  //   L_constr = máx(luz/8, 50cm)  ← lo que se construye
  //   L_hard   = alcance donde el acero partiría (util=1.0)  ← techo físico
  //   auto     = mín(L_constr, L_hard)   (si el acero no llega, se capa y se avisa)
  const LeffHard = steelReach(upn, c, bEff, MRd_Nmm, 1.0);
  const Lconstr = Math.max(MIN_CONSTRUCTIVE_ARM, c.spanL / SPAN_ARM_FRACTION);
  const Lauto = Math.min(Lconstr, LeffHard);
  const Larm = c.armLength > 0 ? c.armLength : Lauto;
  const Leff = Math.min(Larm, LeffHard);
  const Acruz = c.plateA * c.plateB + c.nArms * bEff * Leff; // mm² — loaded area
  // LeffMax = longitud auto (constructiva, capada). Lconstr/LeffHard se exponen para
  // el aviso "perfil corto para la luz" (L_hard < L_constr → no alcanza el detalle).
  return { fGeom, cf, bEff, upnClass, MRd_Nmm, LeffMax: Lauto, Lconstr, LeffHard, Larm, Leff, Acruz };
}

function evalProfile(upnSize: number, c: Ctx): ProfileEval | null {
  const upn = getUPN(upnSize);
  if (!upn) return null;

  const g = deriveGeom(upn, c);
  const { fGeom, cf, bEff, upnClass, MRd_Nmm, LeffMax, Lconstr, LeffHard, Larm, Leff, Acruz } = g;
  const fCap = (2 / 3) * c.fcd;                   // MPa — bearing capacity floor (conservative)
  const MRd = MRd_Nmm / 1e6;                     // kN·m

  const { u0, u1, uCore, uTip } = crossPerimetersClipped(
    {
      plateA: c.plateA, plateB: c.plateB, bEff, Leff,
      position: c.position, edgeY: c.edgeY, edgeX: c.edgeX,
    },
    c.d,
  );

  // ── Capacity vs demand ─────────────────────────────────────────────────────
  // V_cap uses f_cap = 2/3·fcd (conservative capacity floor); the geometry used
  // f_geom = fcd (conservative L_eff). Decoupled on purpose: each f is taken in
  // its own safe direction (lower f → less capacity; higher f → shorter arm).
  // DEMAND uses the actual uniform bearing σ_act = V/A_cruz (≤ f_cap while V ≤ V_cap).
  const Vcap_N = fCap * Acruz;                                // N
  const sigAct = c.V_N / Acruz;                               // MPa, demand pressure
  const Varm_N = sigAct * bEff * Leff;                        // N, one arm's share
  const Vcore_N = sigAct * c.A_col;                           // N, plate's share

  // Demand stresses
  const vEd  = (c.beta * c.V_N) / (u1 * c.d);                 // MPa, global
  const vEd0 = (c.beta * c.V_N) / (u0 * c.d);                 // MPa, plate face
  const vEdCore = (c.beta * Vcore_N) / (uCore * c.d);         // MPa, local core
  const vEdTip  = (c.beta * Varm_N) / (uTip * c.d);           // MPa, arm tip

  // UPN bending / shear / weld — actual demand pressure σ_act. Mismas resistencias
  // (armSteel) que persigue steelReach: una sola fuente, sin deriva entre el L_eff
  // y el check que se muestra.
  const s = armSteel(upn, c);
  const MEd_Nmm = (sigAct * bEff * Leff * Leff) / 2;          // N·mm at root
  const MEd = MEd_Nmm / 1e6;                                  // kN·m
  const VplRd_N = s.VplRd;                                    // N, web plastic shear
  const VEd_arm = Varm_N;                                     // N (= bearing reaction)

  // Weld (simplified, CTE DB-SE-A 8.6.2 directional resultant ≤ fvw,d)
  const tauW = VEd_arm / s.Aw;                                // MPa
  const sigW = MEd_Nmm / s.Ww;                                // MPa
  const weldRes = Math.sqrt(sigW * sigW + tauW * tauW);       // MPa
  const fvwd = s.fvwd;                                        // MPa

  // Punching shear reinforcement (forjado only — thin transfer slab, CE 6.4.5).
  // vRd,cs(u) = 0.75·vRd,c + 1.5·(d/sr)·Asw·fywd,ef/(u·d). Asw per radial row taken
  // as nArms·swLegs·As_bar (one stirrup group per arm — simplification, mirrors
  // the plain punching mode). Stirrups in the slab cross every punching surface,
  // so the credit applies to the global u1, the core and the tip (each with its
  // own perimeter); crushing (u0, vRd,max) and bearing (V_cap) get no credit.
  const reinf = c.substrate === 'forjado' && c.hasShearReinf;
  let aswPerRow = 0;
  let limitFor = (_u: number): number => c.vRdc;
  if (reinf) {
    aswPerRow = c.nArms * c.swLegs * getBarArea(c.swDiam);    // mm²
    const fywdEf = Math.min(250 + 0.25 * c.d, c.fywk / 1.15); // MPa
    limitFor = (u: number) => 0.75 * c.vRdc + (1.5 * (c.d / c.sr) * aswPerRow * fywdEf) / (u * c.d);
  }
  const vRdcs: number | undefined = reinf ? limitFor(u1) : undefined;

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

  // Global punching at u1. With shear reinforcement (forjado), vEd ≤ vRd,c becomes
  // informational ("¿requiere cercos?") and vEd ≤ vRd,cs is the governing gate.
  if (reinf && vRdcs !== undefined) {
    checks.push({
      id: 'cru-punz', description: 'vEd vs vRd,c (¿requiere cercos?)',
      value: `${vEd.toFixed(3)} N/mm²`, limit: `${c.vRdc.toFixed(3)} N/mm²`,
      utilization: c.vRdc > 0 ? vEd / c.vRdc : Infinity, status: 'neutral', neutral: true,
      article: 'CE art. 6.4.4', tag: vEd > c.vRdc ? 'CON CERCOS' : 'SIN CERCOS',
    });
    checks.push(makeCheck(
      'cru-punz-cs', 'vEd ≤ vRd,cs (punzonamiento con cercos, u1)',
      vEd, vRdcs, `${vEd.toFixed(3)} N/mm²`, `${vRdcs.toFixed(3)} N/mm²`, 'CE art. 6.4.5',
    ));
  } else {
    checks.push(makeCheck(
      'cru-punz', 'vEd ≤ vRd,c (punzonamiento, perímetro cruz u1)',
      vEd, c.vRdc, `${vEd.toFixed(3)} N/mm²`, `${c.vRdc.toFixed(3)} N/mm²`, 'CE art. 6.4.4',
    ));
  }

  // Local core punching (reinforcement credit when forjado+cercos)
  {
    const lim = limitFor(uCore);
    checks.push(makeCheck(
      'cru-core', `vEd,core ≤ ${reinf ? 'vRd,cs' : 'vRd,c'} (núcleo de la placa)`,
      vEdCore, lim, `${vEdCore.toFixed(3)} N/mm²`, `${lim.toFixed(3)} N/mm²`,
      reinf ? 'CE art. 6.4.5' : 'CE art. 6.4.4',
    ));
  }

  // Per-arm tip punching (reinforcement credit when forjado+cercos)
  {
    const lim = limitFor(uTip);
    checks.push(makeCheck(
      'cru-tip', `vEd,tip ≤ ${reinf ? 'vRd,cs' : 'vRd,c'} (extremo de brazo)`,
      vEdTip, lim, `${vEdTip.toFixed(3)} N/mm²`, `${lim.toFixed(3)} N/mm²`,
      reinf ? 'CE art. 6.4.5' : 'CE art. 6.4.4',
    ));
  }

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

  // Weld — en forjado es la conexión cruceta-PILAR (pasante, cubrejuntas); en zapata
  // es la cruceta-placa. Misma geometría/demanda; el rótulo lo aclara.
  const weldDesc = c.substrate === 'forjado'
    ? 'τ_w ≤ f_vw,d (soldadura cruceta-pilar, conexión pasante)'
    : 'τ_w ≤ f_vw,d (soldadura cruceta-placa, simplificado)';
  checks.push(makeCheck(
    'cru-weld', weldDesc,
    weldRes, fvwd, `${weldRes.toFixed(1)} N/mm²`, `${fvwd.toFixed(1)} N/mm²`, 'CE DB-SE-A 8.6.2',
  ));

  // Aviso constructivo: el acero NO alcanza la longitud del detalle tipo (luz/8,
  // ≥50cm) → el brazo se capa antes y reparte menos de lo que tocaría; subir perfil
  // (ver tabla canto→UPN). Amber (no bloquea). No hay mínimo normativo.
  if (LeffHard < Lconstr) {
    checks.push({
      id: 'cru-arm-min',
      description: 'El acero no alcanza la longitud del detalle (luz/8, ≥50cm) — subir perfil',
      value: `${LeffHard.toFixed(0)} mm`, limit: `${Lconstr.toFixed(0)} mm`,
      utilization: 0.9, status: 'warn', article: 'detalle tipo / recomendación',
    });
  }

  // Tabla canto→UPN del detalle tipo (solo forjado): guía + aviso de coherencia.
  // canto ≈ d + recubrimiento; recomienda el UPN tabulado y avisa si el elegido
  // queda por debajo de la tabla o no cabe a media altura del canto.
  if (c.substrate === 'forjado') {
    const canto = c.d + TABLE_COVER;
    const rec = recommendedUPNForCanto(canto);
    checks.push({
      id: 'cru-table', description: 'Tabla del detalle (canto → UPN recomendado)',
      value: `UPN ${upnSize}`, limit: `≥ UPN ${rec} (canto ≈ ${(canto / 10).toFixed(0)} cm)`,
      utilization: 0, status: 'neutral', neutral: true, article: 'detalle tipo', tag: `UPN ${rec}`,
    });
    if (upnSize < rec) {
      checks.push({
        id: 'cru-table-low', description: 'Perfil por debajo de la tabla para este canto — revisar',
        value: `UPN ${upnSize}`, limit: `UPN ${rec}`,
        utilization: 0.9, status: 'warn', article: 'detalle tipo',
      });
    }
    if (upn.h + 2 * FIT_CLEARANCE > canto) {
      checks.push({
        id: 'cru-fit', description: 'El UPN no cabe a media altura del canto (h + holgura > canto)',
        value: `h ${upn.h} mm`, limit: `canto ${canto.toFixed(0)} mm`,
        utilization: 1.0, status: 'warn', article: 'geometría',
      });
    }
  }

  // ── Estados límite del detalle EMBEBIDO pendientes de validación ──────────────
  // El modelo interino (cruz embebida confinada) NO comprueba todavía estos tres
  // estados límite, que requieren el detalle constructivo y el hand-calc del
  // ingeniero. Se muestran como filas HONESTAS "verificar a mano" en AMBER (warn),
  // para que el verdict global NO salga verde mientras estén sin verificar. No es
  // un check verde que miente. Ver design doc 20260607-112434.
  const pending = (id: string, description: string, article: string): CheckRow => ({
    id, description, value: 'VERIFICAR A MANO', limit: 'pendiente',
    utilization: 0.99, status: 'warn', article,
  });
  // Fila neutral "resuelto por el detalle": deja de ser verificación a mano cuando
  // el esquema estándar aporta el mecanismo (no es un check verde de resistencia,
  // es un estado límite cubierto por disposición constructiva del detalle tipo).
  const byDetail = (id: string, description: string, article: string): CheckRow => ({
    id, description, value: 'según detalle', limit: '—',
    utilization: 0, status: 'neutral', neutral: true, article,
  });
  const fj = c.substrate === 'forjado';

  // Anclaje: en forjado pasante el camino de carga es la soldadura cruceta-pilar
  // (cru-weld, ya comprobada). Sin pasante → "soldar el pilar" o verificar a mano.
  checks.push(fj && c.armThrough
    ? byDetail('cru-anchor', 'Anclaje: cruceta pasante soldada al pilar (ver soldadura)', 'CE DB-SE-A 8.6')
    : pending('cru-anchor', 'Anclaje de brazos embebidos', 'EC2 §8 / conectores'));

  // Atado/recubrimiento superior: lo aporta la armadura de reparto superior del detalle.
  checks.push(fj && c.hasRepartoSup
    ? byDetail('cru-cover', 'Atado superior por armadura de reparto (sup) dispuesta', 'detalle tipo')
    : pending('cru-cover', 'Recubrimiento/atado superior sobre la cruz', 'EC2 §6.4'));

  // Delaminación (cortante de interfaz en el plano de la cruz): NO se calcula aquí
  // (sin cláusula de norma para shearhead). Queda como verificación a mano; el texto
  // recuerda que los cercos entre crucetas y los repartos cosen el plano.
  checks.push(pending('cru-delam',
    fj ? 'Cortante de interfaz en el plano de la cruz (cosido por cercos/repartos)'
       : 'Plano horizontal a la cota de la cruz',
    'cortante interfaz'));

  // Concerns específicos del BORDE LIBRE en losa de transferencia (forjado +
  // borde/esquina): el motor de perímetro ya trunca el contorno, pero el anclaje
  // de la armadura junto al borde y la torsión del borde libre requieren el
  // detalle (Codex). Se marcan en amber solo en ese caso.
  if (c.substrate === 'forjado' && c.position !== 'interior') {
    checks.push(pending('cru-edge-anchor', 'Anclaje de armadura junto al borde libre', 'EC2 §8 / §9'));
    checks.push(pending('cru-edge-torsion', 'Torsión en el borde libre de la losa', 'EC2 §6.3'));
  }

  // Class 4 not supported → force fail
  const classOk = upnClass <= 3;
  const passes = classOk && checks.every((ch) => ch.status !== 'fail');

  const detail: Omit<CrucetaDetail, 'suggestedUpn'> = {
    upnSize, steelGrade: c.steelGrade, upnClass,
    fjd: fGeom, Kj: 1, bEff, cf, MRd, LeffMax, Leff, Larm,
    Vdesign: c.V_N / 1000, Vcap: Vcap_N / 1000, Varm: Varm_N / 1000, Vcore: Vcore_N / 1000,
    u0, u1, uCore, uTip, Au1: Acruz, nArms: c.nArms, beta: c.beta,
    position: c.position, reliefApplied: c.reliefApplied,
  };

  return { detail, checks, vRdc: c.vRdc, vRdmax: c.vRdmax, vRdcs, aswPerRow, vEd, vEd0, passes };
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
  // Interior + borde + esquina (zapata y forjado) usan el motor de perímetro
  // truncado. Forjado borde/esquina añade concerns de borde de losa (anclaje
  // junto al borde libre, torsión) que se marcan como filas amber "verificar a
  // mano" (modelo interino — ver TODOS / design doc 20260607).
  if (inp.position !== 'interior' && inp.edgeY <= 0) {
    return invalid('Distancia al borde libre debe ser > 0');
  }
  if (inp.position === 'esquina' && inp.edgeX <= 0) {
    return invalid('Distancia al 2º borde libre debe ser > 0 (esquina)');
  }
  if (inp.soilRelief && (inp.footB <= 0 || inp.footL <= 0)) {
    return invalid('Dimensiones de zapata deben ser > 0 para descontar terreno');
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
    armLength: inp.armLength, spanL: inp.spanL, weldThroat: inp.weldThroat, steelGrade: inp.steelGrade,
    substrate: inp.substrate, edgeY: inp.edgeY, edgeX: inp.edgeX,
    armThrough: inp.armThrough, hasRepartoSup: inp.hasRepartoSup, hasRepartoInf: inp.hasRepartoInf,
    hasShearReinf: inp.hasShearReinf, swDiam: inp.swDiam, swLegs: inp.swLegs,
    sr: inp.sr, fywk: inp.fywk,
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
    vRdcs: chosen.vRdcs,
    vEd: chosen.vEd,
    vEd0: chosen.vEd0,
    uout: 0,
    rOut: 0,
    asSup: asTension,
    asInf: 0,
    aswPerRow: chosen.aswPerRow,
    checks,
    cruceta,
  };
}
