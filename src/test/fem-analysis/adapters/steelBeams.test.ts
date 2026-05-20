// FEM 1D — steelBeams adapter test suite

import { describe, expect, it } from 'vitest';
import { adaptSteelBar, deriveBeamType } from '../../../features/fem-analysis/adapters/steelBeams';
import { autoDecompose } from '../../../features/fem-analysis/autoDecompose';
import { solveAnalysisModel } from '../../../features/fem-analysis/femSolver';
import type {
  DesignBar,
  DesignModel,
  Node,
  SteelSelection,
} from '../../../features/fem-analysis/types';

const STEEL_IPE240: SteelSelection = {
  profileKey: 'steel_IPE240', steel: 'S275', beamType: 'ss',
  deflLimit: 300, elsCombo: 'characteristic', useCategory: 'B',
};

function node(id: string, x: number): Node { return { id, x, y: 0 }; }

function steelBar(id: string, i: string, j: string, overrides: Partial<DesignBar> = {}): DesignBar {
  return { id, i, j, material: 'steel', steelSelection: { ...STEEL_IPE240 }, internalHinges: { i: false, j: false }, ...overrides };
}

// ── beamType auto-derivation ───────────────────────────────────────────────

describe('steelBeams adapter — beamType auto-derivation', () => {
  it('Single SS bar (pinned + roller) → ss', () => {
    const bar = steelBar('b1', 'n1', 'n2');
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [],
    };
    expect(deriveBeamType(bar, model)).toBe('ss');
  });

  it('Cantilever (fixed + free) → cantilever', () => {
    const bar = steelBar('b1', 'n1', 'n2');
    const model: DesignModel = {
      presetCode: 'cantilever', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 3)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'fixed' }],
      loads: [],
    };
    expect(deriveBeamType(bar, model)).toBe('cantilever');
  });

  it('Interior bar of continuous chain → ff', () => {
    const b1 = steelBar('b1', 'n1', 'n2');
    const b2 = steelBar('b2', 'n2', 'n3');
    const b3 = steelBar('b3', 'n3', 'n4');
    const model: DesignModel = {
      presetCode: 'continuous', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 5), node('n3', 10), node('n4', 15)],
      bars: [b1, b2, b3],
      supports: [
        { node: 'n1', type: 'pinned' },
        { node: 'n2', type: 'roller' },
        { node: 'n3', type: 'roller' },
        { node: 'n4', type: 'roller' },
      ],
      loads: [],
    };
    expect(deriveBeamType(b2, model)).toBe('ff'); // both neighbours
    // End bars are fp (one continuous + one terminal)
    expect(deriveBeamType(b1, model)).toBe('fp');
    expect(deriveBeamType(b3, model)).toBe('fp');
  });

  it('Bar with internal hinge at one end → fp (hinge cuts continuity)', () => {
    const b1 = steelBar('b1', 'n1', 'n2', { internalHinges: { i: false, j: true } });
    const b2 = steelBar('b2', 'n2', 'n3'); // adjacent bar continuous on its own ends
    const model: DesignModel = {
      presetCode: 'custom', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 5), node('n3', 10)],
      bars: [b1, b2],
      supports: [{ node: 'n1', type: 'fixed' }, { node: 'n3', type: 'roller' }],
      loads: [],
    };
    // b1: i continuous (no neighbour but no hinge either; iSupport=fixed → "fp" pattern)
    // The hinge at j cuts continuity; jHasNeighbour=false because b1's own hinge releases it.
    // i has support=fixed but no neighbour, j has neighbour suppressed by hinge → fp.
    expect(deriveBeamType(b1, model)).toBe('fp');
  });
});

// ── Envelope + calcSteelBeam integration ───────────────────────────────────

describe('steelBeams adapter — SS UDL envelope + calcSteelBeam call', () => {
  const L = 6;
  const q = 25;
  const bar = steelBar('b1', 'n1', 'n2');
  const model: DesignModel = {
    presetCode: 'beam', combo: 'ELU', selfWeight: false,
    nodes: [node('n1', 0), node('n2', L)],
    bars: [bar],
    supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
    loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: q, dir: '-y' }],
  };
  const result = solveAnalysisModel(autoDecompose(model));
  const adapt = adaptSteelBar(bar, result.elements, model);

  it('M_Ed ≈ 1.35·q·L²/8', () => {
    const expected = 1.35 * (q * L * L) / 8;
    expect(adapt.envelope.M_Ed).toBeCloseTo(expected, 1);
  });

  it('V_Ed ≈ 1.35·q·L/2 (peak shear at supports)', () => {
    const expected = 1.35 * (q * L) / 2;
    expect(adapt.envelope.V_Ed).toBeCloseTo(expected, 1);
  });

  it('VEd_interaction is V at the location of M_max — ≈ 0 for SS UDL (V crosses 0 at midspan)', () => {
    // M_max at midspan, V=0 there. So VEd_interaction ≈ 0.
    expect(adapt.envelope.VEd_interaction).toBeLessThan(1);
  });

  it('Mser ≈ q·L²/8 (ELS-c characteristic)', () => {
    const expected = (q * L * L) / 8;
    expect(adapt.envelope.Mser).toBeCloseTo(expected, 1);
  });

  it('inputs.tipo and size parsed correctly from profileKey', () => {
    expect(adapt.inputs.tipo).toBe('IPE');
    expect(adapt.inputs.size).toBe(240);
  });

  it('inputs.L and Lcr in mm (FEM uses m, calcSteelBeam expects mm)', () => {
    expect(adapt.inputs.L).toBe(L * 1000);
    expect(adapt.inputs.Lcr).toBe(L * 1000); // default = bar length
  });

  it('loadgen stubs (gk=0, qk=0, bTrib=1) — adapter bypasses loadgen', () => {
    expect(adapt.inputs.gk).toBe(0);
    expect(adapt.inputs.qk).toBe(0);
    expect(adapt.inputs.bTrib).toBe(1);
  });

  it('calcSteelBeam returns valid result with bending utilization > 0', () => {
    expect(adapt.result.valid).toBe(true);
    const bendingCheck = adapt.result.checks.find((c) => c.id === 'bending');
    expect(bendingCheck).toBeDefined();
    expect(bendingCheck!.utilization).toBeGreaterThan(0);
  });
});

describe('steelBeams adapter — cantilever point load', () => {
  it('Cantilever tip point load: M_Ed at fixed end, VEd_interaction = V there', () => {
    const L = 3;
    const P = 15;
    const bar = steelBar('b1', 'n1', 'n2');
    const model: DesignModel = {
      presetCode: 'cantilever', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'fixed' }],
      loads: [{ id: 'l1', kind: 'point-node', lc: 'G', node: 'n2', Py: -P }],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptSteelBar(bar, result.elements, model);
    expect(adapt.envelope.M_Ed).toBeCloseTo(1.35 * P * L, 1);
    // V is constant for tip-only point load → VEd_interaction = full V
    expect(adapt.envelope.V_Ed).toBeCloseTo(1.35 * P, 1);
    expect(adapt.envelope.VEd_interaction).toBeCloseTo(1.35 * P, 1);
  });
});

describe('steelBeams adapter — superposition (G + Q)', () => {
  it('M_Ed = 1.35·M_G + 1.5·M_var', () => {
    const L = 6;
    const bar = steelBar('b1', 'n1', 'n2');
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' },
        { id: 'l2', kind: 'udl', lc: 'Q', bar: 'b1', w: 15, dir: '-y' },
      ],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptSteelBar(bar, result.elements, model);
    // M_G_max = 10·36/8 = 45. M_Q_max = 15·36/8 = 67.5. M_Ed = 1.35·45 + 1.5·67.5 = 161.25
    const expected = 1.35 * 45 + 1.5 * 67.5;
    expect(adapt.envelope.M_Ed).toBeCloseTo(expected, 1);
    // Mser = ELS-característica (default elsCombo): 1.0·G + 1.0·Q = 45 + 67.5 = 112.5
    expect(adapt.envelope.Mser).toBeCloseTo(112.5, 1);
  });
});

// ── Lane R9 V1.1 — Multi-principal per-combination iteration tests ─────────

describe('steelBeams adapter — multi-principal ELU iteration (Codex catch #4)', () => {
  it('G + Q + W → ELU envelope picks worst of (Q-principal) vs (W-principal)', () => {
    const L = 6;
    const bar = steelBar('b1', 'n1', 'n2');
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G',                          bar: 'b1', w: 8, dir: '-y' },
        { id: 'q1', kind: 'udl', lc: 'Q', useCategory: 'B',        bar: 'b1', w: 5, dir: '-y' },
        { id: 'w1', kind: 'udl', lc: 'W',                          bar: 'b1', w: 3, dir: '-y' },
      ],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptSteelBar(bar, result.elements, model);
    // Per-combination M_max:
    //   ELU_Q_principal: 1.35·8 + 1.5·5 + 1.5·0.6·3 = 21.0 → M = 21.0·4.5 = 94.5
    //   ELU_W_principal: 1.35·8 + 1.5·3 + 1.5·0.7·5 = 20.55 → M = 20.55·4.5 = 92.475
    // Worst is Q-principal at 94.5 (the adapter envelope reports the governing combo).
    expect(adapt.envelope.M_Ed).toBeCloseTo(94.5, 0);
  });

  it('G + Q (no W/S) → only one ELU combo, behavior matches V1.0 lump-var', () => {
    const L = 6;
    const bar = steelBar('b1', 'n1', 'n2');
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G',                   bar: 'b1', w: 10, dir: '-y' },
        { id: 'q1', kind: 'udl', lc: 'Q', useCategory: 'B', bar: 'b1', w:  5, dir: '-y' },
      ],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptSteelBar(bar, result.elements, model);
    // Single combo: 1.35·10 + 1.5·5 = 21 → M = 94.5
    expect(adapt.envelope.M_Ed).toBeCloseTo(94.5, 0);
  });

  it('G-only model: ELU = 1.35·G; Mser = 1.0·G; per-check matches single-combo', () => {
    const L = 6;
    const bar = steelBar('b1', 'n1', 'n2');
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' },
      ],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptSteelBar(bar, result.elements, model);
    expect(adapt.envelope.M_Ed).toBeCloseTo(1.35 * 45, 1);   // 1.35 · 10·6²/8
    expect(adapt.envelope.Mser).toBeCloseTo(45, 1);          // 1.0 · 10·6²/8
    expect(adapt.result.valid).toBe(true);
  });

  it('elsCombo: quasi-permanent → Mser uses ψ2 (cat B → 0.3·Q)', () => {
    const L = 6;
    const sel: SteelSelection = { ...STEEL_IPE240, elsCombo: 'quasi-permanent' };
    const bar: DesignBar = {
      id: 'b1', i: 'n1', j: 'n2', material: 'steel',
      steelSelection: sel, internalHinges: { i: false, j: false },
    };
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G',                   bar: 'b1', w: 10, dir: '-y' },
        { id: 'q1', kind: 'udl', lc: 'Q', useCategory: 'B', bar: 'b1', w:  5, dir: '-y' },
      ],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptSteelBar(bar, result.elements, model);
    // ELS-cp: 1.0·G + 0.3·Q = 1.0·45 + 0.3·22.5 = 45 + 6.75 = 51.75
    expect(adapt.envelope.Mser).toBeCloseTo(51.75, 1);
  });

  it('Aggregated checks have unique check ids (no duplicates from multi-combo)', () => {
    const L = 6;
    const bar = steelBar('b1', 'n1', 'n2');
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G',                   bar: 'b1', w: 8, dir: '-y' },
        { id: 'q1', kind: 'udl', lc: 'Q', useCategory: 'B', bar: 'b1', w: 5, dir: '-y' },
        { id: 'w1', kind: 'udl', lc: 'W',                   bar: 'b1', w: 3, dir: '-y' },
      ],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptSteelBar(bar, result.elements, model);
    expect(adapt.result.valid).toBe(true);
    const ids = (adapt.result.checks ?? []).map((c) => c.id);
    const uniq = new Set(ids);
    expect(uniq.size).toBe(ids.length); // mergeWorstChecks must dedupe
  });
});

// ── Deflection — must come from the FEM solver, not the closed form ─────────

describe('steelBeams adapter — δmax uses real FEM displacement', () => {
  // Walk the FEM solver's per-LC samples the same way the canvas does and
  // return the peak |δ| across all ELS-characteristic combos (kN/m·m → m).
  function peakFemDeltaMm(elements: ReturnType<typeof solveAnalysisModel>['elements'], barId: string): number {
    let best = 0;
    for (const e of elements) {
      if (e.designBarId !== barId) continue;
      for (const lc of Object.keys(e.samples.w)) {
        for (const v of e.samples.w[lc]) {
          if (Math.abs(v) > best) best = Math.abs(v);
        }
      }
    }
    return best * 1000;
  }

  it('SS UDL: surfaces the FEM-sampled peak |δ|, not the closed-form δ = k·Mser·L²/(EI)', () => {
    const L = 6;
    const q = 25;
    const bar = steelBar('b1', 'n1', 'n2');
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: q, dir: '-y' }],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptSteelBar(bar, result.elements, model);
    const femDeltaMm = peakFemDeltaMm(result.elements, 'b1');

    expect(femDeltaMm).toBeGreaterThan(0);
    expect(adapt.result.delta_max).toBeCloseTo(femDeltaMm, 4);
  });

  it('2-span continuous: result.delta_max << what an isolated ff bar predicts (the old bug)', () => {
    // Continuous-beam δ is far smaller than the closed-form for an isolated
    // ff bar fed the same Mser. Before the fix the adapter showed the
    // closed-form, which was off by 2-3× — that's what the user reported.
    const L = 5;
    const q = 30;
    const b1 = steelBar('b1', 'n1', 'n2');
    const b2 = steelBar('b2', 'n2', 'n3');
    const model: DesignModel = {
      presetCode: 'continuous', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', L), node('n3', 2 * L)],
      bars: [b1, b2],
      supports: [
        { node: 'n1', type: 'pinned' },
        { node: 'n2', type: 'roller' },
        { node: 'n3', type: 'roller' },
      ],
      loads: [
        { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: q, dir: '-y' },
        { id: 'l2', kind: 'udl', lc: 'G', bar: 'b2', w: q, dir: '-y' },
      ],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptSteelBar(b1, result.elements, model);
    const femDeltaMm = peakFemDeltaMm(result.elements, 'b1');

    expect(adapt.result.delta_max).toBeCloseTo(femDeltaMm, 4);

    // The deflection check row must show the same number we surfaced as delta_max.
    const deflRow = adapt.result.checks.find((c) => c.id === 'deflection');
    expect(deflRow).toBeDefined();
    expect(deflRow!.value).toBe(`${adapt.result.delta_max.toFixed(1)} mm`);
    expect(deflRow!.utilization).toBeCloseTo(
      adapt.result.delta_max / adapt.result.delta_adm,
      4,
    );
  });
});
