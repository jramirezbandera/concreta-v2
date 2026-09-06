/**
 * Las cuatro exportaciones del módulo sobre el estado REAL (no sobre entradas
 * del motor a mano): el .docx, el .xlsx, el .pdf y el .dxf de verdad, cada uno
 * con su empaquetado, por si la librería —o el dibujo escrito a mano— cambiara
 * lo que el plan promete. Los planes puros están en
 * `test/acciones/cuadrosCargas.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { defaultCargasState, evaluar, type CargasState } from '../../features/cargas-planta/state';
import { cuadroAccionesPlanoCargas, cuadroCargasMemoria, cuadroPredimensionado, seccionesCargasXlsx } from '../../lib/acciones/cuadrosCargas';
import { exportarCargasPlantaDocx } from '../../lib/docx/cargasPlanta';
import { documentoDeBloques } from '../../lib/docx/render';
import { exportarCargasPlantaDxf } from '../../lib/dxf/cargasPlanta';
import { dibujarBloques } from '../../lib/pdf/bloques';
import { exportarCargasPlantaPdf } from '../../lib/pdf/cargasPlanta';
import { crearPdf } from '../../lib/pdf/fuente';
import { PAGE_W } from '../../lib/pdf/utils';
import { exportarCargasPlantaXlsx } from '../../lib/xlsx/cargasPlanta';

/** El margen de página del exportador: hay que medir con el suyo, no con otro. */
const M = 18;

/** La planta por su nombre: el orden del arranque es cosa de los catálogos. */
const planta = (s: CargasState, nombre: string) => s.plantas.find((p) => p.nombre === nombre)!;

/** Madrid con nieve en la cubierta y una piscina en planta baja. */
function madrid(): CargasState {
  const s = defaultCargasState();
  s.emplazamiento = { provincia: '28', municipio: 'Madrid', altitud: 660 };
  planta(s, 'Cubierta').nieve = { modo: 'manual', valor: 0.56, tsPub: null, inePub: null, faldon: null };
  const baja = planta(s, 'Planta Baja');
  baja.zonas.push({
    ...baja.zonas[0],
    id: 'piscina',
    nombre: 'Vaso piscina',
    forjado: { tipo: 'losa', canto: 30, ppManual: null },
    permanentes: [{ id: 'agua', concepto: 'Agua (1,6 m)', valor: 16, catalogoId: 'agua', espesor: 1.6 }],
  });
  return s;
}

function cuadros(state = madrid()) {
  const ev = evaluar(state, null);
  return {
    ev,
    memoria: cuadroCargasMemoria(ev.resultado),
    plano: cuadroAccionesPlanoCargas(ev.resultado, { zonaEolica: 'A', vb: 26, aspereza: 'IV' }, null),
    predim: cuadroPredimensionado(ev.resultado),
  };
}

describe('ficheros de verdad', () => {
  it('el .docx se empaqueta y dentro dice cargas por planta, el peso propio con su canto, la piscina, ψ y kN/m²', async () => {
    const b64 = await Packer.toBase64String(documentoDeBloques(cuadros().memoria, { titulo: 'Madrid' }));
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('CARGAS POR PLANTA');
    expect(xml).toContain('Peso propio forjado reticular h = 30 cm');
    expect(xml).toContain('Peso propio losa maciza h = 30 cm');
    expect(xml).toContain('Planta Baja (Vaso piscina)');
    expect(xml).toContain('TOTAL');
    expect(xml).toContain('ψ0');
    expect(xml).toContain('kN/m²');
    expect(xml).toContain('γG = 1,35');
  });

  it('las entradas perezosas devuelven blob y nombre de fichero con la extensión que toca', async () => {
    const { memoria, plano, predim } = cuadros();
    const docx = await exportarCargasPlantaDocx(memoria, 'Edificio en Madrid');
    expect(docx.filename).toBe('edificio-en-madrid.docx');
    expect(docx.blob.size).toBeGreaterThan(1000);
    const xlsx = await exportarCargasPlantaXlsx(seccionesCargasXlsx(plano, predim));
    expect(xlsx.filename).toBe('cargas-por-planta.xlsx');
    expect(xlsx.blob.size).toBeGreaterThan(1000);
    const zip = await JSZip.loadAsync(await xlsx.blob.arrayBuffer());
    expect(Object.keys(zip.files).filter((f) => f.startsWith('xl/worksheets/sheet'))).toHaveLength(4);
    const libro = await zip.file('xl/workbook.xml')!.async('string');
    for (const nombre of ['Cargas por planta', 'Cargas lineales', 'Predimensionado', 'Acciones horizontales']) expect(libro).toContain(`name="${nombre}"`);
  });

  it('el estado real llega al cuadro: la piscina con 16 de agua y la cubierta con nieve', () => {
    const { ev, plano } = cuadros();
    expect(ev.errores).toBe(0);
    const piscina = ev.resultado.plantas.find((p) => p.nombre === 'Planta Baja')!.zonas[1];
    expect(piscina.rotulo).toBe('Planta Baja (Vaso piscina)');
    expect(piscina.forjado.pp).toBe(7.5);
    expect(piscina.G).toBe(23.5);
    const textos = JSON.stringify(plano);
    expect(textos).toContain('Peso propio losa maciza H=30 cm');
    expect(textos).toContain('"Nieve","0,56"');
  });
});

/** Los bytes de un blob como texto de un byte por carácter, que es como sale el DXF. */
async function bytes(blob: Blob): Promise<string> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()), (b) => String.fromCharCode(b)).join('');
}

describe('el papel y el CAD', () => {
  it('el PDF sale con el nombre del título y es un PDF de verdad', async () => {
    const r = await exportarCargasPlantaPdf(cuadros().memoria, 'Edificio en Madrid');
    expect(r.filename).toBe('edificio-en-madrid.pdf');
    expect(r.blob.type).toBe('application/pdf');
    expect(String.fromCharCode(...new Uint8Array(await r.blob.slice(0, 5).arrayBuffer()))).toBe('%PDF-');
  });

  it('en el PDF ningún texto se sale de la caja de la página, ni se trunca, ni pierde un glifo', async () => {
    // Lo mismo que vigila `materiales/pdfBloques.dom.test.ts`, sobre los
    // bloques de ESTE módulo: la fila del uso es larga («Sobrecarga de uso
    // (A1 — viviendas…, escaleras +1, tabla 3.1)») y comparte tabla con una
    // columna de números.
    const doc = await crearPdf();
    const escritos: { texto: string; x: number; ancho: number }[] = [];
    const orig = doc.text.bind(doc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc.text = ((t: any, x: number, y: number, opts?: any) => {
      for (const linea of Array.isArray(t) ? t : [String(t)]) escritos.push({ texto: linea, x, ancho: doc.getTextWidth(linea) });
      return orig(t, x, y, opts);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    dibujarBloques(doc, cuadros().memoria, { M, y: 30 });

    expect(escritos.length).toBeGreaterThan(20);
    for (const e of escritos) {
      expect(e.x, e.texto).toBeGreaterThanOrEqual(M - 0.01);
      expect(e.x + e.ancho, e.texto).toBeLessThanOrEqual(PAGE_W - M + 0.01);
    }
    const todo = escritos.map((e) => e.texto).join(' ');
    expect(todo).not.toContain('...');
    expect(todo).not.toContain('?');
    // Los símbolos del cuadro llegan enteros: es lo que da la fuente embebida.
    expect(todo).toContain('kN/m²');
    expect(todo).toContain('ψ0');
    expect(todo).toContain('γG = 1,35');
  });

  it('el DXF trae el cuadro del plano entero, en cp1252 y cerrado en EOF', async () => {
    const r = await exportarCargasPlantaDxf(cuadros().plano);
    expect(r.filename).toBe('cargas-por-planta.dxf');
    expect(r.blob.type).toBe('image/vnd.dxf');

    const dxf = await bytes(r.blob);
    // Un byte por carácter: «SEGÚN» con su Ú (0xDA en cp1252), no dos bytes.
    expect(dxf).toContain('ACCIONES GRAVITATORIAS (SEGÚN DB SE-AE)');
    expect(dxf).toContain('Peso propio reticular H=30 cm');
    expect(dxf).toContain('ACCIONES HORIZONTALES');
    expect(dxf).toContain('Zona eólica');
    // Gd/Qd/qd son papel de trabajo del Excel: no se rotulan en un plano.
    expect(dxf).not.toContain('PREDIMENSIONADO');
    // Pares código/valor completos: un salto de más y el CAD abre un dibujo
    // vacío sin decir por qué.
    const L = dxf.split('\r\n');
    L.pop();
    expect(L.length % 2).toBe(0);
    expect(L.slice(-2)).toEqual(['0', 'EOF']);
  });

  it('con título, los dos toman su nombre; sin él, el del módulo', async () => {
    const { memoria, plano } = cuadros();
    expect((await exportarCargasPlantaDxf(plano, 'Edificio en Madrid')).filename).toBe('edificio-en-madrid.dxf');
    expect((await exportarCargasPlantaPdf(memoria)).filename).toBe('cargas-por-planta.pdf');
  });
});
