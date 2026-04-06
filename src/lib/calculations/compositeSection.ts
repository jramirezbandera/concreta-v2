// Composite steel section — Steiner theorem + EC3/CE classification
// CE art. 5.2 / EC3 Table 5.2 (EN 1993-1-1)
// All internal calculations in mm and mm⁴. Display in cm⁴, cm³, kNm.

import { type CompositeSectionInputs, type PlateEntry } from '../../data/defaults';
import { getProfile } from '../../data/steelProfiles';
import { type CheckRow } from './types';

const FY_MAP: Record<string, number> = {
  S235: 235,
  S275: 275,
  S355: 355,
  S450: 440, // EN 1993-1-1 Table 3.1: fy = 440 MPa for t ≤ 16mm
};
const GAMMA_M0 = 1.05;

export interface SectionElement {
  A_mm2: number;
  yc_mm: number;         // centroid from section bottom (after re-basing)
  Iy_own_mm4: number;
  label: string;
  isProfile: boolean;
  yBottom_mm: number;    // after re-basing
  height_mm: number;     // vertical extent
  width_mm: number;      // horizontal extent (= b for profiles, used for SVG only)
  xCenter_mm: number;    // x of centroid relative to profile centre-web (for SVG)
  posType: PlateEntry['posType'] | 'profile';
  // Profile geometry — only set when isProfile=true; used to decompose into strips for Wpl
  profileTf_mm?: number; // flange thickness
  profileTw_mm?: number; // web thickness
}

export interface CompositeSectionResult {
  valid: boolean;
  error?: string;
  // Section properties
  A_cm2: number;
  yc_mm: number;
  Iy_cm4: number;
  Wel_top_cm3: number;
  Wel_bot_cm3: number;
  Wel_min_cm3: number;
  Wpl_cm3: number;
  shapeFactor: number;
  // Classification (null when mode='custom')
  epsilon: number | null;
  webRatio: number | null;
  webClass: 1 | 2 | 3 | 4 | null;
  flangeTopRatio: number | null;
  flangeTopClass: 1 | 2 | 3 | 4 | null;
  flangeBotRatio: number | null;
  flangeBotClass: 1 | 2 | 3 | 4 | null;
  sectionClass: 1 | 2 | 3 | 4 | null;
  // Resistance
  fy_MPa: number;
  Mrd_kNm: number;
  class4Warning: boolean;
  // SVG data
  elements: SectionElement[];
  totalHeight: number;
  profileH: number;   // 0 for custom mode
  profileB: number;
  profileTf: number;
  profileTw: number;
  profileR: number;
  checks: CheckRow[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

function invalid(error: string): CompositeSectionResult {
  return {
    valid: false, error,
    A_cm2: 0, yc_mm: 0, Iy_cm4: 0,
    Wel_top_cm3: 0, Wel_bot_cm3: 0, Wel_min_cm3: 0,
    Wpl_cm3: 0, shapeFactor: 0,
    epsilon: null, webRatio: null, webClass: null,
    flangeTopRatio: null, flangeTopClass: null,
    flangeBotRatio: null, flangeBotClass: null,
    sectionClass: null,
    fy_MPa: 275, Mrd_kNm: 0, class4Warning: false,
    elements: [], totalHeight: 0,
    profileH: 0, profileB: 0, profileTf: 0, profileTw: 0, profileR: 0,
    checks: [],
  };
}

function classifyElement(ratio: number, limits: [number, number, number], eps: number): 1 | 2 | 3 | 4 {
  if (ratio <= limits[0] * eps) return 1;
  if (ratio <= limits[1] * eps) return 2;
  if (ratio <= limits[2] * eps) return 3;
  return 4;
}

function classUtil(ratio: number, cls: 1 | 2 | 3 | 4, limits: [number, number, number], eps: number): number {
  const lim = cls === 1 ? limits[0] : cls === 2 ? limits[1] : limits[2];
  return ratio / (lim * eps);
}

const WEB_LIMITS: [number, number, number] = [72, 83, 124];
const FLG_LIMITS: [number, number, number] = [9, 10, 14];

// ── PNA via horizontal strip method ──────────────────────────────────────────
// Strip elements use the ACTUAL section geometry (profile decomposed into 3
// rectangles) so PNA is computed correctly. Do NOT pass the composite elements[]
// directly — the profile is a single element with width=b, which would treat it
// as a solid rectangle instead of an I-section.

interface StripEl { yBottom_mm: number; height_mm: number; width_mm: number }

function buildStripElements(elements: SectionElement[]): StripEl[] {
  const result: StripEl[] = [];
  for (const e of elements) {
    if (e.isProfile && e.profileTf_mm && e.profileTw_mm) {
      // Decompose I-profile into bottom flange, web, top flange rectangles.
      // This gives correct Wpl — treating profile as solid rectangle (width=b) would
      // place the PNA far too low and massively overestimate Wpl.
      const { profileTf_mm: tf, profileTw_mm: tw, width_mm: b, height_mm: h, yBottom_mm: yBot } = e;
      result.push({ yBottom_mm: yBot,         height_mm: tf,       width_mm: b  }); // bottom flange
      result.push({ yBottom_mm: yBot + tf,     height_mm: h - 2*tf, width_mm: tw }); // web
      result.push({ yBottom_mm: yBot + h - tf, height_mm: tf,       width_mm: b  }); // top flange
    } else {
      result.push({ yBottom_mm: e.yBottom_mm, height_mm: e.height_mm, width_mm: e.width_mm });
    }
  }
  return result;
}

function computeWpl(stripEls: StripEl[], A_total: number): number {
  // Collect all unique y-boundaries
  const bndSet = new Set<number>();
  for (const e of stripEls) {
    bndSet.add(e.yBottom_mm);
    bndSet.add(e.yBottom_mm + e.height_mm);
  }
  const ys = Array.from(bndSet).sort((a, b) => a - b);

  // Build strips with total width at each interval
  interface Strip { ya: number; yb: number; width: number }
  const strips: Strip[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const ya = ys[i];
    const yb = ys[i + 1];
    const ymid = (ya + yb) / 2;
    let width = 0;
    for (const e of stripEls) {
      if (e.yBottom_mm <= ymid && ymid < e.yBottom_mm + e.height_mm) {
        width += e.width_mm;
      }
    }
    if (width > 0) strips.push({ ya, yb, width });
  }

  // Find PNA: accumulate area from bottom until A_total/2
  const halfA = A_total / 2;
  let cumArea = 0;
  let y_pna = 0;
  for (const strip of strips) {
    const area = strip.width * (strip.yb - strip.ya);
    if (cumArea + area >= halfA) {
      const remaining = halfA - cumArea;
      y_pna = strip.ya + remaining / strip.width;
      break;
    }
    cumArea += area;
    y_pna = strip.yb;
  }

  // Wpl = sum of strip moments about PNA
  let Wpl = 0;
  for (const strip of strips) {
    const { ya, yb, width: w } = strip;
    if (yb <= y_pna) {
      // Entirely below PNA
      Wpl += w * (yb - ya) * (y_pna - (ya + yb) / 2);
    } else if (ya >= y_pna) {
      // Entirely above PNA
      Wpl += w * (yb - ya) * ((ya + yb) / 2 - y_pna);
    } else {
      // PNA passes through — split
      Wpl += w * (y_pna - ya) * (y_pna - (ya + y_pna) / 2);
      Wpl += w * (yb - y_pna) * ((y_pna + yb) / 2 - y_pna);
    }
  }
  return Wpl;
}

// ── main calc ─────────────────────────────────────────────────────────────────

export function calcCompositeSection(inp: CompositeSectionInputs): CompositeSectionResult {
  const fy = FY_MAP[inp.grade] ?? 275;
  const profile = inp.mode === 'reinforced'
    ? getProfile(inp.profileType, inp.profileSize)
    : undefined;

  if (inp.mode === 'reinforced' && !profile) {
    return invalid(`Perfil ${inp.profileType} ${inp.profileSize} no encontrado`);
  }

  // Guard: left/right only valid in reinforced mode
  if (inp.mode === 'custom' && inp.plates.some((p) => p.posType === 'left' || p.posType === 'right')) {
    return invalid('Posición lateral no disponible en modo personalizado');
  }

  // Guard: custom mode with no plates
  if (inp.mode === 'custom' && inp.plates.length === 0) {
    return invalid('Sin elementos — añade al menos una chapa');
  }

  // Validate plate dimensions
  for (const p of inp.plates) {
    if (p.b <= 0 || p.t <= 0) return invalid('Dimensiones de chapa inválidas (b > 0, t > 0)');
  }

  // ── resolve plate positions ─────────────────────────────────────────────────
  const h_base = profile?.h ?? 0;
  const web_h = profile ? Math.max(profile.h - 2 * profile.tf, 1) : 0;

  let topStack = h_base;
  let bottomStack = 0;

  interface ResolvedPlate {
    plate: PlateEntry;
    yBottom: number;
    height: number;  // vertical extent in cross-section
    width: number;   // horizontal extent in cross-section
  }

  const resolvedPlates: ResolvedPlate[] = [];

  for (const plate of inp.plates) {
    let yBottom: number;
    let height: number;
    let width: number;

    switch (plate.posType) {
      case 'top':
        yBottom = topStack;
        height = plate.t;
        width = plate.b;
        topStack += plate.t;
        break;
      case 'bottom':
        bottomStack -= plate.t;
        yBottom = bottomStack;
        height = plate.t;
        width = plate.b;
        break;
      case 'left':
      case 'right':
        // Plate runs full web clear height; b = horizontal extent from web face
        yBottom = profile!.tf;
        height = web_h;
        width = plate.b;
        break;
      case 'custom':
        yBottom = plate.customYBottom;
        height = plate.t;
        width = plate.b;
        break;
    }
    resolvedPlates.push({ plate, yBottom, height, width });
  }

  // Re-base so that y_min = 0
  const allYs: number[] = [...resolvedPlates.map((rp) => rp.yBottom)];
  if (profile) allYs.push(0);
  if (allYs.length === 0) return invalid('Sin elementos — añade al menos una chapa');

  const yMin = Math.min(...allYs);
  const shift = yMin < 0 ? -yMin : 0;

  // ── build element list ─────────────────────────────────────────────────────
  const elements: SectionElement[] = [];

  if (profile) {
    elements.push({
      A_mm2: profile.A * 100,
      yc_mm: profile.h / 2 + shift,
      Iy_own_mm4: profile.Iy * 10000,
      label: profile.label,
      isProfile: true,
      yBottom_mm: shift,
      height_mm: profile.h,
      width_mm: profile.b,
      xCenter_mm: 0,
      posType: 'profile',
      profileTf_mm: profile.tf,
      profileTw_mm: profile.tw,
    });
  }

  for (const { plate, yBottom, height, width } of resolvedPlates) {
    const yBot = yBottom + shift;
    const yc = yBot + height / 2;
    let xCenter_mm = 0;
    if (plate.posType === 'left' && profile) {
      xCenter_mm = -(profile.tw / 2 + width / 2);
    } else if (plate.posType === 'right' && profile) {
      xCenter_mm = +(profile.tw / 2 + width / 2);
    }
    const label = (plate.posType === 'left' || plate.posType === 'right')
      ? `${width}×${height.toFixed(0)}`
      : `${plate.b}×${plate.t}`;

    elements.push({
      A_mm2: width * height,
      yc_mm: yc,
      Iy_own_mm4: width * Math.pow(height, 3) / 12,
      label,
      isProfile: false,
      yBottom_mm: yBot,
      height_mm: height,
      width_mm: width,
      xCenter_mm,
      posType: plate.posType,
    });
  }

  // ── section properties ─────────────────────────────────────────────────────
  const A_total = elements.reduce((s, e) => s + e.A_mm2, 0);
  if (A_total === 0) return invalid('Sin elementos — añade al menos una chapa');

  const yc = elements.reduce((s, e) => s + e.A_mm2 * e.yc_mm, 0) / A_total;

  const Iy_total = elements.reduce(
    (s, e) => s + e.Iy_own_mm4 + e.A_mm2 * Math.pow(e.yc_mm - yc, 2),
    0,
  );

  const y_top = Math.max(...elements.map((e) => e.yBottom_mm + e.height_mm));
  const totalHeight = y_top;

  const Wel_top = Iy_total / Math.max(y_top - yc, 1);
  const Wel_bot = Iy_total / Math.max(yc, 1);
  const Wel_min = Math.min(Wel_top, Wel_bot);

  const Wpl_mm3 = computeWpl(buildStripElements(elements), A_total);

  // ── classification (reinforced mode only) ─────────────────────────────────
  let epsilon: number | null = null;
  let webRatio: number | null = null;
  let webClass: 1 | 2 | 3 | 4 | null = null;
  let flangeTopRatio: number | null = null;
  let flangeTopClass: 1 | 2 | 3 | 4 | null = null;
  let flangeBotRatio: number | null = null;
  let flangeBotClass: 1 | 2 | 3 | 4 | null = null;
  let sectionClass: 1 | 2 | 3 | 4 | null = null;
  const checks: CheckRow[] = [];

  if (inp.mode === 'reinforced' && profile) {
    epsilon = Math.sqrt(235 / fy);

    // Web — clear height between fillets
    const c_w = profile.h - 2 * profile.tf - 2 * profile.r;
    webRatio = c_w / profile.tw;
    webClass = classifyElement(webRatio, WEB_LIMITS, epsilon);

    // Bottom flange outstand (rolled I: fillet included)
    const c_f_bot = (profile.b - profile.tw - 2 * profile.r) / 2;
    flangeBotRatio = c_f_bot / profile.tf;
    flangeBotClass = classifyElement(flangeBotRatio, FLG_LIMITS, epsilon);

    // Top flange: use first top cover plate if present, else same as bottom
    const topPlates = resolvedPlates.filter((rp) => rp.plate.posType === 'top');
    if (topPlates.length > 0) {
      // Use the widest top plate (most critical outstand)
      const widestTop = topPlates.reduce((a, b) => a.plate.b >= b.plate.b ? a : b);
      const c_f_top = (widestTop.plate.b - profile.tw) / 2;
      flangeTopRatio = c_f_top / widestTop.plate.t;
      flangeTopClass = classifyElement(flangeTopRatio, FLG_LIMITS, epsilon);
    } else {
      flangeTopRatio = flangeBotRatio;
      flangeTopClass = flangeBotClass;
    }

    sectionClass = Math.max(webClass, flangeTopClass, flangeBotClass) as 1 | 2 | 3 | 4;

    // Build check rows
    const webLimVal = WEB_LIMITS[Math.min(webClass - 1, 2)] * epsilon;
    checks.push({
      id: 'cls-web',
      description: 'Alma',
      value: `${webRatio.toFixed(1)}`,
      limit: `≤ ${webLimVal.toFixed(1)} (Cl.${webClass})`,
      utilization: classUtil(webRatio, webClass, WEB_LIMITS, epsilon),
      status: webClass <= 2 ? 'ok' : webClass === 3 ? 'warn' : 'fail',
      article: 'CE art. 5.2 T.5.2',
    });

    const ftLimVal = FLG_LIMITS[Math.min(flangeTopClass - 1, 2)] * epsilon;
    checks.push({
      id: 'cls-flange-top',
      description: 'Ala superior',
      value: `${flangeTopRatio.toFixed(1)}`,
      limit: `≤ ${ftLimVal.toFixed(1)} (Cl.${flangeTopClass})`,
      utilization: classUtil(flangeTopRatio, flangeTopClass, FLG_LIMITS, epsilon),
      status: flangeTopClass <= 2 ? 'ok' : flangeTopClass === 3 ? 'warn' : 'fail',
      article: 'CE art. 5.2 T.5.2',
    });

    const fbLimVal = FLG_LIMITS[Math.min(flangeBotClass - 1, 2)] * epsilon;
    checks.push({
      id: 'cls-flange-bot',
      description: 'Ala inferior',
      value: `${flangeBotRatio.toFixed(1)}`,
      limit: `≤ ${fbLimVal.toFixed(1)} (Cl.${flangeBotClass})`,
      utilization: classUtil(flangeBotRatio, flangeBotClass, FLG_LIMITS, epsilon),
      status: flangeBotClass <= 2 ? 'ok' : flangeBotClass === 3 ? 'warn' : 'fail',
      article: 'CE art. 5.2 T.5.2',
    });
  }

  // ── Mmax,Rd ────────────────────────────────────────────────────────────────
  const class4Warning = sectionClass === 4;
  let Mrd_Nmm: number;
  if (sectionClass === null || sectionClass === 1 || sectionClass === 2) {
    // Custom mode (null) uses Wpl as best estimate (no classification)
    Mrd_Nmm = Wpl_mm3 * fy / GAMMA_M0;
  } else if (sectionClass === 3) {
    Mrd_Nmm = Wel_min * fy / GAMMA_M0;
  } else {
    // Class 4: effective section (EN 1993-1-5) not implemented — cannot report Mrd
    Mrd_Nmm = 0;
  }

  return {
    valid: true,
    A_cm2: A_total / 100,
    yc_mm: yc,
    Iy_cm4: Iy_total / 10000,
    Wel_top_cm3: Wel_top / 1000,
    Wel_bot_cm3: Wel_bot / 1000,
    Wel_min_cm3: Wel_min / 1000,
    Wpl_cm3: Wpl_mm3 / 1000,
    shapeFactor: Wel_min > 0 ? Wpl_mm3 / Wel_min : 1,
    epsilon,
    webRatio,
    webClass,
    flangeTopRatio,
    flangeTopClass,
    flangeBotRatio,
    flangeBotClass,
    sectionClass,
    fy_MPa: fy,
    Mrd_kNm: Mrd_Nmm / 1e6,
    class4Warning,
    elements,
    totalHeight,
    profileH: profile?.h ?? 0,
    profileB: profile?.b ?? 0,
    profileTf: profile?.tf ?? 0,
    profileTw: profile?.tw ?? 0,
    profileR: profile?.r ?? 0,
    checks,
  };
}

