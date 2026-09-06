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
  altoDato,
  altoEnvuelto,
  altoTitulo,
  anchoTexto,
  cabeEnColumna,
  lineasEnvueltas,
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
  // Una celda fusionada con ajuste de texto es el único sitio donde el alto
  // automático de Excel no funciona, así que si esto se queda corto la nota sale
  // CORTADA en la captura — y son las notas las que justifican la tabla.
  //
  // Contando caracteres a 11 pt por línea el error crecía con cada renglón
  // (Excel gasta 12,75) y a las tres líneas ya cortaba: abriendo el cuadro de
  // materiales por COM, siete notas pedían más alto del escrito. Estas cuatro
  // son de las que cortaban, con el alto que pidió Excel y el ancho de su banda.
  const NOTAS: [string, number, number][] = [
    ['Si no se indica nada en planos, se dispondrá una patilla mínima de 15 cm cuando la armadura acometa a extremos de elementos estructurales.', 61.7, 38.25],
    ['El solape de las armaduras inferiores se realizará en las zonas sobre los pilares, y las armaduras superiores se solaparán en las zonas de centro de vano.', 61.7, 38.25],
    ['Las longitudes de solape corresponden a a6 = 1,5, esto es, a solapar más del 50 % de las barras en la misma sección (tabla A19.8.3). Si se escalonan los solapes, a6 baja hasta 1,0 con menos del 25 % de barras solapadas.', 61.7, 51],
    ['POSICIÓN I: adherencia buena, según la figura A19.8.2 del Anejo 19: armaduras que durante el hormigonado forman con la horizontal un ángulo entre 45º y 90º; todas las de una pieza de canto h = 250 mm; y las situadas en los 250 mm inferiores de una pieza de canto mayor. En piezas de canto h > 600 mm, únicamente los 300 mm superiores son de adherencia deficiente.', 61.7, 76.5],
  ];

  it('ninguna nota del cuadro se queda por debajo del alto que pide Excel', () => {
    for (const [texto, ancho, excel] of NOTAS) {
      expect(altoEnvuelto(texto, ancho), texto.slice(0, 40)).toBeGreaterThanOrEqual(excel);
      expect(altoEnvuelto(texto, ancho), texto.slice(0, 40)).toBeLessThanOrEqual(excel + 13);
    }
  });

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

describe('celdas que no caben en su columna', () => {
  // Se vio en el bloque de viento del plano: «banda de fachada más rozamiento
  // (11 %) según X, hastial en cubierta según X, faldones en cubierta según Y»
  // en la columna de valores, centrada y sin ajuste, salía cortada por los DOS
  // lados. Un dato que se pasa del tope de ancho no puede estirar la columna
  // —ese es el tope—, así que envuelve y la fila lleva su alto escrito.
  const CABE = 'IV (zona urbana, industrial o forestal)';
  const NO_CABE = 'banda de fachada más rozamiento (32 %) y hastial en cubierta';

  /**
   * Lo que el autoajuste del PROPIO Excel devolvió para estos textos en Arial 10:
   * se abrió el .xlsx generado por COM y se midió celda a celda con
   * `Columns.AutoFit()`. Son 98 textos en total y el modelo no se queda corto en
   * ninguno; aquí va la muestra que cubre el rango, del glifo suelto a la frase.
   *
   * Contar caracteres no reproduce esto: van de 0,88 caracteres por unidad de
   * ancho en mayúsculas a 1,25 en «IV (zona urbana…», así que con un factor
   * único o se envuelve lo que cabe o se corta lo que no.
   */
  const EXCEL: [string, number][] = [
    ['I', 0.83],
    ['-0,31', 4.43],
    ['z (m)', 4.57],
    ['Planta 1', 7.14],
    ['Zona eólica', 9.71],
    ['-0,63 / +0,53', 10.86],
    ['Succión (kN/m²)', 13.71],
    ['Grado de aspereza', 16.14],
    ['cp = 0,70 · cs = -0,31', 18.43],
    ['A (velocidad básica 26 m/s)', 23.43],
    ['Coeficientes eólicos según X', 24.29],
    ['qn = 0,96 kN/m² (25º, μ = 1,00)', 26.57],
    [CABE, 31.14],
    ['paralela a X (40,00 m); ancho 8,00 m', 31.29],
    ['banda de fachada más faldones en cubierta', 36.86],
    ['Viento perpendicular a la cumbrera (θ = 0º, según Y)', 44.57],
    [NO_CABE, 53.14],
  ];

  it('mide el texto como lo mide Excel: nunca por debajo, y a un 12 % por encima como mucho', () => {
    // Quedarse corto es lo que CORTA la celda. Pasarse sólo envuelve algo antes
    // de tiempo, así que el error se echa siempre hacia arriba.
    for (const [texto, excel] of EXCEL) {
      expect(anchoTexto(texto), texto).toBeGreaterThanOrEqual(excel);
      expect(anchoTexto(texto), texto).toBeLessThanOrEqual(excel * 1.12);
    }
  });

  it('un valor que no cabe envuelve y su fila lleva el alto de las líneas que necesita', () => {
    const hoja = planificarHoja([
      { kind: 'kvTable', rows: [['Grado de aspereza', CABE], ['En la fuerza por planta según X', NO_CABE]] },
    ]);
    const [corta, larga] = hoja.filas;
    expect(hoja.anchos[1]).toBe(34);
    expect(corta.celdas[1].envolver).toBeUndefined();
    expect(corta.alto).toBeUndefined();
    expect(larga.celdas[0].envolver).toBeUndefined();
    expect(larga.celdas[1].envolver).toBe(true);
    expect(larga.alto).toBe(2 * 13 + 2);
  });

  it('lo que cabe en una línea sigue en una: «IV (zona urbana, industrial o forestal)» en 34', () => {
    expect(cabeEnColumna(CABE, 34)).toBe(true);
    expect(cabeEnColumna(NO_CABE, 34)).toBe(false);
    expect(cabeEnColumna('cp = 0,78 · cs = -0,40', 20)).toBe(true);
    // 41 caracteres que NO caben en 34 aunque contarlos diga que sí: Excel pide 36,9.
    expect(cabeEnColumna('banda de fachada más faldones en cubierta', 34)).toBe(false);
    expect(cabeEnColumna('banda de fachada más faldones en cubierta', 40)).toBe(true);
  });

  it('el salto de línea es el de Excel: las mismas líneas que da su autoajuste', () => {
    // Con ajuste de texto y la columna a 33,29 Excel dio 25,5 pt: dos líneas.
    // Comprobado así en las 114 celdas del libro, todas coinciden.
    expect(lineasEnvueltas(NO_CABE, 33.29)).toBe(2);
    expect(lineasEnvueltas('banda de fachada más faldones en cubierta', 33.29)).toBe(2);
    expect(lineasEnvueltas(CABE, 33.29)).toBe(1);
    expect(lineasEnvueltas('CUBIERTA A DOS AGUAS (SEGÚN DB SE-AE)', 108.5)).toBe(1);
  });

  it('una etiqueta larga también envuelve: su columna tiene el mismo tope', () => {
    const hoja = planificarHoja([
      { kind: 'table', head: ['Zona', 'cpe'], rows: [['Carga de nieve — Faldón norte (25º, μ = 1,00) y algo más', '1,00']] },
    ]);
    const fila = hoja.filas[1];
    expect(fila.celdas[0].envolver).toBe(true);
    expect(fila.celdas[1].envolver).toBeUndefined();
    expect(fila.alto).toBeGreaterThanOrEqual(2 * 13);
  });

  it('el alto crece con el texto y con lo estrecha que sea la columna', () => {
    expect(altoDato('x'.repeat(100), 34)).toBeGreaterThan(altoDato('x'.repeat(50), 34));
    expect(altoDato('x'.repeat(100), 17)).toBeGreaterThan(altoDato('x'.repeat(100), 34));
    expect(altoDato('x'.repeat(40), 34)).toBeGreaterThanOrEqual(2 * 13);
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
