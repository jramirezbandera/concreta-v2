// Composite steel section — Steiner theorem + EC3/CE classification
// CE art. 5.2 / EC3 Table 5.2 (EN 1993-1-1)
// All internal calculations in mm and mm⁴. Display in cm⁴, cm³, kNm.

import { type CompositeSectionInputs, type PlateEntry } from '../../data/defaults';
import { makeISectionBySize } from '../sections';
import { type CheckRow } from './types';

// fy por grado y espesor (CTE DB-SE-A Tabla 4.1 / EN 10025-2). El fy de la
// sección es el del elemento más DESFAVORABLE (t_max entre tf del perfil y
// espesor de chapas) — antes el mapa era plano y platabandas de 20-25 mm o
// perfiles con tf>16 usaban el fy nominal (fix auditoría #99, mismo patrón
// que #62/#89 en steelBeams/steelColumns).
const FY_MAP: Record<string, number> = {
  S235: 235,
  S275: 275,
  S355: 355,
  S450: 440, // EN 1993-1-1 Table 3.1 (t ≤ 16mm)
};
// 16 < t ≤ 40 mm
const FY_MAP_THICK: Record<string, number> = {
  S235: 225,
  S275: 265,
  S355: 345,
  S450: 410, // CTE DB-SE-A Tabla 4.1
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

// WEB_LIMITS removed: web is classified via webLimitsShifted() which accounts
// for shifted plastic NA (α) and elastic stress ratio (ψ) — see below.
const FLG_LIMITS: [number, number, number] = [9, 10, 14];
// Internal compressed element (EC3 Tab 5.2, parts supported on both edges)
const INT_LIMITS: [number, number, number] = [33, 38, 42];

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

function computeWplAndPNA(stripEls: StripEl[]): { Wpl: number; y_pna: number } {
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

  // Find PNA: accumulate strip area from bottom until strip-total/2.
  // NOTE: we use the strip total (sum of strip widths × heights), NOT the
  // element-total area passed from outside. The element total includes
  // fillet area for rolled profiles, while the strip model is just the 3
  // rectangles — if we mixed them the PNA would drift (symmetric sections
  // would come out slightly off-centre).
  const stripTotal = strips.reduce((s, st) => s + st.width * (st.yb - st.ya), 0);
  const halfA = stripTotal / 2;
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
  return { Wpl, y_pna };
}

// ── Web classification for shifted PNA (EC3 Table 5.2, internal in bending) ──
// When cover plates make the section asymmetric the plastic NA shifts. The
// α=0.5 limits [72, 83, 124] apply only to pure bending with a centred PNA.
// For α > 0.5 (more than half of the web in compression) EC3 uses much
// tighter limits — ignoring this can let a web that is actually Class 3 be
// reported as Class 1/2, inflating Mrd.
//
// Inputs:
//   α  — fraction of web clear height in compression at the PLASTIC NA  (0..1)
//   ψ  — elastic stress ratio σ_bottom/σ_top across the web clear region
function webLimitsShifted(α: number, ψ: number, eps: number): { c1: number; c2: number; c3: number } {
  // Class 1 & 2 — plastic (α)
  let c1: number;
  let c2: number;
  if (α > 0.5) {
    const denom = 13 * α - 1;   // > 5.5 for α>0.5 → always positive
    c1 = (396 * eps) / denom;
    c2 = (456 * eps) / denom;
  } else {
    const α_eff = Math.max(α, 1e-6);
    c1 = (36 * eps) / α_eff;
    c2 = (41.5 * eps) / α_eff;
  }
  // Class 3 — elastic (ψ)
  let c3: number;
  if (ψ > -1) {
    c3 = (42 * eps) / (0.67 + 0.33 * ψ);
  } else {
    // ψ ≤ −1
    c3 = 62 * eps * (1 - ψ) * Math.sqrt(-ψ);
  }
  return { c1, c2, c3 };
}

// ── Classification of loose plates (lateral / custom-position) ──────────────
// Clasificación ORIENTATIVA de chapas comprimidas como elemento INTERNO
// (apoyado en ambos bordes) con la α/ψ de su posición: c = dimensión mayor,
// t = menor. Verticales: gradiente de flexión (reproduce los límites de
// alma); horizontales comprimidas: α=1/ψ=1 → 33/38/42·ε. El supuesto
// «interno» puede ser optimista para vuelos libres en modo custom — la fila
// lo documenta. Cierra el hueco de clase 4 silenciosa (fixes #101, #103).
function classifyLoosePlate(
  yBot: number, h: number, w: number,
  yc: number, y_pna: number, eps: number,
): { cls: 1 | 2 | 3 | 4; ratio: number; lim: number } | null {
  const yTop = yBot + h;
  const sigTop = yTop - yc;            // compresión positiva (M+)
  if (sigTop <= 0) return null;        // chapa íntegramente en tracción
  let c: number, t: number, alpha: number, psi: number;
  if (h >= w) {
    // Vertical: gradiente de flexión a lo largo de su altura
    c = h; t = w;
    alpha = Math.min(Math.max((yTop - Math.max(y_pna, yBot)) / Math.max(h, 1), 0), 1);
    psi = (yBot - yc) / sigTop;
  } else {
    // Horizontal: panel a cota ~constante — comprimida uniforme (lado seguro)
    c = w; t = h;
    alpha = 1;
    psi = 1;
  }
  const lims = webLimitsShifted(alpha, Math.min(psi, 1), eps);
  const ratio = c / Math.max(t, 1e-6);
  const cls: 1 | 2 | 3 | 4 = ratio <= lims.c1 ? 1 : ratio <= lims.c2 ? 2 : ratio <= lims.c3 ? 3 : 4;
  const lim = cls === 1 ? lims.c1 : cls === 2 ? lims.c2 : lims.c3;
  return { cls, ratio, lim };
}

// ── Overlap detection (#105) ─────────────────────────────────────────────────
interface Rect { x0: number; x1: number; y0: number; y1: number }

function rectOverlapArea(a: Rect, b: Rect): number {
  const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}

// ── main calc ─────────────────────────────────────────────────────────────────

export function calcCompositeSection(inp: CompositeSectionInputs): CompositeSectionResult {
  const section = inp.mode === 'reinforced'
    ? makeISectionBySize(inp.profileType, inp.profileSize)
    : undefined;
  // `.profile` = the underlying SteelProfile record; kept for direct field
  // access (h, b, tf, tw, r, A, Iy, label). SectionGeometry exposes the
  // same fields but this module reads them so many times that aliasing
  // keeps the diff small.
  const profile = section?.profile;

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

  // fy del elemento más desfavorable: t>16 → fila gruesa (fix auditoría #99).
  // Para laterales el espesor del elemento es b (extensión horizontal).
  const t_max = Math.max(
    profile?.tf ?? 0,
    0,
    ...inp.plates.map((p) => (p.posType === 'left' || p.posType === 'right') ? p.b : p.t),
  );
  const fy = t_max > 16
    ? (FY_MAP_THICK[inp.grade] ?? 265)
    : (FY_MAP[inp.grade] ?? 275);

  // ── resolve plate positions ─────────────────────────────────────────────────
  const h_base = profile?.h ?? 0;
  // Laterales: altura libre SIN los acuerdos (antes h−2tf pisaba la zona de
  // r y duplicaba ~1 cm² por chapa — fix auditoría #106).
  const web_h = profile ? Math.max(profile.h - 2 * profile.tf - 2 * profile.r, 1) : 0;

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
        // Plate runs the web clear height BETWEEN fillets; b = horizontal
        // extent from web face (fix #106: antes arrancaba en tf y solapaba
        // los acuerdos).
        yBottom = profile!.tf + profile!.r;
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

  const { Wpl: Wpl_mm3, y_pna: y_pna_mm } = computeWplAndPNA(buildStripElements(elements));

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

  // Web geometry + class-limit values (for the `limit` column of the check row).
  // Filled below for reinforced mode; stay null for custom mode.
  let webLimC1 = 0, webLimC2 = 0, webLimC3 = 0;

  if (inp.mode === 'reinforced' && profile) {
    epsilon = Math.sqrt(235 / fy);

    // Web — clear height between fillets
    const c_w = profile.h - 2 * profile.tf - 2 * profile.r;
    webRatio = c_w / profile.tw;

    // ── α and ψ for the web — accounts for shifted PNA from cover plates ──
    // The profile sits at y ∈ [shift, shift + profile.h]. The web clear region
    // is [shift + tf + r, shift + h − tf − r] (height = c_w).
    // α = (compressed depth of web) / c_w — measured from the plastic NA.
    // ψ = σ_bottom / σ_top — elastic stresses at web clear bounds; for pure
    //     bending this reduces to a simple y-ratio around the elastic NA.
    const web_y_bot = shift + profile.tf + profile.r;
    const web_y_top = shift + profile.h - profile.tf - profile.r;
    // Plastic: compressed part of the web is from y_pna to web_y_top
    //   (sign convention: positive M puts the top in compression).
    const compressed_depth = Math.max(0, Math.min(web_y_top, web_y_top - Math.max(y_pna_mm, web_y_bot)));
    const α_web = Math.min(Math.max(compressed_depth / Math.max(c_w, 1), 0), 1);
    // Elastic stress ratio at the web boundaries (signs: positive = compression)
    const σ_top_web = web_y_top - yc;
    const σ_bot_web = web_y_bot - yc;
    const ψ_web = σ_top_web !== 0 ? (σ_bot_web / σ_top_web) : -1;

    const webLims = webLimitsShifted(α_web, ψ_web, epsilon);
    webLimC1 = webLims.c1;
    webLimC2 = webLims.c2;
    webLimC3 = webLims.c3;
    webClass = webRatio <= webLimC1 ? 1
             : webRatio <= webLimC2 ? 2
             : webRatio <= webLimC3 ? 3
             : 4;

    // Bottom flange outstand (rolled I: fillet included)
    const c_f_bot = (profile.b - profile.tw - 2 * profile.r) / 2;
    flangeBotRatio = c_f_bot / profile.tf;
    flangeBotClass = classifyElement(flangeBotRatio, FLG_LIMITS, epsilon);

    // Top flange — platabandas clasificadas respecto a sus APOYOS REALES
    // (soldaduras al ala/chapa inferior), no como voladas desde el alma
    // (fix auditoría #100: (b−tw)/2 daba clase 4 y Mrd=N/D a chapas anchas
    // y delgadas perfectamente válidas). Cada chapa apilada se comprueba
    // (fix #104: antes solo la más ancha):
    //   - vuelo = max(0, (b − b_soporte)/2) con límites de vuelo 9/10/14
    //   - panel interno = min(b, b_soporte) con límites internos 33/38/42
    const topPlates = resolvedPlates.filter((rp) => rp.plate.posType === 'top');
    let ftLimGov: number | null = null;   // límite (en unidades de ratio) del subelemento que gobierna
    let ftUtilGov: number | null = null;
    if (topPlates.length > 0) {
      let supportWidth = profile.b;
      let worst: { cls: 1 | 2 | 3 | 4; ratio: number; util: number; lim: number } | null = null;
      for (const rp of topPlates) {
        const b_p = rp.plate.b;
        const t_p = rp.plate.t;
        const outRatio = Math.max(0, (b_p - supportWidth) / 2) / t_p;
        const outCls = classifyElement(outRatio, FLG_LIMITS, epsilon);
        const outUtil = classUtil(outRatio, outCls, FLG_LIMITS, epsilon);
        const outLim = FLG_LIMITS[Math.min(outCls - 1, 2)] * epsilon;
        const intRatio = Math.min(b_p, supportWidth) / t_p;
        const intCls = classifyElement(intRatio, INT_LIMITS, epsilon);
        const intUtil = classUtil(intRatio, intCls, INT_LIMITS, epsilon);
        const intLim = INT_LIMITS[Math.min(intCls - 1, 2)] * epsilon;
        const plateWorst = (outCls > intCls || (outCls === intCls && outUtil >= intUtil))
          ? { cls: outCls, ratio: outRatio, util: outUtil, lim: outLim }
          : { cls: intCls, ratio: intRatio, util: intUtil, lim: intLim };
        if (!worst || plateWorst.cls > worst.cls
          || (plateWorst.cls === worst.cls && plateWorst.util > worst.util)) {
          worst = plateWorst;
        }
        supportWidth = b_p;
      }
      flangeTopRatio = worst!.ratio;
      flangeTopClass = worst!.cls;
      ftLimGov = worst!.lim;
      ftUtilGov = worst!.util;
    } else {
      flangeTopRatio = flangeBotRatio;
      flangeTopClass = flangeBotClass;
    }

    sectionClass = Math.max(webClass, flangeTopClass, flangeBotClass) as 1 | 2 | 3 | 4;

    // Build check rows — α/ψ-shifted limits for the web (see webLimitsShifted).
    // (#107: webLimVal/webLimRef eran expresiones duplicadas — unificadas.)
    const webLimVal = webClass === 1 ? webLimC1
                    : webClass === 2 ? webLimC2
                    : webLimC3;
    checks.push({
      id: 'cls-web',
      description: 'Alma',
      value: `${webRatio.toFixed(1)}`,
      limit: `≤ ${webLimVal.toFixed(1)} (Cl.${webClass})`,
      utilization: Math.min(webRatio / Math.max(webLimVal, 1e-6), 2),
      status: webClass <= 2 ? 'ok' : webClass === 3 ? 'warn' : 'fail',
      article: 'CE art. 5.2 T.5.2',
    });

    const ftLimVal = ftLimGov ?? FLG_LIMITS[Math.min(flangeTopClass - 1, 2)] * epsilon;
    const ftUtil = ftUtilGov ?? classUtil(flangeTopRatio, flangeTopClass, FLG_LIMITS, epsilon);
    checks.push({
      id: 'cls-flange-top',
      description: topPlates.length > 0 ? 'Ala superior (platabanda)' : 'Ala superior',
      value: `${flangeTopRatio.toFixed(1)}`,
      limit: `≤ ${ftLimVal.toFixed(1)} (Cl.${flangeTopClass})`,
      utilization: ftUtil,
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

  // ── Clasificación de chapas sueltas (laterales y posición custom) ─────────
  // Cierra el hueco de clase 4 silenciosa (fixes auditoría #101, #103): en
  // modo custom se comprueban TODAS las chapas; en reinforced, las que no
  // cubre el modelo alma/alas (custom/left/right). Clasificación orientativa
  // como elemento interno con la α/ψ de su posición (ver classifyLoosePlate).
  const epsLoose = Math.sqrt(235 / fy);
  let loosePlateClass4 = false;
  {
    const candidates = elements.filter((e) => !e.isProfile && (
      inp.mode === 'custom'
      || e.posType === 'custom' || e.posType === 'left' || e.posType === 'right'
    ));
    let i = 0;
    for (const el of candidates) {
      i += 1;
      const res = classifyLoosePlate(el.yBottom_mm, el.height_mm, el.width_mm, yc, y_pna_mm, epsLoose);
      if (!res) continue;  // íntegramente en tracción → sin pandeo local
      if (res.cls === 4) loosePlateClass4 = true;
      if (sectionClass !== null) {
        sectionClass = Math.max(sectionClass, res.cls) as 1 | 2 | 3 | 4;
      }
      checks.push({
        id: `cls-plate-${i}`,
        description: `Chapa ${el.label} (interno supuesto)`,
        value: res.ratio.toFixed(1),
        limit: `≤ ${res.lim.toFixed(1)} (Cl.${res.cls})`,
        utilization: Math.min(res.ratio / Math.max(res.lim, 1e-6), 2),
        status: res.cls <= 2 ? 'ok' : res.cls === 3 ? 'warn' : 'fail',
        article: 'CE Anejo 22 T.5.2 (orientativo)',
      });
    }
  }

  // ── Detección de solapes (#105) ────────────────────────────────────────────
  // Una chapa incrustada en el perfil (o dos coincidentes) duplicaba área e
  // inercia sin aviso. El perfil se descompone en sus 3 rectángulos; los
  // contactos cara-a-cara legítimos tienen área de solape nula.
  {
    const rects: Rect[] = [];
    for (const e of elements) {
      if (e.isProfile && e.profileTf_mm && e.profileTw_mm) {
        const b = e.width_mm, hh = e.height_mm, tf = e.profileTf_mm, tw = e.profileTw_mm, y0 = e.yBottom_mm;
        rects.push({ x0: -b / 2, x1: b / 2, y0, y1: y0 + tf });
        rects.push({ x0: -tw / 2, x1: tw / 2, y0: y0 + tf, y1: y0 + hh - tf });
        rects.push({ x0: -b / 2, x1: b / 2, y0: y0 + hh - tf, y1: y0 + hh });
      } else {
        rects.push({
          x0: e.xCenter_mm - e.width_mm / 2, x1: e.xCenter_mm + e.width_mm / 2,
          y0: e.yBottom_mm, y1: e.yBottom_mm + e.height_mm,
        });
      }
    }
    let overlapArea = 0;
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        overlapArea += rectOverlapArea(rects[a], rects[b]);
      }
    }
    if (overlapArea > 1) {
      checks.push({
        id: 'overlap',
        description: 'Solape geométrico entre elementos — área e inercia contadas dos veces',
        value: `${(overlapArea / 100).toFixed(1)} cm²`,
        limit: '0 cm²',
        utilization: 1,
        status: 'warn',
        article: '—',
      });
    }
  }

  // ── Nota de convención de signo (#102) ─────────────────────────────────────
  // La clasificación α/ψ asume compresión en la fibra SUPERIOR; bajo flexión
  // negativa la clase (y el Mrd de clase 3/4) puede ser peor (hasta −27% en
  // el caso verificado).
  checks.push({
    id: 'sign-note',
    description: 'Clase y Mrd válidos para flexión positiva (compresión en fibra superior)',
    value: '',
    limit: '',
    utilization: 0,
    status: 'neutral',
    article: 'CE Anejo 22 §5.5',
    neutral: true,
    tag: 'M+',
  });

  // ── Mmax,Rd ────────────────────────────────────────────────────────────────
  // Modo custom: la clasificación es parcial (elementos internos supuestos),
  // así que NO se sube a Wpl — se mantiene Wel_min (elástico). Pero la clase 4
  // detectada en cualquier chapa sí invalida también el módulo elástico
  // (EN 1993-1-5 exige sección eficaz, no implementada) → Mrd = 0 con warning
  // (fix auditoría #101: antes un alma 400×3 S355 daba Mrd elástico completo).
  const class4Warning = sectionClass === 4 || loosePlateClass4;
  let Mrd_Nmm: number;
  if (class4Warning) {
    // Clase 4: sección eficaz (EN 1993-1-5) no implementada — no se reporta Mrd
    Mrd_Nmm = 0;
  } else if (sectionClass === 1 || sectionClass === 2) {
    Mrd_Nmm = Wpl_mm3 * fy / GAMMA_M0;
  } else {
    // Clase 3 y modo custom (clasificación parcial) → módulo elástico
    Mrd_Nmm = Wel_min * fy / GAMMA_M0;
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

