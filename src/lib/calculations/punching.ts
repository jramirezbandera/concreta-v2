// Punching shear — Código Estructural (CE) Spain art. 6.4
// All units: mm, MPa, kN unless noted.
//
// CE art. 6.4.2 — Critical perimeter u1 (at 2d from loaded area)
// CE art. 6.4.3 — β eccentricity factor (simplified by position)
// CE art. 6.4.4 — vRd,c (without shear reinforcement)
// CE art. 6.4.5 — vRd,max (absolute max) and vRd,cs (with stirrups, α=90°)
// CE art. 9.1   — ρl,min (minimum flexural reinforcement)

import { type PunchingInputs } from '../../data/defaults';
import { getConcrete } from '../../data/materials';
import { getBarArea } from '../../data/rebar';
import { type CheckRow, toStatus, makeCheck } from './types';

export type { CheckRow } from './types';

export interface PunchingResult {
  valid:        boolean;
  error?:       string;
  // Intermediate parameters
  beta:         number;   // eccentricity factor (simplified)
  u1:           number;   // mm — critical perimeter at 2d
  k:            number;   // size factor min(1+√(200/d), 2.0)
  rhoL:         number;   // effective flexural ratio (dimensionless, clamped)
  rhoLMin:      number;   // minimum ratio CE 9.1
  rhoLClamped:  boolean;  // true if clamp was applied
  vMin:         number;   // MPa — vmin = 0.035·k^1.5·√fck
  vRdc:         number;   // MPa — resistance without shear reinf
  vRdmax:       number;   // MPa — absolute maximum resistance
  vRdcs?:       number;   // MPa — resistance with stirrups (only if hasShearReinf)
  vEd:          number;   // MPa — design shear stress
  uout:         number;   // mm — perimeter beyond which no shear reinf needed
  rOut:         number;   // mm — equivalent radius of uout circle (approx for borde/esquina)
  asSup:        number;   // mm²/mm — top face As per unit width (from Ø+s)
  asInf:        number;   // mm²/mm — bottom face As per unit width
  aswPerRow:    number;   // mm² — stirrup area at one radial row (derived)
  checks:       CheckRow[];
}

const EMPTY_RESULT: PunchingResult = {
  valid: false, beta: 0, u1: 0, k: 0, rhoL: 0, rhoLMin: 0,
  rhoLClamped: false, vMin: 0, vRdc: 0, vRdmax: 0, vEd: 0, uout: 0, rOut: 0,
  asSup: 0, asInf: 0, aswPerRow: 0,
  checks: [],
};

function invalid(msg: string): PunchingResult {
  return { ...EMPTY_RESULT, error: msg };
}

export function calcPunching(inp: PunchingInputs): PunchingResult {
  // ── Input validation ─────────────────────────────────────────────────────
  if (inp.d <= 0)  return invalid('d debe ser > 0');
  if (inp.VEd <= 0) return invalid('VEd debe ser > 0');
  if (inp.sSup <= 0 || inp.sInf <= 0) return invalid('Las separaciones de armado deben ser > 0');
  if (inp.barDiamSup <= 0 || inp.barDiamInf <= 0) return invalid('Los diámetros de armado deben ser > 0');
  if (inp.fck < 12 || inp.fck > 90) return invalid('fck fuera de rango (12–90 MPa)');
  if (inp.hasShearReinf && inp.sr <= 0) return invalid('Separación radial sr debe ser > 0');
  if (inp.hasShearReinf && inp.swLegs <= 0) return invalid('Nº de ramas debe ser > 0');
  if (inp.hasShearReinf && inp.swDiam <= 0) return invalid('Diámetro del cerco debe ser > 0');

  const mat = getConcrete(inp.fck);
  const fcd = mat.fcd;   // MPa
  const fctm = mat.fctm; // MPa

  // ── Geometry ─────────────────────────────────────────────────────────────
  const d = inp.d;       // mm — effective depth
  const cx = inp.cx;     // mm — column/area dim x (parallel to free edge for borde)
  const cy = inp.cy;     // mm — column/area dim y (perpendicular to free edge for borde)

  // isCircular only valid for interior position
  const useCircular = inp.isCircular && inp.position === 'interior';

  // ── β — eccentricity factor (CE art. 6.4.3, simplified) ──────────────────
  const betaMap: Record<string, number> = {
    interior: 1.0,
    borde:    1.4,
    esquina:  1.5,
  };
  const beta = betaMap[inp.position] ?? 1.0;

  // ── Critical perimeter u1 (CE art. 6.4.2) ────────────────────────────────
  // Convention for borde/esquina:
  //   cx = dimension parallel to free edge
  //   cy = dimension perpendicular to free edge (toward slab interior)
  let u1: number;
  if (useCircular) {
    // Interior circular: u1 = π·(Ø + 4d)   [Ø = cx = diameter]
    u1 = Math.PI * (cx + 4 * d);
  } else {
    switch (inp.position) {
      case 'interior':
        // u1 = 2(cx + cy) + 4πd
        u1 = 2 * (cx + cy) + 4 * Math.PI * d;
        break;
      case 'borde':
        // u1 = 2cx + cy + 2πd + 4d   (one free edge in cy direction)
        u1 = 2 * cx + cy + 2 * Math.PI * d + 4 * d;
        break;
      case 'esquina':
        // u1 = cx + cy + πd + 4d   (CE 6.4.2 Fig. 6.15c, two free edges)
        u1 = cx + cy + Math.PI * d + 4 * d;
        break;
      default:
        u1 = 2 * (cx + cy) + 4 * Math.PI * d;
    }
  }

  // ── Design shear stress (CE art. 6.4.3) ──────────────────────────────────
  // vEd = β · VEd[kN] · 1000 / (u1[mm] · d[mm])   → MPa = N/mm²
  // ×1000 converts kN → N
  const vEd = beta * inp.VEd * 1000 / (u1 * d);

  // ── k — size factor ───────────────────────────────────────────────────────
  const k = Math.min(1 + Math.sqrt(200 / d), 2.0);

  // ── Flexural reinforcement — As per unit width ────────────────────────────
  // Tension face: top bars for pilar (column below slab), bottom for carga-puntual
  const asSup = getBarArea(inp.barDiamSup) / inp.sSup; // mm²/mm
  const asInf = getBarArea(inp.barDiamInf) / inp.sInf; // mm²/mm
  const asTension = inp.mode === 'pilar' ? asSup : asInf;

  // ── ρl — effective flexural ratio ─────────────────────────────────────────
  // ρl = As_tension / d (dimensionless)
  const rhoLRaw = asTension / d;
  const rhoLClamped_upper = Math.min(rhoLRaw, 0.02); // CE 6.4.4: ρl ≤ 0.02

  // ρl,min per CE art. 9.1: max(0.26·fctm/fyk, 0.0013)
  const rhoLMin = Math.max(0.26 * fctm / inp.fyk, 0.0013);
  const rhoLClamped = rhoLClamped_upper < rhoLMin;
  const rhoL = Math.max(rhoLClamped_upper, rhoLMin);

  // ── vmin ─────────────────────────────────────────────────────────────────
  const vMin = 0.035 * Math.pow(k, 1.5) * Math.sqrt(inp.fck); // MPa

  // ── vRd,c — resistance without shear reinforcement (CE art. 6.4.4) ───────
  const CRdc = 0.18 / 1.5; // = 0.12
  const vRdc = Math.max(CRdc * k * Math.pow(100 * rhoL * inp.fck, 1 / 3), vMin);

  // ── vRd,max — absolute maximum resistance (CE art. 6.4.5) ────────────────
  const nu = 0.6 * (1 - inp.fck / 250);          // effectiveness factor
  const vRdmax = 0.4 * nu * fcd;

  // ── Shear reinforcement — tipo viga, α=90° ────────────────────────────────
  // At each radial row: n_sides stirrups (one per column face side), each with
  // swLegs legs → Asw = n_sides × swLegs × As_sw
  const nSides = inp.position === 'interior' ? 4 : inp.position === 'borde' ? 3 : 2;
  const aswPerRow = nSides * inp.swLegs * getBarArea(inp.swDiam); // mm²

  // ── vRd,cs — resistance with shear reinforcement (CE art. 6.4.5) ─────────
  // α = 90° always → sin(α) = 1
  let vRdcs: number | undefined;
  if (inp.hasShearReinf) {
    // fywd,ef = min(250 + 0.25·d, fywk/1.15)   d in mm, result in MPa
    const fywd_ef = Math.min(250 + 0.25 * d, inp.fywk / 1.15);
    // vRd,cs = 0.75·vRdc + 1.5·(d/sr)·Asw/(u1·d)·fywd,ef·sin(90°)
    vRdcs = 0.75 * vRdc + 1.5 * (d / inp.sr) * aswPerRow / (u1 * d) * fywd_ef;
  }

  // ── uout — perimeter beyond which no shear reinf needed ──────────────────
  // uout = β·VEd[kN]·1000 / (vRdc·d)
  const uout = beta * inp.VEd * 1000 / (vRdc * d);
  // rOut: equivalent radius of circle with perimeter=uout (approx for borde/esquina)
  const rOut = uout / (2 * Math.PI);

  // ── Checks ────────────────────────────────────────────────────────────────
  const checks: CheckRow[] = [];

  // punz-rho-min: ρl ≥ ρl,min
  // Always show; status=warn when clamp was applied (user's rho < min)
  {
    const rhoDisplay = rhoLRaw; // before upper cap and min clamp
    const util = rhoLMin > 0 ? rhoDisplay / rhoLMin : 1;
    const status = rhoLClamped ? 'warn' : toStatus(util >= 1 ? 0 : util);
    checks.push({
      id:          'punz-rho-min',
      description: 'ρl ≥ ρl,min',
      value:       `ρl = ${rhoDisplay.toFixed(4)}`,
      limit:       `ρl,min = ${rhoLMin.toFixed(4)}`,
      utilization: rhoLClamped ? 0.85 : Math.min(util, 1),
      status,
      article:     'CE art. 9.1',
    });
  }

  // punz-sr-max: sr ≤ 0.75·d (CE art. 9.4.3) — only when shear reinf is active
  if (inp.hasShearReinf) {
    const srMax = 0.75 * d;
    const util = inp.sr / srMax; // ≤1 = ok, >1 = violation
    const srStatus: CheckRow['status'] = util > 1 ? 'fail' : util > 0.9 ? 'warn' : 'ok';
    checks.push({
      id:          'punz-sr-max',
      description: 'sr ≤ 0.75·d (separación radial)',
      value:       `sr = ${inp.sr.toFixed(0)} mm`,
      limit:       `0.75d = ${srMax.toFixed(0)} mm`,
      utilization: Math.min(util, 1),
      status:      srStatus,
      article:     'CE art. 9.4.3',
    });
  }

  // punz-ved-max: vEd ≤ vRd,max
  checks.push(makeCheck(
    'punz-ved-max',
    'vEd ≤ vRd,max (máximo absoluto)',
    vEd, vRdmax,
    `${vEd.toFixed(3)} MPa`,
    `${vRdmax.toFixed(3)} MPa`,
    'CE art. 6.4.5',
  ));

  // punz-ved-vrdc: vEd ≤ vRd,c (without shear reinf)
  checks.push(makeCheck(
    'punz-ved-vrdc',
    'vEd ≤ vRd,c (sin armado)',
    vEd, vRdc,
    `${vEd.toFixed(3)} MPa`,
    `${vRdc.toFixed(3)} MPa`,
    'CE art. 6.4.4',
  ));

  // punz-ved-vrdcs: vEd ≤ vRd,cs (with stirrups) — only if hasShearReinf
  if (inp.hasShearReinf && vRdcs !== undefined) {
    checks.push(makeCheck(
      'punz-ved-vrdcs',
      'vEd ≤ vRd,cs (con cercos)',
      vEd, vRdcs,
      `${vEd.toFixed(3)} MPa`,
      `${vRdcs.toFixed(3)} MPa`,
      'CE art. 6.4.5',
    ));
  }

  const valid = checks.every((c) => c.status !== 'fail');

  return {
    valid,
    beta,
    u1,
    k,
    rhoL,
    rhoLMin,
    rhoLClamped,
    vMin,
    vRdc,
    vRdmax,
    vRdcs,
    vEd,
    uout,
    rOut,
    asSup,
    asInf,
    aswPerRow,
    checks,
  };
}
