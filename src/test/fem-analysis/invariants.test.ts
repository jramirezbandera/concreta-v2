// FEM 2D — invariants test suite
//
// Validates the model-validity guards that prevent the solver from running
// on degenerate input (zero-length elements, hinge-on-support, etc.).
// Driven by the Codex outside-voice review (eng-review 2026-04-28).

import { describe, expect, it } from 'vitest';
import {
  canEditBarLength,
  canInsertNode,
  canToggleHinge,
  validateModel,
  MIN_BAR_LENGTH_M,
  MIN_NODE_SEPARATION_M,
} from '../../features/fem-analysis/invariants';
import type { DesignBar, DesignModel } from '../../features/fem-analysis/types';

// ── Fixtures ────────────────────────────────────────────────────────────────

function emptyModel(): DesignModel {
  return {
    presetCode: 'custom',
    combo: 'ELU',
    selfWeight: false,
    nodes: [],
    bars: [],
    supports: [],
    loads: [],
  };
}

function bar(id: string, i: string, j: string, overrides: Partial<DesignBar> = {}): DesignBar {
  return {
    id,
    i,
    j,
    material: 'rc',
    rcSection: { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' },
    internalHinges: { i: false, j: false },
    ...overrides,
  };
}

function continuousBeam3vanos(): DesignModel {
  return {
    presetCode: 'continuous',
    combo: 'ELU',
    selfWeight: true,
    nodes: [
      { id: 'n1', x: 0, y: 0 },
      { id: 'n2', x: 5, y: 0 },
      { id: 'n3', x: 10, y: 0 },
      { id: 'n4', x: 15, y: 0 },
    ],
    bars: [bar('b1', 'n1', 'n2'), bar('b2', 'n2', 'n3'), bar('b3', 'n3', 'n4')],
    supports: [
      { node: 'n1', type: 'pinned' },
      { node: 'n2', type: 'roller' },
      { node: 'n3', type: 'roller' },
      { node: 'n4', type: 'roller' },
    ],
    loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 30, dir: '-y' }],
  };
}

// ── canInsertNode ────────────────────────────────────────────────────────────

describe('canInsertNode', () => {
  it('allows insertion at empty position', () => {
    const r = canInsertNode({ nodes: [{ id: 'n1', x: 0, y: 0 }] }, 5, 0);
    expect(r.ok).toBe(true);
  });

  it('rejects insertion within MIN_NODE_SEPARATION of an existing node', () => {
    const r = canInsertNode({ nodes: [{ id: 'n1', x: 5, y: 0 }] }, 5 + MIN_NODE_SEPARATION_M / 2, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/menos de/);
  });

  it('allows insertion just outside MIN_NODE_SEPARATION', () => {
    const r = canInsertNode({ nodes: [{ id: 'n1', x: 5, y: 0 }] }, 5 + MIN_NODE_SEPARATION_M * 2, 0);
    expect(r.ok).toBe(true);
  });

  it('handles empty model', () => {
    const r = canInsertNode({ nodes: [] }, 0, 0);
    expect(r.ok).toBe(true);
  });
});

// ── canToggleHinge ───────────────────────────────────────────────────────────

describe('canToggleHinge', () => {
  it('allows hinge toggle on node without support', () => {
    const r = canToggleHinge({ supports: [{ node: 'n1', type: 'pinned' }] }, 'n2');
    expect(r.ok).toBe(true);
  });

  it('rejects hinge toggle on supported node', () => {
    const r = canToggleHinge({ supports: [{ node: 'n2', type: 'fixed' }] }, 'n2');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/apoyo/);
  });

  it('allows hinge on empty supports list', () => {
    const r = canToggleHinge({ supports: [] }, 'n1');
    expect(r.ok).toBe(true);
  });
});

// ── canEditBarLength ─────────────────────────────────────────────────────────

describe('canEditBarLength', () => {
  it('accepts normal length 5m', () => {
    expect(canEditBarLength(5).ok).toBe(true);
  });

  it('rejects length below MIN_BAR_LENGTH_M', () => {
    const r = canEditBarLength(MIN_BAR_LENGTH_M / 2);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/luz mínima/);
  });

  it('rejects NaN', () => {
    expect(canEditBarLength(NaN).ok).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(canEditBarLength(Infinity).ok).toBe(false);
  });

  it('accepts exact MIN_BAR_LENGTH_M', () => {
    expect(canEditBarLength(MIN_BAR_LENGTH_M).ok).toBe(true);
  });
});

// ── validateModel — happy path ───────────────────────────────────────────────

describe('validateModel — happy path', () => {
  it('continuous 3 vanos with proper supports → ok', () => {
    const v = validateModel(continuousBeam3vanos());
    expect(v.ok).toBe(true);
    expect(v.errors.filter((e) => e.severity === 'fail')).toHaveLength(0);
  });

  it('empty model → warning only (no bars), ok = true', () => {
    const v = validateModel(emptyModel());
    expect(v.ok).toBe(true); // No bars = no failure, just warn
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'NO_BARS' }));
  });
});

// ── validateModel — stability errors (CRITICAL) ──────────────────────────────

describe('validateModel — stability', () => {
  it('rejects model with bars but no supports', () => {
    const m = continuousBeam3vanos();
    m.supports = [];
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'NO_SUPPORTS' }));
  });

  it('rejects floating bar (disconnected from supports)', () => {
    const m = continuousBeam3vanos();
    // Add a disconnected bar far away
    m.nodes.push({ id: 'far1', x: 100, y: 0 }, { id: 'far2', x: 105, y: 0 });
    m.bars.push(bar('floater', 'far1', 'far2'));
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(
      expect.objectContaining({ code: 'FLOATING_BARS', msg: expect.stringContaining('floater') }),
    );
  });

  it('warns when supports give < 3 reaction components', () => {
    const m = continuousBeam3vanos();
    m.supports = [{ node: 'n1', type: 'roller' }, { node: 'n2', type: 'roller' }];
    const v = validateModel(m);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'INSUFFICIENT_REACTIONS' }));
  });

  it('passes when pinned + roller gives exactly 3 reactions', () => {
    const m = continuousBeam3vanos();
    m.supports = [{ node: 'n1', type: 'pinned' }, { node: 'n4', type: 'roller' }];
    const v = validateModel(m);
    const insufficientErr = v.errors.find((e) => e.code === 'INSUFFICIENT_REACTIONS');
    expect(insufficientErr).toBeUndefined();
  });
});

// ── validateModel — geometry errors ──────────────────────────────────────────

describe('validateModel — geometry', () => {
  it('rejects duplicate nodes', () => {
    const m = continuousBeam3vanos();
    m.nodes.push({ id: 'dup', x: 0.0001, y: 0 }); // 0.1mm from n1
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_NODES' }));
  });

  it('rejects bar with i === j', () => {
    const m = continuousBeam3vanos();
    m.bars.push(bar('selfloop', 'n2', 'n2'));
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'BAR_SELF_LOOP' }));
  });

  it('rejects bar referencing missing node', () => {
    const m = continuousBeam3vanos();
    m.bars.push(bar('orphan', 'n1', 'nonexistent'));
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'BAR_NODE_MISSING' }));
  });

  it('rejects zero-length bar', () => {
    const m = emptyModel();
    m.nodes = [
      { id: 'n1', x: 0, y: 0 },
      { id: 'n2', x: 0.001, y: 0 },
    ];
    m.bars = [bar('tiny', 'n1', 'n2')];
    m.supports = [{ node: 'n1', type: 'fixed' }];
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'BAR_TOO_SHORT' }));
  });
});

// ── validateModel — hinge invariants ─────────────────────────────────────────

describe('validateModel — hinges', () => {
  it('rejects hinge on supported node', () => {
    const m = continuousBeam3vanos();
    // Add hinge at n2 which has a support (the production failure mode Codex flagged)
    m.bars[0] = bar('b1', 'n1', 'n2', { internalHinges: { i: false, j: true } });
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'HINGE_ON_SUPPORT' }));
  });

  it('rejects bar with both ends articulated (mecanismo)', () => {
    const m = continuousBeam3vanos();
    m.bars[1] = bar('b2', 'n2', 'n3', { internalHinges: { i: true, j: true } });
    // Also need to remove supports from n2/n3 so HINGE_ON_SUPPORT doesn't fire first
    m.supports = [{ node: 'n1', type: 'pinned' }, { node: 'n4', type: 'roller' }];
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'BIARTICULATED_BAR' }));
  });

  it('accepts hinge on intermediate unsupported node (Gerber)', () => {
    const m: DesignModel = {
      presetCode: 'custom',
      combo: 'ELU',
      selfWeight: false,
      nodes: [
        { id: 'n1', x: 0, y: 0 },
        { id: 'n2', x: 5, y: 0 }, // unsupported intermediate node
        { id: 'n3', x: 10, y: 0 },
      ],
      bars: [
        // Cantilever from n1 to n2 (right end articulated) + simply-supported n2-n3
        bar('b1', 'n1', 'n2', { internalHinges: { i: false, j: true } }),
        bar('b2', 'n2', 'n3', { internalHinges: { i: false, j: false } }),
      ],
      supports: [{ node: 'n1', type: 'fixed' }, { node: 'n3', type: 'roller' }],
      loads: [],
    };
    const v = validateModel(m);
    expect(v.ok).toBe(true);
  });
});

// ── validateModel — load targets ─────────────────────────────────────────────

describe('validateModel — load targets', () => {
  it('rejects load on missing bar', () => {
    const m = continuousBeam3vanos();
    m.loads.push({ id: 'lx', kind: 'udl', lc: 'Q', bar: 'phantom', w: 10, dir: '-y' });
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'LOAD_TARGET_MISSING' }));
  });

  it('rejects point-bar load with pos > 1', () => {
    const m = continuousBeam3vanos();
    m.loads.push({ id: 'lx', kind: 'point-bar', lc: 'Q', bar: 'b1', pos: 1.5, P: 10, dir: '-y' });
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'LOAD_POS_OUT_OF_RANGE' }));
  });

  it('rejects partial UDL with from >= to', () => {
    const m = continuousBeam3vanos();
    m.loads.push({ id: 'lx', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y', from: 0.7, to: 0.3 });
    const v = validateModel(m);
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'LOAD_PARTIAL_RANGE_INVALID' }));
  });

  it('accepts valid partial UDL', () => {
    const m = continuousBeam3vanos();
    m.loads.push({ id: 'lx', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y', from: 0.2, to: 0.7 });
    const v = validateModel(m);
    const partialErr = v.errors.find((e) => e.code === 'LOAD_PARTIAL_RANGE_INVALID');
    expect(partialErr).toBeUndefined();
  });
});
