// frame-core — shared FEM types (Lane B, eng-review D12)
//
// The shared calculation core consumed by BOTH bar-analysis modules:
//   features/fem-analysis (FEM 1D, continuous beams — keeps its own 2-DOF
//   beam assembly) and features/fem2d (frames/trusses — its own 3-DOF
//   assembly). Per D12 the ASSEMBLY is per-module; what lives here is what
//   is genuinely common: linear algebra, CTE combinations, section/catalog
//   data, and these base types.
//
// These definitions MOVED here verbatim from features/fem-analysis/types.ts,
// which re-exports them for backwards compatibility (zero-churn for the 1D
// module — eng-review D2: pure refactor).

export type LoadCase = 'G' | 'Q' | 'W' | 'S' | 'E';

/**
 * CTE DB-SE-AE Tabla 3.1 use category code.
 * Per-load classification for Q-type loads only — drives ψ values in
 * combinations.ts (Tabla 4.2 CTE).
 */
export type UseCategoryCode =
  | 'A1' | 'A2' | 'B' | 'C1' | 'C2' | 'C3' | 'D1' | 'E1' | 'G1' | 'custom';

export interface ModelError {
  severity: 'fail' | 'warn';
  code: string;
  msg: string;
}

export interface RcSection {
  b: number;   // cm (canonical UI unit; adapters multiply ×10 for mm)
  h: number;   // cm
  fck: number; // MPa
  fyk: number; // MPa  (default 500 for B500S)
  cover: number; // mm (mechanical cover)
  exposureClass: string; // 'XC1' | 'XC2' | 'XC3' | 'XC4'
  loadType: string;      // 'residential'|'office'|'parking'|'roof'|'custom'
}

/**
 * One rebar layout per beam check region (vano OR apoyo). MOVED here verbatim
 * from features/fem-analysis/types.ts (re-exported there) now that the 2D
 * module shares it: a user enters one ArmadoHA for the vano region (positive
 * M, tension at the bottom) and one for the apoyo region (negative M, tension
 * at the top). The adapters to RCBeamInputs own the "bot vs top vs tension vs
 * compression" mapping.
 */
export interface ArmadoHA {
  /** Bars on the side in tension for the region (bottom for vano, top for apoyo) */
  tens_nBars: number;
  tens_barDiam: number;          // mm
  /** Bars on the opposite face (compression) */
  comp_nBars: number;
  comp_barDiam: number;          // mm
  stirrupDiam: number;           // mm
  stirrupSpacing: number;        // mm (s)
  stirrupLegs: number;
}

/**
 * Rectangular RC column cage — the reinforcement model calcRCColumn expects
 * (4 corner bars always present + optional intermediate bars per face pair).
 * A column cage is NOT expressible as the vano/apoyo ArmadoHA pair (eng-review
 * outside-voice finding 2), hence its own shape. Section geometry/materials
 * live in the companion RcSection.
 */
export interface RcColumnCage {
  cornerBarDiam: number;   // mm — the 4 corner bars
  nBarsX: number;          // intermediate bars per face on top/bottom faces (≥ 0)
  barDiamX: number;        // mm
  nBarsY: number;          // intermediate bars per face on left/right faces (≥ 0)
  barDiamY: number;        // mm
  stirrupDiam: number;     // mm
  stirrupSpacing: number;  // mm
}

/**
 * Minimal structural shape the combination builders need from a load.
 * Both the 1D `Load` union and the 2D `Fem2DLoad` union satisfy it.
 */
export interface CaseTaggedLoad {
  id: string;
  lc: LoadCase;
  useCategory?: UseCategoryCode;
}
