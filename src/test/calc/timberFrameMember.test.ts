// timberFrameMember — bloque de resistencia EC5 por esfuerzos (FEM 2D).
// Cada aserción numérica lleva su derivación a mano independiente, y la
// flexocompresión se contrasta ADEMÁS contra calcTimberColumn (mismas
// ecuaciones 6.23/6.24 → mismos números con las mismas entradas).

import { describe, expect, it } from 'vitest';
import {
  calcTimberFrameMember,
  type TimberFrameMemberInputs,
} from '../../lib/calculations/timberFrameMember';
import { calcTimberColumn } from '../../lib/calculations/timberColumns';
import { getKmod, getTimberGrade } from '../../data/timberGrades';

const SEC_C24 = { gradeId: 'C24', b: 140, h: 240, serviceClass: 1 as const };

function inputs(over: Partial<TimberFrameMemberInputs> = {}): TimberFrameMemberInputs {
  return {
    section: SEC_C24,
    Lef_y: 5,
    Lef_z: 5,
    Lltb: 5,
    loadDuration: 'medium',
    N: 0,
    M: 0,
    V: 0,
    ...over,
  };
}

describe('calcTimberFrameMember — flexión y cortante puros', () => {
  it('flexión pura: σm y fm,d (kmod media, γM aserrada, kh=1 con h=240)', () => {
    // C24 140×240, M = 20 kN·m, clase servicio 1, duración media:
    //   kmod = 0.80, γM = 1.30, kh = 1.0 (h = 240 ≥ 150)
    //   fm,d = 0.80·24/1.30 = 14.7692 N/mm²
    //   W = 140·240²/6 = 1 344 000 mm³ → σm = 20e6/1.344e6 = 14.8810 N/mm²
    const r = calcTimberFrameMember(inputs({ M: 20 }));
    expect(r.valid).toBe(true);
    expect(r.kmod).toBeCloseTo(0.8, 12);
    expect(r.gammaM).toBeCloseTo(1.3, 12);
    expect(r.kh).toBeCloseTo(1.0, 12);
    expect(r.fm_d).toBeCloseTo((0.8 * 24) / 1.3, 10);
    expect(r.sigma_m).toBeCloseTo(20e6 / 1_344_000, 10);
    const bending = r.checks.find((c) => c.id === 'bending')!;
    expect(bending.utilization).toBeCloseTo((20e6 / 1_344_000) / ((0.8 * 24) / 1.3), 10);
    // Sin axil no hay filas de interacción ni de tracción.
    expect(r.checks.some((c) => c.id === 'comb-623')).toBe(false);
    expect(r.checks.some((c) => c.id === 'tension-bending')).toBe(false);
  });

  it('kh > 1 con canto pequeño (aserrada h = 100): kh = min((150/100)^0.2, 1.3)', () => {
    const r = calcTimberFrameMember(inputs({ section: { ...SEC_C24, b: 60, h: 100 }, M: 2 }));
    expect(r.kh).toBeCloseTo(Math.min(Math.pow(150 / 100, 0.2), 1.3), 12);
  });

  it('cortante: τ = 1.5·V/(kcr·A) contra fv,d', () => {
    // V = 30 kN: A = 140·240 = 33 600 mm², Av = 0.67·A = 22 512 mm²
    //   τ = 1.5·30 000/22 512 = 1.99893 N/mm²; fv,d = 0.8·4.0/1.3 = 2.46154
    const r = calcTimberFrameMember(inputs({ V: 30 }));
    const shear = r.checks.find((c) => c.id === 'shear')!;
    const tau = (1.5 * 30e3) / (0.67 * 33_600);
    expect(r.tau_d).toBeCloseTo(tau, 10);
    expect(shear.utilization).toBeCloseTo(tau / ((0.8 * 4.0) / 1.3), 10);
  });

  it('vuelco lateral: kcrit por la esbeltez λrel,m con Lef = Lltb + 2h', () => {
    // Sección esbelta 60×300, Lltb = 6 m → Lef = 6000 + 600 = 6600 mm.
    //   σm,crit = 0.78·60²·(7.4·1000)/(300·6600) = 10.4945 N/mm²
    //   λrel,m = √(24/10.4945) = 1.51226 > 1.4 → kcrit = 1/λ² = 0.437276
    const r = calcTimberFrameMember(inputs({ section: { ...SEC_C24, b: 60, h: 300 }, Lltb: 6, M: 10 }));
    const sigmaCrit = (0.78 * 60 * 60 * 7400) / (300 * 6600);
    expect(r.sigma_m_crit).toBeCloseTo(sigmaCrit, 8);
    const lrel = Math.sqrt(24 / sigmaCrit);
    expect(r.lambda_rel_m).toBeCloseTo(lrel, 10);
    expect(r.kcrit).toBeCloseTo(1 / (lrel * lrel), 10);
    const ltb = r.checks.find((c) => c.id === 'ltb')!;
    expect(ltb.utilization).toBeCloseTo(r.sigma_m / (r.kcrit * r.fm_d), 10);
  });

  it('kcrit en la RAMA LINEAL (0.75 < λrel,m ≤ 1.40): kcrit = 1.56 − 0.75·λrel,m', () => {
    // 80×340, Lltb = 5 m → Lef = 5000 + 680 = 5680 mm.
    //   σm,crit = 0.78·80²·7400/(340·5680) = 19.1278 N/mm²
    //   λrel,m = √(24/19.1278) = 1.12016 ∈ (0.75, 1.40] → rama intermedia
    //   kcrit = 1.56 − 0.75·1.12016 = 0.71988 (ni 1.0 ni 1/λ²)
    const r = calcTimberFrameMember(inputs({ section: { ...SEC_C24, b: 80, h: 340 }, Lltb: 5, M: 8 }));
    expect(r.lambda_rel_m).toBeGreaterThan(0.75);
    expect(r.lambda_rel_m).toBeLessThanOrEqual(1.40);
    expect(r.kcrit).toBeCloseTo(1.56 - 0.75 * r.lambda_rel_m, 10);
    // Y no coincide con ninguna de las otras dos ramas.
    expect(r.kcrit).not.toBeCloseTo(1.0, 3);
    expect(r.kcrit).not.toBeCloseTo(1 / (r.lambda_rel_m * r.lambda_rel_m), 3);
  });
});

describe('calcTimberFrameMember — flexocompresión: paridad con calcTimberColumn', () => {
  it('ecs. 6.23/6.24 idénticas al motor de pilares con las mismas entradas', () => {
    // Mismo caso en ambos motores: C24 140×240, L = 3 m, β = 1 ambos ejes,
    // Nd = 80 kN, Md = 6 kN·m eje fuerte, servicio 1, duración media.
    const col = calcTimberColumn({
      title: '',
      gradeId: 'C24', b: 140, h: 240, L: 3, beta_y: 1, beta_z: 1,
      Nd: 80, Vd: 0, Md: 6, momentAxis: 'strong',
      serviceClass: 1, loadDuration: 'medium',
      fireResistance: 'R0', exposedFaces: 4, etaFi: 0.6,
    });
    const r = calcTimberFrameMember(inputs({ Lef_y: 3, Lef_z: 3, Lltb: 3, N: -80, M: 6 }));
    expect(col.valid).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.kc_y).toBeCloseTo(col.kc_y, 12);
    expect(r.kc_z).toBeCloseTo(col.kc_z, 12);
    const u623 = r.checks.find((c) => c.id === 'comb-623')!.utilization;
    const u624 = r.checks.find((c) => c.id === 'comb-624')!.utilization;
    expect(u623).toBeCloseTo(col.util_623, 12);
    expect(u624).toBeCloseTo(col.util_624, 12);
  });

  it('ec. 6.35: (σm/(kcrit·fm,d))² + σc/(kc,z·fc0,d) con el Lef propio (+2h)', () => {
    const r = calcTimberFrameMember(inputs({ Lef_y: 3, Lef_z: 3, Lltb: 3, N: -80, M: 6 }));
    const row = r.checks.find((c) => c.id === 'comb-635')!;
    const grade = getTimberGrade('C24')!;
    const fc0d = (0.8 * grade.fc0_k) / 1.3;
    const sigmaC = 80e3 / (140 * 240);
    const mRatio = r.sigma_m / (r.kcrit * r.fm_d);
    expect(row.utilization).toBeCloseTo(mRatio * mRatio + sigmaC / (r.kc_z * fc0d), 10);
  });

  it('compresión pura (biela): filas 6.23/6.24 degeneran a σc/(kc·fc0,d)', () => {
    const r = calcTimberFrameMember(inputs({ Lef_y: 2.5, Lef_z: 2.5, Lltb: 2.5, N: -50 }));
    expect(r.checks.some((c) => c.id === 'comb-635')).toBe(false);
    expect(r.checks.some((c) => c.id === 'bending')).toBe(false);
    const u623 = r.checks.find((c) => c.id === 'comb-623')!;
    const grade = getTimberGrade('C24')!;
    const fc0d = (0.8 * grade.fc0_k) / 1.3;
    const sigmaC = 50e3 / (140 * 240);
    expect(u623.utilization).toBeCloseTo(sigmaC / (r.kc_y * fc0d), 10);
    expect(u623.description).not.toContain('flexión');
  });
});

describe('calcTimberFrameMember — tracción y kmod', () => {
  it('flexotracción ec. 6.17: σt/ft0,d + σm/fm,d', () => {
    // N = +60 kN, M = 8 kN·m: σt = 60e3/33 600 = 1.78571; ft0,d = 0.8·14.5/1.3
    //   = 8.92308; σm = 8e6/1 344 000 = 5.95238; fm,d = 14.76923.
    const r = calcTimberFrameMember(inputs({ N: 60, M: 8 }));
    const row = r.checks.find((c) => c.id === 'tension-bending')!;
    const util = (60e3 / 33_600) / ((0.8 * 14.5) / 1.3) + (8e6 / 1_344_000) / ((0.8 * 24) / 1.3);
    expect(row.utilization).toBeCloseTo(util, 10);
    // Con tracción la flexión va dentro de 6.17; el vuelco se comprueba aparte.
    expect(r.checks.some((c) => c.id === 'bending')).toBe(false);
    expect(r.checks.some((c) => c.id === 'ltb')).toBe(true);
  });

  it('la duración de carga gobierna el kmod (permanente 0.60 < corta 0.90)', () => {
    const perm = calcTimberFrameMember(inputs({ M: 10, loadDuration: 'permanent' }));
    const short = calcTimberFrameMember(inputs({ M: 10, loadDuration: 'short' }));
    expect(perm.kmod).toBeCloseTo(getKmod('permanent', 1), 12);
    expect(short.kmod).toBeCloseTo(getKmod('short', 1), 12);
    const uPerm = perm.checks.find((c) => c.id === 'bending')!.utilization;
    const uShort = short.checks.find((c) => c.id === 'bending')!.utilization;
    // Misma demanda, menor kmod → mayor utilización, en proporción 0.9/0.6.
    expect(uPerm / uShort).toBeCloseTo(0.9 / 0.6, 10);
  });

  it('clase de servicio 3 rebaja el kmod (media: 0.65 vs 0.80)', () => {
    const r = calcTimberFrameMember(inputs({ section: { ...SEC_C24, serviceClass: 3 }, M: 10 }));
    expect(r.kmod).toBeCloseTo(0.65, 12);
  });

  it('clase desconocida y dimensiones inválidas → invalid', () => {
    expect(calcTimberFrameMember(inputs({ section: { ...SEC_C24, gradeId: 'C99' } })).valid).toBe(false);
    expect(calcTimberFrameMember(inputs({ section: { ...SEC_C24, b: 0 } })).valid).toBe(false);
  });
});
