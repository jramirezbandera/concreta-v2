/**
 * Concatenar PDF con pdf-lib (`lib/anejo/concatenar`): que las páginas se
 * copian en orden y cada parte sabe dónde empieza, que una parte ilegible
 * señala su id, y que el repintado de pies tapa el pie de cada pieza y escribe
 * el del anejo sin tocar las páginas anteriores a `desde`.
 */

import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts, type PDFPage } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  aWinAnsi,
  BANDA_PIE_MM,
  blobDePdf,
  concatenarPdfs,
  contarPaginas,
  ErrorDeConcatenacion,
  repintarPies,
} from '../../lib/anejo/concatenar';

/** Un PDF A4 de `paginas` páginas, cada una con su marca escrita. */
async function pdfDe(paginas: number, marca: string): Promise<Blob> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < paginas; i++) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawText(`${marca} ${i + 1}`, { x: 50, y: 700, size: 12, font: fuente });
  }
  return blobDePdf(await doc.save());
}

/**
 * Cuántos flujos de contenido tiene la página. Al dibujar encima de una página
 * que ya tiene contenido, pdf-lib lo envuelve entre un `q` y un `Q` y añade el
 * suyo: la cuenta sube, y el ÚLTIMO flujo es el nuevo.
 */
function flujosDe(pagina: PDFPage): number {
  const c = pagina.node.Contents();
  if (!c) return 0;
  return c instanceof PDFArray ? c.size() : 1;
}

/** El último flujo de contenido de la página, en texto, con el deflate deshecho si lo lleva. */
function ultimoFlujo(doc: PDFDocument, pagina: PDFPage): string {
  const c = pagina.node.Contents();
  const ref = c instanceof PDFArray ? c.get(c.size() - 1) : pagina.node.get(PDFName.of('Contents'));
  const flujo = doc.context.lookup(ref);
  if (!(flujo instanceof PDFRawStream)) throw new Error('el último flujo no es un PDFRawStream');
  const bytes = flujo.dict.has(PDFName.of('Filter')) ? new Uint8Array(inflateSync(flujo.contents)) : flujo.contents;
  return new TextDecoder('latin1').decode(bytes);
}

describe('contarPaginas', () => {
  it('cuenta las páginas de un PDF', async () => {
    expect(await contarPaginas(await pdfDe(3, 'x'))).toBe(3);
    expect(await contarPaginas(await pdfDe(1, 'x'))).toBe(1);
  });
});

describe('concatenarPdfs', () => {
  it('copia las páginas en orden y dice dónde empieza cada parte', async () => {
    const orden: Array<[string, number]> = [];
    const r = await concatenarPdfs(
      [
        { id: 'a', blob: await pdfDe(2, 'A') },
        { id: 'b', blob: await pdfDe(1, 'B') },
        { id: 'c', blob: await pdfDe(3, 'C') },
      ],
      { titulo: 'Anejo de prueba', onParte: (id, i) => orden.push([id, i]) },
    );
    expect(r.paginas).toBe(6);
    expect(r.partes).toEqual([
      { id: 'a', desde: 1, paginas: 2 },
      { id: 'b', desde: 3, paginas: 1 },
      { id: 'c', desde: 4, paginas: 3 },
    ]);
    expect(orden).toEqual([['a', 0], ['b', 1], ['c', 2]]);

    // Sin `updateMetadata`: si no, es el LECTOR el que vuelve a firmar como pdf-lib.
    const doc = await PDFDocument.load(r.bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(6);
    expect(doc.getTitle()).toBe('Anejo de prueba');
    expect(doc.getProducer()).toBe('Concreta');
    expect(doc.getCreator()).toBe('Concreta');
  });

  it('una parte ilegible falla nombrando su id, y no antes de haber contado las anteriores', async () => {
    const vistas: string[] = [];
    const error = await concatenarPdfs(
      [
        { id: 'buena', blob: await pdfDe(1, 'A') },
        { id: 'mala', blob: new Blob(['esto no es un PDF'], { type: 'application/pdf' }) },
        { id: 'nunca', blob: await pdfDe(1, 'C') },
      ],
      { onParte: (id) => vistas.push(id) },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeConcatenacion);
    expect((error as ErrorDeConcatenacion).parteId).toBe('mala');
    expect(vistas).toEqual(['buena']);
  });

  it('sin partes, ninguna parte y un PDF válido (pdf-lib deja una página en blanco)', async () => {
    const r = await concatenarPdfs([]);
    expect(r.partes).toEqual([]);
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPageCount()).toBe(r.paginas);
    expect(r.paginas).toBeLessThanOrEqual(1);
  });
});

describe('repintarPies', () => {
  it('tapa y escribe el pie desde la página pedida, y deja las anteriores como estaban', async () => {
    const { bytes } = await concatenarPdfs([
      { id: 'portada', blob: await pdfDe(1, 'Portada') },
      { id: 'a', blob: await pdfDe(2, 'A') },
    ]);
    const antes = await PDFDocument.load(bytes);
    const flujosAntes = antes.getPages().map(flujosDe);

    const salida = await repintarPies(bytes, {
      izquierda: 'Concreta · Nave en Ávila',
      derecha: (i, n) => `Anejo de cálculo · pág. ${i}/${n}`,
      desde: 2,
    });
    const doc = await PDFDocument.load(salida);
    expect(doc.getPageCount()).toBe(3);
    const paginas = doc.getPages();
    // La portada no se toca: mismo número de flujos.
    expect(flujosDe(paginas[0])).toBe(flujosAntes[0]);
    // Las demás ganan flujos, y el último trae el rectángulo blanco y los dos textos.
    for (const i of [1, 2]) {
      expect(flujosDe(paginas[i])).toBeGreaterThan(flujosAntes[i]);
      const ops = ultimoFlujo(doc, paginas[i]);
      expect(ops).toMatch(/\bl\s+h\s+f\b/); // el rectángulo, como camino cerrado y relleno
      expect((ops.match(/\bTj\b|\bTJ\b/g) ?? []).length).toBeGreaterThanOrEqual(2); // dos textos
      expect(ops).toMatch(/1 1 1 rg/); // blanco
    }
  });

  it('por defecto repinta desde la primera página, y numera sobre el total', async () => {
    const { bytes } = await concatenarPdfs([{ id: 'a', blob: await pdfDe(2, 'A') }]);
    const vistas: string[] = [];
    const salida = await repintarPies(bytes, {
      izquierda: 'Concreta',
      derecha: (i, n) => {
        vistas.push(`${i}/${n}`);
        return `${i}/${n}`;
      },
    });
    expect(vistas).toEqual(['1/2', '2/2']);
    const doc = await PDFDocument.load(salida);
    const antes = (await PDFDocument.load(bytes)).getPages().map(flujosDe);
    doc.getPages().forEach((p, i) => {
      expect(flujosDe(p)).toBeGreaterThan(antes[i]);
      expect(ultimoFlujo(doc, p)).toMatch(/\bTj\b|\bTJ\b/);
    });
  });

  it('la banda tapa los pies de todos los exportadores (entre 7 y 10 mm) y queda bajo la reserva de contenido', () => {
    expect(BANDA_PIE_MM).toBeGreaterThan(10 + 2);
    // El contenido nunca baja de PAGE_H - M - FOOTER_RESERVE, con M ≥ 15 y FOOTER_RESERVE = 10.
    expect(BANDA_PIE_MM).toBeLessThanOrEqual(15 + 10);
  });

  it('aWinAnsi conserva lo que la Helvetica estándar sabe escribir y marca lo que no', () => {
    expect(aWinAnsi('Nave en Ávila — pág. 3/41 · «ñ»')).toBe('Nave en Ávila — pág. 3/41 · «ñ»');
    expect(aWinAnsi('Δ ≥ ✓')).toBe('? ? ?');
  });
});
