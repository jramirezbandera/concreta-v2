// FEM 2D — autoDecompose test suite
//
// Validates that DesignModel → AnalysisModel decomposition produces:
// - Correct element count per scenario
// - Correct element lengths
// - Correct end-condition flags (rotZ_i, rotZ_j) propagation from internalHinges
// - Correct q per element per load case (UDL coverage + self-weight)
// - Correct nodal point loads (point-on-bar → inserted analysis node)
// - Correct BCs from supports
// - SI units for EI/EA (E [kN/m²] = E[MPa]×10³, I [m⁴] = I[cm⁴]×10⁻⁸)

import { describe, expect, it } from 'vitest';
import { autoDecompose } from '../../features/fem-analysis/autoDecompose';
import type {
  DesignBar,
  DesignModel,
  Node,
  RcSection,
  SteelSelection,
} from '../../features/fem-analysis/types';

// ── Fixture helpers ─────────────────────────────────────────────────────────

const RC_30x50: RcSection = {
  b: 30,
  h: 50,
  fck: 25,
  fyk: 500,
  cover: 30,
  exposureClass: 'XC1',
  loadType: 'B',
};

const STEEL_IPE240: SteelSelection = {
  profileKey: 'steel_IPE240', // matches the existing MAT catalog key in presets.ts
  steel: 'S275',
  beamType: 'ss',
  deflLimit: 300,
  elsCombo: 'characteristic',
  useCategory: 'B',
};

function node(id: string, x: number): Node {
  return { id, x, y: 0 };
}

function rcBar(id: string, i: string, j: string, overrides: Partial<DesignBar> = {}): DesignBar {
  return {
    id,
    i,
    j,
    material: 'rc',
    rcSection: { ...RC_30x50 },
    internalHinges: { i: false, j: false },
    ...overrides,
  };
}

function steelBar(id: string, i: string, j: string, overrides: Partial<DesignBar> = {}): DesignBar {
  return {
    id,
    i,
    j,
    material: 'steel',
    steelSelection: { ...STEEL_IPE240 },
    internalHinges: { i: false, j: false },
    ...overrides,
  };
}

// ── Case 1: Single simple beam, no extras ──────────────────────────────────

describe('autoDecompose — case 1: simple beam, no extras', () => {
  const model: DesignModel = {
    presetCode: 'beam',
    combo: 'ELU',
    selfWeight: false,
    nodes: [node('n1', 0), node('n2', 6)],
    bars: [rcBar('b1', 'n1', 'n2')],
    supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
    loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 25, dir: '-y' }],
  };

  it('produces 1 analysis element', () => {
    const am = autoDecompose(model);
    expect(am.elements).toHaveLength(1);
  });

  it('element length matches bar length (6 m)', () => {
    const am = autoDecompose(model);
    expect(am.elements[0].length).toBeCloseTo(6, 6);
  });

  it('element back-references the design bar id', () => {
    const am = autoDecompose(model);
    expect(am.elements[0].designBarId).toBe('b1');
  });

  it('element end conditions are continuous (no hinges)', () => {
    const am = autoDecompose(model);
    expect(am.elements[0].rotZ_i).toBe('continuous');
    expect(am.elements[0].rotZ_j).toBe('continuous');
  });

  it('analysis nodes preserve the design node ids at endpoints', () => {
    const am = autoDecompose(model);
    expect(am.elements[0].i_node).toBe('n1');
    expect(am.elements[0].j_node).toBe('n2');
  });

  it('produces 1 G load case with q = -25 kN/m on the element (gravity)', () => {
    const am = autoDecompose(model);
    const gCase = am.loadCases.find((lc) => lc.lc === 'G');
    expect(gCase).toBeDefined();
    expect(gCase!.q).toHaveLength(1);
    expect(gCase!.q[0]).toBeCloseTo(-25, 6);
  });

  it('BCs: pinned (fixY only), roller (fixY only)', () => {
    const am = autoDecompose(model);
    const bcN1 = am.bcs.find((b) => b.node === 'n1');
    const bcN2 = am.bcs.find((b) => b.node === 'n2');
    expect(bcN1).toEqual({ node: 'n1', fixY: true, fixRot: false });
    expect(bcN2).toEqual({ node: 'n2', fixY: true, fixRot: false });
  });
});

// ── Case 2: Continuous beam 3 vanos UDL ────────────────────────────────────

describe('autoDecompose — case 2: continuous 3 vanos UDL', () => {
  const model: DesignModel = {
    presetCode: 'continuous',
    combo: 'ELU',
    selfWeight: false,
    nodes: [node('n1', 0), node('n2', 5), node('n3', 10), node('n4', 15)],
    bars: [
      rcBar('b1', 'n1', 'n2'),
      rcBar('b2', 'n2', 'n3'),
      rcBar('b3', 'n3', 'n4'),
    ],
    supports: [
      { node: 'n1', type: 'pinned' },
      { node: 'n2', type: 'roller' },
      { node: 'n3', type: 'roller' },
      { node: 'n4', type: 'roller' },
    ],
    loads: [
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 30, dir: '-y' },
      { id: 'l2', kind: 'udl', lc: 'G', bar: 'b2', w: 30, dir: '-y' },
      { id: 'l3', kind: 'udl', lc: 'G', bar: 'b3', w: 30, dir: '-y' },
    ],
  };

  it('produces 3 analysis elements (one per design bar)', () => {
    const am = autoDecompose(model);
    expect(am.elements).toHaveLength(3);
  });

  it('all elements are 5 m long', () => {
    const am = autoDecompose(model);
    for (const e of am.elements) expect(e.length).toBeCloseTo(5, 6);
  });

  it('all elements rotZ continuous (no hinges)', () => {
    const am = autoDecompose(model);
    for (const e of am.elements) {
      expect(e.rotZ_i).toBe('continuous');
      expect(e.rotZ_j).toBe('continuous');
    }
  });

  it('G load case has q=-30 on each of the 3 elements', () => {
    const am = autoDecompose(model);
    const gCase = am.loadCases.find((lc) => lc.lc === 'G')!;
    expect(gCase.q).toHaveLength(3);
    for (const q of gCase.q) expect(q).toBeCloseTo(-30, 6);
  });
});

// ── Case 3: Single bar with point-on-bar load at pos=0.5 ───────────────────

describe('autoDecompose — case 3: single bar with point-bar load at midspan', () => {
  const model: DesignModel = {
    presetCode: 'beam',
    combo: 'ELU',
    selfWeight: false,
    nodes: [node('n1', 0), node('n2', 6)],
    bars: [rcBar('b1', 'n1', 'n2')],
    supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
    loads: [
      { id: 'l1', kind: 'point-bar', lc: 'Q', bar: 'b1', pos: 0.5, P: 20, dir: '-y' },
    ],
  };

  it('point load splits the bar → 2 analysis elements', () => {
    const am = autoDecompose(model);
    expect(am.elements).toHaveLength(2);
  });

  it('split occurs exactly at midspan (3 m each)', () => {
    const am = autoDecompose(model);
    expect(am.elements[0].length).toBeCloseTo(3, 6);
    expect(am.elements[1].length).toBeCloseTo(3, 6);
  });

  it('var load case has 1 nodal point load on the inserted analysis node, P_y=-20', () => {
    const am = autoDecompose(model);
    const varCase = am.loadCases.find((lc) => lc.lc === 'Q' || lc.lc === 'W' || lc.lc === 'S' || lc.lc === 'E');
    expect(varCase).toBeDefined();
    expect(varCase!.pointLoads).toHaveLength(1);
    expect(varCase!.pointLoads[0].Py).toBeCloseTo(-20, 6);
  });

  it('inserted analysis node is shared between the 2 elements', () => {
    const am = autoDecompose(model);
    expect(am.elements[0].j_node).toBe(am.elements[1].i_node);
  });
});

// ── Case 4: Single bar with partial UDL [0.2, 0.7] ─────────────────────────

describe('autoDecompose — case 4: single bar with partial UDL', () => {
  const model: DesignModel = {
    presetCode: 'beam',
    combo: 'ELU',
    selfWeight: false,
    nodes: [node('n1', 0), node('n2', 10)],
    bars: [rcBar('b1', 'n1', 'n2')],
    supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
    loads: [
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 20, dir: '-y', from: 0.2, to: 0.7 },
    ],
  };

  it('partial UDL splits the bar at from + to → 3 analysis elements', () => {
    const am = autoDecompose(model);
    expect(am.elements).toHaveLength(3);
  });

  it('element lengths are 2, 5, 3 m (from x=0,2,7,10)', () => {
    const am = autoDecompose(model);
    expect(am.elements[0].length).toBeCloseTo(2, 6);
    expect(am.elements[1].length).toBeCloseTo(5, 6);
    expect(am.elements[2].length).toBeCloseTo(3, 6);
  });

  it('only the middle element carries q=-20; ends carry q=0', () => {
    const am = autoDecompose(model);
    const gCase = am.loadCases.find((lc) => lc.lc === 'G')!;
    expect(gCase.q[0]).toBeCloseTo(0, 6);
    expect(gCase.q[1]).toBeCloseTo(-20, 6);
    expect(gCase.q[2]).toBeCloseTo(0, 6);
  });
});

// ── Case 5: Cantilever with UDL + point at tip ─────────────────────────────

describe('autoDecompose — case 5: cantilever with UDL + tip point', () => {
  const model: DesignModel = {
    presetCode: 'cantilever',
    combo: 'ELU',
    selfWeight: false,
    nodes: [node('n1', 0), node('n2', 3)],
    bars: [steelBar('b1', 'n1', 'n2', { steelSelection: { ...STEEL_IPE240, beamType: 'cantilever' } })],
    supports: [{ node: 'n1', type: 'fixed' }],
    loads: [
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 5, dir: '-y' },
      // V1.1 convention: Py>0 = downward (gravity-positive engineering).
      { id: 'l2', kind: 'point-node', lc: 'Q', node: 'n2', Py: 15 },
    ],
  };

  it('produces 1 element (point load is ON the existing node n2, no split)', () => {
    const am = autoDecompose(model);
    expect(am.elements).toHaveLength(1);
  });

  it('fixed support BC has fixY + fixRot', () => {
    const am = autoDecompose(model);
    const bcN1 = am.bcs.find((b) => b.node === 'n1');
    expect(bcN1).toEqual({ node: 'n1', fixY: true, fixRot: true });
  });

  it('n2 has no BC (free end)', () => {
    const am = autoDecompose(model);
    const bcN2 = am.bcs.find((b) => b.node === 'n2');
    expect(bcN2).toBeUndefined();
  });

  it('var case has nodal point load Py=-15 on n2', () => {
    const am = autoDecompose(model);
    const varCase = am.loadCases.find((lc) => lc.pointLoads.some((p) => p.node === 'n2'));
    expect(varCase).toBeDefined();
    const pl = varCase!.pointLoads.find((p) => p.node === 'n2')!;
    expect(pl.Py).toBeCloseTo(-15, 6);
  });
});

// ── Case 6: Bar with hinge at j-end (Gerber-style) ─────────────────────────

describe('autoDecompose — case 6: hinge at j-end of bar', () => {
  const model: DesignModel = {
    presetCode: 'custom',
    combo: 'ELU',
    selfWeight: false,
    nodes: [node('n1', 0), node('n2', 5), node('n3', 10)],
    bars: [
      rcBar('b1', 'n1', 'n2', { internalHinges: { i: false, j: true } }), // hinge at j (n2)
      rcBar('b2', 'n2', 'n3'), // continuous on its own ends
    ],
    supports: [
      { node: 'n1', type: 'fixed' },
      { node: 'n3', type: 'roller' },
    ],
    loads: [
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' },
      { id: 'l2', kind: 'udl', lc: 'G', bar: 'b2', w: 10, dir: '-y' },
    ],
  };

  it('produces 2 elements (one per design bar)', () => {
    const am = autoDecompose(model);
    expect(am.elements).toHaveLength(2);
  });

  it('element 1 has rotZ_j = released (hinge at j-end)', () => {
    const am = autoDecompose(model);
    const e1 = am.elements.find((e) => e.designBarId === 'b1')!;
    expect(e1.rotZ_i).toBe('continuous');
    expect(e1.rotZ_j).toBe('released');
  });

  it('element 2 has both ends continuous (no hinge on b2)', () => {
    const am = autoDecompose(model);
    const e2 = am.elements.find((e) => e.designBarId === 'b2')!;
    expect(e2.rotZ_i).toBe('continuous');
    expect(e2.rotZ_j).toBe('continuous');
  });
});

// ── Case 7: User-inserted mid-bar node (1 design bar → 2 elements) ─────────

describe('autoDecompose — case 7: user-inserted mid-bar node', () => {
  const model: DesignModel = {
    presetCode: 'custom',
    combo: 'ELU',
    selfWeight: false,
    nodes: [node('n1', 0), node('mid', 2.5), node('n2', 6)],
    bars: [rcBar('b1', 'n1', 'n2')], // bar still spans n1-n2 in design model
    supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
    loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' }],
  };

  it('1 design bar with mid-bar node → 2 analysis elements', () => {
    const am = autoDecompose(model);
    expect(am.elements).toHaveLength(2);
  });

  it('both elements share designBarId = b1', () => {
    const am = autoDecompose(model);
    expect(am.elements[0].designBarId).toBe('b1');
    expect(am.elements[1].designBarId).toBe('b1');
  });

  it('split lengths are 2.5 and 3.5 m', () => {
    const am = autoDecompose(model);
    const lens = am.elements.map((e) => e.length).sort((a, b) => a - b);
    expect(lens[0]).toBeCloseTo(2.5, 6);
    expect(lens[1]).toBeCloseTo(3.5, 6);
  });

  it('UDL distributes to both sub-elements', () => {
    const am = autoDecompose(model);
    const gCase = am.loadCases.find((lc) => lc.lc === 'G')!;
    expect(gCase.q).toHaveLength(2);
    expect(gCase.q[0]).toBeCloseTo(-10, 6);
    expect(gCase.q[1]).toBeCloseTo(-10, 6);
  });

  it('all rotation conditions continuous (mid-bar node, no hinge)', () => {
    const am = autoDecompose(model);
    for (const e of am.elements) {
      expect(e.rotZ_i).toBe('continuous');
      expect(e.rotZ_j).toBe('continuous');
    }
  });
});

// ── Case 8: Self-weight ON ─────────────────────────────────────────────────

describe('autoDecompose — case 8: self-weight ON', () => {
  it('HA 30×50 with selfWeight=true, no other loads → q = -3.75 kN/m on G case', () => {
    const model: DesignModel = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: true,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [],
    };
    const am = autoDecompose(model);
    const gCase = am.loadCases.find((lc) => lc.lc === 'G')!;
    expect(gCase.q[0]).toBeCloseTo(-3.75, 4);
  });

  it('selfWeight OFF + no loads → no G case at all (or G case with q=0)', () => {
    const model: DesignModel = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [],
    };
    const am = autoDecompose(model);
    const gCase = am.loadCases.find((lc) => lc.lc === 'G');
    if (gCase) {
      expect(gCase.q[0]).toBeCloseTo(0, 6);
    }
  });

  it('HA UDL 30 + selfWeight ON → G case q = -33.75 (UDL + sw)', () => {
    const model: DesignModel = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: true,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 30, dir: '-y' }],
    };
    const am = autoDecompose(model);
    const gCase = am.loadCases.find((lc) => lc.lc === 'G')!;
    expect(gCase.q[0]).toBeCloseTo(-33.75, 4);
  });

  it('Steel IPE 240 with selfWeight=true → q ≈ -0.31 kN/m', () => {
    const model: DesignModel = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: true,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [steelBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [],
    };
    const am = autoDecompose(model);
    const gCase = am.loadCases.find((lc) => lc.lc === 'G')!;
    // 78.5 kN/m³ × 39.1 cm² × 1e-4 m²/cm² = 0.30694 kN/m
    expect(gCase.q[0]).toBeCloseTo(-0.307, 2);
  });
});

// ── Case 9: EI/EA SI conversion ────────────────────────────────────────────

describe('autoDecompose — case 9: EI/EA SI conversion', () => {
  it('Steel IPE 240: E=210000 MPa, I=3892 cm⁴ → EI ≈ 8173 kN·m²', () => {
    const model: DesignModel = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [steelBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [],
    };
    const am = autoDecompose(model);
    // EI = 210000 [MPa] * 1e3 [kN/m² per MPa] * 3892 [cm⁴] * 1e-8 [m⁴ per cm⁴]
    //    = 210000 * 1000 * 3892 * 1e-8 = 8173.2 kN·m²
    expect(am.elements[0].EI).toBeCloseTo(8173.2, 0);
    // EA = 210000 [MPa] * 1e3 [kN/m² per MPa] * 39.1 [cm²] * 1e-4 [m² per cm²]
    //    = 210000 * 1000 * 39.1 * 1e-4 = 821100 kN
    expect(am.elements[0].EA).toBeCloseTo(821100, 0);
  });

  it('HA 30×50 (E≈27286 MPa from 8500·∛(fck+8) for fck=25, I=312500 cm⁴) → EI ≈ 85268 kN·m²', () => {
    const model: DesignModel = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('n2', 5)],
      bars: [rcBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [],
    };
    const am = autoDecompose(model);
    // E = 8500 * cbrt(25+8) = 8500 * 3.2075 = 27263 MPa (rounding varies)
    // EI = ~27263 * 1e3 * 312500 * 1e-8 = ~85197 kN·m²
    expect(am.elements[0].EI).toBeCloseTo(85197, -2); // tolerance 100 kN·m² (E rounding)
    // EA = E * b*h * 1e-4 = ~27263 * 1e3 * 30*50 * 1e-4 = ~4089450 kN
    expect(am.elements[0].EA).toBeCloseTo(4089450, -3);
  });
});
