// FEM 2D — pure editor operations (modelOps).
//
// The physics-critical op is splitMemberAt: redistributing a member's loads
// across the two halves must CONSERVE the solution. Those cases solve the
// model before and after with the real pipeline and compare reactions — a
// physics test, not a shape test. The rest locks ids, cascades, role
// inference and the degenerate-model guard.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOAD_DRAFTS,
  GRAVITY_PRESET,
  GRAVITY_UDL_PRESET,
  HORIZONTAL_PRESET,
  HORIZONTAL_UDL_PRESET,
  draftToPointPreset,
  draftToUdlPreset,
  addFreeNode,
  addMember,
  addMemberPointLoad,
  addMemberUdl,
  addNodeLoad,
  copyMemberProps,
  copyMemberPropsMany,
  cycleSupport,
  deleteMember,
  deleteNode,
  deleteSelection,
  duplicateSelection,
  editMembersMany,
  inferRole,
  nextFreeId,
  normalizeSelection,
  reinferRoles,
  resetMemberRoleAuto,
  selectionMoveNodeIds,
  selectionToSet,
  setLoadMagnitude,
  setMemberMaterial,
  setMemberProfile,
  setMemberRole,
  setMemberTwoForce,
  translateSelection,
  setSupport,
  splitMemberAt,
  moveNode,
  toggleInSelection,
  unionSelections,
  updateLoad,
  updateMemberArmado,
  updateMemberColumnCage,
  type LoadDraft2D,
} from '../../features/fem2d/modelOps';
import { buildModelFromState, fem2dUiDefaults } from '../../features/fem2d/uiState';
import { solveFem2D } from '../../features/fem2d/pipeline';
import { FEM2D_TEMPLATES } from '../../features/fem2d/templates';
import type { Fem2DModel, Fem2DNode } from '../../features/fem2d/types';

function portal(): Fem2DModel {
  return buildModelFromState({ ...fem2dUiDefaults(), templateId: 'portal-frame' }).model!;
}

function pratt(): Fem2DModel {
  return FEM2D_TEMPLATES['pratt-truss'].build(FEM2D_TEMPLATES['pratt-truss'].defaults());
}

/** Total support reactions (ΣRx, ΣRy) of a solved model. */
function totalReactions(model: Fem2DModel): { Rx: number; Ry: number } {
  const res = solveFem2D(model);
  expect(res.ok).toBe(true);
  let Rx = 0, Ry = 0;
  for (const r of res.reactions) { Rx += r.Rx; Ry += r.Ry; }
  return { Rx, Ry };
}

const n = (id: string, x: number, y: number): Fem2DNode => ({ id, x, y });

describe('nextFreeId', () => {
  it('scans nodes+members+loads together (Pratt uses b0.. as NODE ids)', () => {
    const model = pratt();
    const id = nextFreeId(model, 'b');
    // Must not collide with any existing id in ANY collection.
    const all = new Set([
      ...model.nodes.map((x) => x.id),
      ...model.members.map((x) => x.id),
      ...model.loads.map((x) => x.id),
    ]);
    expect(all.has(id)).toBe(false);
  });
});

describe('inferRole (auto: vertical → pilar, resto → viga)', () => {
  it('vertical and near-vertical (≤10°) → pilar', () => {
    expect(inferRole(n('a', 0, 0), n('b', 0, 3))).toBe('pilar');
    // 3 m de altura, 0.4 m de desplome → ~7.6° de la vertical.
    expect(inferRole(n('a', 0, 0), n('b', 0.4, 3))).toBe('pilar');
  });
  it('horizontal, rafters and diagonals → viga', () => {
    expect(inferRole(n('a', 0, 0), n('b', 5, 0))).toBe('viga');
    expect(inferRole(n('a', 0, 3), n('b', 4, 4.2))).toBe('viga'); // faldón
    expect(inferRole(n('a', 0, 0), n('b', 2, 1.5))).toBe('viga'); // diagonal
  });
});

describe('reinferRoles', () => {
  it('never touches template semantic roles (cordon/diagonal/montante)', () => {
    const model = pratt();
    const allNodes = new Set(model.nodes.map((x) => x.id));
    const out = reinferRoles(model, allNodes);
    for (let i = 0; i < model.members.length; i++) {
      expect(out.members[i].role).toBe(model.members[i].role);
    }
  });

  it('respects roleManual and flips only pilar↔viga', () => {
    const model = portal();
    // Manual override on the beam: must survive re-inference.
    const withManual: Fem2DModel = {
      ...model,
      members: model.members.map((m) => (m.id === 'v1' ? { ...m, role: 'pilar' as const, roleManual: true } : m)),
    };
    const out = reinferRoles(withManual, new Set(withManual.nodes.map((x) => x.id)));
    expect(out.members.find((m) => m.id === 'v1')!.role).toBe('pilar');
    // Auto members re-infer: p1 (vertical) stays pilar.
    expect(out.members.find((m) => m.id === 'p1')!.role).toBe('pilar');
  });
});

describe('addFreeNode / addMember', () => {
  it('adds a snapped free node, stamps custom provenance, mints n-id', () => {
    const model = portal();
    const res = addFreeNode(model, 3, 5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.model.templateId).toBe('custom');
    expect(res.model.nodes.length).toBe(model.nodes.length + 1);
    const added = res.model.nodes[res.model.nodes.length - 1];
    expect(added.x).toBe(3);
    expect(added.y).toBe(5);
  });

  it('rejects a node on top of an existing one', () => {
    const model = portal();
    const at = model.nodes[0];
    const res = addFreeNode(model, at.x, at.y);
    expect(res.ok).toBe(false);
  });

  it('addMember infers role, clones a neighbouring profile, rejects duplicates', () => {
    const model = portal();
    const withNode = addFreeNode(model, 3, 6);
    expect(withNode.ok).toBe(true);
    if (!withNode.ok) return;
    const newNodeId = withNode.model.nodes[withNode.model.nodes.length - 1].id;

    // n2 (0, 3.5) → new node (3, 6): inclinada → viga.
    const res = addMember(withNode.model, 'n2', newNodeId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const added = res.model.members[res.model.members.length - 1];
    expect(added.role).toBe('viga');
    expect(added.elementType).toBe('beam-column');
    // Clona el perfil de un vecino del nudo n2 (pilar HEB 200 o dintel IPE 240).
    expect(added.steelSelection).toBeDefined();

    // Duplicada (cualquier orientación) → rechazo.
    const dup = addMember(res.model, newNodeId, 'n2');
    expect(dup.ok).toBe(false);
  });
});

describe('splitMemberAt — conservación física', () => {
  it('splitting the loaded dintel conserves total reactions', () => {
    const model = portal();
    const before = totalReactions(model);

    const res = splitMemberAt(model, 'v1', 0.5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Un miembro más (v1 partido en dos), mismos apoyos.
    expect(res.model.members.length).toBe(model.members.length + 1);

    const after = totalReactions(res.model);
    expect(after.Rx).toBeCloseTo(before.Rx, 6);
    expect(after.Ry).toBeCloseTo(before.Ry, 6);
  });

  it('partial UDL is clipped per half (resultant conserved)', () => {
    const model = portal();
    // Sustituye las cargas del dintel por una UDL PARCIAL [0.25, 0.75].
    const partial: Fem2DModel = {
      ...model,
      loads: [
        { id: 'l1', kind: 'udl', lc: 'G', member: 'v1', wx: 0, wy: -12, frame: 'global', from: 0.25, to: 0.75 },
      ],
    };
    const before = totalReactions(partial);

    const res = splitMemberAt(partial, 'v1', 0.5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // La UDL parcial cruza el corte → una pieza por mitad.
    const udls = res.model.loads.filter((l) => l.kind === 'udl');
    expect(udls.length).toBe(2);

    const after = totalReactions(res.model);
    expect(after.Rx).toBeCloseTo(before.Rx, 6);
    expect(after.Ry).toBeCloseTo(before.Ry, 6);
  });

  it('point-member load lands on the right half with renormalized pos', () => {
    const model = portal();
    const withPoint: Fem2DModel = {
      ...model,
      loads: [
        { id: 'l1', kind: 'point-member', lc: 'G', member: 'v1', pos: 0.75, Fx: 0, Fy: -20, frame: 'global' },
      ],
    };
    const before = totalReactions(withPoint);

    const res = splitMemberAt(withPoint, 'v1', 0.5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const pl = res.model.loads.find((l) => l.kind === 'point-member')!;
    // Estaba al 75% del total → al 50% de la segunda mitad.
    expect(pl.kind === 'point-member' && pl.pos).toBeCloseTo(0.5, 9);

    const after = totalReactions(res.model);
    expect(after.Ry).toBeCloseTo(before.Ry, 6);
  });

  it('rejects splits hugging an end', () => {
    const model = portal();
    expect(splitMemberAt(model, 'v1', 0.001).ok).toBe(false);
    expect(splitMemberAt(model, 'v1', 0.999).ok).toBe(false);
  });
});

describe('cycleSupport', () => {
  it('cycles none → pinned → fixed → roller → none', () => {
    const model = portal();
    const free = addFreeNode(model, 3, 6);
    expect(free.ok).toBe(true);
    if (!free.ok) return;
    const id = free.model.nodes[free.model.nodes.length - 1].id;

    let m = cycleSupport(free.model, id);
    expect(m.supports.find((s) => s.node === id)?.type).toBe('pinned');
    m = cycleSupport(m, id);
    expect(m.supports.find((s) => s.node === id)?.type).toBe('fixed');
    m = cycleSupport(m, id);
    expect(m.supports.find((s) => s.node === id)?.type).toBe('roller');
    m = cycleSupport(m, id);
    expect(m.supports.find((s) => s.node === id)).toBeUndefined();
  });
});

describe('deletion cascades', () => {
  it('deleteNode removes touching members, their loads and its support', () => {
    const model = portal();
    // n2 es la esquina izquierda: toca p1 y v1 (v1 lleva las UDL).
    const out = deleteNode(model, 'n2');
    expect(out.nodes.some((x) => x.id === 'n2')).toBe(false);
    expect(out.members.some((m) => m.id === 'p1' || m.id === 'v1')).toBe(false);
    expect(out.loads.every((l) => l.kind === 'node' || (l.member !== 'p1' && l.member !== 'v1'))).toBe(true);
  });

  it('deleteMember removes its member loads only', () => {
    const model = portal();
    const before = model.loads.length;
    const udlsOnV1 = model.loads.filter((l) => l.kind !== 'node' && l.member === 'v1').length;
    expect(udlsOnV1).toBeGreaterThan(0);
    const out = deleteMember(model, 'v1');
    expect(out.loads.length).toBe(before - udlsOnV1);
  });
});

describe('load ops', () => {
  it('creates default gravity loads; rejects member loads on a two-force web', () => {
    const model = pratt();
    const web = model.members.find((m) => m.elementType === 'two-force')!;
    expect(addMemberUdl(model, web.id).ok).toBe(false);
    expect(addMemberPointLoad(model, web.id, 0.5).ok).toBe(false);

    const chord = model.members.find((m) => m.elementType === 'beam-column')!;
    const udl = addMemberUdl(model, chord.id);
    expect(udl.ok).toBe(true);

    const nodal = addNodeLoad(model, model.nodes[0].id);
    expect(nodal.ok).toBe(true);
    if (!nodal.ok) return;
    const added = nodal.model.loads[nodal.model.loads.length - 1];
    expect(added.kind === 'node' && added.Fy).toBe(-10);
  });

  it('HORIZONTAL_PRESET places a wind-→ point load on nodes and members', () => {
    const model = portal();
    const nodal = addNodeLoad(model, model.nodes[0].id, HORIZONTAL_PRESET);
    expect(nodal.ok).toBe(true);
    if (!nodal.ok) return;
    const nl = nodal.model.loads[nodal.model.loads.length - 1];
    expect(nl.kind).toBe('node');
    expect(nl.lc).toBe('W');
    expect(nl.kind === 'node' && nl.Fx).toBe(10);
    expect(nl.kind === 'node' && nl.Fy).toBe(0);

    const chord = model.members.find((m) => m.elementType === 'beam-column')!;
    const onMember = addMemberPointLoad(model, chord.id, 0.4, HORIZONTAL_PRESET);
    expect(onMember.ok).toBe(true);
    if (!onMember.ok) return;
    const ml = onMember.model.loads[onMember.model.loads.length - 1];
    expect(ml.kind).toBe('point-member');
    expect(ml.lc).toBe('W');
    expect(ml.kind === 'point-member' && ml.Fx).toBe(10);
    expect(ml.kind === 'point-member' && ml.Fy).toBe(0);
    expect(ml.kind === 'point-member' && ml.pos).toBeCloseTo(0.4, 9);
  });

  it('HORIZONTAL_UDL_PRESET places a wind-→ distributed load on a member', () => {
    const model = portal();
    const chord = model.members.find((m) => m.elementType === 'beam-column')!;
    const res = addMemberUdl(model, chord.id, HORIZONTAL_UDL_PRESET);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const udl = res.model.loads[res.model.loads.length - 1];
    expect(udl.kind).toBe('udl');
    expect(udl.lc).toBe('W');
    expect(udl.kind === 'udl' && udl.wx).toBe(10);
    expect(udl.kind === 'udl' && udl.wy).toBe(0);
    expect(udl.kind === 'udl' && udl.frame).toBe('global');
    // Default (no preset) is still gravity, straight down.
    const grav = addMemberUdl(model, chord.id);
    expect(grav.ok).toBe(true);
    if (!grav.ok) return;
    const g = grav.model.loads[grav.model.loads.length - 1];
    expect(g.kind === 'udl' && g.wy).toBe(-10);
    // A two-force web still rejects any member load, preset or not.
    const web = model.members.find((m) => m.elementType === 'two-force');
    if (web) expect(addMemberUdl(model, web.id, HORIZONTAL_UDL_PRESET).ok).toBe(false);
  });

  it('el borrador armado en la paleta viaja entero a la carga colocada', () => {
    const model = portal();
    const chord = model.members.find((m) => m.elementType === 'beam-column')!;

    // Distribuida vertical: 40 kN/m de sobrecarga de uso categoría C3.
    const draft: LoadDraft2D = { lc: 'Q', useCategory: 'C3', magnitude: 40 };
    const res = addMemberUdl(model, chord.id, draftToUdlPreset('load-udl', draft));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const udl = res.model.loads[res.model.loads.length - 1];
    expect(udl.lc).toBe('Q');
    expect(udl.useCategory).toBe('C3');
    expect(udl.kind === 'udl' && udl.wy).toBe(-40); // gravedad = −y
    expect(udl.kind === 'udl' && udl.wx).toBe(0);

    // Puntual horizontal con valor negativo: el sentido se invierte (←).
    const suction: LoadDraft2D = { lc: 'W', magnitude: -15 };
    const p = addNodeLoad(model, model.nodes[0].id, draftToPointPreset('load-h', suction));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const pl = p.model.loads[p.model.loads.length - 1];
    expect(pl.kind === 'node' && pl.Fx).toBe(-15);
    expect(pl.kind === 'node' && pl.Fy).toBe(0);
    // La categoría solo acompaña a Q: una carga de viento no la arrastra.
    expect(pl.useCategory).toBeUndefined();
  });

  it('un borrador Q sin categoría cae en B (el default del combinador)', () => {
    const model = portal();
    const preset = draftToPointPreset('load-point', { lc: 'Q', magnitude: 12 });
    expect(preset.useCategory).toBe('B');
    expect(preset.Fy).toBe(-12);
    const res = addNodeLoad(model, model.nodes[0].id, preset);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.model.loads[res.model.loads.length - 1].useCategory).toBe('B');
  });

  it('los borradores por defecto reproducen los presets históricos', () => {
    expect(draftToUdlPreset('load-udl', DEFAULT_LOAD_DRAFTS['load-udl'])).toEqual(GRAVITY_UDL_PRESET);
    expect(draftToUdlPreset('load-udl-h', DEFAULT_LOAD_DRAFTS['load-udl-h'])).toEqual(HORIZONTAL_UDL_PRESET);
    expect(draftToPointPreset('load-point', DEFAULT_LOAD_DRAFTS['load-point'])).toEqual(GRAVITY_PRESET);
    expect(draftToPointPreset('load-h', DEFAULT_LOAD_DRAFTS['load-h'])).toEqual(HORIZONTAL_PRESET);
  });

  it('setLoadMagnitude rescales keeping direction', () => {
    const model = portal();
    // Viento en cabeza: Fx=8 → magnitud 20 conserva el sentido +x.
    const wind = model.loads.find((l) => l.kind === 'node' && l.Fx !== 0)!;
    const out = setLoadMagnitude(model, wind.id, 20);
    const updated = out.loads.find((l) => l.id === wind.id)!;
    expect(updated.kind === 'node' && updated.Fx).toBeCloseTo(20, 9);
    expect(updated.kind === 'node' && updated.Fy).toBeCloseTo(0, 9);
  });
});

describe('inspector ops', () => {
  it('setMemberRole marks manual; resetMemberRoleAuto re-infers', () => {
    const model = portal();
    const manual = setMemberRole(model, 'v1', 'cordon');
    const v1 = manual.members.find((m) => m.id === 'v1')!;
    expect(v1.role).toBe('cordon');
    expect(v1.roleManual).toBe(true);
    expect(manual.templateId).toBe('custom');

    const auto = resetMemberRoleAuto(manual, 'v1');
    const v1b = auto.members.find((m) => m.id === 'v1')!;
    expect(v1b.role).toBe('viga'); // horizontal
    expect(v1b.roleManual).toBe(false);
  });

  it('setMemberTwoForce blocks while the member carries loads, then works', () => {
    const model = portal();
    // v1 lleva las UDL de la plantilla → bloqueo con motivo.
    const blocked = setMemberTwoForce(model, 'v1', true);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toMatch(/carga/i);

    // Sin sus cargas → biela con rol axial manual.
    const clean: ReturnType<typeof portal> = {
      ...model,
      loads: model.loads.filter((l) => l.kind === 'node' || l.member !== 'v1'),
    };
    const res = setMemberTwoForce(clean, 'v1', true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const v1 = res.model.members.find((m) => m.id === 'v1')!;
    expect(v1.elementType).toBe('two-force');
    expect(v1.role).toBe('diagonal'); // horizontal → no montante
    expect(v1.roleManual).toBe(true);

    // Vuelta a pórtico → rol auto.
    const back = setMemberTwoForce(res.model, 'v1', false);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const v1b = back.model.members.find((m) => m.id === 'v1')!;
    expect(v1b.elementType).toBe('beam-column');
    expect(v1b.role).toBe('viga');
    expect(v1b.roleManual).toBe(false);
  });

  it('setSupport sets/replaces/clears', () => {
    const model = portal();
    let m = setSupport(model, 'n2', 'roller');
    expect(m.supports.find((s) => s.node === 'n2')?.type).toBe('roller');
    m = setSupport(m, 'n2', 'fixed');
    expect(m.supports.find((s) => s.node === 'n2')?.type).toBe('fixed');
    m = setSupport(m, 'n2', 'none');
    expect(m.supports.find((s) => s.node === 'n2')).toBeUndefined();
  });

  it('updateLoad patches fields and guards invalid ranges', () => {
    const model = portal();
    const udl = model.loads.find((l) => l.kind === 'udl')!;
    const ok = updateLoad(model, udl.id, { from: 0.2, to: 0.8 });
    expect(ok.ok).toBe(true);

    const bad = updateLoad(model, udl.id, { from: 0.9, to: 0.1 });
    expect(bad.ok).toBe(false);

    const wind = model.loads.find((l) => l.kind === 'node')!;
    const lcChange = updateLoad(model, wind.id, { lc: 'Q', useCategory: 'C1' });
    expect(lcChange.ok).toBe(true);
    if (!lcChange.ok) return;
    const updated = lcChange.model.loads.find((l) => l.id === wind.id)!;
    expect(updated.lc).toBe('Q');
    expect(updated.useCategory).toBe('C1');
  });
});

describe('moveNode', () => {
  it('moves and re-infers auto roles of touching members', () => {
    const model = portal();
    // Tumbar el pilar p1: n2 (0, 3.5) → (6, 0.5) lo hace casi horizontal → viga.
    const res = moveNode(model, 'n2', 6, 0.5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.model.members.find((m) => m.id === 'p1')!.role).toBe('viga');
  });

  it('rejects landing on another node', () => {
    const model = portal();
    const other = model.nodes.find((x) => x.id === 'n3')!;
    expect(moveNode(model, 'n2', other.x, other.y).ok).toBe(false);
  });
});

describe('deleteSelection (borrado en bloque de la ventana de selección)', () => {
  it('cascades: a deleted node kills touching members and their loads', () => {
    const model = portal();
    const out = deleteSelection(model, { nodes: ['n2'], members: [], loads: [] });
    expect(out.nodes.map((x) => x.id)).toEqual(['n1', 'n3', 'n4']);
    // p1 y v1 tocan n2 → caen; p2 sobrevive.
    expect(out.members.map((x) => x.id)).toEqual(['p2']);
    // Las UDL de v1 caen con la barra; la carga de viento en n2, con el nudo.
    expect(out.loads).toEqual([]);
    expect(out.templateId).toBe('custom');
  });

  it('deletes members + explicit loads in one pass, leaving the rest intact', () => {
    const model = portal();
    const wind = model.loads.find((l) => l.kind === 'node')!;
    const out = deleteSelection(model, { nodes: [], members: ['v1'], loads: [wind.id] });
    expect(out.members.map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(out.loads).toEqual([]); // las UDL apuntaban a v1; el viento fue explícito
    expect(out.nodes.length).toBe(4);
    expect(out.supports.length).toBe(2);
  });

  it('empty or no-match selection returns the model untouched (no custom stamp)', () => {
    const model = portal();
    expect(deleteSelection(model, { nodes: [], members: [], loads: [] })).toBe(model);
    expect(deleteSelection(model, { nodes: ['zz'], members: ['zz'], loads: ['zz'] })).toBe(model);
  });
});

describe('copyMemberProps (brocha de propiedades)', () => {
  it('copies perfil/acero/rótulas/correas onto the target, cloning (not aliasing)', () => {
    const base = portal();
    const model: Fem2DModel = {
      ...base,
      members: base.members.map((m) =>
        m.id === 'v1' ? { ...m, releases: { i: true, j: false }, ltbSpacing: 2.5 } : m,
      ),
    };
    const src = model.members.find((m) => m.id === 'v1')!;
    const res = copyMemberProps(model, 'v1', 'p2');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p2 = res.model.members.find((m) => m.id === 'p2')!;
    expect(p2.steelSelection).toEqual(src.steelSelection);
    expect(p2.steelSelection).not.toBe(src.steelSelection);
    expect(p2.ltbSpacing).toBe(2.5);
    expect(p2.releases).toEqual({ i: true, j: false });
    // El rol NO viaja cuando el origen es auto: p2 sigue siendo pilar.
    expect(p2.role).toBe('pilar');
    expect(res.model.templateId).toBe('custom');
  });

  it('a MANUAL role travels with the paint; auto never overwrites', () => {
    const base = portal();
    const model: Fem2DModel = {
      ...base,
      members: base.members.map((m) =>
        m.id === 'v1' ? { ...m, role: 'cordon' as const, roleManual: true } : m,
      ),
    };
    const res = copyMemberProps(model, 'v1', 'p1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p1 = res.model.members.find((m) => m.id === 'p1')!;
    expect(p1.role).toBe('cordon');
    expect(p1.roleManual).toBe(true);
  });

  it('painting a biela onto a loaded member fails with the load-guard reason', () => {
    const model = portal();
    const r1 = setMemberTwoForce(model, 'p1', true);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const res = copyMemberProps(r1.model, 'p1', 'v1'); // v1 lleva 2 UDL
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toMatch(/biela/i);
  });

  it('painting beam-column onto a biela returns the target to its geometric auto role', () => {
    const model = portal();
    const r1 = setMemberTwoForce(model, 'p1', true);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const res = copyMemberProps(r1.model, 'v1', 'p1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p1 = res.model.members.find((m) => m.id === 'p1')!;
    expect(p1.elementType).toBe('beam-column');
    expect(p1.role).toBe('pilar'); // vertical → auto pilar
    expect(p1.roleManual).toBe(false);
    expect(p1.ltbSpacing).toBe(1.5); // las correas de v1 viajan
  });

  it('same bar or missing bar fails', () => {
    const model = portal();
    expect(copyMemberProps(model, 'v1', 'v1').ok).toBe(false);
    expect(copyMemberProps(model, 'zz', 'v1').ok).toBe(false);
    expect(copyMemberProps(model, 'v1', 'zz').ok).toBe(false);
  });
});

describe('setMemberMaterial — hormigón armado', () => {
  it('a HA estampa sección por rol (pilar 30×30, viga 30×50) + AMBOS armados', () => {
    const model = portal();
    const rp = setMemberMaterial(model, 'p1', 'rc');
    expect(rp.ok).toBe(true);
    if (!rp.ok) return;
    const p1 = rp.model.members.find((m) => m.id === 'p1')!;
    expect(p1.material).toBe('rc');
    expect(p1.rcSection).toMatchObject({ b: 30, h: 30, fck: 25, fyk: 500 });
    // Ambas formas de armado se estampan (sobreviven a un flip de rol).
    expect(p1.columnCage).toBeDefined();
    expect(p1.vanoArmado).toBeDefined();
    expect(p1.apoyoArmado).toBeDefined();
    // El acero previo se conserva para restaurar.
    expect(p1.steelSelection).toBeDefined();
    // LTB es concepto de acero: se limpia.
    expect(p1.ltbSpacing).toBeUndefined();
    expect(rp.model.templateId).toBe('custom');

    const rv = setMemberMaterial(model, 'v1', 'rc');
    expect(rv.ok).toBe(true);
    if (!rv.ok) return;
    expect(rv.model.members.find((m) => m.id === 'v1')!.rcSection).toMatchObject({ b: 30, h: 50 });
  });

  it('vuelta a acero restaura el perfil original y conserva los datos HA', () => {
    const model = portal();
    const originalProfile = model.members.find((m) => m.id === 'v1')!.steelSelection!.profileKey;
    const rc = setMemberMaterial(model, 'v1', 'rc');
    expect(rc.ok).toBe(true);
    if (!rc.ok) return;
    const back = setMemberMaterial(rc.model, 'v1', 'steel');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const v1 = back.model.members.find((m) => m.id === 'v1')!;
    expect(v1.material).toBe('steel');
    expect(v1.steelSelection!.profileKey).toBe(originalProfile);
    // Los datos HA quedan latentes para un segundo cambio sin pérdida.
    expect(v1.rcSection).toBeDefined();
    expect(v1.vanoArmado).toBeDefined();
  });

  it('biela ↛ HA y HA ↛ biela (ambas direcciones bloqueadas con motivo)', () => {
    const model = pratt();
    const biela = model.members.find((m) => m.elementType === 'two-force')!;
    const r1 = setMemberMaterial(model, biela.id, 'rc');
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toContain('biela');

    const portalModel = portal();
    const rc = setMemberMaterial(portalModel, 'v1', 'rc');
    expect(rc.ok).toBe(true);
    if (!rc.ok) return;
    const r2 = setMemberTwoForce(rc.model, 'v1', true);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toContain('hormigón');
  });

  it('updateMemberArmado y updateMemberColumnCage parchean sin tocar lo demás', () => {
    const model = portal();
    const rc = setMemberMaterial(model, 'v1', 'rc');
    expect(rc.ok).toBe(true);
    if (!rc.ok) return;
    const m1 = updateMemberArmado(rc.model, 'v1', 'vano', { tens_nBars: 5 });
    const v1 = m1.members.find((m) => m.id === 'v1')!;
    expect(v1.vanoArmado!.tens_nBars).toBe(5);
    expect(v1.vanoArmado!.tens_barDiam).toBe(16); // resto intacto
    expect(v1.apoyoArmado!.tens_nBars).toBe(3);   // la otra región intacta

    const m2 = updateMemberColumnCage(m1, 'v1', { nBarsX: 2 });
    expect(m2.members.find((m) => m.id === 'v1')!.columnCage!.nBarsX).toBe(2);

    // Sobre una barra de acero, no-op.
    expect(updateMemberArmado(model, 'v1', 'vano', { tens_nBars: 9 })).toBe(model);
  });

  it('la brocha copia el material HA completo (sección + armados)', () => {
    const model = portal();
    const rc = setMemberMaterial(model, 'p1', 'rc');
    expect(rc.ok).toBe(true);
    if (!rc.ok) return;
    const withArmado = updateMemberColumnCage(rc.model, 'p1', { nBarsX: 2 });
    const painted = copyMemberProps(withArmado, 'p1', 'p2');
    expect(painted.ok).toBe(true);
    if (!painted.ok) return;
    const p2 = painted.model.members.find((m) => m.id === 'p2')!;
    expect(p2.material).toBe('rc');
    expect(p2.rcSection).toMatchObject({ b: 30, h: 30 });
    expect(p2.columnCage!.nBarsX).toBe(2);
    expect(p2.vanoArmado).toBeDefined();
  });

  it('la brocha pinta una biela de acero sobre una barra HA sin tropezar con la guarda', () => {
    const model = pratt();
    // Convierte el cordón c1 (viga-columna) a HA y luego píntale la biela d1.
    const chord = model.members.find((m) => m.elementType === 'beam-column')!;
    const rc = setMemberMaterial(model, chord.id, 'rc');
    expect(rc.ok).toBe(true);
    if (!rc.ok) return;
    const biela = model.members.find((m) => m.elementType === 'two-force')!;
    // Solo si el cordón no lleva cargas de barra (la guarda de biela es previa
    // e independiente de esta prueba): quítalas.
    const noLoads = {
      ...rc.model,
      loads: rc.model.loads.filter((l) => l.kind === 'node' || l.member !== chord.id),
    };
    const painted = copyMemberProps(noLoads, biela.id, chord.id);
    expect(painted.ok).toBe(true);
    if (!painted.ok) return;
    const tgt = painted.model.members.find((m) => m.id === chord.id)!;
    expect(tgt.elementType).toBe('two-force');
    expect(tgt.material).toBe('steel');
  });
});

describe('selection helpers (marquee + Shift-click, pure)', () => {
  it('selectionToSet ↔ normalizeSelection round-trip and collapse', () => {
    expect(normalizeSelection({ nodes: [], members: [], loads: [] })).toBeNull();
    expect(normalizeSelection({ nodes: ['n1'], members: [], loads: [] })).toEqual({ kind: 'node', id: 'n1' });
    expect(normalizeSelection({ nodes: [], members: ['b1'], loads: [] })).toEqual({ kind: 'member', id: 'b1' });
    expect(normalizeSelection({ nodes: [], members: [], loads: ['l1'] })).toEqual({ kind: 'load', id: 'l1' });
    const multi = normalizeSelection({ nodes: ['n1'], members: ['b1'], loads: [] });
    expect(multi).toEqual({ kind: 'multi', nodes: ['n1'], members: ['b1'], loads: [] });

    expect(selectionToSet(null)).toEqual({ nodes: [], members: [], loads: [] });
    expect(selectionToSet({ kind: 'member', id: 'b1' })).toEqual({ nodes: [], members: ['b1'], loads: [] });
    expect(selectionToSet(multi)).toEqual({ nodes: ['n1'], members: ['b1'], loads: [] });
  });

  it('toggleInSelection adds, then removes (collapsing to null)', () => {
    let sel = toggleInSelection(null, 'member', 'b1');
    expect(sel).toEqual({ kind: 'member', id: 'b1' });
    sel = toggleInSelection(sel, 'member', 'b2'); // add second → multi
    expect(sel).toEqual({ kind: 'multi', nodes: [], members: ['b1', 'b2'], loads: [] });
    sel = toggleInSelection(sel, 'member', 'b1'); // remove first → single b2
    expect(sel).toEqual({ kind: 'member', id: 'b2' });
    sel = toggleInSelection(sel, 'member', 'b2'); // remove last → null
    expect(sel).toBeNull();
  });

  it('toggleInSelection does not mutate the input selection', () => {
    const before = { kind: 'multi' as const, nodes: ['n1'], members: ['b1'], loads: [] };
    toggleInSelection(before, 'node', 'n2');
    expect(before.nodes).toEqual(['n1']); // untouched
  });

  it('unionSelections merges and de-duplicates each collection', () => {
    const a = { nodes: ['n1'], members: ['b1', 'b2'], loads: [] };
    const b = { nodes: ['n1', 'n2'], members: ['b2', 'b3'], loads: ['l1'] };
    expect(unionSelections(a, b)).toEqual({
      nodes: ['n1', 'n2'],
      members: ['b1', 'b2', 'b3'],
      loads: ['l1'],
    });
  });
});

describe('copyMemberPropsMany (brocha en ventana, un solo undo)', () => {
  it('paints the source onto every target and skips the source itself', () => {
    const base = portal();
    const model: Fem2DModel = {
      ...base,
      members: base.members.map((m) =>
        m.id === 'v1' ? { ...m, ltbSpacing: 2.5 } : m,
      ),
    };
    const res = copyMemberPropsMany(model, 'v1', ['v1', 'p1', 'p2']);
    expect(res.applied.sort()).toEqual(['p1', 'p2']); // v1 (source) skipped
    expect(res.failures).toEqual([]);
    const p1 = res.model.members.find((m) => m.id === 'p1')!;
    const p2 = res.model.members.find((m) => m.id === 'p2')!;
    expect(p1.steelSelection).toEqual(model.members.find((m) => m.id === 'v1')!.steelSelection);
    expect(p1.ltbSpacing).toBe(2.5);
    expect(p2.ltbSpacing).toBe(2.5);
    expect(res.model.templateId).toBe('custom');
  });

  it('collects per-target failures without sinking the batch', () => {
    const model = portal();
    // Origen = biela; destinos = p1 (ok) y v1 (lleva 2 UDL → guarda de biela).
    const r1 = setMemberTwoForce(model, 'p1', true);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const res = copyMemberPropsMany(r1.model, 'p1', ['p2', 'v1']);
    expect(res.applied).toEqual(['p2']); // p2 convierte a biela sin cargas
    expect(res.failures.length).toBe(1);
    expect(res.failures[0].id).toBe('v1');
    expect(res.failures[0].reason).toMatch(/biela/i);
    // p2 quedó como biela; v1 intacta (sigue viga-columna con sus cargas).
    expect(res.model.members.find((m) => m.id === 'p2')!.elementType).toBe('two-force');
    expect(res.model.members.find((m) => m.id === 'v1')!.elementType).toBe('beam-column');
  });

  it('empty target list is a no-op returning the same model', () => {
    const model = portal();
    const res = copyMemberPropsMany(model, 'v1', []);
    expect(res.applied).toEqual([]);
    expect(res.model).toBe(model);
  });
});

describe('setMemberMaterial — madera', () => {
  it('a madera estampa la semilla C24 140×240 CS1 y conserva el perfil de acero', () => {
    const model = portal();
    const res = setMemberMaterial(model, 'v1', 'timber');
    expect(res.ok).toBe(true);
    const m = (res as { ok: true; model: Fem2DModel }).model.members.find((mm) => mm.id === 'v1')!;
    expect(m.material).toBe('timber');
    expect(m.timberSection).toEqual({ gradeId: 'C24', b: 140, h: 240, serviceClass: 1 });
    expect(m.steelSelection).toBeDefined(); // restaurable al volver a acero
  });

  it('la sección de madera SOBREVIVE al ir y volver de material (nunca se borra)', () => {
    let model = portal();
    model = (setMemberMaterial(model, 'v1', 'timber') as { ok: true; model: Fem2DModel }).model;
    model = {
      ...model,
      members: model.members.map((mm) =>
        mm.id === 'v1' && mm.timberSection ? { ...mm, timberSection: { ...mm.timberSection, gradeId: 'GL24h', h: 400 } } : mm,
      ),
    };
    model = (setMemberMaterial(model, 'v1', 'steel') as { ok: true; model: Fem2DModel }).model;
    model = (setMemberMaterial(model, 'v1', 'timber') as { ok: true; model: Fem2DModel }).model;
    const m = model.members.find((mm) => mm.id === 'v1')!;
    expect(m.timberSection).toEqual({ gradeId: 'GL24h', b: 140, h: 400, serviceClass: 1 });
  });

  it('una biela SÍ puede ser de madera (la de hormigón sigue bloqueada)', () => {
    const model = pratt();
    const diagonal = model.members.find((mm) => mm.elementType === 'two-force')!;
    const res = setMemberMaterial(model, diagonal.id, 'timber');
    expect(res.ok).toBe(true);
    const rc = setMemberMaterial(model, diagonal.id, 'rc');
    expect(rc.ok).toBe(false);
  });

  it('setMemberTwoForce acepta una viga-columna de madera', () => {
    let model = portal();
    model = (setMemberMaterial(model, 'v1', 'timber') as { ok: true; model: Fem2DModel }).model;
    // v1 lleva cargas de plantilla — las quitamos para poder pasarla a biela.
    model = {
      ...model,
      loads: model.loads.filter((l) => l.kind === 'node' || l.member !== 'v1'),
    };
    const res = setMemberTwoForce(model, 'v1', true);
    expect(res.ok).toBe(true);
    const m = (res as { ok: true; model: Fem2DModel }).model.members.find((mm) => mm.id === 'v1')!;
    expect(m.material).toBe('timber');
    expect(m.elementType).toBe('two-force');
  });

  it('copy-props pinta madera sobre acero (sección clonada, no compartida)', () => {
    let model = portal();
    model = (setMemberMaterial(model, 'v1', 'timber') as { ok: true; model: Fem2DModel }).model;
    const res = copyMemberProps(model, 'v1', 'p1');
    expect(res.ok).toBe(true);
    const out = (res as { ok: true; model: Fem2DModel }).model;
    const src = out.members.find((mm) => mm.id === 'v1')!;
    const tgt = out.members.find((mm) => mm.id === 'p1')!;
    expect(tgt.material).toBe('timber');
    expect(tgt.timberSection).toEqual(src.timberSection);
    expect(tgt.timberSection).not.toBe(src.timberSection);
  });
});

// ── Block ops: desplazar / copiar la selección con un vector ─────────────────

describe('selectionMoveNodeIds (barra seleccionada arrastra sus 2 nudos)', () => {
  it('une los nudos explícitos con los extremos de las barras seleccionadas', () => {
    const model = portal();
    const ids = selectionMoveNodeIds(model, { nodes: ['n1'], members: ['v1'], loads: [] });
    expect([...ids].sort()).toEqual(['n1', 'n2', 'n3']);
  });

  it('descarta ids inexistentes y selecciones de solo cargas', () => {
    const model = portal();
    expect(selectionMoveNodeIds(model, { nodes: ['zz'], members: ['zz'], loads: [] }).size).toBe(0);
    const loadId = model.loads[0].id;
    expect(selectionMoveNodeIds(model, { nodes: [], members: [], loads: [loadId] }).size).toBe(0);
  });
});

describe('translateSelection (desplazamiento en bloque por vector)', () => {
  const ALL = (model: Fem2DModel) => ({
    nodes: model.nodes.map((x) => x.id),
    members: [],
    loads: [],
  });

  it('traslada el pórtico entero: coordenadas desplazadas, roles y reacciones intactos', () => {
    const model = portal();
    const before = totalReactions(model);
    const res = translateSelection(model, ALL(model), 2, 1.5);
    expect(res.ok).toBe(true);
    const out = (res as { ok: true; model: Fem2DModel }).model;
    for (const nd of model.nodes) {
      const moved = out.nodes.find((x) => x.id === nd.id)!;
      expect(moved.x).toBeCloseTo(nd.x + 2, 9);
      expect(moved.y).toBeCloseTo(nd.y + 1.5, 9);
    }
    for (let i = 0; i < model.members.length; i++) {
      expect(out.members[i].role).toBe(model.members[i].role);
    }
    const after = totalReactions(out);
    expect(after.Rx).toBeCloseTo(before.Rx, 6);
    expect(after.Ry).toBeCloseTo(before.Ry, 6);
    expect(out.templateId).toBe('custom');
  });

  it('una barra PUENTE (un extremo dentro, otro fuera) rota y re-infiere su rol auto', () => {
    const model = portal();
    // Solo n2 se mueve: p1 (n1→n2) pasa de vertical a muy inclinada → viga.
    const res = translateSelection(model, { nodes: ['n2'], members: [], loads: [] }, 3, 0);
    expect(res.ok).toBe(true);
    const out = (res as { ok: true; model: Fem2DModel }).model;
    expect(out.members.find((m) => m.id === 'p1')!.role).toBe('viga');
  });

  it('rechaza el vector nulo, la selección sin nudos y la colisión con un nudo quieto', () => {
    const model = portal();
    expect(translateSelection(model, ALL(model), 0, 0)).toMatchObject({ ok: false });
    expect(
      translateSelection(model, { nodes: [], members: [], loads: [] }, 1, 0),
    ).toMatchObject({ ok: false });
    // n1 (0,0) desplazado (0, 3.5) cae sobre n2 (0, 3.5).
    const col = translateSelection(model, { nodes: ['n1'], members: [], loads: [] }, 0, 3.5);
    expect(col.ok).toBe(false);
    expect((col as { ok: false; reason: string }).reason).toContain('caería sobre');
  });
});

describe('duplicateSelection (copia en bloque: nudos + barras + apoyos + cargas)', () => {
  const ALL = (model: Fem2DModel) => ({
    nodes: model.nodes.map((x) => x.id),
    members: model.members.map((x) => x.id),
    loads: [],
  });

  it('clona el pórtico completo desplazado: dobla nudos/barras/apoyos/cargas y ΣRy', () => {
    const model = portal();
    const before = totalReactions(model);
    const res = duplicateSelection(model, ALL(model), 8, 0);
    expect(res.ok).toBe(true);
    const { model: out, selection } = res as {
      ok: true; model: Fem2DModel; selection: { nodes: string[]; members: string[]; loads: string[] };
    };
    expect(out.nodes).toHaveLength(model.nodes.length * 2);
    expect(out.members).toHaveLength(model.members.length * 2);
    expect(out.supports).toHaveLength(model.supports.length * 2);
    expect(out.loads).toHaveLength(model.loads.length * 2);
    // La selección devuelta ES la copia (para encadenar).
    expect(selection.nodes).toHaveLength(model.nodes.length);
    expect(selection.members).toHaveLength(model.members.length);
    // Sin colisiones de id entre colecciones (pool compartido).
    const all = [
      ...out.nodes.map((x) => x.id),
      ...out.members.map((x) => x.id),
      ...out.loads.map((x) => x.id),
    ];
    expect(new Set(all).size).toBe(all.length);
    // Física: dos pórticos idénticos → doble reacción vertical total.
    const after = totalReactions(out);
    expect(after.Ry).toBeCloseTo(before.Ry * 2, 6);
  });

  it('la copia clona las propiedades por VALOR (sin compartir objetos anidados)', () => {
    const model = portal();
    const res = duplicateSelection(model, ALL(model), 8, 0);
    const { model: out, selection } = res as {
      ok: true; model: Fem2DModel; selection: { nodes: string[]; members: string[]; loads: string[] };
    };
    const srcV1 = out.members.find((m) => m.id === 'v1')!;
    const clones = out.members.filter((m) => selection.members.includes(m.id));
    const cloneV1 = clones.find((m) => m.ltbSpacing !== undefined)!; // el dintel arriostrado
    expect(cloneV1.steelSelection).toEqual(srcV1.steelSelection);
    expect(cloneV1.steelSelection).not.toBe(srcV1.steelSelection);
    expect(cloneV1.releases).not.toBe(srcV1.releases);
    expect(cloneV1.ltbSpacing).toBe(srcV1.ltbSpacing);
  });

  it('bloque parcial: copiar solo el dintel arrastra sus nudos y sus cargas, sin apoyos', () => {
    const model = portal();
    const memberLoads = model.loads.filter((l) => l.kind !== 'node' && l.member === 'v1').length;
    const nodeLoads = model.loads.filter((l) => l.kind === 'node' && (l.node === 'n2' || l.node === 'n3')).length;
    const res = duplicateSelection(model, { nodes: [], members: ['v1'], loads: [] }, 0, 3);
    expect(res.ok).toBe(true);
    const { model: out, selection } = res as {
      ok: true; model: Fem2DModel; selection: { nodes: string[]; members: string[]; loads: string[] };
    };
    expect(selection.nodes).toHaveLength(2);
    expect(selection.members).toHaveLength(1);
    expect(out.supports).toHaveLength(model.supports.length); // n2/n3 no tienen apoyo
    expect(out.loads).toHaveLength(model.loads.length + memberLoads + nodeLoads);
  });

  it('rechaza vector nulo y colisión con nudos existentes', () => {
    const model = portal();
    expect(duplicateSelection(model, ALL(model), 0, 0)).toMatchObject({ ok: false });
    // n1 (0,0) copiado a (6,0) cae sobre n4.
    const col = duplicateSelection(model, { nodes: ['n1'], members: [], loads: [] }, 6, 0);
    expect(col.ok).toBe(false);
    expect((col as { ok: false; reason: string }).reason).toContain('caería sobre');
  });

  it('encadena con la selección devuelta y respeta el máximo de nudos', () => {
    let model = portal(); // 4 nudos
    let sel = ALL(model) as { nodes: string[]; members: string[]; loads: string[] };
    // 14 copias de 4 nudos → 60 = límite exacto; la 15ª debe rechazarse.
    for (let k = 0; k < 14; k++) {
      const res = duplicateSelection(model, sel, 8, 0);
      expect(res.ok).toBe(true);
      const okRes = res as { ok: true; model: Fem2DModel; selection: typeof sel };
      model = okRes.model;
      sel = okRes.selection;
    }
    expect(model.nodes).toHaveLength(60);
    // La última copia quedó desplazada 14·8 = 112 m del original.
    const lastXs = model.nodes.filter((nd) => sel.nodes.includes(nd.id)).map((nd) => nd.x);
    expect(Math.min(...lastXs)).toBeCloseTo(112, 6);
    const overflow = duplicateSelection(model, sel, 8, 0);
    expect(overflow.ok).toBe(false);
    expect((overflow as { ok: false; reason: string }).reason).toContain('superaría el máximo');
  });
});

describe('editMembersMany (edición en grupo del inspector, un undo)', () => {
  it('aplica una op infalible (perfil) a todas las barras', () => {
    const model = portal();
    const res = editMembersMany(model, ['p1', 'v1', 'p2'], (mm, id) =>
      setMemberProfile(mm, id, 'steel_HEB200'),
    );
    expect(res.applied).toEqual(['p1', 'v1', 'p2']);
    expect(res.failures).toEqual([]);
    for (const m of res.model.members) {
      expect(m.steelSelection?.profileKey).toBe('steel_HEB200');
    }
  });

  it('una op con guarda omite las barras incompatibles sin hundir el lote', () => {
    const model = portal();
    // v1 tiene cargas en barra: no puede pasar a biela; p1 sí.
    const res = editMembersMany(model, ['p1', 'v1'], (mm, id) =>
      setMemberTwoForce(mm, id, true),
    );
    expect(res.applied).toEqual(['p1']);
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0].id).toBe('v1');
    expect(res.failures[0].reason).toContain('cargas');
    expect(res.model.members.find((m) => m.id === 'p1')!.elementType).toBe('two-force');
    expect(res.model.members.find((m) => m.id === 'v1')!.elementType).toBe('beam-column');
  });

  it('las ops de modelo pelado cuentan como aplicadas (rol en grupo)', () => {
    const model = portal();
    const res = editMembersMany(model, ['p1', 'p2'], (mm, id) => setMemberRole(mm, id, 'cordon'));
    expect(res.applied).toEqual(['p1', 'p2']);
    for (const id of ['p1', 'p2']) {
      const m = res.model.members.find((x) => x.id === id)!;
      expect(m.role).toBe('cordon');
      expect(m.roleManual).toBe(true);
    }
  });
});
