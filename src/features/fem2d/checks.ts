// FEM 2D — member checks (Lane B, Fase 4: T5 + T6 + T7)
//
// T6 — REAL multi-principal combinations. Member forces for every check come
//   from CTE Tabla 4.2 combinations (frame-core buildLcCombinations), iterated
//   one by one with the worst η kept per check id — NEVER the summed
//   `1.35·G + 1.5·(Q+W+S+E)` bucket the 1D display path used (eng-review
//   mandatory fix; unconservative-in-combination and blind to the governing
//   lateral case).
//
// T5 — MECHANISM routing (Fase 2, design doc 2026-07-28 — el rol murió aquí).
//   Ninguna comprobación se elige por etiqueta: la eligen el material, los
//   DATOS del usuario (rcDesignKind, deflLimit, ltbSpacing, weakAxisBracing,
//   rótulas) y la DEMANDA medida del solver.
//     ACERO (steelChecks, tabla de propietarios del design doc):
//         formulación derivada 'two-force' → camino axil autónomo (tracción
//         A·fy/γM0 + pandeo χ·A·fy/γM1, curva c α=0.49; con weakAxisBracing
//         se comprueban AMBOS ejes y gobierna el menor Nb).
//         Perfil sin motor de flexión (L) → mismo camino axil si la demanda de
//         flexión es despreciable; con demanda real, PENDIENTE honesto (D11).
//         Resto → calcSteelBeam SIEMPRE (flexión, cortante, M-V §6.2.8, vuelco
//         con Lcr = min(ltbSpacing, L), flecha real del solver contra el
//         deflLimit del usuario) y, con COMPRESIÓN RELEVANTE (η_N eje fuerte
//         ≥ MECH_PRESENT_MIN_ETA — el MISMO umbral del invariante), TAMBIÉN
//         calcSteelColumn, que aporta la clase bajo N, Nby/Nbz y la
//         interacción M+N §6.3.3 (int1/int2) que el rol 'viga' PERDÍA (el
//         hallazgo que motivó todo esto). En la fusión cada motor cede filas
//         según la tabla (BEAM_ROWS_CEDED / COLUMN_ROWS_CEDED); el χLT del
//         int1/int2 va a longitud completa — conservador, documentado (OQ6).
//     RC (por rcDesignKind del usuario — la única elección legítima del rol:
//         cambia QUÉ ARMADO se lee, no qué fórmula):
//       'beam' → calcRCBeam with the 1D region split (vano
//         [0.25L,0.75L] tensión abajo · apoyo [0,0.15L]∪[0.85L,L] tensión
//         arriba). The M sign is NORMALIZED to world-sagging via the member
//         orientation (local +y flips when i→j points left — without this a
//         bar drawn right-to-left would check the wrong steel face). One
//         engine call with per-mechanism maxima across ELU combos (exact:
//         calcRCBeam has no cross-mechanism interaction row) + a REVERSED
//         second call (swapped tension/compression faces) when wind/seismic
//         combos invert the moment in a region. Fisuración uses the REAL
//         multi-principal quasi-permanent moment (loadType 'custom' +
//         psi2Custom 0 ⇒ Ms = |M_G| = M_cp).
//         AXIAL (M+N por fibras): con |N| sobre el suelo de ruido, filas
//         'mn-vano'/'mn-apoyo' vía beamMNCapacity (los primitivos de fibras
//         del motor de pilares con el armado ASIMÉTRICO de la viga), M de
//         región emparejado con ambos extremos de N del MISMO combo +
//         excentricidad mínima EC2 6.1(4) en compresión. GATE de esbeltez
//         §5.8.3.1 (λ > λ_lim = 10.78/√n, sin el cap de 25 de pilares): el
//         2º orden de barra no está modelado para vigas → 'pending' honesto
//         "compruébala como pilar". La tracción nunca gatea (flexotracción
//         real; Nt ≥ Nt,Rd = fail directo).
//         FLECHA: fila 'deflection-cracked' = δ_cp del solver × k fisurado
//         (crackedDeflection §7.4.3: interpolación ζ β=0.5 + fluencia
//         Ec,eff = Ec/(1+φef) sobre la MISMA base E del solver), límite
//         L/deflLimit del usuario (D10). No fisurada ⇒ k = 1+φef exacto.
//       'column' → calcRCColumn per ELU combination (Nd = compression, MEdy =
//         in-plane |M| from the SAME combination on the strong axis, MEdz=0,
//         β=1 paired with the αcr amplified-sway factors — same pairing as
//         steel — and φef=2.0 typical building creep). Net-tension combos get
//         a steel-only tension row (As_tot·fyd; cracked concrete carries
//         nothing). SHEAR per combo via calcRcShear with the SIGNED
//         concurrent σcp (k1·σcp raises VRd,c under compression, lowers it
//         under tension; αcw on VRd,max) and the COLUMN policy
//         VRd = max(VRdc, min(VRds, VRdmax)) — §6.2.1(4).
//       sin elegir → 'pending' accionable (P1: el programa no puede deducir
//         cómo está armada una barra; la elección es la ENTRADA del usuario).
//     TIMBER → calcTimberFrameMember per ELU combo
//         (EC5): cortante §6.1.7, flexocompresión §6.3.2 ecs. 6.23/6.24 +
//         vuelco §6.3.3 ec. 6.35, flexotracción §6.2.3 ec. 6.17 — el motor
//         hace la interacción SIEMPRE, sin separar mecanismos. A diferencia
//         de acero/HA el kmod NO es combo-independiente: sale de la acción de
//         duración más corta del combo (comboDuration — con la nieve a MEDIA
//         por encima de 1000 m vía model.snowOver1000m), así que se añade una
//         combinación sintética 1.35·G (kmod permanente 0.60) que puede
//         gobernar con carga variable pequeña (§3.1.3(2)). Lef_y = L (β=1 +
//         αcr); D13: Lltb = correas (kcrit) y Lef_z = weakAxisBracing (kc,z),
//         coacciones SEPARADAS — antes ambas salían de las correas. Una biela
//         derivada degenera a axil puro. La flecha (instantánea ELS-c + final
//         con fluencia δ_c + kdef·δ_cp) la gobierna deflLimit (D10). Sin
//         situación de incendio (paridad acero/HA).
//
// T7 — simplified second-order (EC3 / CE Anejo 22 §5.2). Sway sensitivity per
//   ELU combination via αcr = S·h / V_Ed (storey formula 5.2.1(4)B), where the
//   storey lateral stiffness S = H/δ_H comes from a UNIT PROBE SOLVE (the
//   ratio is load-magnitude independent, so gravity-only combinations get a
//   real αcr too). Storey levels come from ALL node cotes ('all-nodes', D12):
//   no label and no geometry filter — a triangulated truss self-regulates
//   (αcr ≫ 10) and a raked-column portal keeps its storeys, which the old
//   role === 'pilar' filter silently lost. When 3 ≤ αcr < 10 the LATERAL case
//   factors (W, E) are amplified by k = 1/(1−1/αcr) (amplified-sway-moment
//   method); αcr < 3 → fail row ("análisis de 2º orden requerido") and k
//   capped at αcr=3. SEISMIC BOUND: for combinations containing E the
//   simplified method dies at αcr = 5, not 3 (EN 1998-1 §4.4.2.2: θ ≈ 1/αcr
//   must not exceed 0,2) → fail row, amplification kept as belt-and-braces.
//   APPLICABILITY GUARD (§5.2.1(4)B NOTA 2B): significant axial compression
//   in a beam/rafter (N_Ed ≥ 0,09·N_cr in-plane) makes the storey formula
//   OVERESTIMATE αcr → the row is degraded to warn instead of trusting green.
//   PAIRING NOTE: amplified sway moments go with NON-sway buckling lengths —
//   that is why pilar checks use β = 1 (EC3 5.2.2(7)(b)).
//   Limitations (documented): no notional imperfection loads (sway from
//   asymmetric GRAVITY is not amplified), storey V excludes the storey's own
//   column self-weight (attributed at mid-height, below the storey top).

import { buildLcCombinations, type LcCombinations, type LcFactors, type PrincipalLc } from '../../lib/frame-core/lcCombinations';
import { STEEL_CATALOG } from '../../lib/frame-core/sections';
import type { LoadCase, ModelError } from '../../lib/frame-core/types';
import { bucklingChi } from '../../lib/calculations/buckling';
import { beamMNCapacity, type BeamMNSection } from '../../lib/calculations/rcBeamMN';
import { crackedDeflectionFactor } from '../../lib/calculations/crackedDeflection';
import { calcRCBeam, calcRcShear } from '../../lib/calculations/rcBeams';
import { calcRCColumn } from '../../lib/calculations/rcColumns';
import { getConcrete } from '../../data/materials';
import { calcSteelBeam, type SteelCheckRow } from '../../lib/calculations/steelBeams';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { descriptorForKey } from '../../lib/sections';
import {
  calcTimberFrameMember,
  type TimberFrameCheckRow,
  type TimberFrameResult,
} from '../../lib/calculations/timberFrameMember';
import { getKdef, getTimberGrade, type LoadDurationClass } from '../../data/timberGrades';
import { toStatus, WARN_UTIL, type CheckRow, type CheckStatus } from '../../lib/calculations/types';
import { formatQuantity } from '../../lib/units/format';
import { getBarArea } from '../../data/rebar';
import type { RCBeamInputs, RCColumnInputs, SteelBeamInputs, SteelColumnInputs } from '../../data/defaults';
import type { Analysis2DLoadCase, Analysis2DModel, Analysis2DNodeLoad } from './analysis';
import { memberFormulation } from './decompose';
import { auditMechanisms, MECH_PRESENT_MIN_ETA } from './mechanisms';
import { solveAnalysis2D, type Solve2DResultBundle, type Solver2DElementResult } from './solver2d';
import type { DisplayGroup2D, ElementType2D, Fem2DMember, Fem2DModel } from './types';

// ── Constants ───────────────────────────────────────────────────────────────

const GAMMA_M0 = 1.05;
const GAMMA_M1 = 1.05;
/** Buckling curve c (α=0.49) for the self-contained two-force check. */
const ALPHA_CURVE_C = 0.49;
/** Denominador de flecha cuando la barra no declara `deflLimit` (el L/300 que
 *  la app imponía a todo el mundo antes de D10). */
const DEFL_LIMIT_DEFAULT = 300;
/** Camino axil autónomo (Fase 2, paso 5): demanda de flexión/cortante por
 *  debajo de estos suelos = "sin demanda de flexión relevante". Grandes frente
 *  al ruido numérico (~1e-9), minúsculos frente a cualquier demanda real. */
const NEGLIGIBLE_M_KNM = 1e-3;
const NEGLIGIBLE_V_KN = 1e-3;
/** tan(10°) — SOLO para el fallback de presentación pilar/viga del editor
 *  libre (paso 12). Jamás enruta una comprobación. */
const VERTICAL_TAN_DISPLAY = Math.tan((10 * Math.PI) / 180);
/** αcr thresholds (CE Anejo 22 §5.2.1): ≥10 first-order OK; <3 out of scope. */
const ALPHA_CR_FIRST_ORDER = 10;
const ALPHA_CR_MIN_SIMPLIFIED = 3;
/** En sismo el método simplificado muere antes: EN 1998-1 §4.4.2.2 limita el
 *  coeficiente de sensibilidad θ ≈ 1/αcr a 0,2 para amplificar con 1/(1−θ) —
 *  es decir, una combinación con E y αcr < 5 exige análisis de 2º orden real
 *  (el ≥ 10 para despreciarlo sí coincide con EC3: θ ≤ 0,1). */
const ALPHA_CR_MIN_SIMPLIFIED_SEISMIC = 5;
/** §5.2.1(4)B NOTA 2B reordenada: compresión "significativa" en un dintel es
 *  λ̄ ≥ 0,3·√(A·fy/N_Ed) ⟺ N_Ed ≥ 0,09·N_cr — forma sin fy que vale para
 *  acero, HA y madera con el mismo EI del análisis. */
const NOTA_2B_NCR_FRACTION = 0.09;
/** Axial companion row on viga/cordon appears above this η (noise floor). */
const AXIAL_ROW_MIN_ETA = 0.01;
const LATERAL_LCS: LoadCase[] = ['W', 'E'];
/** Imperfección global de desplome §5.3.2 (mini-fase H2 de la auditoría αcr):
 *  φ = φ0·αh·αm con φ0 = 1/200. αh = 2/√h acotado [2/3, 1] (h = altura total);
 *  αm = 1 SIEMPRE — su rebaja √(0,5·(1+1/m)) exige contar "pilares por fila",
 *  una heurística geométrica de las que la Fase 2 expulsó; 1 es el lado seguro. */
const NOTIONAL_PHI_0 = 1 / 200;
const NOTIONAL_ALPHA_H_MIN = 2 / 3;
/** Exención §5.3.2(4)B: con H_Ed ≥ 0,15·V_Ed en TODAS las plantas del combo la
 *  imperfección de desplome puede despreciarse (el empuje real ya domina). */
const NOTIONAL_EXEMPT_RATIO = 0.15;
/** Suelo de fuerza nocional por nivel (kN) — por debajo es ruido numérico. */
const NOTIONAL_MIN_H_KN = 1e-9;
/** λ_lim del §5.8.3.1 con los defaults normativos A=0.7, B=1.1, C=0.7:
 *  λ_lim = 20·A·B·C/√n = 10.78/√n (n = NEd/(Ac·fcd)). SIN el cap de 25 del
 *  motor de pilares — con n→0 el límite diverge y el gate se autorregula
 *  (una viga con axil minúsculo nunca gatea). Si λ > λ_lim, el 2º orden de
 *  barra NO es despreciable y la viga debe comprobarse como pilar → pending. */
const RC_LAMBDA_LIM_COEF = 20 * 0.7 * 1.1 * 0.7;
/** Las filas M+N de viga HA aparecen con |N| por encima de este suelo
 *  (fracción de Ac·fcd) — por debajo, la fila 'bending' del motor (N=0) basta. */
const RC_MN_ROW_MIN = 0.01;
/** Reversed-bending companion rows appear above this demand (kN·m). */
const RC_REVERSAL_MIN_KNM = 0.5;
/** γs for the self-contained RC tension row (cracked concrete carries nothing). */
const RC_GAMMA_S = 1.15;
/** Coeficiente de fluencia efectivo típico de edificación (motor de pilares). */
const RC_PHI_EF = 2.0;
/** Filas de calcRCColumn que NO dependen de la combinación (detailing puro:
 *  cuantías geométricas, separaciones, cercos). Con ellas mergeWorst se queda
 *  con la PRIMERA combinación (todas dan la misma η) — etiquetarla como
 *  "pésima" sería mentir. Las filas con NEd dentro (as-min-mech, λ vs λ_lim,
 *  nm-*, nd-max, 5.38, biaxial) SÍ se etiquetan. */
const RC_COL_COMBO_INDEPENDENT = new Set([
  'as-min', 'as-max', 'nBars-min', 'bar-spacing-x', 'bar-spacing-y',
  'bar-spacing-circ', 'stirrup-diam', 'stirrup-spacing', 'stirrup-densification',
]);

// ── Public shapes ───────────────────────────────────────────────────────────

export interface MemberCheck {
  id: string;
  name: string;
  val: string;
  eta: number;
  ref: string;
  /**
   * Engine-authoritative status, set ONLY when it cannot be derived from eta.
   * The RC engines emit threshold rows where the condition is MET exactly at
   * the limit ("4 barras / ≥ 4" → utilization 1.0, status 'ok') and N/A rows
   * ('fail' with utilization NaN): deriving from eta would flip both. Absent
   * → consumers derive from eta (toStatus), the steel-path behaviour.
   */
  status?: CheckStatus;
  /**
   * Human label of the GOVERNING combination for this row ("1.35·G + 1.50·Q").
   * Factors are the ones actually used — an αcr-amplified lateral case shows
   * its amplified factor (e.g. "1.62·W"). Absent when the row is
   * combination-independent (detailing, clasificación) or not tracked.
   * Display-only: never parsed back.
   */
  combo?: string;
}

export type MemberStatus = 'ok' | 'warn' | 'fail' | 'pending';

/** One pre-formatted label/value line of the detail sheet (SI units — same
 *  convention as MemberCheck.val strings). */
export interface DetailRow2D {
  label: string;
  value: string;
}

export interface DetailGroup2D {
  title: string;
  rows: DetailRow2D[];
}

/**
 * Per-member data for the detail sheet (ficha de cálculo por barra): worst ELU
 * design forces with their governing combination, and the engine intermediate
 * values (resistances, χ/λ̄, MRd(N)…) that the check rows alone cannot show.
 * Built HERE, during the check pass — the UI never re-runs engines, so the
 * ficha can never disagree with the check rows.
 */
export interface MemberDetail2D {
  /** Member length (m). */
  L: number;
  /** "IPE 240 · S275" | "HA 30×50 cm · HA-25 · B500". */
  sectionLabel: string;
  /** Worst ELU design forces, each with its governing combination label. */
  demands: { label: string; value: string; combo: string }[];
  /** Engine intermediate values, grouped per mechanism. */
  groups: DetailGroup2D[];
}

export interface MemberVerdict2D {
  memberId: string;
  /**
   * Grupo de PRESENTACIÓN para resultados y PDF (Fase 2, paso 12): el
   * `displayGroup` estampado por la plantilla o, en el editor libre, el
   * fallback honesto pilar/viga por verticalidad. Ningún motor lo lee — se
   * calcula DESPUÉS de las comprobaciones y no puede tocar ningún número.
   */
  group: DisplayGroup2D;
  eta: number;
  status: MemberStatus;
  checks: MemberCheck[];
  /** Detail-sheet data. Absent only when the solver returned nothing. */
  detail?: MemberDetail2D;
}

/** Combined worst-abs sample arrays per member for one combination group. */
export interface MemberEnvelope2D {
  xs: number[];
  N: number[];
  V: number[];
  M: number[];
  w: number[];
}

/** Claves heredadas de los tres botones originales. Se conservan como ALIAS del
 *  mismo objeto que las vistas nuevas (decisión aditiva D2/A). Los clones PDF
 *  (`index.tsx:497/500/503`) y la ficha indexan por estos literales y no pasan
 *  `combo`, dependiendo del default `'ELU'`; renombrarlos los dejaría en blanco
 *  con el fixture en verde, porque jsdom no ve esos SVG. */
export type Fem2DComboId = 'ELU' | 'ELS_c' | 'ELS_cp';

/**
 * Ids SELECCIONABLES en el desplegable de combinaciones. Un id por vista
 * dibujable: las dos envolventes, cada combinación ELU/ELS por hipótesis
 * principal, la cuasi-permanente, la combinación sintética de duración
 * permanente de madera y cada hipótesis simple.
 *
 * `Exclude<LoadCase, 'G'>` en `elu:`/`els_c:` a propósito: G nunca es la
 * hipótesis principal, así que `elu:G` es un id construible-pero-imposible; el
 * tipo lo prohíbe para que "los ids tipados impiden los blancos silenciosos"
 * siga siendo cierto.
 */
export type Fem2DComboViewId =
  | 'env:ELU'
  | 'env:ELS_c'
  | 'els_cp'
  | 'eluperm:G'
  | `elu:${PrincipalLc}`
  | `els_c:${PrincipalLc}`
  | `lc:${LoadCase}`;

/** Los tres alias heredados. NUNCA son ids de vista seleccionables y NUNCA
 *  llegan a deformed.ts: sólo mantienen vivos los clones PDF y la ficha. */
type LegacyEnvelopeAlias = Fem2DComboId;

/** Toda clave que `envelopes[m.id]` puede llevar: ids de vista + alias. */
export type Fem2DEnvelopeKey = Fem2DComboViewId | LegacyEnvelopeAlias;

/** Materializadas SIEMPRE para toda barra: los tres alias heredados, los dos
 *  anclajes de escala (`env:ELU`/`env:ELS_c`, referencia de la trampa 3 y
 *  entradas de la ficha) y la cuasi-permanente (`els_cp`). El tipo las exige
 *  para que un `?.` sobre ellas no pueda devolver `undefined` en silencio —
 *  moviendo el problema a `[clave]` en vez de eliminarlo (voz externa C1+C2). */
type AlwaysPresent = LegacyEnvelopeAlias | 'env:ELU' | 'env:ELS_c' | 'els_cp';

/**
 * Envolventes por combinación de una barra. Las claves obligatorias
 * (`AlwaysPresent`) existen siempre; el resto de vistas (`elu:*`, `els_c:*`,
 * `lc:*`, `eluperm:G`) son opcionales — se materializan cuando el modelo las
 * tiene. Distinción clave (C3): una vista puede quedar FUERA de `comboViews`
 * (deduplicada de la lista) sin que su clave falte aquí.
 */
export type MemberEnvelopes2D = Record<AlwaysPresent, MemberEnvelope2D> &
  Partial<Record<Fem2DEnvelopeKey, MemberEnvelope2D>>;

/**
 * Una entrada del selector de combinaciones. `checks.ts` emite ESTRUCTURA; la
 * capa de UI deriva `label`, `groupLabel` y `notice` de estos campos +
 * `LC_LABELS` + `formatCombo` (sin texto en español dentro del motor de
 * chequeo — decisión 2B/C7).
 */
export interface Fem2DComboView {
  id: Fem2DComboViewId;
  group: 'envelope' | 'ELU' | 'ELS' | 'hypothesis';
  /** true = envolvente sobre ≥2 combinaciones. */
  isEnvelope: boolean;
  /** true = el grupo tenía una sola combinación: la envolvente ES esa combinación. */
  collapsed: boolean;
  /** Hipótesis principal. `null` en envolventes y en `lc:*`. */
  principal: PrincipalLc | null;
  /** Hipótesis de la vista simple. `null` salvo en `lc:*`. */
  lc: LoadCase | null;
  /** Factores para N/V/M — ELU con laterales AMPLIFICADOS por αcr (trampa 4);
   *  en `env:ELU` incluyen además las variantes ±Hφ de imperfección (§5.3.2). */
  forceFactorSets: CheckFactors[];
  /** Factores para δ — ELU SIN amplificar: la deformada usa CTE plano (trampa 1). */
  dispFactorSets: LcFactors[];
  /** Vista cuya escala en píxeles usa el render de N/V/M (trampa 3). */
  scaleRef: Fem2DComboViewId;
}

export interface Fem2DCheckBundle {
  perMember: Record<string, MemberVerdict2D>;
  envelopes: Record<string, MemberEnvelopes2D>;
  /** Vistas SELECCIONABLES del desplegable, deduplicadas por firma (las
   *  hipótesis simples exentas). Nunca vacío: `env:ELU` y `env:ELS_c` se
   *  emiten siempre y nunca colisionan (γ_G 1.35 vs 1), así que `[0]` es un
   *  fallback seguro para la vista obsoleta. Orden estable = `LC_ORDER`,
   *  independiente del orden en que se dibujaron las cargas. */
  comboViews: Fem2DComboView[];
  /** Worst αcr across ELU combinations; null = no sway storeys (e.g. truss). */
  alphaCr: number | null;
  /** True when any ELU combination had its lateral factors amplified. */
  amplified: boolean;
  /** True cuando algún combo lleva cargas nocionales de imperfección Hφ
   *  (§5.3.2) — las comprobaciones de barra las incluyen ± amplificadas. */
  notionalApplied: boolean;
  globalChecks: MemberCheck[];
  maxEta: number;
  status: MemberStatus;
  errors: ModelError[];
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function checkFem2D(
  model: Fem2DModel,
  analysis: Analysis2DModel,
  bundle: Solve2DResultBundle,
): Fem2DCheckBundle {
  const errors: ModelError[] = [];
  const combos = buildLcCombinations(model.loads);

  // Elements grouped per design member, preserving decompose order.
  const elementsByMember = new Map<string, Solver2DElementResult[]>();
  for (const e of bundle.elements) {
    const arr = elementsByMember.get(e.designMemberId) ?? [];
    arr.push(e);
    elementsByMember.set(e.designMemberId, arr);
  }

  // ── T7: sway sensitivity + amplified ELU factor sets ──────────────────────
  // La sonda αcr resuelve también los casos nocionales §5.3.2 y FUNDE sus
  // muestras en bundle.elements (claves 'N<lc>') antes de cualquier envolvente.
  const sway = computeSwaySensitivity(model, analysis, combos.ELU, errors, bundle.elements);
  const eluAmplified = sway.factorsPerCombo;
  // Sets de COMPROBACIÓN: amplificados + variantes ±Hφ. Las vistas elu:<LC>
  // se quedan con su set alineado sin nocional (perturbación φ·V invisible a
  // escala de diagrama); env:ELU y TODAS las comprobaciones usan estos.
  const eluChecks = sway.checkFactorSets;

  // ── T6: vistas del selector (estructura, por-modelo) ─────────────────────
  const hasTimber = model.members.some((m) => m.material === 'timber');
  const { views: comboViews, candidates } = buildComboViews(
    combos, eluAmplified, eluChecks, analysis.loadCases, hasTimber, model.snowOver1000m ?? false,
  );

  // ── Envelopes (todas las claves candidatas, por barra) ───────────────────
  const envelopes: Fem2DCheckBundle['envelopes'] = {};
  for (const m of model.members) {
    const els = elementsByMember.get(m.id) ?? [];
    // Anclajes obligatorios primero: un objeto por envolvente, compartido con su
    // alias heredado por IDENTIDAD (criterio 4: envelopes.ELU === envelopes['env:ELU']).
    const eluEnv = buildEnvelope(els, eluChecks);
    const elsCEnv = buildEnvelope(els, combos.ELS_c);
    const elsCpEnv = buildEnvelope(els, [combos.ELS_cp]);
    const memberEnv: MemberEnvelopes2D = {
      ELU: eluEnv,
      ELS_c: elsCEnv,
      ELS_cp: elsCpEnv,
      'env:ELU': eluEnv,
      'env:ELS_c': elsCEnv,
      els_cp: elsCpEnv,
    };
    // Claves de vista opcionales (elu:*, els_c:*, lc:*, eluperm:G). Se
    // materializan TODAS las candidatas, incluidas las que la lista deduplica
    // (criterio 11: la clave nunca falta aunque la vista no esté en el selector).
    for (const c of candidates) {
      if (c.id in memberEnv) continue; // los 3 anclajes de vista ya están
      memberEnv[c.id] = buildEnvelope(els, c.forceFactorSets);
    }
    envelopes[m.id] = memberEnv;
  }

  // ── T5: per-member role-routed checks ────────────────────────────────────
  const perMember: Record<string, MemberVerdict2D> = {};
  let maxEta = 0;
  let anyFail = false;
  let anyPending = false;

  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  for (const m of model.members) {
    const els = elementsByMember.get(m.id) ?? [];
    // World-sagging normalization for the RC vano/apoyo split: local +y flips
    // when i→j points left (dx < 0), and with it the sign that means "tension
    // on the world-bottom face". Vertical members keep +1 (convention).
    const a = nodeById.get(m.i);
    const b = nodeById.get(m.j);
    const sagSign: 1 | -1 = a && b && b.x - a.x < 0 ? -1 : 1;
    // Grupo de PRESENTACIÓN (paso 12): displayGroup de plantilla o fallback
    // pilar/viga por verticalidad (±10°, el mismo umbral visual de siempre).
    // Se calcula aquí y nunca dentro de ningún check.
    const group: DisplayGroup2D = m.displayGroup
      ?? (a && b && Math.abs(b.x - a.x) <= VERTICAL_TAN_DISPLAY * Math.abs(b.y - a.y) ? 'pilar' : 'viga');
    const formulation = memberFormulation(model, m);
    const verdict = checkMember(
      m, group, formulation, els, eluChecks, combos.ELS_c, combos.ELS_cp, sagSign, model.snowOver1000m ?? false,
    );
    perMember[m.id] = verdict;
    if (verdict.status === 'pending') anyPending = true;
    if (verdict.status === 'fail') anyFail = true;
    if (verdict.eta > maxEta) maxEta = verdict.eta;
  }

  // ── Global rows (αcr) ────────────────────────────────────────────────────
  const globalChecks: MemberCheck[] = [];
  if (sway.alphaCr !== null) {
    const a = sway.alphaCr;
    // NOTA 2B: con compresión significativa en un dintel la fórmula de planta
    // SOBREESTIMA αcr — un verde no es de fiar y se degrada a ámbar.
    const nota2b = significantBeamCompression(model, analysis, elementsByMember, eluChecks);
    const secondOrder = a < ALPHA_CR_MIN_SIMPLIFIED || sway.seismicSecondOrder;
    const eta = secondOrder ? 1.01 : a >= ALPHA_CR_FIRST_ORDER && nota2b === null ? 0.5 : 0.97;
    const verdictTxt = a < ALPHA_CR_MIN_SIMPLIFIED
      ? ' < 3 — se requiere análisis de 2º orden'
      : sway.seismicSecondOrder
        ? ' < 5 con sismo — se requiere análisis de 2º orden (EN 1998-1 §4.4.2.2)'
        : a >= ALPHA_CR_FIRST_ORDER
          ? (a === Infinity ? '' : ' ≥ 10')
          : ' — efectos de 2º orden amplificados';
    // Imperfección global §5.3.2: dice qué pasó de verdad con las Hφ — antes,
    // un combo solo-gravitatorio con 3 ≤ αcr < 10 "amplificaba" la nada.
    const notionalTxt = sway.notionalApplied
      ? ' — imperfección de desplome incluida: H = φ·V por planta (§5.3.2)'
      : sway.notionalExempt
        ? ' — imperfección de desplome exenta: H_Ed ≥ 0,15·V_Ed (§5.3.2(4))'
        : '';
    const nota2bTxt = nota2b === null
      ? ''
      : ` — compresión significativa en el dintel «${nota2b}»: fórmula de planta fuera de rango (§5.2.1(4)B NOTA 2B)`;
    globalChecks.push({
      id: 'alpha-cr',
      name: 'Estabilidad global al desplome (αcr)',
      val: (a === Infinity ? 'αcr → ∞' : `αcr = ${a.toFixed(1)}`) + verdictTxt + notionalTxt + nota2bTxt,
      eta,
      ref: 'CE Anejo 22 §5.2.1',
    });
    if (eta > maxEta) maxEta = eta;
    if (eta >= 1) anyFail = true;
  }

  // F1 (auditoría): contagious pending — the global verdict can never be
  // better than an unchecked member's (fail still dominates: a confirmed
  // failure is more urgent information than a missing check).
  const status: MemberStatus = anyFail
    ? 'fail'
    : model.members.length === 0 || anyPending ? 'pending'
    : toStatus(maxEta);

  return {
    perMember,
    envelopes,
    comboViews,
    alphaCr: sway.alphaCr,
    amplified: sway.amplified,
    notionalApplied: sway.notionalApplied,
    globalChecks,
    maxEta,
    status,
    errors,
  };
}

// ── Combination labels ──────────────────────────────────────────────────────

/** Fixed display order for combination terms (CTE hypothesis order). */
const LC_ORDER: LoadCase[] = ['G', 'Q', 'W', 'S', 'E'];

/** Clave del caso nocional de imperfección (§5.3.2): 'N' + hipótesis madre.
 *  Vive SOLO en la capa de comprobación — nunca en `model.loads`, nunca como
 *  vista `lc:*`, nunca en los factores de desplazamiento (la deformada es
 *  presentación y la perturbación φ·V es invisible a su escala). */
type NotionalLc = `N${LoadCase}`;
const NOTIONAL_ORDER: NotionalLc[] = ['NG', 'NQ', 'NW', 'NS', 'NE'];
/** Factores de un combo de COMPROBACIÓN: los 5 canónicos + los nocionales.
 *  `LcFactors` es asignable a esto (Partial con unión de claves más ancha),
 *  así que los caminos ELS siguen pasando sus sets planos sin tocarlos. */
export type CheckFactors = Partial<Record<LoadCase | NotionalLc, number>>;
/** Orden de iteración de `comboSample`: canónicos primero, nocionales después. */
const SAMPLE_LC_ORDER: (LoadCase | NotionalLc)[] = [...LC_ORDER, ...NOTIONAL_ORDER];

/**
 * Human label of a factor set: "1.35·G + 1.50·Q + 0.90·W". Zero/absent factors
 * are skipped; amplified lateral factors print as amplified (that IS the
 * factor the check used). frame-core has no combination naming — this is the
 * single formatter for the whole 2D module.
 */
export function formatCombo(factors: CheckFactors): string {
  const parts: string[] = [];
  for (const lc of LC_ORDER) {
    const f = factors[lc];
    if (!f) continue;
    parts.push(`${f.toFixed(2)}·${lc}`);
  }
  let label = parts.length > 0 ? parts.join(' + ') : '—';
  // Términos nocionales (§5.3.2): un único símbolo colectivo con el signo del
  // vano de imperfección — todos los N* de una variante comparten signo, y el
  // detalle numérico (φ, k) vive en la fila αcr, no en la etiqueta.
  const notional = NOTIONAL_ORDER.map((n) => factors[n]).find((f) => f);
  if (notional) label += notional > 0 ? ' + Hφ' : ' − Hφ';
  return label;
}

// ── Combo views (selector) ──────────────────────────────────────────────────

/** Firma canónica de una lista de factores: `SAMPLE_LC_ORDER × toFixed(4)`,
 *  estable frente al orden de inserción de claves. Incluye los nocionales:
 *  sin ellos, un `env:ELU` con imperfección y su `elu:<LC>` plano firmarían
 *  igual y la deduplicación taparía una vista que ya NO es idéntica. */
function comboSignature(sets: CheckFactors[]): string {
  return sets
    .map((f) => SAMPLE_LC_ORDER.map((lc) => (f[lc] ?? 0).toFixed(4)).join(','))
    .join('|');
}

/**
 * Descriptores de las vistas del selector. Emite ESTRUCTURA (grupo, principal,
 * factores, escala) — la capa de UI deriva las etiquetas en español (C7).
 *
 * Devuelve DOS listas con la distinción de C3:
 *   - `candidates`: TODAS las vistas candidatas, en orden de emisión. La fase de
 *     chequeo materializa una clave de `envelopes` por candidata, SIEMPRE —
 *     aunque la vista quede fuera del desplegable (una clave que falta = figura
 *     en blanco silenciosa; ocultar del desplegable ≠ no materializar).
 *   - `views`: lo que ve el usuario. Deduplicada por firma sobre los grupos
 *     envolvente/combinación (#1-#6); las hipótesis simples (#7) van EXENTAS
 *     porque `{G:1, W:0}` (cuasi-permanente sin viento) y la hipótesis G aislada
 *     son dos afirmaciones ciertas y distintas, no un duplicado que mienta.
 *
 * Orden de emisión = `LC_ORDER` (no el de `combos.ELU`, que sigue el de
 * inserción de las cargas): con ids estables, el ORDEN del desplegable se
 * reordenaría solo según cómo se dibujó el pórtico. Se ordena por la principal.
 */
function buildComboViews(
  combos: LcCombinations,
  eluAmplified: LcFactors[],
  eluChecks: CheckFactors[],
  loadCases: Analysis2DLoadCase[],
  hasTimber: boolean,
  snowOver1000m: boolean,
): { views: Fem2DComboView[]; candidates: Fem2DComboView[] } {
  const byLcOrder = (a: PrincipalLc, b: PrincipalLc) =>
    LC_ORDER.indexOf(a) - LC_ORDER.indexOf(b);

  // #3 elu:<LC> — force AMPLIFICADO (eluAmplified), disp PLANO (combos.ELU),
  // emparejados 1:1 con ELU_principals. Se descartan los combos sin principal
  // (el solo-G, que sólo vive en env:ELU) y se ordena por LC_ORDER.
  const eluEntries = combos.ELU_principals
    .map((p, i) => ({ p, force: eluAmplified[i], disp: combos.ELU[i] }))
    .filter((e): e is { p: PrincipalLc; force: LcFactors; disp: LcFactors } => e.p !== null)
    .sort((a, b) => byLcOrder(a.p, b.p));

  // #5 els_c:<LC> — sin amplificar (la αcr sólo toca esfuerzos de cálculo ELU).
  const elsEntries = combos.ELS_c_principals
    .map((p, i) => ({ p, set: combos.ELS_c[i] }))
    .filter((e): e is { p: PrincipalLc; set: LcFactors } => e.p !== null)
    .sort((a, b) => byLcOrder(a.p, b.p));

  const candidates: Fem2DComboView[] = [];

  // #1-#2 Envolventes (siempre). `collapsed` = el grupo tenía UNA combinación:
  // la envolvente ES esa combinación (la firma coincidirá con su elu:<LC> y la
  // deduplicación quitará la combinación individual de la LISTA). Con
  // imperfección §5.3.2 los sets de fuerza son los de COMPROBACIÓN (variantes
  // ±Hφ incluidas — la envolvente enseña lo que las comprobaciones vieron), y
  // `collapsed` pasa a exigir también un solo set: dos variantes ±Hφ del mismo
  // combo ya son una envolvente de verdad.
  candidates.push({
    id: 'env:ELU', group: 'envelope', isEnvelope: true,
    collapsed: eluAmplified.length === 1 && eluChecks.length === 1, principal: null, lc: null,
    forceFactorSets: eluChecks, dispFactorSets: combos.ELU, scaleRef: 'env:ELU',
  });
  candidates.push({
    id: 'env:ELS_c', group: 'envelope', isEnvelope: true,
    collapsed: combos.ELS_c.length === 1, principal: null, lc: null,
    forceFactorSets: combos.ELS_c, dispFactorSets: combos.ELS_c, scaleRef: 'env:ELS_c',
  });

  // #3 Combinaciones ELU por principal.
  for (const e of eluEntries) {
    candidates.push({
      id: `elu:${e.p}`, group: 'ELU', isEnvelope: false, collapsed: false,
      principal: e.p, lc: null,
      forceFactorSets: [e.force], dispFactorSets: [e.disp], scaleRef: 'env:ELU',
    });
  }

  // #4 eluperm:G — SÓLO madera, y sólo si el set multi-principal no lleva ya una
  // combinación de duración permanente (mismo disparador que `combosToRun` en
  // timberChecks). No puede llamarse elu:*: no está en eluAmplified. Escala a
  // env:ELU pero PUEDE desbordarla (trampa 3, guarda en canvasGlyphs).
  const permInEluSet = combos.ELU.some((f) => comboDuration(f, snowOver1000m) === 'permanent');
  if (hasTimber && !permInEluSet) {
    const permSet: LcFactors = { G: 1.35 };
    candidates.push({
      id: 'eluperm:G', group: 'ELU', isEnvelope: false, collapsed: false,
      principal: null, lc: null,
      forceFactorSets: [permSet], dispFactorSets: [permSet], scaleRef: 'env:ELU',
    });
  }

  // #5 Combinaciones ELS-c por principal.
  for (const e of elsEntries) {
    candidates.push({
      id: `els_c:${e.p}`, group: 'ELS', isEnvelope: false, collapsed: false,
      principal: e.p, lc: null,
      forceFactorSets: [e.set], dispFactorSets: [e.set], scaleRef: 'env:ELS_c',
    });
  }

  // #6 ELS cuasi-permanente (siempre). `env:ELS_cp` no existe: su "envolvente"
  // sobre un único combo sería idéntica, con un badge mintiendo. Escala a
  // env:ELS_c (no tiene envolvente propia) — también con guarda de desbordamiento.
  candidates.push({
    id: 'els_cp', group: 'ELS', isEnvelope: false, collapsed: false,
    principal: null, lc: null,
    forceFactorSets: [combos.ELS_cp], dispFactorSets: [combos.ELS_cp], scaleRef: 'env:ELS_c',
  });

  // #7 Hipótesis simples — de `analysis.loadCases` (cargas ∪ peso propio, ya en
  // LC_ORDER), NO recalculadas (el peso propio no vive en model.loads). Valores
  // característicos sin mayorar (γ=1). Escala a sí mismas (vista de depuración).
  const seenLc = new Set<LoadCase>();
  for (const lcCase of loadCases) {
    if (seenLc.has(lcCase.lc)) continue;
    seenLc.add(lcCase.lc);
    const set: LcFactors = { [lcCase.lc]: 1 };
    candidates.push({
      id: `lc:${lcCase.lc}`, group: 'hypothesis', isEnvelope: false, collapsed: false,
      principal: null, lc: lcCase.lc,
      forceFactorSets: [set], dispFactorSets: [set], scaleRef: `lc:${lcCase.lc}`,
    });
  }

  // Deduplicación de la LISTA (nunca de las claves). Primera firma gana: como
  // las envolventes se emiten antes, una env:ELU colapsada sobrevive y su
  // elu:<LC> gemela sale de la lista.
  const seenSig = new Set<string>();
  const views: Fem2DComboView[] = [];
  for (const c of candidates) {
    if (c.group === 'hypothesis') {
      views.push(c);
      continue;
    }
    const sig = comboSignature(c.forceFactorSets);
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    views.push(c);
  }

  return { views, candidates };
}

// ── Envelope machinery ──────────────────────────────────────────────────────

interface ComboExtremes {
  L: number;
  M_Ed: number;          // max |M| (kN·m)
  V_at_MEd: number;      // |V| at the M_Ed section (same combo, same section)
  V_Ed: number;          // max |V|
  Nmax: number;          // max signed N (tension +)
  Nmin: number;          // min signed N (compression −)
}

/**
 * Combined sample value at index i of element e for a factor set.
 *
 * Itera `LC_ORDER` (const del módulo) en vez de `Object.keys(e.samples[field])`:
 * ese `Object.keys` asignaba un array nuevo en CADA llamada, y buildEnvelope
 * llama aquí 4× por muestra y combinación. Con el selector de combinaciones las
 * pasadas se multiplican (≈9 → ≈22), así que recorrer la constante deja cero
 * asignaciones en la ruta que se dispara en cada edición del modelo. Las LC
 * ausentes se saltan igual (guarda `!arr`), así que el resultado no cambia.
 */
function comboSample(
  e: Solver2DElementResult,
  field: 'N' | 'V' | 'M' | 'w',
  i: number,
  factors: CheckFactors,
): number {
  let v = 0;
  for (const lc of SAMPLE_LC_ORDER) {
    const f = factors[lc];
    if (!f) continue;
    const arr = e.samples[field][lc];
    if (!arr) continue;
    v += f * (arr[i] ?? 0);
  }
  return v;
}

/** Per-combination member extremes (concatenated over the member's elements). */
function comboExtremes(els: Solver2DElementResult[], factors: LcFactors): ComboExtremes {
  const out: ComboExtremes = { L: 0, M_Ed: 0, V_at_MEd: 0, V_Ed: 0, Nmax: -Infinity, Nmin: Infinity };
  for (const e of els) {
    out.L += e.L;
    for (let i = 0; i < e.samples.xs.length; i++) {
      const M = comboSample(e, 'M', i, factors);
      const V = comboSample(e, 'V', i, factors);
      const N = comboSample(e, 'N', i, factors);
      if (Math.abs(M) > out.M_Ed) {
        out.M_Ed = Math.abs(M);
        out.V_at_MEd = Math.abs(V);
      }
      if (Math.abs(V) > out.V_Ed) out.V_Ed = Math.abs(V);
      if (N > out.Nmax) out.Nmax = N;
      if (N < out.Nmin) out.Nmin = N;
    }
  }
  if (out.Nmax === -Infinity) out.Nmax = 0;
  if (out.Nmin === Infinity) out.Nmin = 0;
  return out;
}

/** Worst-abs (signed) sample arrays across a combination group. */
function buildEnvelope(els: Solver2DElementResult[], combosList: LcFactors[]): MemberEnvelope2D {
  const xs: number[] = [];
  const N: number[] = [];
  const V: number[] = [];
  const M: number[] = [];
  const w: number[] = [];
  let xOffset = 0;
  for (const e of els) {
    for (let i = 0; i < e.samples.xs.length; i++) {
      let bN = 0, bV = 0, bM = 0, bW = 0;
      for (const factors of combosList) {
        const n = comboSample(e, 'N', i, factors);
        const v = comboSample(e, 'V', i, factors);
        const m = comboSample(e, 'M', i, factors);
        const d = comboSample(e, 'w', i, factors);
        if (Math.abs(n) > Math.abs(bN)) bN = n;
        if (Math.abs(v) > Math.abs(bV)) bV = v;
        if (Math.abs(m) > Math.abs(bM)) bM = m;
        if (Math.abs(d) > Math.abs(bW)) bW = d;
      }
      xs.push(xOffset + e.samples.xs[i]);
      N.push(bN);
      V.push(bV);
      M.push(bM);
      w.push(bW);
    }
    xOffset += e.L;
  }
  return { xs, N, V, M, w };
}

/**
 * Max relative-to-chord |deflection| (m) across ELS combos for a member.
 * The chord runs between the member's END values (frame members sway —
 * absolute w mixes rigid-body motion into the sag; the limit applies to the
 * relative bow), interpolated in REAL x position — never in sample-index
 * space (audit F2: elements carry a fixed sample count regardless of length,
 * so a member split unevenly at a point load would get a crooked chord and a
 * silently wrong η whenever the ends displace differently).
 * Exported for the regression test.
 */
export function worstRelativeDeflection(els: Solver2DElementResult[], combosList: LcFactors[]): number {
  let best = 0;
  for (const factors of combosList) {
    const xs: number[] = [];
    const ws: number[] = [];
    let xOffset = 0;
    for (const e of els) {
      for (let i = 0; i < e.samples.xs.length; i++) {
        xs.push(xOffset + e.samples.xs[i]);
        ws.push(comboSample(e, 'w', i, factors));
      }
      xOffset += e.L;
    }
    if (ws.length < 2) continue;
    const x0 = xs[0];
    const span = xs[xs.length - 1] - x0;
    if (span <= 0) continue;
    const w0 = ws[0];
    const w1 = ws[ws.length - 1];
    for (let i = 0; i < ws.length; i++) {
      const chord = w0 + ((w1 - w0) * (xs[i] - x0)) / span;
      const rel = Math.abs(ws[i] - chord);
      if (rel > best) best = rel;
    }
  }
  return best;
}

/**
 * Instantaneous relative-to-chord deflection (mm) of the governing ELS-c
 * combination + its label, and the row that reports it against the member's L/limit.
 * Shared by the steel beam path and the timber path (the fila is normativa
 * idéntica — CTE DB-SE 4.3.3 characteristic combination, L/300 — so it lives
 * in ONE place; the timber path additionally reuses the returned δ_mm for its
 * creep row δ_fin = δ_c + kdef·δ_cp).
 */
function worstElsDeflectionMm(els: Solver2DElementResult[], elsCombos: LcFactors[]): { delta_mm: number; combo: string } {
  let delta_m = 0;
  let deltaCombo = '';
  for (const factors of elsCombos) {
    const d = worstRelativeDeflection(els, [factors]);
    if (d > delta_m) { delta_m = d; deltaCombo = formatCombo(factors); }
  }
  return { delta_mm: delta_m * 1000, combo: deltaCombo };
}

function elsDeflectionRow(delta_mm: number, adm_mm: number, combo: string, limit: number): MemberCheck {
  return {
    id: 'deflection',
    name: 'Flecha relativa (ELS-c)',
    val: `${delta_mm.toFixed(1)} / L/${limit} = ${adm_mm.toFixed(1)} mm`,
    eta: adm_mm > 0 ? delta_mm / adm_mm : 0,
    ref: 'CTE DB-SE 4.3.3',
    ...(combo !== '' ? { combo } : {}),
  };
}

// ── T5: member routing (Fase 2 — por MECANISMO, nunca por etiqueta) ─────────

function checkMember(
  m: Fem2DMember,
  group: DisplayGroup2D,
  formulation: ElementType2D,
  els: Solver2DElementResult[],
  eluCombos: LcFactors[],
  elsCombos: LcFactors[],
  cpFactors: LcFactors,
  sagSign: 1 | -1,
  snowOver1000m: boolean,
): MemberVerdict2D {
  if (els.length === 0) {
    return {
      memberId: m.id,
      group,
      eta: 0,
      status: 'pending',
      checks: [{ id: 'pending', name: 'Comprobación pendiente', val: 'sin resultados del solver', eta: 0, ref: '' }],
    };
  }

  const L = els.reduce((s, e) => s + e.L, 0);
  // Límite de flecha resuelto (D10): undefined ≡ L/300 legado; 'none' = sin
  // fila. Solo actúa en formulación viga-columna — una biela derivada no puede
  // flectar por formulación y su fila sería un número inventado.
  const deflLimit: number | null =
    m.deflLimit === 'none' || formulation === 'two-force'
      ? null
      : (m.deflLimit ?? DEFL_LIMIT_DEFAULT);
  // Base detail (ficha): section label + worst ELU forces with their governing
  // combination. Attached even to pending members — the ficha still shows the
  // input data and demands when no engine could run.
  const baseDetail: MemberDetail2D = {
    L,
    sectionLabel: memberSectionLabel(m),
    demands: worstDemands(els, eluCombos),
    groups: [],
  };
  const pending = (msg: string): MemberVerdict2D => ({
    memberId: m.id,
    group,
    eta: 0,
    status: 'pending',
    checks: [{ id: 'pending', name: 'Comprobación pendiente', val: msg, eta: 0, ref: '' }],
    detail: baseDetail,
  });

  let routed: RoutedChecks;
  if (m.material === 'rc') {
    if (!m.rcSection) return pending('sección HA sin definir');
    if (m.rcDesignKind === 'column') {
      routed = rcColumnChecks(m, L, eluCombos, els);
    } else if (m.rcDesignKind === 'beam') {
      routed = rcBeamChecks(m, sagSign, eluCombos, cpFactors, els, deflLimit);
    } else {
      // La ÚNICA elección que el rol hacía legítimamente (P1): qué armado se
      // lee. El programa no puede deducir cómo está armada una barra de HA —
      // ni por geometría ni por esfuerzos — así que sin elegirla el veredicto
      // es PENDIENTE con la acción escrita.
      return pending(
        'elige la comprobación HA en el inspector: Pilar (jaula, flexocompresión §5.8) ' +
          'o Viga (armado de vano y apoyo). El programa no puede deducir cómo está armada la barra',
      );
    }
  } else if (m.material === 'timber') {
    if (!m.timberSection) return pending('sección de madera sin definir');
    if (!getTimberGrade(m.timberSection.gradeId)) {
      return pending(`clase resistente '${m.timberSection.gradeId}' desconocida`);
    }
    routed = timberChecks(m, L, eluCombos, elsCombos, cpFactors, els, snowOver1000m, deflLimit);
  } else {
    const sel = m.steelSelection!;
    const cat = STEEL_CATALOG[sel.profileKey];
    if (!cat) return pending(`perfil '${sel.profileKey}' desconocido`);
    routed = steelChecks(m, formulation, cat, L, eluCombos, elsCombos, els, deflLimit);
  }

  // F4 (auditoría): zero demand is a VALID verdict — 'pending' is reserved for
  // "could not check", never for "nothing to check". Without this, the F1
  // contagious-pending rule below would let one unloaded montante grey out
  // the whole model.
  if (routed.rows.length === 0 && !routed.incomplete) {
    return {
      memberId: m.id,
      group,
      eta: 0,
      status: 'ok',
      checks: [{ id: 'no-forces', name: 'Sin esfuerzos apreciables', val: 'η = 0', eta: 0, ref: '' }],
      detail: { ...baseDetail, groups: routed.detailGroups ?? [] },
    };
  }

  // ── Fase 1 (design doc 2026-07-28): INVARIANTE DE AUDITORÍA ───────────────
  // "Para toda barra y todo mecanismo cuya demanda supere su umbral, debe
  // existir una fila emitida para ese mecanismo." Se evalúa AQUÍ, después de
  // `routed` y DESPUÉS del retorno de F4: una barra sin esfuerzos ni llega, así
  // que F4 se respeta por construcción y no por un caso especial.
  // No lee ninguna etiqueta — solo material, datos del usuario y filas ya
  // emitidas. Fase 2: sirvió de oráculo de la migración y ahora vigila que el
  // enrutado por mecanismo no regrese. La flecha se audita desde D10: el dato
  // del usuario (deflLimit) dice si es exigible, sin ninguna heurística.
  const deflDemand = deflLimit !== null && (m.material !== 'rc' || m.rcDesignKind === 'beam')
    ? { expected: true, etaEst: worstElsDeflectionMm(els, elsCombos).delta_mm / ((L * 1000) / deflLimit) }
    : { expected: false, etaEst: 0 };
  const gaps = auditMechanisms(m.material, routed.rows, {
    etaNMajor: routed.etaNMajor,
    deflection: deflDemand,
  });
  const rows = gaps.length > 0 ? [...routed.rows, ...gaps.map((g) => g.row)] : routed.rows;

  const eta = rows.reduce((mx, c) => Math.max(mx, c.eta), 0);
  // Engine-declared fails that eta cannot express (MemberCheck.status).
  const rowFail = rows.some((c) => c.status === 'fail');
  // F1 (auditoría): any check that COULD NOT run (engine invalid, unsupported
  // profile) forces 'pending' — an η=0 row must never buy an unearned green
  // (the "plausible but wrong PDF" failure mode). Mirrors the 1D contract.
  // Una discrepancia del invariante entra por esta misma puerta: un mecanismo
  // que NO se comprobó es indistinguible de uno que no pudo comprobarse.
  const incomplete = routed.incomplete || gaps.length > 0;
  const status: MemberStatus = incomplete ? 'pending' : rowFail ? 'fail' : toStatus(eta);
  return {
    memberId: m.id,
    group,
    eta,
    status,
    checks: rows,
    detail: { ...baseDetail, groups: routed.detailGroups ?? [] },
  };
}

/**
 * ACERO — enrutado por mecanismo (Fase 2, paso 5, tabla de propietarios):
 *
 *   formulación 'two-force'      → camino axil autónomo (tracción §6.2.3 +
 *                                  pandeo §6.3.1 con curva c). M = V = 0 por
 *                                  formulación: no hay nada más que exigir.
 *   sin motor de flexión (L)     → si la demanda de flexión es despreciable,
 *                                  el MISMO camino axil (una diagonal troceada
 *                                  por un nudo intermedio deja de ser
 *                                  birrotulada pero sigue siendo un axil);
 *                                  con demanda real, PENDIENTE honesto (D11 —
 *                                  la flexión de angulares es esviada y no se
 *                                  finge con el motor de I).
 *   resto                        → calcSteelBeam SIEMPRE (flexión, cortante,
 *                                  M-V §6.2.8, vuelco con correas, flecha) y,
 *                                  con COMPRESIÓN RELEVANTE (η_N,y ≥ 0.05, el
 *                                  MISMO umbral del invariante), TAMBIÉN
 *                                  calcSteelColumn — que aporta la clase bajo
 *                                  N, Nby/Nbz y la interacción M+N §6.3.3
 *                                  (int1/int2) que el rol 'viga' perdía.
 */
function steelChecks(
  m: Fem2DMember,
  formulation: ElementType2D,
  cat: (typeof STEEL_CATALOG)[string],
  L: number,
  eluCombos: LcFactors[],
  elsCombos: LcFactors[],
  els: Solver2DElementResult[],
  deflLimit: number | null,
): RoutedChecks {
  const sel = m.steelSelection!;
  if (formulation === 'two-force') {
    return axialChecks(sel.steel, cat.A, cat.Iz, cat.I, L, eluCombos, els, m.weakAxisBracing);
  }
  if (!beamProfileFields(sel.profileKey)) {
    let M = 0;
    let V = 0;
    for (const factors of eluCombos) {
      const ext = comboExtremes(els, factors);
      if (ext.M_Ed > M) M = ext.M_Ed;
      if (ext.V_Ed > V) V = ext.V_Ed;
    }
    if (M <= NEGLIGIBLE_M_KNM && V <= NEGLIGIBLE_V_KN) {
      return axialChecks(sel.steel, cat.A, cat.Iz, cat.I, L, eluCombos, els, m.weakAxisBracing);
    }
    // Con demanda de flexión real, beamChecks emite el pending-profile honesto
    // (D11) + las filas que SÍ puede dar (axiles, flecha real del solver).
    return beamChecks(m, sel.steel, cat.A, cat.Iz, cat.I, L, eluCombos, elsCombos, els, deflLimit);
  }

  const beam = beamChecks(m, sel.steel, cat.A, cat.Iz, cat.I, L, eluCombos, elsCombos, els, deflLimit);
  if ((beam.etaNMajor ?? 0) < MECH_PRESENT_MIN_ETA) return beam;
  const col = columnChecks(m, sel.steel, cat.A, L, eluCombos, els);
  return mergeSteelPaths(beam, col);
}

/** Filas que cada motor CEDE al otro en la pasada combinada (tabla de
 *  propietarios del design doc). El de vigas cede la flexión pura y los axiles
 *  compañeros (los sustituyen la clase bajo N, MyRd y Nby/Nbz del de pilares);
 *  el de pilares cede su vuelco lateral (calculado a longitud completa — el de
 *  vigas usa las correas declaradas, fila 4 de la tabla). */
const BEAM_ROWS_CEDED = new Set(['classification', 'bending', 'axial-buckling', 'axial-tension']);
const COLUMN_ROWS_CEDED = new Set(['LTB']);
const AXIAL_COMPANION_GROUP_TITLE = 'Axil concomitante (mecanismo separado)';

function mergeSteelPaths(beam: RoutedChecks, col: RoutedChecks): RoutedChecks {
  return {
    rows: [
      ...col.rows.filter((r) => !COLUMN_ROWS_CEDED.has(r.id)),
      ...beam.rows.filter((r) => !BEAM_ROWS_CEDED.has(r.id)),
    ],
    incomplete: beam.incomplete || col.incomplete,
    etaNMajor: beam.etaNMajor,
    detailGroups: [
      ...(col.detailGroups ?? []),
      ...(beam.detailGroups ?? []).filter((g) => g.title !== AXIAL_COMPANION_GROUP_TITLE),
    ],
  };
}

/** Result of a role-routed check pass. `incomplete` = some check could not
 *  run (engine invalid / unsupported profile) → the member must read pending. */
interface RoutedChecks {
  rows: MemberCheck[];
  incomplete: boolean;
  /** Ficha: engine intermediate values, grouped per mechanism. */
  detailGroups?: DetailGroup2D[];
  /**
   * Solo la ruta de vigas de acero: η_N del EJE FUERTE (χ_y), que es el que usa
   * el primer término de la ec. 6.61. Existe porque la fila `axial-buckling`
   * que se muestra usa el eje débil —correcto como comprobación autónoma, pero
   * el eje equivocado para cribar la interacción— y alimentar el cribado con
   * ella lo dispara donde no debe. Ausente ⇒ el invariante cae al valor
   * derivado de las filas (ver mechanisms.ts).
   */
  etaNMajor?: number;
}

/** "IPE 240 · S275" | "HA 30×50 cm · HA-25 · B500" | "C24 140×240 mm · CS1"
 *  for the ficha header. */
function memberSectionLabel(m: Fem2DMember): string {
  if (m.material === 'rc') {
    const s = m.rcSection;
    return s ? `HA ${s.b}×${s.h} cm · HA-${s.fck} · B${s.fyk}` : 'HA (sección sin definir)';
  }
  if (m.material === 'timber') {
    const s = m.timberSection;
    return s ? `${s.gradeId} ${s.b}×${s.h} mm · CS${s.serviceClass}` : 'madera (sección sin definir)';
  }
  const sel = m.steelSelection;
  const cat = sel ? STEEL_CATALOG[sel.profileKey] : undefined;
  return cat && sel ? `${cat.name} · ${sel.steel}` : 'perfil desconocido';
}

/** Worst ELU design forces across combos, each with its governing combination
 *  label. Uses the SAME (possibly αcr-amplified) factor sets as the checks. */
function worstDemands(
  els: Solver2DElementResult[],
  eluCombos: LcFactors[],
): MemberDetail2D['demands'] {
  let Nc = 0, NcCombo = '';
  let Nt = 0, NtCombo = '';
  let V = 0, VCombo = '';
  let M = 0, MCombo = '';
  for (const factors of eluCombos) {
    const ext = comboExtremes(els, factors);
    const label = formatCombo(factors);
    if (-ext.Nmin > Nc) { Nc = -ext.Nmin; NcCombo = label; }
    if (ext.Nmax > Nt) { Nt = ext.Nmax; NtCombo = label; }
    if (ext.V_Ed > V) { V = ext.V_Ed; VCombo = label; }
    if (ext.M_Ed > M) { M = ext.M_Ed; MCombo = label; }
  }
  const out: MemberDetail2D['demands'] = [];
  if (Nc > 1e-6) out.push({ label: 'Axil de compresión NEd', value: `${Nc.toFixed(1)} kN`, combo: NcCombo });
  if (Nt > 1e-6) out.push({ label: 'Axil de tracción NEd', value: `${Nt.toFixed(1)} kN`, combo: NtCombo });
  if (V > 1e-6) out.push({ label: 'Cortante VEd', value: `${V.toFixed(1)} kN`, combo: VCombo });
  if (M > 1e-6) out.push({ label: 'Momento MEd', value: `${M.toFixed(1)} kN·m`, combo: MCombo });
  return out;
}

function fyFor(steel: 'S275' | 'S355'): number {
  // Nominal fy. The self-contained axial check skips the tf>16 reduction —
  // two-force webs are thin angles/light profiles; the routed engines apply
  // their own reduction internally.
  return steel === 'S355' ? 355 : 275;
}

/**
 * Self-contained axial check (two-force members, and companion row on
 * beam-columns). Tension: Npl = A·fy/γM0. Compression: Nb = χ·A·fy/γM1 with
 * λ̄ from the catalog MINOR-axis radius and curve c.
 */
function axialResistances(steel: 'S275' | 'S355', A_cm2: number, Iz_cm4: number, Lcr_m: number) {
  const fy = fyFor(steel);
  const A_mm2 = A_cm2 * 100;
  const Npl = (A_mm2 * fy) / GAMMA_M0 / 1000;            // kN
  const i_mm = Math.sqrt((Iz_cm4 * 1e4) / A_mm2);         // mm
  const lambda1 = 93.9 * Math.sqrt(235 / fy);
  const lambdaBar = (Lcr_m * 1000) / i_mm / lambda1;
  const chi = bucklingChi(lambdaBar, ALPHA_CURVE_C);
  const Nb = (chi * A_mm2 * fy) / GAMMA_M1 / 1000;        // kN
  return { Npl, Nb, chi, lambdaBar, i_mm };
}

/**
 * Resistencia a pandeo GOBERNANTE con arriostramiento del eje débil (D13).
 * Sin `weakAxisBracing`, el eje débil a longitud completa gobierna siempre
 * (mismo L, radio menor) — comportamiento histórico intacto. CON él, el eje
 * débil pandea entre puntos de arriostramiento pero el eje FUERTE sigue
 * pandeando a longitud completa, así que hay que comprobar AMBOS y quedarse
 * con el menor Nb — acortar solo el débil sería un verde no ganado.
 */
function governedAxialResistances(
  steel: 'S275' | 'S355',
  A_cm2: number,
  Iz_cm4: number,
  Imajor_cm4: number,
  L: number,
  weakAxisBracing: number | undefined,
) {
  const Lz = Math.min(weakAxisBracing ?? L, L);
  const weak = axialResistances(steel, A_cm2, Iz_cm4, Lz);
  if (weakAxisBracing === undefined) return { ...weak, Lcr: L, braced: false };
  const major = axialResistances(steel, A_cm2, Imajor_cm4, L);
  return weak.Nb <= major.Nb
    ? { ...weak, Lcr: Lz, braced: true }
    : { ...major, Lcr: L, braced: true };
}

/** Ficha group for the self-contained axial resistances (two-force members
 *  and the beam-column companion rows). */
function axialDetailGroup(
  title: string,
  r: ReturnType<typeof axialResistances>,
  Lcr_m: number,
): DetailGroup2D {
  return {
    title,
    rows: [
      { label: 'Npl,Rd = A·fy / γM0', value: `${r.Npl.toFixed(1)} kN` },
      { label: 'Nb,Rd = χ·A·fy / γM1', value: `${r.Nb.toFixed(1)} kN` },
      { label: 'Longitud de pandeo Lcr (β = 1)', value: `${Lcr_m.toFixed(2)} m` },
      { label: 'Radio de giro del eje gobernante i', value: `${r.i_mm.toFixed(1)} mm` },
      { label: 'Esbeltez reducida λ̄', value: r.lambdaBar.toFixed(2) },
      { label: 'χ (curva c, α = 0.49)', value: r.chi.toFixed(2) },
    ],
  };
}

function axialChecks(
  steel: 'S275' | 'S355',
  A_cm2: number,
  Iz_cm4: number,
  Imajor_cm4: number,
  L: number,
  eluCombos: LcFactors[],
  els: Solver2DElementResult[],
  weakAxisBracing: number | undefined,
): RoutedChecks {
  let Nt = 0, NtCombo = ''; // worst tension across combos
  let Nc = 0, NcCombo = ''; // worst compression magnitude across combos
  for (const factors of eluCombos) {
    const ext = comboExtremes(els, factors);
    if (ext.Nmax > Nt) { Nt = ext.Nmax; NtCombo = formatCombo(factors); }
    if (-ext.Nmin > Nc) { Nc = -ext.Nmin; NcCombo = formatCombo(factors); }
  }
  const res = governedAxialResistances(steel, A_cm2, Iz_cm4, Imajor_cm4, L, weakAxisBracing);
  const { Npl, Nb, chi } = res;
  const rows: MemberCheck[] = [];
  if (Nt > 1e-6) {
    rows.push({
      id: 'axial-tension',
      name: 'Tracción',
      val: `${Nt.toFixed(1)} / ${Npl.toFixed(0)} kN`,
      eta: Nt / Npl,
      ref: 'CE Anejo 22 §6.2.3',
      combo: NtCombo,
    });
  }
  if (Nc > 1e-6) {
    rows.push({
      id: 'axial-buckling',
      name: 'Compresión + pandeo',
      val: `${Nc.toFixed(1)} / ${Nb.toFixed(0)} kN (χ=${chi.toFixed(2)})`,
      eta: Nc / Nb,
      ref: 'CE Anejo 22 §6.3.1',
      combo: NcCombo,
    });
  }
  return {
    rows,
    incomplete: false,
    detailGroups: rows.length > 0 ? [axialDetailGroup('Resistencias axiles (biela)', res, res.Lcr)] : [],
  };
}

/** Profile-defining fields of SteelBeamInputs from a catalog key, via the
 *  unified registry descriptor. null = no bending adapter for this entry
 *  (L angles, unknown keys) → the caller must flag the member incomplete. */
function beamProfileFields(
  profileKey: string,
): Pick<SteelBeamInputs, 'tipo' | 'size' | 'chs_D' | 'chs_t' | 'rhs_h' | 'rhs_b' | 'rhs_t' | 'tube_process'> | null {
  const d = descriptorForKey(profileKey);
  if (!d) return null;
  const base = { size: 0, chs_D: 0, chs_t: 0, rhs_h: 0, rhs_b: 0, rhs_t: 0, tube_process: 'cold-formed' as const };
  switch (d.kind) {
    case 'I':    return { ...base, tipo: d.tipo, size: d.size };
    case '2UPN': return { ...base, tipo: '2UPN', size: d.size };
    case 'CHS':  return { ...base, tipo: 'CHS', chs_D: d.D, chs_t: d.t, tube_process: d.process };
    case 'RHS':  return { ...base, tipo: (d.square ?? d.h === d.b) ? 'SHS' : 'RHS', rhs_h: d.h, rhs_b: d.b, rhs_t: d.t, tube_process: d.process };
  }
}

/** Profile-defining fields of SteelColumnInputs from a catalog key. */
function columnProfileFields(
  profileKey: string,
): Pick<SteelColumnInputs, 'sectionType' | 'size' | 'chs_D' | 'chs_t' | 'chs_process' | 'rhs_h' | 'rhs_b' | 'rhs_t' | 'rhs_process'> | null {
  const d = descriptorForKey(profileKey);
  if (!d) return null;
  const base = {
    size: 0,
    chs_D: 0, chs_t: 0, chs_process: 'cold-formed' as const,
    rhs_h: 0, rhs_b: 0, rhs_t: 0, rhs_process: 'cold-formed' as const,
  };
  switch (d.kind) {
    case 'I':    return { ...base, sectionType: d.tipo, size: d.size };
    case '2UPN': return { ...base, sectionType: '2UPN', size: d.size };
    case 'CHS':  return { ...base, sectionType: 'CHS', chs_D: d.D, chs_t: d.t, chs_process: d.process };
    case 'RHS':  return { ...base, sectionType: (d.square ?? d.h === d.b) ? 'SHS' : 'RHS', rhs_h: d.h, rhs_b: d.b, rhs_t: d.t, rhs_process: d.process };
  }
}

/** Map engine CheckRows → MemberChecks (worst-η merge happens upstream).
 *  `combo` tags demand-carrying rows (η > 0) with the combination that
 *  produced them — informational rows (clasificación, avisos) stay untagged. */
function mapEngineChecks(rows: SteelCheckRow[], combo?: string): MemberCheck[] {
  return rows.map((c) => {
    const eta = c.utilization ?? 0;
    return {
      id: c.id,
      name: c.description ?? c.id,
      val: typeof c.value === 'string' ? c.value : String(c.value ?? ''),
      eta,
      ref: c.article ?? '',
      ...(combo !== undefined && eta > 0 ? { combo } : {}),
    };
  });
}

function mergeWorst(agg: Map<string, MemberCheck>, next: MemberCheck[]): void {
  for (const c of next) {
    const prev = agg.get(c.id);
    if (!prev || c.eta > prev.eta) agg.set(c.id, c);
  }
}

/** calcSteelBeam per ELU combo + axial companion + real deflection. */
function beamChecks(
  m: Fem2DMember,
  steel: 'S275' | 'S355',
  A_cm2: number,
  Iz_cm4: number,
  Imajor_cm4: number,
  L: number,
  eluCombos: LcFactors[],
  elsCombos: LcFactors[],
  els: Solver2DElementResult[],
  deflLimit: number | null,
): RoutedChecks {
  const profile = beamProfileFields(m.steelSelection!.profileKey);
  const agg = new Map<string, MemberCheck>();
  let incomplete = false;
  let Nt = 0, NtCombo = '';
  let Nc = 0, NcCombo = '';
  // First valid engine run, for the ficha: its resistances (Mc,Rd, Vc,Rd,
  // Mb,Rd, χLT…) depend only on section + Lcr, never on the combination.
  let eng: ReturnType<typeof calcSteelBeam> | null = null;

  for (const factors of eluCombos) {
    const ext = comboExtremes(els, factors);
    if (ext.Nmax > Nt) { Nt = ext.Nmax; NtCombo = formatCombo(factors); }
    if (-ext.Nmin > Nc) { Nc = -ext.Nmin; NcCombo = formatCombo(factors); }
    if (!profile) continue; // L-profile beam-column: no bending engine (below)
    const inputs: SteelBeamInputs = {
      title: '',
      ...profile,
      steel,
      // Conservative LTB default for frame members (C1=1 family). Lcr is the
      // compression-flange restraint spacing (correas/forjado) capped by the
      // member length — an unrestrained member buckles over its full length.
      beamType: 'ss',
      MEd: ext.M_Ed,
      VEd: ext.V_Ed,
      VEd_interaction: ext.V_at_MEd,
      Lcr: Math.min(m.ltbSpacing ?? L, L) * 1000,
      Mser: 0, // engine deflection row is replaced by the real-δ row below
      L: L * 1000,
      deflLimit: DEFL_LIMIT_DEFAULT, // input formal del motor: su fila de flecha se descarta (Mser = 0)
      elsCombo: 'characteristic',
      useCategory: 'B',
      gk: 0,
      qk: 0,
      bTrib: 1,
    };
    const result = calcSteelBeam(inputs);
    if (!result.valid) {
      // F1: an engine refusal means the bending check did NOT run — flag the
      // member incomplete so its verdict reads 'pending', never green.
      incomplete = true;
      mergeWorst(agg, [{
        id: 'engine-invalid',
        name: 'Comprobación de flexión',
        val: result.error ?? 'no válida',
        eta: 0,
        ref: '',
      }]);
      continue;
    }
    if (!eng) eng = result;
    // Drop the engine's closed-form deflection — replaced with the FEM δ row.
    mergeWorst(agg, mapEngineChecks(
      (result.checks ?? []).filter((c) => c.id !== 'deflection'),
      formatCombo(factors),
    ));
  }

  if (!profile) {
    incomplete = true; // F1: bending never checked for this profile family
    mergeWorst(agg, [{
      id: 'pending-profile',
      name: 'Flexión (perfil L)',
      val: 'perfil angular no soportado a flexión en v1',
      eta: 0,
      ref: '',
    }]);
  }

  // Axial companion row (separate mechanism; the full M+N §6.3.3 lives in the
  // merged column pass when compression is relevant — see steelChecks).
  // D13: el arriostramiento del eje débil declarado acorta Lcr,z, y el helper
  // gobernado comprueba también el eje fuerte a longitud completa.
  const axialRes = governedAxialResistances(steel, A_cm2, Iz_cm4, Imajor_cm4, L, m.weakAxisBracing);
  const { Npl, Nb, chi } = axialRes;
  // Cribado de la interacción M+N (Fase 1, mechanisms.ts). La fila de arriba usa
  // el eje DÉBIL — correcto como comprobación autónoma de compresión — pero el
  // primer término de la ec. 6.61 se divide por χ_y, el eje FUERTE. Alimentar el
  // cribado con la fila mostrada lo dispararía por un eje que la ecuación no usa
  // (en el dintel IPE240 del pórtico: 0.238 con Iz frente a 0.041 con Iy, factor
  // 6). Se calcula aparte, con el MISMO helper y el eje que pide la ecuación.
  // Es también el umbral que decide si el motor de pilares corre (steelChecks).
  const etaNMajor = Nc / axialResistances(steel, A_cm2, Imajor_cm4, L).Nb;
  const axialRowShown = Nt / Npl >= AXIAL_ROW_MIN_ETA || Nc / Nb >= AXIAL_ROW_MIN_ETA;
  if (Nt / Npl >= AXIAL_ROW_MIN_ETA) {
    mergeWorst(agg, [{
      id: 'axial-tension',
      name: 'Tracción (concomitante)',
      val: `${Nt.toFixed(1)} / ${Npl.toFixed(0)} kN`,
      eta: Nt / Npl,
      ref: 'CE Anejo 22 §6.2.3',
      combo: NtCombo,
    }]);
  }
  if (Nc / Nb >= AXIAL_ROW_MIN_ETA) {
    mergeWorst(agg, [{
      id: 'axial-buckling',
      name: 'Compresión + pandeo (concomitante)',
      val: `${Nc.toFixed(1)} / ${Nb.toFixed(0)} kN (χ=${chi.toFixed(2)})`,
      eta: Nc / Nb,
      ref: 'CE Anejo 22 §6.3.1',
      combo: NcCombo,
    }]);
  }

  // Real relative-to-chord deflection, with its governing ELS combination.
  // D10: el límite es un dato del usuario; null = 'no aplica' → sin fila.
  if (deflLimit !== null) {
    const adm_mm = (L * 1000) / deflLimit;
    const { delta_mm, combo: deltaCombo } = worstElsDeflectionMm(els, elsCombos);
    mergeWorst(agg, [elsDeflectionRow(delta_mm, adm_mm, deltaCombo, deflLimit)]);
  }

  // ── Ficha: resistencias de sección (combo-independientes) ────────────────
  const detailGroups: DetailGroup2D[] = [];
  if (eng && eng.valid) {
    const Lcr_m = Math.min(m.ltbSpacing ?? L, L);
    detailGroups.push({
      title: 'Sección y resistencias (flexión)',
      rows: [
        { label: 'Clase de sección', value: `Clase ${eng.sectionClass}` },
        { label: 'Mc,Rd (flexión)', value: `${eng.Mc_Rd.toFixed(1)} kN·m` },
        { label: 'Vc,Rd (cortante plástico)', value: `${eng.Vc_Rd.toFixed(1)} kN (Av = ${eng.Av.toFixed(0)} mm²)` },
        {
          label: 'Lcr de pandeo lateral',
          value: `${Lcr_m.toFixed(2)} m${m.ltbSpacing !== undefined ? ' (arriostrado por correas)' : ' (sin arriostrar = L)'}`,
        },
        { label: 'Momento crítico Mcr', value: Number.isFinite(eng.Mcr) ? `${eng.Mcr.toFixed(1)} kN·m` : '∞' },
        { label: 'λ̄LT / χLT', value: `${eng.lambda_LT.toFixed(2)} / ${eng.chi_LT.toFixed(2)}` },
        { label: 'Mb,Rd (pandeo lateral)', value: `${eng.Mb_Rd.toFixed(1)} kN·m` },
      ],
    });
  }
  if (axialRowShown) {
    detailGroups.push(axialDetailGroup(AXIAL_COMPANION_GROUP_TITLE, axialRes, axialRes.Lcr));
  }

  return { rows: Array.from(agg.values()), incomplete, detailGroups, etaNMajor };
}

/**
 * Pasada del motor de PILARES (calcSteelColumn) per ELU combo: clase bajo N,
 * Nby/Nbz, MyRd y la interacción M+N §6.3.3 (int1/int2). Desde la Fase 2 SOLO
 * corre dentro de la pasada combinada de steelChecks (compresión relevante),
 * así que el cortante ya lo aporta la pasada de vigas — la sub-llamada Vpl que
 * vivía aquí se eliminó para no duplicar la fila.
 */
function columnChecks(
  m: Fem2DMember,
  steel: 'S275' | 'S355',
  A_cm2: number,
  L: number,
  eluCombos: LcFactors[],
  els: Solver2DElementResult[],
): RoutedChecks {
  const profile = columnProfileFields(m.steelSelection!.profileKey);
  const agg = new Map<string, MemberCheck>();
  let incomplete = false;
  let Nt = 0, NtCombo = '';
  // First valid engine run, for the ficha (resistances are combo-independent).
  let eng: ReturnType<typeof calcSteelColumn> | null = null;

  for (const factors of eluCombos) {
    const ext = comboExtremes(els, factors);
    if (ext.Nmax > Nt) { Nt = ext.Nmax; NtCombo = formatCombo(factors); }
    if (!profile) continue;
    const inputs: SteelColumnInputs = {
      title: '',
      ...profile,
      steel,
      Ly: L * 1000,
      Lz: L * 1000,
      // β = 1 both axes: NON-sway buckling length paired with the αcr
      // amplified-sway-moment method (EC3 5.2.2(7)(b)).
      bcType: 'custom',
      beta_y: 1,
      beta_z: 1,
      Ned: Math.max(0, -ext.Nmin),
      My_Ed: ext.M_Ed,
      Mz_Ed: 0,
    };
    const result = calcSteelColumn(inputs);
    if (!result.valid) {
      // F1: refused engine run → member must read 'pending'.
      incomplete = true;
      mergeWorst(agg, [{
        id: 'engine-invalid',
        name: 'Comprobación de pilar',
        val: result.error ?? 'no válida',
        eta: 0,
        ref: '',
      }]);
      continue;
    }
    if (!eng) eng = result;
    mergeWorst(agg, mapEngineChecks(result.checks ?? [], formatCombo(factors)));
  }

  // ── Ficha: resistencias de flexocompresión (combo-independientes) ────────
  const detailGroups: DetailGroup2D[] = [];
  if (eng && eng.valid) {
    const rows: DetailRow2D[] = [
      { label: 'Clase de sección (bajo N)', value: `Clase ${eng.sectionClass}` },
      { label: 'NRd (compresión de sección)', value: `${eng.NRd.toFixed(0)} kN` },
      { label: 'Nb,Rd eje y (λ̄ / χ)', value: `${eng.Nb_Rd_y.toFixed(0)} kN (${eng.lambda_y.toFixed(2)} / ${eng.chi_y.toFixed(2)})` },
      { label: 'Nb,Rd eje z (λ̄ / χ)', value: `${eng.Nb_Rd_z.toFixed(0)} kN (${eng.lambda_z.toFixed(2)} / ${eng.chi_z.toFixed(2)})` },
      { label: 'My,Rd (flexión eje fuerte)', value: `${eng.My_Rd.toFixed(1)} kN·m` },
    ];
    rows.push({ label: 'Longitud de pandeo (β = 1, no traslacional + αcr)', value: `${L.toFixed(2)} m` });
    detailGroups.push({ title: 'Flexocompresión M+N (§6.3.3)', rows });
  }

  if (!profile) {
    // F1: no engine can check this profile as a column (L angles / unknown
    // key) → incomplete. La fila de cortante (agg), si corrió, sí viaja:
    // informa aunque el veredicto quede pendiente.
    return {
      incomplete: true,
      rows: [{
        id: 'pending-profile',
        name: 'Comprobación de pilar',
        val: `perfil '${m.steelSelection!.profileKey}' no soportado por el motor de pilares`,
        eta: 0,
        ref: '',
      }, ...Array.from(agg.values())],
      detailGroups,
    };
  }

  // Net-tension combos (wind uplift): axial tension row. Documented
  // limitation: no combined tension+M interaction row in v1 (compression
  // combinations govern sizing in the parametric portals).
  if (Nt > 1e-6) {
    const fy = fyFor(steel);
    const Npl = (A_cm2 * 100 * fy) / GAMMA_M0 / 1000;
    mergeWorst(agg, [{
      id: 'axial-tension',
      name: 'Tracción (succión)',
      val: `${Nt.toFixed(1)} / ${Npl.toFixed(0)} kN`,
      eta: Nt / Npl,
      ref: 'CE Anejo 22 §6.2.3',
      combo: NtCombo,
    }]);
  }

  return { rows: Array.from(agg.values()), incomplete, detailGroups };
}

// ── Timber members (todas las familias de rol → calcTimberFrameMember) ──────

/** Clase de duración de una combinación: la de la acción MÁS CORTA presente
 *  con factor > 0 (EC5 §3.1.3(2) — el kmod de la combinación es el de su
 *  acción más corta). Asignación CTE DB SE-M Tabla 2.2: G permanente · Q (uso)
 *  media · viento corta · sismo instantánea. La NIEVE es corta a ≤1000 m y
 *  MEDIA por encima (`snowOver1000m`) — pero el viento, si concurre, sigue
 *  siendo la acción más corta y gobierna. Un factor 0 (ψ0 = 0) no cuenta: esa
 *  acción no aporta nada a la combinación. */
function comboDuration(factors: LcFactors, snowOver1000m: boolean): LoadDurationClass {
  if ((factors.E ?? 0) > 0) return 'instantaneous';
  if ((factors.W ?? 0) > 0) return 'short';
  if ((factors.S ?? 0) > 0) return snowOver1000m ? 'medium' : 'short';
  if ((factors.Q ?? 0) > 0) return 'medium';
  return 'permanent';
}

const DURATION_LABEL: Record<LoadDurationClass, string> = {
  permanent: 'permanente',
  long: 'larga',
  medium: 'media',
  short: 'corta',
  instantaneous: 'instantánea',
};

function mapTimberChecks(rows: TimberFrameCheckRow[], combo: string): MemberCheck[] {
  return rows.map((c) => ({
    id: c.id,
    name: c.description,
    val: c.limit !== '' ? `${c.value} / ${c.limit}` : c.value,
    eta: c.utilization,
    ref: c.article,
    ...(c.utilization > 0 ? { combo } : {}),
  }));
}

/**
 * Barras de madera: calcTimberFrameMember POR COMBINACIÓN ELU (el kmod depende
 * de la duración de las acciones del combo, así que — a diferencia del acero —
 * las resistencias NO son combo-independientes y la combinación solo-G con
 * kmod permanente puede gobernar con carga variable pequeña, §3.1.3(2)).
 * Emparejamiento conservador no concurrente (mismo criterio que los pilares
 * de acero/HA): |M| y |V| máximos del combo con ambos extremos de N del combo.
 * El motor cubre flexocompresión 6.23/6.24/6.35 y flexotracción 6.17 SIEMPRE
 * (nunca separa mecanismos); una biela derivada entra por el mismo camino y
 * degenera limpiamente a axil puro (M = V = 0 en sus muestras del solver).
 *
 * D13: el motor toma Lef_z y Lltb POR SEPARADO, así que aquí la separación de
 * coacciones es literal — las correas (`ltbSpacing`) acortan SOLO el vuelco
 * (kcrit) y el arriostramiento del eje débil (`weakAxisBracing`) SOLO kc,z.
 * Antes ambos salían de las correas: kc,z ganaba una coacción que unas correas
 * en el ala no garantizan.
 */
function timberChecks(
  m: Fem2DMember,
  L: number,
  eluCombos: LcFactors[],
  elsCombos: LcFactors[],
  cpFactors: LcFactors,
  els: Solver2DElementResult[],
  snowOver1000m: boolean,
  deflLimit: number | null,
): RoutedChecks {
  const sec = m.timberSection!;
  const grade = getTimberGrade(sec.gradeId)!;
  const Lltb = Math.min(m.ltbSpacing ?? L, L);
  const Lz = Math.min(m.weakAxisBracing ?? L, L);

  const agg = new Map<string, MemberCheck>();
  let incomplete = false;
  // Ficha: la pasada válida cuyo peor η gobierna (kmod varía por combo).
  let engBest: {
    res: TimberFrameResult;
    label: string;
    duration: LoadDurationClass;
    key: number;
  } | null = null;

  // §3.1.3(2) (fix #113 del módulo de vigas transplantado): la combinación
  // SOLO-PERMANENTE (1.35·G con kmod permanente = 0.60) puede gobernar cuando
  // la variable es pequeña (q < ~0.3·g), pero el set multi-principal no la
  // incluye si hay acciones variables — se añade aquí. Sin cargas G aporta
  // extremos nulos y no emite filas (inocua).
  const combosToRun: LcFactors[] = eluCombos.some((f) => comboDuration(f, snowOver1000m) === 'permanent')
    ? eluCombos
    : [...eluCombos, { G: 1.35 }];

  for (const factors of combosToRun) {
    const ext = comboExtremes(els, factors);
    const label = formatCombo(factors);
    const duration = comboDuration(factors, snowOver1000m);
    const runs = [ext.Nmin];
    if (ext.Nmax > 1e-6 && ext.Nmax !== ext.Nmin) runs.push(ext.Nmax);
    for (const N of runs) {
      const res = calcTimberFrameMember({
        section: sec,
        // β = 1 en el plano: longitud de pandeo NO traslacional emparejada con
        // los momentos amplificados por αcr (mismo criterio que acero/HA).
        Lef_y: L,
        Lef_z: Lz,
        Lltb,
        loadDuration: duration,
        N,
        M: ext.M_Ed,
        V: ext.V_Ed,
      });
      if (!res.valid) {
        // F1: un motor que rechaza el combo deja la barra sin comprobar →
        // el veredicto debe leer 'pending', nunca un verde no ganado.
        incomplete = true;
        mergeWorst(agg, [{
          id: 'engine-invalid',
          name: 'Comprobación de madera',
          val: res.error ?? 'no válida',
          eta: 0,
          ref: '',
        }]);
        continue;
      }
      const key = res.checks.reduce(
        (mx, c) => Math.max(mx, Number.isFinite(c.utilization) ? c.utilization : 1e9),
        0,
      );
      if (!engBest || key > engBest.key) engBest = { res, label, duration, key };
      mergeWorst(agg, mapTimberChecks(res.checks, label));
    }
  }

  // ── Flecha (D10: la gobierna el dato del usuario; una biela derivada no
  //    flecta por formulación y checkMember ya resuelve deflLimit = null) ────
  if (deflLimit !== null) {
    const adm_mm = (L * 1000) / deflLimit;

    // Instantánea característica: la δ REAL del solver relativa a la cuerda,
    // con su combinación pésima (misma fila normativa que las vigas de acero,
    // helper compartido).
    const { delta_mm, combo: deltaCombo } = worstElsDeflectionMm(els, elsCombos);
    mergeWorst(agg, [elsDeflectionRow(delta_mm, adm_mm, deltaCombo, deflLimit)]);

    // FINAL con fluencia: δ_fin = δ_c + kdef·δ_cp — COTA SUPERIOR de la
    // u_fin = u_G·(1+kdef) + u_Q·(1+ψ2·kdef) del módulo de vigas de madera
    // (EC5 §2.2.3), sin necesitar la partición G/Q por hipótesis: la fluencia
    // actúa sobre la parte cuasipermanente. Exacta cuando la MISMA sección
    // gobierna δ_c y δ_cp (el caso gravitatorio normal); con picos no
    // coincidentes (p.ej. viento principal en ELS-c) cada término se maximiza
    // por separado y la suma queda del lado seguro.
    const kdef = getKdef(grade.type, sec.serviceClass);
    const deltaCp_mm = worstRelativeDeflection(els, [cpFactors]) * 1000;
    const deltaFin = delta_mm + kdef * deltaCp_mm;
    mergeWorst(agg, [{
      id: 'deflection-fin',
      name: 'Flecha final con fluencia (δ_c + kdef·δ_cp)',
      val: `δ = ${deltaFin.toFixed(1)} mm (kdef = ${kdef.toFixed(2)}) / L/${deflLimit} = ${adm_mm.toFixed(1)} mm`,
      eta: adm_mm > 0 ? deltaFin / adm_mm : 0,
      ref: 'CTE DB-SE 4.3.3 · EN 1995-1-1 §2.2.3',
      combo: formatCombo(cpFactors),
    }]);
  }

  // ── Ficha: material + pandeo del combo pésimo ─────────────────────────────
  const detailGroups: DetailGroup2D[] = [];
  if (engBest) {
    const e = engBest.res;
    detailGroups.push({
      title: `Material y resistencias — combo pésimo: ${engBest.label}`,
      rows: [
        {
          label: 'Clase resistente',
          value: `${grade.label} (${grade.type === 'glulam' ? 'laminada encolada' : 'aserrada'})`,
        },
        {
          label: `kmod (clase de servicio ${sec.serviceClass}, duración ${DURATION_LABEL[engBest.duration]})`,
          value: e.kmod.toFixed(2),
        },
        { label: 'γM', value: e.gammaM.toFixed(2) },
        { label: 'kh (factor de tamaño)', value: e.kh.toFixed(3) },
        {
          label: 'fm,d (con kh) / fc0,d / ft0,d / fv,d',
          value: `${e.fm_d.toFixed(2)} / ${e.fc0_d.toFixed(2)} / ${e.ft0_d.toFixed(2)} / ${e.fv_d.toFixed(2)} N/mm²`,
        },
      ],
    });
    detailGroups.push({
      title: 'Pandeo y vuelco lateral',
      rows: [
        { label: 'Lef en el plano (β = 1, no traslacional + αcr)', value: `${L.toFixed(2)} m` },
        {
          label: 'Lef fuera del plano (eje débil)',
          value: `${Lz.toFixed(2)} m${m.weakAxisBracing !== undefined ? ' (arriostramiento declarado)' : ' (sin arriostrar = L)'}`,
        },
        {
          label: 'Lef de vuelco lateral',
          value: `${Lltb.toFixed(2)} m${m.ltbSpacing !== undefined ? ' (arriostrada por correas)' : ' (sin arriostrar = L)'}`,
        },
        { label: 'λrel,y / kc,y (plano)', value: `${e.lambda_rel_y.toFixed(2)} / ${e.kc_y.toFixed(3)}` },
        { label: 'λrel,z / kc,z (fuera del plano)', value: `${e.lambda_rel_z.toFixed(2)} / ${e.kc_z.toFixed(3)}` },
        {
          label: 'σm,crit / λrel,m / kcrit (vuelco lateral)',
          value: `${e.sigma_m_crit.toFixed(1)} N/mm² / ${e.lambda_rel_m.toFixed(2)} / ${e.kcrit.toFixed(3)}`,
        },
      ],
    });
  }

  return { rows: Array.from(agg.values()), incomplete, detailGroups };
}

// ── RC members (viga/cordon → calcRCBeam · pilar → calcRCColumn) ────────────

/** Render an RC engine CheckRow value: legacy strings first, then the SI
 *  numeric path (the RC engines mix makeCheck and makeCheckQty rows — the
 *  steel mapper only reads the legacy `value` field and would drop these). */
function rcVal(c: CheckRow): string {
  if (typeof c.value === 'string' && c.value !== '') {
    return c.limit ? `${c.value} / ${c.limit}` : c.value;
  }
  if (c.valueNum !== undefined && c.valueQty) {
    const v = formatQuantity(c.valueNum, c.valueQty, 'si');
    return c.limitNum !== undefined && c.limitQty
      ? `${v} / ${formatQuantity(c.limitNum, c.limitQty, 'si')}`
      : v;
  }
  if (c.valueStr) return c.limitStr ? `${c.valueStr} / ${c.limitStr}` : c.valueStr;
  return '';
}

function mapRcChecks(rows: CheckRow[], idPrefix: string, namePrefix: string): MemberCheck[] {
  return rows.map((c) => {
    // NaN utilization (informational rows) must not poison max-η/toStatus (NaN
    // compares false → would read 'fail'). Infinity is KEPT: a zero-capacity
    // check is a real fail, not noise.
    let eta = Number.isNaN(c.utilization) ? 0 : (c.utilization ?? 0);
    let status: CheckStatus | undefined;
    const engineOk = c.status === 'ok' || c.status === 'neutral';
    if (engineOk && toStatus(eta) !== 'ok') {
      // Threshold row MET exactly at the limit ("4 barras / ≥ 4" → ratio 1.0,
      // engine status 'ok'): the ratio is a CONDITION, not a capacity
      // utilization — it must not read INCUMPLE nor drive the member max-η.
      // The real numbers stay visible in the val string.
      eta = 0;
    } else if (c.status === 'fail' && eta < 1) {
      // Engine-declared fail that eta cannot express (e.g. the N/A row when
      // aplastamiento governs) — carry it explicitly.
      status = 'fail';
    } else if (c.status === 'warn' && toStatus(eta) === 'fail') {
      // Aviso declarado por el motor con ratio ≥ 1 (p. ej. densificación de
      // cercos §9.5.3(4)): es advertencia, no fallo — se conserva 'warn' y η
      // se recorta al umbral para no arrastrar el max-η del miembro a
      // INCUMPLE. Los números reales siguen visibles en la columna val.
      status = 'warn';
      eta = WARN_UTIL;
    }
    return {
      id: `${idPrefix}${c.id}`,
      name: `${namePrefix}${c.description ?? c.id}`,
      val: rcVal(c),
      eta,
      ref: c.article ?? '',
      ...(status !== undefined ? { status } : {}),
    };
  });
}

/** Signed-region demands for the RC beam split, all magnitudes ≥ 0 after the
 *  world-sagging normalization: sag = tension on the world-bottom face. */
interface RcRegionDemands {
  vanoSag: number;   // max sagging M in [0.25L, 0.75L] (kN·m)
  vanoHog: number;   // max hogging M in the vano region (reversal)
  vanoV: number;     // max |V| in the vano region (kN)
  apoyoHog: number;  // max hogging M in [0, 0.15L] ∪ [0.85L, L]
  apoyoSag: number;  // max sagging M in the apoyo region (reversal)
  apoyoV: number;    // max |V| in the apoyo region
}

function rcRegionExtremes(
  els: Solver2DElementResult[],
  factors: LcFactors,
  sagSign: 1 | -1,
): RcRegionDemands {
  const L = els.reduce((s, e) => s + e.L, 0);
  const vLo = 0.25 * L;
  const vHi = 0.75 * L;
  const aLo = 0.15 * L;
  const aHi = 0.85 * L;
  const out: RcRegionDemands = { vanoSag: 0, vanoHog: 0, vanoV: 0, apoyoHog: 0, apoyoSag: 0, apoyoV: 0 };
  let xOff = 0;
  for (const e of els) {
    for (let i = 0; i < e.samples.xs.length; i++) {
      const x = xOff + e.samples.xs[i];
      const M = sagSign * comboSample(e, 'M', i, factors);
      const V = Math.abs(comboSample(e, 'V', i, factors));
      if (x >= vLo && x <= vHi) {
        if (M > out.vanoSag) out.vanoSag = M;
        if (-M > out.vanoHog) out.vanoHog = -M;
        if (V > out.vanoV) out.vanoV = V;
      }
      if (x <= aLo || x >= aHi) {
        if (-M > out.apoyoHog) out.apoyoHog = -M;
        if (M > out.apoyoSag) out.apoyoSag = M;
        if (V > out.apoyoV) out.apoyoV = V;
      }
    }
    xOff += e.L;
  }
  return out;
}

/** viga / cordon HA: calcRCBeam with the 1D vano/apoyo split. ONE engine call
 *  with per-mechanism maxima across ELU combos — exact, because calcRCBeam
 *  has no cross-mechanism interaction row (flexión, cortante y fisuración
 *  dependen cada una de UNA sola demanda), so worst-per-mechanism ≡ per-combo
 *  iteration with worst-η merge. A second REVERSED call (tension/compression
 *  faces swapped) covers wind/seismic moment inversion per region. */
function rcBeamChecks(
  m: Fem2DMember,
  sagSign: 1 | -1,
  eluCombos: LcFactors[],
  cpFactors: LcFactors,
  els: Solver2DElementResult[],
  deflLimit: number | null,
): RoutedChecks {
  const sec = m.rcSection!;
  const vano = m.vanoArmado;
  const apoyo = m.apoyoArmado;
  if (!vano || !apoyo) {
    return {
      incomplete: true,
      rows: [{ id: 'pending-armado', name: 'Armado HA', val: 'sin definir — edítalo en el inspector', eta: 0, ref: '' }],
    };
  }

  const dem: RcRegionDemands = { vanoSag: 0, vanoHog: 0, vanoV: 0, apoyoHog: 0, apoyoSag: 0, apoyoV: 0 };
  // Governing combination label per mechanism maximum (ficha + row tags).
  const demCombo: Record<keyof RcRegionDemands, string> = {
    vanoSag: '', vanoHog: '', vanoV: '', apoyoHog: '', apoyoSag: '', apoyoV: '',
  };
  // Per-combo demands kept for the M+N pairing (interaction is NOT separable
  // per mechanism: M and N must come from the SAME combination).
  const perCombo: { r: RcRegionDemands; Nc: number; Nt: number; label: string }[] = [];
  let Nc = 0, NcCombo = '';
  let Nt = 0;
  for (const factors of eluCombos) {
    const r = rcRegionExtremes(els, factors, sagSign);
    const label = formatCombo(factors);
    for (const k of Object.keys(dem) as (keyof RcRegionDemands)[]) {
      if (r[k] > dem[k]) { dem[k] = r[k]; demCombo[k] = label; }
    }
    const ext = comboExtremes(els, factors);
    perCombo.push({ r, Nc: Math.max(0, -ext.Nmin), Nt: Math.max(0, ext.Nmax), label });
    if (ext.Nmax > Nt) Nt = ext.Nmax;
    if (-ext.Nmin > Nc) { Nc = -ext.Nmin; NcCombo = label; }
  }
  const cp = rcRegionExtremes(els, cpFactors, sagSign);
  const cpLabel = formatCombo(cpFactors);

  const rows: MemberCheck[] = [];
  let incomplete = false;

  // ── Gate de esbeltez con axil (§5.8.3.1) + flexión compuesta M+N ──────────
  const b_mm = sec.b * 10;
  const h_mm = sec.h * 10;
  const AcFcd_N = b_mm * h_mm * (sec.fck / 1.5);
  const L_m = els.reduce((s, e) => s + e.L, 0);
  const nRel = (Nc * 1000) / AcFcd_N;
  // λ en el plano del pórtico, β=1 (emparejado con la amplificación αcr).
  const lambda = (L_m * 1000) / (h_mm / Math.sqrt(12));
  const lambdaLim = nRel > 0 ? RC_LAMBDA_LIM_COEF / Math.sqrt(nRel) : Infinity;
  if (lambda > lambdaLim) {
    // El 2º orden de barra (curvatura nominal §5.8.8) no está modelado para
    // vigas — F1: pending honesto, nunca un M+N de sección que ignore pandeo.
    incomplete = true;
    rows.push({
      id: 'slenderness-gate',
      name: 'Esbeltez con axil de compresión',
      val: `λ = ${lambda.toFixed(1)} > λ_lim = ${lambdaLim.toFixed(1)} (n = ${nRel.toFixed(2)}) — el 2º orden de barra no es despreciable: compruébala como pilar (flexocompresión §5.8)`,
      eta: 0,
      ref: 'CE Anejo 19 §5.8.3.1',
      ...(NcCombo !== '' ? { combo: NcCombo } : {}),
    });
  } else if (Math.max(Nc, Nt) > (RC_MN_ROW_MIN * AcFcd_N) / 1000) {
    // Flexión compuesta por fibras (rcBeamMN): por combo, el M de cada región
    // y ORIENTACIÓN (caras permutadas para el signo invertido) emparejado con
    // AMBOS extremos de N del mismo combo (Nc y Nt — conservador: MRd(N) no es
    // monótona y la concurrencia sección a sección no se rastrea; en vigas N
    // es casi constante). Compresión añade la excentricidad mínima de EC2
    // 6.1(4): M_check = max(M, N·max(h/30, 20 mm)); sin el término Lk/400 de
    // pilares (λ ≤ λ_lim aquí — aproximación documentada).
    const mnRow = (region: 'vano' | 'apoyo'): MemberCheck | null => {
      const arm = region === 'vano' ? vano : apoyo;
      let worst: { eta: number; val: string; combo: string } | null = null;
      let curLabel = ''; // combination label of the perCombo entry being considered
      const consider = (eta: number, val: string) => {
        if (!worst || eta > worst.eta) worst = { eta, val, combo: curLabel };
      };
      for (const c of perCombo) {
        curLabel = c.label;
        const orientations = region === 'vano'
          ? [{ M: c.r.vanoSag, flip: false }, { M: c.r.vanoHog, flip: true }]
          : [{ M: c.r.apoyoHog, flip: false }, { M: c.r.apoyoSag, flip: true }];
        for (const { M, flip } of orientations) {
          if (c.Nc <= 1e-9 && (c.Nt <= 1e-9 || M <= 1e-9)) continue;
          const s: BeamMNSection = {
            b: b_mm, h: h_mm, fck: sec.fck, fyk: sec.fyk, cover: sec.cover,
            stirrupDiam: arm.stirrupDiam,
            tensNBars: flip ? arm.comp_nBars : arm.tens_nBars,
            tensBarDiam: flip ? arm.comp_barDiam : arm.tens_barDiam,
            compNBars: flip ? arm.tens_nBars : arm.comp_nBars,
            compBarDiam: flip ? arm.tens_barDiam : arm.comp_barDiam,
          };
          if (c.Nc > 1e-9) {
            const Mcheck = Math.max(M, (c.Nc * Math.max(h_mm / 30, 20)) / 1000);
            const r = beamMNCapacity(s, c.Nc);
            if (r.mode === 'nd-max') {
              consider(c.Nc / r.NRdMax, `NEd = ${c.Nc.toFixed(1)} kN ≥ NRd,max = ${r.NRdMax.toFixed(0)} kN (compresión pura)`);
            } else if (r.MRd <= 0) {
              consider(Infinity, `MRd(N) ≤ 0 con N = ${c.Nc.toFixed(1)} kN de compresión`);
            } else {
              consider(Mcheck / r.MRd, `M = ${Mcheck.toFixed(1)} kN·m · N = ${c.Nc.toFixed(1)} kN compresión → MRd(N) = ${r.MRd.toFixed(1)} kN·m`);
            }
          }
          if (c.Nt > 1e-9) {
            const r = beamMNCapacity(s, -c.Nt);
            if (r.mode === 'nt-max') {
              consider(c.Nt / r.NtRd, `NEd = ${c.Nt.toFixed(1)} kN ≥ Nt,Rd = ${r.NtRd.toFixed(0)} kN (tracción pura — solo armadura)`);
            } else if (r.MRd <= 0) {
              consider(Infinity, `MRd(N) ≤ 0 con N = ${c.Nt.toFixed(1)} kN de tracción`);
            } else if (M > 1e-9) {
              consider(M / r.MRd, `M = ${M.toFixed(1)} kN·m · N = ${c.Nt.toFixed(1)} kN tracción → MRd(N) = ${r.MRd.toFixed(1)} kN·m`);
            }
          }
        }
      }
      const w = worst as { eta: number; val: string; combo: string } | null;
      if (w === null) return null;
      return {
        id: `mn-${region}`,
        name: `Flexión compuesta M+N (${region})`,
        val: w.val,
        eta: w.eta,
        ref: 'CE Anejo 19 §6.1',
        combo: w.combo,
      };
    };
    for (const region of ['vano', 'apoyo'] as const) {
      const row = mnRow(region);
      if (row) rows.push(row);
    }
  }

  // Fisuración multi-principal REAL: loadType 'custom' + psi2Custom 0 anulan
  // el ψ2 interno del motor ⇒ Ms = |M_G|, y por M_G entra directamente el
  // momento CUASIPERMANENTE de la combinación multi-principal (ψ2 por carga).
  const base = {
    mode: 'portico' as const,
    title: '',
    b: sec.b * 10,   // cm → mm
    h: sec.h * 10,
    cover: sec.cover,
    fck: sec.fck,
    fyk: sec.fyk,
    exposureClass: sec.exposureClass,
    loadType: 'custom',
    psi2Custom: 0,
    L: 0,            // la esbeltez L/d del motor no aplica: la flecha se
                     // comprueba con la fila 'deflection-cracked' (δ real del
                     // solver × factor fisurado §7.4.3), no por exención L/d
    structSystem: 'ss' as const,
  };
  const armadoVano = {
    vano_stirrupDiam: vano.stirrupDiam,
    vano_stirrupSpacing: vano.stirrupSpacing,
    vano_stirrupLegs: vano.stirrupLegs,
  };
  const armadoApoyo = {
    apoyo_stirrupDiam: apoyo.stirrupDiam,
    apoyo_stirrupSpacing: apoyo.stirrupSpacing,
    apoyo_stirrupLegs: apoyo.stirrupLegs,
  };

  const main = calcRCBeam({
    ...base,
    ...armadoVano,
    ...armadoApoyo,
    vano_Md: dem.vanoSag,
    vano_VEd: dem.vanoV,
    vano_M_G: cp.vanoSag,
    vano_M_Q: 0,
    vano_bot_nBars: vano.tens_nBars,
    vano_bot_barDiam: vano.tens_barDiam,
    vano_top_nBars: vano.comp_nBars,
    vano_top_barDiam: vano.comp_barDiam,
    apoyo_Md: dem.apoyoHog,
    apoyo_VEd: dem.apoyoV,
    apoyo_M_G: cp.apoyoHog,
    apoyo_M_Q: 0,
    apoyo_top_nBars: apoyo.tens_nBars,
    apoyo_top_barDiam: apoyo.tens_barDiam,
    apoyo_bot_nBars: apoyo.comp_nBars,
    apoyo_bot_barDiam: apoyo.comp_barDiam,
  } satisfies RCBeamInputs);

  // Combination tag per RC mechanism row: flexión lleva el combo del M de su
  // región, cortante el del V, fisuración la cuasipermanente. Filas de
  // detailing (cuantías, separaciones) son combo-independientes → sin tag.
  const tagRcCombos = (list: MemberCheck[], mCombo: string, vCombo: string): MemberCheck[] =>
    list.map((c) => {
      const bare = c.id.slice(c.id.indexOf(':') + 1);
      const combo = bare.startsWith('bending') ? mCombo
        : bare.startsWith('shear') ? vCombo
        : bare === 'cracking' ? cpLabel
        : bare === 'deflection-cracked' ? cpLabel
        : '';
      return combo !== '' ? { ...c, combo } : c;
    });

  if (!main.valid) {
    // F1: a refused engine run means nothing was checked → member reads pending.
    incomplete = true;
    rows.push({ id: 'engine-invalid', name: 'Comprobación HA', val: main.error ?? 'no válida', eta: 0, ref: '' });
  } else {
    for (const [region, res, label, mCombo, vCombo] of [
      ['vano', main.vano, 'Vano', demCombo.vanoSag, demCombo.vanoV],
      ['apoyo', main.apoyo, 'Apoyo', demCombo.apoyoHog, demCombo.apoyoV],
    ] as const) {
      if (res.valid) {
        rows.push(...tagRcCombos(mapRcChecks(res.checks, `${region}:`, `${label} · `), mCombo, vCombo));
      } else {
        incomplete = true;
        rows.push({ id: `${region}:engine-invalid`, name: `${label} · comprobación HA`, val: res.error ?? 'no válida', eta: 0, ref: '' });
      }
    }
  }

  // Momento de signo CONTRARIO al canónico de cada región (inversión por
  // viento/sismo en vano; también el M+ de una biapoyada que entra en la zona
  // de apoyo): tracción en la cara opuesta → segunda llamada con las caras
  // permutadas. Solo las filas de flexión (+fisuración si la cuasipermanente
  // también invierte — raro) y solo en las regiones con demanda real.
  const vanoRev = dem.vanoHog > RC_REVERSAL_MIN_KNM;
  const apoyoRev = dem.apoyoSag > RC_REVERSAL_MIN_KNM;
  if (vanoRev || apoyoRev) {
    const rev = calcRCBeam({
      ...base,
      ...armadoVano,
      ...armadoApoyo,
      vano_Md: dem.vanoHog,
      vano_VEd: 0,
      vano_M_G: cp.vanoHog,
      vano_M_Q: 0,
      // Tracción ARRIBA en vano ⇒ trabaja la cara de compresión del armado de vano.
      vano_bot_nBars: vano.comp_nBars,
      vano_bot_barDiam: vano.comp_barDiam,
      vano_top_nBars: vano.tens_nBars,
      vano_top_barDiam: vano.tens_barDiam,
      apoyo_Md: dem.apoyoSag,
      apoyo_VEd: 0,
      apoyo_M_G: cp.apoyoSag,
      apoyo_M_Q: 0,
      // Tracción ABAJO en apoyo ⇒ trabaja la cara de compresión del armado de apoyo.
      apoyo_top_nBars: apoyo.comp_nBars,
      apoyo_top_barDiam: apoyo.comp_barDiam,
      apoyo_bot_nBars: apoyo.tens_nBars,
      apoyo_bot_barDiam: apoyo.tens_barDiam,
    } satisfies RCBeamInputs);
    if (!rev.valid) {
      incomplete = true;
      rows.push({ id: 'rev:engine-invalid', name: 'Inversión de momento', val: rev.error ?? 'no comprobable (¿cara sin armadura?)', eta: 0, ref: '' });
    } else {
      for (const [on, res, cpRev, region, label] of [
        [vanoRev, rev.vano, cp.vanoHog, 'vano-inv', 'Vano (M−, tracción arriba)'],
        [apoyoRev, rev.apoyo, cp.apoyoSag, 'apoyo-inv', 'Apoyo (M+, tracción abajo)'],
      ] as const) {
        if (!on) continue;
        if (!res.valid) {
          incomplete = true;
          rows.push({ id: `${region}:engine-invalid`, name: `${label} · comprobación HA`, val: res.error ?? 'no válida', eta: 0, ref: '' });
          continue;
        }
        const keep = res.checks.filter((c) => c.id === 'bending' || (c.id === 'cracking' && cpRev > RC_REVERSAL_MIN_KNM));
        const mCombo = region === 'vano-inv' ? demCombo.vanoHog : demCombo.apoyoSag;
        rows.push(...tagRcCombos(mapRcChecks(keep, `${region}:`, `${label} · `), mCombo, ''));
      }
    }
  }

  // ── Flecha diferida cuasipermanente con sección fisurada (§7.4.3) ─────────
  // δ_dif = δ_cp,solver × k, con k de crackedDeflection (interpolación ζ con
  // fluencia sobre la MISMA base E del solver — no fisurada ⇒ k = 1+φef
  // exacto). M_cp del máx |M| de TODO el miembro vía comboExtremes (las
  // regiones de rcRegionExtremes dejan huecos en [0.15L,0.25L]∪[0.75L,0.85L]).
  // Armadura: la cara traccionada DOMINANTE del vano (la flecha es del vano).
  // D10: el denominador es el dato del usuario; null = 'no aplica' → sin fila.
  if (deflLimit !== null) {
    const Mcp = comboExtremes(els, cpFactors).M_Ed;
    const domSag = cp.vanoSag >= cp.vanoHog;
    const faceN = domSag ? vano.tens_nBars : vano.comp_nBars;
    const faceDiam = domSag ? vano.tens_barDiam : vano.comp_barDiam;
    const fis = crackedDeflectionFactor({
      b: b_mm,
      h: h_mm,
      fck: sec.fck,
      As: faceN * getBarArea(faceDiam),
      d: h_mm - sec.cover - vano.stirrupDiam - faceDiam / 2,
      Mcp,
      phiEf: RC_PHI_EF,
    });
    const deltaCp_mm = worstRelativeDeflection(els, [cpFactors]) * 1000;
    // 0 × ∞ (sin flecha cp pero k infinito por As=0) debe leer 0, no NaN.
    const deltaDif = deltaCp_mm === 0 ? 0 : deltaCp_mm * fis.k;
    const admDif = (L_m * 1000) / deflLimit;
    rows.push({
      id: 'deflection-cracked',
      name: 'Flecha diferida (ELS-cp, sección fisurada)',
      val: `δ = ${deltaDif.toFixed(1)} mm (k = ${Number.isFinite(fis.k) ? fis.k.toFixed(2) : '∞'}, ζ = ${fis.zeta.toFixed(2)}) / L/${deflLimit} = ${admDif.toFixed(1)} mm`,
      eta: admDif > 0 ? deltaDif / admDif : 0,
      ref: 'CE Anejo 19 §7.4.3 · CTE DB-SE 4.3.3',
      combo: cpLabel,
    });
  }

  // ── Ficha: valores de sección por región (del cálculo principal) ──────────
  const detailGroups: DetailGroup2D[] = [];
  if (main.valid) {
    for (const [res, title] of [
      [main.vano, 'Sección de vano (M+, tracción abajo)'],
      [main.apoyo, 'Sección de apoyo (M−, tracción arriba)'],
    ] as const) {
      if (!res.valid) continue;
      detailGroups.push({
        title,
        rows: [
          { label: 'Armado', value: res.rebarSchedule },
          { label: 'Canto útil d', value: `${res.d.toFixed(0)} mm` },
          { label: 'Fibra neutra x', value: `${res.x.toFixed(0)} mm` },
          { label: 'MRd', value: `${res.MRd.toFixed(1)} kN·m` },
          { label: 'VRd,c / VRd,s / VRd,max', value: `${res.VRdc.toFixed(1)} / ${res.VRds.toFixed(1)} / ${res.VRdmax.toFixed(1)} kN` },
          { label: 'Abertura de fisura wk / wk,max', value: `${res.wk.toFixed(2)} / ${res.wkMax.toFixed(2)} mm` },
        ],
      });
    }
  }

  return { rows, incomplete, detailGroups };
}

/** pilar HA: calcRCColumn per ELU combination (M+N interaction is NOT
 *  separable per mechanism — same-combo pairing like the steel pilar path).
 *  Compression combos (Nd ≥ 1 kN) route to calcRCColumn (flexocompresión +
 *  detailing). Net-tension combos (Nd < 1) skip it WITHOUT forcing 'pending'
 *  (the engine only rejects them for the Nd ≥ 1 guard, not because the member
 *  is unchecked): the tension side is covered by a conservative N+M tie check
 *  (both main faces, concrete cracked → ignored) that fires whenever a combo
 *  carries real tension, so a column that is a pure tie in every combo still
 *  gets an honest verdict (tension + shear) instead of a grey 'pending'. */
function rcColumnChecks(
  m: Fem2DMember,
  L: number,
  eluCombos: LcFactors[],
  els: Solver2DElementResult[],
): RoutedChecks {
  const sec = m.rcSection!;
  const cage = m.columnCage;
  if (!cage) {
    return {
      incomplete: true,
      rows: [{ id: 'pending-armado', name: 'Armado del pilar HA', val: 'sin definir — edítalo en el inspector', eta: 0, ref: '' }],
    };
  }

  const agg = new Map<string, MemberCheck>();
  let incomplete = false;
  // Ficha: worst valid engine run (by its own worst row η) + worst shear run.
  let engBest: { res: ReturnType<typeof calcRCColumn>; Nd: number; label: string; key: number } | null = null;
  let shBest: { sh: ReturnType<typeof calcRcShear>; VRdPilar: number; VEd: number; label: string } | null = null;

  // Geometría constante entre combos: flexión MEdy ⇒ canto h, cara traccionada
  // = 2 esquinas + intermedias X (orientación espejo de buildSectionModel del
  // motor de pilares), 2 ramas del cerco perimetral. dPrime = recubrimiento
  // mecánico a la esquina; zTens = brazo entre las dos caras principales.
  const b_mm = sec.b * 10;
  const h_mm = sec.h * 10;
  const dPrime = sec.cover + cage.stirrupDiam + cage.cornerBarDiam / 2;
  const dShear = h_mm - dPrime;
  const zTens = h_mm - 2 * dPrime;
  const AsTensFace = 2 * getBarArea(cage.cornerBarDiam) + cage.nBarsX * getBarArea(cage.barDiamX);
  const AswShear = cage.stirrupSpacing > 0 ? (2 * getBarArea(cage.stirrupDiam)) / cage.stirrupSpacing : 0;
  const fyd = sec.fyk / RC_GAMMA_S;
  const matShear = getConcrete(sec.fck);

  for (const factors of eluCombos) {
    const ext = comboExtremes(els, factors);
    const comboLabel = formatCombo(factors);

    // ── Cortante con axil (ANTES del branch de validez del motor: se
    // comprueba aunque calcRCColumn rechace el combo). σcp con SIGNO desde la
    // MÍNIMA compresión concurrente del combo (Nmax = N más traccional): la
    // tracción REDUCE VRd,c (EC2 §6.2.2(1)); cap +0.2·fcd dentro de
    // calcRcShear. Política de PILAR: VRd = max(VRdc, min(VRds, VRdmax)) —
    // §6.2.1(4): con VEd ≤ VRd,c no se exige armadura de cortante calculada.
    if (ext.V_Ed > 1e-6) {
      const sigmaCp = (-ext.Nmax * 1000) / (b_mm * h_mm);
      const sh = calcRcShear({
        b: b_mm, d: dShear, fck: sec.fck, fcd: matShear.fcd, fyd,
        As: AsTensFace, Asw: AswShear, hasStirrups: AswShear > 0, sigmaCp,
      });
      const VRdPilar = Math.max(sh.VRdc, Math.min(sh.VRds, sh.VRdmax));
      const shEta = VRdPilar > 0 ? ext.V_Ed / VRdPilar : Infinity;
      if (!shBest || shEta > (shBest.VRdPilar > 0 ? shBest.VEd / shBest.VRdPilar : Infinity)) {
        shBest = { sh, VRdPilar, VEd: ext.V_Ed, label: comboLabel };
      }
      mergeWorst(agg, [{
        id: 'shear',
        name: 'Cortante VEd ≤ VRd',
        val: `${ext.V_Ed.toFixed(1)} / ${VRdPilar.toFixed(1)} kN (σcp = ${sh.sigmaCpEff.toFixed(2)} MPa)`,
        eta: shEta,
        ref: 'CE Anejo 19 §6.2',
        combo: comboLabel,
      }, {
        id: 'shear-max',
        name: 'Aplastamiento biela VEd ≤ VRd,max',
        val: `${ext.V_Ed.toFixed(1)} / ${sh.VRdmax.toFixed(1)} kN (αcw = ${sh.alphaCw.toFixed(2)})`,
        eta: sh.VRdmax > 0 ? ext.V_Ed / sh.VRdmax : Infinity,
        ref: 'CE Anejo 19 §6.2.3(3)',
        combo: comboLabel,
      }]);
    }

    // ── Flexocompresión (solo combos con compresión ≥ 1 kN) ──────────────
    // Nd < 1 (tracción neta o axil de compresión despreciable): el motor de
    // pilares rechaza el combo por su guarda Nd ≥ 1, PERO eso no significa que
    // el miembro esté sin comprobar — la tracción con M la cubre el bloque de
    // abajo. Saltamos SIN marcar 'incomplete' (F1: pending solo cuando algo no
    // se pudo comprobar de verdad). El detailing de columna comprimida
    // (armaduras mín/máx, cercos) sale de CUALQUIER combo de compresión: es
    // combo-independiente. Un pilar en tracción en TODOS los combos es un
    // tirante y no lleva ese detailing de compresión.
    const Nd = Math.max(0, -ext.Nmin);
    if (Nd >= 1) {
      const inputs: RCColumnInputs = {
        title: '',
        b: sec.b * 10,   // cm → mm
        h: sec.h * 10,
        cover: sec.cover,
        cornerBarDiam: cage.cornerBarDiam,
        nBarsX: cage.nBarsX,
        barDiamX: cage.barDiamX,
        nBarsY: cage.nBarsY,
        barDiamY: cage.barDiamY,
        stirrupDiam: cage.stirrupDiam,
        stirrupSpacing: cage.stirrupSpacing,
        fck: sec.fck,
        fyk: sec.fyk,
        Nd,
        // Flexión EN el plano del pórtico → eje fuerte (canto h). β = 1 ambos
        // ejes: longitud de pandeo NO traslacional emparejada con los momentos
        // amplificados por αcr (mismo criterio que el pilar de acero).
        MEdy: ext.M_Ed,
        MEdz: 0,
        L,
        beta: 1,
        phiEf: RC_PHI_EF,
        sectionType: 'rectangular',
      };
      const result = calcRCColumn(inputs);
      if (!result.valid) {
        // F1: refused engine run (por un motivo REAL, ya no la tracción) →
        // member must read 'pending'.
        incomplete = true;
        mergeWorst(agg, [{ id: 'engine-invalid', name: 'Comprobación de pilar HA', val: result.error ?? 'no válida', eta: 0, ref: '' }]);
      } else {
        const mapped = mapRcChecks(result.checks, '', '').map((c) =>
          c.eta > 0 && !RC_COL_COMBO_INDEPENDENT.has(c.id) ? { ...c, combo: comboLabel } : c,
        );
        // Governing run for the ficha: the combo whose own worst row η wins.
        const key = mapped.reduce((mx, c) => Math.max(mx, Number.isFinite(c.eta) ? c.eta : 1e9), 0);
        if (!engBest || key > engBest.key) engBest = { res: result, Nd, label: comboLabel, key };
        mergeWorst(agg, mapped);
      }
    }

    // ── Flexotracción N+M (combos con tracción real) ─────────────────────
    // Modelo conservador para axil de tracción: hormigón fisurado IGNORADO,
    // acoplo de las dos caras principales de armadura (§6.1). Con la sección
    // simétrica, T_cara,máx = N/2 + M/z ≤ As_cara·fyd (z = brazo entre caras);
    // ignora las barras laterales (más conservador) y no exige interacción con
    // el hormigón. Emparejamiento conservador: N_máx tracción × M_máx del
    // combo (pueden no ser la misma sección). Sustituye a la vieja fila de
    // solo-tracción As_tot·fyd, que ignoraba el M concomitante (verde falso
    // con levantamiento + flexión).
    if (ext.Nmax > 1e-6) {
      const Tface = ext.Nmax / 2 + (zTens > 0 ? (ext.M_Ed * 1000) / zTens : Infinity); // kN
      const capFace = (AsTensFace * fyd) / 1000; // kN (una cara principal)
      mergeWorst(agg, [{
        id: 'tension-bending',
        name: 'Flexotracción N+M (cara más traccionada, solo armadura)',
        val: `T = ${Tface.toFixed(1)} / ${capFace.toFixed(0)} kN (N = ${ext.Nmax.toFixed(1)} kN, M = ${ext.M_Ed.toFixed(1)} kN·m)`,
        eta: capFace > 0 ? Tface / capFace : Infinity,
        ref: 'CE Anejo 19 §6.1',
        combo: comboLabel,
      }]);
    }
  }

  // ── Ficha: intermedios del combo pésimo (flexocompresión + cortante) ──────
  const detailGroups: DetailGroup2D[] = [];
  if (engBest) {
    const e = engBest.res;
    detailGroups.push({
      title: `Flexocompresión — combo pésimo: ${engBest.label}`,
      rows: [
        { label: 'Armado', value: e.rebarSchedule },
        { label: 'NEd (compresión del combo)', value: `${engBest.Nd.toFixed(1)} kN` },
        { label: 'Esbeltez λ (plano del pórtico, β = 1)', value: e.lambda_y.toFixed(1) },
        { label: 'Excentricidades e1 + e_imp + e2', value: `${e.e1_y.toFixed(1)} + ${e.e_imp_y.toFixed(1)} + ${e.e2_y.toFixed(1)} = ${e.e_tot_y.toFixed(1)} mm` },
        { label: 'MEd,tot (1º + 2º orden)', value: `${e.MEd_tot_y.toFixed(1)} kN·m` },
        { label: 'MRd(NEd)', value: `${e.MRdy.toFixed(1)} kN·m` },
        { label: 'NRd,max (compresión pura)', value: `${e.NRd_max.toFixed(0)} kN` },
      ],
    });
  }
  if (shBest) {
    detailGroups.push({
      title: `Cortante — combo pésimo: ${shBest.label}`,
      rows: [
        { label: 'VRd,c / VRd,s / VRd,max', value: `${shBest.sh.VRdc.toFixed(1)} / ${shBest.sh.VRds.toFixed(1)} / ${shBest.sh.VRdmax.toFixed(1)} kN` },
        { label: 'VRd de pilar = max(VRd,c, min(VRd,s, VRd,max))', value: `${shBest.VRdPilar.toFixed(1)} kN` },
        { label: 'σcp concomitante (con signo, cap +0.2·fcd)', value: `${shBest.sh.sigmaCpEff.toFixed(2)} MPa` },
        { label: 'αcw / k / ρl', value: `${shBest.sh.alphaCw.toFixed(2)} / ${shBest.sh.k.toFixed(2)} / ${shBest.sh.rhoL.toFixed(4)}` },
      ],
    });
  }

  return { rows: Array.from(agg.values()), incomplete, detailGroups };
}

// ── T7: sway sensitivity (αcr) ──────────────────────────────────────────────

interface SwayResult {
  alphaCr: number | null;
  amplified: boolean;
  /** Alguna combinación con E dio αcr < 5 → EN 1998-1 §4.4.2.2 (θ > 0,2)
   *  exige análisis de 2º orden real: fila roja aunque worstAlpha ≥ 3. */
  seismicSecondOrder: boolean;
  /** ELU factor sets with lateral cases amplified where αcr < 10.
   *  SIEMPRE alineado 1:1 con `eluCombos` — las vistas por principal dependen
   *  de ese emparejamiento. SIN claves nocionales. */
  factorsPerCombo: LcFactors[];
  /** Sets para las COMPROBACIONES de barra y la envolvente `env:ELU`: los de
   *  `factorsPerCombo`, y donde aplica la imperfección §5.3.2 el combo se
   *  desdobla en dos variantes ±Hφ (el desplome puede caer hacia cualquier
   *  lado y el lado pésimo es POR BARRA — un signo global infracomprobaría la
   *  barra cuyo momento gravitatorio va al revés). NO alineado con eluCombos. */
  checkFactorSets: CheckFactors[];
  /** Algún combo lleva cargas nocionales Hφ (y, con αcr < 10, amplificadas). */
  notionalApplied: boolean;
  /** Algún combo sensible al desplome quedó exento por H_Ed ≥ 0,15·V_Ed. */
  notionalExempt: boolean;
}

/**
 * Nudos agrupados por cota para la detección de plantas de αcr — TODOS los
 * nudos, sin ningún filtro geométrico ni de etiqueta (D12, spike 2026-07-29):
 * el sistema se autorregula. Una celosía triangulada apenas cede ante la sonda
 * lateral (Pratt de plantilla: αcr ≈ 5813 ≫ 10, sin amplificar) y un pórtico
 * con pilares inclinados conserva sus plantas — el filtro histórico por
 * `role === 'pilar'` las perdía y la comprobación de estabilidad global
 * desaparecía en silencio (αcr medido 6.89 con amplificación k = 1.17 que no
 * se aplicaba). El rol murió en la Fase 2; el modo comparativo del spike, con él.
 * Exportada para los tests de niveles.
 */
export function swayStoreyNodes(model: Fem2DModel): Map<number, Set<string>> {
  const nodeY = new Map(model.nodes.map((n) => [n.id, n.y]));
  const byY = new Map<number, Set<string>>();
  const add = (id: string): void => {
    const y = nodeY.get(id);
    if (y === undefined) return;
    const key = [...byY.keys()].find((k) => Math.abs(k - y) < 1e-6) ?? y;
    const set = byY.get(key) ?? new Set<string>();
    set.add(id);
    byY.set(key, set);
  };
  for (const n of model.nodes) add(n.id);
  return byY;
}

function computeSwaySensitivity(
  model: Fem2DModel,
  analysis: Analysis2DModel,
  eluCombos: LcFactors[],
  errors: ModelError[],
  elements: Solver2DElementResult[],
): SwayResult {
  const passthrough: SwayResult = {
    alphaCr: null, amplified: false, seismicSecondOrder: false,
    factorsPerCombo: eluCombos, checkFactorSets: eluCombos,
    notionalApplied: false, notionalExempt: false,
  };

  const pilarNodeIdsByY = swayStoreyNodes(model);
  const levels = [...pilarNodeIdsByY.keys()].sort((a, b) => a - b);
  if (levels.length < 2) return passthrough; // no sway storeys (e.g. truss)

  // Vertical/horizontal load attributed by height, per LC (downward positive).
  const analysisNodeY = new Map(analysis.nodes.map((n) => [n.id, n.y]));
  const elementMeta = analysis.elements.map((el) => {
    const yi = analysisNodeY.get(el.i) ?? 0;
    const yj = analysisNodeY.get(el.j) ?? 0;
    const xi = analysis.nodes.find((n) => n.id === el.i)!;
    const xj = analysis.nodes.find((n) => n.id === el.j)!;
    const L = Math.hypot(xj.x - xi.x, xj.y - xi.y);
    const c = L > 0 ? (xj.x - xi.x) / L : 1;
    const s = L > 0 ? (xj.y - xi.y) / L : 0;
    return { midY: (yi + yj) / 2, L, c, s };
  });
  const verticalAbove = (lcCase: Analysis2DLoadCase, y: number): number => {
    let Fy = 0;
    for (const nl of lcCase.nodeLoads) {
      if ((analysisNodeY.get(nl.node) ?? -Infinity) >= y - 1e-6) Fy += nl.Fy;
    }
    for (let i = 0; i < analysis.elements.length; i++) {
      const q = lcCase.q[i];
      if (!q || (q.qx === 0 && q.qy === 0)) continue;
      const meta = elementMeta[i];
      if (meta.midY >= y - 1e-6) Fy += (meta.s * q.qx + meta.c * q.qy) * meta.L;
    }
    return Math.max(0, -Fy); // net downward
  };
  /** Empuje horizontal NETO (con signo) por encima de la cota — para la
   *  exención §5.3.2(4)B, misma atribución por altura que `verticalAbove`. */
  const horizontalAbove = (lcCase: Analysis2DLoadCase, y: number): number => {
    let Fx = 0;
    for (const nl of lcCase.nodeLoads) {
      if ((analysisNodeY.get(nl.node) ?? -Infinity) >= y - 1e-6) Fx += nl.Fx;
    }
    for (let i = 0; i < analysis.elements.length; i++) {
      const q = lcCase.q[i];
      if (!q || (q.qx === 0 && q.qy === 0)) continue;
      const meta = elementMeta[i];
      if (meta.midY >= y - 1e-6) Fx += (meta.c * q.qx - meta.s * q.qy) * meta.L;
    }
    return Fx;
  };

  // ── Cargas nocionales §5.3.2 (auditoría H2): H = φ·V por planta ──────────
  // Un caso sintético POR HIPÓTESIS GRAVITATORIA, con φ ya plegado: por
  // linealidad, sumarlos con los γ del combo reproduce EXACTAMENTE
  // H_combo = φ·V_combo por planta. En cada nivel entra la fuerza que ese
  // nivel INTRODUCE (ΔV = V_sobre(nivel) − V_sobre(nivel_superior)),
  // repartida entre sus nudos — el cortante nocional de cada planta queda
  // en φ·V_sobre(planta), espejo de la fórmula de αcr.
  const hTotal = levels[levels.length - 1] - levels[0];
  const alphaH = Math.min(1, Math.max(NOTIONAL_ALPHA_H_MIN, 2 / Math.sqrt(hTotal)));
  const phi = NOTIONAL_PHI_0 * alphaH;
  const notionalKeys: { nlc: NotionalLc; parent: LoadCase }[] = [];
  const notionalCases: Analysis2DLoadCase[] = [];
  for (const lcCase of analysis.loadCases) {
    const nodeLoads: Analysis2DNodeLoad[] = [];
    for (let k = 1; k < levels.length; k++) {
      const deltaV = verticalAbove(lcCase, levels[k])
        - (k + 1 < levels.length ? verticalAbove(lcCase, levels[k + 1]) : 0);
      const H = phi * deltaV;
      if (Math.abs(H) < NOTIONAL_MIN_H_KN) continue;
      const ids = [...pilarNodeIdsByY.get(levels[k])!];
      for (const id of ids) nodeLoads.push({ node: id, Fx: H / ids.length, Fy: 0 });
    }
    if (nodeLoads.length === 0) continue;
    const nlc: NotionalLc = `N${lcCase.lc}`;
    notionalKeys.push({ nlc, parent: lcCase.lc });
    notionalCases.push({
      // El solver almacena por clave string; 'N<lc>' jamás entra en
      // model.loads ni en las vistas — el cast queda confinado aquí.
      lc: nlc as LoadCase,
      q: analysis.elements.map(() => ({ qx: 0, qy: 0 })),
      nodeLoads,
    });
  }

  // Unit probe: 1 kN split among the top-level pilar nodes → storey lateral
  // stiffness S_i = shear/drift. With a single top load every storey carries
  // shear 1, so S_i = 1/δ_i directly. Los casos nocionales viajan en la MISMA
  // resolución (una retro-sustitución extra por caso, la factorización se
  // comparte).
  const topNodes = [...pilarNodeIdsByY.get(levels[levels.length - 1])!];
  const probe: Analysis2DLoadCase = {
    lc: 'W',
    q: analysis.elements.map(() => ({ qx: 0, qy: 0 })),
    nodeLoads: topNodes.map((node) => ({ node, Fx: 1 / topNodes.length, Fy: 0 })),
  };
  const probeRun = solveAnalysis2D({ ...analysis, loadCases: [probe, ...notionalCases] });
  if (probeRun.errors.some((e) => e.severity === 'fail')) {
    errors.push({ severity: 'warn', code: 'ALPHA_CR_PROBE_FAILED', msg: 'No se pudo estimar αcr (sonda lateral fallida).' });
    return passthrough;
  }
  const probeDisp = probeRun.displacementsByLc.W;
  const meanUx = (y: number): number => {
    const ids = [...pilarNodeIdsByY.get(y)!];
    return ids.reduce((s, id) => s + (probeDisp[id]?.ux ?? 0), 0) / ids.length;
  };

  // Muestras nocionales → elementos del bundle PRINCIPAL, bajo sus claves
  // 'N<lc>'. Mutación ADITIVA sobre un bundle recién resuelto (una vez por
  // pipeline): las claves nuevas no colisionan con ninguna hipótesis y solo
  // las lee quien itera SAMPLE_LC_ORDER con factores nocionales presentes.
  for (const { nlc } of notionalKeys) {
    for (let i = 0; i < elements.length && i < probeRun.elements.length; i++) {
      const src = probeRun.elements[i].samples;
      const dst = elements[i].samples;
      dst.N[nlc] = src.N[nlc];
      dst.V[nlc] = src.V[nlc];
      dst.M[nlc] = src.M[nlc];
      dst.w[nlc] = src.w[nlc];
      dst.u[nlc] = src.u[nlc];
    }
  }

  // Per-storey stiffness + per-LC vertical/horizontal totals above the top.
  const storeys = levels.slice(1).map((yHi, k) => {
    const yLo = levels[k];
    const drift = Math.abs(meanUx(yHi) - meanUx(yLo));
    const S = drift > 1e-15 ? 1 / drift : Infinity;
    const Vlc: Partial<Record<LoadCase, number>> = {};
    const Hlc: Partial<Record<LoadCase, number>> = {};
    for (const lcCase of analysis.loadCases) {
      Vlc[lcCase.lc] = verticalAbove(lcCase, yHi);
      Hlc[lcCase.lc] = horizontalAbove(lcCase, yHi);
    }
    return { h: yHi - yLo, S, Vlc, Hlc };
  });

  /** Exención §5.3.2(4)B del combo: H_Ed ≥ 0,15·V_Ed en TODAS las plantas con
   *  carga vertical (basta una planta dominada por gravedad para deber Hφ). */
  const notionalExemptFor = (factors: LcFactors): boolean => {
    for (const st of storeys) {
      let V = 0;
      let H = 0;
      for (const [lc, f] of Object.entries(factors)) {
        V += (f ?? 0) * (st.Vlc[lc as LoadCase] ?? 0);
        H += (f ?? 0) * (st.Hlc[lc as LoadCase] ?? 0);
      }
      if (V > 1e-9 && Math.abs(H) < NOTIONAL_EXEMPT_RATIO * V) return false;
    }
    return true;
  };

  let worstAlpha = Infinity;
  let amplified = false;
  let seismicSecondOrder = false;
  let notionalApplied = false;
  let notionalExempt = false;
  const checkFactorSets: CheckFactors[] = [];
  const factorsPerCombo = eluCombos.map((factors) => {
    let alphaCombo = Infinity;
    for (const st of storeys) {
      let V = 0;
      for (const [lc, f] of Object.entries(factors)) V += (f ?? 0) * (st.Vlc[lc as LoadCase] ?? 0);
      if (V <= 0 || st.S === Infinity) continue;
      const a = (st.S * st.h) / V;
      if (a < alphaCombo) alphaCombo = a;
    }
    if (alphaCombo < worstAlpha) worstAlpha = alphaCombo;
    // Umbral sísmico: con E en la combinación, θ = 1/αcr > 0,2 saca del rango
    // al método simplificado (EN 1998-1 §4.4.2.2). La amplificación de abajo
    // se mantiene como cinturón-y-tirantes, igual que en el caso αcr < 3.
    if ((factors.E ?? 0) !== 0 && alphaCombo < ALPHA_CR_MIN_SIMPLIFIED_SEISMIC) seismicSecondOrder = true;
    if (alphaCombo >= ALPHA_CR_FIRST_ORDER) {
      // Insensible al desplome (§5.2.2(3)): ni amplificación ni imperfección
      // global — §5.3.2(1) solo la exige a pórticos sensibles al pandeo con
      // desplome, y así los pórticos rígidos conservan sus números exactos.
      checkFactorSets.push(factors);
      return factors;
    }
    // Amplified-sway-moment method: scale the lateral case factors.
    const k = 1 / (1 - 1 / Math.max(alphaCombo, ALPHA_CR_MIN_SIMPLIFIED));
    const next: LcFactors = { ...factors };
    let touched = false;
    for (const lc of LATERAL_LCS) {
      if (next[lc]) {
        next[lc] = next[lc]! * k;
        touched = true;
      }
    }
    if (touched) amplified = true;
    const amp = touched ? next : factors;
    // Imperfección global del combo: ±k·γ·Hφ, salvo exención. El nocional es
    // carga de desplome y se amplifica con el MISMO k que W/E (con αcr < 3 la
    // fila ya es roja y k queda capado en el de αcr = 3, cinturón-y-tirantes).
    const keys = notionalKeys.filter(({ parent }) => factors[parent]);
    if (keys.length === 0) {
      checkFactorSets.push(amp);
    } else if (notionalExemptFor(factors)) {
      notionalExempt = true;
      checkFactorSets.push(amp);
    } else {
      notionalApplied = true;
      const plus: CheckFactors = { ...amp };
      const minus: CheckFactors = { ...amp };
      for (const { nlc, parent } of keys) {
        plus[nlc] = k * factors[parent]!;
        minus[nlc] = -k * factors[parent]!;
      }
      checkFactorSets.push(plus, minus);
    }
    return amp;
  });

  return {
    alphaCr: worstAlpha,
    amplified,
    seismicSecondOrder,
    factorsPerCombo,
    checkFactorSets,
    notionalApplied,
    notionalExempt,
  };
}

/**
 * §5.2.1(4)B NOTA 2B — la fórmula de planta solo es fiable si la compresión
 * axil en vigas/dinteles NO es significativa. La frontera de la norma,
 * λ̄ ≥ 0,3·√(A·fy/N_Ed), reordenada con λ̄² = A·fy/N_cr queda en
 *
 *     N_Ed ≥ 0,09·N_cr      N_cr = π²·EI/L² (biarticulada, longitud de
 *                           sistema, eje del plano del pórtico)
 *
 * — forma sin fy que vale igual para acero, HA y madera porque usa el MISMO
 * EI del análisis. Por encima del umbral la fórmula SOBREESTIMA αcr (lado
 * inseguro), así que la fila se degrada a ámbar en vez de fiarse del verde.
 *
 * Solo barras más horizontales que verticales (|Δy| ≤ |Δx|): la compresión de
 * un pilar — aunque esté inclinado — es el caso que la fórmula sí contempla.
 * Las bielas se saltan (sin EI no hay rigidez de pórtico que la planta pierda;
 * su pandeo ya lo cubre su propia fila axil). Los cordones de una celosía,
 * troceados por los nudos de panel, tienen L de sistema corta → N_cr enorme →
 * no disparan: la guarda no reintroduce ruido en el caso que D12 liberó.
 *
 * @returns id de la primera barra que dispara, o null.
 */
function significantBeamCompression(
  model: Fem2DModel,
  analysis: Analysis2DModel,
  elementsByMember: Map<string, Solver2DElementResult[]>,
  eluCombos: LcFactors[],
): string | null {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  // EI de análisis por barra (los elementos de una barra troceada lo comparten).
  const eiByMember = new Map<string, number>();
  for (const el of analysis.elements) {
    if (el.elementType === 'beam-column') eiByMember.set(el.designMemberId, el.EI);
  }
  for (const m of model.members) {
    const a = nodeById.get(m.i);
    const b = nodeById.get(m.j);
    const EI = eiByMember.get(m.id);
    if (!a || !b || EI === undefined || EI <= 0) continue;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dy > dx) continue; // más pilar que dintel
    const L = Math.hypot(dx, dy);
    if (L <= 0) continue;
    const Ncr = (Math.PI * Math.PI * EI) / (L * L); // kN
    const els = elementsByMember.get(m.id);
    if (!els || els.length === 0) continue;
    for (const factors of eluCombos) {
      if (-comboExtremes(els, factors).Nmin >= NOTA_2B_NCR_FRACTION * Ncr) return m.id;
    }
  }
  return null;
}
