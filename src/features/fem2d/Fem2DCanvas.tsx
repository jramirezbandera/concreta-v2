// FEM 2D — read-only 2D canvas (N/V/M/δ views + all PDF clones).
//
// Genuine 2D rendering (unlike the 1D strip): world +y is UP, members run at
// arbitrary angles. Three view families driven by the `view` prop:
//   'model'      → geometry + supports + loads (the PDF clone of the model
//                  figure; on screen the interactive Fem2DEditorCanvas renders
//                  this view instead).
//   'N'|'V'|'M'  → the envelope diagram for that field and the selected
//                  combination group (`combo`, default ELU — the PDF clones
//                  pass nothing and stay on ELU), plotted perpendicular to
//                  each member from checks.envelopes.
//   'def'        → deformed shape of the governing combination of the selected
//                  group (needs `elements` — the raw solver samples).
//
// All glyphs and the diagram layer live in canvasGlyphs/canvasTheme — shared
// with the editor canvas so the PDF figure can never drift from what the
// editor shows.

import { useMemo, type JSX } from 'react';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { Fem2DCheckBundle, Fem2DComboId } from './checks';
import { computeLoadStackCounts, computeLoadStacks, fitMarginFor, strokeFor, timberBandColor } from './canvasTheme';
import { DeformedLayer, DiagramLayer, LoadGlyph, ReleaseHingeGlyphs, SupportGlyph } from './canvasGlyphs';
import { computeDeformedShape } from './deformed';
import type { Solver2DElementResult } from './solver2d';
import { makeTransform, uniformInsets } from './transform';
import type { Fem2DModel, Fem2DNode } from './types';

export type Fem2DCanvasView = 'model' | 'N' | 'V' | 'M' | 'def';

interface Props {
  model: Fem2DModel;
  checks: Fem2DCheckBundle | null;
  view: Fem2DCanvasView;
  width: number;
  height: number;
  mode?: 'screen' | 'pdf';
  /** Combination group for the N/V/M/def views. Default ELU (PDF clones). */
  combo?: Fem2DComboId;
  /** Raw solver element samples — required only by the 'def' view. */
  elements?: Solver2DElementResult[];
}

export function Fem2DCanvas({
  model, checks, view, width, height, mode = 'screen', combo = 'ELU', elements,
}: Props): JSX.Element {
  const pdf = mode === 'pdf';
  const { system } = useUnitSystem();

  const geom = useMemo(() => {
    const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
    // Reserve room for the diagram bands + their labels around the model
    // bounds; the SAME margin in every view so the model doesn't resize when
    // switching tabs.
    const t = makeTransform(model.nodes, width, height, uniformInsets(fitMarginFor(width, height)));
    return { nodeById, sx: t.sx, sy: t.sy };
  }, [model, width, height]);

  const { nodeById, sx, sy } = geom;
  const nodeAt = (id: string): Fem2DNode | undefined => nodeById.get(id);

  // ── Members ─────────────────────────────────────────────────────────────
  const members = model.members.map((m) => {
    const a = nodeAt(m.i), b = nodeAt(m.j);
    if (!a || !b) return null;
    const status = checks?.perMember[m.id]?.status ?? null;
    const dim = view === 'def';
    return (
      <g key={m.id}>
        {m.material === 'rc' && (
          // HA members read as a wide translucent band under the status line
          // (sección de hormigón), keeping the verdict colour on top.
          <line
            x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)}
            stroke={strokeFor(status, pdf)}
            strokeWidth={7}
            strokeLinecap="round"
            strokeOpacity={dim ? 0.12 : 0.25}
          />
        )}
        {m.material === 'timber' && (
          // Timber members: same wide band, but in a FIXED wood tone so the
          // material reads at a glance in a mixed model.
          <line
            x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)}
            stroke={timberBandColor(pdf)}
            strokeWidth={7}
            strokeLinecap="round"
            strokeOpacity={dim ? 0.18 : 0.38}
          />
        )}
        <line
          x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)}
          stroke={strokeFor(status, pdf)}
          strokeWidth={m.elementType === 'two-force' ? 1.6 : 2.6}
          strokeLinecap="round"
          strokeOpacity={dim ? 0.45 : 1}
        />
      </g>
    );
  });

  // ── Nodes ───────────────────────────────────────────────────────────────
  const nodes = model.nodes.map((n) => (
    <circle
      key={n.id}
      cx={sx(n.x)} cy={sy(n.y)} r={2.6}
      fill={pdf ? '#fff' : 'var(--color-bg-primary)'}
      stroke={pdf ? '#333' : 'var(--color-text-secondary)'}
      strokeWidth={1}
    />
  ));

  // ── Release hinges (model view only — diagrams show M=0 by themselves) ──
  const hinges = view === 'model'
    ? <ReleaseHingeGlyphs model={model} sx={sx} sy={sy} pdf={pdf} />
    : null;

  // ── Supports ────────────────────────────────────────────────────────────
  const supports = model.supports.map((s) => {
    const n = nodeAt(s.node);
    if (!n) return null;
    return <SupportGlyph key={s.node} x={sx(n.x)} y={sy(n.y)} type={s.type} pdf={pdf} />;
  });

  // ── Loads (model view only) ─────────────────────────────────────────────
  const loads = view === 'model'
    ? (() => {
        const stacks = computeLoadStacks(model);
        const stackCounts = computeLoadStackCounts(model);
        return model.loads.map((ld) => (
          <LoadGlyph
            key={ld.id}
            load={ld} model={model} sx={sx} sy={sy}
            width={width} height={height} pdf={pdf} system={system}
            stackIndex={stacks.get(ld.id) ?? 0}
            stackTotal={stackCounts.get(ld.id) ?? 1}
          />
        ));
      })()
    : null;

  // ── Diagram (N / V / M) ─────────────────────────────────────────────────
  const diagram = (view === 'N' || view === 'V' || view === 'M') && checks ? (
    <DiagramLayer
      model={model} checks={checks} field={view} combo={combo}
      sx={sx} sy={sy} width={width} height={height} pdf={pdf} system={system}
    />
  ) : null;

  // ── Deformed shape (δ) ──────────────────────────────────────────────────
  const shape = useMemo(
    () => (view === 'def' && elements ? computeDeformedShape(model, elements, combo) : null),
    [view, elements, model, combo],
  );
  const deformed = shape ? (
    <DeformedLayer shape={shape} sx={sx} sy={sy} width={width} height={height} pdf={pdf} />
  ) : null;

  const ariaLabel =
    view === 'model' ? 'Modelo estructural 2D'
      : view === 'def' ? 'Deformada'
        : `Diagrama de ${view}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Opaque white background in PDF mode: kills the PNG alpha channel so
          embedSvgAsImage produces no soft-mask (≈half the file size, and no
          SMask for a viewer to choke on). Screen keeps the transparent canvas. */}
      {pdf && <rect x={0} y={0} width={width} height={height} fill="#ffffff" />}
      {diagram}
      {members}
      {hinges}
      {deformed}
      {supports}
      {nodes}
      {loads}
    </svg>
  );
}
