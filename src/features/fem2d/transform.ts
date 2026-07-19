// FEM 2D — world ↔ screen transform (autofit, +y up).
//
// One shared helper for the read-only canvas and the editor: computes an
// aspect-preserving autofit of the node bounds into the viewport (minus
// insets) and exposes the inverse mapping (screen px → world m) that the
// editor needs for click-to-place and hit-testing. No pan/zoom by design
// (model caps 60 nodes / 120 members keep everything readable at autofit —
// same call the 1D made).
//
// Insets are asymmetric: the editor reserves left/bottom gutters for the X/Y
// dimension chains; the plain canvas passes a uniform margin.

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Transform2D {
  /** world x (m) → screen px */
  sx: (x: number) => number;
  /** world y (m) → screen px (flipped: +y up) */
  sy: (y: number) => number;
  /** px per metre */
  scale: number;
  /** screen px → world m */
  invert: (px: number, py: number) => { x: number; y: number };
}

export function uniformInsets(pad: number): Insets {
  return { left: pad, right: pad, top: pad, bottom: pad };
}

export function makeTransform(
  nodes: ReadonlyArray<{ x: number; y: number }>,
  width: number,
  height: number,
  insets: Insets,
): Transform2D {
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 10;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 3;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const availW = Math.max(40, width - insets.left - insets.right);
  const availH = Math.max(40, height - insets.top - insets.bottom);
  const scale = Math.min(availW / spanX, availH / spanY);

  const drawW = spanX * scale;
  const drawH = spanY * scale;
  // Centre the drawing inside the inset viewport (offY is implicit in `sy`:
  // it anchors from the bottom inset + centering gap).
  const offX = insets.left + (availW - drawW) / 2;

  const sx = (x: number) => offX + (x - minX) * scale;
  const sy = (y: number) => height - insets.bottom - (availH - drawH) / 2 - (y - minY) * scale;
  const invert = (px: number, py: number) => ({
    x: minX + (px - offX) / scale,
    y: minY + (height - insets.bottom - (availH - drawH) / 2 - py) / scale,
  });

  return { sx, sy, scale, invert };
}
