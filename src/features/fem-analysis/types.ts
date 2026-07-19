// FEM 1D — types
//
// Two-model split (per /plan-eng-review + /plan-design-review decisions):
//
//   DesignModel   = what the user SEES and EDITS in the canvas.
//                   Bars are at user granularity (one per vano typically).
//                   Each design bar carries its own section/profile and armado.
//
//   AnalysisModel = what the SOLVER consumes.
//                   autoDecompose() splits design bars at supports, internal
//                   hinges, partial UDL boundaries, point loads, and any
//                   user-inserted mid-bar nodes. Each analysis element carries
//                   constant q (or zero) and only nodal point loads — the
//                   precondition for a clean Euler-Bernoulli element.
//
// Adapters then roll the AnalysisModel envelope back up to the DesignModel
// granularity so that calcRCBeam / calcSteelBeam see one set of vano/apoyo
// inputs per user-facing bar.

// ── Shared primitives ───────────────────────────────────────────────────────
//
// LoadCase / UseCategoryCode / ModelError / RcSection moved to the shared
// frame-core (Lane B extraction, eng-review D12) and are re-exported here so
// every existing 1D import keeps working unchanged.

import type { ArmadoHA, LoadCase, ModelError, RcSection, UseCategoryCode } from '../../lib/frame-core/types';

export type { ArmadoHA, LoadCase, ModelError, RcSection, UseCategoryCode };

export type SupportType = 'pinned' | 'fixed' | 'roller' | 'spring';
export type LoadKind = 'point-node' | 'udl' | 'point-bar';
export type BarRole = 'viga' | 'pilar';
export type MaterialFamily = 'steel' | 'rc';
export type ComboCode = 'ELU' | 'ELS-c' | 'ELS-f';

export interface Node {
  id: string;
  x: number; // m
  y: number; // m  (V1: forced to 0; collinear strip layout)
}

export interface Support {
  node: string;
  type: SupportType;
}

// ── Loads ───────────────────────────────────────────────────────────────────

export interface PointNodeLoad {
  id: string;
  kind: 'point-node';
  lc: LoadCase;
  /** CTE Tabla 3.1 category — only meaningful when lc === 'Q'. Default 'B'. */
  useCategory?: UseCategoryCode;
  node: string;
  Px?: number;
  Py?: number;
}

export interface UdlLoad {
  id: string;
  kind: 'udl';
  lc: LoadCase;
  /** CTE Tabla 3.1 category — only meaningful when lc === 'Q'. Default 'B'. */
  useCategory?: UseCategoryCode;
  bar: string;
  w: number;            // kN/m (always positive — `dir` carries sign)
  dir: '-y' | '+y';
  /** Optional partial-UDL extent along the bar, in [0,1]. Defaults to full bar. */
  from?: number;
  to?: number;
}

export interface PointBarLoad {
  id: string;
  kind: 'point-bar';
  lc: LoadCase;
  /** CTE Tabla 3.1 category — only meaningful when lc === 'Q'. Default 'B'. */
  useCategory?: UseCategoryCode;
  bar: string;
  pos: number;          // 0..1 along the bar
  P: number;            // kN (always positive)
  dir: '-y' | '+y';
}

export type Load = PointNodeLoad | UdlLoad | PointBarLoad;

// ── ArmadoHA ────────────────────────────────────────────────────────────────
//
// MOVED to frame-core/types.ts (shared with FEM 2D) and re-exported above —
// every existing 1D import keeps working unchanged.

// ── DesignModel — user-facing schema ────────────────────────────────────────

export interface SteelSelection {
  /** Catalog key into STEEL_PROFILES (e.g. 'IPE_240'). */
  profileKey: string;
  /** Steel grade ('S275' | 'S355'). */
  steel: 'S275' | 'S355';
  /** Beam type for LTB / interaction calc — auto-derived from topology, user-overridable. */
  beamType: 'ss' | 'cantilever' | 'fp' | 'ff';
  /** Critical length for LTB (m). Defaults to bar.length, user-editable. */
  Lcr?: number;
  /** ELS deflection limit denominator (e.g. 300 for L/300). */
  deflLimit: number;
  /** ELS combination type. */
  elsCombo: 'characteristic' | 'frequent' | 'quasi-permanent';
  /** Use category for ψ₂ in ELS combinations. */
  useCategory: string;
}

export interface DesignBar {
  id: string;
  i: string;                                   // node id
  j: string;                                   // node id
  material: MaterialFamily;
  /** Required when material === 'rc'. */
  rcSection?: RcSection;
  /** Required when material === 'steel'. */
  steelSelection?: SteelSelection;
  /** User-entered armado for the vano region (only meaningful when material === 'rc'). */
  vano_armado?: ArmadoHA;
  /** User-entered armado for the apoyo region. */
  apoyo_armado?: ArmadoHA;
  /** Internal-hinge flags at each end node. ON at an intermediate node implies a design split. */
  internalHinges: { i: boolean; j: boolean };
}

export interface DesignModel {
  presetCode: string;                          // 'beam' | 'cantilever' | 'continuous' | 'custom' | ...
  /**
   * @deprecated V1.1 — combo moved to ViewState (`view.combo`). Field kept
   * optional for backwards-compat with existing fixtures and persisted data;
   * `decodeShareString` and `loadFromStorage` strip it silently on hydration.
   */
  combo?: ComboCode;
  selfWeight: boolean;                          // default true
  nodes: Node[];                                // y forced to 0 in V1
  bars: DesignBar[];
  supports: Support[];
  loads: Load[];                                // each carries lc tag
}

// ── AnalysisModel — solver-facing schema (output of autoDecompose) ──────────

export interface AnalysisNode {
  id: string;
  x: number;                                   // m (linear x along the strip)
  /** Inherits from a DesignModel.nodes entry when available, otherwise auto-inserted. */
  designNodeId?: string;
}

export interface AnalysisElement {
  id: string;
  /** Back-reference to the DesignBar this element belongs to (for envelope rollup). */
  designBarId: string;
  i_node: string;                              // analysis node id
  j_node: string;                              // analysis node id
  length: number;                              // m
  EI: number;                                  // kN·m² (E × I, SI)
  EA: number;                                  // kN     (E × A, SI)
  /** Rotational end-condition flags. 'released' = pin (no moment transfer). */
  rotZ_i: 'continuous' | 'released';
  rotZ_j: 'continuous' | 'released';
  /** Distributed load on this element, signed in world-y (kN/m). 0 if no UDL covers it. */
  q: number;
  /** Self-weight contribution (kN/m, signed) — already included in q if model.selfWeight is on. */
  q_sw: number;
}

export interface AnalysisBC {
  /** Analysis node id where the BC is applied. */
  node: string;
  /** Restrain vertical translation (Ry support, no vertical displacement). */
  fixY: boolean;
  /** Restrain rotation (only true for 'fixed' supports — pinned/roller leave rotation free). */
  fixRot: boolean;
}

export interface AnalysisPointLoad {
  /** Analysis node where the point load is applied (either user-specified node or auto-split point). */
  node: string;
  /** Force in -y / +y direction (signed, kN). */
  Py: number;
  /** Optional applied moment (kN·m, signed positive CCW). */
  M?: number;
  /** Load case for combination superposition. */
  lc: LoadCase;
}

export interface AnalysisLoadCase {
  lc: LoadCase;
  /** Element-wise distributed load contribution (signed, kN/m). Aligned with elements[]. */
  q: number[];
  /** Nodal point loads (already aggregated by node). */
  pointLoads: AnalysisPointLoad[];
}

export interface AnalysisModel {
  nodes: AnalysisNode[];
  elements: AnalysisElement[];
  bcs: AnalysisBC[];
  /**
   * Per-load-case payloads. The solver runs once per non-empty entry and
   * combines envelopes via superposition (linear FEM property).
   *
   * For V1 the typical contents are:
   *   - 'G'  : permanent loads (UDLs + point) + self-weight when enabled
   *   - 'Q'  : variable loads (or merged 'var' bucket — see Open Question)
   * Other cases (W, S, E) are preserved per-case for V1.5 ψ-specific combos.
   */
  loadCases: AnalysisLoadCase[];
}

// ── Solver outputs (per analysis element + reaction set) ────────────────────

export interface ElementSamples {
  /** Sampled positions along the element, x_local ∈ [0, L]. Length = N+1. */
  xs: number[];
  /** Sampled M, V, w per load-case label. Keys: 'G', 'var', 'ELU', 'ELS-c', 'ELS-f'. */
  M: Record<string, number[]>;
  V: Record<string, number[]>;
  w: Record<string, number[]>;
}

export interface SolverElementResult {
  elementId: string;
  designBarId: string;
  L: number;
  samples: ElementSamples;
}

export interface ReactionResult {
  node: string;          // design node id
  x: number;
  y: number;
  Rx: number;
  Ry: number;
  Mr: number;
}

/**
 * Per-combination reactions (V1.1 R9 — canvas combo selector also drives
 * reactions, not just diagrams). Each entry is the worst-of-multi-principal
 * envelope across CTE Tabla 4.2 sub-combinations.
 */
export interface ReactionsByCombo {
  ELU:      ReactionResult[];
  ELS_c:    ReactionResult[];
  ELS_frec: ReactionResult[];
  ELS_cp:   ReactionResult[];
}

export interface SolveResult {
  /**
   * Solver outputs per analysis element. Optional in V1 to keep the legacy
   * mock solver compiling; Lane A.3 (real solver) will populate it and
   * Lane A.4 (adapters) will consume it. The current mock returns only
   * `perBar` rolled up directly without exposing the analysis-level samples.
   */
  elements?: SolverElementResult[];
  /** Reactions summed across LCs (back-compat; legacy display path). */
  reactions: ReactionResult[];
  /**
   * Per-combination reactions envelope. Canvas reads `reactionsByCombo[view.combo]`
   * so that the combo selector (ELU/ELS-c/ELS-frec/ELS-cp) drives diagrams AND
   * reactions consistently. Optional during the migration window — consumers
   * fall back to `reactions` when undefined.
   */
  reactionsByCombo?: ReactionsByCombo;
  errors: ModelError[];
  /**
   * Per-design-bar rolled-up envelope after adapter has run. Empty when the
   * solver couldn't run.
   */
  perBar: Record<string, BarResult>;
  maxEta: number;
  status: 'ok' | 'warn' | 'fail' | 'pending' | 'neutral';
}

// ── Per-bar verdict (after adapter + check engine) ──────────────────────────

export interface BarCheck {
  name: string;
  val: string;
  unit: string;
  eta: number;
  ref: string;
}

/** Per-bar M/V/N + deflection samples for one combination envelope. */
export interface BarEnvelope {
  xs: number[];
  M: number[];
  V: number[];
  N: number[];
  /**
   * Transverse deflection samples (in meters, +y up per solver convention).
   * Populated from the FEM Hermite displacements weighted by the combination's
   * LC factors. Empty array when the solver hasn't run.
   */
  delta: number[];
}

export interface BarResult {
  /** Concatenated x_global samples across all elements of this design bar. */
  xs: number[];
  /** Combined M(x) for the requested envelope (typically ELU). Maintained as
   *  the ELU envelope for backward compatibility — Canvas migrating to read
   *  `envelope[view.combo]` instead in Lane R2. */
  M: number[];
  V: number[];
  N: number[];
  L: number;
  Mmax: number;
  Vmax: number;
  Nmax: number;
  eta: number;
  status: 'ok' | 'warn' | 'fail' | 'pending' | 'none';
  checks: BarCheck[];
  /**
   * Lane R1 V1.1 — three envelopes per bar (canvas display switches between
   * them via `view.combo`). Computed via combinations.ts (CTE Tabla 4.2).
   * Optional during the migration window: existing call sites that only need
   * ELU keep using `xs/M/V/N` directly. New code should prefer `envelope[combo]`.
   */
  envelope?: {
    ELU: BarEnvelope;
    ELS_frec: BarEnvelope;
    ELS_cp: BarEnvelope;
  };
  /**
   * Lane R6 V1.1 — preserved adapter result for embed rendering.
   * `<RCBeamsResults>` consumes RCBeamResult; `<SteelBeamsResults>` consumes
   * SteelBeamResult. Only one is set per bar (matches bar.material). The
   * legacy `checks: BarCheck[]` summary stays as backwards-compat.
   *
   * Typed as `unknown` here to avoid pulling lib/calculations types into the
   * FEM types module — the embed wrappers cast at consumption time.
   */
  rcResult?: unknown;
  steelResult?: unknown;
}

// ── UI state ────────────────────────────────────────────────────────────────

/**
 * View toggles for diagrams + overlays.
 *
 * Multi-select (NOT radio) per design review Pass 5 decision: each diagram
 * has its own boolean. N is omitted in V1 (vigas continuas → axial = 0).
 *
 * The legacy `diagram` enum is kept as a transition shim so the existing
 * skeleton (Canvas/FloatingControls) keeps compiling until Lane B migrates
 * the UI to use the per-diagram booleans directly.
 */
/**
 * Active overlay layer (mutually exclusive). Default is 'none' — the working
 * state where dimensions (cotas) and load arrows are visible and editable.
 * Selecting any other layer hides cotas + cargas and renders that single
 * overlay; clicking the active layer button returns to 'none'.
 */
export type ViewLayer =
  | 'none'      // default: cotas + cargas + bars (editable working state)
  | 'M'         // moment diagram
  | 'V'         // shear diagram
  | 'reactions' // support reactions
  | 'deformed'  // deflected shape (δ peak labelled)
  | 'eta';      // bars colored by utilization η%

export interface ViewState {
  /** Active single-layer overlay. */
  layer: ViewLayer;
  /** Combination envelope feeding diagrams and reactions. */
  combo: 'ELU' | 'ELS_frec' | 'ELS_cp';
  /** Deformed-shape visual scale multiplier (0.5x — 5x). */
  deformedScale?: number;
}

// Tool set (V1.2):
//   - 'bar' (re-introduced): connect two EXISTING collinear nodes with a bar.
//     Two-click pick i→j; no free-form drawing (still collinear strip only).
//     Restores the ability to rebuild a bar deleted from the middle of a beam.
//   - 'load-dist' / 'load-point': the old single 'load' tool split in two —
//     distributed (UDL on a bar) vs point (nodal load, creating the node if
//     the click lands on a bar with no node nearby).
export type ToolId =
  | 'select'
  | 'node'
  | 'bar'
  | 'support'
  | 'load-dist'
  | 'load-point'
  | 'delete';

export type Selected =
  | { kind: 'node'; id: string }
  | { kind: 'bar'; id: string }
  | { kind: 'load'; id: string }
  | null;

// ── Material catalog (steel only — RC sections live on DesignBar.rcSection) ─

export interface SteelProfile {
  /** Canonical name: 'IPE 240', 'HEB 200', etc. */
  name: string;
  /** Family group used by the canvas + adapter. */
  family: 'IPE' | 'HEA' | 'HEB' | 'IPN' | 'L';
  size: number;       // numeric size token (e.g. 240, 200)
  E: number;          // MPa
  A: number;          // cm²
  I: number;          // cm⁴
  /** Yield strength deduced from steel grade at the DesignBar level. */
  fy_default: number; // MPa (for backwards-compat with the legacy MAT entries)
  gamma: number;      // partial factor (γ_M0)
}

// ── Legacy types kept for backwards compat with the existing skeleton files ─
//
// The Canvas / InputsPanel / ResultsPanel / index.tsx still reference these
// shapes. They will be migrated as part of Lane B (canvas + UI refactor).
// Once migrated these aliases can be removed.

/** @deprecated use DesignBar instead. Kept for legacy Canvas/InputsPanel compat. */
export interface Bar {
  id: string;
  i: string;
  j: string;
  mat: string;
  role?: BarRole;
}

/** @deprecated use DesignModel instead. Kept for legacy compat. */
export interface FemModel {
  presetCode: string;
  combo: ComboCode;
  selfWeight: boolean;
  nodes: Node[];
  bars: Bar[];
  supports: Support[];
  loads: Load[];
}

/** @deprecated MAT will be reduced to steel profiles only — RC sections live on DesignBar.rcSection. */
export interface SteelMaterial {
  kind: 'steel';
  role: BarRole;
  name: string;
  E: number;
  A: number;
  I: number;
  fy: number;
  gamma: number;
  color: 'steel';
}

/** @deprecated RC sections live on DesignBar.rcSection. */
export interface RcMaterial {
  kind: 'rc';
  role: BarRole;
  name: string;
  E: number;
  b: number;
  h: number;
  A: number;
  I: number;
  fck: number;
  gamma: number;
  color: 'rc';
}

/** @deprecated. Migrate to SteelProfile (+ DesignBar.rcSection). */
export type Material = SteelMaterial | RcMaterial;
