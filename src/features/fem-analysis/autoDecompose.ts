// FEM 2D — autoDecompose
//
// Translates the user-facing DesignModel (one bar per vano, hinges as flags
// on the bar endpoints, partial UDLs, point-on-bar loads, mid-bar nodes the
// user inserted) into an AnalysisModel that the solver can consume directly:
//
//   - Each AnalysisElement has CONSTANT distributed load q (or zero).
//   - Point-on-bar loads become nodal point loads at auto-inserted analysis
//     nodes that split the design bar.
//   - Internal-hinge flags on design bar endpoints become end-condition flags
//     (rotZ_i / rotZ_j 'released') on the adjacent analysis element.
//   - Self-weight (when model.selfWeight is true) contributes a per-element
//     UDL on the 'G' load case, computed from rcSection (γ_concrete · b · h)
//     for HA bars or steel-profile A (γ_steel · A) for steel bars.
//   - Loads are bucketed by load case for solver superposition. V1 keeps every
//     LoadCase entry as-is (G, Q, W, S, E); the solver runs once per non-empty
//     case and the adapter combines envelopes via ELU = 1.35·G + 1.5·var, etc.
//
// V1 constraints assumed on input (enforced by invariants.ts):
//   - All nodes at y = 0 (collinear horizontal strip).
//   - No bars with both ends articulated (mecanismo, rejected upstream).
//   - No nodes inserted on a support (DOF clash, rejected upstream).
//
// SI conversions (kept centralized here; adapters inherit the SI values):
//   E [kN/m²]  = E [MPa]   × 1e3
//   I [m⁴]    = I [cm⁴]  × 1e-8
//   A [m²]    = A [cm²]  × 1e-4
//   b·h [m²]  = b[cm]·h[cm] × 1e-4
//   q_sw [kN/m] = γ [kN/m³] × A [m²]

import { MAT } from './presets';
import type {
  AnalysisBC,
  AnalysisElement,
  AnalysisLoadCase,
  AnalysisModel,
  AnalysisNode,
  AnalysisPointLoad,
  DesignBar,
  DesignModel,
  LoadCase,
  Node,
} from './types';

const EPS = 1e-6;
const GAMMA_CONCRETE = 25;     // kN/m³
const GAMMA_STEEL = 78.5;      // kN/m³

// ── Public entry point ──────────────────────────────────────────────────────

export function autoDecompose(model: DesignModel): AnalysisModel {
  const nodesById = new Map<string, Node>();
  for (const n of model.nodes) nodesById.set(n.id, n);

  // Build the per-bar plan: anchor positions + element lengths + node IDs.
  // We accumulate analysis elements + a per-element load context that we'll
  // sweep into per-load-case payloads at the end.
  const elements: AnalysisElement[] = [];
  // Element-context lookup: given an analysis element index, find the design
  // bar it belongs to and the [x_local_i, x_local_j] interval (in canonical
  // orientation, x_low → x_high) so that load distribution can match per UDL.
  type ElemCtx = {
    designBarId: string;
    xLowGlobal: number;     // global x of element's lower-x end
    xHighGlobal: number;    // global x of element's higher-x end
    localLowOnBar: number;  // x_local_low / barLength (∈ [0, 1])
    localHighOnBar: number;
  };
  const elemCtx: ElemCtx[] = [];

  // Analysis-node registry: keyed by id. Auto-inserted nodes get ids
  // `${designBarId}_split_${idx}`. Existing design nodes keep their ids.
  const nodeRegistry = new Map<string, AnalysisNode>();
  function ensureAnalysisNode(id: string, x: number, designNodeId?: string) {
    if (!nodeRegistry.has(id)) {
      nodeRegistry.set(id, { id, x, designNodeId });
    }
  }
  // Pre-populate registry with all existing design nodes so they're
  // discoverable even if no bar-anchor walk creates them.
  for (const n of model.nodes) ensureAnalysisNode(n.id, n.x, n.id);

  // Track the analysis-node id at each anchor position so loads can resolve
  // their target node even when the anchor was auto-inserted by a different
  // bar's processing (rare but possible if two bars meet at a non-design x).
  // Keyed by x rounded to EPS resolution.
  const anchorNodeByX = new Map<string, string>();
  function keyForX(x: number): string {
    return (Math.round(x / EPS) * EPS).toFixed(9);
  }
  function rememberAnchor(x: number, nodeId: string) {
    anchorNodeByX.set(keyForX(x), nodeId);
  }
  function lookupAnchor(x: number): string | undefined {
    return anchorNodeByX.get(keyForX(x));
  }
  for (const n of model.nodes) rememberAnchor(n.x, n.id);

  // ── Per-bar decomposition ────────────────────────────────────────────────

  for (const bar of model.bars) {
    const ni = nodesById.get(bar.i);
    const nj = nodesById.get(bar.j);
    if (!ni || !nj) continue; // invariants would have flagged this

    // Canonical orientation: lowEnd = the node with lower x, highEnd = higher x.
    const reversed = ni.x > nj.x;
    const lowNode = reversed ? nj : ni;
    const highNode = reversed ? ni : nj;
    const xLow = lowNode.x;
    const xHigh = highNode.x;
    const L = xHigh - xLow;
    if (L < EPS) continue; // invariants would have flagged

    // Hinges canonical to lowNode/highNode.
    const hingeAtLow = reversed ? bar.internalHinges.j : bar.internalHinges.i;
    const hingeAtHigh = reversed ? bar.internalHinges.i : bar.internalHinges.j;

    // Collect anchor x_local positions on this bar.
    const anchorsLocal: number[] = [0, L];

    // (a) Mid-bar nodes from model.nodes (excluding bar endpoints).
    for (const n of model.nodes) {
      if (n.id === lowNode.id || n.id === highNode.id) continue;
      if (Math.abs(n.y) > EPS) continue; // not on the strip
      const xLocal = n.x - xLow;
      if (xLocal > EPS && xLocal < L - EPS) anchorsLocal.push(xLocal);
    }

    // (b) Interior supports: rare but handled. A support whose node sits
    //     between the bar's endpoints (and isn't one of them) becomes an
    //     anchor too, since the BC must be applied at that analysis node.
    for (const s of model.supports) {
      if (s.node === lowNode.id || s.node === highNode.id) continue;
      const supNode = nodesById.get(s.node);
      if (!supNode) continue;
      if (Math.abs(supNode.y) > EPS) continue;
      const xLocal = supNode.x - xLow;
      if (xLocal > EPS && xLocal < L - EPS) anchorsLocal.push(xLocal);
    }

    // (c) Loads on this bar that introduce discontinuities.
    for (const ld of model.loads) {
      if (ld.kind === 'point-bar' && ld.bar === bar.id) {
        const xLocalDirected = ld.pos * L; // pos is along i→j of the design bar
        const xLocal = reversed ? L - xLocalDirected : xLocalDirected;
        if (xLocal > EPS && xLocal < L - EPS) anchorsLocal.push(xLocal);
      } else if (ld.kind === 'udl' && ld.bar === bar.id) {
        if (ld.from != null && ld.to != null) {
          const fromDirected = ld.from * L;
          const toDirected = ld.to * L;
          const xLocalFrom = reversed ? L - toDirected : fromDirected;
          const xLocalTo = reversed ? L - fromDirected : toDirected;
          if (xLocalFrom > EPS && xLocalFrom < L - EPS) anchorsLocal.push(xLocalFrom);
          if (xLocalTo > EPS && xLocalTo < L - EPS) anchorsLocal.push(xLocalTo);
        }
      }
    }

    // Sort + dedupe (epsilon).
    anchorsLocal.sort((a, b) => a - b);
    const dedup: number[] = [anchorsLocal[0]];
    for (let i = 1; i < anchorsLocal.length; i++) {
      if (anchorsLocal[i] - dedup[dedup.length - 1] > EPS) dedup.push(anchorsLocal[i]);
    }

    // Resolve anchor → analysis node id. Existing nodes (design, mid-bar,
    // interior supports) keep their ids. Auto-anchors (load-induced) get
    // synthetic ids per bar.
    let autoIdx = 0;
    const anchorIds: string[] = dedup.map((xLocal) => {
      const xGlobal = xLow + xLocal;
      const existing = lookupAnchor(xGlobal);
      if (existing) return existing;
      const id = `${bar.id}_split_${autoIdx++}`;
      ensureAnalysisNode(id, xGlobal, undefined);
      rememberAnchor(xGlobal, id);
      return id;
    });
    // Ensure endpoint design-node anchors are registered (xLow corresponds to
    // lowNode.id, xHigh to highNode.id).
    ensureAnalysisNode(lowNode.id, xLow, lowNode.id);
    ensureAnalysisNode(highNode.id, xHigh, highNode.id);

    // Section properties → SI EI/EA.
    const { EI, EA } = computeStiffness(bar);

    // Self-weight contribution (constant kN/m, signed -y if enabled).
    const q_sw = model.selfWeight ? -computeSelfWeight(bar) : 0;

    // Generate analysis elements between consecutive anchors.
    for (let i = 0; i < dedup.length - 1; i++) {
      const xLocalI = dedup[i];
      const xLocalJ = dedup[i + 1];
      const elemL = xLocalJ - xLocalI;
      if (elemL < EPS) continue; // shouldn't happen after dedupe

      const isFirst = i === 0;
      const isLast = i === dedup.length - 2;
      const rotZ_i: 'continuous' | 'released' =
        isFirst && hingeAtLow ? 'released' : 'continuous';
      const rotZ_j: 'continuous' | 'released' =
        isLast && hingeAtHigh ? 'released' : 'continuous';

      const id = `${bar.id}_e${i}`;
      elements.push({
        id,
        designBarId: bar.id,
        i_node: anchorIds[i],
        j_node: anchorIds[i + 1],
        length: elemL,
        EI,
        EA,
        rotZ_i,
        rotZ_j,
        q: 0,        // populated per-load-case below; this field stays as a base "current combo q" placeholder for the legacy sample; per-LC q lives in loadCases[]
        q_sw,
      });
      elemCtx.push({
        designBarId: bar.id,
        xLowGlobal: xLow + xLocalI,
        xHighGlobal: xLow + xLocalJ,
        localLowOnBar: xLocalI / L,
        localHighOnBar: xLocalJ / L,
      });
    }
  }

  // ── Build per-load-case payloads ─────────────────────────────────────────

  const loadCases = buildLoadCases(model, elements, elemCtx, lookupAnchor, anchorNodeByX);

  // ── BCs from supports ────────────────────────────────────────────────────

  const bcs: AnalysisBC[] = [];
  for (const s of model.supports) {
    const node = nodesById.get(s.node);
    if (!node) continue;
    bcs.push({
      node: s.node,
      fixY: true, // every support type restrains vertical translation
      fixRot: s.type === 'fixed', // pinned/roller/spring leave rotation free
    });
  }

  return {
    nodes: Array.from(nodeRegistry.values()).sort((a, b) => a.x - b.x),
    elements,
    bcs,
    loadCases,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function computeStiffness(bar: DesignBar): { EI: number; EA: number } {
  if (bar.material === 'rc') {
    const sec = bar.rcSection;
    if (!sec) return { EI: 0, EA: 0 };
    // E from EC2-ish: 8500 · ∛(fck+8) MPa, kept consistent with the legacy
    // setRcCustom helper in presets.ts so user-facing E stays stable.
    const E_MPa = 8500 * Math.cbrt(sec.fck + 8);
    const I_cm4 = (sec.b * Math.pow(sec.h, 3)) / 12; // cm⁴
    const A_cm2 = sec.b * sec.h;                      // cm²
    const EI = E_MPa * 1e3 * I_cm4 * 1e-8; // kN/m² · m⁴ = kN·m²
    const EA = E_MPa * 1e3 * A_cm2 * 1e-4; // kN/m² · m²  = kN
    return { EI, EA };
  }
  // steel
  const sel = bar.steelSelection;
  if (!sel) return { EI: 0, EA: 0 };
  const profile = MAT[sel.profileKey];
  if (!profile || profile.kind !== 'steel') return { EI: 0, EA: 0 };
  const EI = profile.E * 1e3 * profile.I * 1e-8;
  const EA = profile.E * 1e3 * profile.A * 1e-4;
  return { EI, EA };
}

function computeSelfWeight(bar: DesignBar): number {
  // Returns positive magnitude (kN/m). Caller applies sign for gravity.
  if (bar.material === 'rc') {
    const sec = bar.rcSection;
    if (!sec) return 0;
    return GAMMA_CONCRETE * sec.b * 0.01 * sec.h * 0.01; // kN/m³ · m · m
  }
  const sel = bar.steelSelection;
  if (!sel) return 0;
  const profile = MAT[sel.profileKey];
  if (!profile || profile.kind !== 'steel') return 0;
  return GAMMA_STEEL * profile.A * 1e-4; // kN/m³ · m²
}

function buildLoadCases(
  model: DesignModel,
  elements: AnalysisElement[],
  elemCtx: Array<{ designBarId: string; xLowGlobal: number; xHighGlobal: number; localLowOnBar: number; localHighOnBar: number }>,
  _lookupAnchor: (x: number) => string | undefined,
  _anchorNodeByX: Map<string, string>,
): AnalysisLoadCase[] {
  void _lookupAnchor;
  void _anchorNodeByX;

  // Determine which load cases will exist. V1 buckets all variable cases as
  // they appear (Q, W, S, E) — solver and adapter consume them; V1 combos
  // sum them; V1.5 will apply ψ-specific factors per case.
  const caseOrder: LoadCase[] = ['G', 'Q', 'W', 'S', 'E'];
  const present = new Set<LoadCase>();
  for (const ld of model.loads) present.add(ld.lc);
  if (model.selfWeight) present.add('G');

  const out: AnalysisLoadCase[] = [];
  for (const lc of caseOrder) {
    if (!present.has(lc)) continue;
    const q = new Array<number>(elements.length).fill(0);
    const pointLoads: AnalysisPointLoad[] = [];

    // Self-weight only contributes to 'G'.
    if (lc === 'G' && model.selfWeight) {
      for (let i = 0; i < elements.length; i++) {
        q[i] += elements[i].q_sw;
      }
    }

    // Distribute UDLs on bars + register point loads.
    for (const ld of model.loads) {
      if (ld.lc !== lc) continue;

      if (ld.kind === 'point-node') {
        // V1.1 sign convention: Py > 0 = downward (engineering / gravity-positive).
        // The femSolver works in physics convention (gravity = -y), so negate
        // here at the boundary. UDLs use the explicit `dir` field instead and
        // don't need this flip.
        pointLoads.push({
          node: ld.node,
          Py: -(ld.Py ?? 0),
          M: 0,
          lc,
        });
      } else if (ld.kind === 'udl') {
        const sign = ld.dir === '-y' ? -1 : 1;
        const w = sign * Math.abs(ld.w);
        // Determine the global-x window covered by this UDL on its bar.
        const bar = model.bars.find((b) => b.id === ld.bar);
        if (!bar) continue;
        const xi = model.nodes.find((n) => n.id === bar.i)?.x;
        const xj = model.nodes.find((n) => n.id === bar.j)?.x;
        if (xi == null || xj == null) continue;
        const xLow = Math.min(xi, xj);
        const xHigh = Math.max(xi, xj);
        const L = xHigh - xLow;
        const reversed = xi > xj;
        let coverLowGlobal: number;
        let coverHighGlobal: number;
        if (ld.from != null && ld.to != null) {
          const fromDirected = ld.from * L;
          const toDirected = ld.to * L;
          if (reversed) {
            coverLowGlobal = xLow + (L - toDirected);
            coverHighGlobal = xLow + (L - fromDirected);
          } else {
            coverLowGlobal = xLow + fromDirected;
            coverHighGlobal = xLow + toDirected;
          }
        } else {
          coverLowGlobal = xLow;
          coverHighGlobal = xHigh;
        }
        // For each element on this bar, add w if the element midpoint falls
        // within the UDL coverage window.
        for (let i = 0; i < elements.length; i++) {
          const ctx = elemCtx[i];
          if (ctx.designBarId !== ld.bar) continue;
          const mid = 0.5 * (ctx.xLowGlobal + ctx.xHighGlobal);
          if (mid >= coverLowGlobal - EPS && mid <= coverHighGlobal + EPS) {
            q[i] += w;
          }
        }
      } else if (ld.kind === 'point-bar') {
        const sign = ld.dir === '-y' ? -1 : 1;
        const P = sign * Math.abs(ld.P);
        const bar = model.bars.find((b) => b.id === ld.bar);
        if (!bar) continue;
        const xi = model.nodes.find((n) => n.id === bar.i)?.x;
        const xj = model.nodes.find((n) => n.id === bar.j)?.x;
        if (xi == null || xj == null) continue;
        const xLow = Math.min(xi, xj);
        const xHigh = Math.max(xi, xj);
        const L = xHigh - xLow;
        const reversed = xi > xj;
        const xLocalDirected = ld.pos * L;
        const xLocal = reversed ? L - xLocalDirected : xLocalDirected;
        const xGlobal = xLow + xLocal;
        // Find the analysis node at this x (it MUST exist because the
        // anchor-collection step inserted one).
        const targetNode = findNodeIdAtX(elements, elemCtx, xGlobal);
        if (targetNode) {
          pointLoads.push({
            node: targetNode,
            Py: P,
            M: 0,
            lc,
          });
        }
      }
    }

    out.push({ lc, q, pointLoads });
  }
  return out;
}

function findNodeIdAtX(
  elements: AnalysisElement[],
  elemCtx: Array<{ xLowGlobal: number; xHighGlobal: number }>,
  x: number,
): string | undefined {
  for (let i = 0; i < elements.length; i++) {
    if (Math.abs(elemCtx[i].xLowGlobal - x) < EPS) return elements[i].i_node;
    if (Math.abs(elemCtx[i].xHighGlobal - x) < EPS) return elements[i].j_node;
  }
  return undefined;
}
