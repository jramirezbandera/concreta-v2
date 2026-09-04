/**
 * El .xlsx de verdad: que Excel lo va a poder abrir.
 *
 * Escribir OOXML a mano se paga aquí. Excel no explica nada —dice «contenido no
 * legible» y se acabó—, así que cada regla del esquema que puede corromper el
 * fichero tiene su test, y el test dice QUÉ se rompe si falla. Lo que se prueba
 * no es que el XML sea bonito: es que el orden de los elementos, los índices
 * posicionales de los estilos y las referencias A1 son los que Excel espera.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import type { Block } from '../../lib/materiales/cuadros';
import { planificarHoja } from '../../lib/xlsx/hoja';
import { escribirLibro, esc, partesDelLibro, refCelda } from '../../lib/xlsx/libro';

const BLOQUES: Block[] = [
  { kind: 'heading', level: 2, text: 'HORMIGÓN (CÓDIGO ESTRUCTURAL)' },
  {
    kind: 'table',
    head: ['Localización', 'Tipificación', 'Resistencia de cálculo'],
    rows: [['Cimentación (*)', 'HA-30/B/20/XC2', '20,0 N/mm²']],
  },
  { kind: 'notes', items: ['(*) Contra el terreno: 70 mm'] },
];

const partes = () => partesDelLibro([planificarHoja(BLOQUES)], { titulo: 'Nave taller' });
const sheet = () => partes()['xl/worksheets/sheet1.xml'];

describe('referencias A1', () => {
  it('la columna 27 es AA, no A1 ni [27]', () => {
    expect(refCelda(0, 0)).toBe('A1');
    expect(refCelda(4, 2)).toBe('C5');
    expect(refCelda(0, 25)).toBe('Z1');
    expect(refCelda(0, 26)).toBe('AA1');
    expect(refCelda(0, 27)).toBe('AB1');
    expect(refCelda(0, 51)).toBe('AZ1');
    expect(refCelda(0, 52)).toBe('BA1');
  });
});

describe('escapado', () => {
  it('escapa lo que rompe el XML', () => {
    expect(esc('Vigas & zunchos < 30 "cm"')).toBe('Vigas &amp; zunchos &lt; 30 &quot;cm&quot;');
  });

  it('un nombre de elemento con & no corrompe la hoja', () => {
    const xml = partesDelLibro([
      planificarHoja([{ kind: 'table', head: ['A'], rows: [['Vigas & zunchos']] }]),
    ])['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('Vigas &amp; zunchos');
  });
});

describe('esquema de la hoja', () => {
  it('mergeCells va DESPUÉS de sheetData (al revés, Excel rechaza el fichero)', () => {
    const xml = sheet();
    expect(xml.indexOf('<mergeCells')).toBeGreaterThan(xml.indexOf('</sheetData>'));
  });

  it('el orden de sheetViews, cols y sheetData es el del esquema', () => {
    const xml = sheet();
    expect(xml.indexOf('<sheetViews>')).toBeLessThan(xml.indexOf('<sheetFormatPr'));
    expect(xml.indexOf('<sheetFormatPr')).toBeLessThan(xml.indexOf('<cols>'));
    expect(xml.indexOf('<cols>')).toBeLessThan(xml.indexOf('<sheetData>'));
  });

  it('las filas se numeran sin saltos: un hueco da filas fantasma', () => {
    const filas = [...sheet().matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1]));
    expect(filas).toEqual(filas.map((_, i) => i + 1));
  });

  it('la rejilla va apagada: una captura no puede delatar que es una hoja', () => {
    expect(sheet()).toContain('showGridLines="0"');
  });

  it('las celdas tapadas por una fusión existen y llevan su estilo', () => {
    // Si no, el fondo de la banda se corta en la primera columna.
    const xml = sheet();
    expect(xml).toContain('<mergeCell ref="A1:C1"/>');
    expect(xml).toMatch(/<c r="B1" s="1"\/>/);
  });

  it('el espacio inicial de un marcador se preserva', () => {
    expect(sheet()).toContain('xml:space="preserve"');
  });

  it('los símbolos normativos viajan verbatim', () => {
    const xml = sheet();
    for (const s of ['N/mm²', 'HORMIGÓN', 'Cimentación']) expect(xml).toContain(s);
  });
});

describe('esquema de los estilos', () => {
  const styles = () => partes()['xl/styles.xml'];

  it('el orden de fonts, fills, borders, cellStyleXfs, cellXfs y cellStyles es el del esquema', () => {
    const x = styles();
    const pos = ['<fonts', '<fills', '<borders', '<cellStyleXfs', '<cellXfs', '<cellStyles'].map(
      (t) => x.indexOf(t),
    );
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
    expect(Math.min(...pos)).toBeGreaterThan(-1);
  });

  it('los dos primeros fills son none y gray125, aunque no se usen', () => {
    // Excel los da por sentado en los índices 0 y 1: sin ellos, los colores
    // salen desplazados y la cabecera aparece con el gris de otra cosa.
    const fills = styles().slice(styles().indexOf('<fills'), styles().indexOf('</fills>'));
    expect(fills.indexOf('patternType="none"')).toBeLessThan(fills.indexOf('gray125'));
  });

  it('el borde de índice 0 está vacío', () => {
    expect(styles()).toContain('<borders count="2"><border><left/><right/><top/><bottom/>');
  });

  it('cada count declarado coincide con los hijos que hay', () => {
    const x = styles();
    for (const [etiqueta, hijo] of [
      ['fonts', 'font'],
      ['fills', 'fill'],
      ['borders', 'border'],
      ['cellXfs', 'xf'],
    ] as const) {
      const bloque = x.slice(x.indexOf('<' + etiqueta), x.indexOf('</' + etiqueta + '>'));
      const declarado = Number(/count="(\d+)"/.exec(bloque)![1]);
      const reales = [...bloque.matchAll(new RegExp('<' + hijo + '[ >]', 'g'))].length;
      expect(reales, etiqueta).toBe(declarado);
    }
  });
});

describe('el paquete', () => {
  it('cada parte declarada en [Content_Types] existe de verdad', () => {
    const p = partes();
    for (const m of p['[Content_Types].xml'].matchAll(/PartName="\/([^"]+)"/g)) {
      expect(Object.keys(p), m[1]).toContain(m[1]);
    }
  });

  it('cada relación apunta a una parte que existe', () => {
    const p = partes();
    expect(p['_rels/.rels']).toContain('Target="xl/workbook.xml"');
    for (const m of p['xl/_rels/workbook.xml.rels'].matchAll(/Target="([^"]+)"/g)) {
      expect(Object.keys(p)).toContain('xl/' + m[1]);
    }
  });

  it('todas las partes son XML bien formado', async () => {
    const parser = new DOMParser();
    for (const [ruta, xml] of Object.entries(partes())) {
      const doc = parser.parseFromString(xml, 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length, ruta).toBe(0);
    }
  });

  it('con varias hojas, cada una tiene su parte, su relación y su entrada', () => {
    // Los rId son posicionales: si los estilos se quedan en rId2 al meter una
    // segunda hoja, la hoja 2 abre en blanco y Excel no dice nada.
    const p = partesDelLibro([
      planificarHoja(BLOQUES, 'Cuadro de materiales'),
      planificarHoja(BLOQUES, 'Anclajes'),
    ]);
    expect(Object.keys(p)).toContain('xl/worksheets/sheet2.xml');
    expect(p['xl/workbook.xml']).toContain('name="Anclajes" sheetId="2" r:id="rId2"');
    expect(p['xl/_rels/workbook.xml.rels']).toContain('Id="rId2" Type="' + '');
    expect(p['xl/_rels/workbook.xml.rels']).toContain('Target="worksheets/sheet2.xml"');
    expect(p['xl/_rels/workbook.xml.rels']).toContain('Id="rId3"');
    expect(p['xl/_rels/workbook.xml.rels']).toContain('Target="styles.xml"');
    expect(p['[Content_Types].xml']).toContain('/xl/worksheets/sheet2.xml');
    // Sólo la primera pestaña abre seleccionada.
    expect(p['xl/worksheets/sheet1.xml']).toContain('tabSelected="1"');
    expect(p['xl/worksheets/sheet2.xml']).not.toContain('tabSelected');
  });

  it('el zip resultante lleva las ocho partes y pesa', async () => {
    const blob = await escribirLibro([planificarHoja(BLOQUES)], { titulo: 'Nave taller' });
    expect(blob.size).toBeGreaterThan(500);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    // jszip añade entradas de directorio; Excel las ignora, el test también.
    const ficheros = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name);
    expect(ficheros.sort()).toEqual(Object.keys(partes()).sort());
  });
});
