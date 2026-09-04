/**
 * El planificador de la hoja: `Block[]` → filas, anchos y fusiones.
 *
 * Puro y sin zip, como su hermano `docxPlan.test.ts`. Lo que vigila es que la
 * hoja siga siendo CAPTURABLE: anchos que no se disparen, bandas fusionadas a
 * todo el ancho, y ninguna columna huérfana. Un fallo aquí no lanza ninguna
 * excepción — sale una captura fea, que es peor porque llega al plano.
 */

import { describe, it, expect } from 'vitest';
import type { Block } from '../../lib/materiales/cuadros';
import {
  altoCabecera,
  altoEnvuelto,
  altoTitulo,
  nombreDeHojaValido,
  planificarHoja,
} from '../../lib/xlsx/hoja';

const TABLA: Block = {
  kind: 'table',
  head: ['Localización', 'Tipificación', 'Resistencia de cálculo'],
  rows: [
    ['Cimentación', 'HA-30/B/20/XC2', '20,0 N/mm²'],
    ['Forjados', 'HA-30/F/20/XC1', '20,0 N/mm²'],
  ],
};

describe('estructura de la hoja', () => {
  it('la banda de sección se fusiona a todo el ancho de la tabla', () => {
    const hoja = planificarHoja([{ kind: 'heading', level: 2, text: 'HORMIGÓN' }, TABLA]);
    const banda = hoja.filas.find((f) => f.celdas[0]?.estilo === 'titulo')!;
    expect(banda.fusion).toBe(3);
    expect(banda.celdas[0].texto).toBe('HORMIGÓN');
  });

  it('la primera fila de una tabla es la cabecera y el resto lleva etiqueta + datos', () => {
    const hoja = planificarHoja([TABLA]);
    expect(hoja.filas[0].celdas.map((c) => c.estilo)).toEqual([
      'cabecera',
      'cabecera',
      'cabecera',
    ]);
    expect(hoja.filas[1].celdas.map((c) => c.estilo)).toEqual(['etiqueta', 'dato', 'dato']);
  });

  it('el kvTable no tiene cabecera: son pares etiqueta/valor', () => {
    const hoja = planificarHoja([
      { kind: 'kvTable', rows: [['Nivel de riesgo', 'CC2'], ['Clase de Ejecución', '2']] },
    ]);
    expect(hoja.filas.some((f) => f.celdas.some((c) => c.estilo === 'cabecera'))).toBe(false);
    expect(hoja.filas[0].celdas.map((c) => c.texto)).toEqual(['Nivel de riesgo', 'CC2']);
  });

  it('las notas van fusionadas y conservan su marcador', () => {
    const hoja = planificarHoja([TABLA, { kind: 'notes', items: ['(*) Contra el terreno: 70 mm'] }]);
    const nota = hoja.filas.find((f) => f.celdas[0]?.estilo === 'nota')!;
    expect(nota.fusion).toBe(3);
    expect(nota.celdas[0].texto).toBe('(*) Contra el terreno: 70 mm');
  });

  it('separa los cuadros con una fila en blanco, nunca dos ni una al empezar', () => {
    const hoja = planificarHoja([
      { kind: 'heading', level: 2, text: 'HORMIGÓN' },
      TABLA,
      { kind: 'heading', level: 2, text: 'ACERO' },
      TABLA,
    ]);
    expect(hoja.filas[0].celdas.length).toBeGreaterThan(0);
    const vacias = hoja.filas.map((f) => f.celdas.length === 0);
    expect(vacias.some((v, i) => v && vacias[i + 1])).toBe(false);
  });
});

describe('anchos de columna', () => {
  it('hay un ancho por columna y ninguno se dispara', () => {
    const hoja = planificarHoja([TABLA]);
    expect(hoja.anchos).toHaveLength(3);
    for (const w of hoja.anchos) {
      expect(w).toBeGreaterThanOrEqual(8);
      expect(w).toBeLessThanOrEqual(34);
    }
  });

  it('una cabecera kilométrica NO estira su columna: envuelve', () => {
    // Sin el tope, «Durabilidad natural frente a hongos, duramen (UNE-EN
    // 350-2)» dejaría el cuadro más ancho que la pantalla y la captura ilegible.
    const larga = planificarHoja([
      {
        kind: 'table',
        head: ['Elemento', 'Durabilidad natural frente a hongos, duramen (UNE-EN 350-2)'],
        rows: [['Vigas', '2']],
      },
    ]);
    expect(larga.anchos[1]).toBeLessThanOrEqual(20);
  });

  it('un dato largo SÍ ensancha su columna, hasta el tope', () => {
    const hoja = planificarHoja([
      { kind: 'table', head: ['A', 'B'], rows: [['x', 'HL(HM)-20/B/30/X0 y algo más largo']] },
    ]);
    expect(hoja.anchos[1]).toBeGreaterThan(hoja.anchos[0]);
  });

  it('la columna la miden TODAS las tablas de la hoja, no sólo la primera', () => {
    // Es el precio de apilarlas en una hoja: comparten columna física.
    const hoja = planificarHoja([
      { kind: 'table', head: ['A'], rows: [['x']] },
      { kind: 'table', head: ['B'], rows: [['una etiqueta bastante larga']] },
    ]);
    expect(hoja.anchos[0]).toBeGreaterThan(12);
  });
});

describe('alto de las notas', () => {
  // Los números salen de medir el autoajuste del propio Excel por COM. Una
  // celda fusionada con ajuste de texto es el único sitio donde el alto
  // automático no funciona, así que si esto se queda corto la nota sale CORTADA
  // en la captura — y son las notas las que justifican la tabla.
  it('una nota de una línea pide más de los 13 pt que Excel necesita', () => {
    expect(altoEnvuelto('x'.repeat(125), 141.7)).toBeGreaterThanOrEqual(13);
  });

  it('una nota de dos líneas pide más de los 22 pt que Excel necesita', () => {
    expect(altoEnvuelto('x'.repeat(314), 141.7)).toBeGreaterThanOrEqual(22);
    expect(altoEnvuelto('x'.repeat(363), 141.7)).toBeGreaterThanOrEqual(22);
  });

  it('crece con el texto y nunca baja del alto de una línea', () => {
    expect(altoEnvuelto('', 141.7)).toBe(altoEnvuelto('corta', 141.7));
    expect(altoEnvuelto('x'.repeat(900), 141.7)).toBeGreaterThan(altoEnvuelto('x'.repeat(300), 141.7));
  });

  it('las notas del cuadro llevan alto escrito, no automático', () => {
    const hoja = planificarHoja([
      TABLA,
      { kind: 'notes', items: ['x'.repeat(300)] },
    ]);
    const nota = hoja.filas.find((f) => f.celdas[0]?.estilo === 'nota')!;
    expect(nota.alto).toBeGreaterThan(20);
  });
});

describe('alto de bandas y cabeceras', () => {
  // El mismo problema que las notas y con la misma consecuencia: en la hoja de
  // anclajes, que sólo tiene siete columnas estrechas, el rótulo del cuadro no
  // cabe en una línea y sin alto escrito sale CORTADO. Comprobado contra el
  // autoajuste del propio Excel: 0 celdas cortadas en las dos hojas.
  it('un rótulo largo en una hoja estrecha pide más de una línea', () => {
    const rotulo = 'LONGITUDES DE ANCLAJE EN PROLONGACIÓN RECTA (CÓD-E)';
    expect(altoTitulo(rotulo, 61.5)).toBeGreaterThan(altoTitulo('MADERA', 61.5));
    expect(altoTitulo('MADERA', 141)).toBe(20);
  });

  it('la cabecera la manda la columna que más líneas necesita', () => {
    const larga = 'Durabilidad natural frente a hongos, duramen (UNE-EN 350-2)';
    expect(altoCabecera(['Elemento', larga], [22, 20])).toBeGreaterThan(30);
    expect(altoCabecera(['Elemento', 'Especie'], [22, 20])).toBe(30);
  });

  it('las bandas y las cabeceras del cuadro llevan alto escrito', () => {
    const hoja = planificarHoja([
      { kind: 'heading', level: 2, text: 'HORMIGÓN' },
      TABLA,
    ]);
    const banda = hoja.filas.find((f) => f.celdas[0]?.estilo === 'titulo')!;
    const cabecera = hoja.filas.find((f) => f.celdas[0]?.estilo === 'cabecera')!;
    expect(banda.alto).toBeGreaterThanOrEqual(20);
    expect(cabecera.alto).toBeGreaterThanOrEqual(30);
  });
});

describe('bordes', () => {
  it('sin bloques da una hoja vacía pero válida', () => {
    const hoja = planificarHoja([]);
    expect(hoja.filas).toEqual([]);
    expect(hoja.anchos).toHaveLength(1);
  });

  it('el símbolo y el espacio inicial de un marcador viajan intactos', () => {
    const hoja = planificarHoja([
      { kind: 'table', head: ['A'], rows: [['Cimentación (*)'], ['γc ≤ 1,5 · Ø12']] },
    ]);
    expect(hoja.filas[1].celdas[0].texto).toBe('Cimentación (*)');
    expect(hoja.filas[2].celdas[0].texto).toBe('γc ≤ 1,5 · Ø12');
  });

  it('el nombre de hoja se limpia de lo que Excel prohíbe y se corta a 31', () => {
    expect(nombreDeHojaValido('Obra: A/B [rev1]')).toBe('Obra  A B  rev1');
    expect(nombreDeHojaValido('x'.repeat(40))).toHaveLength(31);
    expect(nombreDeHojaValido('///')).toBe('Cuadro');
  });
});
