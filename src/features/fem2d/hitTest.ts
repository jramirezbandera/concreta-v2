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
// the arrows). Their clickable geometry mirrors canvasGlyphs exactly (same
// shared constants, same stack offsets). Priority: node > load > member, but
// clicks hugging a member's axis stay member clicks (the UDL arrowheads and
// the point-load tips touch the line — the line itself must stay selectable).
//
// Pure functions — testable without DOM.

import {
  POINT_ARROW_LEN,
  POINT_STACK_GAP,
  UDL_BAND_PX,
  computeLoadStacks,
} from './canvasTheme';
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

  if (opts.loads) {
    const load = hitLoads(model, px, py, sx, sy, nodeById);
    if (load) return load;
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
  return null;
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

// ── Load glyph hit-testing (geometry mirrors canvasGlyphs.LoadGlyph) ─────────

function hitLoads(
  model: Fem2DModel,
  px: number,
  py: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
  nodeById: Map<string, Fem2DModel['nodes'][number]>,
): Hit {
  const stacks = computeLoadStacks(model);
  let best: { id: string; d: number } | null = null;
  const consider = (id: string, d: number, tol: number) => {
    // `<=` on ties: later loads draw on top, so the topmost one wins.
    if (d <= tol && (!best || d <= best.d)) best = { id, d };
  };

  // World direction (unit) → screen direction (flip y). Null for zero vector
  // (a zero-magnitude load draws nothing and must not capture clicks).
  const toScreenDir = (wx: number, wy: number): { dx: number; dy: number } | null => {
    const mag = Math.hypot(wx, wy);
    if (mag < 1e-9) return null;
    return { dx: wx / mag, dy: -wy / mag };
  };

  for (const ld of model.loads) {
    const stackIndex = stacks.get(ld.id) ?? 0;

    if (ld.kind === 'node') {
      const n = nodeById.get(ld.node);
      const dir = toScreenDir(ld.Fx, ld.Fy);
      if (!n || !dir) continue;
      const hx = sx(n.x), hy = sy(n.y);
      const stackOff = stackIndex * (POINT_ARROW_LEN + POINT_STACK_GAP);
      const tailX = hx - dir.dx * (POINT_ARROW_LEN + stackOff);
      const tailY = hy - dir.dy * (POINT_ARROW_LEN + stackOff);
      consider(ld.id, distPointSegment(px, py, tailX, tailY, hx, hy).d, HIT_LOAD_PX);
      continue;
    }

    const m = model.members.find((mm) => mm.id === ld.member);
    if (!m) continue;
    const a = nodeById.get(m.i), b = nodeById.get(m.j);
    if (!a || !b) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ex = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const ey = { x: -ex.y, y: ex.x };
    const worldVec = (cx: number, cy: number, frame: 'global' | 'local') =>
      frame === 'global' ? { x: cx, y: cy } : { x: cx * ex.x + cy * ey.x, y: cx * ex.y + cy * ey.y };
    // Member axis clearance: the line itself stays a member/tool click.
    const dMember = distPointSegment(px, py, sx(a.x), sy(a.y), sx(b.x), sy(b.y)).d;
    if (dMember <= LOAD_MEMBER_CLEARANCE_PX) continue;

    if (ld.kind === 'point-member') {
      const w = worldVec(ld.Fx, ld.Fy, ld.frame);
      const dir = toScreenDir(w.x, w.y);
      if (!dir) continue;
      const hx = sx(a.x + ex.x * L * ld.pos), hy = sy(a.y + ex.y * L * ld.pos);
      const stackOff = stackIndex * (POINT_ARROW_LEN + POINT_STACK_GAP);
      const tailX = hx - dir.dx * (POINT_ARROW_LEN + stackOff);
      const tailY = hy - dir.dy * (POINT_ARROW_LEN + stackOff);
      consider(ld.id, distPointSegment(px, py, tailX, tailY, hx, hy).d, HIT_LOAD_PX);
      continue;
    }

    // UDL: one strip test against the band's CENTRE line — covers the interior
    // band plus the tail rail with a single segment distance.
    const w = worldVec(ld.wx, ld.wy, ld.frame);
    const dir = toScreenDir(w.x, w.y);
    if (!dir) continue;
    const from = ld.from ?? 0, to = ld.to ?? 1;
    const tipOff = stackIndex * UDL_BAND_PX;
    const midOff = tipOff + UDL_BAND_PX / 2;
    const p0 = { x: sx(a.x + ex.x * L * from), y: sy(a.y + ex.y * L * from) };
    const p1 = { x: sx(a.x + ex.x * L * to), y: sy(a.y + ex.y * L * to) };
    const d = distPointSegment(
      px, py,
      p0.x - dir.dx * midOff, p0.y - dir.dy * midOff,
      p1.x - dir.dx * midOff, p1.y - dir.dy * midOff,
    ).d;
    consider(ld.id, d, UDL_BAND_PX / 2 + HIT_LOAD_PX);
  }

  return best ? { kind: 'load', id: (best as { id: string }).id } : null;
}
