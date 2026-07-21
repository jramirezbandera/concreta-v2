// FEM 2D — screen-space hit-testing for the editor canvas.
//
// Unlike the 1D strip (1D |Δx| test in world metres — its x-scale is fixed),
// the 2D canvas autofits, so tolerances live in SCREEN PIXELS: a click is a
// hit when it lands within HIT_NODE_PX of a node or HIT_MEMBER_PX of a member
// segment. Node beats member (the 1D priority), and a member hit carries the
// clamped projection parameter t ∈ [0,1] (split point / point-load position).
//
// Loads are hit-testable ON DEMAND (opts.loads — the editor enables it only
// for the select/delete tools so placement tools keep seeing members through
// the arrows). Their clickable geometry comes from loadGeometry, the SAME
// module canvasGlyphs draws from, so the sensitive area can't drift from the
// painted one. Priority: node > load > member, but clicks hugging a member's
// axis stay member clicks (the UDL arrowheads and the point-load tips touch
// the line — the line itself must stay selectable).
//
// The value LABEL of a load is clickable too (users aim at the number as
// readily as at the arrow), but it is the WEAKEST hit: a label floating over
// another bar still yields that bar.
//
// Pure functions — testable without DOM.

import type { UnitSystem } from '../../lib/units/types';
import {
  UDL_BAND_PX,
  computeLoadStackCounts,
  computeLoadStacks,
} from './canvasTheme';
import { hitsLoadLabel, loadGeometry } from './loadGeometry';
import type { SelectionSet2D } from './modelOps';
import type { Fem2DModel } from './types';

export const HIT_NODE_PX = 14;
export const HIT_MEMBER_PX = 10;
export const HIT_LOAD_PX = 8;
/** Clicks within this distance of the member axis never resolve to a load. */
const LOAD_MEMBER_CLEARANCE_PX = 5;

export type Hit =
  | { kind: 'node'; id: string }
  | { kind: 'member'; id: string; t: number }
  | { kind: 'load'; id: string }
  | null;

export interface HitOptions {
  /** Also test load glyphs (select/delete tools). Default false. */
  loads?: boolean;
  /** Unit system the canvas is rendering in — the load LABELS are sized from
   *  their formatted text, so the box has to be measured in the same units. */
  system?: UnitSystem;
}

/** Distance from point P to segment AB, plus the clamped projection t∈[0,1]. */
export function distPointSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { d: number; t: number } {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) {
    return { d: Math.hypot(px - ax, py - ay), t: 0 };
  }
  const t = Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / len2));
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  return { d: Math.hypot(px - cx, py - cy), t };
}

/**
 * Hit-test a screen point against the model. `sx`/`sy` are the world→screen
 * projection of the active transform. Priority: nearest node within tolerance
 * beats any load; nearest load (opts.loads) beats any member; else the nearest
 * member within tolerance.
 */
export function hitTest(
  model: Fem2DModel,
  px: number,
  py: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
  opts: HitOptions = {},
): Hit {
  // Nodes first (1D priority): pick the CLOSEST within tolerance.
  let bestNode: { id: string; d: number } | null = null;
  for (const n of model.nodes) {
    const d = Math.hypot(px - sx(n.x), py - sy(n.y));
    if (d <= HIT_NODE_PX && (!bestNode || d < bestNode.d)) {
      bestNode = { id: n.id, d };
    }
  }
  if (bestNode) return { kind: 'node', id: bestNode.id };

  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));

  // A glyph hit (arrow shaft / band) beats members; a LABEL hit is held back
  // and only used if no member claims the point.
  let labelHit: Hit = null;
  if (opts.loads) {
    const load = hitLoads(model, px, py, sx, sy, nodeById, opts.system ?? 'si');
    if (load.glyph) return load.glyph;
    labelHit = load.label;
  }

  let bestMember: { id: string; d: number; t: number } | null = null;
  for (const m of model.members) {
    const a = nodeById.get(m.i);
    const b = nodeById.get(m.j);
    if (!a || !b) continue;
    const { d, t } = distPointSegment(px, py, sx(a.x), sy(a.y), sx(b.x), sy(b.y));
    if (d <= HIT_MEMBER_PX && (!bestMember || d < bestMember.d)) {
      bestMember = { id: m.id, d, t };
    }
  }
  if (bestMember) return { kind: 'member', id: bestMember.id, t: bestMember.t };
  return labelHit;
}

// ── Marquee (window / crossing) selection ────────────────────────────────────
//
// CAD convention: dragging left→right selects what the rectangle CONTAINS
// (window), dragging right→left selects what it TOUCHES (crossing). Nodes are
// points (contained = touched); members use both-ends-inside vs
// segment-intersects-rect; loads use their anchor point (node position, point
// along the member, or UDL extent midpoint) in both modes — the arrow bands
// are decoration, the anchor is what the user aims at.

/** Normalized screen-space rectangle: x0 ≤ x1, y0 ≤ y1. */
export interface SelectionRectPx {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Liang-Barsky: true when segment AB intersects (or lies inside) the rect. */
export function segmentIntersectsRect(
  ax: number, ay: number,
  bx: number, by: number,
  r: SelectionRectPx,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, ax - r.x0) && clip(dx, r.x1 - ax) &&
    clip(-dy, ay - r.y0) && clip(dy, r.y1 - ay) &&
    t0 <= t1
  );
}

/**
 * Everything the marquee rectangle selects. `crossing` switches members from
 * fully-contained (window) to touched-by-the-rect (crossing).
 */
export function selectInRect(
  model: Fem2DModel,
  rect: SelectionRectPx,
  sx: (x: number) => number,
  sy: (y: number) => number,
  crossing: boolean,
): SelectionSet2D {
  const inside = (x: number, y: number): boolean =>
    x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;

  const nodes = model.nodes.filter((n) => inside(sx(n.x), sy(n.y))).map((n) => n.id);

  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const members: string[] = [];
  for (const m of model.members) {
    const a = nodeById.get(m.i);
    const b = nodeById.get(m.j);
    if (!a || !b) continue;
    const ax = sx(a.x), ay = sy(a.y), bx = sx(b.x), by = sy(b.y);
    const hit = crossing
      ? segmentIntersectsRect(ax, ay, bx, by, rect)
      : inside(ax, ay) && inside(bx, by);
    if (hit) members.push(m.id);
  }

  const loads: string[] = [];
  for (const ld of model.loads) {
    if (ld.kind === 'node') {
      const n = nodeById.get(ld.node);
      if (n && inside(sx(n.x), sy(n.y))) loads.push(ld.id);
      continue;
    }
    const m = model.members.find((mm) => mm.id === ld.member);
    const a = m && nodeById.get(m.i);
    const b = m && nodeById.get(m.j);
    if (!a || !b) continue;
    const t = ld.kind === 'point-member' ? ld.pos : ((ld.from ?? 0) + (ld.to ?? 1)) / 2;
    const wx = a.x + (b.x - a.x) * t;
    const wy = a.y + (b.y - a.y) * t;
    if (inside(sx(wx), sy(wy))) loads.push(ld.id);
  }

  return { nodes, members, loads };
}

// ── Load hit-testing (geometry comes from loadGeometry — same as the glyphs) ──

/** Two tiers: `glyph` (arrow/band, beats members) and `label` (the number,
 *  weakest of all — see hitTest). Both null when no load is under the point. */
function hitLoads(
  model: Fem2DModel,
  px: number,
  py: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
  nodeById: Map<string, Fem2DModel['nodes'][number]>,
  system: UnitSystem,
): { glyph: Hit; label: Hit } {
  const stacks = computeLoadStacks(model);
  const counts = computeLoadStackCounts(model);
  let best: { id: string; d: number } | null = null;
  let bestLabel: { id: string; d: number } | null = null;
  const consider = (id: string, d: number, tol: number) => {
    // `<=` on ties: later loads draw on top, so the topmost one wins.
    if (d <= tol && (!best || d <= best.d)) best = { id, d };
  };

  for (const ld of model.loads) {
    const geom = loadGeometry({
      load: ld,
      model,
      sx,
      sy,
      system,
      stackIndex: stacks.get(ld.id) ?? 0,
      stackTotal: counts.get(ld.id) ?? 1,
      nodeById,
    });
    if (!geom) continue;   // draws nothing (zero magnitude) → captures nothing

    // Member axis clearance: the line itself stays a member/tool click.
    if (ld.kind !== 'node') {
      const m = model.members.find((mm) => mm.id === ld.member);
      const a = m && nodeById.get(m.i);
      const b = m && nodeById.get(m.j);
      if (!a || !b) continue;
      const dMember = distPointSegment(px, py, sx(a.x), sy(a.y), sx(b.x), sy(b.y)).d;
      if (dMember <= LOAD_MEMBER_CLEARANCE_PX) continue;
    }

    if (geom.kind === 'arrow') {
      consider(ld.id, distPointSegment(px, py, geom.tail.x, geom.tail.y, geom.head.x, geom.head.y).d, HIT_LOAD_PX);
    } else {
      // UDL: one strip test against the band's CENTRE line — covers the whole
      // band plus the tail rail with a single segment distance.
      const mid0 = { x: (geom.tail0.x + geom.tip0.x) / 2, y: (geom.tail0.y + geom.tip0.y) / 2 };
      const mid1 = { x: (geom.tail1.x + geom.tip1.x) / 2, y: (geom.tail1.y + geom.tip1.y) / 2 };
      consider(ld.id, distPointSegment(px, py, mid0.x, mid0.y, mid1.x, mid1.y).d, UDL_BAND_PX / 2 + HIT_LOAD_PX);
    }

    // The value label: clicking the number selects the load too. Ranked by
    // distance to the box centre so stacked labels resolve to the nearer one.
    if (hitsLoadLabel(geom, px, py)) {
      const d = Math.hypot(px - geom.label.x, py - (geom.label.y - 3.5));
      if (!bestLabel || d <= bestLabel.d) bestLabel = { id: ld.id, d };
    }
  }

  return {
    glyph: best ? { kind: 'load', id: (best as { id: string }).id } : null,
    label: bestLabel ? { kind: 'load', id: (bestLabel as { id: string }).id } : null,
  };
}
