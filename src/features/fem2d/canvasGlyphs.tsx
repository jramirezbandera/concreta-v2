// FEM 2D — shared SVG glyphs (supports, loads, value labels, diagram layer).
//
// Consumed by BOTH canvases (read-only Fem2DCanvas incl. the PDF clones, and
// the interactive Fem2DEditorCanvas) — one source so they can never drift.
// Everything here is presentation-only: no handlers, no model mutations (the
// editor wraps these with its own hit-areas).

import type { JSX } from 'react';
import { formatQuantity } from '../../lib/units/format';
import type { UnitSystem } from '../../lib/units/types';
import type { Fem2DCheckBundle, Fem2DComboId } from './checks';
import {
  FIELD_QUANTITY,
  diagColorFor,
  lcColorFor,
  POINT_ARROW_LEN,
  POINT_STACK_GAP,
  UDL_BAND_PX,
  ampFor,
  findLocalExtrema,
  fmtField,
  indexOfMaxAbs,
  signRuns,
} from './canvasTheme';
import type { DeformedShape2D } from './deformed';
import type { Fem2DLoad, Fem2DModel } from './types';

// ── Value label (kept inside the SVG bounds so nothing clips) ─────────────────
//
// A monospace label with a background-coloured halo (paint-order: stroke) so it
// stays readable over members, diagram bands and the dot grid. The anchor point
// (x,y) is clamped into the viewport and the text-anchor flips near an edge, so
// a peak that lands at a frame corner reads fully instead of being cut off.

export function ValueLabel({
  x, y, text, color, width, height, pdf, size = 9, weight,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  width: number;
  height: number;
  pdf: boolean;
  size?: number;
  weight?: number;
}): JSX.Element {
  // Estimated half-width of the text; keeps the flip/clamp conservative so the
  // longest labels (e.g. "M=−123.4 kNm") still land inside.
  const anchor: 'start' | 'middle' | 'end' = x > width - 52 ? 'end' : x < 52 ? 'start' : 'middle';
  const cx = Math.max(6, Math.min(width - 6, x));
  const cy = Math.max(size + 4, Math.min(height - 4, y));
  return (
    <text
      x={cx} y={cy}
      textAnchor={anchor}
      fontFamily="ui-monospace, monospace"
      fontSize={size}
      fontWeight={weight}
      fill={color}
      stroke={pdf ? '#ffffff' : 'var(--color-bg-primary)'}
      strokeWidth={3}
      strokeLinejoin="round"
      style={{ paintOrder: 'stroke', pointerEvents: 'none' }}
    >
      {text}
    </text>
  );
}

// ── Support glyphs (drawn pointing down toward the ground) ────────────────────

export function SupportGlyph({ x, y, type, pdf }: { x: number; y: number; type: string; pdf: boolean }): JSX.Element {
  const c = pdf ? '#333' : 'var(--color-text-secondary)';
  const t = 9;
  const hatch = (
    <g stroke={c} strokeWidth={0.8}>
      {[-t, -t / 2, 0, t / 2].map((dx, k) => (
        <line key={k} x1={x + dx} y1={y + t + 5} x2={x + dx + 4} y2={y + t + 1} />
      ))}
    </g>
  );
  if (type === 'fixed') {
    // Ground line through the node + hatch below.
    return (
      <g>
        <line x1={x - t} y1={y} x2={x + t} y2={y} stroke={c} strokeWidth={1.4} />
        <g stroke={c} strokeWidth={0.8}>
          {[-t, -t / 2, 0, t / 2].map((dx, k) => (
            <line key={k} x1={x + dx} y1={y} x2={x + dx + 4} y2={y - 4} />
          ))}
        </g>
      </g>
    );
  }
  // pinned / roller: triangle with apex at the node.
  const tri = <polygon points={`${x},${y} ${x - t},${y + t} ${x + t},${y + t}`} fill="none" stroke={c} strokeWidth={1.2} />;
  if (type === 'roller') {
    return (
      <g>
        {tri}
        <line x1={x - t} y1={y + t + 3} x2={x + t} y2={y + t + 3} stroke={c} strokeWidth={1} />
        <circle cx={x - t / 2} cy={y + t + 1.5} r={1.4} fill="none" stroke={c} strokeWidth={0.8} />
        <circle cx={x + t / 2} cy={y + t + 1.5} r={1.4} fill="none" stroke={c} strokeWidth={0.8} />
      </g>
    );
  }
  return <g>{tri}{hatch}</g>;
}

// ── Hinge (rótula) markers ────────────────────────────────────────────────────
//
// Drafting convention: a released end shows a small hollow ring ON the member
// axis just off the node, so an articulated dintel reads as such at a glance.
// Painted GREEN (state-ok), a deliberate step off the neutral node dot so the
// two never read as the same mark. Beam-columns only — a biela is pin-ended by
// formulation, and stamping 2N rings on a truss would be pure noise (its thin
// stroke already signals it).

/** Hinge ring green: state-ok on screen, a darker green-600 for print contrast. */
const HINGE_COLOR_SCREEN = 'var(--color-state-ok)';
const HINGE_COLOR_PDF = '#16a34a';

export function ReleaseHingeGlyphs({ model, sx, sy, pdf }: {
  model: Fem2DModel;
  sx: (x: number) => number;
  sy: (y: number) => number;
  pdf: boolean;
}): JSX.Element | null {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const color = pdf ? HINGE_COLOR_PDF : HINGE_COLOR_SCREEN;
  const items: JSX.Element[] = [];
  for (const m of model.members) {
    if (m.elementType !== 'beam-column' || (!m.releases.i && !m.releases.j)) continue;
    const a = nodeById.get(m.i);
    const b = nodeById.get(m.j);
    if (!a || !b) continue;
    const ax = sx(a.x), ay = sy(a.y), bx = sx(b.x), by = sy(b.y);
    const L = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    // Clear of the node dot and any support glyph, still visually THIS bar's
    // end (two hinges at one joint sit on their own axes and never merge).
    const off = Math.min(11, L * 0.25);
    // Hollow green ring, slightly larger + heavier than the neutral node dot
    // (r 2.6–2.8) so the hinge is unmistakable at a glance.
    const hinge = (x: number, y: number, key: string) => (
      <circle
        key={key}
        cx={x} cy={y} r={3.6}
        fill={pdf ? '#ffffff' : 'var(--color-bg-primary)'}
        stroke={color}
        strokeWidth={1.7}
      />
    );
    if (m.releases.i) items.push(hinge(ax + ux * off, ay + uy * off, `${m.id}:i`));
    if (m.releases.j) items.push(hinge(bx - ux * off, by - uy * off, `${m.id}:j`));
  }
  if (items.length === 0) return null;
  return <g style={{ pointerEvents: 'none' }}>{items}</g>;
}

// ── Arrow ─────────────────────────────────────────────────────────────────────

export function Arrow({ x1, y1, x2, y2, color, width, head = 4 }: {
  x1: number; y1: number; x2: number; y2: number; color: string; width: number; head?: number;
}): JSX.Element {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const h = head;
  const p1 = { x: x2 - h * Math.cos(ang - Math.PI / 6), y: y2 - h * Math.sin(ang - Math.PI / 6) };
  const p2 = { x: x2 - h * Math.cos(ang + Math.PI / 6), y: y2 - h * Math.sin(ang + Math.PI / 6) };
  return (
    <g stroke={color} fill={color}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={width} />
      {h > 0 && <polygon points={`${x2},${y2} ${p1.x},${p1.y} ${p2.x},${p2.y}`} strokeWidth={0} />}
    </g>
  );
}

// ── Load glyphs ───────────────────────────────────────────────────────────────

export function LoadGlyph({
  load, model, sx, sy, width, height, pdf, system, stackIndex, stackTotal = 1, selected = false,
}: {
  load: Fem2DLoad;
  model: Fem2DModel;
  sx: (x: number) => number;
  sy: (y: number) => number;
  width: number;
  height: number;
  pdf: boolean;
  system: UnitSystem;
  stackIndex: number;
  /** How many loads share this target — used to clear the label past the
   *  whole stacked band (g + q on one member) rather than just this layer. */
  stackTotal?: number;
  /** Editor: paint in accent instead of the LC colour. */
  selected?: boolean;
}): JSX.Element | null {
  const color = selected ? 'var(--color-accent)' : lcColorFor(load.lc, pdf);
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));

  // World load direction (unit) → screen direction (flip y). Returns null for a
  // zero vector.
  const toScreenDir = (wx: number, wy: number): { dx: number; dy: number } | null => {
    const mag = Math.hypot(wx, wy);
    if (mag < 1e-9) return null;
    return { dx: wx / mag, dy: -wy / mag };
  };

  if (load.kind === 'node') {
    const n = nodeById.get(load.node);
    if (!n) return null;
    const mag = Math.hypot(load.Fx, load.Fy);
    const dir = toScreenDir(load.Fx, load.Fy);
    if (!dir) return null;
    const hx = sx(n.x), hy = sy(n.y);
    const len = POINT_ARROW_LEN;
    const stackOff = stackIndex * (len + POINT_STACK_GAP);
    const tailX = hx - dir.dx * (len + stackOff);
    const tailY = hy - dir.dy * (len + stackOff);
    return (
      <g>
        <Arrow x1={tailX} y1={tailY} x2={hx} y2={hy} color={color} width={1.4} />
        <ValueLabel
          x={tailX - dir.dx * 4} y={tailY - dir.dy * 4 - 2}
          text={formatQuantity(mag, 'force', system)}
          color={color} width={width} height={height} pdf={pdf}
        />
      </g>
    );
  }

  // Member UDL / point load: resolve member geometry + local axes.
  const m = model.members.find((mm) => mm.id === load.member);
  if (!m) return null;
  const a = nodeById.get(m.i), b = nodeById.get(m.j);
  if (!a || !b) return null;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ex = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };     // member dir
  const ey = { x: -ex.y, y: ex.x };                          // local +y

  // Resolve the load's world components (frame 'local' → world via ex/ey).
  const worldVec = (cx: number, cy: number, frame: 'global' | 'local') =>
    frame === 'global' ? { x: cx, y: cy } : { x: cx * ex.x + cy * ey.x, y: cx * ex.y + cy * ey.y };

  if (load.kind === 'point-member') {
    const w = worldVec(load.Fx, load.Fy, load.frame);
    const mag = Math.hypot(w.x, w.y);
    const dir = toScreenDir(w.x, w.y);
    if (!dir) return null;
    const px = a.x + ex.x * L * load.pos, py = a.y + ex.y * L * load.pos;
    const hx = sx(px), hy = sy(py);
    const len = POINT_ARROW_LEN;
    const stackOff = stackIndex * (len + POINT_STACK_GAP);
    const tailX = hx - dir.dx * (len + stackOff);
    const tailY = hy - dir.dy * (len + stackOff);
    return (
      <g>
        <Arrow x1={tailX} y1={tailY} x2={hx} y2={hy} color={color} width={1.4} />
        <ValueLabel
          x={tailX - dir.dx * 4} y={tailY - dir.dy * 4 - 2}
          text={formatQuantity(mag, 'force', system)}
          color={color} width={width} height={height} pdf={pdf}
        />
      </g>
    );
  }

  // UDL band: arrows along the member, arrowheads on the member line. Stacked
  // outward by stackIndex so multiple UDLs on one member don't overlap.
  const w = worldVec(load.wx, load.wy, load.frame);
  const mag = Math.hypot(load.wx, load.wy);
  const dir = toScreenDir(w.x, w.y);
  if (!dir) return null;
  const from = load.from ?? 0, to = load.to ?? 1;
  const band = UDL_BAND_PX;
  const tipOff = stackIndex * band;         // arrowhead offset from the member
  const topOff = tipOff + band;             // tail offset from the member
  const p0m = { x: sx(a.x + ex.x * L * from), y: sy(a.y + ex.y * L * from) };
  const p1m = { x: sx(a.x + ex.x * L * to), y: sy(a.y + ex.y * L * to) };
  const lenPx = Math.hypot(p1m.x - p0m.x, p1m.y - p0m.y);
  const nArr = Math.max(2, Math.round(lenPx / 26));
  const arrows: JSX.Element[] = [];
  for (let i = 0; i <= nArr; i++) {
    const t = i / nArr;
    const hx = p0m.x + (p1m.x - p0m.x) * t, hy = p0m.y + (p1m.y - p0m.y) * t;
    arrows.push(
      <Arrow
        key={i}
        x1={hx - dir.dx * topOff} y1={hy - dir.dy * topOff}
        x2={hx - dir.dx * tipOff} y2={hy - dir.dy * tipOff}
        color={color} width={0.9} head={stackIndex === 0 ? 3 : 0}
      />,
    );
  }
  const midX = (p0m.x + p1m.x) / 2, midY = (p0m.y + p1m.y) / 2;
  // Push EVERY label clear of the WHOLE stacked band, then split per layer. The
  // old per-layer offset (topOff+…) dropped the inner load's label INTO the
  // outer load's arrow band (g's "15 kN/m" landed on q's arrows). Anchoring on
  // stackTotal·band lifts the group above all bands; the ·15 keeps the two
  // haloed numbers legibly apart. Single UDL (total 1) is unchanged at 24 px.
  const labelOff = stackTotal * band + 8 + stackIndex * 15;
  // On a steep member (a column) the perpendicular label lands exactly where the
  // Y dimension chain's "3.20 m" text sits — both hug the member midpoint on the
  // outer side. Slide the label a fifth of the member length toward j so it
  // clears the cota (horizontal loads on edge columns, mostly). Beams (flat on
  // screen) keep the centred label.
  const segDx = p1m.x - p0m.x, segDy = p1m.y - p0m.y;
  const segLen = Math.hypot(segDx, segDy) || 1;
  const steep = Math.abs(segDy) > Math.abs(segDx);
  const along = steep ? Math.min(30, segLen * 0.22) : 0;
  const labelX = midX - dir.dx * labelOff + (segDx / segLen) * along;
  const labelY = midY - dir.dy * labelOff + (segDy / segLen) * along - 2;
  return (
    <g>
      <line
        x1={p0m.x - dir.dx * topOff} y1={p0m.y - dir.dy * topOff}
        x2={p1m.x - dir.dx * topOff} y2={p1m.y - dir.dy * topOff}
        stroke={color} strokeWidth={1} opacity={0.8}
      />
      {arrows}
      <ValueLabel
        x={labelX} y={labelY}
        text={formatQuantity(mag, 'linearLoad', system)}
        color={color} width={width} height={height} pdf={pdf}
      />
    </g>
  );
}

// ── Diagram layer (N / V / M envelopes) ───────────────────────────────────────

export function DiagramLayer({
  model, checks, field, sx, sy, width, height, pdf, system, combo = 'ELU',
}: {
  model: Fem2DModel;
  checks: Fem2DCheckBundle;
  field: 'N' | 'V' | 'M';
  sx: (x: number) => number;
  sy: (y: number) => number;
  width: number;
  height: number;
  pdf: boolean;
  system: UnitSystem;
  /** Combination group to plot. Default ELU (PDF clones pass nothing). */
  combo?: Fem2DComboId;
}): JSX.Element {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const quantity = FIELD_QUANTITY[field];

  // Sign convention for the MOMENT diagram (user preference, matches FEM 1D):
  // sagging (M > 0, mid-span) is drawn on the −y_local side (below a beam) and
  // hogging (M < 0, over supports) on the +y_local side (above). N and V keep
  // the natural local-+y offset.
  const offsetSign = field === 'M' ? -1 : 1;

  // Global peak for this field across all members → common amplitude scale.
  let globalMax = 0;
  for (const m of model.members) {
    const env = checks.envelopes[m.id]?.[combo];
    if (!env) continue;
    for (const v of env[field]) globalMax = Math.max(globalMax, Math.abs(v));
  }
  const ampPx = ampFor(width, height);
  const k = globalMax > 1e-9 ? (ampPx / globalMax) * offsetSign : 0;
  const labelFloor = 0.14 * globalMax; // hide near-zero noise

  const shapes: JSX.Element[] = [];
  // Candidate labels collected first, then de-duplicated + de-collided (below):
  // two members meeting at a joint (portal corner, gable eave/ridge) share the
  // same peak at the same point, and a dense truss packs many distinct peaks
  // into a small area. Each carries its outward nudge direction (nx, ny) and a
  // priority (|value|) so the placement pass can spread the crowd, biggest
  // forces first.
  const candidates: {
    ox: number; oy: number; lx: number; ly: number;
    nx: number; ny: number; pri: number; text: string; key: string; color: string;
  }[] = [];

  for (const m of model.members) {
    const env = checks.envelopes[m.id]?.[combo];
    const a = nodeById.get(m.i), b = nodeById.get(m.j);
    if (!env || !a || !b || env.xs.length < 2) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ex = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const ey = { x: -ex.y, y: ex.x };              // local +y (world)
    // Screen offset direction from local +y (flip y).
    const oScreen = { x: ey.x, y: -ey.y };
    const total = env.xs[env.xs.length - 1] || L;
    const vals = env[field];

    // Point at fractional distance s∈[0,1] along the member, offset by `val·k`.
    const at = (s: number, val: number) => {
      const wx = a.x + ex.x * L * s, wy = a.y + ex.y * L * s;
      const bx = sx(wx), by = sy(wy);
      return { bx, by, ox: bx + oScreen.x * val * k, oy: by + oScreen.y * val * k };
    };

    // One filled band + outline PER same-sign run, coloured by sign (blue +,
    // red −). Crossings enter interpolated at v = 0 (signRuns), so adjacent
    // runs meet exactly ON the member axis and the band never jumps colour
    // mid-air. An all-zero member paints nothing (no runs).
    signRuns(env.xs, vals).forEach((run, ri) => {
      const rc = diagColorFor(run.sign, pdf);
      const base: string[] = [];
      const off: string[] = [];
      for (const q of run.pts) {
        const p = at(q.x / total, q.v);
        base.push(`${p.bx},${p.by}`);
        off.push(`${p.ox},${p.oy}`);
      }
      const poly = [...base, ...off.slice().reverse()].join(' ');
      shapes.push(<polygon key={`f${m.id}:${ri}`} points={poly} fill={rc} fillOpacity={pdf ? 0.15 : 0.14} stroke="none" />);
      shapes.push(<polyline key={`o${m.id}:${ri}`} points={off.join(' ')} fill="none" stroke={rc} strokeWidth={1.2} strokeOpacity={0.9} />);
    });

    // ── Per-member value labels ──────────────────────────────────────────
    const memberMax = Math.max(...vals.map(Math.abs));
    if (memberMax < labelFloor) continue; // nothing worth labelling on this member

    // Constant-force members (axial N, two-force webs) → a single mid label;
    // members whose field varies → one label per local extremum.
    const spread = Math.max(...vals) - Math.min(...vals);
    const idxs =
      m.elementType === 'two-force' || spread < 0.02 * globalMax
        ? [indexOfMaxAbs(vals)]
        : findLocalExtrema(vals, globalMax, 0.14);

    for (const idx of idxs) {
      const val = vals[idx];
      const s = env.xs[idx] / total;
      const p = at(s, val);
      // Nudge the label a touch further out than the outline so it clears the
      // band. Direction follows the signed offset (`k` carries offsetSign), so
      // for M the hogging label sits above and the sagging label below.
      const dir = Math.sign(val * k) || 1;
      const nx = oScreen.x * dir, ny = oScreen.y * dir; // unit outward (away from band)
      const lx = p.ox + nx * 5;
      const ly = p.oy + ny * 5 - 2;
      const text = `${field}=${fmtField(val, quantity, system)}`;
      candidates.push({
        ox: p.ox, oy: p.oy, lx, ly, nx, ny, pri: Math.abs(val), text,
        key: `${text}@${Math.round(p.ox / 12)},${Math.round(p.oy / 12)}`,
        color: diagColorFor(Math.sign(val), pdf),
      });
    }
  }

  // De-dup coincident identical labels (shared joints), then place greedily to
  // stop numbers piling up on a dense diagram: biggest forces first (they carry
  // the design), each nudged outward in text-line steps until it clears every
  // label already placed. One that can't find a gap within a few steps is
  // dropped — the value is still in the results table, and a legible diagram
  // beats an unreadable stack of overlapping digits.
  const seen = new Set<string>();
  const unique = candidates.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
  unique.sort((p, q) => q.pri - p.pri);

  const placed: { x: number; y: number; hw: number; hh: number }[] = [];
  const labels: JSX.Element[] = [];
  for (const c of unique) {
    const hw = 4 + c.text.length * 2.7; // half-width from monospace char count
    const hh = 7;                        // half-height (9 px text + halo)
    let lx = c.lx, ly = c.ly, ok = false;
    for (let step = 0; step <= 4; step++) {
      const tx = c.lx + c.nx * step * 12;
      const ty = c.ly + c.ny * step * 12;
      const hit = placed.some((r) => Math.abs(r.x - tx) < r.hw + hw && Math.abs(r.y - ty) < r.hh + hh);
      if (!hit) { lx = tx; ly = ty; ok = true; break; }
    }
    if (!ok) continue; // no clear spot found — drop rather than overlap
    placed.push({ x: lx, y: ly, hw, hh });
    labels.push(
      <g key={`l${c.key}`}>
        <circle cx={c.ox} cy={c.oy} r={2.2} fill={c.color} />
        <ValueLabel
          x={lx} y={ly}
          text={c.text}
          color={c.color} width={width} height={height} pdf={pdf}
        />
      </g>,
    );
  }

  // ── Sign legend (top-right) ──────────────────────────────────────────────
  // Names the colour convention in-figure (also lands in the PDF clone). N
  // spells out what the sign MEANS on a truss; V/M keep the generic words.
  const legendItems = field === 'N'
    ? [
        { c: diagColorFor(1, pdf), t: '+ tracción' },
        { c: diagColorFor(-1, pdf), t: '− compresión' },
      ]
    : [
        { c: diagColorFor(1, pdf), t: '+ positivo' },
        { c: diagColorFor(-1, pdf), t: '− negativo' },
      ];
  const legendW = Math.max(...legendItems.map((it) => it.t.length)) * 5.2 + 18;
  const legendX = width - legendW - 6;
  const legend = (
    <g style={{ pointerEvents: 'none' }}>
      {legendItems.map((it, i) => (
        <g key={it.t}>
          <rect
            x={legendX} y={8 + i * 13} width={9} height={9} rx={2}
            fill={it.c} fillOpacity={pdf ? 0.2 : 0.18} stroke={it.c} strokeWidth={1}
          />
          <text
            x={legendX + 13} y={16 + i * 13}
            fontFamily="ui-monospace, monospace"
            fontSize={9}
            fill={it.c}
            stroke={pdf ? '#ffffff' : 'var(--color-bg-primary)'}
            strokeWidth={3}
            strokeLinejoin="round"
            style={{ paintOrder: 'stroke' }}
          >
            {it.t}
          </text>
        </g>
      ))}
    </g>
  );

  return (
    <g>
      {shapes}
      {labels}
      {legend}
    </g>
  );
}

// ── Deformed shape layer (δ view) ─────────────────────────────────────────────
//
// Draws the coherent deformed geometry computed by deformed.ts: one accent
// polyline per member (base + amplified displacement), over the undeformed
// members the canvas already painted. The amplification maps the peak
// displacement to the shared diagram band amplitude (ampFor), so a tiny δ is
// still visible and a huge one stays inside the frame; the real δmax and the
// visual ×N factor are labelled at the peak.

export function DeformedLayer({
  shape, sx, sy, width, height, pdf,
}: {
  shape: DeformedShape2D;
  sx: (x: number) => number;
  sy: (y: number) => number;
  width: number;
  height: number;
  pdf: boolean;
}): JSX.Element | null {
  const color = pdf ? '#2563eb' : 'var(--color-accent)';
  if (shape.peak < 1e-9 || shape.members.length === 0) {
    return (
      <ValueLabel
        x={width / 2} y={18}
        text="δ ≈ 0 (sin desplazamientos apreciables)"
        color={color} width={width} height={height} pdf={pdf}
      />
    );
  }

  const kPx = ampFor(width, height) / shape.peak; // px per metre of displacement
  const lines = shape.members.map((m) => {
    const pts = m.base
      .map((p, i) => `${sx(p.x) + m.disp[i].dx * kPx},${sy(p.y) - m.disp[i].dy * kPx}`)
      .join(' ');
    return (
      <polyline
        key={m.memberId}
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeOpacity={0.95}
        strokeLinecap="round"
      />
    );
  });

  // Visual amplification ×N = (px per metre of displacement) / (px per metre
  // of geometry) — uniform transform, so any world axis gives the scale.
  const pxPerM = Math.abs(sx(1) - sx(0));
  const amp = pxPerM > 1e-9 ? kPx / pxPerM : 0;

  // ── Value labels: δmax + (δx, δy) at every node + mid-span of every vano ──
  // Candidates in priority order (δmax > nodes > mid-spans) filtered by a
  // greedy box-collision pass, so labels never pile on top of each other
  // (the diagram views' standing overlap problem is NOT repeated here).
  const fmtMm = (v: number): string => {
    const s = (v * 1000).toFixed(1);
    return s === '-0.0' ? '0.0' : s;
  };
  const dPx = (p: { x: number; y: number; dx: number; dy: number }) => ({
    x: sx(p.x) + p.dx * kPx,
    y: sy(p.y) - p.dy * kPx,
  });
  // Skip ≈0 points (supports): invisible at this amplification, pure noise.
  const floor = Math.max(0.02 * shape.peak, 5e-5);

  const candidates: { x: number; y: number; ly: number; text: string }[] = [];
  if (shape.peakAt) {
    const p = dPx(shape.peakAt);
    candidates.push({
      x: p.x, y: p.y, ly: p.y - 8,
      text: `δmax = (${fmtMm(shape.peakAt.dx)}, ${fmtMm(shape.peakAt.dy)}) mm (×${Math.max(1, Math.round(amp))})`,
    });
  }
  for (const n of shape.nodes) {
    if (Math.hypot(n.dx, n.dy) < floor) continue;
    const p = dPx(n);
    candidates.push({ x: p.x, y: p.y, ly: p.y - 7, text: `(${fmtMm(n.dx)}, ${fmtMm(n.dy)}) mm` });
  }
  for (const m of shape.members) {
    if (!m.mid || Math.hypot(m.mid.dx, m.mid.dy) < floor) continue;
    const p = dPx(m.mid);
    candidates.push({ x: p.x, y: p.y, ly: p.y - 7, text: `(${fmtMm(m.mid.dx)}, ${fmtMm(m.mid.dy)}) mm` });
  }
  const accepted: typeof candidates = [];
  for (const c of candidates) {
    // Length-aware box test (~7 px/char monospace, 13 px line height): two
    // middle-anchored labels clash when their half-widths overlap.
    const clash = accepted.some(
      (a) => Math.abs(a.x - c.x) < 3.5 * (a.text.length + c.text.length) + 4 && Math.abs(a.y - c.y) < 13,
    );
    if (!clash) accepted.push(c);
  }
  const labels = accepted.map((c, i) => (
    <g key={i}>
      <circle cx={c.x} cy={c.y} r={2} fill={color} />
      <ValueLabel
        x={c.x} y={c.ly}
        text={c.text}
        color={color} width={width} height={height} pdf={pdf}
      />
    </g>
  ));

  return (
    <g>
      {lines}
      {labels}
    </g>
  );
}
