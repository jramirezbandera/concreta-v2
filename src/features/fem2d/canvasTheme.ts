// FEM 2D — shared canvas theme + pure drawing helpers.
//
// Single source for the read-only canvas (Fem2DCanvas: N/V/M + PDF clones) and
// the interactive editor canvas (Fem2DEditorCanvas) so the two can never drift
// visually — the PDF figure is the same picture the editor shows.

import { formatQuantity } from '../../lib/units/format';
import type { Quantity, UnitSystem } from '../../lib/units/types';
import type { MemberStatus } from './checks';
import type { Fem2DModel } from './types';

// Fit margin: reserved room for diagram bands + their labels around the model
// bounds. The SAME margin is used in every view so the model doesn't resize
// when switching tabs.
export const BASE_PAD = 26;           // base gap from the canvas edge
export const AMP_FRACTION = 0.12;     // diagram band peak as a fraction of min(width, height)
export const DIAGRAM_LABEL_PAD = 16;  // extra room past the band for its value label
export const ampFor = (width: number, height: number): number => AMP_FRACTION * Math.min(width, height);
export const fitMarginFor = (width: number, height: number): number =>
  BASE_PAD + ampFor(width, height) + DIAGRAM_LABEL_PAD;

// Verdict → stroke colour. Screen uses theme tokens; PDF uses fixed hex (the
// figure is rasterized to PNG by embedSvgAsImage, so full colour is Acrobat-safe
// and the verdict colouring survives into the document).
export const STATUS_COLOR: Record<MemberStatus, string> = {
  ok: 'var(--color-state-ok)',
  warn: 'var(--color-state-warn)',
  fail: 'var(--color-state-fail)',
  pending: 'var(--color-text-disabled)',
};
export const STATUS_COLOR_PDF: Record<MemberStatus, string> = {
  ok: '#16a34a',
  warn: '#d97706',
  fail: '#dc2626',
  pending: '#6b7280',
};

// Load-case → glyph/label colour. Screen reads theme tokens so the labels stay
// AA in BOTH themes (the old fixed hexes were the dark-theme palette and dropped
// to ~2:1 on the white light-mode canvas). The PDF raster path can't resolve
// var(), so it uses LC_COLOR_PDF — same split as STATUS_COLOR / STATUS_COLOR_PDF.
export const LC_COLOR: Record<string, string> = {
  G: 'var(--color-fem2d-g)', Q: 'var(--color-fem2d-q)', W: 'var(--color-fem2d-w)',
  S: 'var(--color-fem2d-s)', E: 'var(--color-fem2d-e)',
};
export const LC_COLOR_PDF: Record<string, string> = {
  G: '#475569', Q: '#0369a1', W: '#b45309', S: '#0e7490', E: '#6d28d9',
};

/** Load-case glyph/label colour: theme token on screen, fixed hex for the PDF. */
export function lcColorFor(lc: string, pdf: boolean): string {
  return (pdf ? LC_COLOR_PDF : LC_COLOR)[lc] ?? (pdf ? '#475569' : 'var(--color-fem2d-g)');
}

// N/V/M diagram band colour by SIGN (convención azul = positivo, rojo =
// negativo, como RFEM/midas): compresiones y tracciones de una cercha, o vano
// y apoyos de un dintel, se distinguen de un vistazo. Mismo split
// token-en-pantalla / hex-en-PDF que el resto de la paleta.
export const DIAG_POS = 'var(--color-fem2d-diag-pos)';
export const DIAG_NEG = 'var(--color-fem2d-diag-neg)';
export const DIAG_POS_PDF = '#2563eb';
export const DIAG_NEG_PDF = '#dc2626';

/** Diagram colour for a signed value (0 cuenta como positivo). */
export function diagColorFor(sign: number, pdf: boolean): string {
  return sign < 0 ? (pdf ? DIAG_NEG_PDF : DIAG_NEG) : (pdf ? DIAG_POS_PDF : DIAG_POS);
}

// Banda de material MADERA (barras timber): tono madera FIJO — a diferencia de
// la banda HA (que replica el color del veredicto), aquí el color identifica el
// material de un vistazo en un modelo mixto. Mismo split token/hex-PDF.
export const TIMBER_BAND = 'var(--color-fem2d-timber)';
export const TIMBER_BAND_PDF = '#a16207';

/** Colour of the material band for timber members. */
export function timberBandColor(pdf: boolean): string {
  return pdf ? TIMBER_BAND_PDF : TIMBER_BAND;
}

// Load glyph geometry (px). Shared by canvasGlyphs (drawing) and hitTest
// (clicking) so the clickable area always matches the drawn arrows.
export const POINT_ARROW_LEN = 26;  // point/node load arrow length
export const POINT_STACK_GAP = 6;   // extra gap per stack level (point loads)
export const UDL_BAND_PX = 16;      // UDL band depth per stack level

/** Internal field → display quantity (force in kN, moment in kN·m). */
export const FIELD_QUANTITY: Record<'N' | 'V' | 'M', Quantity> = {
  N: 'force',
  V: 'force',
  M: 'moment',
};

/** Member stroke colour by verdict (null = no checks yet). */
export function strokeFor(status: MemberStatus | null, pdf: boolean): string {
  return status
    ? (pdf ? STATUS_COLOR_PDF[status] : STATUS_COLOR[status])
    : (pdf ? '#334155' : 'var(--color-text-secondary)');
}

/** Compact value with unit: 0 decimals for |v| ≥ 100, else 1 (keeps labels short). */
export function fmtField(value: number, quantity: Quantity, system: UnitSystem): string {
  const precision = Math.abs(value) >= 100 ? 0 : 1;
  return formatQuantity(value, quantity, system, { precision });
}

/**
 * Indices of local extrema (sign changes in the first difference) whose
 * magnitude clears `threshold · globalMax`. Endpoints are included when large
 * (frame corners carry the peak moment exactly at the joint). Ported from the
 * 1D canvas so both modules label diagrams the same way.
 */
export function findLocalExtrema(arr: number[], globalMax: number, threshold = 0.14): number[] {
  if (arr.length < 2) return [];
  const out: number[] = [];
  const floor = threshold * globalMax;
  if (Math.abs(arr[0]) >= floor) out.push(0);
  for (let i = 1; i < arr.length - 1; i++) {
    const dPrev = arr[i] - arr[i - 1];
    const dNext = arr[i + 1] - arr[i];
    if (dPrev * dNext < 0 && Math.abs(arr[i]) >= floor) out.push(i);
  }
  if (Math.abs(arr[arr.length - 1]) >= floor) out.push(arr.length - 1);
  return out;
}

/** One maximal run of same-sign samples, endpoints ON the axis at crossings. */
export interface SignRun {
  sign: 1 | -1;
  /** Sampled points (x = envelope abscissa, v = field value). Crossings enter
   *  interpolated as v = 0, so consecutive runs share their frontier point. */
  pts: { x: number; v: number }[];
}

/**
 * Split an envelope polyline into maximal same-sign runs, interpolating the
 * zero crossing between samples of opposite sign so each run starts/ends ON
 * the member axis. Zero samples continue the current run; an all-zero series
 * yields no runs (nothing to paint). Powers the two-colour diagram bands.
 */
export function signRuns(xs: number[], vals: number[]): SignRun[] {
  const n = Math.min(xs.length, vals.length);
  const runs: SignRun[] = [];
  if (n === 0) return runs;
  // Near-zero noise (solver floats) must not spawn hairline runs.
  const EPS = 1e-9;
  const signOf = (v: number): 1 | -1 | 0 => (v > EPS ? 1 : v < -EPS ? -1 : 0);

  let pts: { x: number; v: number }[] = [{ x: xs[0], v: vals[0] }];
  let runSign: 1 | -1 | 0 = signOf(vals[0]);
  const close = () => {
    if (runSign !== 0 && pts.length >= 2) runs.push({ sign: runSign, pts });
  };
  for (let i = 1; i < n; i++) {
    const x = xs[i], v = vals[i], s = signOf(v);
    if (s !== 0 && runSign !== 0 && s !== runSign) {
      // Strict sign change → split at the interpolated zero. When the previous
      // sample already sits on the axis it IS the crossing (no duplicate).
      const last = pts[pts.length - 1];
      let xc = last.x;
      if (Math.abs(last.v) > EPS) {
        xc = last.x + (x - last.x) * (last.v / (last.v - v));
        pts.push({ x: xc, v: 0 });
      }
      close();
      pts = [{ x: xc, v: 0 }];
      runSign = s;
    } else if (runSign === 0 && s !== 0) {
      runSign = s; // leading zeros adopt the first real sign
    }
    pts.push({ x, v });
  }
  close();
  return runs;
}

export function indexOfMaxAbs(arr: number[]): number {
  let idx = 0, best = -1;
  for (let i = 0; i < arr.length; i++) {
    const a = Math.abs(arr[i]);
    if (a > best) { best = a; idx = i; }
  }
  return idx;
}

/** Stacking key for a load: everything on the same target (node / member)
 *  shares one stack so overlapping loads (g + q on one dintel) draw apart. */
export function loadStackKey(load: Fem2DModel['loads'][number]): string {
  return load.kind === 'node' ? `n:${load.node}` : `m:${load.member}`;
}

/** Stack index per load target so overlapping loads (g + q on one dintel) are
 *  drawn apart and both labels stay legible — mirrors the 1D canvas. */
export function computeLoadStacks(model: Fem2DModel): Map<string, number> {
  const stack = new Map<string, number>();
  const counter = new Map<string, number>();
  for (const ld of model.loads) {
    const key = loadStackKey(ld);
    const next = counter.get(key) ?? 0;
    stack.set(ld.id, next);
    counter.set(key, next + 1);
  }
  return stack;
}

/** How many loads share each target (id → count), so a UDL label can be pushed
 *  clear of the WHOLE stacked arrow band rather than just its own layer. */
export function computeLoadStackCounts(model: Fem2DModel): Map<string, number> {
  const perTarget = new Map<string, number>();
  for (const ld of model.loads) {
    const key = loadStackKey(ld);
    perTarget.set(key, (perTarget.get(key) ?? 0) + 1);
  }
  const byId = new Map<string, number>();
  for (const ld of model.loads) byId.set(ld.id, perTarget.get(loadStackKey(ld)) ?? 1);
  return byId;
}
