// Truncated cross control perimeter — V2.next spike (borde / esquina).
//
// THE SAFETY FIX (eng-review 2026-06-07, Codex): the punching control perimeter
// is the outline of the loaded cross dilated by 2d, but it MUST be cut where the
// concrete ends (the free edge of a zapata). The previous closed form only
// dropped an arm and scaled the arc by a fixed fraction — it did NOT truncate the
// 2d offset of the remaining arms/plate at the free edge, so it could overstate
// u1/uTip and understate vEd (unsafe).
//
// Instead of a hand-derived closed form (error-prone — that is what failed), this
// computes the perimeter ROBUSTLY by sampling the boundary of the union of
// rounded rectangles (Minkowski sum distributes over union, so the 2d dilation of
// the cross = union of each part dilated by 2d). A boundary point counts toward
// the perimeter only if it is (a) inside the concrete (all free-edge half-planes)
// and (b) not strictly inside any OTHER dilated part. The free-edge chord is never
// a part boundary, so it is naturally excluded (a free edge is not a control
// section). Arcs are sampled along their true length.
//
// Conservatism: with fine sampling the error is sub-0.5% (validated against the
// exact rounded-rectangle perimeter 2(w+h)+2πr). Sampling is unbiased, not a
// guaranteed lower bound, so callers keep EC2's own safety factors; the geometric
// error is far below them and documented.
//
// Units: mm. NOT wired to calcCruceta/UI yet — spike validated in isolation first
// (design doc Open Q#4: "spike aislado con tests antes de tocar UI").

export interface Rect { x0: number; y0: number; x1: number; y1: number; }

/** Concrete exists where nx·x + ny·y ≥ c. (A free edge is the boundary line.) */
export interface HalfPlane { nx: number; ny: number; c: number; }

interface Sample { x: number; y: number; ds: number; }

const TWO_PI = 2 * Math.PI;

/** Distance from point to an axis-aligned rect (0 if inside). */
function distToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x0 - px, 0, px - r.x1);
  const dy = Math.max(r.y0 - py, 0, py - r.y1);
  return Math.hypot(dx, dy);
}

/** Sample the boundary of `rect` dilated by `r` (rounded rectangle): 4 offset
 *  straight edges + 4 quarter arcs. `step` ≈ target spacing (mm). */
function sampleRoundedRect(rect: Rect, r: number, step: number, out: Sample[]): void {
  const { x0, y0, x1, y1 } = rect;
  const pushSeg = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-9) return;
    const n = Math.max(1, Math.round(len / step));
    const ds = len / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, ds });
    }
  };
  // Straight offset edges (only present when r ≥ 0; r=0 gives the bare rect edges).
  pushSeg(x0, y0 - r, x1, y0 - r); // bottom
  pushSeg(x1 + r, y0, x1 + r, y1); // right
  pushSeg(x1, y1 + r, x0, y1 + r); // top
  pushSeg(x0 - r, y1, x0 - r, y0); // left
  if (r > 1e-9) {
    // Quarter arcs at the 4 corners (center = rect corner, radius r).
    const arc = (cx: number, cy: number, a0: number) => {
      const arcLen = (Math.PI / 2) * r;
      const n = Math.max(1, Math.round(arcLen / step));
      const ds = arcLen / n;
      for (let i = 0; i < n; i++) {
        const a = a0 + ((i + 0.5) / n) * (Math.PI / 2);
        out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), ds });
      }
    };
    arc(x1, y0, -Math.PI / 2); // bottom-right: from −90° to 0°
    arc(x1, y1, 0);            // top-right:    0° to 90°
    arc(x0, y1, Math.PI / 2);  // top-left:     90° to 180°
    arc(x0, y0, Math.PI);      // bottom-left:  180° to 270°
  }
}

/**
 * Perimeter of ∂(⋃ dilate(rect_i, r)) within all concrete half-planes.
 * A sampled boundary point of part i counts iff it lies in the concrete AND is
 * strictly outside every OTHER dilated part (distToRect_j > r). `clips` empty =
 * interior (no truncation). `step` is the sampling spacing in mm.
 */
export function unionOffsetPerimeter(
  rects: Rect[], r: number, clips: HalfPlane[] = [], step = 1.5,
): number {
  // STRICT interior: a perimeter segment lying ON a free edge is not a control
  // section (same reason the free-edge chord is excluded). Points within tol of a
  // clip line are dropped; this also excludes a plate face flush with the edge.
  const inConcrete = (x: number, y: number) =>
    clips.every((h) => h.nx * x + h.ny * y > h.c + 1e-6);
  let perim = 0;
  const buf: Sample[] = [];
  for (let i = 0; i < rects.length; i++) {
    buf.length = 0;
    sampleRoundedRect(rects[i], r, step, buf);
    for (const s of buf) {
      if (!inConcrete(s.x, s.y)) continue;
      let onUnionBoundary = true;
      for (let j = 0; j < rects.length; j++) {
        if (j === i) continue;
        const dj = distToRect(s.x, s.y, rects[j]);
        if (dj < r - 1e-3) { onUnionBoundary = false; break; }        // strictly inside j
        // Coincident boundary (collinear shared edge): both i and j would count
        // it. Tie-break by index so it is counted exactly once (lower index wins).
        if (dj <= r + 1e-3 && j < i) { onUnionBoundary = false; break; }
      }
      if (onUnionBoundary) perim += s.ds;
    }
  }
  return perim;
}

// ─── Cross geometry → loaded rects + free-edge clips ──────────────────────────
export type CrossPosition = 'interior' | 'borde' | 'esquina';

export interface CrossGeom {
  plateA: number;   // mm — plate dim parallel to the free edge (x)
  plateB: number;   // mm — plate dim perpendicular to the free edge (y, toward interior)
  bEff:   number;   // mm — effective arm contact width
  Leff:   number;   // mm — effective arm length
  position: CrossPosition;
  /** Clear distance plate face → free edge (mm). borde: edge below −y. esquina:
   *  edgeY below −y AND edgeX to the left of −x. Ignored for interior. */
  edgeY?: number;
  edgeX?: number;
}

/** Build the loaded rectangles (plate + present arms) and the free-edge clips.
 *  A free edge drops the arm pointing at it (decision A, 2026-06-07). */
export function buildCross(g: CrossGeom): { rects: Rect[]; clips: HalfPlane[]; nArms: number } {
  const { plateA: A, plateB: B, bEff: w, Leff: L, position } = g;
  const plate: Rect = { x0: -A / 2, y0: -B / 2, x1: A / 2, y1: B / 2 };
  const armPX: Rect = { x0: A / 2, y0: -w / 2, x1: A / 2 + L, y1: w / 2 };          // +x
  const armNX: Rect = { x0: -A / 2 - L, y0: -w / 2, x1: -A / 2, y1: w / 2 };        // −x
  const armPY: Rect = { x0: -w / 2, y0: B / 2, x1: w / 2, y1: B / 2 + L };          // +y
  const armNY: Rect = { x0: -w / 2, y0: -B / 2 - L, x1: w / 2, y1: -B / 2 };        // −y

  const clips: HalfPlane[] = [];
  let arms: Rect[];
  if (position === 'interior') {
    arms = [armPX, armNX, armPY, armNY];
  } else if (position === 'borde') {
    arms = [armPX, armNX, armPY];                       // drop −y (toward free edge)
    clips.push({ nx: 0, ny: 1, c: -B / 2 - (g.edgeY ?? 0) });   // concrete: y ≥ yE
  } else {
    arms = [armPX, armPY];                              // drop −y and −x
    clips.push({ nx: 0, ny: 1, c: -B / 2 - (g.edgeY ?? 0) });   // y ≥ yE (bottom edge)
    clips.push({ nx: 1, ny: 0, c: -A / 2 - (g.edgeX ?? 0) });   // x ≥ xE (left edge)
  }
  return { rects: [plate, ...arms], clips, nArms: arms.length };
}

export interface CrossPerims {
  u0: number; u1: number; uCore: number; uTip: number; Acruz: number; nArms: number;
}

/** Truncated control perimeters for a cross at `r = 2d`. */
export function crossPerimetersClipped(g: CrossGeom, d: number, step = 1.5): CrossPerims {
  const r = 2 * d;
  const { rects, clips, nArms } = buildCross(g);
  const plate = rects[0];
  const arms = rects.slice(1);

  const u1 = unionOffsetPerimeter(rects, r, clips, step);
  const uCore = unionOffsetPerimeter([plate], r, clips, step);   // bare plate at 2d
  const u0 = unionOffsetPerimeter([plate], 0, clips, step);      // plate face (no offset)
  // uTip: the most-truncated single remaining arm governs (shortest → highest vEd).
  let uTip = Infinity;
  for (const a of arms) uTip = Math.min(uTip, unionOffsetPerimeter([a], r, clips, step));
  if (!Number.isFinite(uTip)) uTip = 0;

  const { plateA: A, plateB: B, bEff: w, Leff: L } = g;
  const Acruz = A * B + nArms * w * L;   // remaining arms only; all within concrete
  return { u0, u1, uCore, uTip, Acruz, nArms };
}

/** Exact rounded-rectangle perimeter 2(w+h) + 2πr — used to validate the sampler. */
export function roundedRectPerimeter(width: number, height: number, r: number): number {
  return 2 * (width + height) + TWO_PI * r;
}
