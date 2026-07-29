// FEM 2D — decompose tests (Lane B): design model → analysis model.
//
// Focus: member splitting along the MEMBER AXIS (vertical members must not
// vanish — the 1D global-x sweep bug), global↔local load resolution on
// inclined members (the FEF-rotation silent killer), self-weight lumping,
// releases and BC mapping.

import { describe, expect, it } from 'vitest';
import {
  beamColumn,
  fem2dModel,
  memberPointLoad,
  memberUdl,
  node2d,
  nodeLoad,
  support2d,
  twoForce,
} from '../../features/fem2d/builder';
import { decompose2D } from '../../features/fem2d/decompose';
import { steelSelfWeight } from '../../lib/frame-core/sections';

const DEFAULT_KEY = 'steel_IPE240';

describe('decompose2D — geometry & splits', () => {
  it('a VERTICAL column survives decompose (the 1D x-sweep dropped it)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 0, 3.5)],
      members: [beamColumn('p1', 'n1', 'n2')],
      supports: [support2d('n1', 'fixed')],
      loads: [nodeLoad('l1', 'n2', { lc: 'W', Fx: 8 })],
    });
    const { analysis, errors } = decompose2D(model);
    expect(errors).toEqual([]);
    expect(analysis.elements).toHaveLength(1);
    expect(analysis.elements[0]).toMatchObject({ i: 'n1', j: 'n2', designMemberId: 'p1' });
  });

  it('splits at point-member positions and partial-UDL boundaries along the axis', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 8, 6)], // inclined, L=10
      members: [beamColumn('m1', 'n1', 'n2')],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [
        memberPointLoad('l1', 'm1', 0.5, { lc: 'G', Fy: -10 }),
        memberUdl('l2', 'm1', { lc: 'G', wy: -5, from: 0.2, to: 0.8 }),
      ],
    });
    const { analysis, errors } = decompose2D(model);
    expect(errors).toEqual([]);
    // Anchors: 0, 0.2, 0.5, 0.8, 1 → 4 elements; interior nodes on the axis.
    expect(analysis.elements).toHaveLength(4);
    const mid = analysis.nodes.find((n) => n.id === 'm1_s2')!;
    expect(mid.x).toBeCloseTo(4, 12);
    expect(mid.y).toBeCloseTo(3, 12);
    // UDL covers only the two middle elements (mid-t 0.35 and 0.65).
    const g = analysis.loadCases.find((c) => c.lc === 'G')!;
    expect(g.q.map((q) => q.qy !== 0)).toEqual([false, true, true, false]);
    // Point load landed on the split node as a GLOBAL nodal force.
    expect(g.nodeLoads).toContainEqual({ node: 'm1_s2', Fx: 0, Fy: -10 });
  });

  it('point-member at pos≈1 lands on the end node without splitting', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 3, 0)],
      members: [beamColumn('m1', 'n1', 'n2')],
      supports: [support2d('n1', 'fixed')],
      loads: [memberPointLoad('l1', 'm1', 1, { lc: 'Q', Fy: -15, useCategory: 'B' })],
    });
    const { analysis } = decompose2D(model);
    expect(analysis.elements).toHaveLength(1);
    const q = analysis.loadCases.find((c) => c.lc === 'Q')!;
    expect(q.nodeLoads).toContainEqual({ node: 'n2', Fx: 0, Fy: -15 });
  });
});

describe('decompose2D — load frames (the rotation contract)', () => {
  it('GLOBAL vertical UDL on a 3-4-5 member → local (qx, qy) = (s·wy, c·wy)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 4, 3)],
      members: [beamColumn('m1', 'n1', 'n2')],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -10 })], // global gravity
    });
    const { analysis } = decompose2D(model);
    const q = analysis.loadCases.find((c) => c.lc === 'G')!.q[0];
    // c=0.8, s=0.6: qx_local = s·wy = −6 ; qy_local = c·wy = −8.
    expect(q.qx).toBeCloseTo(-6, 12);
    expect(q.qy).toBeCloseTo(-8, 12);
  });

  it('LOCAL UDL passes through unrotated; LOCAL point load rotates to global', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 4, 3)],
      members: [beamColumn('m1', 'n1', 'n2')],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [
        memberUdl('l1', 'm1', { lc: 'W', wy: -2, frame: 'local' }),
        memberPointLoad('l2', 'm1', 0.5, { lc: 'W', Fy: -5, frame: 'local' }),
      ],
    });
    const { analysis } = decompose2D(model);
    const w = analysis.loadCases.find((c) => c.lc === 'W')!;
    expect(w.q[0]).toEqual({ qx: 0, qy: -2 });
    // Local (0, −5) → global: gx = −s·Fy·(−1)? — contract: (c·Fx − s·Fy, s·Fx + c·Fy)
    // = (0.8·0 − 0.6·(−5), 0.6·0 + 0.8·(−5)) = (3, −4).
    const nl = w.nodeLoads.find((l) => l.node === 'm1_s1')!;
    expect(nl.Fx).toBeCloseTo(3, 12);
    expect(nl.Fy).toBeCloseTo(-4, 12);
  });
});

describe('decompose2D — self-weight (D10 lumping)', () => {
  it('beam-column member gets a local-resolved UDL; two-force gets nodal halves', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 0, 3), node2d('n3', 4, 3)],
      members: [
        beamColumn('p1', 'n1', 'n2'),   // vertical
        twoForce('d1', 'n1', 'n3'),                          // diagonal, L=5
      ],
      supports: [support2d('n1', 'fixed'), support2d('n3', 'pinned')],
      selfWeight: true,
    });
    const { analysis } = decompose2D(model);
    const g = analysis.loadCases.find((c) => c.lc === 'G')!;
    const sw = steelSelfWeight(DEFAULT_KEY); // both members use the default profile
    // Vertical column (c=0, s=1): global (0, −sw) → local qx = −sw, qy = 0
    // (weight acts ALONG a vertical member: pure axial distributed load).
    expect(g.q[0].qx).toBeCloseTo(-sw, 12);
    expect(g.q[0].qy).toBeCloseTo(0, 12);
    // Two-force diagonal: NO element load, half the weight at each end node.
    expect(g.q[1]).toEqual({ qx: 0, qy: 0 });
    const half = (sw * 5) / 2;
    expect(g.nodeLoads).toContainEqual({ node: 'n1', Fx: 0, Fy: -half });
    expect(g.nodeLoads).toContainEqual({ node: 'n3', Fx: 0, Fy: -half });
  });
});

describe('decompose2D — releases, BCs, guards', () => {
  it('member releases map to the first/last element only', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [beamColumn('m1', 'n1', 'n2', { releases: { i: true, j: true } })],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberPointLoad('l1', 'm1', 0.5, { lc: 'G', Fy: -10 })],
    });
    const { analysis } = decompose2D(model);
    expect(analysis.elements).toHaveLength(2);
    expect(analysis.elements[0]).toMatchObject({ releaseI: true, releaseJ: false });
    expect(analysis.elements[1]).toMatchObject({ releaseI: false, releaseJ: true });
  });

  it('supports map to fixX/fixY/fixRot', () => {
    const model = fem2dModel({
      nodes: [node2d('a', 0, 0), node2d('b', 2, 0), node2d('c', 4, 0)],
      members: [beamColumn('m1', 'a', 'b'), beamColumn('m2', 'b', 'c')],
      supports: [support2d('a', 'fixed'), support2d('b', 'pinned'), support2d('c', 'roller')],
    });
    const { analysis } = decompose2D(model);
    expect(analysis.bcs).toEqual([
      { node: 'a', fixX: true, fixY: true, fixRot: true },
      { node: 'b', fixX: true, fixY: true, fixRot: false },
      { node: 'c', fixX: false, fixY: true, fixRot: false },
    ]);
  });

  it('unknown steel profile → hard fail (never a silent zero-stiffness member)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 3, 0)],
      members: [beamColumn('m1', 'n1', 'n2', { steelSelection: { profileKey: 'steel_NOPE', steel: 'S275' } })],
      supports: [support2d('n1', 'fixed')],
    });
    const { errors } = decompose2D(model);
    expect(errors.some((e) => e.code === 'UNKNOWN_PROFILE' && e.severity === 'fail')).toBe(true);
  });
});
