// FEM 2D — end-to-end: parametric template → decompose → solve (Lane B)
//
// Closes the loop the outside voice asked for: Fases 1-3 are exercised on the
// REAL models the module ships, not only on hand-built fixtures. Asserts:
// solvable without errors, global equilibrium including self-weight, and the
// classic Pratt force pattern (signs of N per member class).

import { describe, expect, it } from 'vitest';
import { memberLength } from '../../features/fem2d/builder';
import { solveFem2D } from '../../features/fem2d/pipeline';
import { FEM2D_TEMPLATES } from '../../features/fem2d/templates';
import { rcSelfWeight, steelSelfWeight } from '../../lib/frame-core/sections';
import type { Fem2DModel, LoadCase } from '../../features/fem2d/types';

/** Total applied global force for a case: loads + (G) self-weight. */
function expectedTotals(model: Fem2DModel, lc: LoadCase): { Fx: number; Fy: number } {
  let Fx = 0;
  let Fy = 0;
  for (const ld of model.loads) {
    if (ld.lc !== lc) continue;
    if (ld.kind === 'node') {
      Fx += ld.Fx; Fy += ld.Fy;
      continue;
    }
    const m = model.members.find((mm) => mm.id === ld.member)!;
    const L = memberLength(model, m);
    const ni = model.nodes.find((n) => n.id === m.i)!;
    const nj = model.nodes.find((n) => n.id === m.j)!;
    const c = (nj.x - ni.x) / L;
    const s = (nj.y - ni.y) / L;
    const frac = ld.kind === 'udl' ? (ld.to ?? 1) - (ld.from ?? 0) : 0;
    const [fx, fy] = ld.kind === 'udl' ? [ld.wx * L * frac, ld.wy * L * frac] : [ld.Fx, ld.Fy];
    if (ld.frame === 'global') { Fx += fx; Fy += fy; }
    else { Fx += c * fx - s * fy; Fy += s * fx + c * fy; }
  }
  if (lc === 'G' && model.selfWeight) {
    for (const m of model.members) {
      const w = m.material === 'rc' && m.rcSection
        ? rcSelfWeight(m.rcSection)
        : m.steelSelection
          ? steelSelfWeight(m.steelSelection.profileKey)
          : 0;
      Fy -= w * memberLength(model, m);
    }
  }
  return { Fx, Fy };
}

function sumReactions(r: ReturnType<typeof solveFem2D>, lc: string): { Rx: number; Ry: number } {
  let Rx = 0;
  let Ry = 0;
  for (const re of r.reactionsByLc[lc] ?? []) { Rx += re.Rx; Ry += re.Ry; }
  return { Rx, Ry };
}

describe('all templates solve end-to-end', () => {
  for (const [key, template] of Object.entries(FEM2D_TEMPLATES)) {
    it(`${key}: defaults → ok, no errors, ΣR = −ΣF per case (self-weight included)`, () => {
      const model = template.build(template.defaults() as never);
      const r = solveFem2D(model);
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
      const cases = new Set(model.loads.map((l) => l.lc));
      if (model.selfWeight) cases.add('G');
      for (const lc of cases) {
        const applied = expectedTotals(model, lc);
        const react = sumReactions(r, lc);
        expect(react.Rx + applied.Fx, `ΣFx ${key}/${lc}`).toBeCloseTo(0, 6);
        expect(react.Ry + applied.Fy, `ΣFy ${key}/${lc}`).toBeCloseTo(0, 6);
      }
    });
  }
});

describe('pratt truss — classic force pattern under gravity', () => {
  const model = FEM2D_TEMPLATES['pratt-truss'].build(FEM2D_TEMPLATES['pratt-truss'].defaults());
  const r = solveFem2D(model);
  const N = (memberId: string): number => {
    const els = r.elements.filter((e) => e.designMemberId === memberId);
    expect(els.length).toBeGreaterThan(0);
    // Worst-|N| sample across the member's elements, signed.
    let best = 0;
    for (const e of els) for (const n of e.samples.N.G ?? []) if (Math.abs(n) > Math.abs(best)) best = n;
    return best;
  };

  it('bottom chord in TENSION at midspan, top chord in COMPRESSION', () => {
    expect(r.ok).toBe(true);
    expect(N('ci2')).toBeGreaterThan(0);
    expect(N('ci3')).toBeGreaterThan(0);
    expect(N('cs1')).toBeLessThan(0);
    expect(N('cs2')).toBeLessThan(0);
  });

  it('end posts in COMPRESSION, interior diagonals in TENSION (Pratt signature)', () => {
    expect(N('d1')).toBeLessThan(0);  // end post b0→t1
    expect(N('d4')).toBeLessThan(0);  // end post t3→b4
    expect(N('d2')).toBeGreaterThan(0); // interior t1→b2
    expect(N('d3')).toBeGreaterThan(0); // interior t3→b2
  });

  it('mirror symmetry: |N| of symmetric pairs match', () => {
    expect(Math.abs(N('d1'))).toBeCloseTo(Math.abs(N('d4')), 6);
    expect(Math.abs(N('ci1'))).toBeCloseTo(Math.abs(N('ci4')), 6);
    expect(Math.abs(N('m1'))).toBeCloseTo(Math.abs(N('m3')), 6);
  });
});

describe('frames — corner continuity and wind paths', () => {
  it('portal: joint equilibrium at the eave (|M| beam end = |M| column top, no nodal moment)', () => {
    const model = FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
    const r = solveFem2D(model);
    expect(r.ok).toBe(true);
    const beamEls = r.elements.filter((e) => e.designMemberId === 'v1');
    const colEls = r.elements.filter((e) => e.designMemberId === 'p1');
    const beamStart = beamEls[0].samples.M.G[0];
    const colTop = colEls.at(-1)!.samples.M.G.at(-1)!;
    expect(Math.abs(beamStart)).toBeCloseTo(Math.abs(colTop), 6);
  });

  it('multistory: ΣRx(W) balances the signed story forces', () => {
    const p = FEM2D_TEMPLATES.multistory.defaults();
    const model = FEM2D_TEMPLATES.multistory.build(p);
    const r = solveFem2D(model);
    expect(r.ok).toBe(true);
    const total = p.windStoryForces.reduce((a, b) => a + b, 0);
    expect(sumReactions(r, 'W').Rx).toBeCloseTo(-total, 8);
  });

  it('gable: local-frame rafter wind resolves and balances globally', () => {
    const p = { ...FEM2D_TEMPLATES.gable.defaults(), windRafterPressure: 1.5 };
    const model = FEM2D_TEMPLATES.gable.build(p);
    const r = solveFem2D(model);
    expect(r.ok).toBe(true);
    // Resultant of w ⊥ onto rafter f1 (Δx=4, Δy=1.2): (w·Δy, −w·Δx).
    const react = sumReactions(r, 'W');
    expect(react.Rx).toBeCloseTo(-1.5 * 1.2, 8);
    expect(react.Ry).toBeCloseTo(+1.5 * 4, 8);
  });
});
