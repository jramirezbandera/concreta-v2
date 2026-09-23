/**
 * El `.concreta` ya NO lleva los PDF dentro: lleva los datos de cada pieza, y
 * el papel lo rehace la máquina que abre la obra. Lo que se vigila aquí es que
 * el fichero salga limpio —pesa lo que pesa un texto— y que los de aquellos
 * días, que sí los traían, se sigan leyendo: sus PDF vuelven a IndexedDB y esa
 * obra no tiene nada que reconstruir.
 */

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLAVE_ANEJO } from '../../lib/anejo';
import { _reiniciarBlobsParaTests, guardarBlob, idsDeBlobs, leerBlob } from '../../lib/anejo/blobs';
import { pdfsDelFichero, recuperarPdfs } from '../../lib/anejo/viaje';
import { leerFicheroDeProyecto, textoDeExportacion } from '../../lib/proyecto/fichero';
import { serializar, _reiniciarProyectoParaTests, type ProyectoFile } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

const PDF = () => new Blob(['%PDF-1.4 una viga'], { type: 'application/pdf' });

/** Un índice de anejo con una pieza, tal como viaja en la clave del proyecto. */
function indiceCon(blobId: string): string {
  return JSON.stringify({
    v: 1,
    piezas: [
      {
        id: 'p1',
        modulo: 'concreta-rc-beams',
        clave: 'rc-beams',
        titulo: 'V-3',
        ts: '2026-09-18T10:00:00.000Z',
        esquema: '1',
        blobId,
        paginas: 2,
        huella: 'abc',
        datos: { 'rc-beams': '{}' },
        tituloEnPdf: true,
        incluida: true,
      },
    ],
  });
}

/** El `File` que devolvería el `<input type="file">`. */
function ficheroCon(texto: string): File {
  const f = new Blob([texto], { type: 'application/json' }) as Blob & { name: string };
  f.name = 'obra.concreta.json';
  return f as File;
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  _reiniciarBlobsParaTests();
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
});

afterEach(() => {
  _reiniciarBlobsParaTests();
});

describe('el .concreta y los PDF del anejo', () => {
  it('el fichero exportado no lleva los PDF, aunque estén en esta máquina', async () => {
    await guardarBlob('b1', PDF());
    localStorage.setItem(CLAVE_ANEJO, indiceCon('b1'));
    const proyecto = serializar('11111111-1111-4111-8111-111111111111');

    const texto = textoDeExportacion(proyecto);
    expect(texto).not.toContain('"pdfs"');
    // Los DATOS de la pieza sí: son con lo que se rehace el PDF al abrirla.
    expect(texto).toContain('blobId');
    expect(texto).toContain('datos');
    // Y pesa lo que pesa un texto: ni rastro de una cabecera de PDF en base64.
    expect(texto).not.toContain('JVBERi');

    const leido = await leerFicheroDeProyecto(ficheroCon(texto));
    expect(leido.id).toBe(proyecto.id);
  });

  it('un fichero de los que sí los traían dentro los devuelve a IndexedDB', async () => {
    const proyecto = serializar('22222222-2222-4222-8222-222222222222');
    // Tal cual lo escribía la app entre el 18 y el 23 de septiembre de 2026.
    const texto = JSON.stringify({ ...proyecto, pdfs: { b1: btoa('%PDF-1.4 una viga') } }, null, 2);

    expect(await idsDeBlobs()).toEqual([]);
    const leido: ProyectoFile = await leerFicheroDeProyecto(ficheroCon(texto));
    expect(leido.id).toBe(proyecto.id);
    expect(await idsDeBlobs()).toEqual(['b1']);
    expect(await (await leerBlob('b1'))?.text()).toBe('%PDF-1.4 una viga');

    // Y el proyecto que se abre no arrastra los bytes: la cuota del navegador
    // se mide en megabytes contados.
    expect('pdfs' in leido).toBe(false);
    expect(JSON.stringify(leido)).not.toContain('JVBERi');
  });

  it('un bloque de PDF con basura no rompe la lectura', async () => {
    expect(pdfsDelFichero({ pdfs: 'no es un diccionario' })).toBeNull();
    expect(pdfsDelFichero({ pdfs: { b1: 7 } })).toBeNull();
    // Base64 inválido: se salta esa pieza y las demás entran.
    const resumen = await recuperarPdfs({ malo: '!!!no-base64!!!', bueno: btoa('%PDF-1.4 ok') });
    expect(resumen.cuantos).toBe(1);
    expect(await idsDeBlobs()).toEqual(['bueno']);
  });
});
