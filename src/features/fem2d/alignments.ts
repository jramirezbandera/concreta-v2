// FEM 2D — axis alignments + chain-dimension semantics (user decision, 2026-07-18).
//
// The editor shows TWO dimension chains: horizontal (gaps between vertical
// alignments — "luces") below the model, and vertical (gaps between levels —
// "alturas") on the left. Editing one gap moves THAT alignment as a whole
// (every node sharing the coordinate — like moving a grid line on a setting-out
// plan) and nothing else: NO cascade to other alignments, mirroring the 1D
// chain decision. Inclined members follow their endpoints (moving an eave
// alignment re-slopes the rafters; the ridge stays put).
//
// Clustering tolerance is 1 mm: with the 0.1 m placement snap and numeric
// inspector edits, coordinates are exact — the tolerance only absorbs float
// noise, it is not a "nearby nodes" heuristic.

import { applyGuard, type OpResult } from './modelOps';
import { MIN_MEMBER_LENGTH_M, type Fem2DModel, type Fem2DNode } from './types';

export const ALIGN_TOL_M = 1e-3;

export type Axis2D = 'x' | 'y';

export interface Alignment {
  /** Representative coordinate (first member of the cluster). */
  coord: number;
  nodeIds: string[];
}

/** Cluster node coordinates along `axis` into sorted alignments (greedy by
 *  tolerance over the sorted list). */
export function computeAlignments(nodes: ReadonlyArray<Fem2DNode>, axis: Axis2D): Alignment[] {
  const sorted = [...nodes].sort((a, b) => a[axis] - b[axis]);
  const out: Alignment[] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(n[axis] - last.coord) <= ALIGN_TOL_M) {
      last.nodeIds.push(n.id);
    } else {
      out.push({ coord: n[axis], nodeIds: [n.id] });
    }
  }
  return out;
}

/**
 * Set the gap between alignments `gapIndex` and `gapIndex+1` to `newGap` (m):
 * every node of alignment `gapIndex+1` shifts by the delta along `axis`.
 * Rejections: gap below the member minimum, or the moved alignment landing
 * within tolerance-plus-minimum of its OTHER neighbour (no reordering, no
 * collapsing). Post-move the guard re-validates and auto roles re-infer.
 */
export function moveAlignmentGap(
  model: Fem2DModel,
  axis: Axis2D,
  gapIndex: number,
  newGap: number,
): OpResult {
  const aligns = computeAlignments(model.nodes, axis);
  if (gapIndex < 0 || gapIndex >= aligns.length - 1) {
    return { ok: false, reason: 'Cota inexistente.' };
  }
  if (!Number.isFinite(newGap) || newGap < MIN_MEMBER_LENGTH_M) {
    return { ok: false, reason: `La cota mínima es ${MIN_MEMBER_LENGTH_M} m.` };
  }
  const base = aligns[gapIndex];
  const moved = aligns[gapIndex + 1];
  const newCoord = base.coord + newGap;
  const delta = newCoord - moved.coord;
  if (Math.abs(delta) < 1e-12) return { ok: true, model };

  // The moved alignment must not invade its far neighbour.
  const next = aligns[gapIndex + 2];
  if (next && newCoord > next.coord - MIN_MEMBER_LENGTH_M) {
    return {
      ok: false,
      reason: `La alineación chocaría con la siguiente (a ${(next.coord - base.coord).toFixed(2)} m).`,
    };
  }

  const movedSet = new Set(moved.nodeIds);
  const candidate: Fem2DModel = {
    ...model,
    templateId: 'custom',
    nodes: model.nodes.map((n) =>
      movedSet.has(n.id) ? { ...n, [axis]: n[axis] + delta } : n,
    ),
  };
  const guarded = applyGuard(model, candidate);
  if (!guarded.ok) return guarded;
  return guarded;
}
