/**
 * El libro de Excel conjunto: una pestaña por la que tuviera cada módulo.
 *
 * Lo único que este libro añade a lo que ya hacía cada módulo es el nombre de
 * las pestañas cuando se juntan cuatro cuadros, y ahí está el fallo que no
 * avisa: dos pestañas con el mismo nombre no rompen el .zip, rompen a Excel,
 * que se niega a abrir el fichero sin decir por qué.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import type { Block } from '../../lib/memoria/model';
import { exportarCuadrosObraXlsx } from '../../lib/xlsx/obra';

const tabla = (t: string): Block => ({ kind: 'table', head: ['Ámbito', 'Valor'], rows: [[t, '1']] });

/** Los nombres de pestaña tal como quedan dentro del fichero. */
async function pestanas(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('xl/workbook.xml')!.async('string');
  return [...xml.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
}

describe('exportarCuadrosObraXlsx', () => {
  it('pone una pestaña por sección y conserva sus nombres', () => {
    return exportarCuadrosObraXlsx([
      { etiqueta: 'Cuadro de materiales', secciones: [{ nombre: 'Cuadro de materiales', blocks: [tabla('a')] }, { nombre: 'Anclajes', blocks: [tabla('b')] }] },
      { etiqueta: 'Resistencia al fuego', secciones: [{ nombre: 'Resistencia al fuego', blocks: [tabla('c')] }] },
    ]).then(async (r) => {
      expect(await pestanas(r.blob)).toEqual(['Cuadro de materiales', 'Anclajes', 'Resistencia al fuego']);
    });
  });

  it('desempata dos pestañas que se llamen igual', async () => {
    // Hoy no coincide ninguna, pero basta con que un módulo llame «Viento» a
    // una pestaña que ya tiene otro para que el libro deje de abrirse.
    const r = await exportarCuadrosObraXlsx([
      { etiqueta: 'Viento y nieve', secciones: [{ nombre: 'Viento', blocks: [tabla('a')] }] },
      { etiqueta: 'Cargas por planta', secciones: [{ nombre: 'Viento', blocks: [tabla('b')] }] },
    ]);
    const nombres = await pestanas(r.blob);
    expect(nombres).toEqual(['Viento', 'Viento (2)']);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it('recorta a los 31 caracteres que admite Excel, desempate incluido', async () => {
    const largo = 'Acciones horizontales del edificio entero';
    const r = await exportarCuadrosObraXlsx([
      { etiqueta: 'A', secciones: [{ nombre: largo, blocks: [tabla('a')] }] },
      { etiqueta: 'B', secciones: [{ nombre: largo, blocks: [tabla('b')] }] },
    ]);
    const nombres = await pestanas(r.blob);
    for (const n of nombres) expect(n.length).toBeLessThanOrEqual(31);
    expect(new Set(nombres).size).toBe(2);
  });

  it('descarta las secciones vacías en vez de dejar una pestaña en blanco', async () => {
    const r = await exportarCuadrosObraXlsx([
      { etiqueta: 'Cuadro de materiales', secciones: [{ nombre: 'Cuadro de materiales', blocks: [tabla('a')] }, { nombre: 'Anclajes', blocks: [] }] },
    ]);
    expect(await pestanas(r.blob)).toEqual(['Cuadro de materiales']);
  });

  it('el fichero se llama como la obra, y si no la hay lleva el nombre de partida', async () => {
    expect((await exportarCuadrosObraXlsx([{ etiqueta: 'A', secciones: [{ nombre: 'A', blocks: [tabla('a')] }] }], 'Vivienda en Bormujos')).filename).toBe('vivienda-en-bormujos.xlsx');
    expect((await exportarCuadrosObraXlsx([{ etiqueta: 'A', secciones: [{ nombre: 'A', blocks: [tabla('a')] }] }])).filename).toBe('cuadros-de-plano.xlsx');
  });
});
