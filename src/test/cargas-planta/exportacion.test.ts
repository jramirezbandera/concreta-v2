/**
 * Las dos exportaciones del módulo sobre el estado REAL (no sobre entradas del
 * motor a mano): el .docx y el .xlsx de verdad, empaquetados, por si la
 * librería cambiara lo que el plan promete. Los planes puros están en
 * `test/acciones/cuadrosCargas.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { defaultCargasState, evaluar, type CargasState } from '../../features/cargas-planta/state';
import { cuadroAccionesPlanoCargas, cuadroCargasMemoria, cuadroPredimensionado, seccionesCargasXlsx } from '../../lib/acciones/cuadrosCargas';
import { exportarCargasPlantaDocx } from '../../lib/docx/cargasPlanta';
import { documentoDeBloques } from '../../lib/docx/render';
import { exportarCargasPlantaXlsx } from '../../lib/xlsx/cargasPlanta';

/** Madrid con nieve en la cubierta y una piscina en planta baja. */
function madrid(): CargasState {
  const s = defaultCargasState();
  s.emplazamiento = { provincia: '28', municipio: 'Madrid', altitud: 660 };
  s.plantas[2].nieve = { modo: 'manual', valor: 0.56, tsPub: null, inePub: null, faldon: null };
  s.plantas[0].zonas.push({
    ...s.plantas[0].zonas[0],
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
    const piscina = ev.resultado.plantas[0].zonas[1];
    expect(piscina.rotulo).toBe('Planta Baja (Vaso piscina)');
    expect(piscina.forjado.pp).toBe(7.5);
    expect(piscina.G).toBe(23.5);
    const textos = JSON.stringify(plano);
    expect(textos).toContain('Peso propio losa maciza H=30 cm');
    expect(textos).toContain('"Nieve","0,56"');
  });
});
