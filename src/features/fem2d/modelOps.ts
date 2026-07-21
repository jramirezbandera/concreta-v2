// FEM 2D — pure editor operations over the Fem2DModel.
//
// Every canvas tool and inspector edit funnels through these functions: pure,
// immutable, testable without DOM. One committed op = one history snapshot
// (the shell calls setModel(m => op(m, …)) exactly once per gesture).
//
// Contract:
//   - Structural ops stamp `templateId: 'custom'` (honest provenance for the
//     PDF header once the model no longer matches its seed template).
//   - Ops that can fail return OpResult; `applyGuard` re-validates the
//     candidate with validateModel2DBasic and rejects any op that introduces a
//     NEW fail (two safety layers, mirroring the 1D invariants.ts split — the
//     pipeline still gates independently).
//   - Role auto-inference (user decision): vertical → 'pilar', anything else →
//     'viga', re-run ONLY on geometry changes and only while the member's role
//     is still one of {pilar, viga} and not manually overridden. Template
//     semantic roles (cordon/diagonal/montante) are never re-inferred away.

import { validateModel2DBasic } from './builder';
import {
  FEM2D_MAX_MEMBERS,
  FEM2D_MAX_NODES,
  MIN_MEMBER_LENGTH_M,
  type ArmadoHA,
  type Fem2DLoad,
  type Fem2DMember,
  type Fem2DModel,
  type Fem2DNode,
  type Fem2DSupport,
  type LoadCase,
  type MemberRole,
  type RcColumnCage,
  type RcSection,
  type Steel2DSelection,
  type Support2DType,
  type TimberSection,
  type UseCategoryCode,
} from './types';

// ── Editor-level types (shared by canvas, palette and shell) ────────────────

export type Tool2DId =
  | 'select'
  | 'node'
  | 'bar'
  | 'support'
  | 'load-udl'
  | 'load-udl-h'
  | 'load-point'
  | 'load-h'
  | 'copy-props'
  | 'delete';

/** Id sets of a marquee (window/crossing) selection. */
export interface SelectionSet2D {
  nodes: string[];
  members: string[];
  loads: string[];
}

export type Selected2D =
  | { kind: 'node'; id: string }
  | { kind: 'member'; id: string }
  | { kind: 'load'; id: string }
  | ({ kind: 'multi' } & SelectionSet2D)
  | null;

export type OpResult = { ok: true; model: Fem2DModel } | { ok: false; reason: string };

// ── Selection helpers (marquee + Shift-click, pure) ─────────────────────────

/** Any Selected2D as its raw id-set form (null → empty sets, always fresh). */
export function selectionToSet(selected: Selected2D): SelectionSet2D {
  if (!selected) return { nodes: [], members: [], loads: [] };
  if (selected.kind === 'multi') {
    return { nodes: [...selected.nodes], members: [...selected.members], loads: [...selected.loads] };
  }
  const set: SelectionSet2D = { nodes: [], members: [], loads: [] };
  if (selected.kind === 'node') set.nodes.push(selected.id);
  else if (selected.kind === 'member') set.members.push(selected.id);
  else set.loads.push(selected.id);
  return set;
}

/** Collapse a raw id-set to the tightest Selected2D: empty → null, a single
 *  element → its singular kind, otherwise multi. */
export function normalizeSelection(set: SelectionSet2D): Selected2D {
  const total = set.nodes.length + set.members.length + set.loads.length;
  if (total === 0) return null;
  if (total === 1) {
    if (set.nodes.length === 1) return { kind: 'node', id: set.nodes[0] };
    if (set.members.length === 1) return { kind: 'member', id: set.members[0] };
    return { kind: 'load', id: set.loads[0] };
  }
  return { kind: 'multi', nodes: set.nodes, members: set.members, loads: set.loads };
}

/** Toggle one element in/out of the current selection (Shift-click). */
export function toggleInSelection(
  selected: Selected2D,
  kind: 'node' | 'member' | 'load',
  id: string,
): Selected2D {
  const set = selectionToSet(selected);
  const arr = kind === 'node' ? set.nodes : kind === 'member' ? set.members : set.loads;
  const idx = arr.indexOf(id);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(id);
  return normalizeSelection(set);
}

/** Union two id-sets (Shift-drag adds the rectangle to the current selection),
 *  de-duplicating each collection. */
export function unionSelections(a: SelectionSet2D, b: SelectionSet2D): SelectionSet2D {
  return {
    nodes: [...new Set([...a.nodes, ...b.nodes])],
    members: [...new Set([...a.members, ...b.members])],
    loads: [...new Set([...a.loads, ...b.loads])],
  };
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Placement snap (m) — same 0.1 m grid as the 1D canvas. */
export const SNAP_M = 0.1;
/** Minimum node separation (m) when placing free nodes (mirrors 1D). */
export const MIN_NODE_SEPARATION_M = 1e-3;
/** Default profile for members drawn from scratch (FTUX-neutral IPE). */
export const DEFAULT_STEEL_2D: Steel2DSelection = { profileKey: 'steel_IPE240', steel: 'S275' };

/**
 * HA defaults stamped when a member switches to hormigón — the editor
 * philosophy is seeds + live verdict (like the 1D FTUX presets), never a
 * pending dance waiting for armado. `loadType: 'custom'` on purpose: in 2D the
 * ψ2 factors come from the per-load useCategory via the multi-principal
 * combinations, so the section-level loadType is engine plumbing only.
 */
export const DEFAULT_RC_BEAM_SECTION_2D: RcSection = {
  b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'custom',
};
export const DEFAULT_RC_COLUMN_SECTION_2D: RcSection = {
  b: 30, h: 30, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'custom',
};
export const DEFAULT_VANO_ARMADO_2D: ArmadoHA = {
  tens_nBars: 4, tens_barDiam: 16,
  comp_nBars: 2, comp_barDiam: 12,
  stirrupDiam: 8, stirrupSpacing: 150, stirrupLegs: 2,
};
export const DEFAULT_APOYO_ARMADO_2D: ArmadoHA = {
  tens_nBars: 3, tens_barDiam: 16,
  comp_nBars: 2, comp_barDiam: 12,
  stirrupDiam: 8, stirrupSpacing: 100, stirrupLegs: 2,
};
export const DEFAULT_COLUMN_CAGE_2D: RcColumnCage = {
  cornerBarDiam: 16, nBarsX: 0, barDiamX: 12, nBarsY: 0, barDiamY: 12,
  stirrupDiam: 6, stirrupSpacing: 150,
};
/**
 * Madera: semilla al cambiar una barra a madera (misma filosofía que el HA —
 * veredicto vivo desde el primer click, nunca un pending esperando sección).
 * C24 140×240 es la escuadría aserrada corriente; clase de servicio 1
 * (interior seco) como el módulo de vigas de madera.
 */
export const DEFAULT_TIMBER_SECTION_2D: TimberSection = {
  gradeId: 'C24', b: 140, h: 240, serviceClass: 1,
};
/** Verticality threshold for role inference: |dx| ≤ tan(10°)·|dy| → pilar. */
const VERTICAL_TAN = Math.tan((10 * Math.PI) / 180);

export const snap = (v: number): number => Math.round(v / SNAP_M) * SNAP_M;

// ── Id minting ──────────────────────────────────────────────────────────────

/**
 * Next free id with the given prefix. Scans nodes+members+loads TOGETHER: the
 * template id namespaces overlap across collections (the Pratt truss uses
 * 'b0'…'bn' as NODE ids), so per-collection scanning could mint a member id
 * that collides with a node id and wreck the canvas labels.
 */
export function nextFreeId(model: Fem2DModel, prefix: 'n' | 'b' | 'l'): string {
  const used = new Set<string>();
  for (const n of model.nodes) used.add(n.id);
  for (const m of model.members) used.add(m.id);
  for (const l of model.loads) used.add(l.id);
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

// ── Role inference ──────────────────────────────────────────────────────────

/** Auto role from geometry: near-vertical (±10°) → pilar; anything else → viga.
 *  Never produces cordon/diagonal/montante (those are template/override roles). */
export function inferRole(a: Fem2DNode, b: Fem2DNode): MemberRole {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  return dx <= VERTICAL_TAN * dy ? 'pilar' : 'viga';
}

/** Re-infer roles of members touching `nodeIds` after a geometry change.
 *  Skips manual overrides and template semantic roles (only pilar↔viga flip). */
export function reinferRoles(model: Fem2DModel, nodeIds: ReadonlySet<string>): Fem2DModel {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  let touched = false;
  const members = model.members.map((m) => {
    if (m.roleManual === true) return m;
    if (m.role !== 'pilar' && m.role !== 'viga') return m;
    if (!nodeIds.has(m.i) && !nodeIds.has(m.j)) return m;
    const a = nodeById.get(m.i);
    const b = nodeById.get(m.j);
    if (!a || !b) return m;
    const role = inferRole(a, b);
    if (role === m.role) return m;
    touched = true;
    return { ...m, role };
  });
  return touched ? { ...model, members } : model;
}

// ── Guard (never hand a degenerate model to the pipeline) ───────────────────

const failKeys = (model: Fem2DModel): Set<string> =>
  new Set(
    validateModel2DBasic(model)
      .filter((e) => e.severity === 'fail')
      .map((e) => `${e.code}:${e.msg}`),
  );

/** Accepts `next` only if it introduces no NEW validation fail vs `current`. */
export function applyGuard(current: Fem2DModel, next: Fem2DModel): OpResult {
  const before = failKeys(current);
  for (const key of failKeys(next)) {
    if (!before.has(key)) {
      return { ok: false, reason: key.slice(key.indexOf(':') + 1) };
    }
  }
  return { ok: true, model: next };
}

const custom = (m: Fem2DModel): Fem2DModel => (m.templateId === 'custom' ? m : { ...m, templateId: 'custom' });

// ── Geometry ops ────────────────────────────────────────────────────────────

/** Free node at (x, y) — caller passes SNAPPED coords. */
export function addFreeNode(model: Fem2DModel, x: number, y: number): OpResult {
  for (const n of model.nodes) {
    if (Math.hypot(n.x - x, n.y - y) < MIN_NODE_SEPARATION_M) {
      return { ok: false, reason: `Ya existe un nudo en (${n.x}, ${n.y}).` };
    }
  }
  const node: Fem2DNode = { id: nextFreeId(model, 'n'), x, y };
  return applyGuard(model, custom({ ...model, nodes: [...model.nodes, node] }));
}

/**
 * Split a member at parameter t ∈ (0,1): new node ON the member axis (arc
 * length snapped to the 0.1 m grid — snapping x/y independently would pull the
 * node OFF an inclined member), two members replacing the original.
 *
 * Loads are redistributed conserving physics:
 *   - UDL: same intensity, extent intersected with each half (fractions
 *     re-normalized); halves with no overlap drop out.
 *   - point-member: lands on the half containing `pos`, re-normalized.
 *   - releases: i stays on half 1, j on half 2 (interior joints are continuous).
 */
export function splitMemberAt(model: Fem2DModel, memberId: string, t: number): OpResult {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m) return { ok: false, reason: `Barra '${memberId}' no existe.` };
  const a = model.nodes.find((n) => n.id === m.i);
  const b = model.nodes.find((n) => n.id === m.j);
  if (!a || !b) return { ok: false, reason: `Barra '${memberId}' con nodos rotos.` };

  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const s = snap(t * L); // arc-length snap keeps the node on the member axis
  if (s < MIN_MEMBER_LENGTH_M || L - s < MIN_MEMBER_LENGTH_M) {
    return { ok: false, reason: 'Demasiado cerca de un extremo para insertar un nudo.' };
  }
  const tS = s / L;
  const nx = a.x + (b.x - a.x) * tS;
  const ny = a.y + (b.y - a.y) * tS;
  for (const n of model.nodes) {
    if (Math.hypot(n.x - nx, n.y - ny) < MIN_NODE_SEPARATION_M) {
      return { ok: false, reason: `Ya existe un nudo en ese punto (${n.id}).` };
    }
  }

  const nodeId = nextFreeId(model, 'n');
  const node: Fem2DNode = { id: nodeId, x: nx, y: ny };

  const half1: Fem2DMember = { ...m, j: nodeId, releases: { i: m.releases.i, j: false } };
  // Mint the second id AFTER conceptually adding the node (ids share one pool).
  const withNode: Fem2DModel = { ...model, nodes: [...model.nodes, node] };
  const half2: Fem2DMember = {
    ...m,
    id: nextFreeId(withNode, 'b'),
    i: nodeId,
    j: m.j,
    releases: { i: false, j: m.releases.j },
  };

  // Redistribute this member's loads across the halves.
  const loads: Fem2DLoad[] = [];
  let mintBase: Fem2DModel = { ...withNode, members: [...model.members, half2] };
  for (const ld of model.loads) {
    if (ld.kind === 'node' || ld.member !== m.id) {
      loads.push(ld);
      continue;
    }
    if (ld.kind === 'point-member') {
      loads.push(
        ld.pos <= tS
          ? { ...ld, member: half1.id, pos: tS > 0 ? ld.pos / tS : 0 }
          : { ...ld, member: half2.id, pos: (ld.pos - tS) / (1 - tS) },
      );
      continue;
    }
    // UDL: intersect [from, to] with each half, re-normalize fractions.
    const f0 = ld.from ?? 0;
    const f1 = ld.to ?? 1;
    const seg1 = [Math.max(f0, 0), Math.min(f1, tS)] as const;
    const seg2 = [Math.max(f0, tS), Math.min(f1, 1)] as const;
    if (seg1[1] - seg1[0] > 1e-9) {
      const from = seg1[0] / tS;
      const to = seg1[1] / tS;
      loads.push({ ...ld, member: half1.id, ...(from > 1e-9 || to < 1 - 1e-9 ? { from, to } : { from: undefined, to: undefined }) });
    }
    if (seg2[1] - seg2[0] > 1e-9) {
      const from = (seg2[0] - tS) / (1 - tS);
      const to = (seg2[1] - tS) / (1 - tS);
      const id = nextFreeId(mintBase, 'l');
      const piece: Fem2DLoad = { ...ld, id, member: half2.id, ...(from > 1e-9 || to < 1 - 1e-9 ? { from, to } : { from: undefined, to: undefined }) };
      loads.push(piece);
      mintBase = { ...mintBase, loads: [...mintBase.loads, piece] };
    }
  }

  const members = model.members.flatMap((mm) => (mm.id === m.id ? [half1, half2] : [mm]));
  return applyGuard(model, custom({ ...model, nodes: [...model.nodes, node], members, loads }));
}

/** Connect two existing nodes with a new beam-column member (auto role). The
 *  profile is cloned from a member already touching either end (visual
 *  consistency), falling back to the default IPE 240 S275. */
export function addMember(model: Fem2DModel, i: string, j: string): OpResult {
  if (i === j) return { ok: false, reason: 'Una barra necesita dos nudos distintos.' };
  const a = model.nodes.find((n) => n.id === i);
  const b = model.nodes.find((n) => n.id === j);
  if (!a || !b) return { ok: false, reason: 'Nudo inexistente.' };
  if (model.members.some((m) => (m.i === i && m.j === j) || (m.i === j && m.j === i))) {
    return { ok: false, reason: 'Ya existe una barra entre esos dos nudos.' };
  }
  if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_MEMBER_LENGTH_M) {
    return { ok: false, reason: `Barra demasiado corta (< ${MIN_MEMBER_LENGTH_M} m).` };
  }
  const neighbour = model.members.find((m) => m.i === i || m.j === i || m.i === j || m.j === j);
  const member: Fem2DMember = {
    id: nextFreeId(model, 'b'),
    i,
    j,
    role: inferRole(a, b),
    elementType: 'beam-column',
    material: 'steel',
    steelSelection: neighbour?.steelSelection ? { ...neighbour.steelSelection } : { ...DEFAULT_STEEL_2D },
    releases: { i: false, j: false },
  };
  return applyGuard(model, custom({ ...model, members: [...model.members, member] }));
}

/** Cycle the support at a node: none → pinned → fixed → roller → none. */
export function cycleSupport(model: Fem2DModel, nodeId: string): Fem2DModel {
  const CYCLE: (Support2DType | null)[] = ['pinned', 'fixed', 'roller', null];
  const existing = model.supports.find((s) => s.node === nodeId);
  const idx = existing ? CYCLE.indexOf(existing.type) : -1;
  const next = CYCLE[(idx + 1) % CYCLE.length];
  const rest = model.supports.filter((s) => s.node !== nodeId);
  return custom({
    ...model,
    supports: next === null ? rest : [...rest, { node: nodeId, type: next }],
  });
}

// ── Deletion (with cascades — never leave dangling refs) ────────────────────

export function deleteMember(model: Fem2DModel, memberId: string): Fem2DModel {
  return custom({
    ...model,
    members: model.members.filter((m) => m.id !== memberId),
    loads: model.loads.filter((l) => l.kind === 'node' || l.member !== memberId),
  });
}

export function deleteNode(model: Fem2DModel, nodeId: string): Fem2DModel {
  const deadMembers = new Set(
    model.members.filter((m) => m.i === nodeId || m.j === nodeId).map((m) => m.id),
  );
  return custom({
    ...model,
    nodes: model.nodes.filter((n) => n.id !== nodeId),
    members: model.members.filter((m) => !deadMembers.has(m.id)),
    supports: model.supports.filter((s) => s.node !== nodeId),
    loads: model.loads.filter((l) =>
      l.kind === 'node' ? l.node !== nodeId : !deadMembers.has(l.member),
    ),
  });
}

export function deleteLoad(model: Fem2DModel, loadId: string): Fem2DModel {
  return custom({ ...model, loads: model.loads.filter((l) => l.id !== loadId) });
}

/**
 * Delete a whole marquee selection in ONE op (one undo step), with the same
 * cascades as the single deletes: members touching a deleted node die, and
 * loads targeting any dead node/member die with them. A selection that
 * matches nothing returns the model untouched (no 'custom' stamp).
 */
export function deleteSelection(model: Fem2DModel, sel: SelectionSet2D): Fem2DModel {
  const deadNodes = new Set(sel.nodes.filter((id) => model.nodes.some((n) => n.id === id)));
  const deadMembers = new Set(sel.members.filter((id) => model.members.some((m) => m.id === id)));
  for (const m of model.members) {
    if (deadNodes.has(m.i) || deadNodes.has(m.j)) deadMembers.add(m.id);
  }
  const deadLoads = new Set(sel.loads);
  const loads = model.loads.filter(
    (l) =>
      !deadLoads.has(l.id) &&
      (l.kind === 'node' ? !deadNodes.has(l.node) : !deadMembers.has(l.member)),
  );
  if (deadNodes.size === 0 && deadMembers.size === 0 && loads.length === model.loads.length) {
    return model;
  }
  return custom({
    ...model,
    nodes: model.nodes.filter((n) => !deadNodes.has(n.id)),
    members: model.members.filter((m) => !deadMembers.has(m.id)),
    supports: model.supports.filter((s) => !deadNodes.has(s.node)),
    loads,
  });
}

// ── Block ops (vector move / copy of a marquee selection) ───────────────────

/** Evita el polvo flotante al sumar el vector (0.1+0.2 → 4.000000000001). */
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/**
 * Nudos sobre los que actúa una operación de vector: los seleccionados
 * explícitamente MÁS los dos extremos de cada barra seleccionada (semántica
 * CAD — mover una barra la mueve entera). Ids inexistentes se descartan.
 */
export function selectionMoveNodeIds(model: Fem2DModel, sel: SelectionSet2D): Set<string> {
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const selMembers = new Set(sel.members);
  const out = new Set<string>();
  for (const id of sel.nodes) if (nodeIds.has(id)) out.add(id);
  for (const m of model.members) {
    if (!selMembers.has(m.id)) continue;
    if (nodeIds.has(m.i)) out.add(m.i);
    if (nodeIds.has(m.j)) out.add(m.j);
  }
  return out;
}

/**
 * Desplaza la selección un vector (dx, dy) en UNA op (un undo): se mueven los
 * nudos de selectionMoveNodeIds; barras y cargas siguen a sus nudos solas. Los
 * roles auto se re-infieren como en moveNode — una barra PUENTE (un extremo
 * dentro y otro fuera de la selección) sí rota; las internas no cambian.
 */
export function translateSelection(
  model: Fem2DModel,
  sel: SelectionSet2D,
  dx: number,
  dy: number,
): OpResult {
  const ids = selectionMoveNodeIds(model, sel);
  if (ids.size === 0) {
    return { ok: false, reason: 'La selección no contiene nudos que desplazar.' };
  }
  if (dx === 0 && dy === 0) {
    return { ok: false, reason: 'Vector nulo (0, 0): nada que desplazar.' };
  }
  const moved = model.nodes.map((n) =>
    ids.has(n.id) ? { ...n, x: round6(n.x + dx), y: round6(n.y + dy) } : n,
  );
  // Colisión solo contra los nudos NO movidos: el bloque movido conserva sus
  // distancias internas (traslación rígida), no puede solaparse consigo mismo.
  const still = moved.filter((n) => !ids.has(n.id));
  for (const n of moved) {
    if (!ids.has(n.id)) continue;
    for (const s of still) {
      if (Math.hypot(s.x - n.x, s.y - n.y) < MIN_NODE_SEPARATION_M) {
        return { ok: false, reason: `El nudo ${n.id} caería sobre el nudo ${s.id}.` };
      }
    }
  }
  const guarded = applyGuard(model, custom({ ...model, nodes: moved }));
  if (!guarded.ok) return guarded;
  return { ok: true, model: reinferRoles(guarded.model, ids) };
}

/**
 * Copia la selección desplazada un vector (dx, dy) en UNA op. El bloque =
 * nudos de selectionMoveNodeIds + barras con AMBOS extremos dentro + los
 * apoyos de esos nudos + las cargas que cuelgan de esos nudos/barras (clon
 * completo). Ids nuevos del pool compartido; la selección devuelta ES la
 * copia — el caller la selecciona para que un segundo "Copiar" encadene
 * (x·2, y·2) sin reintroducir el vector.
 */
export function duplicateSelection(
  model: Fem2DModel,
  sel: SelectionSet2D,
  dx: number,
  dy: number,
): { ok: true; model: Fem2DModel; selection: SelectionSet2D } | { ok: false; reason: string } {
  const nodeIds = selectionMoveNodeIds(model, sel);
  if (nodeIds.size === 0) {
    return { ok: false, reason: 'La selección no contiene nudos que copiar.' };
  }
  if (dx === 0 && dy === 0) {
    return { ok: false, reason: 'Vector nulo (0, 0): la copia caería sobre el original.' };
  }
  const members = model.members.filter((m) => nodeIds.has(m.i) && nodeIds.has(m.j));
  if (model.nodes.length + nodeIds.size > FEM2D_MAX_NODES) {
    return { ok: false, reason: `La copia superaría el máximo de ${FEM2D_MAX_NODES} nudos.` };
  }
  if (model.members.length + members.length > FEM2D_MAX_MEMBERS) {
    return { ok: false, reason: `La copia superaría el máximo de ${FEM2D_MAX_MEMBERS} barras.` };
  }
  const srcNodes = model.nodes.filter((n) => nodeIds.has(n.id));
  for (const n of srcNodes) {
    const x = round6(n.x + dx);
    const y = round6(n.y + dy);
    for (const other of model.nodes) {
      if (Math.hypot(other.x - x, other.y - y) < MIN_NODE_SEPARATION_M) {
        return { ok: false, reason: `La copia de ${n.id} caería sobre el nudo ${other.id}.` };
      }
    }
  }

  // Acuñar ids contra el modelo ACUMULADO (pool compartido nodos+barras+cargas,
  // mismo patrón que splitMemberAt).
  let acc: Fem2DModel = model;
  const nodeMap = new Map<string, string>();
  const newNodes: Fem2DNode[] = [];
  for (const n of srcNodes) {
    const node: Fem2DNode = { id: nextFreeId(acc, 'n'), x: round6(n.x + dx), y: round6(n.y + dy) };
    nodeMap.set(n.id, node.id);
    newNodes.push(node);
    acc = { ...acc, nodes: [...acc.nodes, node] };
  }
  const memberMap = new Map<string, string>();
  const newMembers: Fem2DMember[] = [];
  for (const m of members) {
    const clone: Fem2DMember = {
      ...m,
      id: nextFreeId(acc, 'b'),
      i: nodeMap.get(m.i)!,
      j: nodeMap.get(m.j)!,
      ...(m.steelSelection ? { steelSelection: { ...m.steelSelection } } : {}),
      ...(m.rcSection ? { rcSection: { ...m.rcSection } } : {}),
      ...(m.timberSection ? { timberSection: { ...m.timberSection } } : {}),
      ...(m.vanoArmado ? { vanoArmado: { ...m.vanoArmado } } : {}),
      ...(m.apoyoArmado ? { apoyoArmado: { ...m.apoyoArmado } } : {}),
      ...(m.columnCage ? { columnCage: { ...m.columnCage } } : {}),
      releases: { ...m.releases },
    };
    memberMap.set(m.id, clone.id);
    newMembers.push(clone);
    acc = { ...acc, members: [...acc.members, clone] };
  }
  const newLoads: Fem2DLoad[] = [];
  for (const ld of model.loads) {
    let clone: Fem2DLoad | null = null;
    if (ld.kind === 'node') {
      const nid = nodeMap.get(ld.node);
      if (nid !== undefined) clone = { ...ld, id: nextFreeId(acc, 'l'), node: nid };
    } else {
      const mid = memberMap.get(ld.member);
      if (mid !== undefined) clone = { ...ld, id: nextFreeId(acc, 'l'), member: mid };
    }
    if (clone !== null) {
      newLoads.push(clone);
      acc = { ...acc, loads: [...acc.loads, clone] };
    }
  }
  const newSupports: Fem2DSupport[] = model.supports
    .filter((s) => nodeMap.has(s.node))
    .map((s) => ({ node: nodeMap.get(s.node)!, type: s.type }));

  const next = custom({
    ...model,
    nodes: [...model.nodes, ...newNodes],
    members: [...model.members, ...newMembers],
    supports: [...model.supports, ...newSupports],
    loads: [...model.loads, ...newLoads],
  });
  const guarded = applyGuard(model, next);
  if (!guarded.ok) return guarded;
  return {
    ok: true,
    model: guarded.model,
    selection: {
      nodes: newNodes.map((n) => n.id),
      members: newMembers.map((m) => m.id),
      loads: newLoads.map((l) => l.id),
    },
  };
}

// ── Load ops ────────────────────────────────────────────────────────────────

/** Initial direction + hypothesis for a freshly placed point load (the
 *  inspector edits everything afterwards). */
export interface LoadPreset2D {
  lc: LoadCase;
  /** CTE Tabla 3.1 category — only meaningful when lc === 'Q'. */
  useCategory?: UseCategoryCode;
  Fx: number; // kN, world
  Fy: number; // kN, world
}

/** Default placement: gravity (G, straight down). */
export const GRAVITY_PRESET: LoadPreset2D = { lc: 'G', Fx: 0, Fy: -10 };
/** 'load-h' tool: horizontal force (wind → is the everyday case, hence W). */
export const HORIZONTAL_PRESET: LoadPreset2D = { lc: 'W', Fx: 10, Fy: 0 };

/** Initial hypothesis + direction for a freshly placed member UDL (edited in
 *  the inspector afterwards). World-frame signed components, per member length. */
export interface UdlPreset2D {
  lc: LoadCase;
  useCategory?: UseCategoryCode;
  wx: number; // kN/m, world
  wy: number; // kN/m, world (gravity is negative)
}

/** 'load-udl' tool: gravity distributed load (G, straight down). */
export const GRAVITY_UDL_PRESET: UdlPreset2D = { lc: 'G', wx: 0, wy: -10 };
/** 'load-udl-h' tool: horizontal distributed load (wind pressure → is the
 *  everyday case, hence W). */
export const HORIZONTAL_UDL_PRESET: UdlPreset2D = { lc: 'W', wx: 10, wy: 0 };

// ── Load draft (configure-before-place) ─────────────────────────────────────
//
// The four load tools are ARMED with a value + hypothesis before the click:
// the palette flyout edits this draft and the canvas turns it into the preset
// for the placement. Without it every load landed at the hardcoded 10 kN·G/W
// and had to be re-opened in the inspector to say what it really is.
//
// One draft PER TOOL (not one shared): the units differ (kN vs kN/m) and so
// does the everyday hypothesis, so a value typed for "distribuida vertical"
// must not follow you to "puntual horizontal".

export type LoadToolId = 'load-udl' | 'load-udl-h' | 'load-point' | 'load-h';

export const LOAD_TOOL_IDS: readonly LoadToolId[] = ['load-udl', 'load-udl-h', 'load-point', 'load-h'];

export function isLoadTool(tool: Tool2DId): tool is LoadToolId {
  return (LOAD_TOOL_IDS as readonly Tool2DId[]).includes(tool);
}

/**
 * What a load tool will place on the next click. `magnitude` is the value in
 * the tool's own direction (vertical tools push DOWN, horizontal tools push
 * toward +x): a positive number means "as the tool's icon shows"; a negative
 * one flips it (succión, tiro hacia la izquierda) without leaving the palette.
 */
export interface LoadDraft2D {
  lc: LoadCase;
  /** Only carried into the load when lc === 'Q'. */
  useCategory?: UseCategoryCode;
  /** kN for point tools, kN/m for the distributed ones. */
  magnitude: number;
}

export type LoadDrafts2D = Record<LoadToolId, LoadDraft2D>;

/** Seeds = the historical hardcoded presets (10 kN gravedad G / viento W), so
 *  placing without touching the flyout behaves exactly as before. */
export const DEFAULT_LOAD_DRAFTS: LoadDrafts2D = {
  'load-udl': { lc: 'G', magnitude: 10 },
  'load-udl-h': { lc: 'W', magnitude: 10 },
  'load-point': { lc: 'G', magnitude: 10 },
  'load-h': { lc: 'W', magnitude: 10 },
};

/** True for the two tools that place a per-length load (kN/m). */
export const isUdlTool = (tool: LoadToolId): boolean => tool === 'load-udl' || tool === 'load-udl-h';
/** True for the two tools whose direction is horizontal (+x). */
export const isHorizontalTool = (tool: LoadToolId): boolean => tool === 'load-udl-h' || tool === 'load-h';

const draftCase = (d: LoadDraft2D): { lc: LoadCase; useCategory?: UseCategoryCode } => ({
  lc: d.lc,
  ...(d.lc === 'Q' ? { useCategory: d.useCategory ?? 'B' } : {}),
});

/** Point preset (kN) for 'load-point' / 'load-h' from its armed draft. */
export function draftToPointPreset(tool: LoadToolId, draft: LoadDraft2D): LoadPreset2D {
  const v = draft.magnitude;
  return isHorizontalTool(tool)
    ? { ...draftCase(draft), Fx: v, Fy: 0 }
    : { ...draftCase(draft), Fx: 0, Fy: -v };
}

/** UDL preset (kN/m) for 'load-udl' / 'load-udl-h' from its armed draft. */
export function draftToUdlPreset(tool: LoadToolId, draft: LoadDraft2D): UdlPreset2D {
  const v = draft.magnitude;
  return isHorizontalTool(tool)
    ? { ...draftCase(draft), wx: v, wy: 0 }
    : { ...draftCase(draft), wx: 0, wy: -v };
}

/** Point load at a node (preset direction; edited in inspector). */
export function addNodeLoad(
  model: Fem2DModel,
  nodeId: string,
  preset: LoadPreset2D = GRAVITY_PRESET,
): OpResult {
  if (!model.nodes.some((n) => n.id === nodeId)) {
    return { ok: false, reason: 'Nudo inexistente.' };
  }
  const load: Fem2DLoad = {
    id: nextFreeId(model, 'l'),
    kind: 'node',
    lc: preset.lc,
    ...(preset.useCategory !== undefined ? { useCategory: preset.useCategory } : {}),
    node: nodeId,
    Fx: preset.Fx,
    Fy: preset.Fy,
  };
  return applyGuard(model, custom({ ...model, loads: [...model.loads, load] }));
}

/** Distributed load over the full member (default gravity −10 kN/m; the
 *  'load-udl-h' tool passes HORIZONTAL_UDL_PRESET for wind pressure). Always
 *  world frame — the inspector switches to local (⊥ barra) afterwards. */
export function addMemberUdl(
  model: Fem2DModel,
  memberId: string,
  preset: UdlPreset2D = GRAVITY_UDL_PRESET,
): OpResult {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m) return { ok: false, reason: 'Barra inexistente.' };
  if (m.elementType === 'two-force') {
    return { ok: false, reason: 'Una biela (2 fuerzas) no admite cargas en la barra: aplícalas en los nudos.' };
  }
  const load: Fem2DLoad = {
    id: nextFreeId(model, 'l'),
    kind: 'udl',
    lc: preset.lc,
    ...(preset.useCategory !== undefined ? { useCategory: preset.useCategory } : {}),
    member: memberId,
    wx: preset.wx,
    wy: preset.wy,
    frame: 'global',
  };
  return applyGuard(model, custom({ ...model, loads: [...model.loads, load] }));
}

/** Point load ON a member at fraction t (no node created — the 2D model
 *  supports member point loads natively, unlike the 1D strip). */
export function addMemberPointLoad(
  model: Fem2DModel,
  memberId: string,
  t: number,
  preset: LoadPreset2D = GRAVITY_PRESET,
): OpResult {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m) return { ok: false, reason: 'Barra inexistente.' };
  if (m.elementType === 'two-force') {
    return { ok: false, reason: 'Una biela (2 fuerzas) no admite cargas en la barra: aplícalas en los nudos.' };
  }
  const pos = Math.min(1, Math.max(0, Math.round(t * 100) / 100));
  const load: Fem2DLoad = {
    id: nextFreeId(model, 'l'),
    kind: 'point-member',
    lc: preset.lc,
    ...(preset.useCategory !== undefined ? { useCategory: preset.useCategory } : {}),
    member: memberId,
    pos,
    Fx: preset.Fx,
    Fy: preset.Fy,
    frame: 'global',
  };
  return applyGuard(model, custom({ ...model, loads: [...model.loads, load] }));
}

/** Rescale a load's magnitude keeping its direction (inline |v| edit). Zero
 *  current direction defaults to gravity (straight down). */
export function setLoadMagnitude(model: Fem2DModel, loadId: string, magnitude: number): Fem2DModel {
  const mag = Math.abs(magnitude);
  const loads = model.loads.map((ld): Fem2DLoad => {
    if (ld.id !== loadId) return ld;
    if (ld.kind === 'udl') {
      const cur = Math.hypot(ld.wx, ld.wy);
      if (cur < 1e-12) return { ...ld, wx: 0, wy: -mag };
      return { ...ld, wx: (ld.wx / cur) * mag, wy: (ld.wy / cur) * mag };
    }
    const cur = Math.hypot(ld.Fx, ld.Fy);
    if (cur < 1e-12) return { ...ld, Fx: 0, Fy: -mag };
    return { ...ld, Fx: (ld.Fx / cur) * mag, Fy: (ld.Fy / cur) * mag };
  });
  return custom({ ...model, loads });
}

// ── Inspector edits (member) ────────────────────────────────────────────────

function patchMember(model: Fem2DModel, memberId: string, patch: Partial<Fem2DMember>): Fem2DModel {
  return custom({
    ...model,
    members: model.members.map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
  });
}

/** Explicit role pick in the inspector → manual override (blocks re-inference). */
export function setMemberRole(model: Fem2DModel, memberId: string, role: MemberRole): Fem2DModel {
  return patchMember(model, memberId, { role, roleManual: true });
}

/** "Volver a auto": clear the override and re-infer from geometry. */
export function resetMemberRoleAuto(model: Fem2DModel, memberId: string): Fem2DModel {
  const m = model.members.find((mm) => mm.id === memberId);
  const a = m && model.nodes.find((n) => n.id === m.i);
  const b = m && model.nodes.find((n) => n.id === m.j);
  if (!m || !a || !b) return model;
  return patchMember(model, memberId, { role: inferRole(a, b), roleManual: false });
}

/**
 * Toggle biela (two-force). Enabling requires the member to carry NO member
 * loads (D10 invariant — the caller surfaces the reason; loads stay listed and
 * deletable next to the toggle, no surprise deletions). Enabling also moves
 * the role to the axial family (montante if vertical, else diagonal) as a
 * manual pick; disabling returns to the auto pilar/viga.
 */
export function setMemberTwoForce(model: Fem2DModel, memberId: string, twoForce: boolean): OpResult {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m) return { ok: false, reason: 'Barra inexistente.' };
  if (twoForce === (m.elementType === 'two-force')) return { ok: true, model };
  if (twoForce) {
    if (m.material === 'rc') {
      return {
        ok: false,
        reason: 'Una biela de hormigón no está soportada: el chequeo axil HA (tracción fisurada + pandeo) no está modelado. Cambia la barra a acero o madera primero.',
      };
    }
    const loads = model.loads.filter((l) => l.kind !== 'node' && l.member === memberId);
    if (loads.length > 0) {
      return {
        ok: false,
        reason: `La barra tiene ${loads.length} carga${loads.length === 1 ? '' : 's'} aplicadas: una biela no admite cargas en la barra. Bórralas primero.`,
      };
    }
    const a = model.nodes.find((n) => n.id === m.i);
    const b = model.nodes.find((n) => n.id === m.j);
    const vertical = a && b ? inferRole(a, b) === 'pilar' : false;
    return {
      ok: true,
      model: patchMember(model, memberId, {
        elementType: 'two-force',
        role: vertical ? 'montante' : 'diagonal',
        roleManual: true,
        releases: { i: false, j: false }, // pin-ended by formulation; flags irrelevant
      }),
    };
  }
  // Back to beam-column: role returns to geometric auto.
  const a = model.nodes.find((n) => n.id === m.i);
  const b = model.nodes.find((n) => n.id === m.j);
  const role = a && b ? inferRole(a, b) : m.role;
  return { ok: true, model: patchMember(model, memberId, { elementType: 'beam-column', role, roleManual: false }) };
}

export function setMemberProfile(model: Fem2DModel, memberId: string, profileKey: string): Fem2DModel {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m || !m.steelSelection) return model;
  return patchMember(model, memberId, { steelSelection: { ...m.steelSelection, profileKey } });
}

export function setMemberSteel(model: Fem2DModel, memberId: string, steel: 'S275' | 'S355'): Fem2DModel {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m || !m.steelSelection) return model;
  return patchMember(model, memberId, { steelSelection: { ...m.steelSelection, steel } });
}

/**
 * Switch a member's material. To 'rc': stamps role-aware section defaults +
 * BOTH armado shapes (beam pair + column cage) so the verdict is live at once
 * and survives any later role flip; blocked on bielas (no HA axial engine).
 * To 'timber': stamps the C24 seed section (a timber biela IS supported — the
 * EC5 engine covers pure axial: tracción §6.2.3 y pandeo kc §6.3.2). Existing
 * material data is preserved when toggling back and forth — the previous
 * material's fields are kept, never wiped.
 */
export function setMemberMaterial(
  model: Fem2DModel,
  memberId: string,
  material: 'steel' | 'rc' | 'timber',
): OpResult {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m) return { ok: false, reason: 'Barra inexistente.' };
  if (m.material === material) return { ok: true, model };
  if (material === 'rc') {
    if (m.elementType === 'two-force') {
      return {
        ok: false,
        reason: 'Una biela de hormigón no está soportada: el chequeo axil HA no está modelado. Pasa la barra a viga-columna primero.',
      };
    }
    return {
      ok: true,
      model: patchMember(model, memberId, {
        material: 'rc',
        rcSection: m.rcSection ?? {
          ...(m.role === 'pilar' ? DEFAULT_RC_COLUMN_SECTION_2D : DEFAULT_RC_BEAM_SECTION_2D),
        },
        vanoArmado: m.vanoArmado ?? { ...DEFAULT_VANO_ARMADO_2D },
        apoyoArmado: m.apoyoArmado ?? { ...DEFAULT_APOYO_ARMADO_2D },
        columnCage: m.columnCage ?? { ...DEFAULT_COLUMN_CAGE_2D },
        ltbSpacing: undefined, // arriostramiento LTB es concepto de acero/madera
      }),
    };
  }
  if (material === 'timber') {
    return {
      ok: true,
      model: patchMember(model, memberId, {
        material: 'timber',
        timberSection: m.timberSection ?? { ...DEFAULT_TIMBER_SECTION_2D },
      }),
    };
  }
  return {
    ok: true,
    model: patchMember(model, memberId, {
      material: 'steel',
      steelSelection: m.steelSelection ?? { ...DEFAULT_STEEL_2D },
    }),
  };
}

export function updateMemberRcSection(model: Fem2DModel, memberId: string, patch: Partial<RcSection>): Fem2DModel {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m || !m.rcSection) return model;
  return patchMember(model, memberId, { rcSection: { ...m.rcSection, ...patch } });
}

export function updateMemberTimberSection(
  model: Fem2DModel,
  memberId: string,
  patch: Partial<TimberSection>,
): Fem2DModel {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m || !m.timberSection) return model;
  return patchMember(model, memberId, { timberSection: { ...m.timberSection, ...patch } });
}

export function updateMemberArmado(
  model: Fem2DModel,
  memberId: string,
  region: 'vano' | 'apoyo',
  patch: Partial<ArmadoHA>,
): Fem2DModel {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m || m.material !== 'rc') return model;
  const key = region === 'vano' ? 'vanoArmado' : 'apoyoArmado';
  const base = (region === 'vano' ? m.vanoArmado : m.apoyoArmado)
    ?? (region === 'vano' ? DEFAULT_VANO_ARMADO_2D : DEFAULT_APOYO_ARMADO_2D);
  return patchMember(model, memberId, { [key]: { ...base, ...patch } });
}

export function updateMemberColumnCage(model: Fem2DModel, memberId: string, patch: Partial<RcColumnCage>): Fem2DModel {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m || m.material !== 'rc') return model;
  return patchMember(model, memberId, { columnCage: { ...(m.columnCage ?? DEFAULT_COLUMN_CAGE_2D), ...patch } });
}

export function setMemberRelease(model: Fem2DModel, memberId: string, end: 'i' | 'j', released: boolean): Fem2DModel {
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m) return model;
  return patchMember(model, memberId, { releases: { ...m.releases, [end]: released } });
}

/** undefined = sin arriostrar (Lcr = luz completa). */
export function setMemberLtbSpacing(model: Fem2DModel, memberId: string, spacing: number | undefined): Fem2DModel {
  return patchMember(model, memberId, { ltbSpacing: spacing });
}

/**
 * "Brocha" tool: copy the inspector-editable properties of `sourceId` onto
 * `targetId` — element type (via setMemberTwoForce so the biela load-guard and
 * role transitions apply), material (perfil + acero, or sección + armado HA),
 * rótulas and correas (ltbSpacing, including the "sin arriostrar" undefined).
 * The ROLE travels only when the source carries a manual override: painting a
 * profile must never silently re-route a target's template semantic role
 * (cordon/diagonal/montante) or its geometric auto — role drives check routing.
 */
export function copyMemberProps(model: Fem2DModel, sourceId: string, targetId: string): OpResult {
  const src = model.members.find((m) => m.id === sourceId);
  const tgt = model.members.find((m) => m.id === targetId);
  if (!src || !tgt) return { ok: false, reason: 'Barra inexistente.' };
  if (sourceId === targetId) {
    return { ok: false, reason: 'Origen y destino son la misma barra.' };
  }

  let base = model;
  // Material BEFORE the element-type toggle: painting a steel/timber biela onto
  // an HA beam-column must not trip the biela↔HA guard — the final state is a
  // steel or timber biela (a two-force source can never be HA; the ops forbid
  // it, and timber bielas ARE supported).
  if (src.material !== tgt.material && src.material === 'steel') {
    base = patchMember(base, targetId, {
      material: 'steel',
      steelSelection: src.steelSelection ? { ...src.steelSelection } : { ...DEFAULT_STEEL_2D },
    });
  } else if (src.material !== tgt.material && src.material === 'timber') {
    base = patchMember(base, targetId, {
      material: 'timber',
      timberSection: src.timberSection ? { ...src.timberSection } : { ...DEFAULT_TIMBER_SECTION_2D },
    });
  }
  if (src.elementType !== tgt.elementType) {
    const r = setMemberTwoForce(base, targetId, src.elementType === 'two-force');
    if (!r.ok) return r;
    base = r.model;
  }
  const patch: Partial<Fem2DMember> = {
    material: src.material,
    steelSelection: src.steelSelection ? { ...src.steelSelection } : undefined,
    rcSection: src.rcSection ? { ...src.rcSection } : undefined,
    timberSection: src.timberSection ? { ...src.timberSection } : undefined,
    vanoArmado: src.vanoArmado ? { ...src.vanoArmado } : undefined,
    apoyoArmado: src.apoyoArmado ? { ...src.apoyoArmado } : undefined,
    columnCage: src.columnCage ? { ...src.columnCage } : undefined,
    ltbSpacing: src.ltbSpacing,
    // A biela is pin-ended by formulation; its release flags are meaningless
    // and must not overwrite anything real on conversion back.
    releases: src.elementType === 'two-force' ? { i: false, j: false } : { ...src.releases },
  };
  if (src.roleManual === true) {
    patch.role = src.role;
    patch.roleManual = true;
  }
  return applyGuard(model, patchMember(base, targetId, patch));
}

export interface CopyManyResult {
  model: Fem2DModel;
  /** Ids that received the paint. */
  applied: string[];
  /** Targets skipped with the op's reason (e.g. biela onto a loaded member). */
  failures: { id: string; reason: string }[];
}

/**
 * Paint one source's properties onto MANY targets in a single op (one undo).
 * The source id is skipped silently if it lands in the target set (a marquee
 * over the source itself). Each paint is guarded against the RUNNING model, so
 * a target that would introduce a new fail is skipped with its reason rather
 * than sinking the whole batch.
 */
export function copyMemberPropsMany(
  model: Fem2DModel,
  sourceId: string,
  targetIds: readonly string[],
): CopyManyResult {
  let acc = model;
  const applied: string[] = [];
  const failures: { id: string; reason: string }[] = [];
  for (const tid of targetIds) {
    if (tid === sourceId) continue;
    const res = copyMemberProps(acc, sourceId, tid);
    if (res.ok) {
      acc = res.model;
      applied.push(tid);
    } else {
      failures.push({ id: tid, reason: res.reason });
    }
  }
  return { model: acc, applied, failures };
}

/**
 * Edición en GRUPO del inspector: aplica UNA edición por-barra a muchas barras
 * en una sola op (un undo). Las ops que devuelven el modelo pelado siempre
 * aplican; las que devuelven OpResult (biela, material) pueden omitir barras
 * individuales con su motivo sin hundir el lote — el mismo contrato que
 * copyMemberPropsMany (la brocha).
 */
export function editMembersMany(
  model: Fem2DModel,
  memberIds: readonly string[],
  op: (m: Fem2DModel, memberId: string) => Fem2DModel | OpResult,
): CopyManyResult {
  let acc = model;
  const applied: string[] = [];
  const failures: { id: string; reason: string }[] = [];
  for (const id of memberIds) {
    const res = op(acc, id);
    if ('ok' in res) {
      if (res.ok) {
        acc = res.model;
        applied.push(id);
      } else {
        failures.push({ id, reason: res.reason });
      }
    } else {
      acc = res;
      applied.push(id);
    }
  }
  return { model: acc, applied, failures };
}

/** Set/replace the support at a node ('none' clears it). */
export function setSupport(model: Fem2DModel, nodeId: string, type: Support2DType | 'none'): Fem2DModel {
  const rest = model.supports.filter((s) => s.node !== nodeId);
  return custom({
    ...model,
    supports: type === 'none' ? rest : [...rest, { node: nodeId, type }],
  });
}

// ── Inspector edits (load) ──────────────────────────────────────────────────

/** Shallow-merge a patch into one load, guarded (e.g. a udl range must stay
 *  valid). The patch is same-kind: the inspector never changes a load's kind. */
export function updateLoad(model: Fem2DModel, loadId: string, patch: Partial<Fem2DLoad>): OpResult {
  const target = model.loads.find((l) => l.id === loadId);
  if (!target) return { ok: false, reason: 'Carga inexistente.' };
  const loads = model.loads.map((l) => (l.id === loadId ? ({ ...l, ...patch } as Fem2DLoad) : l));
  return applyGuard(model, custom({ ...model, loads }));
}

// ── Node move (inspector x/y edit; alignment moves live in alignments.ts) ────

export function moveNode(model: Fem2DModel, nodeId: string, x: number, y: number): OpResult {
  const node = model.nodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false, reason: 'Nudo inexistente.' };
  for (const n of model.nodes) {
    if (n.id !== nodeId && Math.hypot(n.x - x, n.y - y) < MIN_NODE_SEPARATION_M) {
      return { ok: false, reason: `Ya existe un nudo en ese punto (${n.id}).` };
    }
  }
  const moved = custom({
    ...model,
    nodes: model.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
  });
  const guarded = applyGuard(model, moved);
  if (!guarded.ok) return guarded;
  return { ok: true, model: reinferRoles(guarded.model, new Set([nodeId])) };
}
