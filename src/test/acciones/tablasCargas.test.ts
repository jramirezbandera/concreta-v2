/**
 * Transcripción de las tablas de cargas: la 3.1 releída de la p. 5 del DB
 * SE-AE y cotejada con la hoja «Parametros y tablas» del Excel del estudio
 * (B4:E18, quince filas que coinciden con la norma), el Anejo C de las pp.
 * 18-20, y las tablas 4.1 y 4.2 del DB SE.
 */

import { describe, expect, it } from 'vitest';
import { GAMMA_G, GAMMA_Q } from '../../lib/calculations/loadGen';
import {
  ALTITUD_PSI_NIEVE,
  ALTURA_LIBRE_C5,
  BORDE_BALCON,
  CATEGORIAS_CON_INCREMENTO,
  CATEGORIAS_USO,
  DENSIDAD_HORMIGON,
  DENSIDAD_RELLENOS,
  GAMMA_DB_SE,
  INCLINACION_G,
  INCREMENTO_ESCALERAS,
  LOSA_C5,
  PORCHES,
  ROTULO_PSI,
  TABIQUERIA,
  TABLA_3_1,
  TABLA_4_2_PSI,
  TABLA_C5_CERRAMIENTOS,
  TABLA_C5_CUBIERTAS,
  TABLA_C5_FORJADOS,
  TABLA_C5_SOLADOS,
  type FilaTabla31,
} from '../../lib/acciones/tablasCargas';

describe('tabla 3.1 (p. 5) — sobrecargas de uso', () => {
  it('las quince filas, carga uniforme y concentrada', () => {
    const esperado: [FilaTabla31, number, number][] = [
      ['A1', 2, 2],
      ['A2', 3, 2],
      ['B', 2, 2],
      ['C1', 3, 4],
      ['C2', 4, 4],
      ['C3', 5, 4],
      ['C4', 5, 7],
      ['C5', 5, 4],
      ['D1', 5, 4],
      ['D2', 5, 7],
      ['E', 2, 20],
      ['F', 1, 2],
      ['G1', 1, 2],
      ['G1ligera', 0.4, 1],
      ['G2', 0, 2],
    ];
    expect(Object.keys(TABLA_3_1)).toHaveLength(15);
    for (const [fila, uniforme, concentrada] of esperado) {
      expect(TABLA_3_1[fila].uniforme, fila).toBe(uniforme);
      expect(TABLA_3_1[fila].concentrada, fila).toBe(concentrada);
      expect(TABLA_3_1[fila].descripcion.length, fila).toBeGreaterThan(5);
      expect(TABLA_3_1[fila].corta.length, fila).toBeGreaterThan(3);
    }
  });

  it('coincide con la hoja «Parametros y tablas» del Excel del estudio (B4:E18)', () => {
    // Las etiquetas del usuario llevan el código delante: «A1_Viviendas…»,
    // «G1_Cubiertas ligeras sobre correas…» → 0,4.
    const hoja: [FilaTabla31, number][] = [
      ['A1', 2], ['A2', 3], ['B', 2], ['C1', 3], ['C2', 4], ['C3', 5], ['C4', 5], ['C5', 5],
      ['D1', 5], ['D2', 5], ['E', 2], ['F', 1], ['G1', 1], ['G1ligera', 0.4], ['G2', 0],
    ];
    for (const [fila, valor] of hoja) expect(TABLA_3_1[fila].uniforme, fila).toBe(valor);
  });

  it('las categorías que se preguntan son trece: G se resuelve en G1/G2 por la inclinación', () => {
    expect(CATEGORIAS_USO).toEqual(['A1', 'A2', 'B', 'C1', 'C2', 'C3', 'C4', 'C5', 'D1', 'D2', 'E', 'F', 'G']);
  });

  it('notas y artículos que afectan al valor', () => {
    expect(INCLINACION_G).toEqual({ g1Max: 20, g2Min: 40 });
    expect(INCREMENTO_ESCALERAS).toBe(1);
    expect(CATEGORIAS_CON_INCREMENTO).toEqual(['A1', 'A2', 'B']);
    expect(BORDE_BALCON).toBe(2);
    expect(PORCHES).toEqual({ privado: 1, publico: 3 });
  });
});

describe('art. 2.1 y Anejo C (pp. 18-20) — pesos', () => {
  it('tabiquería: 1,2 de tope para asimilarla a uniforme; 1,0 en viviendas', () => {
    expect(TABIQUERIA).toEqual({ max: 1.2, viviendas: 1.0 });
  });

  it('tabla C.5, forjados: tramos por grueso total', () => {
    expect(TABLA_C5_FORJADOS.chapa.map((t) => [t.gruesoMax, t.peso])).toEqual([[0.12, 2]]);
    expect(TABLA_C5_FORJADOS.unidireccional.map((t) => [t.gruesoMax, t.peso])).toEqual([
      [0.28, 3],
      [0.3, 4],
    ]);
    expect(TABLA_C5_FORJADOS.reticular.map((t) => [t.gruesoMax, t.peso])).toEqual([
      [0.3, 4],
      [0.35, 5],
    ]);
    // La losa de 0,20 m de la tabla es la densidad de la C.1 por el canto.
    expect(LOSA_C5).toEqual({ grueso: 0.2, peso: 5 });
    expect(DENSIDAD_HORMIGON * LOSA_C5.grueso).toBeCloseTo(LOSA_C5.peso, 12);
  });

  it('tabla C.5, cerramientos (kN/m para 3 m), solados y cubiertas (kN/m²), rellenos (kN/m³)', () => {
    expect(ALTURA_LIBRE_C5).toBe(3);
    expect([TABLA_C5_CERRAMIENTOS.tabique.peso, TABLA_C5_CERRAMIENTOS.tabicon.peso, TABLA_C5_CERRAMIENTOS.hojaExterior.peso]).toEqual([3, 5, 7]);
    expect([TABLA_C5_CERRAMIENTOS.tabique.gruesoMax, TABLA_C5_CERRAMIENTOS.tabicon.gruesoMax, TABLA_C5_CERRAMIENTOS.hojaExterior.gruesoMax]).toEqual([0.09, 0.14, 0.25]);
    expect([TABLA_C5_SOLADOS.lamina.peso, TABLA_C5_SOLADOS.plaston.peso, TABLA_C5_SOLADOS.piedra.peso]).toEqual([0.5, 1.0, 1.5]);
    expect([
      TABLA_C5_CUBIERTAS.faldonesLigeros.peso,
      TABLA_C5_CUBIERTAS.faldonesTeja.peso,
      TABLA_C5_CUBIERTAS.tejaPalomeros.peso,
      TABLA_C5_CUBIERTAS.planaVista.peso,
      TABLA_C5_CUBIERTAS.planaGrava.peso,
    ]).toEqual([1.0, 2.0, 3.0, 1.5, 2.5]);
    expect(DENSIDAD_RELLENOS).toEqual({ agua: 10, tierra: 20 });
  });
});

describe('DB SE tablas 4.1 y 4.2', () => {
  it('γ: 1,35 / 1,50 / 1,00, los mismos que usa el resto de la app (loadGen)', () => {
    expect(GAMMA_DB_SE).toEqual({ G: 1.35, Q: 1.5, A: 1.0 });
    expect(GAMMA_DB_SE.G).toBe(GAMMA_G);
    expect(GAMMA_DB_SE.Q).toBe(GAMMA_Q);
  });

  it('ψ por familia y la nieve por altitud', () => {
    expect(TABLA_4_2_PSI.A).toEqual({ psi0: 0.7, psi1: 0.5, psi2: 0.3 });
    expect(TABLA_4_2_PSI.B).toEqual({ psi0: 0.7, psi1: 0.5, psi2: 0.3 });
    expect(TABLA_4_2_PSI.C).toEqual({ psi0: 0.7, psi1: 0.7, psi2: 0.6 });
    expect(TABLA_4_2_PSI.D).toEqual({ psi0: 0.7, psi1: 0.7, psi2: 0.6 });
    expect(TABLA_4_2_PSI.E).toEqual({ psi0: 0.7, psi1: 0.7, psi2: 0.6 });
    expect(TABLA_4_2_PSI.G).toEqual({ psi0: 0, psi1: 0, psi2: 0 });
    expect(TABLA_4_2_PSI.nieveBaja).toEqual({ psi0: 0.5, psi1: 0.2, psi2: 0 });
    expect(TABLA_4_2_PSI.nieveAlta).toEqual({ psi0: 0.7, psi1: 0.5, psi2: 0.2 });
    expect(ALTITUD_PSI_NIEVE).toBe(1000);
    for (const clave of Object.keys(TABLA_4_2_PSI) as (keyof typeof ROTULO_PSI)[]) expect(ROTULO_PSI[clave].length).toBeGreaterThan(10);
  });
});
