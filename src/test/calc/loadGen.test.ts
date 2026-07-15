import { describe, it, expect } from 'vitest';
import {
  deriveFromLoads, GAMMA_G, GAMMA_Q, getPsiRow,
  USE_CATEGORIES, VARIABLE_ACTIONS, categoryLabel, categoryQk,
} from '../../lib/calculations/loadGen';
import { steelBeamDefaults } from '../../data/defaults';

// Base inputs for all tests: ss, A1 residential, bTrib=3m, L=6000mm, gk=1.0, qk=2.0
// Hand-calc reference:
//   Gk_line = 1.0 × 3.0 = 3.0 kN/m
//   Qk_line = 2.0 × 3.0 = 6.0 kN/m
//   wEd     = 1.35×3.0 + 1.50×6.0 = 4.05 + 9.0 = 13.05 kN/m
//   wSer    = 3.0 + 6.0 = 9.0 kN/m
//   MEd     = 13.05 × 6.0²/8 = 13.05 × 4.5 = 58.725 kNm  (ss)
//   VEd     = 13.05 × 6.0/2  = 39.15 kN                   (ss)
//   VEd_interaction = 0                                     (ss midspan)
//   Mser    = 9.0 × 6.0²/8   = 9.0 × 4.5 = 40.5 kNm

const base = {
  ...steelBeamDefaults,
  gk: 1.0,
  qk: 2.0,
  bTrib: 3.0,
  L: 6000,
  useCategory: 'A1',
};

describe('deriveFromLoads — basic derivation (ss)', () => {
  it('A1 residential nominal values match hand-calc', () => {
    const r = deriveFromLoads(base);
    expect(r.Gk_line).toBeCloseTo(3.0, 6);
    expect(r.Qk_line).toBeCloseTo(6.0, 6);
    expect(r.wEd).toBeCloseTo(13.05, 6);
    expect(r.MEd).toBeCloseTo(58.725, 3);
    expect(r.VEd).toBeCloseTo(39.15, 3);
    expect(r.Mser).toBeCloseTo(40.5, 6);
  });

  it('ss: VEd_interaction = 0 (no M-V interaction at midspan)', () => {
    const r = deriveFromLoads(base);
    expect(r.VEd_interaction).toBe(0);
  });

  it('VEd cross-check: VEd × 2 × 1000 ≈ wEd × L (mm units)', () => {
    const r = deriveFromLoads(base);
    expect(r.VEd * 2 * 1000).toBeCloseTo(r.wEd * base.L, 3);
  });

  it('Mser < MEd when qk > 0', () => {
    const r = deriveFromLoads(base);
    expect(r.Mser).toBeLessThan(r.MEd);
  });

  it('doubling bTrib doubles Gk_line, Qk_line, MEd, VEd, Mser', () => {
    const r1 = deriveFromLoads(base);
    const r2 = deriveFromLoads({ ...base, bTrib: 6.0 });
    expect(r2.Gk_line).toBeCloseTo(r1.Gk_line * 2, 6);
    expect(r2.Qk_line).toBeCloseTo(r1.Qk_line * 2, 6);
    expect(r2.MEd).toBeCloseTo(r1.MEd * 2, 6);
    expect(r2.VEd).toBeCloseTo(r1.VEd * 2, 6);
    expect(r2.Mser).toBeCloseTo(r1.Mser * 2, 6);
  });

  it('doubling L (mm) quadruples MEd and Mser, doubles VEd', () => {
    const r1 = deriveFromLoads(base);
    const r2 = deriveFromLoads({ ...base, L: 12000 });
    expect(r2.MEd).toBeCloseTo(r1.MEd * 4, 6);
    expect(r2.Mser).toBeCloseTo(r1.Mser * 4, 6);
    expect(r2.VEd).toBeCloseTo(r1.VEd * 2, 6);
  });
});

describe('deriveFromLoads — beam type formulas', () => {
  // w = wEd for all, L_m = 6.0, wEd = 13.05 kN/m
  const w = 13.05;
  const L = 6.0;

  it('cantilever: MEd = wL²/2, VEd = wL, VEd_interaction = wL', () => {
    const r = deriveFromLoads({ ...base, beamType: 'cantilever' });
    expect(r.MEd).toBeCloseTo((w * L * L) / 2, 2);
    expect(r.VEd).toBeCloseTo(w * L, 2);
    expect(r.VEd_interaction).toBeCloseTo(w * L, 2);
  });

  it('fp: MEd = wL²/8, VEd = 5wL/8, VEd_interaction = 5wL/8', () => {
    const r = deriveFromLoads({ ...base, beamType: 'fp' });
    expect(r.MEd).toBeCloseTo((w * L * L) / 8, 2);
    expect(r.VEd).toBeCloseTo((5 * w * L) / 8, 2);
    expect(r.VEd_interaction).toBeCloseTo((5 * w * L) / 8, 2);
  });

  it('ff: MEd = wL²/12, VEd = wL/2, VEd_interaction = wL/2', () => {
    const r = deriveFromLoads({ ...base, beamType: 'ff' });
    expect(r.MEd).toBeCloseTo((w * L * L) / 12, 2);
    expect(r.VEd).toBeCloseTo((w * L) / 2, 2);
    expect(r.VEd_interaction).toBeCloseTo((w * L) / 2, 2);
  });

  it('cantilever MEd is largest (worst bending case)', () => {
    const ss   = deriveFromLoads({ ...base, beamType: 'ss'         });
    const cant = deriveFromLoads({ ...base, beamType: 'cantilever' });
    const fp   = deriveFromLoads({ ...base, beamType: 'fp'         });
    const ff   = deriveFromLoads({ ...base, beamType: 'ff'         });
    expect(cant.MEd).toBeGreaterThan(ss.MEd);
    expect(cant.MEd).toBeGreaterThan(fp.MEd);
    expect(cant.MEd).toBeGreaterThan(ff.MEd);
  });

  it('ff MEd < ss MEd (stiffer beam → lower peak moment)', () => {
    const ss = deriveFromLoads({ ...base, beamType: 'ss' });
    const ff = deriveFromLoads({ ...base, beamType: 'ff' });
    expect(ff.MEd).toBeLessThan(ss.MEd);
  });

  it('fp VEd > ss VEd (asymmetric reactions)', () => {
    const ss = deriveFromLoads({ ...base, beamType: 'ss' });
    const fp = deriveFromLoads({ ...base, beamType: 'fp' });
    expect(fp.VEd).toBeGreaterThan(ss.VEd);
  });
});

describe('deriveFromLoads — edge cases', () => {
  it('gk=0, qk=0 → all outputs = 0 (not NaN)', () => {
    const r = deriveFromLoads({ ...base, gk: 0, qk: 0 });
    expect(r.Gk_line).toBe(0);
    expect(r.Qk_line).toBe(0);
    expect(r.wEd).toBe(0);
    expect(r.MEd).toBe(0);
    expect(r.VEd).toBe(0);
    expect(r.Mser).toBe(0);
    expect(Number.isNaN(r.MEd)).toBe(false);
  });

  it('bTrib=0 → all outputs = 0 (not NaN, no division by bTrib)', () => {
    const r = deriveFromLoads({ ...base, bTrib: 0 });
    expect(r.Gk_line).toBe(0);
    expect(r.Qk_line).toBe(0);
    expect(r.MEd).toBe(0);
    expect(r.VEd).toBe(0);
    expect(r.Mser).toBe(0);
    expect(Number.isNaN(r.MEd)).toBe(false);
  });

  it('L=0 → MEd=0, VEd=0, Mser=0 (not NaN)', () => {
    const r = deriveFromLoads({ ...base, L: 0 });
    expect(r.MEd).toBe(0);
    expect(r.VEd).toBe(0);
    expect(r.Mser).toBe(0);
    expect(Number.isNaN(r.MEd)).toBe(false);
  });

  it('very short span (L=1000mm) → small MEd, valid result', () => {
    const r = deriveFromLoads({ ...base, L: 1000 });
    // MEd = 13.05 × 1.0²/8 = 1.63125 kNm
    expect(r.MEd).toBeCloseTo(1.63125, 3);
    expect(r.MEd).toBeGreaterThan(0);
  });

  it('γG=1.35 and γQ=1.50 match CTE DB-SE table 4.1', () => {
    expect(GAMMA_G).toBe(1.35);
    expect(GAMMA_Q).toBe(1.50);
  });
});

// ── Fix auditoría #74: ψ de categoría G (cubierta solo conservación) = 0 ─────
describe('Auditoría #74: G1 psi factors', () => {
  it('CTE DB-SE Tabla 4.2: categoría G → ψ1 = ψ2 = 0', () => {
    const qp = deriveFromLoads({ ...base, useCategory: 'G1', elsCombo: 'quasi-permanent' });
    // wSer cuasipermanente = Gk + 0·Qk = Gk_line
    expect(qp.psi).toBe(0);
    expect(qp.wSer).toBeCloseTo(qp.Gk_line, 6);
    const freq = deriveFromLoads({ ...base, useCategory: 'G1', elsCombo: 'frequent' });
    expect(freq.psi).toBe(0);
  });

  it('combinación característica sigue usando ψ=1', () => {
    const ch = deriveFromLoads({ ...base, useCategory: 'G1', elsCombo: 'characteristic' });
    expect(ch.psi).toBe(1.0);
  });
});

// ── Acción variable envolvente: nieve y viento tienen ψ propias (Tabla 4.2) ───
// El módulo solo admite UNA acción variable (qk = envolvente). Cuando la que
// gobierna no es una sobrecarga de uso, sus ψ NO son las de la Tabla 3.1: sin
// las filas nieve/viento, una envolvente de nieve heredaba las ψ genéricas de
// 'custom' (0.7/0.5/0.3) en vez de las suyas.
describe('VARIABLE_ACTIONS — acciones no ligadas al uso (nieve, viento)', () => {
  it('las opciones de vigas = categorías de uso + nieve/viento, con "Personalizada" al final', () => {
    const values = VARIABLE_ACTIONS.map((c) => c.value);
    expect(values).toEqual([
      'A1', 'A2', 'B', 'C1', 'C2', 'C3', 'D1', 'E1', 'G1',
      'snow', 'snow_high', 'wind', 'custom',
    ]);
    // nieve/viento no tienen qk de catálogo: el valor lo teclea el usuario
    for (const v of ['snow', 'snow_high', 'wind', 'custom']) {
      expect(categoryQk(v)).toBeNull();
    }
    expect(categoryQk('G1')).toBe(1.0);
    expect(categoryLabel('custom')).toBe('Personalizada');
    expect(categoryLabel('snow')).toMatch(/Nieve/);
  });

  it('NO contaminan USE_CATEGORIES (el FEM modela nieve/viento como hipótesis S y W)', () => {
    const useValues = USE_CATEGORIES.map((c) => c.value);
    expect(useValues).not.toContain('snow');
    expect(useValues).not.toContain('wind');
  });

  it('ψ de nieve h ≤ 1000 m (CTE DB-SE Tabla 4.2): ψ0=0.5, ψ1=0.2, ψ2=0', () => {
    expect(getPsiRow('snow')).toEqual({ psi0: 0.5, psi1: 0.2, psi2: 0.0 });
    // cuasi-permanente: la nieve no deja carga remanente → wSer = Gk
    const qp = deriveFromLoads({ ...base, useCategory: 'snow', elsCombo: 'quasi-permanent' });
    expect(qp.psi).toBe(0);
    expect(qp.wSer).toBeCloseTo(qp.Gk_line, 6);
    // frecuente: ψ1 = 0.2 (con 'custom' habría salido 0.5 — más carga, no la real)
    const freq = deriveFromLoads({ ...base, useCategory: 'snow', elsCombo: 'frequent' });
    expect(freq.psi).toBe(0.2);
    expect(freq.wSer).toBeCloseTo(freq.Gk_line + 0.2 * freq.Qk_line, 6);
  });

  it('ψ de nieve h > 1000 m y de viento (Tabla 4.2)', () => {
    expect(getPsiRow('snow_high')).toEqual({ psi0: 0.7, psi1: 0.5, psi2: 0.2 });
    expect(getPsiRow('wind')).toEqual({ psi0: 0.6, psi1: 0.5, psi2: 0.0 });
  });

  it('la ELU no depende de la acción: wEd = 1.35·Gk + 1.50·Qk en todas', () => {
    const uso  = deriveFromLoads({ ...base, useCategory: 'G1' });
    const snow = deriveFromLoads({ ...base, useCategory: 'snow' });
    expect(snow.wEd).toBeCloseTo(uso.wEd, 9);
  });
});
