// FEM 2D — Canvas (strip-layout V1)
//
// Renders the DesignModel as a horizontal beam strip (y=0 forced, all bars
// collinear). Picks the SolveResult per-bar samples for live diagrams and
// per-bar verdict dots.
//
// V1 interactions:
//   - Tool 'select' : click a bar/node/load to select it
//   - Tool 'node'   : click on an existing bar to insert a mid-bar node
//   - Tool 'support': click a node to cycle pinned → fixed → roller → none
//   - Tool 'load'   : click bar (UDL) or node (point load)
//   - Tool 'delete' : remove selected bar/node/load
//   - Inline edit on cota labels and on load value labels
//   - "+vano" button at the right end of the strip → adds a new vano
//     cloning the previous vano's length + UDL + section/armado
//   - Suprimir/Delete keyboard removes the current selection
//
// Diagrams are read from `result.perBar[id]` which already holds combined
// ELU samples produced by the bridge (`solveDesignModel`).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InlineEdit } from './components/InlineEdit';
import { canEditBarLength, canInsertNode } from './invariants';
import {
  DEFAULT_APOYO_ARMADO,
  DEFAULT_VANO_ARMADO,
  DESIGN_PRESETS,
} from './presets';
import type {
  BarResult,
  DesignBar,
  DesignModel,
  Load,
  LoadCase,
  Node,
  Selected,
  SolveResult,
  Support,
  SupportType,
  ToolId,
  ViewState,
} from './types';

interface Props {
  model: DesignModel;
  setModel: (updater: (m: DesignModel) => DesignModel) => void;
  result: SolveResult;
  tool: ToolId;
  setTool: (t: ToolId) => void;
  selected: Selected;
  setSelected: (s: Selected) => void;
  hoveredBar: string | null;
  setHoveredBar: (id: string | null) => void;
  view: ViewState;
  showInlineTip: boolean;
  onDismissInlineTip: () => void;
}

export function Canvas({
  model, setModel, result, tool, selected, setSelected,
  hoveredBar, setHoveredBar, view, showInlineTip, onDismissInlineTip,
}: Props) {
  void hoveredBar;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });

  // Bounds: x range from leftmost to rightmost node; y is fixed at 0 with
  // padding for diagrams above/below the strip.
  const bounds = useMemo(() => {
    if (!model.nodes.length) return { minX: 0, maxX: 10 };
    const xs = model.nodes.map((n) => n.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const padX = Math.max(1, (maxX - minX) * 0.1);
    return { minX: minX - padX, maxX: maxX + padX };
  }, [model.nodes]);

  const padding = 60;
  const yStrip = size.h * 0.55; // strip line slightly below center to leave room for diagrams above
  const dataW = bounds.maxX - bounds.minX;
  const scaleX = (size.w - 2 * padding) / Math.max(1, dataW);
  // For y we use a fixed pixel scaling for diagrams that's independent of bar length.
  const scaleY = 1;
  const offX = padding - bounds.minX * scaleX;

  const w2s = useCallback(
    (x: number, y: number): [number, number] => [x * scaleX + offX, yStrip - y * scaleY],
    [scaleX, offX, yStrip],
  );

  // Resize observer
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: Math.max(400, cr.width), h: Math.max(300, cr.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard shortcut: Suprimir/Delete removes selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Supr') return;
      if (!selected) return;
      // Avoid deleting when an input is focused
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      deleteSelected();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, model]);

  function nextNodeId(): string {
    let i = 1;
    while (model.nodes.find((n) => n.id === 'n' + i)) i++;
    return 'n' + i;
  }
  function nextLoadId(): string {
    let i = 1;
    while (model.loads.find((l) => l.id === 'l' + i)) i++;
    return 'l' + i;
  }

  function getSvgPt(e: React.MouseEvent<SVGSVGElement>): { sx: number; sy: number; wx: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return { sx, sy, wx: (sx - offX) / scaleX };
  }

  function findBarAt(wx: number, threshold = 0.3): DesignBar | null {
    let best: DesignBar | null = null;
    let bestD = threshold;
    for (const b of model.bars) {
      const ni = model.nodes.find((n) => n.id === b.i);
      const nj = model.nodes.find((n) => n.id === b.j);
      if (!ni || !nj) continue;
      const xLow = Math.min(ni.x, nj.x);
      const xHigh = Math.max(ni.x, nj.x);
      if (wx >= xLow - threshold && wx <= xHigh + threshold) {
        // Distance to bar line is just |y|; we're at y=0 so any wx in range counts.
        const d = Math.min(Math.abs(wx - xLow), Math.abs(wx - xHigh), 0);
        if (d <= bestD) { bestD = d; best = b; }
      }
    }
    return best;
  }

  function findNodeAt(wx: number, threshold = 0.4): Node | null {
    let best: Node | null = null;
    let bestD = threshold;
    for (const n of model.nodes) {
      const d = Math.abs(n.x - wx);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function onClick(e: React.MouseEvent<SVGSVGElement>) {
    const pt = getSvgPt(e);
    const wx = pt.wx;
    if (showInlineTip) onDismissInlineTip();

    if (tool === 'select') {
      const node = findNodeAt(wx);
      if (node) { setSelected({ kind: 'node', id: node.id }); return; }
      const bar = findBarAt(wx);
      if (bar) { setSelected({ kind: 'bar', id: bar.id }); return; }
      setSelected(null);
      return;
    }
    if (tool === 'node') {
      // Insert mid-bar node on the bar at wx.
      const bar = findBarAt(wx);
      if (!bar) return;
      const ni = model.nodes.find((n) => n.id === bar.i)!;
      const nj = model.nodes.find((n) => n.id === bar.j)!;
      // Snap to 0.1m grid.
      const xSnap = Math.round(wx * 10) / 10;
      const xLow = Math.min(ni.x, nj.x);
      const xHigh = Math.max(ni.x, nj.x);
      if (xSnap <= xLow + 0.05 || xSnap >= xHigh - 0.05) return;
      const check = canInsertNode(model, xSnap, 0);
      if (!check.ok) return;
      const id = nextNodeId();
      setModel((m) => ({ ...m, nodes: [...m.nodes, { id, x: xSnap, y: 0 }] }));
      return;
    }
    if (tool === 'support') {
      const node = findNodeAt(wx);
      if (!node) return;
      cycleSupport(node.id);
      return;
    }
    if (tool === 'load') {
      const node = findNodeAt(wx);
      if (node) {
        const id = nextLoadId();
        // V1.1 sign convention: Py > 0 = downward (gravity-positive engineering).
        const load: Load = { id, kind: 'point-node', lc: 'G', node: node.id, Px: 0, Py: 10 };
        setModel((m) => ({ ...m, loads: [...m.loads, load] }));
        return;
      }
      const bar = findBarAt(wx);
      if (bar) {
        const id = nextLoadId();
        const load: Load = { id, kind: 'udl', lc: 'G', bar: bar.id, w: 15, dir: '-y' };
        setModel((m) => ({ ...m, loads: [...m.loads, load] }));
      }
      return;
    }
    if (tool === 'delete') {
      const node = findNodeAt(wx);
      if (node) { deleteNode(node.id); return; }
      const bar = findBarAt(wx);
      if (bar) deleteBar(bar.id);
    }
  }

  function cycleSupport(nodeId: string) {
    setModel((m) => {
      const others = m.supports.filter((s) => s.node !== nodeId);
      const cur = m.supports.find((s) => s.node === nodeId);
      const next: SupportType | null = !cur ? 'pinned'
        : cur.type === 'pinned' ? 'fixed'
        : cur.type === 'fixed' ? 'roller'
        : null;
      return { ...m, supports: next ? [...others, { node: nodeId, type: next }] : others };
    });
  }

  function deleteSelected() {
    if (!selected) return;
    if (selected.kind === 'bar') deleteBar(selected.id);
    else if (selected.kind === 'node') deleteNode(selected.id);
    else if (selected.kind === 'load') deleteLoad(selected.id);
    setSelected(null);
  }

  function deleteBar(id: string) {
    setModel((m) => ({
      ...m,
      bars: m.bars.filter((b) => b.id !== id),
      // Drop loads attached to this bar.
      loads: m.loads.filter((l) => l.kind === 'point-node' || l.bar !== id),
    }));
  }

  function deleteNode(id: string) {
    setModel((m) => ({
      ...m,
      nodes: m.nodes.filter((n) => n.id !== id),
      bars: m.bars.filter((b) => b.i !== id && b.j !== id),
      supports: m.supports.filter((s) => s.node !== id),
      loads: m.loads.filter((l) => l.kind !== 'point-node' || l.node !== id),
    }));
  }

  function deleteLoad(id: string) {
    setModel((m) => ({ ...m, loads: m.loads.filter((l) => l.id !== id) }));
  }

  // Edit handlers: cota length, UDL value, point load value.
  function setBarLengthEdge(barId: string, newL: number) {
    if (!canEditBarLength(newL).ok) return;
    setModel((m) => {
      const bar = m.bars.find((b) => b.id === barId);
      if (!bar) return m;
      const ni = m.nodes.find((n) => n.id === bar.i)!;
      const nj = m.nodes.find((n) => n.id === bar.j)!;
      // Determine which node is to the right (the j-end in design ordering OR
      // the higher-x one) and shift it to ni.x + newL. Then cascade-shift any
      // nodes/bars to its right by the delta.
      const xLow = Math.min(ni.x, nj.x);
      const xHigh = Math.max(ni.x, nj.x);
      const oldL = xHigh - xLow;
      const deltaL = newL - oldL;
      if (Math.abs(deltaL) < 1e-9) return m;
      // Shift all nodes with x > xHigh - eps by deltaL (cascade), and the
      // higher-x endpoint of THIS bar.
      const movedX = xHigh + deltaL;
      const nodes = m.nodes.map((n) => {
        if (n.x > xHigh - 1e-9) {
          // The one at xHigh becomes movedX; everything to the right shifts.
          return { ...n, x: n.x - xHigh + movedX };
        }
        return n;
      });
      return { ...m, nodes };
    });
  }

  function setLoadValue(loadId: string, value: number) {
    setModel((m) => ({
      ...m,
      loads: m.loads.map((l) => {
        if (l.id !== loadId) return l;
        if (l.kind === 'udl') return { ...l, w: Math.abs(value) };
        if (l.kind === 'point-bar') return { ...l, P: Math.abs(value) };
        // V1.1 convention: SVG-edited point loads default to downward (Py > 0).
        if (l.kind === 'point-node') return { ...l, Py: Math.abs(value) };
        return l;
      }),
    }));
  }

  function addVano() {
    setModel((m) => {
      if (m.bars.length === 0) return m;
      // Pick the rightmost bar to clone.
      const sorted = m.bars.map((b) => {
        const ni = m.nodes.find((n) => n.id === b.i)!;
        const nj = m.nodes.find((n) => n.id === b.j)!;
        const xMax = Math.max(ni.x, nj.x);
        return { bar: b, xMax, xLow: Math.min(ni.x, nj.x) };
      }).sort((a, b) => b.xMax - a.xMax);
      const last = sorted[0];
      const lastL = last.xMax - last.xLow;
      const newNodeId = nextNodeIdInModel(m);
      const newBarId = nextBarIdInModel(m);
      const newX = last.xMax + lastL;
      const newNode: Node = { id: newNodeId, x: newX, y: 0 };
      // Find the rightmost endpoint node id (the one at last.xMax).
      const rightEndpoint = (() => {
        const ni = m.nodes.find((n) => n.id === last.bar.i)!;
        const nj = m.nodes.find((n) => n.id === last.bar.j)!;
        return ni.x >= nj.x ? ni.id : nj.id;
      })();
      // Clone the last bar's section/armado.
      const newBar: DesignBar = {
        ...JSON.parse(JSON.stringify(last.bar)),
        id: newBarId,
        i: rightEndpoint,
        j: newNodeId,
        // Preserve armado for HA
        vano_armado: last.bar.vano_armado ? { ...last.bar.vano_armado } : { ...DEFAULT_VANO_ARMADO },
        apoyo_armado: last.bar.apoyo_armado ? { ...last.bar.apoyo_armado } : { ...DEFAULT_APOYO_ARMADO },
        internalHinges: { i: false, j: false },
      };
      // Clone the last UDL (if any) onto the new bar.
      const lastUdl = m.loads.find((l) => l.kind === 'udl' && l.bar === last.bar.id);
      const clonedLoad = lastUdl && lastUdl.kind === 'udl'
        ? [{ ...lastUdl, id: nextLoadIdInModel(m), bar: newBarId }] as Load[]
        : [];
      // Add a roller support at the new endpoint.
      const newSupport: Support = { node: newNodeId, type: 'roller' };
      return {
        ...m,
        nodes: [...m.nodes, newNode],
        bars: [...m.bars, newBar],
        supports: [...m.supports, newSupport],
        loads: [...m.loads, ...clonedLoad],
      };
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const failError = result.errors?.find((e) => e.severity === 'fail');

  return (
    <div className="canvas-dot-grid" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {failError && <ErrorBanner msg={failError.msg} />}

      {showInlineTip && model.bars.length > 0 && (
        <div
          style={{
            position: 'absolute', top: 12, left: 56, zIndex: 9,
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-main)',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 11, color: 'var(--color-text-secondary)',
            fontFamily: 'var(--font-mono)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span>Tip: haz clic en cualquier valor (cota o carga) para editarlo</span>
          <button
            onClick={onDismissInlineTip}
            style={{ background: 'transparent', border: 'none', color: 'var(--color-text-disabled)', cursor: 'pointer' }}
            aria-label="Ocultar"
          >×</button>
        </div>
      )}

      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        onClick={onClick}
        style={{
          display: 'block',
          width: '100%', height: '100%',
          cursor: tool === 'select' ? 'default' : 'crosshair',
        }}
      >
        <defs>
          <marker id="fem-arr-load" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            {/* `context-stroke` (SVG2) makes the arrowhead inherit the line's
                stroke, so the triangle always matches the lc color of the
                load it belongs to (or the accent when the load is selected). */}
            <path d="M0,0 L10,5 L0,10 Z" fill="context-stroke" />
          </marker>
          <marker id="fem-arr-react" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 Z" fill="var(--color-accent)" />
          </marker>
        </defs>

        <GroundLine yStrip={yStrip} size={size} />

        {/* Diagrams — global normalization across bars (Issue 3 fix: avoids the
            visual jumps at supports caused by per-bar normalization). */}
        {(() => {
          // Compute global peakAbs across ALL bars for the active diagram.
          const allBars = model.bars.map((b) => result.perBar[b.id]).filter(Boolean) as BarResult[];
          const env = (s: BarResult) => s.envelope?.[view.combo];
          const allM = allBars.flatMap((s) => env(s)?.M ?? s.M);
          const allV = allBars.flatMap((s) => env(s)?.V ?? s.V);
          const allDelta = allBars.flatMap((s) => env(s)?.delta ?? []);
          const globalPeakM = Math.max(...allM.map(Math.abs), 1e-6);
          const globalPeakV = Math.max(...allV.map(Math.abs), 1e-6);
          const globalPeakDelta = Math.max(...allDelta.map(Math.abs), 1e-9);

          return (
            <>
              {model.bars.map((bar) => {
                const r = result.perBar[bar.id];
                if (!r) return null;
                return (
                  <BarDiagrams
                    key={`d-${bar.id}`}
                    bar={bar} model={model} samples={r}
                    w2s={w2s} view={view}
                    globalPeakM={globalPeakM}
                    globalPeakV={globalPeakV}
                  />
                );
              })}
              {view.layer === 'deformed' && model.bars.map((bar) => (
                <DeformedBar
                  key={`def-${bar.id}`}
                  bar={bar} model={model}
                  samples={result.perBar[bar.id]}
                  w2s={w2s}
                  scale={view.deformedScale ?? 1}
                  globalPeakDelta={globalPeakDelta}
                  view={view}
                />
              ))}
            </>
          );
        })()}

        {/* Bars */}
        {model.bars.map((bar) => (
          <BarRenderer
            key={bar.id}
            bar={bar}
            model={model}
            result={result}
            view={view}
            selected={selected}
            w2s={w2s}
            tool={tool}
            onClick={() => setSelected({ kind: 'bar', id: bar.id })}
            onMouseEnter={() => setHoveredBar(bar.id)}
            onMouseLeave={() => setHoveredBar(null)}
          />
        ))}

        {/* Bar dimensions (cotas) — only in default layer (working state) */}
        {view.layer === 'none' && (
          <BarDimensions
            model={model}
            w2s={w2s}
            onEditLength={setBarLengthEdge}
          />
        )}

        {/* Loads — only in default layer (working state). Loads on the same
            target are stacked outward so they don't overlap; each load's color
            reflects its hipótesis (G/Q/W/S/E). */}
        {view.layer === 'none' && (() => {
          const stack = new Map<string, number>();
          const counter = new Map<string, number>();
          for (const ld of model.loads) {
            const key = ld.kind === 'point-node' ? `n:${ld.node}` : `b:${ld.bar}`;
            const next = counter.get(key) ?? 0;
            stack.set(ld.id, next);
            counter.set(key, next + 1);
          }
          return model.loads.map((ld) => (
            <LoadGlyph
              key={ld.id}
              load={ld}
              model={model}
              w2s={w2s}
              selected={selected}
              tool={tool}
              stackIndex={stack.get(ld.id) ?? 0}
              onClick={() => setSelected({ kind: 'load', id: ld.id })}
              onEditValue={setLoadValue}
            />
          ));
        })()}

        {/* Supports */}
        {model.supports.map((s, i) => {
          const node = model.nodes.find((n) => n.id === s.node);
          if (!node) return null;
          const [sx, sy] = w2s(node.x, 0);
          return <SupportGlyph key={i} sx={sx} sy={sy} type={s.type} />;
        })}

        {/* Nodes (top layer) */}
        {model.nodes.map((n) => {
          const [sx, sy] = w2s(n.x, 0);
          const isSel = selected?.kind === 'node' && selected.id === n.id;
          return (
            <g
              key={n.id}
              onClick={tool === 'select' ? (e) => { e.stopPropagation(); setSelected({ kind: 'node', id: n.id }); } : undefined}
              style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
            >
              <circle
                cx={sx} cy={sy} r={isSel ? 7 : 5}
                fill={isSel ? 'var(--color-accent)' : 'var(--color-bg-primary)'}
                stroke="var(--color-text-primary)" strokeWidth="1.6"
              />
              {/* Hinge glyph if any bar has internalHinges set at this node */}
              {nodeHasHinge(model, n.id) && (
                <circle cx={sx} cy={sy - 14} r={4} fill="var(--color-bg-primary)" stroke="var(--color-accent)" strokeWidth="1.5" />
              )}
              <text x={sx + 8} y={sy - 8} fontFamily="var(--font-mono)" fontSize="9" fill="var(--color-text-secondary)">
                {n.id}
              </text>
            </g>
          );
        })}

        {/* Reactions — only when reactions layer is active. Driven by view.combo. */}
        {view.layer === 'reactions' && (result.reactionsByCombo?.[view.combo] ?? result.reactions).map((r, i) => (
          <ReactionGlyph key={i} reaction={r} w2s={w2s} />
        ))}

        {/* "+vano" floating button */}
        {model.bars.length > 0 && (
          <AddVanoButton model={model} w2s={w2s} onClick={addVano} />
        )}

        {/* Tool hint */}
        <ToolHint tool={tool} />
      </svg>
    </div>
  );
}

// ── Helpers (top-level so they can be reused) ──────────────────────────────

function nextNodeIdInModel(m: DesignModel): string {
  let i = 1;
  while (m.nodes.find((n) => n.id === 'n' + i)) i++;
  return 'n' + i;
}
function nextBarIdInModel(m: DesignModel): string {
  let i = 1;
  while (m.bars.find((b) => b.id === 'b' + i)) i++;
  return 'b' + i;
}
function nextLoadIdInModel(m: DesignModel): string {
  let i = 1;
  while (m.loads.find((l) => l.id === 'l' + i)) i++;
  return 'l' + i;
}
function nodeHasHinge(model: DesignModel, nodeId: string): boolean {
  return model.bars.some((b) =>
    (b.i === nodeId && b.internalHinges.i) ||
    (b.j === nodeId && b.internalHinges.j),
  );
}

// Suppress unused-import warning for DESIGN_PRESETS while we keep it as a
// future extension point. Currently only used at the orchestrator level.
void DESIGN_PRESETS;

// ── Sub-components ─────────────────────────────────────────────────────────

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 9,
        background: 'rgba(239,68,68,0.12)',
        border: '1px solid var(--color-state-fail)',
        padding: '8px 12px', borderRadius: 4, maxWidth: 380,
        display: 'flex', gap: 8, alignItems: 'flex-start',
      }}
    >
      <span style={{ color: 'var(--color-state-fail)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>⚠</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-state-fail)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
          Estructura inestable
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{msg}</div>
      </div>
    </div>
  );
}

function GroundLine({ yStrip, size }: { yStrip: number; size: { w: number; h: number } }) {
  const ticks = 14;
  const yLine = yStrip + 24;
  return (
    <g opacity="0.35">
      <line x1={0} y1={yLine} x2={size.w} y2={yLine} stroke="var(--color-text-disabled)" strokeWidth="0.6" />
      {Array.from({ length: ticks }).map((_, i) => {
        const x = ((i + 0.5) * size.w) / ticks;
        return <line key={i} x1={x} y1={yLine} x2={x - 6} y2={yLine + 8} stroke="var(--color-text-disabled)" strokeWidth="0.5" />;
      })}
    </g>
  );
}

function SupportGlyph({ sx, sy, type }: { sx: number; sy: number; type: SupportType }) {
  const c = 'var(--color-text-primary)';
  if (type === 'fixed') {
    return (
      <g>
        <rect x={sx - 12} y={sy} width={24} height={4} fill={c} />
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={i} x1={sx - 10 + i * 5} y1={sy + 4} x2={sx - 14 + i * 5} y2={sy + 12} stroke={c} strokeWidth="1" />
        ))}
      </g>
    );
  }
  if (type === 'pinned') {
    return (
      <g fill="none" stroke={c} strokeWidth="1.5">
        <circle cx={sx} cy={sy} r={2} fill={c} />
        <path d={`M ${sx} ${sy} L ${sx - 9} ${sy + 13} L ${sx + 9} ${sy + 13} Z`} />
        <line x1={sx - 12} y1={sy + 13} x2={sx + 12} y2={sy + 13} />
      </g>
    );
  }
  if (type === 'roller') {
    return (
      <g fill="none" stroke={c} strokeWidth="1.5">
        <circle cx={sx} cy={sy} r={2} fill={c} />
        <path d={`M ${sx} ${sy} L ${sx - 8} ${sy + 10} L ${sx + 8} ${sy + 10} Z`} />
        <circle cx={sx - 5} cy={sy + 13} r={2} />
        <circle cx={sx + 5} cy={sy + 13} r={2} />
        <line x1={sx - 12} y1={sy + 17} x2={sx + 12} y2={sy + 17} />
      </g>
    );
  }
  return null;
}

function BarRenderer({
  bar, model, result, view, selected, w2s, tool, onClick, onMouseEnter, onMouseLeave,
}: {
  bar: DesignBar;
  model: DesignModel;
  result: SolveResult;
  view: ViewState;
  selected: Selected;
  w2s: (x: number, y: number) => [number, number];
  /** Active toolbar tool — clicks only select when tool='select'; otherwise the
   *  click bubbles to the SVG so the active tool (node/load/support/delete) can
   *  act on whatever's at the click position. */
  tool: ToolId;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const ni = model.nodes.find((n) => n.id === bar.i);
  const nj = model.nodes.find((n) => n.id === bar.j);
  if (!ni || !nj) return null;
  const [x1, y1] = w2s(ni.x, 0);
  const [x2, y2] = w2s(nj.x, 0);
  const isSel = selected?.kind === 'bar' && selected.id === bar.id;
  const r = result.perBar[bar.id];
  const stroke = isSel
    ? 'var(--color-accent)'
    : r && r.status === 'fail' ? 'var(--color-state-fail)'
    : r && r.status === 'warn' ? 'var(--color-state-warn)'
    : r && r.status === 'pending' ? 'var(--color-text-disabled)'
    : 'var(--color-text-primary)';
  const isSelectTool = tool === 'select';
  return (
    <g
      onClick={isSelectTool ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: isSelectTool ? 'pointer' : 'crosshair' }}
    >
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={stroke}
        strokeWidth={isSel ? 5 : 3}
        strokeDasharray={r?.status === 'pending' ? '4 3' : undefined}
        strokeLinecap="round"
      />
      {/* Per-bar verdict dot at midpoint — only visible in default and η% layers */}
      {(view.layer === 'none' || view.layer === 'eta') && r && r.status !== 'pending' && r.eta > 0 && (
        <circle
          cx={(x1 + x2) / 2} cy={(y1 + y2) / 2 - 12}
          r={3.5}
          fill={
            r.status === 'fail' ? 'var(--color-state-fail)'
            : r.status === 'warn' ? 'var(--color-state-warn)'
            : 'var(--color-state-ok)'
          }
        />
      )}
      {/* Bar id label — visible only in default layer (working state) */}
      {view.layer === 'none' && (
        <text
          x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 22}
          textAnchor="middle"
          fontFamily="var(--font-mono)" fontSize="9"
          fill="var(--color-text-disabled)"
          style={{ pointerEvents: 'none' }}
        >
          {bar.id}
        </text>
      )}
      {/* η% numeric label — only when η% layer is active */}
      {view.layer === 'eta' && r && r.status !== 'pending' && r.eta > 0 && (
        <text
          x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 22}
          textAnchor="middle"
          fontFamily="var(--font-mono)" fontSize="11"
          fontWeight="600"
          fill={
            r.status === 'fail' ? 'var(--color-state-fail)'
            : r.status === 'warn' ? 'var(--color-state-warn)'
            : 'var(--color-state-ok)'
          }
          style={{ pointerEvents: 'none' }}
        >
          η={(r.eta * 100).toFixed(0)}%
        </text>
      )}
    </g>
  );
}

function BarDimensions({
  model, w2s, onEditLength,
}: {
  model: DesignModel;
  w2s: (x: number, y: number) => [number, number];
  onEditLength: (barId: string, newL: number) => void;
}) {
  const items: React.ReactNode[] = [];
  for (const bar of model.bars) {
    const ni = model.nodes.find((n) => n.id === bar.i);
    const nj = model.nodes.find((n) => n.id === bar.j);
    if (!ni || !nj) continue;
    const L = Math.abs(nj.x - ni.x);
    const [x1, y1] = w2s(ni.x, 0);
    const [x2] = w2s(nj.x, 0);
    const yDim = y1 + 38;
    const xMid = (x1 + x2) / 2;
    items.push(
      <g key={`dim-${bar.id}`}>
        <line x1={x1} y1={yDim} x2={x2} y2={yDim} stroke="var(--color-text-secondary)" strokeWidth="1" />
        <line x1={x1} y1={yDim - 3} x2={x1} y2={yDim + 3} stroke="var(--color-text-secondary)" strokeWidth="1" />
        <line x1={x2} y1={yDim - 3} x2={x2} y2={yDim + 3} stroke="var(--color-text-secondary)" strokeWidth="1" />
        <foreignObject x={xMid - 30} y={yDim + 4} width={60} height={20}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <InlineEdit
              value={L}
              decimals={2}
              unit="m"
              min={0.1}
              onCommit={(newL) => onEditLength(bar.id, newL)}
              ariaLabel={`Luz barra ${bar.id}`}
            />
          </div>
        </foreignObject>
      </g>,
    );
  }
  return <g>{items}</g>;
}

/**
 * Color por hipótesis (CTE / EHE load case). Each lc gets a distinct hue so
 * mixed-case loads on the same bar are visually distinguishable.
 *   G — permanente   → amber  (state-warn)
 *   Q — sobrecarga   → green  (clearly different from W's blue)
 *   W — viento       → blue
 *   S — nieve        → slate (cool light)
 *   E — sismo        → red
 */
function lcColor(lc: LoadCase): string {
  switch (lc) {
    case 'G': return 'var(--color-state-warn)';
    case 'Q': return '#4ade80';
    case 'W': return '#60a5fa';
    case 'S': return '#cbd5e1';
    case 'E': return '#f87171';
    default:  return 'var(--color-state-warn)';
  }
}

function LoadGlyph({
  load, model, w2s, selected, tool, stackIndex, onClick, onEditValue,
}: {
  load: Load;
  model: DesignModel;
  w2s: (x: number, y: number) => [number, number];
  selected: Selected;
  tool: ToolId;
  /** Stack position among loads on the same target (0 = closest to bar/node).
   *  Used to offset upper loads outward so they don't overlap. */
  stackIndex: number;
  onClick: () => void;
  onEditValue: (loadId: string, value: number) => void;
}) {
  const isSelected = selected?.kind === 'load' && selected.id === load.id;
  const c = isSelected ? 'var(--color-accent)' : lcColor(load.lc);
  const isSelectTool = tool === 'select';
  const groupClick = isSelectTool ? (e: React.MouseEvent) => { e.stopPropagation(); onClick(); } : undefined;
  const groupCursor = isSelectTool ? 'pointer' : 'crosshair';

  if (load.kind === 'point-node') {
    const node = model.nodes.find((n) => n.id === load.node);
    if (!node) return null;
    const [sx, sy] = w2s(node.x, 0);
    const Py = load.Py ?? 0;
    if (Py === 0) return null;
    const len = 36;
    // V1.1 convention: Py > 0 = downward (gravity-positive). Screen +y is also
    // down, so for downward loads the tail sits ABOVE the bar (sy - len) and
    // the tip is just above the node (sy - 4) → arrow points DOWN.
    // Stacking: each subsequent load on the same node is pushed (len+4) further
    // outward in the same direction so the arrows don't overlap.
    const stackOff = stackIndex * (len + 4);
    const tailY = Py > 0 ? sy - (len + 4) - stackOff : sy + (len + 4) + stackOff;
    const tipY  = Py > 0 ? sy - 4         - stackOff : sy + 4         + stackOff;
    return (
      <g onClick={groupClick} style={{ cursor: groupCursor }}>
        <line x1={sx} y1={tailY} x2={sx} y2={tipY} stroke={c} strokeWidth="1.5" markerEnd="url(#fem-arr-load)" />
        <foreignObject x={sx + 4} y={(tailY + tipY) / 2 - 10} width={70} height={20}>
          <div>
            <InlineEdit
              value={Math.abs(Py)} unit="kN" decimals={1} min={0}
              onCommit={(v) => onEditValue(load.id, v)}
              ariaLabel={`Carga ${load.id}`}
            />
          </div>
        </foreignObject>
      </g>
    );
  }
  if (load.kind === 'udl' || load.kind === 'point-bar') {
    const bar = model.bars.find((b) => b.id === load.bar);
    if (!bar) return null;
    const ni = model.nodes.find((n) => n.id === bar.i);
    const nj = model.nodes.find((n) => n.id === bar.j);
    if (!ni || !nj) return null;
    const [x1, y1] = w2s(ni.x, 0);
    const [x2, y2] = w2s(nj.x, 0);
    if (load.kind === 'udl') {
      const OFF = 22;
      const isUp = load.dir === '+y';
      // UDL arrows always point TOWARD the bar. Stack: index 0 reaches the
      // bar; index N reaches the top line of UDL N-1 (sits on top of it).
      const baseTopOff = (stackIndex + 1) * OFF;  // distance bar → top of THIS UDL
      const baseTipOff = stackIndex * OFF;         // distance bar → arrow tip of THIS UDL
      const tailY1 = isUp ? y1 + baseTopOff : y1 - baseTopOff;
      const tailY2 = isUp ? y2 + baseTopOff : y2 - baseTopOff;
      const tipY1  = isUp ? y1 + baseTipOff : y1 - baseTipOff;
      const tipY2  = isUp ? y2 + baseTipOff : y2 - baseTipOff;
      const arrows = Math.max(4, Math.min(10, Math.round(Math.abs(x2 - x1) / 35)));
      const elems: React.ReactNode[] = [];
      elems.push(<line key="top" x1={x1} y1={tailY1} x2={x2} y2={tailY2} stroke={c} strokeWidth="1.2" />);
      // Arrowheads only on the lowest UDL (touching the bar) — upper UDLs use
      // plain lines so the visual reads as "stacked load distribution".
      const showArrowheads = stackIndex === 0;
      for (let i = 0; i <= arrows; i++) {
        const t = i / arrows;
        const tx = x1 + (x2 - x1) * t;
        const ty = tailY1 + (tailY2 - tailY1) * t;
        const ex = x1 + (x2 - x1) * t;
        const ey = tipY1 + (tipY2 - tipY1) * t;
        elems.push(
          <line
            key={i}
            x1={tx} y1={ty} x2={ex} y2={ey}
            stroke={c} strokeWidth="1"
            markerEnd={showArrowheads ? 'url(#fem-arr-load)' : undefined}
          />,
        );
      }
      const xMid = (x1 + x2) / 2;
      const yMid = (tailY1 + tailY2) / 2 - 14;
      return (
        <g onClick={groupClick} style={{ cursor: groupCursor }}>
          {elems}
          <foreignObject x={xMid - 40} y={yMid - 8} width={90} height={20}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <InlineEdit
                value={load.w} unit="kN/m" decimals={1} min={0}
                onCommit={(v) => onEditValue(load.id, v)}
                ariaLabel={`UDL ${load.id}`}
              />
            </div>
          </foreignObject>
        </g>
      );
    }
    if (load.kind === 'point-bar') {
      const t = load.pos != null ? load.pos : 0.5;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      const len = 32;
      const isUp = load.dir === '+y';
      // Stacking: each subsequent load on the same bar pushes (len+4) further
      // outward in the same direction so the arrows don't overlap.
      const stackOff = stackIndex * (len + 4);
      const tailY = isUp ? py + len + stackOff : py - len - stackOff;
      const tipY  = isUp ? py + 4 + stackOff   : py - 4 - stackOff;
      return (
        <g onClick={groupClick} style={{ cursor: groupCursor }}>
          <line x1={px} y1={tailY} x2={px} y2={tipY} stroke={c} strokeWidth="1.5" markerEnd="url(#fem-arr-load)" />
          <foreignObject x={px + 4} y={(tailY + tipY) / 2 - 10} width={70} height={20}>
            <div>
              <InlineEdit
                value={load.P} unit="kN" decimals={1} min={0}
                onCommit={(v) => onEditValue(load.id, v)}
                ariaLabel={`P ${load.id}`}
              />
            </div>
          </foreignObject>
        </g>
      );
    }
  }
  return null;
}

function ReactionGlyph({
  reaction, w2s,
}: {
  reaction: SolveResult['reactions'][number];
  w2s: (x: number, y: number) => [number, number];
}) {
  const c = 'var(--color-accent)';
  const [sx, sy] = w2s(reaction.x, 0);
  if (Math.abs(reaction.Ry) < 0.1) return null;
  const len = 30;
  const dir = reaction.Ry > 0 ? 1 : -1;
  const y0 = sy + dir * (len + 22);
  const y1 = sy + dir * 22;
  return (
    <g opacity="0.85">
      <line x1={sx} y1={y0} x2={sx} y2={y1} stroke={c} strokeWidth="1.4" markerEnd="url(#fem-arr-react)" />
      <text x={sx - 6} y={y0 + (dir > 0 ? -4 : 14)} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill={c}>
        R={Math.abs(reaction.Ry).toFixed(1)} kN
      </text>
    </g>
  );
}

/**
 * Find local extrema (sign changes in dM/dx) in a sample array. Returns the
 * indices of all peaks where |M| exceeds `threshold` of the global peak.
 * Endpoints are included when they're large (continuous-beam supports often
 * carry the peak hogging moment exactly at the boundary).
 */
function findLocalExtrema(arr: number[], globalPeak: number, threshold = 0.15): number[] {
  if (arr.length < 2) return [];
  const out: number[] = [];
  const minMagnitude = threshold * globalPeak;
  // Endpoints
  if (Math.abs(arr[0]) >= minMagnitude) out.push(0);
  // Interior local maxima/minima
  for (let i = 1; i < arr.length - 1; i++) {
    const dPrev = arr[i] - arr[i - 1];
    const dNext = arr[i + 1] - arr[i];
    if (dPrev * dNext < 0 && Math.abs(arr[i]) >= minMagnitude) {
      out.push(i);
    }
  }
  if (Math.abs(arr[arr.length - 1]) >= minMagnitude) out.push(arr.length - 1);
  return out;
}

function BarDiagrams({
  bar, model, samples, w2s, view, globalPeakM, globalPeakV,
}: {
  bar: DesignBar;
  model: DesignModel;
  samples: SolveResult['perBar'][string];
  w2s: (x: number, y: number) => [number, number];
  view: ViewState;
  /** Global peak |M| across all bars (Issue 3 — uniform visual scale). */
  globalPeakM: number;
  globalPeakV: number;
}) {
  if (!samples || samples.xs.length < 2) return null;
  const ni = model.nodes.find((n) => n.id === bar.i);
  const nj = model.nodes.find((n) => n.id === bar.j);
  if (!ni || !nj) return null;
  const xLow = Math.min(ni.x, nj.x);

  const elems: React.ReactNode[] = [];

  // V1.1 — pick samples from envelope[view.combo]; fall back to legacy.
  const env = samples.envelope?.[view.combo];
  const xs = env?.xs ?? samples.xs;
  const Marr = env?.M ?? samples.M;
  const Varr = env?.V ?? samples.V;

  if (view.layer === 'M') {
    const visualPeak = 38;
    const path = xs.map((xb, i) => {
      const xWorld = xLow + xb;
      const [px, py] = w2s(xWorld, 0);
      // Sagging (M+) plotted BELOW the bar (positive-y in screen).
      const yPx = py + (Marr[i] / globalPeakM) * visualPeak;
      return `${i === 0 ? 'M' : 'L'} ${px} ${yPx}`;
    }).join(' ');
    // Issue 1 — multiple extrema labels (sagging + hogging peaks per bar).
    const peakIndices = findLocalExtrema(Marr, globalPeakM, 0.15);
    elems.push(
      <g key="M" opacity="0.85" style={{ transition: 'opacity 150ms ease-in-out' }}>
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="1.4" />
        {peakIndices.map((idx) => {
          const v = Marr[idx];
          const [px, py] = w2s(xLow + xs[idx], 0);
          const yPx = py + (v / globalPeakM) * visualPeak;
          // Label offset: sagging (M+) below the curve, hogging (M-) above.
          const labelDy = v >= 0 ? 11 : -3;
          return (
            <g key={idx}>
              <circle cx={px} cy={yPx} r="2.5" fill="var(--color-accent)" />
              <text x={px + 4} y={yPx + labelDy} fontFamily="var(--font-mono)" fontSize="9" fill="var(--color-accent)">
                M={v.toFixed(1)} kN·m
              </text>
            </g>
          );
        })}
      </g>,
    );
  } else if (view.layer === 'V') {
    const visualPeak = 38;
    // Build the V curve.
    const curveSegs = xs.map((xb, i) => {
      const xWorld = xLow + xb;
      const [px, py] = w2s(xWorld, 0);
      const yPx = py - (Varr[i] / globalPeakV) * visualPeak;
      return `${i === 0 ? 'M' : 'L'} ${px} ${yPx}`;
    }).join(' ');
    // Closing verticals at supports/bar ends — V has discontinuities at every
    // reaction so the graph drops back to baseline with a vertical line so the
    // jump between adjacent vanos is legible.
    const [pxStart, pyStart] = w2s(xLow + xs[0], 0);
    const [pxEnd, pyEnd] = w2s(xLow + xs[xs.length - 1], 0);
    const yStart = pyStart - (Varr[0] / globalPeakV) * visualPeak;
    const yEnd = pyEnd - (Varr[Varr.length - 1] / globalPeakV) * visualPeak;
    // Filled polygon for the diagram zone (translucent), then the curve outline.
    const fillPath = `M ${pxStart} ${pyStart} L ${pxStart} ${yStart} ${curveSegs.replace(/^M [^ ]+ [^ ]+ /, '')} L ${pxEnd} ${pyEnd} Z`;
    const closingPath = `M ${pxStart} ${pyStart} L ${pxStart} ${yStart} M ${pxEnd} ${yEnd} L ${pxEnd} ${pyEnd}`;
    const peakIndices = findLocalExtrema(Varr, globalPeakV, 0.15);
    elems.push(
      <g key="V" opacity="0.85" style={{ transition: 'opacity 150ms ease-in-out' }}>
        <path d={fillPath} fill="#a78bfa" fillOpacity="0.08" stroke="none" />
        <path d={curveSegs} fill="none" stroke="#a78bfa" strokeWidth="1.4" />
        <path d={closingPath} fill="none" stroke="#a78bfa" strokeWidth="1.4" />
        {peakIndices.map((idx) => {
          const v = Varr[idx];
          const [px, py] = w2s(xLow + xs[idx], 0);
          const yPx = py - (v / globalPeakV) * visualPeak;
          const labelDy = v >= 0 ? -3 : 11;
          return (
            <g key={idx}>
              <circle cx={px} cy={yPx} r="2.5" fill="#a78bfa" />
              <text x={px + 4} y={yPx + labelDy} fontFamily="var(--font-mono)" fontSize="9" fill="#a78bfa">
                V={v.toFixed(1)} kN
              </text>
            </g>
          );
        })}
      </g>,
    );
  }
  // Other layers (none/reactions/deformed/eta) → no diagram drawn here.
  return <g>{elems}</g>;
}

function DeformedBar({
  bar, model, samples, w2s, scale, view, globalPeakDelta,
}: {
  bar: DesignBar;
  model: DesignModel;
  samples: SolveResult['perBar'][string] | undefined;
  w2s: (x: number, y: number) => [number, number];
  scale: number;
  view: ViewState;
  /** Global peak |delta| across all bars (uniform visual scale + label threshold). */
  globalPeakDelta: number;
}) {
  if (!samples || samples.xs.length < 2) return null;
  const ni = model.nodes.find((n) => n.id === bar.i);
  const nj = model.nodes.find((n) => n.id === bar.j);
  if (!ni || !nj) return null;
  const xLow = Math.min(ni.x, nj.x);

  // V1.1 — pull real Hermite-interpolated deflection samples from envelope.
  const env = samples.envelope?.[view.combo];
  if (!env || !env.delta || env.delta.length === 0) return null;
  const xs = env.xs;
  const delta = env.delta;

  // Visual scale: peak deflection mapped to ~28px (so a small δ doesn't disappear
  // and a huge one doesn't blow off the canvas). User can still scale via
  // view.deformedScale.
  const visualPeak = 28 * scale;
  const sx = (d: number) => (d / globalPeakDelta) * visualPeak;
  // Solver convention: +y up. Screen +y down. So a downward deflection (δ < 0)
  // should plot BELOW the bar (screen +y). yPx = py - sx(d) flips sign so δ<0
  // (down in physical) renders as +y in screen (down on canvas).
  const path = xs.map((xb, i) => {
    const xWorld = xLow + xb;
    const [px, py] = w2s(xWorld, 0);
    const yPx = py - sx(delta[i]);
    return `${i === 0 ? 'M' : 'L'} ${px} ${yPx}`;
  }).join(' ');

  // Per-vano extrema: max positive (upward) and max negative (downward) within
  // this bar. Only label if magnitude is ≥15% of global peak (skip near-zero
  // noise that would clutter short / lightly-loaded vanos).
  const labelThreshold = 0.15 * globalPeakDelta;
  let maxPosIdx = -1; let maxPosVal = 0;
  let maxNegIdx = -1; let maxNegVal = 0;
  for (let i = 0; i < delta.length; i++) {
    const d = delta[i];
    if (d > maxPosVal) { maxPosVal = d; maxPosIdx = i; }
    if (d < maxNegVal) { maxNegVal = d; maxNegIdx = i; }
  }
  const labels: { idx: number; val: number }[] = [];
  if (maxPosIdx >= 0 && Math.abs(maxPosVal) >= labelThreshold) labels.push({ idx: maxPosIdx, val: maxPosVal });
  if (maxNegIdx >= 0 && Math.abs(maxNegVal) >= labelThreshold) labels.push({ idx: maxNegIdx, val: maxNegVal });

  return (
    <g style={{ transition: 'opacity 150ms ease-in-out' }} opacity="0.85">
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="1.2" strokeDasharray="3 3" />
      {labels.map(({ idx, val }) => {
        const [px, py] = w2s(xLow + xs[idx], 0);
        const yPx = py - sx(val);
        // Label below the curve when peak is downward (δ<0), above when upward.
        const labelDy = val < 0 ? 11 : -3;
        const deltaMm = val * 1000; // m → mm
        return (
          <g key={idx}>
            <circle cx={px} cy={yPx} r="2.5" fill="var(--color-accent)" />
            <text x={px + 4} y={yPx + labelDy} fontFamily="var(--font-mono)" fontSize="9" fill="var(--color-accent)">
              δ={val < 0 ? '−' : '+'}{Math.abs(deltaMm).toFixed(1)} mm
            </text>
          </g>
        );
      })}
    </g>
  );
}

function AddVanoButton({
  model, w2s, onClick,
}: {
  model: DesignModel;
  w2s: (x: number, y: number) => [number, number];
  onClick: () => void;
}) {
  // Find rightmost node x.
  if (model.nodes.length === 0) return null;
  const xMax = Math.max(...model.nodes.map((n) => n.x));
  const [sx, sy] = w2s(xMax, 0);
  return (
    <g onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ cursor: 'pointer' }}>
      <circle cx={sx + 32} cy={sy} r={12} fill="var(--color-bg-elevated)" stroke="var(--color-accent)" strokeWidth="1.5" />
      <line x1={sx + 27} y1={sy} x2={sx + 37} y2={sy} stroke="var(--color-accent)" strokeWidth="1.5" />
      <line x1={sx + 32} y1={sy - 5} x2={sx + 32} y2={sy + 5} stroke="var(--color-accent)" strokeWidth="1.5" />
      <text x={sx + 32} y={sy + 26} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--color-text-disabled)">+ vano</text>
    </g>
  );
}

function ToolHint({ tool }: { tool: ToolId }) {
  const map: Record<ToolId, string> = {
    select: 'Click una barra, nodo o carga para seleccionar',
    node: 'Click sobre una barra para insertar un nodo intermedio',
    support: 'Click en un nodo para asignar/cambiar apoyo',
    load: 'Click en nodo (carga puntual) o barra (UDL)',
    delete: 'Click en un nodo, barra o carga para eliminar',
  };
  const text = map[tool];
  if (!text) return null;
  return (
    <g>
      <rect x={12} y={12} rx={4} ry={4} width={Math.max(220, text.length * 7)} height={26}
        fill="var(--color-bg-surface)" stroke="var(--color-border-main)" opacity="0.95" />
      <text x={22} y={29} fontFamily="var(--font-sans)" fontSize="11" fill="var(--color-text-secondary)">{text}</text>
    </g>
  );
}

