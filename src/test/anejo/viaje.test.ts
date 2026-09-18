/**
 * Los PDF del anejo viajan dentro del `.concreta`: se exportan con la obra y
 * al leer el fichero vuelven a IndexedDB, que es lo que hace que una obra
 * reimportada no aparezca con todo el anejo en rojo.
 *
 * Y lo que NO tiene que pasar: que los bytes acaben en el proyecto que se
 * guarda en el navegador (ahí la cuota es de megabytes contados), ni que un
 * fichero sin PDF —los de antes de esto— deje de leerse.
 */

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLAVE_ANEJO } from '../../lib/anejo';
import { _reiniciarBlobsParaTests, guardarBlob, idsDeBlobs, leerBlob } from '../../lib/anejo/blobs';
import { pdfsDelFichero, pdfsParaViajar, recuperarPdfs } from '../../lib/anejo/viaje';
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

describe('los PDF del anejo dentro del .concreta', () => {
  it('ida y vuelta: el PDF sale con la obra y entra al leer el fichero', async () => {
    await guardarBlob('b1', PDF());
    localStorage.setItem(CLAVE_ANEJO, indiceCon('b1'));
    const proyecto = serializar('11111111-1111-4111-8111-111111111111');

    const equipaje = await pdfsParaViajar(proyecto.claves);
    expect(Object.keys(equipaje.pdfs)).toEqual(['b1']);
    expect(equipaje).toMatchObject({ cuantos: 1, fuera: 0 });

    const texto = textoDeExportacion(proyecto, equipaje.pdfs);
    // Al final del todo: lo legible del fichero se queda arriba.
    expect(texto.indexOf('"pdfs"')).toBeGreaterThan(texto.indexOf('"claves"'));

    // Otra máquina: el mismo fichero, sin nada en IndexedDB.
    _reiniciarBlobsParaTests();
    Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
    expect(await idsDeBlobs()).toEqual([]);

    const leido = await leerFicheroDeProyecto(ficheroCon(texto));
    expect(leido.id).toBe(proyecto.id);
    expect(await idsDeBlobs()).toEqual(['b1']);
    const vuelto = await leerBlob('b1');
    expect(await vuelto?.text()).toBe('%PDF-1.4 una viga');
  });

  it('el proyecto que se lee del fichero NO lleva los bytes dentro', async () => {
    await guardarBlob('b1', PDF());
    localStorage.setItem(CLAVE_ANEJO, indiceCon('b1'));
    const proyecto = serializar('22222222-2222-4222-8222-222222222222');
    const texto = textoDeExportacion(proyecto, (await pdfsParaViajar(proyecto.claves)).pdfs);

    const leido: ProyectoFile = await leerFicheroDeProyecto(ficheroCon(texto));
    expect('pdfs' in leido).toBe(false);
    expect(JSON.stringify(leido)).not.toContain('JVBERi');
  });

  it('un fichero de los de antes, sin bloque de PDF, se lee igual', async () => {
    const proyecto = serializar('33333333-3333-4333-8333-333333333333');
    const texto = textoDeExportacion(proyecto);
    expect(texto).not.toContain('"pdfs"');
    const leido = await leerFicheroDeProyecto(ficheroCon(texto));
    expect(leido.id).toBe(proyecto.id);
    expect(await idsDeBlobs()).toEqual([]);
  });

  it('sin el PDF en esta máquina se exporta lo que hay, sin bloque', async () => {
    localStorage.setItem(CLAVE_ANEJO, indiceCon('fantasma'));
    const proyecto = serializar('44444444-4444-4444-8444-444444444444');
    expect((await pdfsParaViajar(proyecto.claves)).pdfs).toEqual({});
    expect(textoDeExportacion(proyecto, {})).not.toContain('"pdfs"');
  });

  it('lo que no cabe en el tope se queda, y se dice cuántos', async () => {
    // Dos PDF de 30 MB: el primero entra y el segundo ya no cabe.
    const gordo = new Blob(['x'.repeat(30 * 1024 * 1024)], { type: 'application/pdf' });
    await guardarBlob('b1', gordo);
    await guardarBlob('b2', gordo);
    localStorage.setItem(
      CLAVE_ANEJO,
      JSON.stringify({ v: 1, piezas: [JSON.parse(indiceCon('b1')).piezas[0], { ...JSON.parse(indiceCon('b2')).piezas[0], id: 'p2' }] }),
    );
    const proyecto = serializar('55555555-5555-4555-8555-555555555555');
    const equipaje = await pdfsParaViajar(proyecto.claves);
    expect(Object.keys(equipaje.pdfs)).toEqual(['b1']);
    expect(equipaje.fuera).toBe(1);
  }, 30_000);

  it('un bloque de PDF con basura no rompe la lectura', async () => {
    expect(pdfsDelFichero({ pdfs: 'no es un diccionario' })).toBeNull();
    expect(pdfsDelFichero({ pdfs: { b1: 7 } })).toBeNull();
    // Base64 inválido: se salta esa pieza y las demás entran.
    const resumen = await recuperarPdfs({ malo: '!!!no-base64!!!', bueno: btoa('%PDF-1.4 ok') });
    expect(resumen.cuantos).toBe(1);
    expect(await idsDeBlobs()).toEqual(['bueno']);
  });
});
