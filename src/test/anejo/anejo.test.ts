/**
 * El índice de piezas del anejo (`lib/anejo`): guardar una pieza escribe el
 * PDF y luego el índice (y deshace el PDF si el índice no cabe), un capítulo de
 * memoria reemplaza y una pieza añade, quitar borra las dos cosas, el estado
 * «al día / recalcular» sale de la huella y del esquema, y los huérfanos se
 * purgan contando también los índices de las obras archivadas.
 */

import { IDBFactory } from 'fake-indexeddb';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  blobIdsReferenciados,
  escribirAnejo,
  estadoDePieza,
  guardarPieza,
  leerAnejo,
  piezaPorId,
  piezas,
  piezasSinPdf,
  purgarBlobsHuerfanos,
  purgarEnSegundoPlano,
  quitarPieza,
  type Pieza,
} from '../../lib/anejo';
import { _reiniciarBlobsParaTests, borrarBlob, guardarBlob, idsDeBlobs, leerBlob } from '../../lib/anejo/blobs';
import { blobDePdf } from '../../lib/anejo/concatenar';
import { _reiniciarProyectoParaTests, guardar, proyectoNuevo } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

async function pdf(paginas = 2): Promise<Blob> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage();
  return blobDePdf(await doc.save());
}

function conIndexedDB(valor: unknown) {
  Object.defineProperty(globalThis, 'indexedDB', { value: valor, configurable: true, writable: true });
}

const cuotaLlena = () => new DOMException('QuotaExceededError', 'QuotaExceededError');

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  _reiniciarBlobsParaTests();
  conIndexedDB(new IDBFactory());
  localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-1', L: 6 }));
  localStorage.setItem('rc-beams-version', '1');
});

afterEach(() => {
  vi.restoreAllMocks();
  _reiniciarBlobsParaTests();
});

describe('el índice', () => {
  it('sin nada guardado, vacío', () => {
    expect(leerAnejo()).toEqual({ v: 1, piezas: [] });
    expect(piezas()).toEqual([]);
  });

  it('un índice corrupto o con piezas a medias se lee limpio', () => {
    localStorage.setItem('concreta-anejo', 'no es json');
    expect(leerAnejo().piezas).toEqual([]);
    localStorage.setItem('concreta-anejo', JSON.stringify({ v: 1, piezas: [{ id: 'sin-campos' }, 'texto', null] }));
    expect(leerAnejo().piezas).toEqual([]);
    localStorage.setItem('concreta-anejo', JSON.stringify({ v: 2, piezas: [] }));
    expect(leerAnejo().piezas).toEqual([]);
  });

  it('guardado con otra versión de esquema, se lee en blanco', () => {
    localStorage.setItem('concreta-anejo', JSON.stringify({ v: 1, piezas: [] }));
    localStorage.setItem('concreta-anejo-version', '0');
    expect(leerAnejo()).toEqual({ v: 1, piezas: [] });
  });

  it('escribirAnejo escribe el índice y la versión viva; una pieza antigua sin `incluida` nace incluida', () => {
    const p: Pieza = { id: 'p1', modulo: 'concreta-rc-beams', clave: 'rc-beams', titulo: 'V-1', ts: 't', esquema: '1', blobId: 'b1', paginas: 2, huella: null, incluida: true };
    expect(escribirAnejo({ v: 1, piezas: [p] })).toBe(true);
    expect(localStorage.getItem('concreta-anejo-version')).toBe('1');
    const guardado = JSON.parse(localStorage.getItem('concreta-anejo')!) as { piezas: Record<string, unknown>[] };
    delete guardado.piezas[0].incluida;
    guardado.piezas[0].paginas = 3.7;
    localStorage.setItem('concreta-anejo', JSON.stringify(guardado));
    expect(piezaPorId('p1')).toEqual({ ...p, paginas: 3, incluida: true });
  });
});

describe('guardarPieza', () => {
  it('guarda el PDF y da de alta la pieza con la clave, el esquema y la huella del módulo', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: ' Viga V-1 ', blob: await pdf(3), paginas: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.pieza;
    expect(p.modulo).toBe('concreta-rc-beams');
    expect(p.clave).toBe('rc-beams');
    expect(p.titulo).toBe('Viga V-1');
    expect(p.esquema).toBe('1');
    expect(p.paginas).toBe(3);
    expect(p.huella).toMatch(/^[0-9a-f]{8}$/);
    expect(p.incluida).toBe(true);
    expect(p.ts).toMatch(/^\d{4}-/);
    expect(r.reemplazada).toBeNull();
    expect(piezas()).toEqual([p]);
    const blob = await leerBlob(p.blobId);
    expect(blob).not.toBeNull();
    expect(blob!.size).toBeGreaterThan(100);
  });

  it('sin páginas declaradas, las cuenta abriendo el PDF; sin título, pone el capítulo', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: '', blob: await pdf(4) });
    expect(r.ok && r.pieza.paginas).toBe(4);
    expect(r.ok && r.pieza.titulo).toBe('Vigas de hormigón');
  });

  it('un cálculo de pieza se AÑADE: dos vigas son dos piezas, en orden', async () => {
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-2', blob: await pdf(), paginas: 2 });
    expect(piezas().map((p) => p.titulo)).toEqual(['V-1', 'V-2']);
    expect((await idsDeBlobs()).length).toBe(2);
  });

  it('un capítulo de memoria REEMPLAZA al suyo, en su misma posición, y borra el PDF viejo', async () => {
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    const primero = await guardarPieza({ modulo: 'concreta-materiales', titulo: 'Cuadro', blob: await pdf(), paginas: 1 });
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-2', blob: await pdf(), paginas: 2 });
    // La casilla «incluir» sobrevive al reemplazo.
    const a = leerAnejo();
    a.piezas[1].incluida = false;
    escribirAnejo(a);

    const segundo = await guardarPieza({ modulo: 'concreta-materiales', titulo: 'Cuadro bis', blob: await pdf(), paginas: 2 });
    expect(segundo.ok).toBe(true);
    if (!primero.ok || !segundo.ok) return;
    expect(segundo.reemplazada?.id).toBe(primero.pieza.id);
    expect(piezas().map((p) => p.titulo)).toEqual(['V-1', 'Cuadro bis', 'V-2']);
    expect(piezas()[1].incluida).toBe(false);
    expect(segundo.pieza.incluida).toBe(false);
    expect(await leerBlob(primero.pieza.blobId)).toBeNull();
    expect(await leerBlob(segundo.pieza.blobId)).not.toBeNull();
    expect((await idsDeBlobs()).length).toBe(3);
  });

  it('si el índice no cabe, deshace el PDF y lo dice', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string) {
      if (k === 'concreta-anejo') throw cuotaLlena();
    });
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    expect(r).toEqual({ ok: false, donde: 'indice', motivo: 'cuota' });
    expect(await idsDeBlobs()).toEqual([]);
    expect(leerAnejo().piezas).toEqual([]);
  });

  it('sin IndexedDB, no toca el índice y dice por qué', async () => {
    conIndexedDB(undefined);
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    expect(r).toEqual({ ok: false, donde: 'blob', motivo: 'sin-indexeddb' });
    expect(localStorage.getItem('concreta-anejo')).toBeNull();
  });

  it('un módulo sin adaptador es un error de programación: lanza', async () => {
    await expect(guardarPieza({ modulo: 'concreta-no-existe', titulo: '', blob: await pdf(), paginas: 1 })).rejects.toThrow(/no tiene adaptador/);
  });
});

describe('quitarPieza', () => {
  it('quita la pieza del índice y borra su PDF', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    if (!r.ok) throw new Error('no guardó');
    expect(await quitarPieza(r.pieza.id)).toBe(true);
    expect(piezas()).toEqual([]);
    expect(await leerBlob(r.pieza.blobId)).toBeNull();
  });

  it('una pieza que no existe: false, sin tocar nada', async () => {
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    expect(await quitarPieza('no-existe')).toBe(false);
    expect(piezas()).toHaveLength(1);
  });
});

describe('estadoDePieza', () => {
  async function piezaDeVigas(): Promise<Pieza> {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    if (!r.ok) throw new Error('no guardó');
    return r.pieza;
  }

  it('recién guardada está al día', async () => {
    expect(estadoDePieza(await piezaDeVigas())).toBe('al-dia');
  });

  it('cambiar el cálculo la pone a recalcular; cambiar sólo el título, no', async () => {
    const p = await piezaDeVigas();
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-1 (renombrada)', L: 6 }));
    expect(estadoDePieza(p)).toBe('al-dia');
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-1', L: 7 }));
    expect(estadoDePieza(p)).toBe('recalcular');
  });

  it('borrar el estado del módulo también la pone a recalcular', async () => {
    const p = await piezaDeVigas();
    localStorage.removeItem('rc-beams');
    expect(estadoDePieza(p)).toBe('recalcular');
  });

  it('una pieza hecha sin estado guardado está al día hasta que el usuario toca algo', async () => {
    localStorage.removeItem('rc-beams');
    const p = await piezaDeVigas();
    expect(p.huella).toBeNull();
    expect(estadoDePieza(p)).toBe('al-dia');
    localStorage.setItem('rc-beams', JSON.stringify({ L: 5 }));
    expect(estadoDePieza(p)).toBe('recalcular');
  });

  it('otro esquema, o un módulo que esta versión no conoce: recalcular', async () => {
    const p = await piezaDeVigas();
    expect(estadoDePieza({ ...p, esquema: '0' })).toBe('recalcular');
    expect(estadoDePieza({ ...p, modulo: 'concreta-de-otra-version' })).toBe('recalcular');
  });
});

describe('huérfanos y ausentes', () => {
  it('blobIdsReferenciados cuenta la obra abierta y las archivadas', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    if (!r.ok) throw new Error('no guardó');
    const archivada = proyectoNuevo('Otra obra');
    archivada.id = 'otra';
    archivada.claves['concreta-anejo'] = JSON.stringify({
      v: 1,
      piezas: [{ id: 'x', modulo: 'concreta-rc-beams', clave: 'rc-beams', titulo: 'X', ts: 't', esquema: '1', blobId: 'blob-archivado', paginas: 1 }],
    });
    expect(guardar(archivada)).toBe(true);
    expect(blobIdsReferenciados()).toEqual({ ids: new Set([r.pieza.blobId, 'blob-archivado']), completo: true });
  });

  it('purgarBlobsHuerfanos borra sólo lo que ningún índice referencia', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    if (!r.ok) throw new Error('no guardó');
    await guardarBlob('huerfano', await pdf(1));
    expect(await purgarBlobsHuerfanos()).toEqual(['huerfano']);
    expect(await idsDeBlobs()).toEqual([r.pieza.blobId]);
  });

  it('el índice vivo se lee EN CRUDO: subir la versión de esquema no convierte los PDF en huérfanos', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    if (!r.ok) throw new Error('no guardó');
    // El día que suba `versionViva('concreta-anejo')`, el índice se hidrata en
    // blanco (es lo correcto para la pantalla) pero sus PDF siguen vivos.
    localStorage.setItem('concreta-anejo-version', '99');
    expect(leerAnejo().piezas).toEqual([]);
    expect(blobIdsReferenciados().ids).toEqual(new Set([r.pieza.blobId]));
    expect(await purgarBlobsHuerfanos()).toEqual([]);
    expect(await idsDeBlobs()).toEqual([r.pieza.blobId]);
  });

  it('con un archivo de obra ilegible no se purga nada: sus PDF son desconocidos, no huérfanos', async () => {
    await guardarBlob('de-la-otra', await pdf(1));
    const archivada = proyectoNuevo('Otra obra');
    archivada.id = 'otra';
    expect(guardar(archivada)).toBe(true);
    localStorage.setItem('concreta-proyecto-otra', 'esto ya no es un proyecto');

    expect(blobIdsReferenciados().completo).toBe(false);
    expect(await purgarBlobsHuerfanos()).toEqual([]);
    expect(await idsDeBlobs()).toEqual(['de-la-otra']);
  });

  it('con el almacén no disponible tampoco: no saber qué está vivo no es que nada lo esté', async () => {
    await guardarBlob('quiza-vivo', await pdf(1));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    expect(blobIdsReferenciados()).toEqual({ ids: new Set(), completo: false });
    expect(await purgarBlobsHuerfanos()).toEqual([]);
    expect(await idsDeBlobs()).toEqual(['quiza-vivo']);
  });

  it('purgarEnSegundoPlano no lanza nunca y dice cuántos borró', async () => {
    await guardarBlob('huerfano', await pdf(1));
    expect(await purgarEnSegundoPlano()).toBe(1);
    expect(await idsDeBlobs()).toEqual([]);

    conIndexedDB(undefined);
    await expect(purgarEnSegundoPlano()).resolves.toBe(0);
  });

  it('piezasSinPdf señala las piezas cuyo PDF no está en esta máquina', async () => {
    const a = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    const b = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-2', blob: await pdf(), paginas: 2 });
    if (!a.ok || !b.ok) throw new Error('no guardó');
    expect(await piezasSinPdf()).toEqual(new Set());
    await borrarBlob(b.pieza.blobId);
    expect(await piezasSinPdf()).toEqual(new Set([b.pieza.id]));
  });
});
