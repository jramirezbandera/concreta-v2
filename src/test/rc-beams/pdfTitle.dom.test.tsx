// rc-beams — título de elemento en el PDF (nombre de archivo).
//
// Verifica que exportRCBeamsPDF construye el filename desde el título vía
// titledFilename, en modo pórtico Y simple (probando que la delegación :149
// reenvía el título), y que un título vacío cae al nombre por defecto con fecha.

import { describe, expect, it, beforeEach } from 'vitest';
import { calcRCBeam } from '../../lib/calculations/rcBeams';
import { exportRCBeamsPDF } from '../../lib/pdf/rcBeams';
import { rcBeamDefaults, type RCBeamInputs } from '../../data/defaults';

describe('exportRCBeamsPDF — título de elemento → filename', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('pórtico: el argumento title produce un filename slug', async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico' };
    const pdf = await exportRCBeamsPDF(inp, calcRCBeam(inp), 'si', 'Dintel de ventana');
    expect(pdf.filename).toBe('dintel-de-ventana.pdf');
  });

  it('simple: la delegación reenvía el título (filename slug, no el default simple)', async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'simple' };
    const pdf = await exportRCBeamsPDF(inp, calcRCBeam(inp), 'si', 'Zapata P3');
    expect(pdf.filename).toBe('zapata-p3.pdf');
  });

  it('título vacío → filename por defecto con fecha (pórtico)', async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico' };
    const pdf = await exportRCBeamsPDF(inp, calcRCBeam(inp), 'si', '');
    expect(pdf.filename).toMatch(/^concreta-viga-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('título vacío → filename por defecto con "simple" (modo simple)', async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'simple' };
    const pdf = await exportRCBeamsPDF(inp, calcRCBeam(inp), 'si', '');
    expect(pdf.filename).toMatch(/^concreta-viga-simple-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('sin argumento: usa el título persistido en inp.title', async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico', title: 'Viga 1' };
    const pdf = await exportRCBeamsPDF(inp, calcRCBeam(inp), 'si');
    expect(pdf.filename).toBe('viga-1.pdf');
  });

  it('solo símbolos → slug vacío → filename por defecto', async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico' };
    const pdf = await exportRCBeamsPDF(inp, calcRCBeam(inp), 'si', '/// ??? ///');
    expect(pdf.filename).toMatch(/^concreta-viga-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('el título no cambia el número de páginas ni rompe el render', async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico' };
    const pdf = await exportRCBeamsPDF(inp, calcRCBeam(inp), 'si', 'Viga de cuelgue forjado sanitario planta baja eje 3-C');
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
    expect(pdf.blobUrl).toMatch(/^blob:/);
  });
});
