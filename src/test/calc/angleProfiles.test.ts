// Catálogo de angulares de lados iguales (angleProfiles.ts) contra la EN 10056-1.
//
// POR QUÉ EXISTE ESTE FICHERO
// Hasta 2026-09-25 las 45 filas estaban calculadas SIN los acuerdos del perfil: la
// inercia salía hasta un 3,1 % alta y el radio de giro mínimo iv —el que manda en el
// pandeo del cordón entre presillas del empresillado— hasta un 1,6 % alto, del lado
// inseguro. Nada lo vigilaba. Ahora las filas salen de la geometría exacta con los radios
// r1/r2 de la norma, y este test hace dos cosas: fija las 21 filas cuyo valor de catálogo
// se conoce (oráculo externo, tolerancia 0,7 %) y ata las 45 con invariantes que no
// dependen de ninguna fuente, sólo de b y t.
import { describe, it, expect } from 'vitest';
import { ANGLE_PROFILES, getAngleProfile } from '../../data/angleProfiles';

// EN 10056-1 — A (cm²), I (cm⁴, eje paralelo al lado), iv (cm), e (cm).
const EN_10056: Record<string, [number, number, number, number]> = {
  L60x5: [5.82, 19.4, 1.17, 1.64], L60x6: [6.91, 22.8, 1.17, 1.69], L60x8: [9.03, 29.2, 1.16, 1.77],
  L70x6: [8.13, 36.9, 1.37, 1.93], L70x7: [9.40, 42.3, 1.36, 1.97],
  L80x8: [12.3, 72.2, 1.56, 2.26], L80x10: [15.1, 87.5, 1.55, 2.34],
  L90x8: [13.9, 104, 1.76, 2.50], L90x9: [15.5, 116, 1.76, 2.54], L90x10: [17.1, 127, 1.75, 2.58],
  L100x8: [15.5, 145, 1.96, 2.74], L100x10: [19.2, 177, 1.95, 2.82], L100x12: [22.7, 207, 1.94, 2.90],
  L110x10: [21.2, 238, 2.15, 3.06], L110x12: [25.1, 280, 2.14, 3.15],
  L120x10: [23.2, 313, 2.36, 3.31], L120x12: [27.5, 368, 2.35, 3.40],
  L130x12: [30.0, 472, 2.55, 3.64],
  L150x12: [34.8, 737, 2.95, 4.12], L150x14: [40.3, 845, 2.94, 4.21],
  L160x16: [49.1, 1170, 3.14, 4.53],
};

const rel = (a: number, b: number) => Math.abs(a / b - 1);

describe('angulares — 21 filas de la EN 10056-1 (tolerancia 0,7 %)', () => {
  for (const [key, [A, I, iv, e]] of Object.entries(EN_10056)) {
    it(key, () => {
      const p = getAngleProfile(key)!;
      expect(p, key).toBeDefined();
      expect(rel(p.A, A)).toBeLessThan(0.007);
      expect(rel(p.I1, I)).toBeLessThan(0.007);
      expect(rel(p.iv, iv)).toBeLessThan(0.007);
      expect(rel(p.e, e)).toBeLessThan(0.007);
    });
  }
});

describe('angulares — invariantes geométricos de las 45 filas', () => {
  it('45 perfiles, claves únicas, de L60 a L160', () => {
    expect(ANGLE_PROFILES).toHaveLength(45);
    expect(new Set(ANGLE_PROFILES.map((p) => p.key)).size).toBe(45);
    expect(Math.min(...ANGLE_PROFILES.map((p) => p.b))).toBe(60);
    expect(Math.max(...ANGLE_PROFILES.map((p) => p.b))).toBe(160);
  });

  for (const p of ANGLE_PROFILES) {
    describe(p.key, () => {
      // A = t·(2b − t) + acuerdo − 2 redondeos: los acuerdos netos suman entre +0,3 % y
      // +1,5 % (medido 0,4–1,2 %). Con signo negativo o por encima del 2 % hay un dato malo.
      it('A entre +0,3 % y +2 % del rectángulo t·(2b − t)', () => {
        const Arect = (p.t * (2 * p.b - p.t)) / 100;
        expect(p.A / Arect).toBeGreaterThan(1.003);
        expect(p.A / Arect).toBeLessThan(1.02);
      });

      // Centro de gravedad: en un angular de lados iguales e/b va de 0,27 (delgado) a
      // 0,31 (grueso). Medido 0,274–0,308.
      it('e/b ∈ [0,26; 0,32]', () => {
        expect((p.e * 10) / p.b).toBeGreaterThan(0.26);
        expect((p.e * 10) / p.b).toBeLessThan(0.32);
      });

      // Radio de giro mínimo: iv/b ≈ 0,195 en toda la serie (medido 0,193–0,197). Es
      // el número que entra en λ del cordón; un 2 % aquí es un 2 % en la esbeltez.
      it('iv/b ∈ [0,19; 0,20]', () => {
        expect((p.iv * 10) / p.b).toBeGreaterThan(0.19);
        expect((p.iv * 10) / p.b).toBeLessThan(0.2);
      });

      // Iv = A·iv² tiene que ser menor que I1 = (Iu + Iv)/2 y mayor que 0,38·I1
      // (para lados iguales Iv/I1 ≈ 0,40–0,42).
      it('Iv = A·iv² frente a I1: cociente ∈ [0,38; 0,45]', () => {
        const Iv = p.A * p.iv * p.iv;
        expect(Iv / p.I1).toBeGreaterThan(0.38);
        expect(Iv / p.I1).toBeLessThan(0.45);
      });
    });
  }
});

describe('regresión — angulares sin acuerdos (2026-09-25)', () => {
  it('L80x8: A = 12,27 cm² (no 12,16) e iv = 1,561 cm (no 1,572)', () => {
    const p = getAngleProfile('L80x8')!;
    expect(p.A).toBeCloseTo(12.27, 2);
    expect(p.iv).toBeCloseTo(1.561, 3);
  });
  it('L100x10: I1 = 176,7 cm⁴ (no 180,05) y e = 2,822 cm (no 2,868)', () => {
    const p = getAngleProfile('L100x10')!;
    expect(p.I1).toBeCloseTo(176.7, 1);
    expect(p.e).toBeCloseTo(2.822, 3);
  });
});
