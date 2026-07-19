// FEM 2D — deformed-shape computation (pure).
//
// Builds a COHERENT deformed geometry for one combination group (ELU/ELS-c/
// ELS-cp): every factor set of the group is evaluated and the GOVERNING one
// (largest displacement peak) is drawn. Never a per-sample envelope — stitching
// worst-abs samples from different combinations would produce a shape that
// satisfies no equilibrium state (kinks at nodes, sway flipping sign along a
// storey).
//
// The shape comes from the solver's per-LC local displacement fields (u axial,
// w transverse — both INCLUDE the nodal/rigid-body part via the Hermite/linear
// interpolation), combined linearly with the set's factors and rotated to
// world axes. ELU here uses the plain CTE Tabla 4.2 factors — the αcr sway
// amplification of the check phase applies to design forces, not to the
// visualized displacement field.

import { buildLcCombinations, type LcFactors } from '../../lib/frame-core/lcCombinations';
import type { LoadCase } from '../../lib/frame-core/types';
import type { Fem2DComboId } from './checks';
import type { Solver2DElementResult } from './solver2d';
import type { Fem2DModel } from './types';

export interface DeformedMemberShape {
  memberId: string;
  /** Concatenated sample points along the member axis (world, m). */
  base: { x: number; y: number }[];
  /** World displacement (m) at each base point for the governing set. */
  disp: { dx: number; dy: number }[];
  /** Mid-span sample (base + displacement). Null for two-force members —
   *  their field is a straight interpolation of the ends, nothing to report. */
  mid: { x: number; y: number; dx: number; dy: number } | null;
}

export interface DeformedNodeDisp {
  id: string;
  x: number;  // m, world (undeformed)
  y: number;
  dx: number; // m, world displacement
  dy: number;
}

export interface DeformedShape2D {
  members: DeformedMemberShape[];
  /** Per design node displacement for the governing set (every node touched
   *  by a member; the LAYER decides which are worth labelling). */
  nodes: DeformedNodeDisp[];
  /** Peak displacement magnitude (m) across all samples. */
  peak: number;
  /** Sample where the peak occurs (world base point + displacement). */
  peakAt: { x: number; y: number; dx: number; dy: number } | null;
  /** Governing factor set of the group (null when nothing to draw). */
  factors: LcFactors | null;
}

const EMPTY: DeformedShape2D = { members: [], nodes: [], peak: 0, peakAt: null, factors: null };

/** Combined local sample (u or w) for a factor set. */
function combined(
  e: Solver2DElementResult,
  field: 'u' | 'w',
  i: number,
  factors: LcFactors,
): number {
  let v = 0;
  for (const lc of Object.keys(e.samples[field]) as LoadCase[]) {
    const f = factors[lc] ?? 0;
    if (f === 0) continue;
    v += f * (e.samples[field][lc]?.[i] ?? 0);
  }
  return v;
}

/** Peak |displacement| over all samples for one factor set. |(u,w)| is
 *  rotation-invariant, so the local magnitude IS the world magnitude. */
function peakFor(elements: Solver2DElementResult[], factors: LcFactors): number {
  let peak = 0;
  for (const e of elements) {
    for (let i = 0; i < e.samples.xs.length; i++) {
      const d = Math.hypot(combined(e, 'u', i, factors), combined(e, 'w', i, factors));
      if (d > peak) peak = d;
    }
  }
  return peak;
}

export function computeDeformedShape(
  model: Fem2DModel,
  elements: Solver2DElementResult[],
  combo: Fem2DComboId,
): DeformedShape2D {
  if (elements.length === 0) return EMPTY;
  const combos = buildLcCombinations(model.loads);
  const sets: LcFactors[] = combo === 'ELS_cp' ? [combos.ELS_cp] : combos[combo];
  if (sets.length === 0) return EMPTY;

  // Governing set of the group = the one with the largest displacement peak.
  let factors = sets[0];
  let peak = peakFor(elements, factors);
  for (let k = 1; k < sets.length; k++) {
    const p = peakFor(elements, sets[k]);
    if (p > peak) {
      peak = p;
      factors = sets[k];
    }
  }

  // Elements grouped per design member, preserving decompose order (elements
  // of a member are emitted i→j, so concatenating samples walks the axis).
  const byMember = new Map<string, Solver2DElementResult[]>();
  for (const e of elements) {
    const arr = byMember.get(e.designMemberId) ?? [];
    arr.push(e);
    byMember.set(e.designMemberId, arr);
  }

  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const members: DeformedMemberShape[] = [];
  const nodeDisp = new Map<string, DeformedNodeDisp>();
  let peakAt: DeformedShape2D['peakAt'] = null;
  let peakSeen = 0;

  for (const m of model.members) {
    const els = byMember.get(m.id);
    const a = nodeById.get(m.i);
    const b = nodeById.get(m.j);
    if (!els || !a || !b) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ex = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const ey = { x: -ex.y, y: ex.x };
    const totalL = els.reduce((s, e) => s + e.L, 0);

    const base: { x: number; y: number }[] = [];
    const disp: { dx: number; dy: number }[] = [];
    let midIdx = 0;
    let midDist = Infinity;
    let xOffset = 0;
    for (const e of els) {
      for (let i = 0; i < e.samples.xs.length; i++) {
        const s = xOffset + e.samples.xs[i];
        const u = combined(e, 'u', i, factors);
        const w = combined(e, 'w', i, factors);
        const p = { x: a.x + ex.x * s, y: a.y + ex.y * s };
        const d = { dx: u * ex.x + w * ey.x, dy: u * ex.y + w * ey.y };
        base.push(p);
        disp.push(d);
        const dMid = Math.abs(s - totalL / 2);
        if (dMid < midDist) {
          midDist = dMid;
          midIdx = base.length - 1;
        }
        const mag = Math.hypot(d.dx, d.dy);
        if (mag > peakSeen) {
          peakSeen = mag;
          peakAt = { ...p, ...d };
        }
      }
      xOffset += e.L;
    }

    // End samples ARE the design nodes (decompose keeps endpoint ids); shared
    // joints resolve once (first member wins — the solution is nodal, equal).
    if (!nodeDisp.has(m.i)) nodeDisp.set(m.i, { id: m.i, x: a.x, y: a.y, ...disp[0] });
    if (!nodeDisp.has(m.j)) {
      nodeDisp.set(m.j, { id: m.j, x: b.x, y: b.y, ...disp[disp.length - 1] });
    }

    const mid =
      m.elementType === 'two-force'
        ? null
        : { ...base[midIdx], ...disp[midIdx] };
    members.push({ memberId: m.id, base, disp, mid });
  }

  return { members, nodes: [...nodeDisp.values()], peak, peakAt, factors };
}
