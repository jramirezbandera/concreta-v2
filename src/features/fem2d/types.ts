// FEM 2D — types (Lane A, plan eng-review 2026-07-17)
//
// Design-level model for the parametric 2D module (pórticos y cerchas).
// This is the 2D sibling of fem-analysis/types.ts DesignModel, with the
// decisions from the eng review baked in:
//
//   D5  — loads are SIGNED COMPONENTS (Fx, Fy / wx, wy), never dir flags.
//   D4  — hard model-size caps keep the dense synchronous solve instant.
//
// Fase 2 (design doc 2026-07-28): el ROL DE BARRA y el elementType salieron
// del modelo. El motor de 5 valores solo extraía 1 bit y una etiqueta mal
// puesta daba veredictos inseguros EN SILENCIO (pilar inclinado 15° → 'viga'
// → pierde la interacción M+N §6.3.3; viga → 'pilar' → pierde la flecha).
// Sustitutos, cada uno con una sola responsabilidad:
//   rcDesignKind     — la ÚNICA elección legítima del rol (cambia el armado
//                      que se lee, no la fórmula). Solo HA, solo del usuario.
//   releases         — la biela es un caso DERIVADO (birrotulada + sin carga
//                      de barra), no un tipo: decompose.ts la deriva.
//   deflLimit        — la flecha la gobierna un dato de proyecto (D10/OQ2).
//   weakAxisBracing  — coacción del eje débil, separada de las correas (D13).
//   displayGroup     — presentación pura para resultados/PDF (paso 12).
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
 * Grupo de PRESENTACIÓN pura de una barra (Fase 2, paso 12): agrupa los
 * resultados y el PDF. Lo estampan las plantillas, que conocen la topología
 * porque la generan; en el editor libre queda `undefined` y el agrupado cae a
 * PILARES / VIGAS por verticalidad. CERO payload de motor: ningún check lo lee
 * jamás — es la diferencia exacta entre etiqueta y dato.
 */
export type DisplayGroup2D = 'pilar' | 'viga' | 'cordon' | 'diagonal' | 'montante';

/**
 * Límite de flecha ELS por barra (D10, CTE DB-SE 4.3.3): el denominador n de
 * L/n, o 'none' = no aplica. Es un DATO DE PROYECTO del usuario — depende de
 * qué soporta la barra (tabiquería frágil L/500 · ordinaria L/400 · apariencia
 * L/300) y el programa no puede deducirlo. `undefined` ≡ 300 (el L/300 que la
 * app imponía a todo el mundo antes de que esto fuera elegible).
 */
export type DeflLimit2D = 300 | 400 | 500 | 'none';

/**
 * Formulación del elemento en el SOLVER. Desde la Fase 2 es un detalle
 * DERIVADO en decompose.ts — nunca un campo del miembro:
 *   birrotulada (releases.i && releases.j) SIN carga de barra → 'two-force'
 *   (axial puro, 4 GDL, bien condicionado); cualquier otra cosa →
 *   'beam-column'. El peso propio NO cuenta como carga de barra (Fase 0,
 *   Resultado 3): se agrupa mitad en cada nudo, la idealización que la app
 *   siempre aplicó. Una carga explícita del usuario sí cuenta: la barra pasa
 *   a viga-columna birrotulada y FLECTA — ahí muere el bloqueo original del
 *   asistente IA con las cargas sobre diagonales.
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
  material: 'steel' | 'rc' | 'timber';
  /**
   * Comprobación HA elegida por el usuario (material === 'rc' only). Es el
   * ÚNICO descendiente legítimo del rol: cambia una ENTRADA (qué armado se
   * lee y qué motor lo comprueba), no elige una fórmula:
   *   'beam'   → calcRCBeam con vanoArmado + apoyoArmado
   *   'column' → calcRCColumn con columnCage (flexocompresión §5.8)
   * NO se siembra por geometría (P1: el programa no puede deducir cómo se
   * arma una barra). `undefined` → PENDIENTE con mensaje accionable.
   */
  rcDesignKind?: 'beam' | 'column';
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
   * RC reinforcement (material === 'rc' only). BOTH shapes are stamped with
   * defaults when the user switches a member to HA and BOTH persist across
   * rcDesignKind flips (losing the cage on a flip would be data loss):
   *   'beam'   → vanoArmado + apoyoArmado (1D pattern: calcRCBeam pair)
   *   'column' → columnCage (calcRCColumn rectangular cage)
   * Checks read whichever the CURRENT rcDesignKind needs; missing armado →
   * 'pending' (share links / AI proposals may carry HA members without armado).
   */
  vanoArmado?: ArmadoHA;
  apoyoArmado?: ArmadoHA;
  columnCage?: RcColumnCage;
  /**
   * Moment releases at each end. Ambas liberadas + sin carga de barra ⇒
   * decompose deriva la formulación 'two-force' (la "biela" ya no es un tipo
   * del miembro sino un caso particular: birrotulada + descargada).
   */
  releases: { i: boolean; j: boolean };
  /**
   * Lateral-torsional buckling restraint spacing (m): distance between
   * compression-flange restraints (correas / viguetas / forjado). Caps the LTB
   * critical length (Lcr = min(ltbSpacing, L)) — steel Mb,Rd and timber kcrit.
   * Undefined = unrestrained (full member length). SOLO coacciona el ala
   * comprimida: NO es el arriostramiento del eje débil (ver weakAxisBracing).
   */
  ltbSpacing?: number;
  /**
   * Arriostramiento del EJE DÉBIL (D13, cierra OQ7): separación (m) entre
   * puntos que coaccionan la traslación lateral de la sección ENTERA (no solo
   * el ala comprimida). Acorta la longitud de pandeo por el eje débil de la
   * fila axil (acero: Lcr,z = min(weakAxisBracing, L); madera: Lef_z).
   * Undefined = sin arriostrar (longitud completa) — el comportamiento
   * histórico del acero. Es un dato distinto de ltbSpacing a propósito: unas
   * correas sujetan el ala, no la sección, y compartir campo inventaba una
   * precisión que no existe.
   */
  weakAxisBracing?: number;
  /**
   * Límite de flecha ELS (D10, cierra OQ2). `undefined` ≡ 300. 'none' = no
   * aplica (sin fila de flecha). Solo actúa sobre barras cuya formulación
   * derivada es viga-columna: una biela no puede flectar por formulación.
   */
  deflLimit?: DeflLimit2D;
  /** Agrupado de presentación para resultados y PDF. Ver DisplayGroup2D. */
  displayGroup?: DisplayGroup2D;
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
