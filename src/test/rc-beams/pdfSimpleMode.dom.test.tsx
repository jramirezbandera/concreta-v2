// rc-beams Chunk 5 — PDF export en modo simple.
//
// Smoke tests del pipeline exportRCBeamsPDF cuando inp.mode='simple':
//   - Devuelve un PdfResult válido (blobUrl + filename + pageCount)
//   - El filename contiene 'simple' para distinguir del portico PDF
//   - El blob no es vacío
//   - Mode='portico' sigue usando la ruta clásica (filename sin 'simple')
//
// No verificamos el render visual del SVG (svg2pdf necesita DOM real con SVGs
// inyectados, lo cual los tests E2E cubren). Aquí cubrimos que la rama
// simple-mode se invoca y produce output válido.

import { describe, expect, it, beforeEach } from 'vitest';
import { calcRCBeam } from '../../lib/calculations/rcBeams';
import { exportRCBeamsPDF } from '../../lib/pdf/rcBeams';
import { rcBeamDefaults, type RCBeamInputs } from '../../data/defaults';

describe('exportRCBeamsPDF — Chunk 5 simple-mode branch', () => {
  beforeEach(() => {
    // Limpiar DOM para evitar contaminación entre tests
    document.body.innerHTML = '';
  });

  it("mode='simple': filename contiene 'simple' y pageCount >= 1", async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'simple' };
    const result = calcRCBeam(inp);
    const pdf = await exportRCBeamsPDF(inp, result, 'si');
    expect(pdf.filename).toMatch(/simple/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
    expect(pdf.blobUrl).toMatch(/^blob:/);
  });

  it("mode='portico' (explícito): filename NO contiene 'simple'", async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico' };
    const result = calcRCBeam(inp);
    const pdf = await exportRCBeamsPDF(inp, result, 'si');
    expect(pdf.filename).not.toMatch(/simple/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("default rcBeamDefaults: filename SÍ contiene 'simple' (default actual)", async () => {
    const result = calcRCBeam(rcBeamDefaults);
    const pdf = await exportRCBeamsPDF(rcBeamDefaults, result, 'si');
    expect(pdf.filename).toMatch(/simple/);
  });

  it("mode='simple' con HSC (fck=70): export funciona sin crash", async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'simple', fck: 70 };
    const result = calcRCBeam(inp);
    const pdf = await exportRCBeamsPDF(inp, result, 'si');
    expect(pdf.filename).toMatch(/simple/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("mode='simple' con sección que NO resiste (Md > MRd): export funciona", async () => {
    const inp: RCBeamInputs = {
      ...rcBeamDefaults,
      mode: 'simple',
      vano_M_G: 500, vano_M_Q: 0,
      vano_Md: 500, // muy grande para forzar over-capacity
    };
    const result = calcRCBeam(inp);
    const pdf = await exportRCBeamsPDF(inp, result, 'si');
    expect(pdf.filename).toMatch(/simple/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("mode='simple' con sistema técnico (kg/cm²): export funciona", async () => {
    const inp: RCBeamInputs = { ...rcBeamDefaults, mode: 'simple' };
    const result = calcRCBeam(inp);
    const pdf = await exportRCBeamsPDF(inp, result, 'tecnico');
    expect(pdf.filename).toMatch(/simple/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });
});
