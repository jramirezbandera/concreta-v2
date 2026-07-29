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

import { useMemo, useRef, type JSX } from 'react';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { Fem2DCheckBundle, Fem2DEnvelopeKey } from './checks';
import { computeLoadStackCounts, computeLoadStacks, strokeFor, timberBandColor } from './canvasTheme';
import { DeformedLayer, LoadGlyph, ReleaseHingeGlyphs, SupportGlyph, buildDiagramLayers } from './canvasGlyphs';
import { memberFormulation } from './decompose';
import { computeDeformedShape } from './deformed';
import type { Solver2DElementResult } from './solver2d';
import { canvasBase } from './drawableBounds';
import { IDENTITY_VIEW, withView, type CanvasView2D } from '../../lib/canvas/transform';
import { useCanvasView2D } from '../../hooks/useCanvasView2D';
import type { Fem2DModel, Fem2DNode } from './types';

export type Fem2DCanvasView = 'model' | 'N' | 'V' | 'M' | 'def';

interface Props {
  model: Fem2DModel;
  checks: Fem2DCheckBundle | null;
  view: Fem2DCanvasView;
  width: number;
  height: number;
  mode?: 'screen' | 'pdf';
  /** Vista a dibujar en N/V/M/def. Un id de `checks.comboViews` en pantalla; los
   *  clones PDF no pasan nada → default 'ELU' (alias heredado, sin vista → se
   *  autonormaliza, y nunca dibujan la deformada). */
  combo?: Fem2DEnvelopeKey;
  /** Raw solver element samples — required only by the 'def' view. */
  elements?: Solver2DElementResult[];
  /** Cámara (zoom/encuadre). Omitida ⇒ autofit — el camino del PDF. */
  canvasView?: CanvasView2D;
  setCanvasView?: (v: CanvasView2D) => void;
}

export function Fem2DCanvas({
  model, checks, view, width, height, mode = 'screen', combo = 'ELU', elements,
  canvasView = IDENTITY_VIEW, setCanvasView,
}: Props): JSX.Element {
  const pdf = mode === 'pdf';
  const { system } = useUnitSystem();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // 2ª búsqueda id→vista (la 1ª, la de vista obsoleta, la hace index.tsx). En el
  // camino PDF `combo` es un alias heredado ('ELU'): no hay vista, el diagrama se
  // autonormaliza (scaleRef undefined) y la deformada no se dibuja.
  const cView = checks?.comboViews.find((v) => v.id === combo) ?? null;

  const geom = useMemo(() => {
    const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
    // Reserve room for the diagram bands + their labels around the model
    // bounds; the SAME margin in every view so the model doesn't resize when
    // switching tabs. canvasBase da también los límites navegables con ese
    // mismo margen (un solo sitio decide el encuadre base).
    return { nodeById, ...canvasBase(model, width, height, system) };
  }, [model, width, height, system]);

  const { nodeById, base, bounds } = geom;
  // La cámara envuelve el autofit. En modo PDF `canvasView` es la identidad y
  // withView devuelve el MISMO transform: la figura exportada no puede moverse.
  const t = withView(base, pdf ? IDENTITY_VIEW : canvasView);
  const { sx, sy } = t;
  const nodeAt = (id: string): Fem2DNode | undefined => nodeById.get(id);

  // El hook se llama SIEMPRE (reglas de hooks); `enabled` decide si engancha.
  // En PDF nunca se engancha: ni listeners, ni estado de cámara.
  useCanvasView2D({
    svgRef,
    view: canvasView,
    setView: setCanvasView ?? (() => {}),
    bounds,
    width,
    height,
    enabled: !pdf && !!setCanvasView && model.nodes.length > 0,
  });

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
          strokeWidth={memberFormulation(model, m) === 'two-force' ? 1.6 : 2.6}
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
  // Las pilas se derivan del MODELO, no de la cámara: memoizadas para que la
  // rueda no las recalcule en cada fotograma.
  const loadStacks = useMemo(
    () => ({ stacks: computeLoadStacks(model), counts: computeLoadStackCounts(model) }),
    [model],
  );
  const loads = view === 'model'
    ? (() => {
        const { stacks, counts: stackCounts } = loadStacks;
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
  // Dos capas: bandas bajo los miembros, etiquetas sobre TODO (ver
  // buildDiagramLayers) — un texto tapado por el trazo de una barra es
  // ilegible, y en un pórtico los picos caen justo sobre nudos y dinteles.
  // Memoizado: recalcula la geometría en pantalla de las bandas Y la pasada
  // greedy de colisión de etiquetas. Depende del transform, así que con zoom
  // correría en cada evento de rueda si no se memoizara (es, con diferencia, el
  // camino más caro del lienzo).
  const scaleRef = cView?.scaleRef;
  const diagram = useMemo(
    () => ((view === 'N' || view === 'V' || view === 'M') && checks
      ? buildDiagramLayers({
        model, checks, field: view, combo, scaleRef,
        sx, sy, width, height, pdf, system,
      })
      : null),
    [view, checks, model, combo, scaleRef, sx, sy, width, height, pdf, system],
  );

  // ── Deformed shape (δ) ──────────────────────────────────────────────────
  // La deformada recibe los factores PLANOS de la vista (dispFactorSets, sin
  // amplificar por αcr — trampa 1), no un id: la elección queda visible aquí.
  const dispFactorSets = cView?.dispFactorSets;
  const shape = useMemo(
    () => (view === 'def' && elements && dispFactorSets
      ? computeDeformedShape(model, elements, dispFactorSets)
      : null),
    [view, elements, model, dispFactorSets],
  );
  const deformed = shape ? (
    <DeformedLayer
      shape={shape} sx={sx} sy={sy} width={width} height={height} pdf={pdf}
      // Escala de geometría del encuadre BASE: el ×N rotulado es una lectura de
      // cálculo y no puede cambiar al mover la rueda.
      basePxPerM={Math.abs(base.sx(1) - base.sx(0))}
    />
  ) : null;

  const ariaLabel =
    view === 'model' ? 'Modelo estructural 2D'
      : view === 'def' ? 'Deformada'
        : `Diagrama de ${view}`;

  const interactive = !pdf && !!setCanvasView && model.nodes.length > 0;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      // `manipulation` conserva el pinch de página del navegador en móvil
      // (criterio heredado del FEM 1D): aquí no hay pan táctil.
      style={interactive ? { touchAction: 'manipulation' } : undefined}
    >
      {/* Opaque white background in PDF mode: kills the PNG alpha channel so
          embedSvgAsImage produces no soft-mask (≈half the file size, and no
          SMask for a viewer to choke on). Screen keeps the transparent canvas. */}
      {pdf && <rect x={0} y={0} width={width} height={height} fill="#ffffff" />}
      {diagram?.bands}
      {members}
      {hinges}
      {deformed}
      {supports}
      {nodes}
      {loads}
      {diagram?.labels}
    </svg>
  );
}
