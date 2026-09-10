/**
 * Repintar el título de un PDF guardado (`lib/anejo/titulo`): el exportador
 * deja la geometría escrita dentro del propio PDF, el repintado la lee y
 * sustituye el renglón del título sin tocar nada de lo de abajo, y se niega
 * —en vez de dejar un trozo del nombre viejo asomando— cuando no puede taparlo
 * entero o cuando el PDF no lleva la marca.
 */

import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { geometriaDe, repintarTitulo } from '../../lib/anejo/titulo';
import { crearPdf } from '../../lib/pdf/fuente';
import { drawElementTitle, drawHeader } from '../../lib/pdf/utils';

const bytesDe = (doc: { output: (t: 'arraybuffer') => ArrayBuffer }) => new Uint8Array(doc.output('arraybuffer'));

/** Un PDF como los de los 16 módulos que pasan por `drawElementTitle`. */
async function conTitulo(titulo: string, m = 20): Promise<Uint8Array> {
  const doc = await crearPdf();
  drawElementTitle(doc, titulo, 'Concreta - Vigas de hormigón', m);
  return bytesDe(doc);
}

/** Y uno de los que llevan «Motor v… · Inputs …» en la misma línea. */
async function conMotor(titulo: string, m = 18): Promise<Uint8Array> {
  const doc = await crearPdf();
  drawHeader(doc, { title: 'Concreta — Micropilotes', elementTitle: titulo, engineVersion: '2.0.0', inputsHash: 'a1b2c3d4' }, m);
  return bytesDe(doc);
}

const abrir = (bytes: Uint8Array) => PDFDocument.load(bytes, { updateMetadata: false });

describe('la marca que el PDF lleva dentro', () => {
  it('la escribe el exportador con su margen, y dice si hay bloque de motor a la derecha', async () => {
    expect((await abrir(await conTitulo('Viga V-3'))).getKeywords()).toBe('concreta-titulo=20');
    expect((await abrir(await conTitulo('Viga V-3', 15))).getKeywords()).toBe('concreta-titulo=15');
    expect((await abrir(await conMotor('MP-1'))).getKeywords()).toBe('concreta-titulo=18,motor');
  });

  it('sin título no se escribe: no hay banda que repintar y el Info dict se queda como estaba', async () => {
    const doc = await crearPdf();
    drawElementTitle(doc, '', 'Concreta - Vigas de hormigón', 20);
    expect((await abrir(bytesDe(doc))).getKeywords()).toBeUndefined();
  });

  it('se lee lo que se escribió, y lo que no es la marca no cuela', () => {
    expect(geometriaDe('concreta-titulo=20')).toEqual({ m: 20, conMotor: false });
    expect(geometriaDe('concreta-titulo=18,motor')).toEqual({ m: 18, conMotor: true });
    expect(geometriaDe(undefined)).toBeNull();
    expect(geometriaDe('vigas, hormigón')).toBeNull();
    expect(geometriaDe('concreta-titulo=0')).toBeNull();
  });
});

describe('el repintado', () => {
  it('cambia el título de la página y el de los metadatos, y no añade páginas', async () => {
    const r = await repintarTitulo(await conTitulo('Viga V-3'), 'Viga V-4 del pórtico 2', 'Viga V-3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = await abrir(r.bytes);
    expect(doc.getTitle()).toBe('Viga V-4 del pórtico 2');
    expect(doc.getPageCount()).toBe(1);
    // La estampa entra como XObject de la primera página: es lo que tapa el
    // renglón viejo y escribe el nuevo encima.
    expect(doc.getPage(0).node.Resources()?.get(PDFName.of('XObject'))).toBeDefined();
  });

  it('funciona igual en los que llevan el bloque de motor', async () => {
    const r = await repintarTitulo(await conMotor('MP-1'), 'MP-2', 'MP-1');
    expect(r.ok).toBe(true);
  });

  it('el título viejo se BORRA de la capa de texto, no se queda tapado', async () => {
    const r = await repintarTitulo(await conTitulo('Viga V-3'), 'Viga V-4', 'Viga V-3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Con la fuente en subconjunto el texto del PDF son números de glifo, no
    // letras: buscar «Viga V-3» ahí dentro no encontraría nada. Lo que se
    // comprueba es que el bloque que lo escribía —cuerpo 14 en la línea base del
    // título— ha desaparecido del contenido de la página. El nuevo no cuenta
    // aquí: va dentro de la estampa, que es un objeto aparte.
    expect(bloquesDeTitulo(await abrir(await conTitulo('Viga V-3')))).toBe(1);
    expect(bloquesDeTitulo(await abrir(r.bytes))).toBe(0);
  });

  it('un PDF sin la marca no se repinta', async () => {
    const doc = await crearPdf();
    drawElementTitle(doc, '', 'Concreta - Vigas de hormigón', 20);
    expect(await repintarTitulo(bytesDe(doc), 'Viga V-4', '')).toEqual({ ok: false, motivo: 'sin-marca' });
  });

  it('si el nombre anterior no cabe en la banda, no se repinta: peor que no hacerlo es dejar medio nombre viejo', async () => {
    const largo = 'Micropilote MP-1 del encepado de la esquina noroeste, hipótesis con viento';
    expect(await repintarTitulo(await conMotor(largo), 'MP-2', largo)).toEqual({ ok: false, motivo: 'no-cabe' });
  });
});

/**
 * Cuántos bloques de texto de cuerpo 14 quedan en la línea base del título
 * dentro del CONTENIDO de la primera página. Uno antes de repintar (el
 * original) y cero después: si quedara uno, el nombre viejo seguiría ahí debajo
 * de la banda, invisible pero seleccionable y buscable.
 */
function bloquesDeTitulo(doc: PDFDocument): number {
  const pagina = doc.getPage(0);
  const y = pagina.getSize().height - 20 * (pagina.getSize().width / 210);
  let n = 0;
  for (const ref of pagina.node.Contents() instanceof PDFArray
    ? (pagina.node.Contents() as PDFArray).asArray()
    : [pagina.node.get(PDFName.of('Contents'))]) {
    const flujo = ref && doc.context.lookup(ref);
    if (!(flujo instanceof PDFRawStream)) continue;
    const texto = new TextDecoder('latin1').decode(decodePDFRawStream(flujo).decode());
    for (const bloque of texto.split('BT').slice(1)) {
      const td = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Td/.exec(bloque);
      const tf = /\/\w+\s+(\d+(?:\.\d+)?)\s+Tf/.exec(bloque);
      if (td && tf && Math.abs(Number(tf[1]) - 14) < 0.01 && Math.abs(Number(td[2]) - y) < 0.6) n++;
    }
  }
  return n;
}
