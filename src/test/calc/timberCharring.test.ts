// βn, velocidad de carbonización nominal — EN 1995-1-2 Tabla 3.1.
//
// Hasta 2026-09-25 getBetaN devolvía 0,70 para TODA frondosa, que es el valor de una
// frondosa de ρk = 290 (no existe en la EN 338: la D18, la más ligera, tiene 475). La
// tabla da 0,55 para ρk ≥ 450 e interpola entre 290 y 450. El error era conservador
// (más carbonización) pero falso, y lo afirmaba un test. Este fichero fija la tabla
// entera por densidad, no por etiqueta.
import { describe, it, expect } from 'vitest';
import { TIMBER_GRADES, getBetaN, getTimberGrade, type TimberGrade } from '../../data/timberGrades';

const mk = (over: Partial<TimberGrade>): TimberGrade => ({ ...getTimberGrade('D30')!, ...over });

describe('βn — EN 1995-1-2 Tabla 3.1', () => {
  it('conífera aserrada ρk ≥ 290 → 0,80 (todas las C)', () => {
    for (const g of TIMBER_GRADES.filter((g) => g.type === 'sawn' && g.subtype === 'softwood')) {
      expect(getBetaN(g), g.id).toBeCloseTo(0.80, 6);
    }
  });

  it('laminada de conífera → 0,70 (todas las GL)', () => {
    for (const g of TIMBER_GRADES.filter((g) => g.type === 'glulam')) {
      expect(getBetaN(g), g.id).toBeCloseTo(0.70, 6);
    }
  });

  it('frondosa ρk ≥ 450 → 0,55 (todas las D de la EN 338, ρk 475–900)', () => {
    const D = TIMBER_GRADES.filter((g) => g.subtype === 'hardwood');
    expect(D.length).toBeGreaterThan(10);
    for (const g of D) {
      expect(g.rho_k, g.id).toBeGreaterThanOrEqual(450);
      expect(getBetaN(g), g.id).toBeCloseTo(0.55, 6);
    }
  });

  it('frondosa ρk = 290 → 0,70, y lineal entre 290 y 450 (370 → 0,625)', () => {
    expect(getBetaN(mk({ rho_k: 290 }))).toBeCloseTo(0.70, 6);
    expect(getBetaN(mk({ rho_k: 370 }))).toBeCloseTo(0.625, 6);
    expect(getBetaN(mk({ rho_k: 450 }))).toBeCloseTo(0.55, 6);
    // por debajo de 290 no se extrapola
    expect(getBetaN(mk({ rho_k: 200 }))).toBeCloseTo(0.70, 6);
  });

  it('frondosa laminada sigue la misma regla que la aserrada (misma fila de la tabla)', () => {
    expect(getBetaN(mk({ type: 'glulam', rho_k: 500 }))).toBeCloseTo(0.55, 6);
  });

  it('regresión: D40 = 0,55, NO 0,70', () => {
    expect(getBetaN(getTimberGrade('D40')!)).toBeCloseTo(0.55, 6);
  });
});
