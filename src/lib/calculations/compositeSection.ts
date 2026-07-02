// Composite steel section — Steiner theorem + EC3/CE classification
// CE art. 5.2 / EC3 Table 5.2 (EN 1993-1-1)
// All internal calculations in mm and mm⁴. Display in cm⁴, cm³, kNm.

import { type CompositeSectionInputs, type PlateEntry } from '../../data/defaults';
import { makeISectionBySize } from '../sections';
import { type CheckRow, makeCheckQty, makeCheckNeutral, toStatus } from './types';
import { bucklingChi, BUCKLING_ALPHA } from './buckling';
import { getBetaForBCType } from './steelColumnBC';

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
const GAMMA_M1 = 1.05;
const E_STEEL = 210000;          // N/mm² — módulo de Young
const SLEND_MAX = 2.0;           // esbeltez reducida recomendada (CTE DB-SE-A)
// Curva de pandeo del conjunto soldado (perfil + chapas): curva c fija en
// ambos ejes (α=0.49). Decisión conservadora para una sección armada soldada
// no normalizada (EC3 Tabla 6.2, lado seguro). Ver plan / decisión de usuario.
const COMPOSITE_BUCKLING_ALPHA = BUCKLING_ALPHA.c;

export interface SectionElement {
  A_mm2: number;
  yc_mm: number;         // centroid from section bottom (after re-basing)
  Iy_own_mm4: number;
  Iz_own_mm4: number;    // about the element's own vertical centroidal axis
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
  // Weak axis (z)
  xc_mm: number;
  Iz_cm4: number;
  Wel_z_min_cm3: number;
  Wpl_z_cm3: number;        // informativo (Mrd_z se calcula elástico)
  Mrd_z_kNm: number;
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
  // Compression / buckling (reinforced mode; defaults when N/A)
  compApplicable: boolean;          // true si se calculó el bloque de compresión
  sectionClassCompression: 1 | 2 | 3 | 4 | null;
  compClass4: boolean;
  lambda_y: number;
  lambda_z: number;
  chi_y: number;
  chi_z: number;
  Nb_Rd_y_kN: number;
  Nb_Rd_z_kN: number;
  Nc_Rd_kN: number;                 // min(Nb,Rd,y, Nb,Rd,z) — carga gobernante
  Ned_kN: number;
  compUtil: number;                 // Ned/Nc_Rd (0 si Ned=0)
  compChecks: CheckRow[];
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
    xc_mm: 0, Iz_cm4: 0, Wel_z_min_cm3: 0, Wpl_z_cm3: 0, Mrd_z_kNm: 0,
    epsilon: null, webRatio: null, webClass: null,
    flangeTopRatio: null, flangeTopClass: null,
    flangeBotRatio: null, flangeBotClass: null,
    sectionClass: null,
    fy_MPa: 275, Mrd_kNm: 0, class4Warning: false,
    compApplicable: false, sectionClassCompression: null, compClass4: false,
    lambda_y: 0, lambda_z: 0, chi_y: 0, chi_z: 0,
    Nb_Rd_y_kN: 0, Nb_Rd_z_kN: 0, Nc_Rd_kN: 0, Ned_kN: 0, compUtil: 0,
    compChecks: [],
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

// ── PNA / Wpl via the strip method (axis-agnostic core) ──────────────────────
// `AxisStrip` es agnóstico al eje: `lo` = coordenada inferior a lo largo del eje
// de flexión (y para Wpl_y, x para Wpl_z), `span` = extensión de la franja en
// ese eje, `mass` = dimensión perpendicular que aporta área. Los dos builders
// difieren (el perfil en I se descompone distinto según el eje), pero el PNA y
// el Wpl se calculan con `computeWplAndPna`. El perfil se descompone en
// rectángulos REALES (no macizo b×h): tratarlo como sólido colocaría el PNA mal
// y sobreestimaría Wpl. Ignora el radio de acuerdo (ligeramente conservador).

interface AxisStrip { lo: number; span: number; mass: number }

function buildStripElements(elements: SectionElement[]): AxisStrip[] {
  // Eje fuerte (y): franjas HORIZONTALES. lo=yBottom, span=altura, mass=ancho.
  const result: AxisStrip[] = [];
  for (const e of elements) {
    if (e.isProfile && e.profileTf_mm && e.profileTw_mm) {
      const { profileTf_mm: tf, profileTw_mm: tw, width_mm: b, height_mm: h, yBottom_mm: yBot } = e;
      result.push({ lo: yBot,          span: tf,        mass: b  }); // ala inferior
      result.push({ lo: yBot + tf,     span: h - 2 * tf, mass: tw }); // alma
      result.push({ lo: yBot + h - tf, span: tf,        mass: b  }); // ala superior
    } else {
      result.push({ lo: e.yBottom_mm, span: e.height_mm, mass: e.width_mm });
    }
  }
  return result;
}

function buildStripElementsZ(elements: SectionElement[]): AxisStrip[] {
  // Eje débil (z): franjas VERTICALES (columnas en x). lo=xLeft, span=ancho,
  // mass=altura. El perfil en I → 3 columnas: central (ancho tw, altura total h)
  // y dos columnas de ala (ancho (b−tw)/2, altura 2·tf).
  const result: AxisStrip[] = [];
  for (const e of elements) {
    if (e.isProfile && e.profileTf_mm && e.profileTw_mm) {
      const tf = e.profileTf_mm, tw = e.profileTw_mm, b = e.width_mm, h = e.height_mm, xc = e.xCenter_mm;
      result.push({ lo: xc - tw / 2, span: tw,           mass: h      }); // columna central
      result.push({ lo: xc - b / 2,  span: (b - tw) / 2, mass: 2 * tf }); // ala izquierda
      result.push({ lo: xc + tw / 2, span: (b - tw) / 2, mass: 2 * tf }); // ala derecha
    } else {
      result.push({ lo: e.xCenter_mm - e.width_mm / 2, span: e.width_mm, mass: e.height_mm });
    }
  }
  return result;
}

// PNA de áreas iguales + módulo plástico respecto al PNA, sobre franjas
// axis-agnósticas. Usa el área del PROPIO modelo de franjas (no el área total
// con acuerdos): mezclarlas desplazaría el PNA en secciones simétricas.
function computeWplAndPna(strips: AxisStrip[]): { Wpl: number; pna: number } {
  const bndSet = new Set<number>();
  for (const e of strips) {
    bndSet.add(e.lo);
    bndSet.add(e.lo + e.span);
  }
  const bnds = Array.from(bndSet).sort((a, b) => a - b);

  interface Slice { a: number; b: number; mass: number }
  const slices: Slice[] = [];
  for (let i = 0; i < bnds.length - 1; i++) {
    const a = bnds[i];
    const b = bnds[i + 1];
    const mid = (a + b) / 2;
    let mass = 0;
    for (const e of strips) {
      if (e.lo <= mid && mid < e.lo + e.span) mass += e.mass;
    }
    if (mass > 0) slices.push({ a, b, mass });
  }

  const total = slices.reduce((s, sl) => s + sl.mass * (sl.b - sl.a), 0);
  const halfA = total / 2;
  let cumArea = 0;
  let pna = 0;
  for (const sl of slices) {
    const area = sl.mass * (sl.b - sl.a);
    if (cumArea + area >= halfA) {
      pna = sl.a + (halfA - cumArea) / sl.mass;
      break;
    }
    cumArea += area;
    pna = sl.b;
  }

  // Wpl = suma de momentos de cada franja respecto al PNA
  let Wpl = 0;
  for (const sl of slices) {
    const { a, b, mass: m } = sl;
    if (b <= pna) {
      Wpl += m * (b - a) * (pna - (a + b) / 2);
    } else if (a >= pna) {
      Wpl += m * (b - a) * ((a + b) / 2 - pna);
    } else {
      Wpl += m * (pna - a) * (pna - (a + pna) / 2);
      Wpl += m * (b - pna) * ((pna + b) / 2 - pna);
    }
  }
  return { Wpl, pna };
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

// ── Classification in PURE COMPRESSION (EC3 Tabla 5.2) ───────────────────────
// Distinta de la clasificación en flexión (que gobierna Mrd): aquí todos los
// elementos están en compresión uniforme. Alma y chapas internas → 33/38/42·ε;
// alas → vuelo 9/10/14·ε SALVO que dos chapas laterales ancladas a las alas
// (izq. Y der.) cierren el cajón, en cuyo caso las alas pasan a interno. Las
// chapas laterales se clasifican como panel interno (orientativo, lado seguro),
// igual que classifyLoosePlate. Devuelve la clase gobernante + filas de check.
interface ResolvedPlateLite { plate: PlateEntry; height: number; width: number }

function classifyCompression(
  profile: { h: number; b: number; tf: number; tw: number; r: number },
  resolvedPlates: ResolvedPlateLite[],
  eps: number,
): { cls: 1 | 2 | 3 | 4; checks: CheckRow[] } {
  const checks: CheckRow[] = [];
  let govCls: 1 | 2 | 3 | 4 = 1;

  const pushCheck = (
    id: string, desc: string, ratio: number,
    cls: 1 | 2 | 3 | 4, limits: [number, number, number],
  ) => {
    const lim = (cls === 1 ? limits[0] : cls === 2 ? limits[1] : limits[2]) * eps;
    checks.push({
      id, description: desc,
      value: ratio.toFixed(1),
      limit: `≤ ${lim.toFixed(1)} (Cl.${cls})`,
      utilization: Math.min(ratio / Math.max(lim, 1e-6), 2),
      status: cls <= 2 ? 'ok' : cls === 3 ? 'warn' : 'fail',
      article: 'CE Anejo 22 T.5.2 (compresión)',
    });
    if (cls > govCls) govCls = cls;
  };

  // Cierre de cajón: lateral anclada a las alas a ambos lados → alas internas.
  const hasFlangeLeft = resolvedPlates.some(
    (rp) => rp.plate.posType === 'left' && (rp.plate.lateralAnchor ?? 'web') === 'flange');
  const hasFlangeRight = resolvedPlates.some(
    (rp) => rp.plate.posType === 'right' && (rp.plate.lateralAnchor ?? 'web') === 'flange');
  const boxClosed = hasFlangeLeft && hasFlangeRight;

  // Alma — interno en compresión uniforme
  const c_w = profile.h - 2 * profile.tf - 2 * profile.r;
  const webRatio = c_w / profile.tw;
  pushCheck('cls-comp-web', 'Alma (compresión)', webRatio,
    classifyElement(webRatio, INT_LIMITS, eps), INT_LIMITS);

  // Alas — vuelo, o interno cuando el cajón está cerrado a ambos lados
  const c_f = (profile.b - profile.tw - 2 * profile.r) / 2;
  const flgRatio = c_f / profile.tf;
  const flgLimits = boxClosed ? INT_LIMITS : FLG_LIMITS;
  pushCheck('cls-comp-flange', boxClosed ? 'Alas (cajón → interno)' : 'Alas (vuelo)',
    flgRatio, classifyElement(flgRatio, flgLimits, eps), flgLimits);

  // Chapas — las platabandas apiladas se clasifican respecto a su APOYO REAL
  // (el ala o la chapa anterior de su pila), igual que la clasificación en
  // flexión (fix #104). Antes todas usaban profile.b: una chapa más ancha que
  // la anterior veía un vuelo menor del real y una clase 4 quedaba oculta →
  // Nc,Rd sobreestimado (fix auditoría #108).
  let topSupport = profile.b;
  let bottomSupport = profile.b;
  let i = 0;
  for (const rp of resolvedPlates) {
    i += 1;
    const pos = rp.plate.posType;
    if (pos === 'top' || pos === 'bottom') {
      // Compresión uniforme: vuelo más allá del soporte + panel interno.
      const b_p = rp.plate.b;
      const t_p = rp.plate.t;
      const support = pos === 'top' ? topSupport : bottomSupport;
      const outRatio = Math.max(0, (b_p - support) / 2) / t_p;
      const outCls = classifyElement(outRatio, FLG_LIMITS, eps);
      const intRatio = Math.min(b_p, support) / t_p;
      const intCls = classifyElement(intRatio, INT_LIMITS, eps);
      if (outCls >= intCls) pushCheck(`cls-comp-plate-${i}`, `Chapa ${pos} (vuelo)`, outRatio, outCls, FLG_LIMITS);
      else pushCheck(`cls-comp-plate-${i}`, `Chapa ${pos} (interno)`, intRatio, intCls, INT_LIMITS);
      if (pos === 'top') topSupport = b_p; else bottomSupport = b_p;
    } else if (pos === 'left' || pos === 'right' || pos === 'custom') {
      // Panel interno orientativo: c = lado mayor, t = lado menor (= espesor b).
      // Incluye las chapas 'custom' (antes se omitían): sin clasificarlas, una
      // chapa custom esbelta (clase 4 en compresión) no activaba compClass4 y
      // Nc,Rd quedaba sobreestimado — misma «clase 4 silenciosa» que cerraron
      // las auditorías #101/#103 en flexión.
      const c = Math.max(rp.height, rp.width);
      const t = Math.max(Math.min(rp.height, rp.width), 1e-6);
      const ratio = c / t;
      const label = pos === 'custom' ? 'Chapa custom (interno supuesto)' : 'Chapa lateral (interno supuesto)';
      pushCheck(`cls-comp-plate-${i}`, label,
        ratio, classifyElement(ratio, INT_LIMITS, eps), INT_LIMITS);
    }
  }

  return { cls: govCls, checks };
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
      case 'right': {
        // Anclaje 'web' (def.): pegada al alma, altura libre entre acuerdos
        // (fix #106). Anclaje 'flange': pegada a la punta del ala, altura total
        // h → cierra cajón ala-a-ala (afecta a la clasificación en compresión
        // y a la inercia Iz). La posición horizontal se fija más abajo.
        const anchor = plate.lateralAnchor ?? 'web';
        if (anchor === 'flange') {
          yBottom = 0;
          height = profile!.h;
        } else {
          yBottom = profile!.tf + profile!.r;
          height = web_h;
        }
        width = plate.b;
        break;
      }
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
      Iz_own_mm4: profile.Iz * 10000,
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
    if ((plate.posType === 'left' || plate.posType === 'right') && profile) {
      // Cara interior de la chapa: al alma (tw/2) o a la punta del ala (b/2),
      // más el desfase fino hacia afuera.
      const anchor = plate.lateralAnchor ?? 'web';
      const off = plate.lateralOffset ?? 0;
      const innerFace = (anchor === 'flange' ? profile.b / 2 : profile.tw / 2) + off;
      const sign = plate.posType === 'left' ? -1 : 1;
      xCenter_mm = sign * (innerFace + width / 2);
    }
    const label = (plate.posType === 'left' || plate.posType === 'right')
      ? `${width}×${height.toFixed(0)}`
      : `${plate.b}×${plate.t}`;

    elements.push({
      A_mm2: width * height,
      yc_mm: yc,
      Iy_own_mm4: width * Math.pow(height, 3) / 12,
      Iz_own_mm4: height * Math.pow(width, 3) / 12,
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

  // ── weak axis (z): centroide horizontal, Iz por Steiner, Wel_z ──────────────
  const xc = elements.reduce((s, e) => s + e.A_mm2 * e.xCenter_mm, 0) / A_total;
  const Iz_total = elements.reduce(
    (s, e) => s + e.Iz_own_mm4 + e.A_mm2 * Math.pow(e.xCenter_mm - xc, 2),
    0,
  );
  const x_left = Math.min(...elements.map((e) => e.xCenter_mm - e.width_mm / 2));
  const x_right = Math.max(...elements.map((e) => e.xCenter_mm + e.width_mm / 2));
  const Wel_z_left = Iz_total / Math.max(xc - x_left, 1);
  const Wel_z_right = Iz_total / Math.max(x_right - xc, 1);
  const Wel_z_min = Math.min(Wel_z_left, Wel_z_right);

  const y_top = Math.max(...elements.map((e) => e.yBottom_mm + e.height_mm));
  const totalHeight = y_top;

  const Wel_top = Iy_total / Math.max(y_top - yc, 1);
  const Wel_bot = Iy_total / Math.max(yc, 1);
  const Wel_min = Math.min(Wel_top, Wel_bot);

  const { Wpl: Wpl_mm3, pna: y_pna_mm } = computeWplAndPna(buildStripElements(elements));
  const { Wpl: Wpl_z_mm3 } = computeWplAndPna(buildStripElementsZ(elements));

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

  // ── Mrd eje z (débil) ───────────────────────────────────────────────────────
  // Decisión de ingeniería (lado seguro): SIEMPRE elástico (Wel_z_min). No se
  // sube a Wpl_z porque la clasificación de las alas en flexión-z no está
  // implementada (las alas trabajan en su plano). Wpl_z se expone informativo.
  // Clase 4 (en flexión y) → Mrd_z = 0 por coherencia con Mrd_y.
  const Mrd_z_Nmm = class4Warning ? 0 : Wel_z_min * fy / GAMMA_M0;

  // ── Resistencia a compresión con pandeo en ambos ejes ───────────────────────
  // Solo modo reinforced (necesita perfil con geometría definida para clasificar
  // en compresión). Curva c fija (α=0.49). Reutiliza bucklingChi y getBetaForBCType.
  let compApplicable = false;
  let sectionClassCompression: 1 | 2 | 3 | 4 | null = null;
  let compClass4 = false;
  let lambda_y = 0, lambda_z = 0, chi_y = 0, chi_z = 0;
  let Nb_Rd_y_kN = 0, Nb_Rd_z_kN = 0, Nc_Rd_kN = 0, compUtil = 0;
  const Ned_kN = Math.max(0, inp.Ned ?? 0);
  const compChecks: CheckRow[] = [];

  if (inp.mode === 'reinforced' && profile) {
    const { beta_y, beta_z } = getBetaForBCType(inp.bcType, inp.beta_y, inp.beta_z);
    // Guard suave: datos de pandeo inválidos → se omite el bloque (sin invalidar
    // la sección, a diferencia de pilares).
    if (inp.Ly > 0 && inp.Lz > 0 && beta_y > 0 && beta_z > 0) {
      compApplicable = true;
      const epsC = Math.sqrt(235 / fy);
      const clsComp = classifyCompression(
        profile,
        resolvedPlates.map((rp) => ({ plate: rp.plate, height: rp.height, width: rp.width })),
        epsC,
      );
      sectionClassCompression = clsComp.cls;
      compClass4 = clsComp.cls === 4;
      compChecks.push(...clsComp.checks);

      const A_cm2 = A_total / 100;
      const Iy_cm4 = Iy_total / 10000;
      const Iz_cm4 = Iz_total / 10000;
      const NRk = A_cm2 * fy * 0.1;                 // kN
      const i_y_mm = 10 * Math.sqrt(Iy_cm4 / A_cm2);
      const i_z_mm = 10 * Math.sqrt(Iz_cm4 / A_cm2);
      const lambda1 = Math.PI * Math.sqrt(E_STEEL / fy);
      lambda_y = (beta_y * inp.Ly / i_y_mm) / lambda1;
      lambda_z = (beta_z * inp.Lz / i_z_mm) / lambda1;
      // Clase 4 → χ = 0 (sin sección eficaz; no se aporta resistencia)
      chi_y = compClass4 ? 0 : bucklingChi(lambda_y, COMPOSITE_BUCKLING_ALPHA);
      chi_z = compClass4 ? 0 : bucklingChi(lambda_z, COMPOSITE_BUCKLING_ALPHA);
      Nb_Rd_y_kN = chi_y * NRk / GAMMA_M1;
      Nb_Rd_z_kN = chi_z * NRk / GAMMA_M1;
      Nc_Rd_kN = Math.min(Nb_Rd_y_kN, Nb_Rd_z_kN);
      compUtil = Nc_Rd_kN > 0 ? Ned_kN / Nc_Rd_kN : (Ned_kN > 0 ? Infinity : 0);

      if (compClass4) {
        compChecks.push({
          id: 'comp-class4',
          description: 'Sección Clase 4 en compresión — Nc,Rd no disponible (sección eficaz EN 1993-1-5 no implementada)',
          value: '', limit: '', utilization: 1, status: 'fail',
          article: 'CE Anejo 22 §6.3.1',
        });
      } else {
        compChecks.push(makeCheckQty('comp-Nby',
          `Pandeo eje y  (λ̄=${lambda_y.toFixed(2)}, χ=${chi_y.toFixed(2)})`,
          Ned_kN, Nb_Rd_y_kN, 'force', 'CE Anejo 22 (EC3) §6.3.1'));
        compChecks.push(makeCheckQty('comp-Nbz',
          `Pandeo eje z  (λ̄=${lambda_z.toFixed(2)}, χ=${chi_z.toFixed(2)})`,
          Ned_kN, Nb_Rd_z_kN, 'force', 'CE Anejo 22 (EC3) §6.3.1'));
        // Esbeltez reducida recomendada λ̄ ≤ 2.0
        compChecks.push({
          id: 'comp-sy', description: `Esbeltez reducida  λ̄ (eje y) = ${lambda_y.toFixed(2)}`,
          value: lambda_y.toFixed(2), limit: SLEND_MAX.toFixed(1),
          utilization: lambda_y / SLEND_MAX, status: toStatus(lambda_y / SLEND_MAX),
          article: 'CTE DB-SE-A 6.3 (recomendación)',
        });
        compChecks.push({
          id: 'comp-sz', description: `Esbeltez reducida  λ̄ (eje z) = ${lambda_z.toFixed(2)}`,
          value: lambda_z.toFixed(2), limit: SLEND_MAX.toFixed(1),
          utilization: lambda_z / SLEND_MAX, status: toStatus(lambda_z / SLEND_MAX),
          article: 'CTE DB-SE-A 6.3 (recomendación)',
        });
      }

      // Nota informativa (análoga a la de signo M+): solo se comprueba el pandeo
      // POR FLEXIÓN en los ejes y/z. El pandeo por torsión y flexo-torsión
      // (EC3 §6.3.1.4) no se verifica y puede gobernar en secciones
      // monosimétricas (una sola platabanda, o chapa lateral a un solo lado) o
      // abiertas de baja rigidez torsional. Se muestra siempre que hay bloque
      // de compresión, también con clase 4, para no dar por cubierto un modo
      // que el módulo no calcula.
      compChecks.push(makeCheckNeutral(
        'comp-tf-note',
        'Solo pandeo por flexión (ejes y, z). Torsión / flexo-torsión (§6.3.1.4) no comprobada — puede gobernar en secciones monosimétricas o de baja rigidez torsional',
        'T·FT',
        'CE Anejo 22 (EC3) §6.3.1.4',
      ));
    }
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
    xc_mm: xc,
    Iz_cm4: Iz_total / 10000,
    Wel_z_min_cm3: Wel_z_min / 1000,
    Wpl_z_cm3: Wpl_z_mm3 / 1000,
    Mrd_z_kNm: Mrd_z_Nmm / 1e6,
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
    compApplicable,
    sectionClassCompression,
    compClass4,
    lambda_y,
    lambda_z,
    chi_y,
    chi_z,
    Nb_Rd_y_kN,
    Nb_Rd_z_kN,
    Nc_Rd_kN,
    Ned_kN,
    compUtil,
    compChecks,
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

