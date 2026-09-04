/**
 * Integridad de las tablas del DB SE-AE transcritas a mano.
 *
 * Como en `materiales/tablasCE.test.ts`: los tests de forma cazan una columna
 * corrida; las verificaciones puntuales, releídas de la página rasterizada del
 * PDF, cazan un dedo. La tabla 3.8 tiene además su trampa propia (la columna
 * derecha mal compuesta en el PDF oficial): las comprobaciones de abajo son
 * justo las capitales que esa composición descoloca.
 */

import { describe, expect, it } from 'vitest';
import {
  ALTURAS_TABLA_3_4,
  ALTITUDES_TABLA_E2,
  ASPEREZAS,
  ORDEN_ASPEREZAS,
  TABLA_3_4,
  TABLA_3_5,
  TABLA_3_8,
  TABLA_E2,
  ZONAS_EOLICAS,
  ZONAS_INVERNALES,
} from '../../lib/acciones/tablasAE';
import { presionDinamicaDesdeVelocidad } from '../../lib/acciones/viento';

describe('Anejo D.1 — zonas eólicas', () => {
  it('velocidades 26/27/29 y presiones 0,42/0,45/0,52 (D.1-4)', () => {
    expect(ZONAS_EOLICAS.A).toEqual({ vb: 26, qb: 0.42 });
    expect(ZONAS_EOLICAS.B).toEqual({ vb: 27, qb: 0.45 });
    expect(ZONAS_EOLICAS.C).toEqual({ vb: 29, qb: 0.52 });
  });

  it('la presión de cada zona es la fórmula D.1 con δ = 1,25, a menos de 0,006', () => {
    // 0,4225 / 0,4556 / 0,5256: la norma escribe 0,42 / 0,45 / 0,52. La B no
    // es un redondeo (0,4556 → 0,46), es lo que dice el DB, y eso es lo que
    // va al cuadro.
    for (const { vb, qb } of Object.values(ZONAS_EOLICAS)) {
      expect(Math.abs(presionDinamicaDesdeVelocidad(vb) - qb)).toBeLessThan(0.006);
    }
  });
});

describe('Tabla D.2 — parámetros del entorno', () => {
  it('cinco grados, con k, L y Z crecientes de I a V', () => {
    expect(ORDEN_ASPEREZAS).toHaveLength(5);
    for (let i = 1; i < ORDEN_ASPEREZAS.length; i++) {
      const a = ASPEREZAS[ORDEN_ASPEREZAS[i - 1]];
      const b = ASPEREZAS[ORDEN_ASPEREZAS[i]];
      expect(b.k).toBeGreaterThan(a.k);
      expect(b.L).toBeGreaterThan(a.L);
      expect(b.Z).toBeGreaterThanOrEqual(a.Z);
    }
  });

  it('valores puntuales releídos de la p. 28', () => {
    expect(ASPEREZAS.I).toMatchObject({ k: 0.156, L: 0.003, Z: 1.0 });
    expect(ASPEREZAS.IV).toMatchObject({ k: 0.22, L: 0.3, Z: 5.0 });
    expect(ASPEREZAS.V).toMatchObject({ k: 0.24, L: 1.0, Z: 10.0 });
  });
});

describe('Tabla 3.4 — coeficiente de exposición tabulado', () => {
  it('ocho alturas por grado, no decreciente con la altura y decreciente de I a V', () => {
    expect(ALTURAS_TABLA_3_4).toEqual([3, 6, 9, 12, 15, 18, 24, 30]);
    for (const grado of ORDEN_ASPEREZAS) {
      const fila = TABLA_3_4[grado];
      expect(fila).toHaveLength(8);
      for (let i = 1; i < fila.length; i++) expect(fila[i]).toBeGreaterThanOrEqual(fila[i - 1]);
    }
    for (let col = 0; col < 8; col++) {
      for (let g = 1; g < ORDEN_ASPEREZAS.length; g++) {
        expect(TABLA_3_4[ORDEN_ASPEREZAS[g]][col]).toBeLessThanOrEqual(TABLA_3_4[ORDEN_ASPEREZAS[g - 1]][col]);
      }
    }
  });

  it('esquinas releídas de la p. 12', () => {
    expect(TABLA_3_4.I[0]).toBe(2.4);
    expect(TABLA_3_4.I[7]).toBe(3.7);
    expect(TABLA_3_4.IV[2]).toBe(1.7);
    expect(TABLA_3_4.V[0]).toBe(1.2);
    expect(TABLA_3_4.V[7]).toBe(2.0);
  });
});

describe('Tabla 3.5 — coeficientes eólicos globales', () => {
  it('seis esbelteces; cp no decreciente y cs no creciente', () => {
    expect(TABLA_3_5.esbeltez).toEqual([0.25, 0.5, 0.75, 1.0, 1.25, 5.0]);
    expect(TABLA_3_5.cp).toEqual([0.7, 0.7, 0.8, 0.8, 0.8, 0.8]);
    expect(TABLA_3_5.cs).toEqual([-0.3, -0.4, -0.4, -0.5, -0.6, -0.7]);
  });
});

describe('Tabla E.2 — nieve sobre terreno horizontal', () => {
  it('siete zonas × catorce altitudes, no decreciente con la altitud y guiones sólo al final', () => {
    expect(ALTITUDES_TABLA_E2).toHaveLength(14);
    expect(ZONAS_INVERNALES).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const zona of ZONAS_INVERNALES) {
      const fila = TABLA_E2[zona];
      expect(fila).toHaveLength(14);
      let vistoNull = false;
      for (let i = 0; i < fila.length; i++) {
        const v = fila[i];
        if (v === null) {
          vistoNull = true;
          continue;
        }
        expect(vistoNull).toBe(false);
        if (i > 0 && fila[i - 1] !== null) expect(v).toBeGreaterThanOrEqual(fila[i - 1] as number);
      }
    }
  });

  it('valores puntuales releídos de la p. 46', () => {
    expect(TABLA_E2[1][0]).toBe(0.3);
    expect(TABLA_E2[2][13]).toBe(8.0);
    expect(TABLA_E2[3][12]).toBe(4.0);
    expect(TABLA_E2[4][8]).toBe(1.2);
    expect(TABLA_E2[6][12]).toBe(9.3);
    expect(TABLA_E2[7].slice(0, 13).every((v) => v === 0.2)).toBe(true);
    expect(TABLA_E2[7][13]).toBeNull();
  });
});

describe('Tabla 3.8 — capitales', () => {
  it('las 52 provincias y ciudades autónomas, por código INE', () => {
    const codigos = Object.keys(TABLA_3_8).sort();
    expect(codigos).toHaveLength(52);
    expect(codigos[0]).toBe('01');
    expect(codigos[51]).toBe('52');
    for (const { altitud, sk } of Object.values(TABLA_3_8)) {
      expect(altitud % 10).toBe(0);
      expect(sk).toBeGreaterThanOrEqual(0.2);
      expect(sk).toBeLessThanOrEqual(1.2);
    }
  });

  it('la columna derecha, que el PDF oficial compone corrida una fila', () => {
    expect(TABLA_3_8['39']).toMatchObject({ capital: 'Santander', altitud: 0, sk: 0.3 });
    expect(TABLA_3_8['40']).toMatchObject({ capital: 'Segovia', altitud: 1000, sk: 0.7 });
    expect(TABLA_3_8['41']).toMatchObject({ capital: 'Sevilla', altitud: 10, sk: 0.2 });
    expect(TABLA_3_8['42']).toMatchObject({ capital: 'Soria', altitud: 1090, sk: 0.9 });
    expect(TABLA_3_8['44']).toMatchObject({ capital: 'Teruel', altitud: 950, sk: 0.9 });
    expect(TABLA_3_8['47']).toMatchObject({ capital: 'Valladolid', altitud: 690, sk: 0.4 });
    expect(TABLA_3_8['01']).toMatchObject({ altitud: 520, sk: 0.7 });
    expect(TABLA_3_8['50']).toMatchObject({ capital: 'Zaragoza', altitud: 210, sk: 0.5 });
    expect(TABLA_3_8['51']).toMatchObject({ altitud: 0, sk: 0.2 });
    expect(TABLA_3_8['52']).toMatchObject({ altitud: 0, sk: 0.2 });
  });

  it('las otras dos columnas, releídas de la p. 15', () => {
    expect(TABLA_3_8['05']).toMatchObject({ capital: 'Ávila', altitud: 1130, sk: 1.0 });
    expect(TABLA_3_8['16']).toMatchObject({ capital: 'Cuenca', altitud: 1010, sk: 1.0 });
    expect(TABLA_3_8['24']).toMatchObject({ capital: 'León', altitud: 820, sk: 1.2 });
    expect(TABLA_3_8['28']).toMatchObject({ capital: 'Madrid', altitud: 660, sk: 0.6 });
    expect(TABLA_3_8['34']).toMatchObject({ capital: 'Palencia', altitud: 740, sk: 0.4 });
  });
});
