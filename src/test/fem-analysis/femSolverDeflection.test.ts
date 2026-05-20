// Sanity tests for the per-bar deflection envelope. femSolver tests cover
// M / V / reactions but NOT w(x), so an absurd δ could slip through silently.
// This file pins "no banana-sized deflection on plausible inputs".
//
// Scenario: 7 continuous vanos of 5m, q=30 kN/m + selfweight, end-span is a
// steel IPE 240 (the rest RC). Real δ_max on b1 is ~10 mm; we assert < 1 m.

import { describe, it, expect } from 'vitest';
import { solveDesignModel } from '../../features/fem-analysis/solveDesignModel';
import type { DesignModel } from '../../features/fem-analysis/types';

function build7SpanMixedModel(): DesignModel {
  const m: DesignModel = {
    presetCode: 'continuous',
    combo: 'ELU',
    selfWeight: true,
    nodes: [
      { id: 'n1', x: 0, y: 0 },
      { id: 'n2', x: 5, y: 0 },
      { id: 'n3', x: 10, y: 0 },
      { id: 'n4', x: 15, y: 0 },
      { id: 'n5', x: 20, y: 0 },
      { id: 'n6', x: 25, y: 0 },
      { id: 'n7', x: 30, y: 0 },
      { id: 'n8', x: 35, y: 0 },
    ],
    bars: [],
    loads: [],
    supports: [{ node: 'n1', type: 'pinned' }],
  };
  for (let i = 0; i < 7; i++) {
    const id = 'b' + (i + 1);
    const isSteel = i === 0;
    m.bars.push({
      id,
      i: 'n' + (i + 1),
      j: 'n' + (i + 2),
      material: isSteel ? 'steel' : 'rc',
      rcSection: { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' },
      vano_armado: { tens_nBars: 4, tens_barDiam: 16, comp_nBars: 2, comp_barDiam: 12, stirrupDiam: 8, stirrupSpacing: 150, stirrupLegs: 2 },
      apoyo_armado: { tens_nBars: 3, tens_barDiam: 16, comp_nBars: 2, comp_barDiam: 12, stirrupDiam: 8, stirrupSpacing: 100, stirrupLegs: 2 },
      internalHinges: { i: false, j: false },
      ...(isSteel ? { steelSelection: { profileKey: 'steel_IPE240', steel: 'S275', beamType: 'ss', deflLimit: 300, elsCombo: 'characteristic', useCategory: 'B' } } : {}),
    });
    m.loads.push({ id: 'l' + (i + 1), kind: 'udl', lc: 'G', bar: id, w: 30, dir: '-y' });
  }
  for (let i = 2; i <= 8; i++) m.supports.push({ node: 'n' + i, type: 'roller' });
  return m;
}

describe('FEM regression: flecha sensata para vano mixto acero+HA', () => {
  it('b1 steel deflection en cualquier sample debe ser < 1 m (no debe explotar)', () => {
    const model = build7SpanMixedModel();
    const result = solveDesignModel(model);

    // Find b1's envelope deltas across combos.
    const b1 = result.perBar['b1'];
    expect(b1).toBeDefined();
    expect(b1.envelope).toBeDefined();

    const allDeltas: { combo: string; max: number }[] = [];
    const envelope = b1.envelope!;
    for (const combo of Object.keys(envelope) as Array<keyof typeof envelope>) {
      const env = envelope[combo];
      if (!env?.delta) continue;
      const peak = Math.max(...env.delta.map(Math.abs));
      allDeltas.push({ combo, max: peak });
    }

    // log for debugging — if the bug reproduces, this line surfaces the actual
    // garbage values (e.g. 45826.264 m) in test output.
    console.log('b1 peak |δ| per combo (m):', allDeltas);

    // Sanity: each combo's peak deflection on b1 should be physically plausible
    // (< 1 m). Real expected is ~10 mm = 0.01 m.
    for (const d of allDeltas) {
      expect(d.max, `combo ${d.combo} returned ${d.max} m on bar b1`).toBeLessThan(1);
    }
  });
});
