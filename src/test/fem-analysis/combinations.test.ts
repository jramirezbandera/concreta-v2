// FEM 2D — combinations.ts unit tests
//
// Validates CTE DB-SE Tabla 4.2 combination construction:
//   - Multi-principal ELU iterates each variable as dominant
//   - ELS-frec uses ψ1 for principal, ψ2 for simultaneous
//   - ELS-cp is a single combination (no principal)
//   - ψ values match Tabla 4.2 literally for known categories
//   - Q loads without useCategory fall back to 'B'

import { describe, expect, it } from 'vitest';
import {
  buildCombinations,
  countQLoadsWithoutCategory,
  getPsi,
} from '../../features/fem-analysis/combinations';
import type { Load } from '../../features/fem-analysis/types';

function udl(id: string, lc: Load['lc'], w: number, useCategory?: 'A1'|'A2'|'B'|'C1'|'C2'|'C3'|'D1'|'E1'|'G1'|'custom'): Load {
  return { id, kind: 'udl', lc, useCategory, bar: 'b1', w, dir: '-y' } as Load;
}

describe('combinations — getPsi', () => {
  it('Q load with category B: ψ1=0.5, ψ2=0.3 (Tabla 4.2)', () => {
    const psi = getPsi(udl('l1', 'Q', 5, 'B'));
    expect(psi.psi0).toBeCloseTo(0.7);
    expect(psi.psi1).toBeCloseTo(0.5);
    expect(psi.psi2).toBeCloseTo(0.3);
  });

  it('Q load with category C3 (sin obstáculos): ψ1=0.7, ψ2=0.6', () => {
    const psi = getPsi(udl('l1', 'Q', 5, 'C3'));
    expect(psi.psi1).toBeCloseTo(0.7);
    expect(psi.psi2).toBeCloseTo(0.6);
  });

  it('Q load with category E1 (almacén): ψ2=0.8', () => {
    expect(getPsi(udl('l1', 'Q', 5, 'E1')).psi2).toBeCloseTo(0.8);
  });

  it('Q load without useCategory falls back to B (default)', () => {
    const psi = getPsi(udl('l1', 'Q', 5));
    expect(psi.psi2).toBeCloseTo(0.3);
  });

  it('Q load fallback overridable', () => {
    const psi = getPsi(udl('l1', 'Q', 5), 'C3');
    expect(psi.psi2).toBeCloseTo(0.6);
  });

  it('W load: ψ0=0.6, ψ1=0.5, ψ2=0', () => {
    const psi = getPsi(udl('l1', 'W', 5));
    expect(psi.psi0).toBeCloseTo(0.6);
    expect(psi.psi1).toBeCloseTo(0.5);
    expect(psi.psi2).toBe(0);
  });

  it('S load <1000m: ψ0=0.5, ψ1=0.2, ψ2=0', () => {
    const psi = getPsi(udl('l1', 'S', 5));
    expect(psi.psi0).toBeCloseTo(0.5);
    expect(psi.psi2).toBe(0);
  });
});

describe('combinations — buildCombinations', () => {
  it('Empty loads → ELU has 1 combo (G_only) with empty factors, ELS likewise', () => {
    const c = buildCombinations([]);
    expect(c.ELU).toHaveLength(1);
    expect(c.ELU[0].name).toBe('ELU_G_only');
    expect(c.ELU[0].factors).toEqual({});
    expect(c.ELS_frec).toHaveLength(1);
    expect(c.ELS_cp.factors).toEqual({});
  });

  it('Only G load → ELU = 1.35·G (single combo)', () => {
    const loads: Load[] = [udl('g1', 'G', 5)];
    const c = buildCombinations(loads);
    expect(c.ELU).toHaveLength(1);
    expect(c.ELU[0].factors['g1']).toBeCloseTo(1.35);
    expect(c.ELS_frec[0].factors['g1']).toBe(1);
    expect(c.ELS_cp.factors['g1']).toBe(1);
  });

  it('G + 1 Q (cat B) → ELU = 1.35·G + 1.5·Q (single combo, Q is principal)', () => {
    const loads: Load[] = [udl('g1', 'G', 5), udl('q1', 'Q', 3, 'B')];
    const c = buildCombinations(loads);
    expect(c.ELU).toHaveLength(1);
    expect(c.ELU[0].factors['g1']).toBeCloseTo(1.35);
    expect(c.ELU[0].factors['q1']).toBeCloseTo(1.5);

    expect(c.ELS_frec).toHaveLength(1);
    expect(c.ELS_frec[0].factors['g1']).toBe(1);
    expect(c.ELS_frec[0].factors['q1']).toBeCloseTo(0.5); // ψ1 for B

    expect(c.ELS_cp.factors['g1']).toBe(1);
    expect(c.ELS_cp.factors['q1']).toBeCloseTo(0.3); // ψ2 for B
  });

  it('G + Q (B) + W → 2 ELU combos: each variable as principal', () => {
    const loads: Load[] = [
      udl('g1', 'G', 5),
      udl('q1', 'Q', 3, 'B'),
      udl('w1', 'W', 2),
    ];
    const c = buildCombinations(loads);
    expect(c.ELU).toHaveLength(2);

    const eluQ = c.ELU.find((co) => co.name === 'ELU_q1_principal')!;
    expect(eluQ.factors['g1']).toBeCloseTo(1.35);
    expect(eluQ.factors['q1']).toBeCloseTo(1.5);          // principal
    expect(eluQ.factors['w1']).toBeCloseTo(1.5 * 0.6);    // sim · ψ0(W)=0.6

    const eluW = c.ELU.find((co) => co.name === 'ELU_w1_principal')!;
    expect(eluW.factors['g1']).toBeCloseTo(1.35);
    expect(eluW.factors['w1']).toBeCloseTo(1.5);          // principal
    expect(eluW.factors['q1']).toBeCloseTo(1.5 * 0.7);    // sim · ψ0(Q,B)=0.7
  });

  it('G + Q (B) + W → ELS-cp single combo with ψ2 each (W ψ2=0)', () => {
    const loads: Load[] = [
      udl('g1', 'G', 5),
      udl('q1', 'Q', 3, 'B'),
      udl('w1', 'W', 2),
    ];
    const c = buildCombinations(loads);
    expect(c.ELS_cp.factors['g1']).toBe(1);
    expect(c.ELS_cp.factors['q1']).toBeCloseTo(0.3);
    expect(c.ELS_cp.factors['w1']).toBe(0); // viento ψ2=0
  });

  it('Q without useCategory → falls back to B (ψ2=0.3) silently', () => {
    const loads: Load[] = [udl('g1', 'G', 5), udl('q1', 'Q', 3) /* no useCategory */];
    const c = buildCombinations(loads);
    expect(c.ELS_cp.factors['q1']).toBeCloseTo(0.3);
  });

  it('Custom fallback applied when Q has no category', () => {
    const loads: Load[] = [udl('g1', 'G', 5), udl('q1', 'Q', 3)];
    const c = buildCombinations(loads, { fallbackUseCategory: 'C3' });
    // C3 → ψ2=0.6
    expect(c.ELS_cp.factors['q1']).toBeCloseTo(0.6);
  });
});

describe('combinations — countQLoadsWithoutCategory', () => {
  it('returns 0 when all Q loads have useCategory', () => {
    const loads: Load[] = [udl('q1', 'Q', 3, 'B'), udl('q2', 'Q', 4, 'C1')];
    expect(countQLoadsWithoutCategory(loads)).toBe(0);
  });

  it('counts only Q loads missing useCategory (not G/W/S/E)', () => {
    const loads: Load[] = [
      udl('g1', 'G', 5),     // not counted
      udl('q1', 'Q', 3),     // counted
      udl('q2', 'Q', 4, 'B'),// not counted
      udl('w1', 'W', 2),     // not counted
    ];
    expect(countQLoadsWithoutCategory(loads)).toBe(1);
  });
});
