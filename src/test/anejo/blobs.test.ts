/**
 * El almacén de PDF del anejo (`lib/anejo/blobs`) sobre una IndexedDB falsa:
 * ida y vuelta de los bytes, purga por ids vivos, y los fallos que hay que
 * distinguir de cara al usuario (sin IndexedDB, sin sitio).
 */

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _reiniciarBlobsParaTests,
  borrarBlob,
  ErrorDeBlobs,
  guardarBlob,
  hayAlmacenDeBlobs,
  idsDeBlobs,
  leerBlob,
  listarBlobs,
  ocupacionBlobs,
  purgarBlobs,
} from '../../lib/anejo/blobs';
import { bytesDe } from '../../lib/anejo/bytes';

function conIndexedDB(valor: unknown) {
  Object.defineProperty(globalThis, 'indexedDB', { value: valor, configurable: true, writable: true });
}

beforeEach(() => {
  _reiniciarBlobsParaTests();
  conIndexedDB(new IDBFactory());
});

afterEach(() => {
  _reiniciarBlobsParaTests();
});

const pdf = (texto: string, tipo = 'application/pdf') => new Blob([`%PDF-1.4 ${texto}`], { type: tipo });
const textoDe = async (b: Blob) => new TextDecoder().decode(await bytesDe(b));

describe('guardar, leer, borrar', () => {
  it('devuelve los mismos bytes y el mismo tipo', async () => {
    await guardarBlob('a', pdf('viga V-1'));
    const leido = await leerBlob('a');
    expect(leido).not.toBeNull();
    expect(leido!.type).toBe('application/pdf');
    expect(await textoDe(leido!)).toBe('%PDF-1.4 viga V-1');
  });

  it('un blob sin tipo vuelve como application/pdf', async () => {
    await guardarBlob('b', pdf('sin tipo', ''));
    expect((await leerBlob('b'))!.type).toBe('application/pdf');
  });

  it('un id que no existe devuelve null', async () => {
    expect(await leerBlob('no-existe')).toBeNull();
  });

  it('dos ids no se pisan, y guardar otra vez el mismo id lo sustituye', async () => {
    await guardarBlob('a', pdf('uno'));
    await guardarBlob('b', pdf('dos'));
    await guardarBlob('a', pdf('uno bis'));
    expect(await textoDe((await leerBlob('a'))!)).toBe('%PDF-1.4 uno bis');
    expect(await textoDe((await leerBlob('b'))!)).toBe('%PDF-1.4 dos');
    expect((await idsDeBlobs()).sort()).toEqual(['a', 'b']);
  });

  it('borrar quita el registro; borrar lo que no existe no falla', async () => {
    await guardarBlob('a', pdf('uno'));
    await borrarBlob('a');
    await borrarBlob('a');
    expect(await leerBlob('a')).toBeNull();
    expect(await idsDeBlobs()).toEqual([]);
  });

  it('la conexión se reabre sola después de soltarse', async () => {
    await guardarBlob('a', pdf('uno'));
    _reiniciarBlobsParaTests();
    expect(await textoDe((await leerBlob('a'))!)).toBe('%PDF-1.4 uno');
  });
});

describe('enumerar y purgar', () => {
  it('con el almacén vacío todo devuelve vacío sin fallar', async () => {
    expect(await idsDeBlobs()).toEqual([]);
    expect(await listarBlobs()).toEqual([]);
    expect(await ocupacionBlobs()).toBe(0);
    expect(await purgarBlobs(new Set())).toEqual([]);
  });

  it('listarBlobs da id, tamaño y fecha sin cargar nada más; ocupación es la suma', async () => {
    await guardarBlob('a', pdf('x'));
    await guardarBlob('b', pdf('xxxxxxxxxx'));
    const lista = (await listarBlobs()).sort((p, q) => p.id.localeCompare(q.id));
    expect(lista.map((b) => b.id)).toEqual(['a', 'b']);
    expect(lista[1].tamano - lista[0].tamano).toBe(9);
    for (const b of lista) expect(b.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await ocupacionBlobs()).toBe(lista[0].tamano + lista[1].tamano);
  });

  it('purgarBlobs borra sólo lo que no está en vivos y devuelve los borrados', async () => {
    await guardarBlob('vivo-1', pdf('1'));
    await guardarBlob('huerfano', pdf('2'));
    await guardarBlob('vivo-2', pdf('3'));
    const borrados = await purgarBlobs(new Set(['vivo-1', 'vivo-2', 'no-guardado']));
    expect(borrados).toEqual(['huerfano']);
    expect((await idsDeBlobs()).sort()).toEqual(['vivo-1', 'vivo-2']);
  });
});

describe('fallos con motivo', () => {
  it('sin indexedDB: ErrorDeBlobs con motivo sin-indexeddb, y hayAlmacenDeBlobs lo anticipa', async () => {
    conIndexedDB(undefined);
    expect(hayAlmacenDeBlobs()).toBe(false);
    const error = await guardarBlob('a', pdf('x')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeBlobs);
    expect((error as ErrorDeBlobs).motivo).toBe('sin-indexeddb');
    expect(await leerBlob('a').catch((e: ErrorDeBlobs) => e.motivo)).toBe('sin-indexeddb');
  });

  it('open que revienta (modo privado antiguo): sin-indexeddb', async () => {
    conIndexedDB({
      open() {
        throw new DOMException('privado', 'SecurityError');
      },
    });
    expect(hayAlmacenDeBlobs()).toBe(true);
    expect(await idsDeBlobs().catch((e: ErrorDeBlobs) => e.motivo)).toBe('sin-indexeddb');
  });

  it('open que falla en la petición (InvalidStateError de Firefox en privado): sin-indexeddb', async () => {
    conIndexedDB({
      open() {
        const peticion = { onsuccess: null as null | (() => void), onerror: null as null | (() => void), error: new DOMException('privado', 'InvalidStateError') };
        setTimeout(() => peticion.onerror?.(), 0);
        return peticion;
      },
    });
    expect(await idsDeBlobs().catch((e: ErrorDeBlobs) => e.motivo)).toBe('sin-indexeddb');
  });

  it('transacción abortada por QuotaExceededError: cuota', async () => {
    // Una IndexedDB de mentira que acepta el `put` y aborta la transacción al
    // comprometer, que es donde de verdad aparece la cuota llena.
    const tx = {
      error: null as DOMException | null,
      oncomplete: null as null | (() => void),
      onerror: null as null | (() => void),
      onabort: null as null | (() => void),
      objectStore: () => ({
        put() {
          setTimeout(() => {
            tx.error = new DOMException('lleno', 'QuotaExceededError');
            tx.onabort?.();
          }, 0);
          return {};
        },
      }),
    };
    const bd = { transaction: () => tx, onversionchange: null, onclose: null, close() {} };
    conIndexedDB({
      open() {
        const peticion = { onsuccess: null as null | (() => void), onupgradeneeded: null, onerror: null, onblocked: null, result: bd };
        setTimeout(() => peticion.onsuccess?.(), 0);
        return peticion;
      },
    });
    const error = await guardarBlob('a', pdf('x')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeBlobs);
    expect((error as ErrorDeBlobs).motivo).toBe('cuota');
  });

  it('cualquier otro fallo sale como ErrorDeBlobs con motivo error, nunca como DOMException suelto', async () => {
    conIndexedDB({
      open() {
        throw new DOMException('raro', 'UnknownError');
      },
    });
    const error = await idsDeBlobs().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeBlobs);
    expect((error as ErrorDeBlobs).motivo).toBe('error');
  });
});
