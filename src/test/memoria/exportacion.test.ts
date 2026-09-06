/**
 * Las dos exportaciones de la ficha sobre una obra COMPLETA (los cuatro
 * sobres reales, todos los huecos resueltos): el .docx de verdad —abierto con
 * JSZip— y el PDF de verdad, medido sobre el documento dibujado.
 *
 * Lo que ningún test de bloques puede ver y aquí se mira: que el Word no
 * lleva dos Heading1 (el título del documento ES el «3.1» de los bloques),
 * que en el PDF ningún texto se sale de la caja de la página ni se trunca ni
 * pierde un glifo, y que ninguna fila de ninguna tabla es más alta que una
 * página, porque `drawTable` no sabe partir una fila y Word tampoco (van con
 * `cantSplit`).
 */

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportarMemoriaDBSEDocx } from '../../lib/docx/memoriaDBSE';
import { SIN_SOBRES, ensamblar } from '../../lib/memoria/ensamblar';
import { bloquesFicha } from '../../lib/memoria/ficha';
import type { Block } from '../../lib/memoria/model';
import { dibujarBloques } from '../../lib/pdf/bloques';
import { crearPdf } from '../../lib/pdf/fuente';
import { exportarMemoriaDBSEPdf } from '../../lib/pdf/memoriaDBSE';
import { FOOTER_RESERVE, PAGE_H, PAGE_W, measureTable } from '../../lib/pdf/utils';
import { completar, fichaGranada, fichaGranadaConFabrica, sobresGranada } from './fixtures';

/** El margen del exportador: hay que medir con el suyo, no con otro. */
const M = 18;

const fichaCompleta = () => {
  const sobres = sobresGranada();
  return bloquesFicha(ensamblar(completar(fichaGranadaConFabrica(), sobres), sobres));
};

describe('el Word', () => {
  it('se empaqueta, se llama como la obra y dentro va la ficha entera con sus símbolos', async () => {
    const r = await exportarMemoriaDBSEDocx(fichaCompleta(), 'Memoria DB SE — Edificio en Granada');
    expect(r.filename).toBe('memoria-db-se-edificio-en-granada.docx');
    expect(r.blob.size).toBeGreaterThan(20000);
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const t of ['3.1. Seguridad estructural', 'Ed,dst ≤ Ed,stb', 'Ed ≤ Rd', 'Procede', 'No procede', '3.1.4. Acción sísmica (NCSE-02)', 'dato de la obra (empresa)', 'kN/m²', 'S275JR', '3.1.8. Estructuras de fábrica']) {
      expect(xml, t).toContain(t);
    }
    // UN solo Heading1: el título del documento es el 3.1 de los bloques, no un H1 añadido encima.
    expect(xml.match(/<w:pStyle w:val="Heading1"\/>/g)).toHaveLength(1);
    // Y los metadatos del fichero llevan el título del usuario.
    const core = await zip.file('docProps/core.xml')!.async('string');
    expect(core).toContain('Memoria DB SE — Edificio en Granada');
  });

  it('sin título, el nombre por defecto', async () => {
    const r = await exportarMemoriaDBSEDocx(bloquesFicha(ensamblar(fichaGranada(), SIN_SOBRES)));
    expect(r.filename).toBe('memoria-db-se.docx');
  });
});

describe('el PDF', () => {
  interface Escrito {
    texto: string;
    x: number;
    ancho: number;
  }

  /** Espía sobre `doc.text` y `doc.addPage`, midiendo con la fuente activa al escribir. */
  async function dibujar(blocks: Block[]) {
    const doc = await crearPdf();
    const escritos: Escrito[] = [];
    let paginas = 1;
    const origPage = doc.addPage.bind(doc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc.addPage = ((...args: any[]) => {
      paginas++;
      return origPage(...(args as []));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const orig = doc.text.bind(doc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc.text = ((t: any, x: number, y: number, opts?: any) => {
      for (const linea of Array.isArray(t) ? t : [String(t)]) escritos.push({ texto: linea, x, ancho: doc.getTextWidth(linea) });
      return orig(t, x, y, opts);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dibujarBloques(doc, blocks, { M, y: 30 });
    return { doc, escritos, paginas };
  }

  it('la ficha completa: unas cuantas páginas, nada fuera de la caja, ni truncado, ni un glifo perdido', async () => {
    const { escritos, paginas } = await dibujar(fichaCompleta());
    expect(paginas).toBeGreaterThanOrEqual(8);
    expect(escritos.length).toBeGreaterThan(400);
    for (const e of escritos) {
      expect(e.x, e.texto).toBeGreaterThanOrEqual(M - 0.01);
      expect(e.x + e.ancho, e.texto).toBeLessThanOrEqual(PAGE_W - M + 0.01);
    }
    const todo = escritos.map((e) => e.texto).join(' ');
    expect(todo).not.toContain('...');
    expect(todo).not.toContain('?');
    expect(todo).toContain('≤');
    expect(todo).toContain('ρ');
    expect(todo).toContain('Δ');
  });

  it('ninguna fila de ninguna tabla es más alta que una página', async () => {
    // Las celdas largas van como párrafo (D13 del plan): una fila más alta que
    // la página no se puede partir ni aquí ni en Word.
    const doc = await crearPdf();
    const util = PAGE_W - 2 * M;
    const altoPagina = PAGE_H - M - FOOTER_RESERVE - (M + 10);
    let filas = 0;
    for (const b of fichaCompleta()) {
      if (b.kind !== 'table' && b.kind !== 'kvTable') continue;
      const rows: string[][] = b.kind === 'table' ? b.rows : b.rows.map(([k, v]) => [k, v]);
      const n = b.kind === 'table' ? b.head.length : 2;
      const cols = Array.from({ length: n }, (_, j) => ({ key: String(j), label: b.kind === 'table' ? b.head[j] : '', w: util / n, wrap: true, render: (f: string[]) => f[j] ?? '' }));
      doc.setFontSize(7.5);
      const medida = measureTable(doc, { x: M, y: 0, cols, rows, M, headerFontSize: 7.5, cellFontSize: 7.5, pad: 1.5 });
      for (const f of medida.filas) {
        filas++;
        expect(f.rH, `${b.kind}: «${(rows[medida.filas.indexOf(f)] ?? []).join(' | ').slice(0, 60)}»`).toBeLessThan(altoPagina);
      }
    }
    expect(filas).toBeGreaterThan(100);
  });

  it('la entrada perezosa devuelve un PDF con el nombre de la obra', async () => {
    const r = await exportarMemoriaDBSEPdf(fichaCompleta(), 'Edificio en Granada');
    expect(r.filename).toBe('edificio-en-granada.pdf');
    expect(String.fromCharCode(...new Uint8Array(await r.blob.slice(0, 5).arrayBuffer()))).toBe('%PDF-');
  });
});
