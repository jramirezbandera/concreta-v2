// FEM 2D — unit conversion utilities
//
// Centralized cm ↔ mm conversion for the adapters that map FEM model
// quantities to the existing Concreta calc-engine input shapes.
//
// Why this lives in its own file:
//   - The FEM model uses cm for HA section dims (b, h) and cm² / cm⁴ for
//     steel profile properties (consistent with the design system + DESIGN.md).
//   - calcRCBeam / calcSteelBeam expect mm for dimensions.
//   - kN, kN·m, MPa are shared between FEM and the calc engines (no conversion).
//
// Keeping conversion here means a single test surface for the unit math,
// and adapters never embed bare numeric factors.

/** Convert a section dimension from cm to mm (for adapter input to calc engines). */
export function cmToMm(cm: number): number {
  return cm * 10;
}

/** Convert a length from m to mm. Used rarely (FEM mostly works in m + cm). */
export function mToMm(m: number): number {
  return m * 1000;
}

/** Convert a length from mm back to cm. Used by reverse-mapping in adapters. */
export function mmToCm(mm: number): number {
  return mm / 10;
}

/**
 * Section area in m² from a rectangular HA section (b, h in cm).
 * Used by self-weight + axial-stiffness derivations.
 */
export function rcSectionAreaM2(b_cm: number, h_cm: number): number {
  return b_cm * h_cm * 1e-4;
}

/**
 * Steel-profile area in m² from cm² (catalog value).
 */
export function steelAreaM2(A_cm2: number): number {
  return A_cm2 * 1e-4;
}
