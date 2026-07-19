// FEM 2D — analysis-level model (solver input)
//
// The 2D sibling of the 1D AnalysisModel: what decompose.ts produces and
// solver2d.ts consumes. Every element carries CONSTANT distributed load in
// its LOCAL axes per load case; point loads are nodal only (decompose splits
// members at point-load positions). See types.ts for the axes conventions.

import type { LoadCase } from './types';

export interface Analysis2DNode {
  id: string;
  x: number; // m, world
  y: number; // m, world
}

export interface Analysis2DElement {
  id: string;
  /** Back-reference to the Fem2DMember this element belongs to. */
  designMemberId: string;
  i: string; // analysis node id (local x_local runs i → j)
  j: string;
  elementType: 'beam-column' | 'two-force';
  EA: number; // kN
  EI: number; // kN·m² (ignored for two-force)
  /** Moment release at each end (beam-column only; a two-force element is
   *  axial by formulation). Handled by the duplicate-θ-DOF scheme in the
   *  solver: a released end gets its OWN rotation unknown, which enforces
   *  zero end moment exactly. */
  releaseI: boolean;
  releaseJ: boolean;
}

export interface Analysis2DBC {
  node: string;
  fixX: boolean;
  fixY: boolean;
  /** Restrains the node's SHARED rotation cluster. Released element ends keep
   *  their own free θ (release wins over support fixity — a hinged member end
   *  at a clamped support behaves pinned). */
  fixRot: boolean;
}

export interface Analysis2DNodeLoad {
  node: string;
  Fx: number; // kN, world
  Fy: number; // kN, world
  /** Optional nodal moment (kN·m, CCW+). Applied to the node's shared θ DOF;
   *  ignored (with a solver warning) if the node has none. Not surfaced by
   *  the v1 design model — kept for solver tests. */
  M?: number;
}

export interface Analysis2DElementLoad {
  /** Constant distributed load on the element, LOCAL axes (kN/m). */
  qx: number;
  qy: number;
}

export interface Analysis2DLoadCase {
  lc: LoadCase;
  /** Element-wise local distributed load, aligned with Analysis2DModel.elements. */
  q: Analysis2DElementLoad[];
  nodeLoads: Analysis2DNodeLoad[];
}

export interface Analysis2DModel {
  nodes: Analysis2DNode[];
  elements: Analysis2DElement[];
  bcs: Analysis2DBC[];
  loadCases: Analysis2DLoadCase[];
}
