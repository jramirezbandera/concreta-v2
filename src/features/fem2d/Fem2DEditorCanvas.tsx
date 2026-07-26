// FEM 2D — interactive editor canvas (the 'model' view on screen).
//
// Mirrors the 1D editor mechanics: a SINGLE onClick handler on the SVG
// dispatches by active tool through screen-space hitTest (node beats member);
// placement is click-to-place with 0.1 m snap; every committed gesture is one
// setModel(op) = one undo step. No drag de nudos (sigue fuera de alcance).
//
// CÁMARA: el lienzo tiene zoom y encuadre (useCanvasView2D, el mismo hook que
// usa el lienzo de diagramas). La geometría escala; trazos, glifos, textos y
// tolerancias de hit siguen en px de pantalla, así que acercarse SEPARA las
// etiquetas en vez de ampliarlas. Los gestos de cámara son VISTA, no edición:
// funcionan también en readOnly.
//
// readOnly (mobile): every tool degrades to select; keyboard editing off; el
// zoom sigue disponible por botones.
// Glyphs come from canvasGlyphs (shared with the read-only canvas and the PDF
// clones) so the editor can never drift visually from the exported figure.

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { InlineEdit } from '../../components/ui/InlineEdit';
import { showToast } from '../../components/ui/Toast';
import { formatQuantity } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { computeAlignments, moveAlignmentGap, type Axis2D } from './alignments';
import type { Fem2DCheckBundle } from './checks';
import { computeLoadStackCounts, computeLoadStacks, strokeFor, timberBandColor } from './canvasTheme';
import { LoadGlyph, ReleaseHingeGlyphs, SupportGlyph } from './canvasGlyphs';
import { hitTest, selectInRect } from './hitTest';
import {
  DEFAULT_LOAD_DRAFTS,
  draftToPointPreset,
  draftToUdlPreset,
  isHorizontalTool,
  isLoadTool,
  isUdlTool,
  addFreeNode,
  addMember,
  addMemberPointLoad,
  addMemberUdl,
  addNodeLoad,
  copyMemberProps,
  copyMemberPropsMany,
  cycleSupport,
  deleteLoad,
  deleteMember,
  deleteNode,
  deleteSelection,
  normalizeSelection,
  selectionToSet,
  snap,
  splitMemberAt,
  toggleInSelection,
  unionSelections,
  type LoadDrafts2D,
  type LoadToolId,
  type OpResult,
  type Selected2D,
  type Tool2DId,
} from './modelOps';
import { canvasBase } from './drawableBounds';
import { IDENTITY_VIEW, isIdentityView, withView, type CanvasView2D } from '../../lib/canvas/transform';
import { useCanvasView2D } from '../../hooks/useCanvasView2D';
import type { Fem2DModel } from './types';

interface Props {
  model: Fem2DModel;
  checks: Fem2DCheckBundle | null;
  setModel: (updater: (m: Fem2DModel) => Fem2DModel) => void;
  selected: Selected2D;
  setSelected: (s: Selected2D) => void;
  tool: Tool2DId;
  /** Value + hipótesis armed in the palette for each load tool (configure
   *  BEFORE placing). Omitted → the historical 10 kN G/W seeds. */
  loadDrafts?: LoadDrafts2D;
  showLabels: boolean;
  width: number;
  height: number;
  /** First fail-severity message from the pipeline (solve/validate) — banner. */
  errorMsg?: string | null;
  /** Mobile: tap-to-select only (tools/keyboard disabled). */
  readOnly?: boolean;
  /** Cámara (zoom/encuadre) — VISTA, no edición: activa también en readOnly. */
  canvasView?: CanvasView2D;
  setCanvasView?: (v: CanvasView2D) => void;
}

// The load tools describe themselves from their armed draft (loadHint below):
// the hint is what tells you, before clicking, exactly what will land.
const TOOL_HINT: Record<Exclude<Tool2DId, LoadToolId>, string> = {
  select: 'Clic: seleccionar · Mayús+clic: añadir/quitar · arrastrar en vacío: ventana (→ contiene, ← toca) · Supr borra',
  'copy-props': 'Clic en la barra ORIGEN y después en cada destino, o arrastra una ventana para pintar varias (Esc termina)',
  node: 'Clic en vacío: nudo nuevo · clic en barra: dividirla',
  bar: 'Dos clics: nudo origen → nudo destino (Esc cancela)',
  support: 'Clic en un nudo: articulado → empotrado → deslizante → sin apoyo',
  delete: 'Clic: eliminar nudo, barra o carga',
};

// Opaque chip behind an editable cota value: the dimension line "breaks" for
// the number (drafting convention) instead of running through it. The other
// value labels use the SVG paint-order halo, but a foreignObject can't — so the
// chip is its equivalent, masking the line/grid right behind the digits.
// Ancho reservado al grupo flotante de zoom (abajo-derecha del contenedor) para
// que el banner de error no se meta debajo.
const ZOOM_GROUP_RESERVE_PX = 150;

const COTA_CHIP: React.CSSProperties = {
  background: 'var(--color-bg-primary)',
  borderRadius: 3,
  padding: '0 1px',
  display: 'inline-flex',
  lineHeight: 1,
};

export function Fem2DEditorCanvas({
  model, checks, setModel, selected, setSelected, tool, loadDrafts = DEFAULT_LOAD_DRAFTS,
  showLabels, width, height, errorMsg, readOnly = false,
  canvasView = IDENTITY_VIEW, setCanvasView,
}: Props): JSX.Element {
  const { system } = useUnitSystem();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const effectiveTool: Tool2DId = readOnly ? 'select' : tool;
  // 'bar' tool: id of the first node picked, awaiting the second.
  const [pendingNode, setPendingNode] = useState<string | null>(null);
  // 'copy-props' tool: source member whose properties are being painted.
  const [copySource, setCopySource] = useState<string | null>(null);
  // Live marquee rect while dragging in 'select' (screen px, UNnormalized:
  // x1 < x0 means the drag went right→left = crossing selection).
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Drag origin before the marquee threshold is crossed (not yet a marquee).
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  // A finished marquee drag still fires a click on mouse-up — swallow that one.
  const suppressClick = useRef(false);

  // Leave the tool (or go read-only) → cancel any pending pick/paint/drag.
  // Adjust-state-during-render (React docs pattern): no effect, no extra pass
  // with stale pending visible.
  const [lastTool, setLastTool] = useState(effectiveTool);
  if (lastTool !== effectiveTool) {
    setLastTool(effectiveTool);
    if (pendingNode !== null) setPendingNode(null);
    if (copySource !== null) setCopySource(null);
    if (marquee !== null) setMarquee(null);
  }

  // Same fit margin as the read-only canvas so switching Modelo ⇄ N/V/M never
  // re-scales the geometry underfoot; canvasBase da además los límites
  // navegables con ese mismo margen.
  const { base, bounds } = useMemo(
    () => canvasBase(model, width, height, system),
    [model, width, height, system],
  );
  // La cámara envuelve el autofit; con k=1 withView devuelve el mismo objeto.
  const t = withView(base, canvasView);
  const zoomed = !isIdentityView(canvasView);
  const nodeById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model]);

  // Gestos de cámara: activos aunque readOnly (VISTA ≠ EDICIÓN). El marquee en
  // curso desarma el pan por Espacio para que los dos gestos no se peleen.
  const viewApi = useCanvasView2D({
    svgRef,
    view: canvasView,
    setView: setCanvasView ?? (() => {}),
    bounds,
    width,
    height,
    enabled: !!setCanvasView && model.nodes.length > 0,
    marqueeActive: marquee !== null || dragOrigin.current !== null,
  });

  // Apply an OpResult: commit on ok (one history step), toast the reason on
  // failure. Ops returning the model directly commit unconditionally.
  const apply = (res: OpResult) => {
    if (res.ok) setModel(() => res.model);
    else showToast(res.reason, { autoDismiss: 3500 });
  };

  // ── Keyboard: Supr borra la selección; Esc cancela pending/deselecciona ───
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (e.key === 'Escape') {
        if (marquee) {
          setMarquee(null);
          dragOrigin.current = null;
        } else if (copySource) setCopySource(null);
        else if (pendingNode) setPendingNode(null);
        else setSelected(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        if (selected.kind === 'multi') setModel((m) => deleteSelection(m, selected));
        else if (selected.kind === 'node') setModel((m) => deleteNode(m, selected.id));
        else if (selected.kind === 'member') setModel((m) => deleteMember(m, selected.id));
        else setModel((m) => deleteLoad(m, selected.id));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly, selected, pendingNode, copySource, marquee, setModel, setSelected]);

  // ── Marquee drag: → window contains, ← crossing touches ───────────────────
  // Enabled in 'select' (marquee-select; Shift adds to the selection) and in
  // 'copy-props' once a source is armed (marquee-paint: apply the source's
  // properties to every member the rectangle catches, in one undo step).
  const pointerPos = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const marqueeArmed = effectiveTool === 'select' || (effectiveTool === 'copy-props' && copySource !== null);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (readOnly || !marqueeArmed || e.button !== 0 || e.pointerType !== 'mouse') return;
    const p = pointerPos(e);
    // Dragging FROM an element stays a click on it — the marquee only starts
    // on empty canvas.
    if (hitTest(model, p.x, p.y, t.sx, t.sy, { loads: true, system })) return;
    dragOrigin.current = p;
    // Capture so the drag survives leaving the SVG; best-effort (synthetic
    // events or an already-released pointer would throw NotFoundError).
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* drag still works while the cursor stays over the SVG */
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const o = dragOrigin.current;
    if (!o) return;
    const p = pointerPos(e);
    if (!marquee && Math.hypot(p.x - o.x, p.y - o.y) < 4) return; // still a click
    setMarquee({ x0: o.x, y0: o.y, x1: p.x, y1: p.y });
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const o = dragOrigin.current;
    dragOrigin.current = null;
    if (!o || !marquee) return; // plain click → onSvgClick decides
    suppressClick.current = true;
    const crossing = marquee.x1 < marquee.x0;
    const sel = selectInRect(
      model,
      {
        x0: Math.min(marquee.x0, marquee.x1),
        y0: Math.min(marquee.y0, marquee.y1),
        x1: Math.max(marquee.x0, marquee.x1),
        y1: Math.max(marquee.y0, marquee.y1),
      },
      t.sx,
      t.sy,
      crossing,
    );
    setMarquee(null);

    if (effectiveTool === 'copy-props' && copySource !== null) {
      // Marquee-paint: apply the armed source to every member caught (nodes and
      // loads ignored — properties are a member concept). Source stays armed.
      const { model: next, applied, failures } = copyMemberPropsMany(model, copySource, sel.members);
      if (applied.length > 0) setModel(() => next);
      const parts = [
        applied.length > 0 ? `${applied.length} barra${applied.length === 1 ? '' : 's'} pintada${applied.length === 1 ? '' : 's'}` : null,
        failures.length > 0 ? `${failures.length} omitida${failures.length === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      showToast(
        parts.length > 0 ? `Brocha ${copySource}: ${parts.join(' · ')}` : `Ninguna barra en la ventana (origen ${copySource})`,
        { autoDismiss: 2600 },
      );
      return;
    }

    // Marquee-select: Shift adds the rectangle to the current selection.
    const next = e.shiftKey ? unionSelections(selectionToSet(selected), sel) : sel;
    setSelected(normalizeSelection(next));
  }

  function onPointerCancel() {
    dragOrigin.current = null;
    setMarquee(null);
  }

  // ── Single click dispatch (1D pattern) ────────────────────────────────────
  function onSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    // The click that closes a marquee drag is not a pick.
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // Loads are clickable only in select/delete: placement tools keep seeing
    // nodes/members through the arrows.
    const loadsOn = effectiveTool === 'select' || effectiveTool === 'delete';
    const hit = hitTest(model, px, py, t.sx, t.sy, { loads: loadsOn, system });

    switch (effectiveTool) {
      case 'select': {
        // Shift-click toggles the hit element in/out of the current selection
        // (add to build a multi-selection, click again to drop it). Shift on
        // empty canvas is a no-op — it must not clear what's selected.
        if (e.shiftKey) {
          if (hit) setSelected(toggleInSelection(selected, hit.kind, hit.id));
          return;
        }
        setSelected(hit ? { kind: hit.kind, id: hit.id } : null);
        return;
      }
      case 'node': {
        if (hit?.kind === 'member') {
          apply(splitMemberAt(model, hit.id, hit.t));
        } else if (!hit) {
          const w = t.invert(px, py);
          apply(addFreeNode(model, snap(w.x), snap(w.y)));
        }
        return;
      }
      case 'bar': {
        if (hit?.kind === 'node') {
          if (pendingNode === null) {
            setPendingNode(hit.id);
          } else if (pendingNode !== hit.id) {
            apply(addMember(model, pendingNode, hit.id));
            setPendingNode(null);
          } else {
            setPendingNode(null);
          }
        } else {
          setPendingNode(null);
        }
        return;
      }
      case 'support': {
        if (hit?.kind === 'node') setModel((m) => cycleSupport(m, hit.id));
        return;
      }
      case 'copy-props': {
        // Empty/node clicks keep the source armed — painting several targets
        // in a row is the whole point (Esc or re-clicking the source ends it).
        if (hit?.kind !== 'member') return;
        if (copySource === null) {
          setCopySource(hit.id);
        } else if (copySource === hit.id) {
          setCopySource(null);
        } else {
          const res = copyMemberProps(model, copySource, hit.id);
          if (res.ok) {
            setModel(() => res.model);
            showToast(`Propiedades de ${copySource} aplicadas a ${hit.id}`, { autoDismiss: 1800 });
          } else {
            showToast(res.reason, { autoDismiss: 3500 });
          }
        }
        return;
      }
      // The four load tools place the draft armed in the palette (value +
      // hipótesis + categoría), so the load lands already configured.
      case 'load-udl':
      case 'load-udl-h': {
        if (hit?.kind === 'member') {
          apply(addMemberUdl(model, hit.id, draftToUdlPreset(effectiveTool, loadDrafts[effectiveTool])));
        }
        return;
      }
      case 'load-point':
      case 'load-h': {
        const preset = draftToPointPreset(effectiveTool, loadDrafts[effectiveTool]);
        if (hit?.kind === 'node') apply(addNodeLoad(model, hit.id, preset));
        else if (hit?.kind === 'member') apply(addMemberPointLoad(model, hit.id, hit.t, preset));
        return;
      }
      case 'delete': {
        if (hit?.kind === 'node') {
          setModel((m) => deleteNode(m, hit.id));
          if (selected?.kind === 'node' && selected.id === hit.id) setSelected(null);
        } else if (hit?.kind === 'member') {
          setModel((m) => deleteMember(m, hit.id));
          if (selected?.kind === 'member' && selected.id === hit.id) setSelected(null);
        } else if (hit?.kind === 'load') {
          setModel((m) => deleteLoad(m, hit.id));
          if (selected?.kind === 'load' && selected.id === hit.id) setSelected(null);
        }
        return;
      }
    }
  }

  // ── Render layers ─────────────────────────────────────────────────────────

  // Marquee multi-selection: id sets for the highlight passes below.
  const multi = selected?.kind === 'multi' ? selected : null;
  const multiNodes = new Set(multi?.nodes ?? []);
  const multiMembers = new Set(multi?.members ?? []);
  const multiLoads = new Set(multi?.loads ?? []);

  const members = model.members.map((m) => {
    const a = nodeById.get(m.i), b = nodeById.get(m.j);
    if (!a || !b) return null;
    const status = checks?.perMember[m.id]?.status ?? null;
    const isSel = (selected?.kind === 'member' && selected.id === m.id) || multiMembers.has(m.id);
    const isCopySrc = copySource === m.id;
    const x1 = t.sx(a.x), y1 = t.sy(a.y), x2 = t.sx(b.x), y2 = t.sy(b.y);
    const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
    return (
      <g key={m.id}>
        {m.material === 'rc' && (
          // HA: wide translucent band under the status line (sección de
          // hormigón) — same language as the read-only canvas.
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={isSel ? 'var(--color-accent)' : strokeFor(status, false)}
            strokeWidth={7.5}
            strokeLinecap="round"
            strokeOpacity={0.25}
          />
        )}
        {m.material === 'timber' && (
          // Madera: banda ancha en tono madera fijo — el material se reconoce
          // de un vistazo (misma banda que el lienzo de solo lectura).
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={isSel ? 'var(--color-accent)' : timberBandColor(false)}
            strokeWidth={7.5}
            strokeLinecap="round"
            strokeOpacity={0.38}
          />
        )}
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={isSel ? 'var(--color-accent)' : strokeFor(status, false)}
          strokeWidth={isSel ? 4.2 : m.elementType === 'two-force' ? 1.6 : 2.6}
          strokeLinecap="round"
        />
        {isCopySrc && (
          // Source of the property paint: dashed accent overlay (same visual
          // language as the bar tool's pending-node ring).
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="var(--color-accent)" strokeWidth={4.4}
            strokeDasharray="7 5" strokeLinecap="round" opacity={0.9}
          />
        )}
        {showLabels && (
          <text
            x={(x1 + x2) / 2 + ((y1 - y2) / len) * 9}
            y={(y1 + y2) / 2 + ((x2 - x1) / len) * 9}
            fontFamily="ui-monospace, monospace"
            fontSize={9}
            fill={isSel ? 'var(--color-accent)' : 'var(--color-text-disabled)'}
            textAnchor="middle"
            stroke="var(--color-bg-primary)"
            strokeWidth={3}
            strokeLinejoin="round"
            style={{ paintOrder: 'stroke', pointerEvents: 'none' }}
          >
            {m.id}
          </text>
        )}
      </g>
    );
  });

  const supports = model.supports.map((s) => {
    const n = nodeById.get(s.node);
    if (!n) return null;
    return <SupportGlyph key={s.node} x={t.sx(n.x)} y={t.sy(n.y)} type={s.type} pdf={false} />;
  });

  // Loads never capture their own click: the SVG dispatch resolves them via
  // hitTest (select/delete only), so the clickable area is the same generous
  // band the pure hit-testing defines — not just the painted 1-px strokes.
  // Las pilas se derivan del MODELO, no de la cámara: memoizadas para que la
  // rueda no las recalcule en cada fotograma.
  const { stacks, counts: stackCounts } = useMemo(
    () => ({ stacks: computeLoadStacks(model), counts: computeLoadStackCounts(model) }),
    [model],
  );
  const loads = model.loads.map((ld) => (
    <g key={ld.id} style={{ pointerEvents: 'none' }}>
      <LoadGlyph
        load={ld} model={model} sx={t.sx} sy={t.sy}
        width={width} height={height} pdf={false} system={system}
        stackIndex={stacks.get(ld.id) ?? 0}
        stackTotal={stackCounts.get(ld.id) ?? 1}
        selected={(selected?.kind === 'load' && selected.id === ld.id) || multiLoads.has(ld.id)}
      />
    </g>
  ));

  const nodes = model.nodes.map((n) => {
    const isSel = (selected?.kind === 'node' && selected.id === n.id) || multiNodes.has(n.id);
    const isPending = pendingNode === n.id;
    return (
      <g key={n.id}>
        {isPending && (
          <circle
            cx={t.sx(n.x)} cy={t.sy(n.y)} r={8}
            fill="none" stroke="var(--color-accent)" strokeWidth={1.2} strokeDasharray="3 2"
          />
        )}
        <circle
          cx={t.sx(n.x)} cy={t.sy(n.y)} r={isSel ? 4.6 : 2.8}
          fill={isSel ? 'var(--color-accent)' : 'var(--color-bg-primary)'}
          stroke={isSel ? 'var(--color-accent)' : 'var(--color-text-secondary)'}
          strokeWidth={1.1}
        />
        {showLabels && (
          <text
            x={t.sx(n.x) + 6} y={t.sy(n.y) - 6}
            fontFamily="ui-monospace, monospace"
            fontSize={9}
            fill={isSel ? 'var(--color-accent)' : 'var(--color-text-secondary)'}
            stroke="var(--color-bg-primary)"
            strokeWidth={3}
            strokeLinejoin="round"
            style={{ paintOrder: 'stroke', pointerEvents: 'none' }}
          >
            {n.id}
          </text>
        )}
      </g>
    );
  });

  // ── Dimension chains (X below, Y left) ────────────────────────────────────
  // One editable cota per gap between consecutive alignments; committing moves
  // that alignment entirely (moveAlignmentGap — no cascade). Positions hug the
  // drawing: the X chain sits below the lowest node (clear of support glyphs),
  // the Y chain left of the leftmost node.
  const commitGap = (axis: Axis2D, gapIndex: number, v: number) => {
    apply(moveAlignmentGap(model, axis, gapIndex, v));
  };

  // Alineaciones: derivadas del modelo, no de la cámara (memo por rendimiento).
  const aligns = useMemo(
    () => ({
      x: computeAlignments(model.nodes, 'x'),
      y: computeAlignments(model.nodes, 'y'),
    }),
    [model.nodes],
  );

  // Con zoom, una cota cuyas DOS marcas caen fuera del viewport dejaría su chip
  // editable flotando en mitad del lienzo, encima de las barras. Sólo se pinta
  // si algo de ella (una marca o su punto medio) está a la vista.
  const spanVisible = (p1: number, p2: number, limit: number): boolean => {
    const lo = Math.min(p1, p2);
    const hi = Math.max(p1, p2);
    const mid = (p1 + p2) / 2;
    const inside = (v: number) => v >= 0 && v <= limit;
    return inside(lo) || inside(hi) || inside(mid);
  };

  const chains = (() => {
    if (model.nodes.length === 0) return null;
    const alignsX = aligns.x;
    const alignsY = aligns.y;
    const dimColor = 'var(--color-text-disabled)';
    const items: JSX.Element[] = [];

    const lowestSy = Math.max(...model.nodes.map((n) => t.sy(n.y)));
    // Con zoom el nudo más bajo puede quedar fuera de pantalla: la cadena se
    // ancla al borde inferior para que las cotas visibles sigan siendo editables.
    const xChainY = Math.min(height - 14, Math.max(14, lowestSy + 44));
    for (let i = 0; i < alignsX.length - 1; i++) {
      const a = alignsX[i], b = alignsX[i + 1];
      const x1 = t.sx(a.coord), x2 = t.sx(b.coord);
      if (!spanVisible(x1, x2, width)) continue;
      const gap = b.coord - a.coord;
      items.push(
        <g key={`dx${i}`} stroke={dimColor} strokeWidth={0.9}>
          <line x1={x1} y1={xChainY} x2={x2} y2={xChainY} />
          <line x1={x1} y1={xChainY - 4} x2={x1} y2={xChainY + 4} />
          <line x1={x2} y1={xChainY - 4} x2={x2} y2={xChainY + 4} />
          <foreignObject x={(x1 + x2) / 2 - 34} y={xChainY - 22} width={68} height={20}>
            {/* stopPropagation también en pointerdown: si llega al SVG arma el
                marquee y setPointerCapture re-dirige el click al lienzo — el
                InlineEdit nunca lo recibiría y la cota sería ineditable. */}
            <div
              style={{ display: 'flex', justifyContent: 'center' }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span style={COTA_CHIP}>
                <InlineEdit
                  value={gap}
                  decimals={2}
                  min={0.05}
                  unit="m"
                  disabled={readOnly}
                  ariaLabel={`Luz entre alineaciones ${i + 1} y ${i + 2}`}
                  onCommit={(v) => commitGap('x', i, v)}
                />
              </span>
            </div>
          </foreignObject>
        </g>,
      );
    }

    const leftSx = Math.min(...model.nodes.map((n) => t.sx(n.x)));
    const yChainX = Math.min(width - 14, Math.max(14, leftSx - 48));
    for (let i = 0; i < alignsY.length - 1; i++) {
      const a = alignsY[i], b = alignsY[i + 1];
      const y1 = t.sy(a.coord), y2 = t.sy(b.coord); // y1 below y2 on screen
      if (!spanVisible(y1, y2, height)) continue;
      const gap = b.coord - a.coord;
      items.push(
        <g key={`dy${i}`} stroke={dimColor} strokeWidth={0.9}>
          <line x1={yChainX} y1={y1} x2={yChainX} y2={y2} />
          <line x1={yChainX - 4} y1={y1} x2={yChainX + 4} y2={y1} />
          <line x1={yChainX - 4} y1={y2} x2={yChainX + 4} y2={y2} />
          <foreignObject x={Math.max(2, yChainX - 30)} y={(y1 + y2) / 2 - 10} width={64} height={20}>
            <div
              style={{ display: 'flex', justifyContent: 'center' }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span style={COTA_CHIP}>
                <InlineEdit
                  value={gap}
                  decimals={2}
                  min={0.05}
                  unit="m"
                  disabled={readOnly}
                  ariaLabel={`Altura entre niveles ${i + 1} y ${i + 2}`}
                  onCommit={(v) => commitGap('y', i, v)}
                />
              </span>
            </div>
          </foreignObject>
        </g>,
      );
    }
    return items;
  })();

  const cursor =
    viewApi.isPanning() ? 'grabbing'
      : viewApi.isPanArmed() ? 'grab'
        : effectiveTool === 'select' ? 'default'
          : effectiveTool === 'delete' ? 'not-allowed'
            : effectiveTool === 'copy-props' ? 'copy'
              : 'crosshair';

  // A load tool announces WHAT it will place (value, sentido e hipótesis del
  // borrador armado en la paleta) — el objetivo es no tener que colocar primero
  // y corregir después.
  const loadHint = (t: LoadToolId): string => {
    const d = loadDrafts[t];
    const udl = isUdlTool(t);
    const value = formatQuantity(Math.abs(d.magnitude), udl ? 'linearLoad' : 'force', system);
    const arrow = isHorizontalTool(t)
      ? (d.magnitude >= 0 ? '→' : '←')
      : (d.magnitude >= 0 ? '↓' : '↑');
    const cat = d.lc === 'Q' ? ` ${d.useCategory ?? 'B'}` : '';
    return `Clic en ${udl ? 'una barra' : 'un nudo o una barra'}: ${udl ? 'distribuida' : 'puntual'} ${value} ${arrow} · hipótesis ${d.lc}${cat} — cámbialo en el menú de cargas`;
  };

  // With a source armed, the hint names it (the palette label can't).
  const toolHint = effectiveTool === 'copy-props' && copySource !== null
    ? `Origen ${copySource}: clic en cada barra o arrastra una ventana para pintar varias · Esc termina`
    : isLoadTool(effectiveTool)
      ? loadHint(effectiveTool)
      : TOOL_HINT[effectiveTool];

  // Ampliado, el hint enseña los gestos de encuadre — el momento exacto en que
  // hacen falta. Es la superficie didáctica que el módulo ya usa; nada de
  // globos ni onboarding nuevos. Va en su PROPIA línea: concatenado al hint de
  // herramienta se salía del lienzo y no se leía justo cuando hacía falta.
  const PAN_HINT = 'Botón central o Espacio+arrastre: encuadre · 0: reencuadrar';
  const hint = toolHint;
  const panHint = zoomed ? PAN_HINT : null;

  const marqueeRect = marquee && (() => {
    const crossing = marquee.x1 < marquee.x0;
    const c = crossing ? 'var(--color-state-ok)' : 'var(--color-accent)';
    return (
      <rect
        x={Math.min(marquee.x0, marquee.x1)}
        y={Math.min(marquee.y0, marquee.y1)}
        width={Math.abs(marquee.x1 - marquee.x0)}
        height={Math.abs(marquee.y1 - marquee.y0)}
        fill={`color-mix(in srgb, ${c} 8%, transparent)`}
        stroke={c}
        strokeWidth={1}
        strokeDasharray={crossing ? '5 3' : undefined}
        style={{ pointerEvents: 'none' }}
      />
    );
  })();

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onClick={onSvgClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role="application"
      aria-label="Editor 2D: lienzo del modelo estructural"
      style={{ cursor, touchAction: 'manipulation' }}
    >
      {chains}
      {members}
      <ReleaseHingeGlyphs model={model} sx={t.sx} sy={t.sy} pdf={false} />
      {supports}
      {loads}
      {nodes}
      {marqueeRect}

      {/* Tool hint — top edge, clear of the floating palette (left ~56px). */}
      {!readOnly && (
        <text
          x={64} y={16}
          fontFamily="ui-monospace, monospace"
          fontSize={10}
          fill="var(--color-text-disabled)"
        >
          {hint}
        </text>
      )}

      {/* Gestos de encuadre: sólo con zoom, en su propia línea (y con el halo
          de la app, porque a partir de aquí puede cruzarse con el dibujo). */}
      {panHint && (
        <text
          x={64} y={readOnly ? 16 : 30}
          fontFamily="ui-monospace, monospace"
          fontSize={10}
          fill="var(--color-text-disabled)"
          stroke="var(--color-bg-primary)"
          strokeWidth={3}
          strokeLinejoin="round"
          style={{ paintOrder: 'stroke', pointerEvents: 'none' }}
        >
          {panHint}
        </text>
      )}

      {/* Error banner (bottom-left): first fail from validate/solve. Su ancho se
          topa para no pasar por debajo del grupo de zoom (abajo-derecha del
          contenedor); el texto se recorta con elipsis y va entero en <title>. */}
      {errorMsg && (() => {
        const maxW = Math.max(120, width - 16 - ZOOM_GROUP_RESERVE_PX);
        const full = 12 + errorMsg.length * 5.6;
        const w = Math.min(maxW, full);
        const fits = full <= maxW;
        const shown = fits ? errorMsg : `${errorMsg.slice(0, Math.max(3, Math.floor((maxW - 18) / 5.6)))}…`;
        return (
          <g>
            <title>{errorMsg}</title>
            <rect
              x={8} y={height - 30} rx={4}
              width={w} height={22}
              fill="color-mix(in srgb, var(--color-state-fail) 12%, transparent)"
              stroke="color-mix(in srgb, var(--color-state-fail) 40%, transparent)"
            />
            <text
              x={16} y={height - 15.5}
              fontFamily="ui-monospace, monospace"
              fontSize={10}
              fill="var(--color-state-fail)"
            >
              {shown}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
