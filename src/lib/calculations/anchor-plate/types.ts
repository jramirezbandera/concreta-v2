// Kernel types for the anchor-plate module (introduced in PR0 of the
// audit-driven refactor — supersedes the flat `AnchorPlateInputs` interface
// for downstream calculation code).
//
// Goals:
//   1. Directional edge distances (cX1, cX2, cY1, cY2) — needed for the
//      concrete shear modes (PR8a/PR8b) and corner cone projection.
//   2. Decomposed shear (Vx, Vy) — needed for direction-aware checks.
//   3. Solver residuals (ΣN, ΣMx, ΣMy) — needed for property tests in PR7a/b
//      to verify equilibrium is actually satisfied, not just locally close.
//   4. Pedestal height (h) — needed for splitting ψh,sp per CE Anejo 11 §7.2.1.6.
//
// The legacy `AnchorPlateInputs` (src/data/defaults.ts) is kept as the UI-facing
// input shape. `adapter.toKernel(inputs)` projects it onto these kernel types.
// The opposite direction (kernel → UI) is not needed.

import type { RebarDiam, RebarGrade, BottomAnchorage, TopConnection } from "../../../data/anchorBars";

// ─── Plate ─────────────────────────────────────────────────────────────────

export type PlateSteelGrade = "S235" | "S275" | "S355";

export interface Plate {
  /** mm — dimensión paralela al eje fuerte del perfil. */
  a: number;
  /** mm — dimensión paralela al eje débil. */
  b: number;
  /** mm — espesor. */
  t: number;
  steel: PlateSteelGrade;
}

// ─── Pedestal ──────────────────────────────────────────────────────────────

export type PedestalSurface = "smooth" | "roughened";

export interface Pedestal {
  /** MPa — resistencia característica del hormigón. */
  fck: number;
  /** mm — canto del macizo (necesario para splitting ψh,sp). */
  h: number;
  /** Directional distance from the worst anchor (or plate edge) to the
   *  pedestal edge in +x direction. mm. */
  cX1: number;
  /** Same as cX1 but to the −x edge. */
  cX2: number;
  /** +y edge distance. */
  cY1: number;
  /** −y edge distance. */
  cY2: number;
  /** mm — margen entre placa y borde del pedestal en x (para α extension). */
  marginX: number;
  /** mm — idem en y. */
  marginY: number;
  surface: PedestalSurface;
}

// ─── Steel profile ─────────────────────────────────────────────────────────

export type AnchorPlateProfileType = "IPE" | "HEA" | "HEB" | "IPN";

export interface ProfileRef {
  type: AnchorPlateProfileType;
  size: number;
}

// ─── Bar layout ────────────────────────────────────────────────────────────

export type BarLayoutCount = 4 | 6 | 8 | 9;

export interface BarLayoutSpec {
  count: BarLayoutCount;
  diameter: RebarDiam;
  grade: RebarGrade;
  /** mm — separación nominal eje fuerte (input UI). El solver puede usar
   *  coordenadas reales de `generateLayout` en su lugar — ver H14. */
  spacingX: number;
  spacingY: number;
  /** mm — distancia barra → borde de placa. */
  edgeX: number;
  edgeY: number;
  /** mm — profundidad útil de anclaje. */
  hef: number;
  bottomAnchorage: BottomAnchorage;
  topConnection: TopConnection;
  /** mm — diámetro exterior de arandela (sólo para `bottom_anchorage === 'arandela_tuerca'`). */
  washerOd: number;
}

// ─── Stiffeners ────────────────────────────────────────────────────────────

export interface Stiffener {
  /** 0 (sin), 2 (paralelos al eje fuerte), 4 (en ambos ejes). */
  count: 0 | 2 | 4;
  /** mm — altura. */
  h: number;
  /** mm — espesor. */
  t: number;
  /** mm — garganta de soldadura. */
  weldThroat: number;
}

// ─── Composed geometry ─────────────────────────────────────────────────────

export interface AnchorGeometry {
  plate: Plate;
  pedestal: Pedestal;
  profile: ProfileRef;
  bars: BarLayoutSpec;
  stiffener: Stiffener;
}

// ─── Loads ─────────────────────────────────────────────────────────────────

export interface AnchorLoad {
  /** kN — axil ELU (positivo = compresión). */
  NEd: number;
  /** kN — axil cuasi-permanente para fricción µ·Nc,G. */
  NEd_G: number;
  /** kNm — momento eje fuerte. */
  Mx: number;
  /** kNm — momento eje débil. */
  My: number;
  /** kN — cortante en dirección +x del plano de la placa. */
  Vx: number;
  /** kN — cortante en dirección +y. */
  Vy: number;
}

// ─── Individual anchor (post-solver) ───────────────────────────────────────

export interface Anchor {
  /** 0..n-1 — orden de generación. */
  id: number;
  /** mm — coordenada en el eje fuerte (origen = centroide de placa). */
  x: number;
  /** mm — coordenada en el eje débil. */
  y: number;
  /** kN — fuerza de tracción (0 si comprimida). */
  Ft: number;
  inTension: boolean;
}

// ─── Solver result ─────────────────────────────────────────────────────────

export type SolverMode =
  | "uniform-compression"
  | "partial-lift"
  | "partial-lift-saturated"
  | "biaxial-plastic"
  | "biaxial-grid"
  | "pure-tension"
  | "axis-aligned-4";

/** Residuos del equilibrio plástico — usados por property tests (PR7a/b) para
 *  asegurar que el solver realmente satisface ΣN = ΣMx = ΣMy = 0. */
export interface EquilibriumResiduals {
  /** kN — ΣF axil residual. Convergencia exige |SN_kN| < tol. */
  SN_kN: number;
  /** kNm — ΣMx residual. */
  SMx_kNm: number;
  /** kNm — ΣMy residual. */
  SMy_kNm: number;
}

export interface PolygonPoint {
  x: number;
  y: number;
}

export interface KernelSolverResult {
  anchors: Anchor[];
  /** kN — reacción de compresión total bajo placa. */
  Nc: number;
  /** kN — suma de tracciones en barras tensas. */
  Ft_total: number;
  /** Número de barras traccionadas. */
  nTension: number;
  /** mm — brazo de palanca (axis-aligned). 0 para biaxial. */
  xC: number;
  /** Hay alguna barra en tracción? */
  lifted: boolean;
  mode: SolverMode;
  converged: boolean;
  note: string;
  /** rad — ángulo del eje neutro (sólo biaxial). */
  phi_NA?: number;
  /** mm — offset normal del eje neutro desde el centroide. */
  d_NA?: number;
  /** Polígono de compresión (coords placa-local, mm). */
  block?: PolygonPoint[];
  /** Residuos de equilibrio (siempre presentes, 0 para casos exactos). */
  residuals: EquilibriumResiduals;
}

// ─── Check severity (extends CheckStatus) ──────────────────────────────────
//
// The shared `CheckStatus` (in ../types.ts) defines: ok | warn | fail | neutral.
// For PR7b (biaxial APROX) we need to mark "no-go because solver couldn't
// guarantee equilibrium". We model that within the existing taxonomy as
// `fail` + an explicit note, rather than adding a 5th union member that
// every other module would have to handle. If a 5th severity is ever needed
// globally, it should be a separate decision.

// ─── Re-export from shared ─────────────────────────────────────────────────

export type { CheckRow, CheckStatus } from "../types";
