// FEM 2D — types (Lane A, plan eng-review 2026-07-17)
//
// Design-level model for the parametric 2D module (pórticos y cerchas).
// This is the 2D sibling of fem-analysis/types.ts DesignModel, with the
// decisions from the eng review baked in:
//
//   D5  — loads are SIGNED COMPONENTS (Fx, Fy / wx, wy), never dir flags.
//   D10 — element type is assigned PER MEMBER: 'two-force' (axial only,
//         well-conditioned) for web members, 'beam-column' (axial+bending)
//         for anything that carries transverse load or frame action.
//   D9  — `role` is stamped by the parametric template (not guessed from
//         geometry) and drives check routing later (T5).
//   D4  — hard model-size caps keep the dense synchronous solve instant.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ Axes & sign conventions (the ONE place this is defined)             │
// │                                                                     │
// │   World axes:   +y                                                  │
// │                  ↑        +x → right, +y → UP, +θ CCW.              │
// │                  │        Gravity acts in −y.                       │
// │                  └──→ +x                                            │
// │                                                                     │
// │   ALL load components are SIGNED in world axes: a 10 kN gravity     │
// │   load is Fy = −10. There is NO "positive = downward" flip anywhere │
// │   in the 2D path — with arbitrary directions that convention cannot │
// │   survive. UI presets (gravedad ↓ / viento → / ⊥ barra) own the     │
// │   friendliness; the model stores physics.                           │
// │                                                                     │
// │   Member local axes:  x_local from node i toward node j;            │
// │   y_local = x_local rotated +90° CCW. Loads with frame 'local' are  │
// │   expressed in these axes (wy_local > 0 pushes toward +y_local),    │
// │   e.g. wind pressure perpendicular to a rafter.                     │
// └─────────────────────────────────────────────────────────────────────┘
//
// Shared shapes (LoadCase, UseCategoryCode, RcSection, ModelError) come from
// the shared frame-core (Lane B extraction, D12).

import type {
  ArmadoHA,
  LoadCase,
  ModelError,
  RcColumnCage,
  RcSection,
  TimberSection,
  UseCategoryCode,
} from '../../lib/frame-core/types';

export type { ArmadoHA, LoadCase, ModelError, RcColumnCage, RcSection, TimberSection, UseCategoryCode };

// ── Size caps (D4: dense synchronous solve stays instant) ───────────────────

/** Max design nodes. 60 nodes → ≤180 DOF → dense Gauss well under 5 ms. */
export const FEM2D_MAX_NODES = 60;
/** Max design members. */
export const FEM2D_MAX_MEMBERS = 120;
/** Minimum member length (m) — below this is numerical noise (mirrors 1D). */
export const MIN_MEMBER_LENGTH_M = 0.05;

// ── Core geometry ───────────────────────────────────────────────────────────

export interface Fem2DNode {
  id: string;
  x: number; // m, world
  y: number; // m, world (+y up — NOT forced to 0, unlike the 1D strip)
}

/** 2D supports. No 'spring' (the 1D solver degraded it to roller anyway). */
export type Support2DType = 'pinned' | 'fixed' | 'roller';

export interface Fem2DSupport {
  node: string;
  type: Support2DType;
}

// ── Members ─────────────────────────────────────────────────────────────────

/**
 * Template-stamped structural role (D9). Drives check routing in T5:
 * pilar → column engine, viga → beam engine, cordon → axial+bending,
 * diagonal/montante → pure axial (tension / compression+buckling).
 */
export type MemberRole = 'pilar' | 'viga' | 'cordon' | 'diagonal' | 'montante';

/**
 * D10 — element formulation per member:
 *   'beam-column' : axial + bending (6-DOF element). For frame members and
 *                   chords that carry distributed load (they DO flex — the
 *                   user's own requirement from the review).
 *   'two-force'   : axial only (4-DOF element), pin-ended by definition.
 *                   For web members. Keeps K well-conditioned where slender
 *                   diagonals would otherwise mix EI/L³ ≪ EA/L scales.
 * Invariant (enforced by validateModel2DBasic + by template construction):
 * a two-force member must NOT carry any member load.
 */
export type ElementType2D = 'beam-column' | 'two-force';

export interface Steel2DSelection {
  /** Catalog key into the shared steel profile catalog (e.g. 'steel_IPE240'). */
  profileKey: string;
  steel: 'S275' | 'S355';
}

export interface Fem2DMember {
  id: string;
  i: string; // node id (defines local +x_local direction i → j)
  j: string; // node id
  role: MemberRole;
  elementType: ElementType2D;
  material: 'steel' | 'rc' | 'timber';
  /** Required when material === 'steel'. */
  steelSelection?: Steel2DSelection;
  /** Required when material === 'rc'. Gross-section EI/EA come from here. */
  rcSection?: RcSection;
  /**
   * Required when material === 'timber'. Rectangular b×h (mm) + strength class
   * + clase de servicio. Persists across material flips (same policy as the RC
   * shapes below — switching away and back must never lose the user's section).
   */
  timberSection?: TimberSection;
  /**
   * RC reinforcement, per role family (material === 'rc' only). BOTH shapes
   * are stamped with defaults when the user switches a member to HA and BOTH
   * persist across role flips (auto re-inference can toggle pilar↔viga at any
   * node move — losing the cage on a transient flip would be data loss):
   *   viga / cordon → vanoArmado + apoyoArmado (1D pattern: calcRCBeam pair)
   *   pilar         → columnCage (calcRCColumn rectangular cage)
   * Checks read whichever the CURRENT role needs; missing armado → 'pending'
   * (share links / AI proposals may carry HA members without armado).
   */
  vanoArmado?: ArmadoHA;
  apoyoArmado?: ArmadoHA;
  columnCage?: RcColumnCage;
  /**
   * Moment releases at each end (beam-column only; a two-force element is
   * released at both ends by formulation and ignores this field).
   */
  releases: { i: boolean; j: boolean };
  /**
   * Lateral-torsional buckling restraint spacing (m) for steel beam-columns:
   * distance between compression-flange restraints (correas / viguetas /
   * forjado). Caps the LTB critical length the beam check uses
   * (Lcr = min(ltbSpacing, member length)). Undefined = unrestrained (full
   * member length). Ignored for two-force members and columns (a column's
   * unbraced height is its own length).
   */
  ltbSpacing?: number;
  /**
   * Free-editor flag: the user explicitly picked this member's role in the
   * inspector. Blocks the geometric re-inference that runs when nodes move
   * (auto only ever flips between pilar/viga; template-stamped semantic roles
   * — cordon/diagonal/montante — are preserved regardless). The ENGINE ignores
   * this field entirely.
   */
  roleManual?: boolean;
}

// ── Loads (D5: signed components, world or local frame) ─────────────────────

/**
 * Frame for member loads:
 *   'global' — components in world axes, per unit MEMBER length (gravity,
 *              cladding). Note: per-projected-length loads (snow on plan) are
 *              NOT modelled in v1 — pre-convert (w_proj·cosθ) if needed.
 *   'local'  — components in member local axes (⊥ pressure such as wind on
 *              a rafter: wy_local).
 */
export type LoadFrame2D = 'global' | 'local';

export interface NodeLoad2D {
  id: string;
  kind: 'node';
  lc: LoadCase;
  /** CTE Tabla 3.1 category — only meaningful when lc === 'Q'. */
  useCategory?: UseCategoryCode;
  node: string;
  Fx: number; // kN, world (+x right)
  Fy: number; // kN, world (+y up; gravity is negative)
}

export interface MemberUdl2D {
  id: string;
  kind: 'udl';
  lc: LoadCase;
  useCategory?: UseCategoryCode;
  member: string;
  wx: number; // kN/m in `frame` axes
  wy: number; // kN/m in `frame` axes
  frame: LoadFrame2D;
  /** Optional partial extent along the member, fractions of length in [0,1]. */
  from?: number;
  to?: number;
}

export interface MemberPointLoad2D {
  id: string;
  kind: 'point-member';
  lc: LoadCase;
  useCategory?: UseCategoryCode;
  member: string;
  /** Position along the member, fraction of length in [0,1] from node i. */
  pos: number;
  Fx: number; // kN in `frame` axes
  Fy: number; // kN in `frame` axes
  frame: LoadFrame2D;
}

export type Fem2DLoad = NodeLoad2D | MemberUdl2D | MemberPointLoad2D;

// ── Model ───────────────────────────────────────────────────────────────────

export type Fem2DTemplateId = 'pratt-truss' | 'portal-frame' | 'multistory' | 'gable';

export interface Fem2DModel {
  /** Provenance: which parametric template generated this model. */
  templateId: Fem2DTemplateId | 'custom';
  /** Include member self-weight as a G-case UDL (resolved at decompose time). */
  selfWeight: boolean;
  /**
   * Site datum: snow load is a MEDIUM-duration action (not short) when the
   * building sits above 1000 m (CTE DB-SE-M Tabla 2.2 / EC5 §2.3.1.2). Drives
   * ONLY the kmod class of timber members under an S-governed combination
   * (steel/HA ignore it); undefined/false ⇒ ≤1000 m ⇒ snow is short-duration.
   * Optional so links/localStorage saved before this field decode to false.
   */
  snowOver1000m?: boolean;
  nodes: Fem2DNode[];
  members: Fem2DMember[];
  supports: Fem2DSupport[];
  loads: Fem2DLoad[];
}
