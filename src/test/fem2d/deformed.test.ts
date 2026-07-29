// FEM 2D — deformed-shape computation (pure, analytical battery).
//
// The shape must be the COHERENT displacement field of one combination set
// (the governing one of the group), so the checks compare against closed-form
// deflections computed from the SAME catalog stiffness the solver uses.

import { describe, expect, it } from 'vitest';
import { steelStiffness } from '../../lib/frame-core/sections';
import { computeDeformedShape } from '../../features/fem2d/deformed';
import { solveFem2D } from '../../features/fem2d/pipeline';
import type { Fem2DLoad, Fem2DModel } from '../../features/fem2d/types';

const EI = steelStiffness('steel_IPE240')!.EI; // kN·m²

function cantilever(loads: Fem2DLoad[]): Fem2DModel {
  return {
    templateId: 'custom',
    selfWeight: false,
    nodes: [
      { id: 'n1', x: 0, y: 0 },
      { id: 'n2', x: 0, y: 3 },
    ],
    members: [{
      id: 'b1', i: 'n1', j: 'n2',
      material: 'steel', steelSelection: { profileKey: 'steel_IPE240', steel: 'S275' },
      releases: { i: false, j: false },
    }],
    supports: [{ node: 'n1', type: 'fixed' }],
    loads,
  };
}

function simpleBeam(loads: Fem2DLoad[]): Fem2DModel {
  return {
    templateId: 'custom',
    selfWeight: false,
    nodes: [
      { id: 'n1', x: 0, y: 0 },
      { id: 'n2', x: 6, y: 0 },
    ],
    members: [{
      id: 'b1', i: 'n1', j: 'n2',
      material: 'steel', steelSelection: { profileKey: 'steel_IPE240', steel: 'S275' },
      releases: { i: false, j: false },
    }],
    supports: [
      { node: 'n1', type: 'pinned' },
      { node: 'n2', type: 'roller' },
    ],
    loads,
  };
}

describe('computeDeformedShape — analytical battery', () => {
  it('cantilever + horizontal tip load: δ_tip = F·L³/3EI (ELS-c) and ×1.5 in ELU', () => {
    const F = 10, L = 3;
    const model = cantilever([
      { id: 'l1', kind: 'node', lc: 'W', node: 'n2', Fx: F, Fy: 0 },
    ]);
    const res = solveFem2D(model);
    expect(res.ok).toBe(true);
    const expected = (F * L ** 3) / (3 * EI);

    const els = computeDeformedShape(model, res.elements, [{ W: 1 }]); // ELS-c: W característico
    expect(els.members).toHaveLength(1);
    const tip = els.members[0].disp[els.members[0].disp.length - 1];
    expect(tip.dx).toBeCloseTo(expected, 8);
    expect(Math.abs(tip.dy)).toBeLessThan(1e-9); // horizontal load → no axial
    expect(els.peak).toBeCloseTo(expected, 8);
    expect(els.peakAt?.x).toBeCloseTo(0, 9);
    expect(els.peakAt?.y).toBeCloseTo(3, 9);

    // Node displacements: base clamped, tip = closed form.
    const n1 = els.nodes.find((n) => n.id === 'n1')!;
    const n2 = els.nodes.find((n) => n.id === 'n2')!;
    expect(Math.hypot(n1.dx, n1.dy)).toBeLessThan(1e-12);
    expect(n2.dx).toBeCloseTo(expected, 8);

    // Mid-height sample: w(x) = F·x²(3L−x)/6EI at x = L/2.
    const xm = L / 2;
    const wMid = (F * xm * xm * (3 * L - xm)) / (6 * EI);
    expect(els.members[0].mid).not.toBeNull();
    expect(els.members[0].mid!.y).toBeCloseTo(xm, 9);
    expect(els.members[0].mid!.dx).toBeCloseTo(wMid, 8);

    const elu = computeDeformedShape(model, res.elements, [{ G: 1.35, W: 1.5 }]); // ELU
    expect(elu.peak).toBeCloseTo(1.5 * expected, 8);
  });

  it('simply supported + UDL: δ_mid = 5qL⁴/384EI downward (ELS-cp)', () => {
    const q = 10, L = 6;
    const model = simpleBeam([
      { id: 'l1', kind: 'udl', lc: 'G', member: 'b1', wx: 0, wy: -q, frame: 'global' },
    ]);
    const res = solveFem2D(model);
    expect(res.ok).toBe(true);

    const shape = computeDeformedShape(model, res.elements, [{ G: 1 }]); // ELS-cp (sólo G)
    const m = shape.members[0];
    const midIdx = m.base.findIndex((p) => Math.abs(p.x - L / 2) < 1e-9);
    expect(midIdx).toBeGreaterThan(-1);
    const expected = (5 * q * L ** 4) / (384 * EI);
    expect(m.disp[midIdx].dy).toBeCloseTo(-expected, 8);
    expect(shape.peak).toBeCloseTo(expected, 8);

    // The reported mid-span sample IS the L/2 one.
    expect(m.mid!.x).toBeCloseTo(L / 2, 9);
    expect(m.mid!.dy).toBeCloseTo(-expected, 8);
    // Nodes ride the supports: present, but ≈0 (the layer filters them).
    expect(shape.nodes).toHaveLength(2);
    for (const n of shape.nodes) expect(Math.hypot(n.dx, n.dy)).toBeLessThan(1e-10);
  });

  it('two-force members report no mid-span value (straight interpolation)', () => {
    // Triangle truss: two-force diagonals + a beam-column tie; nodal load.
    const model: Fem2DModel = {
      templateId: 'custom',
      selfWeight: false,
      nodes: [
        { id: 'n1', x: 0, y: 0 },
        { id: 'n2', x: 4, y: 0 },
        { id: 'n3', x: 2, y: 1.5 },
      ],
      members: [
        {
          id: 'b1', i: 'n1', j: 'n2',
          material: 'steel', steelSelection: { profileKey: 'steel_IPE240', steel: 'S275' },
          releases: { i: false, j: false },
        },
        {
          id: 'd1', i: 'n1', j: 'n3',
          material: 'steel', steelSelection: { profileKey: 'steel_IPE240', steel: 'S275' },
          releases: { i: true, j: true }, // birrotulada + descargada ⇒ biela derivada
        },
        {
          id: 'd2', i: 'n3', j: 'n2',
          material: 'steel', steelSelection: { profileKey: 'steel_IPE240', steel: 'S275' },
          releases: { i: true, j: true }, // birrotulada + descargada ⇒ biela derivada
        },
      ],
      supports: [
        { node: 'n1', type: 'pinned' },
        { node: 'n2', type: 'roller' },
      ],
      loads: [{ id: 'l1', kind: 'node', lc: 'G', node: 'n3', Fx: 0, Fy: -10 }],
    };
    const res = solveFem2D(model);
    expect(res.ok).toBe(true);
    const shape = computeDeformedShape(model, res.elements, [{ G: 1 }]); // ELS-cp (sólo G)
    const byId = new Map(shape.members.map((m) => [m.memberId, m]));
    expect(byId.get('d1')!.mid).toBeNull();
    expect(byId.get('d2')!.mid).toBeNull();
    expect(byId.get('b1')!.mid).not.toBeNull();
    expect(shape.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3']);
    const apex = shape.nodes.find((n) => n.id === 'n3')!;
    expect(apex.dy).toBeLessThan(0); // gravity load → apex settles
  });

  it('mid point load (decompose splits the member): continuous shape, δ_mid = PL³/48EI', () => {
    const P = 10, L = 6;
    const model = simpleBeam([
      { id: 'l1', kind: 'point-member', lc: 'G', member: 'b1', pos: 0.5, Fx: 0, Fy: -P, frame: 'global' },
    ]);
    const res = solveFem2D(model);
    expect(res.ok).toBe(true);
    expect(res.elements).toHaveLength(2); // split at the load

    const shape = computeDeformedShape(model, res.elements, [{ G: 1 }]); // ELS-cp (sólo G)
    const m = shape.members[0];
    // The polyline concatenates both elements: the junction sample is emitted
    // twice (end of e1, start of e2) and must carry the SAME displacement.
    const nPerEl = res.elements[0].samples.xs.length;
    const jEnd = nPerEl - 1;
    const jStart = nPerEl;
    expect(m.base[jEnd].x).toBeCloseTo(m.base[jStart].x, 9);
    expect(m.disp[jEnd].dx).toBeCloseTo(m.disp[jStart].dx, 9);
    expect(m.disp[jEnd].dy).toBeCloseTo(m.disp[jStart].dy, 9);

    const expected = (P * L ** 3) / (48 * EI);
    expect(m.disp[jEnd].dy).toBeCloseTo(-expected, 8);
    expect(shape.peak).toBeCloseTo(expected, 8);
  });

  it('picks the governing set of the group (lateral W beats axial Q on a cantilever)', () => {
    const model = cantilever([
      { id: 'l1', kind: 'node', lc: 'W', node: 'n2', Fx: 10, Fy: 0 },
      { id: 'l2', kind: 'node', lc: 'Q', node: 'n2', Fx: 0, Fy: -1, useCategory: 'B' },
    ]);
    const res = solveFem2D(model);
    expect(res.ok).toBe(true);

    // Two ELU sets (W principal / Q principal); the lateral deflection dwarfs
    // the axial shortening, so W-principal (γ=1.5 on W) must govern. Se pasan
    // AMBOS sets para que la selección de gobernante (peak δ) siga ejercitándose.
    // ψ0: Q(B)=0.7 → 1.5·0.7=1.05; W=0.6 → 1.5·0.6=0.9.
    const shape = computeDeformedShape(model, res.elements, [
      { G: 1.35, W: 1.5, Q: 1.05 }, // W principal
      { G: 1.35, Q: 1.5, W: 0.9 }, // Q principal
    ]);
    expect(shape.factors?.W).toBeCloseTo(1.5, 9);
  });

  it('no elements → empty shape', () => {
    const model = simpleBeam([]);
    const shape = computeDeformedShape(model, [], [{ G: 1.35 }]);
    expect(shape.members).toHaveLength(0);
    expect(shape.peak).toBe(0);
    expect(shape.factors).toBeNull();
  });
});
