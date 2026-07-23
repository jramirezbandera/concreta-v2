// frame-core — buildLcCombinations unit tests
//
// buildLcCombinations produce el juego CTE Tabla 4.2 a granularidad de LC
// (no por carga: eso es buildCombinations, en combinations.test.ts). Hasta ahora
// solo tenía cobertura indirecta (checks / solveDesignModel). Estos tests fijan
// su contrato directo y, sobre todo, el nuevo `ELU_principals` / `ELS_c_principals`
// que el selector de combinaciones del FEM 2D usa para nombrar cada `elu:<LC>`.

import { describe, expect, it } from 'vitest';
import {
  buildLcCombinations,
  type PrincipalLc,
} from '../../lib/frame-core/lcCombinations';
import type { CaseTaggedLoad, LoadCase, UseCategoryCode } from '../../lib/frame-core/types';

function load(id: string, lc: LoadCase, useCategory?: UseCategoryCode): CaseTaggedLoad {
  return { id, lc, useCategory };
}

// Invariante de alineación que el consumidor da por hecho: cada principal apunta
// a la LC que lleva el factor dominante de SU combo (γ=1.5 en ELU, 1 en ELS_c).
function assertAligned(
  combos: ReadonlyArray<Partial<Record<LoadCase, number>>>,
  principals: ReadonlyArray<PrincipalLc | null>,
  dominant: number,
): void {
  expect(principals).toHaveLength(combos.length);
  combos.forEach((combo, i) => {
    const p = principals[i];
    if (p === null) return; // combo solo-G: sin principal
    expect(combo[p], `combo ${i} principal ${p}`).toBeCloseTo(dominant);
  });
}

describe('buildLcCombinations — principals', () => {
  it('sin variables (loads vacío) → un combo solo-G con principal null', () => {
    const c = buildLcCombinations([]);
    expect(c.ELU).toHaveLength(1);
    expect(c.ELU_principals).toEqual([null]);
    expect(c.ELS_c).toHaveLength(1);
    expect(c.ELS_c_principals).toEqual([null]);
  });

  it('solo G → sigue siendo un combo solo-G, principal null', () => {
    const c = buildLcCombinations([load('g1', 'G')]);
    expect(c.ELU_principals).toEqual([null]);
    expect(c.ELS_c_principals).toEqual([null]);
  });

  it('G + Q → un combo, principal Q, factor dominante 1.5 (ELU) / 1 (ELS_c)', () => {
    const c = buildLcCombinations([load('g1', 'G'), load('q1', 'Q', 'B')]);
    expect(c.ELU_principals).toEqual(['Q']);
    expect(c.ELU[0].Q).toBeCloseTo(1.5);
    expect(c.ELS_c_principals).toEqual(['Q']);
    expect(c.ELS_c[0].Q).toBeCloseTo(1);
  });

  it('G + Q + W → dos combos, principals en orden de aparición [Q, W]', () => {
    const c = buildLcCombinations([load('g1', 'G'), load('q1', 'Q', 'B'), load('w1', 'W')]);
    expect(c.ELU_principals).toEqual(['Q', 'W']);
    assertAligned(c.ELU, c.ELU_principals, 1.5);
    assertAligned(c.ELS_c, c.ELS_c_principals, 1);
  });

  // El fixture que justifica la existencia del array: con Q de categoría E1
  // (almacén, ψ0=1.0), el combo con S como principal tiene TAMBIÉN Q a 1.5
  // (= 1.5·ψ0 = 1.5·1.0). "La LC con factor 1.5" es ambiguo; el principal no.
  it('E1 (ψ0=1.0): el combo S-principal tiene dos LC a 1.5 y aun así el principal es S', () => {
    const c = buildLcCombinations([load('q1', 'Q', 'E1'), load('s1', 'S')]);
    expect(c.ELU_principals).toEqual(['Q', 'S']);

    const iS = c.ELU_principals.indexOf('S');
    const comboS = c.ELU[iS];
    expect(comboS.S).toBeCloseTo(1.5); // principal
    expect(comboS.Q).toBeCloseTo(1.5); // simultánea, pero 1.5·ψ0(E1)=1.5·1.0 → también 1.5
    // La desambiguación NO viene del factor: viene del array de principals.
    expect(c.ELU_principals[iS]).toBe('S');

    assertAligned(c.ELU, c.ELU_principals, 1.5);
  });

  it('ELU y ELS_c siempre tienen tantos principals como combos', () => {
    const c = buildLcCombinations([
      load('g1', 'G'),
      load('q1', 'Q', 'C1'),
      load('w1', 'W'),
      load('s1', 'S'),
    ]);
    expect(c.ELU_principals).toHaveLength(c.ELU.length);
    expect(c.ELS_c_principals).toHaveLength(c.ELS_c.length);
    expect(c.ELU_principals).toEqual(['Q', 'W', 'S']);
    assertAligned(c.ELU, c.ELU_principals, 1.5);
    assertAligned(c.ELS_c, c.ELS_c_principals, 1);
  });
});
