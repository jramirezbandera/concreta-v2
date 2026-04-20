// Polymorphic cross-section abstraction — two tiers:
//
//   SectionGeometry      — pure geometry + visual primitives, shared by all
//                          consumers that only need physical properties
//                          (compositeSection, anchorPlate).
//
//   ColumnBeamSection    — extends SectionGeometry with EC3 column/beam
//                          behavior: classification, buckling curves, LTB,
//                          Mcr, and moment reduction for biaxial interaction.
//                          Used by steelColumns and steelBeams.
//
// CHS (circular hollow section): no LTB (computeMcr returns Infinity; the
// Euler formula with Iw=0 and closed-tube It gives λ̄_LT → 0 → χ_LT = 1),
// single buckling curve per process (a for EN 10210 hot-finished, c for
// EN 10219 cold-formed), and biaxial moment interaction uses
// M_res = √(My² + Mz²) because CHS is axially symmetric.

/** Discriminant for each concrete section type. */
export type SectionKind = 'I' | '2UPN' | 'CHS';

/** Pure visual primitives — SVG renderer composes labels/dim-arrows itself. */
export interface CrossSectionPrimitives {
  kind: SectionKind;
  /**
   * All coordinates in mm, origin at cross-section centroid. +x along weak
   * axis (plate_b direction), +y downward along strong axis (plate_a / h).
   * Bounding box is derived from the section's h × b.
   */
  shapes: Shape[];
  /** Real-world bbox in mm — viewport fit by the renderer. */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

export type Shape =
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'ring'; cx: number; cy: number; rOuter: number; rInner: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; dashed?: boolean };

/** Base interface — pure physical geometry. */
export interface SectionGeometry {
  readonly kind: SectionKind;
  /** Short human label, e.g. "HEB 200", "2UPN 200", "CHS 168.3×8 (10210)". */
  readonly label: string;

  // Section properties (standard units)
  readonly A: number;      // cm²
  readonly Iy: number;     // cm⁴ — strong axis (major)
  readonly Iz: number;     // cm⁴ — weak axis (minor)
  readonly Wpl_y: number;  // cm³
  readonly Wpl_z: number;  // cm³
  readonly Wel_y: number;  // cm³
  readonly Wel_z: number;  // cm³
  readonly It: number;     // cm⁴ — Saint-Venant torsional constant
  readonly Iw: number;     // cm⁶ — warping constant (0 for closed / CHS)

  // Bounding box / equivalent element thicknesses (mm)
  readonly h: number;      // overall height parallel to strong axis (= D for CHS)
  readonly b: number;      // overall width parallel to weak axis  (= D for CHS)
  readonly tf: number;     // flange thickness (= t for CHS, = UPN tf for 2UPN)
  readonly tw: number;     // web thickness    (= t for CHS)
  readonly r: number;      // fillet radius (0 for CHS)

  /** Returns minimal primitives for the SVG renderer to draw the shape. */
  getPrimitives(): CrossSectionPrimitives;
}

/** Interaction formulation used by the caller when reducing design moments. */
export interface ReducedMoments {
  /** Resistant moment per y axis (kept equal to My_Ed unless collapsed). */
  My: number;
  /** Resistant moment per z axis. */
  Mz: number;
  /**
   * For CHS interaction only: resultant moment √(My² + Mz²) consumed by the
   * single axisymmetric check. For I / 2UPN box this is undefined and the
   * caller uses the classical two-term interaction with My and Mz separately.
   */
  M_res?: number;
}

/**
 * Column/beam-specific behaviour. Extends SectionGeometry so everywhere that
 * needs only geometry (composite / anchor-plate) stays decoupled from these
 * methods.
 */
export interface ColumnBeamSection extends SectionGeometry {
  /**
   * EC3 §5.5 Table 5.2 classification. Returns 1..4. Input is the yield
   * strength fy in MPa (the method already applies ε = √(235/fy)). The
   * optional `mode` selects web limits: `compression` uses 33/38/42·ε;
   * `bending` uses 72/83/124·ε. CHS ignores the mode (D/t limits are
   * axis-independent). Defaults to `compression` for column use.
   */
  classify(fy: number, mode?: 'compression' | 'bending'): number;

  /**
   * Flexural buckling imperfection factors α per EC3 §6.3.1.2 Tab 6.1/6.2.
   * For CHS: both axes share the same curve (a for hot-finished, c for
   * cold-formed). For I: depends on h/b ratio and steel grade. For 2UPN
   * box: curve b both axes.
   */
  getBucklingAlpha(): { alpha_y: number; alpha_z: number };

  /**
   * LTB imperfection factor α_LT per EC3 §6.3.2.3 Tabla 6.5 (rolled I).
   * Returns NaN when LTB does not apply (CHS, 2UPN box, or axisymmetric).
   */
  getLTBAlpha(): number;

  /**
   * Elastic critical moment for lateral-torsional buckling (kNm).
   *   - I-section: classical Eq. F.2 with Iz, It, Iw, and factor C1.
   *   - 2UPN box / CHS: returns Infinity (sentinel) — downstream the
   *     dimensionless slenderness λ̄_LT = √(Wpl·fy / Mcr) → 0 → χ_LT = 1.
   *
   * @param Lcr — unbraced length in mm
   * @param C1  — moment distribution factor (1.0 for uniform moment)
   * @param E   — Young's modulus in MPa
   * @param G   — Shear modulus in MPa
   */
  computeMcr(Lcr: number, C1: number, E: number, G: number): number;

  /**
   * Hook for the caller to transform biaxial (My_Ed, Mz_Ed) into the form
   * consumed by the interaction check.
   *   - I / 2UPN box: identity (returns {My, Mz}).
   *   - CHS: returns {My: M_res, Mz: 0, M_res} so the two-term interaction
   *     collapses to a single-axis check, matching EC3's treatment of
   *     axisymmetric sections. Wpl_y = Wpl_z already, so the single check
   *     suffices.
   */
  reduceDesignMoments(My: number, Mz: number): ReducedMoments;
}
