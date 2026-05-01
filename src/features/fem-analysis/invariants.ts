// FEM 2D — model invariants
//
// Edit-time validators that prevent the solver from running on degenerate
// or physically impossible models. Driven by the Codex outside-voice review
// (eng-review 2026-04-28): "User inserts a node exactly on an existing
// support, then toggles internal hinge ON. You generate a zero-length
// analysis element or duplicate constrained DOFs. solver.ts runs elimination
// without pivoting, returns NaN/huge values. PDF exports a plausible-looking
// but wrong design."
//
// These invariants run BEFORE every model mutation (insert node, toggle
// hinge, edit length, etc.) and BEFORE the solver pipeline. Failures are
// surfaced to the UI as toasts/banners; the mutation is rejected.

import type {
  DesignModel,
  Node,
  ModelError,
  Support,
  DesignBar,
} from './types';

/** Minimum allowed bar length (m). Smaller is rejected as numerical noise. */
export const MIN_BAR_LENGTH_M = 0.05;

/** Minimum distance between two nodes (m). Closer is treated as duplicate. */
export const MIN_NODE_SEPARATION_M = 1e-3;

/** Pre-mutation invariant — can a node be inserted at this world (x, y)? */
export interface NodeInsertResult {
  ok: boolean;
  reason?: string;
}

export function canInsertNode(
  model: Pick<DesignModel, 'nodes'>,
  x: number,
  y: number,
): NodeInsertResult {
  for (const n of model.nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < MIN_NODE_SEPARATION_M) {
      return {
        ok: false,
        reason: `Hay un nodo a menos de ${MIN_NODE_SEPARATION_M * 1000} mm en (${n.x.toFixed(3)}, ${n.y.toFixed(3)}). Snap o cancela.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Pre-mutation invariant — can the user toggle internal hinge at `nodeId`?
 *
 * Toggling a hinge ON at a node that already carries a support creates
 * incompatible BCs (the support restrains rotation while the hinge releases
 * it). We block this at the UI layer.
 */
export function canToggleHinge(
  model: Pick<DesignModel, 'supports'>,
  nodeId: string,
): NodeInsertResult {
  const sup = model.supports.find((s) => s.node === nodeId);
  if (sup) {
    return {
      ok: false,
      reason: `El nodo tiene un apoyo (${sup.type}). Quita el apoyo antes de añadir articulación, o usa un nodo intermedio.`,
    };
  }
  return { ok: true };
}

/** Pre-mutation invariant — can a bar's length be edited to `newL` meters? */
export function canEditBarLength(newL: number): NodeInsertResult {
  if (!Number.isFinite(newL)) {
    return { ok: false, reason: 'La luz debe ser un número finito.' };
  }
  if (newL < MIN_BAR_LENGTH_M) {
    return {
      ok: false,
      reason: `La luz mínima es ${MIN_BAR_LENGTH_M} m. Valor introducido: ${newL.toFixed(3)} m.`,
    };
  }
  return { ok: true };
}

// ── Whole-model validation (runs before solver pipeline) ────────────────────

export interface ModelValidation {
  errors: ModelError[];
  /** True iff there are no fail-severity errors. The solver only runs when ok. */
  ok: boolean;
}

/**
 * Validate the entire DesignModel against all invariants. Called by the
 * solver pipeline before autoDecompose. Returns the errors list; if any
 * have severity 'fail' the solver MUST NOT run.
 */
export function validateModel(model: DesignModel): ModelValidation {
  const errors: ModelError[] = [];

  errors.push(...checkBarsExist(model.bars));
  errors.push(...checkNodesUnique(model.nodes));
  errors.push(...checkBarsReferenceValidNodes(model.bars, model.nodes));
  errors.push(...checkBarsHaveLength(model.bars, model.nodes));
  errors.push(...checkSupportsReferenceValidNodes(model.supports, model.nodes));
  errors.push(...checkAtLeastOneSupport(model));
  errors.push(...checkAllBarsConnectedToSupport(model));
  errors.push(...checkSufficientReactions(model.supports));
  errors.push(...checkNoHingeOnSupport(model.bars, model.supports));
  errors.push(...checkNoBiarticulatedBar(model.bars));
  errors.push(...checkLoadsReferenceValidTargets(model));

  const hasFail = errors.some((e) => e.severity === 'fail');
  return { errors, ok: !hasFail };
}

// ── Individual checks ───────────────────────────────────────────────────────

function checkBarsExist(bars: DesignBar[]): ModelError[] {
  if (bars.length === 0) {
    return [
      {
        severity: 'warn',
        code: 'NO_BARS',
        msg: 'El modelo no tiene barras. Añade al menos una para calcular.',
      },
    ];
  }
  return [];
}

function checkNodesUnique(nodes: Node[]): ModelError[] {
  const errors: ModelError[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < MIN_NODE_SEPARATION_M) {
        errors.push({
          severity: 'fail',
          code: 'DUPLICATE_NODES',
          msg: `Nodos ${nodes[i].id} y ${nodes[j].id} están a ${(d * 1000).toFixed(2)} mm. Mínimo permitido: ${MIN_NODE_SEPARATION_M * 1000} mm.`,
        });
      }
    }
  }
  return errors;
}

function checkBarsReferenceValidNodes(bars: DesignBar[], nodes: Node[]): ModelError[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const errors: ModelError[] = [];
  for (const b of bars) {
    if (b.i === b.j) {
      errors.push({
        severity: 'fail',
        code: 'BAR_SELF_LOOP',
        msg: `Barra ${b.id} conecta el nodo ${b.i} consigo mismo.`,
      });
      continue;
    }
    if (!nodeIds.has(b.i)) {
      errors.push({
        severity: 'fail',
        code: 'BAR_NODE_MISSING',
        msg: `Barra ${b.id}: nodo i='${b.i}' no existe.`,
      });
    }
    if (!nodeIds.has(b.j)) {
      errors.push({
        severity: 'fail',
        code: 'BAR_NODE_MISSING',
        msg: `Barra ${b.id}: nodo j='${b.j}' no existe.`,
      });
    }
  }
  return errors;
}

function checkBarsHaveLength(bars: DesignBar[], nodes: Node[]): ModelError[] {
  const errors: ModelError[] = [];
  for (const b of bars) {
    const ni = nodes.find((n) => n.id === b.i);
    const nj = nodes.find((n) => n.id === b.j);
    if (!ni || !nj) continue; // already flagged above
    const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
    if (L < MIN_BAR_LENGTH_M) {
      errors.push({
        severity: 'fail',
        code: 'BAR_TOO_SHORT',
        msg: `Barra ${b.id} mide ${L.toFixed(4)} m (< ${MIN_BAR_LENGTH_M} m mínimo).`,
      });
    }
  }
  return errors;
}

function checkSupportsReferenceValidNodes(
  supports: Support[],
  nodes: Node[],
): ModelError[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const errors: ModelError[] = [];
  for (const s of supports) {
    if (!nodeIds.has(s.node)) {
      errors.push({
        severity: 'fail',
        code: 'SUPPORT_NODE_MISSING',
        msg: `Apoyo en nodo '${s.node}' que no existe.`,
      });
    }
  }
  return errors;
}

function checkAtLeastOneSupport(model: Pick<DesignModel, 'bars' | 'supports'>): ModelError[] {
  if (model.bars.length === 0) return []; // covered by NO_BARS warn
  if (model.supports.length === 0) {
    return [
      {
        severity: 'fail',
        code: 'NO_SUPPORTS',
        msg: 'Estructura inestable: no hay apoyos definidos.',
      },
    ];
  }
  return [];
}

function checkAllBarsConnectedToSupport(
  model: Pick<DesignModel, 'bars' | 'supports' | 'nodes'>,
): ModelError[] {
  if (model.bars.length === 0 || model.supports.length === 0) return [];

  // BFS from supported nodes, mark every reachable node.
  const supNodes = new Set(model.supports.map((s) => s.node));
  const adj: Record<string, string[]> = {};
  for (const b of model.bars) {
    (adj[b.i] = adj[b.i] || []).push(b.j);
    (adj[b.j] = adj[b.j] || []).push(b.i);
  }
  const visited = new Set<string>();
  const queue: string[] = [...supNodes];
  while (queue.length) {
    const n = queue.shift();
    if (n === undefined || visited.has(n)) continue;
    visited.add(n);
    for (const m of adj[n] || []) if (!visited.has(m)) queue.push(m);
  }

  const floating = model.bars.filter(
    (b) => !visited.has(b.i) && !visited.has(b.j),
  );
  if (floating.length > 0) {
    return [
      {
        severity: 'fail',
        code: 'FLOATING_BARS',
        msg: `Hay ${floating.length} barra(s) sin conexión a apoyos: ${floating.map((b) => b.id).join(', ')}.`,
      },
    ];
  }
  return [];
}

function checkSufficientReactions(supports: Support[]): ModelError[] {
  if (supports.length === 0) return []; // covered above
  // 2D plane: 3 reaction components needed for static equilibrium.
  // fixed = 3 (Rx, Ry, Mz), pinned = 2 (Rx, Ry), roller = 1 (Ry only),
  // spring = 1 (one elastic restraint). A pinned + roller alone gives 3.
  const reactComps = supports.reduce(
    (s, sup) =>
      s +
      (sup.type === 'fixed'
        ? 3
        : sup.type === 'pinned'
          ? 2
          : 1),
    0,
  );
  if (reactComps < 3) {
    return [
      {
        severity: 'warn',
        code: 'INSUFFICIENT_REACTIONS',
        msg: `Solo ${reactComps} componente(s) de reacción — se necesitan al menos 3 para equilibrio 2D.`,
      },
    ];
  }
  return [];
}

function checkNoHingeOnSupport(
  bars: DesignBar[],
  supports: Support[],
): ModelError[] {
  const supNodes = new Set(supports.map((s) => s.node));
  const errors: ModelError[] = [];
  for (const b of bars) {
    if (b.internalHinges.i && supNodes.has(b.i)) {
      errors.push({
        severity: 'fail',
        code: 'HINGE_ON_SUPPORT',
        msg: `Barra ${b.id}: articulación interna en el extremo i (${b.i}) que ya tiene apoyo. Incompatible.`,
      });
    }
    if (b.internalHinges.j && supNodes.has(b.j)) {
      errors.push({
        severity: 'fail',
        code: 'HINGE_ON_SUPPORT',
        msg: `Barra ${b.id}: articulación interna en el extremo j (${b.j}) que ya tiene apoyo. Incompatible.`,
      });
    }
  }
  return errors;
}

function checkNoBiarticulatedBar(bars: DesignBar[]): ModelError[] {
  const errors: ModelError[] = [];
  for (const b of bars) {
    if (b.internalHinges.i && b.internalHinges.j) {
      errors.push({
        severity: 'fail',
        code: 'BIARTICULATED_BAR',
        msg: `Barra ${b.id} tiene articulación en ambos extremos — sin rigidez a flexión (mecanismo).`,
      });
    }
  }
  return errors;
}

function checkLoadsReferenceValidTargets(model: DesignModel): ModelError[] {
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const barIds = new Set(model.bars.map((b) => b.id));
  const errors: ModelError[] = [];
  for (const ld of model.loads) {
    if (ld.kind === 'point-node') {
      if (!nodeIds.has(ld.node)) {
        errors.push({
          severity: 'fail',
          code: 'LOAD_TARGET_MISSING',
          msg: `Carga ${ld.id}: nodo destino '${ld.node}' no existe.`,
        });
      }
    } else {
      if (!barIds.has(ld.bar)) {
        errors.push({
          severity: 'fail',
          code: 'LOAD_TARGET_MISSING',
          msg: `Carga ${ld.id}: barra destino '${ld.bar}' no existe.`,
        });
      }
      if (ld.kind === 'point-bar') {
        if (ld.pos < 0 || ld.pos > 1) {
          errors.push({
            severity: 'fail',
            code: 'LOAD_POS_OUT_OF_RANGE',
            msg: `Carga ${ld.id}: posición ${ld.pos} fuera del rango [0, 1].`,
          });
        }
      }
      if (ld.kind === 'udl' && ld.from != null && ld.to != null) {
        if (ld.from < 0 || ld.to > 1 || ld.from >= ld.to) {
          errors.push({
            severity: 'fail',
            code: 'LOAD_PARTIAL_RANGE_INVALID',
            msg: `Carga ${ld.id}: rango parcial [${ld.from}, ${ld.to}] inválido (debe estar en [0, 1] y from < to).`,
          });
        }
      }
    }
  }
  return errors;
}
