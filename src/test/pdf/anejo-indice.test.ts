/**
 * T8: el índice del anejo se verifica contra las páginas REALES tras insertar
 * la portada y el índice, que es justo donde se desplazan. Y el montaje
 * entero (`lib/anejo/generar`): portada + índice + piezas con pdf-lib de
 * verdad, las páginas de cada pieza contadas y no fiadas del índice, la
 * excluida fuera, y cada fallo con su pieza culpable: sin PDF, ilegible, o un
 * número del índice que no apunta a donde empieza la pieza.
 */

import { IDBFactory } from 'fake-indexeddb';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pieza } from '../../lib/anejo';
import { _reiniciarBlobsParaTests, guardarBlob } from '../../lib/anejo/blobs';
import { blobDePdf, contarPaginas } from '../../lib/anejo/concatenar';
import { ErrorDeAnejo, generarAnejo, ID_FRENTE, verificarIndice } from '../../lib/anejo/generar';
import type { EntradaIndice } from '../../lib/anejo/maqueta';
import { obraVacia } from '../../lib/obra';
import { denominacionDePortada, frenteDelAnejo, lineasDePortada } from '../../lib/pdf/anejo';

// Para poder mentir sobre las páginas de UNA pieza y ver que la verificación lo pilla.
vi.mock('../../lib/anejo/concatenar', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../lib/anejo/concatenar')>();
  return { ...orig, contarPaginas: vi.fn(orig.contarPaginas) };
});

async function pdfDe(paginas: number, marca: string): Promise<Blob> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < paginas; i++) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawText(`${marca} ${i + 1}`, { x: 50, y: 700, size: 12, font: fuente });
  }
  return blobDePdf(await doc.save());
}

function pieza(id: string, modulo: string, titulo: string, extra: Partial<Pieza> = {}): Pieza {
  return {
    id,
    modulo,
    clave: modulo.replace('concreta-', ''),
    titulo,
    ts: '2026-09-08T10:00:00.000Z',
    esquema: '1',
    blobId: `blob-${id}`,
    paginas: 2,
    huella: null,
    datos: null,
    tituloEnPdf: false,
    incluida: true,
    ...extra,
  };
}

const entrada = (id: string, pagina: number, paginas: number): EntradaIndice => ({
  id,
  numero: 1,
  seccion: 'piezas',
  titulo: id,
  capitulo: 'Vigas de hormigón',
  pagina,
  paginas,
});

const FECHA = new Date(2026, 8, 8);
const OBRA = { ...obraVacia(), denominacion: 'Nave de prueba', municipio: 'Dos Hermanas', provincia: '41', uso: 'Nave industrial', altitud: 40 };

beforeEach(() => {
  _reiniciarBlobsParaTests();
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.mocked(contarPaginas).mockClear();
});

afterEach(() => {
  _reiniciarBlobsParaTests();
});

describe('verificarIndice', () => {
  it('null si cada número apunta a donde empieza su pieza', () => {
    const partes = [
      { id: ID_FRENTE, desde: 1, paginas: 2 },
      { id: 'a', desde: 3, paginas: 2 },
      { id: 'b', desde: 5, paginas: 1 },
    ];
    expect(verificarIndice([entrada('a', 3, 2), entrada('b', 5, 1)], partes)).toBeNull();
  });

  it('señala la primera entrada desplazada, la que no ha entrado, o la que cambió de páginas', () => {
    const partes = [
      { id: 'a', desde: 3, paginas: 2 },
      { id: 'b', desde: 6, paginas: 1 },
    ];
    expect(verificarIndice([entrada('a', 3, 2), entrada('b', 5, 1)], partes)?.entrada.id).toBe('b');
    expect(verificarIndice([entrada('a', 3, 2), entrada('c', 5, 1)], partes)).toEqual({ entrada: entrada('c', 5, 1), real: null });
    expect(verificarIndice([entrada('a', 3, 3)], partes)?.entrada.id).toBe('a');
  });
});

describe('frenteDelAnejo', () => {
  const entradas = (n: number) => Array.from({ length: n }, (_, i) => ({ ...entrada(`p${i}`, 3 + i, 1), numero: i + 1, titulo: `Pieza ${i + 1}` }));

  it('portada más las páginas del índice que dijo el plan: una con tres piezas, tres con sesenta', async () => {
    const poco = await frenteDelAnejo({ obra: OBRA, nombre: 'Nave', fecha: FECHA, version: '260908.1' }, entradas(3));
    expect(poco.paginas).toBe(2);
    expect(poco.paginasIndice).toBe(1);
    expect(await contarPaginas(poco.blob)).toBe(2);

    const mucho = await frenteDelAnejo({ obra: null, nombre: '', fecha: FECHA, version: '260908.1' }, entradas(60));
    expect(mucho.paginas).toBe(4);
    expect(await contarPaginas(mucho.blob)).toBe(4);
  });

  it('la portada dice lo que la obra sabe, y nada más', () => {
    expect(denominacionDePortada({ obra: OBRA, nombre: 'Nave' })).toBe('Nave de prueba');
    expect(denominacionDePortada({ obra: null, nombre: 'Nave' })).toBe('Nave');
    expect(denominacionDePortada({ obra: null, nombre: '' })).toBe('Obra sin nombre');
    expect(lineasDePortada(OBRA)).toEqual([
      ['Uso', 'Nave industrial'],
      ['Emplazamiento', 'Dos Hermanas (Sevilla)'],
      ['Altitud', '40 m'],
    ]);
    expect(lineasDePortada({ ...obraVacia(), municipio: 'Ávila' })).toEqual([['Emplazamiento', 'Ávila']]);
    expect(lineasDePortada(null)).toEqual([]);
  });
});

describe('generarAnejo', () => {
  const piezas = () => [
    pieza('v1', 'concreta-rc-beams', 'Viga V-1'),
    pieza('p1', 'concreta-rc-columns', 'Pilar P-1'),
    pieza('m1', 'concreta-viento-nieve', 'Viento de la nave'),
  ];

  async function conPdfs(v1 = 2, p1 = 1, m1 = 3) {
    await guardarBlob('blob-v1', await pdfDe(v1, 'V1'));
    await guardarBlob('blob-p1', await pdfDe(p1, 'P1'));
    await guardarBlob('blob-m1', await pdfDe(m1, 'M1'));
  }

  it('portada, índice y piezas en orden de documento, con numeración continua y las páginas contadas de verdad', async () => {
    await conPdfs();
    const entraron: string[] = [];
    // El índice dice 2 páginas para cada una; la memoria tiene 3 de verdad y el pilar 1.
    const r = await generarAnejo({ piezas: piezas(), obra: OBRA, nombreObra: 'Nave', version: '260908.1', fecha: FECHA, onParte: (id) => entraron.push(id) });

    expect(r.paginasIndice).toBe(1);
    expect(r.paginas).toBe(2 + 3 + 2 + 1);
    expect(r.entradas.map((e) => [e.numero, e.id, e.pagina, e.paginas])).toEqual([
      [1, 'm1', 3, 3],
      [2, 'v1', 6, 2],
      [3, 'p1', 8, 1],
    ]);
    expect(entraron).toEqual(['m1', 'v1', 'p1']);
    expect(r.filename).toBe('anejo-de-calculo-nave.pdf');
    expect(r.blob.type).toBe('application/pdf');

    const doc = await PDFDocument.load(await r.blob.arrayBuffer(), { updateMetadata: false });
    expect(doc.getPageCount()).toBe(8);
    expect(doc.getTitle()).toBe('Anejo de cálculo — Nave');
    expect(doc.getProducer()).toBe('Concreta');
  });

  it('la excluida se queda fuera, del índice y del documento', async () => {
    await conPdfs();
    const lista = piezas().map((p) => (p.id === 'p1' ? { ...p, incluida: false } : p));
    const r = await generarAnejo({ piezas: lista, obra: null, nombreObra: '', version: 'x', fecha: FECHA });
    expect(r.entradas.map((e) => e.id)).toEqual(['m1', 'v1']);
    expect(r.paginas).toBe(2 + 3 + 2);
    expect(r.filename).toBe('anejo-de-calculo.pdf');
  });

  it('sin PDF en esta máquina: la pieza culpable, sin tocar nada', async () => {
    await guardarBlob('blob-v1', await pdfDe(2, 'V1'));
    await guardarBlob('blob-m1', await pdfDe(3, 'M1'));
    const e = await generarAnejo({ piezas: piezas(), obra: null, nombreObra: 'Nave', version: 'x' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorDeAnejo);
    expect((e as ErrorDeAnejo).motivo).toBe('sin-pdf');
    expect((e as ErrorDeAnejo).piezaId).toBe('p1');
  });

  it('un PDF ilegible: la pieza culpable', async () => {
    await conPdfs();
    await guardarBlob('blob-p1', new Blob(['esto no es un PDF'], { type: 'application/pdf' }));
    const e = await generarAnejo({ piezas: piezas(), obra: null, nombreObra: 'Nave', version: 'x' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorDeAnejo);
    expect((e as ErrorDeAnejo).motivo).toBe('ilegible');
    expect((e as ErrorDeAnejo).piezaId).toBe('p1');
  });

  it('un índice que no cuadra con las páginas reales se aborta señalando la pieza, no se entrega', async () => {
    await conPdfs();
    // La memoria (primera del documento) tiene 3 páginas; el conteo miente y dice 5.
    vi.mocked(contarPaginas).mockImplementationOnce(async () => 5);
    const e = await generarAnejo({ piezas: piezas(), obra: null, nombreObra: 'Nave', version: 'x' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorDeAnejo);
    expect((e as ErrorDeAnejo).motivo).toBe('indice');
    expect((e as ErrorDeAnejo).piezaId).toBe('m1');
    expect((e as ErrorDeAnejo).message).toMatch(/«Viento de la nave»/);
  });

  it('nada marcado: vacío', async () => {
    const e = await generarAnejo({ piezas: piezas().map((p) => ({ ...p, incluida: false })), obra: null, nombreObra: '', version: 'x' }).catch((x: unknown) => x);
    expect((e as ErrorDeAnejo).motivo).toBe('vacio');
  });
});
