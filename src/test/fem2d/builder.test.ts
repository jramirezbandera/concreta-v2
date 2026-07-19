// FEM 2D — builder + basic validation tests (Lane A)

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STEEL_2D,
  beamColumn,
  fem2dModel,
  memberLength,
  memberPointLoad,
  memberUdl,
  node2d,
  nodeLoad,
  support2d,
  twoForce,
  validateModel2DBasic,
} from '../../features/fem2d/builder';
import { FEM2D_MAX_MEMBERS, FEM2D_MAX_NODES } from '../../features/fem2d/types';
import type { Fem2DMember, Fem2DModel } from '../../features/fem2d/types';

function codes(model: Fem2DModel): string[] {
  return validateModel2DBasic(model).map((e) => e.code);
}

/** Minimal valid model: one column fixed at base with a tip load. */
function columnModel(): Fem2DModel {
  return fem2dModel({
    nodes: [node2d('n1', 0, 0), node2d('n2', 0, 3)],
    members: [beamColumn('m1', 'n1', 'n2', { role: 'pilar' })],
    supports: [support2d('n1', 'fixed')],
    loads: [nodeLoad('l1', 'n2', { lc: 'W', Fx: 10 })],
  });
}

describe('fem2d builder factories', () => {
  it('beamColumn defaults: viga role, default steel profile, no releases', () => {
    const m = beamColumn('m1', 'a', 'b');
    expect(m.elementType).toBe('beam-column');
    expect(m.role).toBe('viga');
    expect(m.material).toBe('steel');
    expect(m.steelSelection).toEqual(DEFAULT_STEEL_2D);
    expect(m.releases).toEqual({ i: false, j: false });
  });

  it('twoForce defaults to diagonal role', () => {
    const m = twoForce('d1', 'a', 'b');
    expect(m.elementType).toBe('two-force');
    expect(m.role).toBe('diagonal');
  });

  it('rcSection switches material to rc and drops steelSelection', () => {
    const m = beamColumn('m1', 'a', 'b', {
      rcSection: { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' },
    });
    expect(m.material).toBe('rc');
    expect(m.steelSelection).toBeUndefined();
  });

  it('load factories default missing components to 0 and frame to global', () => {
    const p = nodeLoad('l1', 'n1', { lc: 'G', Fy: -5 });
    expect(p).toMatchObject({ Fx: 0, Fy: -5 });
    const u = memberUdl('l2', 'm1', { lc: 'G', wy: -3 });
    expect(u).toMatchObject({ wx: 0, wy: -3, frame: 'global' });
    const q = memberPointLoad('l3', 'm1', 0.5, { lc: 'Q', Fx: 2 });
    expect(q).toMatchObject({ pos: 0.5, Fx: 2, Fy: 0, frame: 'global' });
  });

  it('fem2dModel defaults: custom template, selfWeight OFF for clean test numbers', () => {
    const m = columnModel();
    expect(m.templateId).toBe('custom');
    expect(m.selfWeight).toBe(false);
  });

  it('memberLength works on inclined members', () => {
    const model = fem2dModel({
      nodes: [node2d('a', 0, 0), node2d('b', 3, 4)],
      members: [beamColumn('m1', 'a', 'b')],
    });
    expect(memberLength(model, model.members[0])).toBeCloseTo(5, 12);
  });
});

describe('validateModel2DBasic', () => {
  it('accepts a minimal valid model', () => {
    expect(validateModel2DBasic(columnModel())).toEqual([]);
  });

  it('rejects duplicate ids per collection', () => {
    const m = columnModel();
    m.nodes.push(node2d('n1', 5, 5));
    expect(codes(m)).toContain('DUPLICATE_ID');
  });

  it('rejects members referencing missing nodes and self-loops', () => {
    const m = columnModel();
    m.members.push(beamColumn('m2', 'n2', 'nope'));
    m.members.push(beamColumn('m3', 'n2', 'n2'));
    const c = codes(m);
    expect(c).toContain('MEMBER_NODE_MISSING');
    expect(c).toContain('MEMBER_SELF_LOOP');
  });

  it('rejects members below minimum length', () => {
    const m = columnModel();
    m.nodes.push(node2d('n3', 0, 3.001));
    m.members.push(beamColumn('m2', 'n2', 'n3'));
    expect(codes(m)).toContain('MEMBER_TOO_SHORT');
  });

  it('rejects steel members without profile and rc members without section', () => {
    const m = columnModel();
    const bare = { ...beamColumn('m2', 'n1', 'n2') } as Fem2DMember;
    delete bare.steelSelection;
    m.members.push(bare);
    const rc = beamColumn('m3', 'n1', 'n2');
    (rc as Fem2DMember).material = 'rc';
    m.members.push(rc);
    const c = codes(m);
    expect(c.filter((x) => x === 'MEMBER_SECTION_MISSING')).toHaveLength(2);
  });

  it('rejects supports and loads referencing missing targets', () => {
    const m = columnModel();
    m.supports.push(support2d('ghost', 'pinned'));
    m.loads.push(nodeLoad('l2', 'ghost', { lc: 'G', Fy: -1 }));
    m.loads.push(memberUdl('l3', 'ghost-member', { lc: 'G', wy: -1 }));
    const c = codes(m);
    expect(c).toContain('SUPPORT_NODE_MISSING');
    expect(c.filter((x) => x === 'LOAD_TARGET_MISSING')).toHaveLength(2);
  });

  it('D10: rejects ANY member load on a two-force member', () => {
    const m = columnModel();
    m.members.push(twoForce('d1', 'n1', 'n2'));
    m.loads.push(memberUdl('l2', 'd1', { lc: 'G', wy: -5 }));
    m.loads.push(memberPointLoad('l3', 'd1', 0.5, { lc: 'G', Fy: -5 }));
    const c = codes(m);
    expect(c.filter((x) => x === 'TWO_FORCE_MEMBER_LOAD')).toHaveLength(2);
  });

  it('rejects out-of-range point-member pos and invalid partial UDL ranges', () => {
    const m = columnModel();
    m.loads.push(memberPointLoad('l2', 'm1', 1.5, { lc: 'G', Fy: -1 }));
    m.loads.push(memberUdl('l3', 'm1', { lc: 'G', wy: -1, from: 0.8, to: 0.2 }));
    const c = codes(m);
    expect(c).toContain('LOAD_POS_OUT_OF_RANGE');
    expect(c).toContain('LOAD_PARTIAL_RANGE_INVALID');
  });

  it('D4: rejects models over the node / member caps', () => {
    const big = fem2dModel({
      nodes: Array.from({ length: FEM2D_MAX_NODES + 1 }, (_, i) => node2d(`n${i}`, i, 0)),
      members: [],
    });
    expect(codes(big)).toContain('MODEL_TOO_LARGE');

    const manyMembers = fem2dModel({
      nodes: [node2d('a', 0, 0), node2d('b', 1, 0)],
      members: Array.from({ length: FEM2D_MAX_MEMBERS + 1 }, (_, i) => beamColumn(`m${i}`, 'a', 'b')),
    });
    expect(codes(manyMembers)).toContain('MODEL_TOO_LARGE');
  });
});
