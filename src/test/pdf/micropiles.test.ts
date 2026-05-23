// exportMicropilesPDF — integration con jsPDF real (jsdom).
//
// Cubre la forma del PdfResult, que el motor calcula primero (no se llama
// al PDF con un result vacío), y comportamiento bajo casos límite:
//   · FTUX default → PDF con blobUrl, filename y page count > 0.
//   · effort='tension' (incluye fila pullout) → PDF sin crash.
//   · Result invalid (cota apoyo ≥ cabeza) → PDF sigue exportando sin tirar
//     (el caller puede pasar un result inválido si el usuario insiste en
//     descargar; el motor lo refleja con valid=false en el cuerpo).
//   · Soil con 1 estrato y soil con muchos estratos no rompe la salida.

import { describe, expect, it, beforeAll } from 'vitest';
import { exportMicropilesPDF } from '../../lib/pdf/micropiles';
import { calcMicropiles } from '../../lib/calculations/micropiles';
import { micropilesDefaults, micropilesSoilDefaults, type SoilLayer } from '../../data/defaults';

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:mock';
  }
});

describe('exportMicropilesPDF', () => {
  it('devuelve un PdfResult válido con el FTUX por defecto', async () => {
    const result = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
    expect(result.valid).toBe(true);

    const pdf = await exportMicropilesPDF(micropilesDefaults, micropilesSoilDefaults, result);
    expect(pdf.blobUrl).toMatch(/^blob:/);
    expect(pdf.filename).toMatch(/\.pdf$/);
    expect(pdf.filename).toMatch(/micropil/i);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('effort="tension" se exporta sin crash (incluye pullout en checks)', async () => {
    const inp = { ...micropilesDefaults, effort: 'tension' as const };
    const result = calcMicropiles(inp, micropilesSoilDefaults);
    expect(result.valid).toBe(true);
    expect(result.checks.some((c) => c.id === 'pullout')).toBe(true);

    const pdf = await exportMicropilesPDF(inp, micropilesSoilDefaults, result);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('un solo estrato (suelo trivial) no rompe el PDF', async () => {
    const soil: SoilLayer[] = [
      { id: 1, type: 'cohesive', thickness: 25, gamma: 20, c: 50, phi: 25, Nspt: 20, su: 100, rflim: 0.15 },
    ];
    const result = calcMicropiles(micropilesDefaults, soil);
    expect(result.valid).toBe(true);

    const pdf = await exportMicropilesPDF(micropilesDefaults, soil, result);
    expect(pdf.blobUrl).toMatch(/^blob:/);
  });

  it('perfil con 10 estratos no trunca y no crashea', async () => {
    const soil: SoilLayer[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      type: i % 2 === 0 ? 'granular' as const : 'cohesive' as const,
      thickness: 2,
      gamma: 19 + i * 0.2,
      c: i % 2 === 0 ? 0 : 20 + i * 5,
      phi: 22 + i,
      Nspt: 10 + i * 3,
      su: i % 2 === 0 ? 0 : 50 + i * 10,
      rflim: 0.05 + i * 0.02,
    }));
    const result = calcMicropiles(micropilesDefaults, soil);
    expect(result.valid).toBe(true);

    const pdf = await exportMicropilesPDF(micropilesDefaults, soil, result);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('un result INVALID (cota apoyo = cabeza) sigue exportando sin tirar', async () => {
    // Política de Concreta: el PDF NUNCA se gatea por validez del result.
    // El usuario puede necesitar el PDF para documentar un perfil
    // problemático. El motor refleja el estado real en el cuerpo del doc.
    const badInp = { ...micropilesDefaults, toeDepth: micropilesDefaults.topDepth };
    const result = calcMicropiles(badInp, micropilesSoilDefaults);
    expect(result.valid).toBe(false);

    await expect(
      exportMicropilesPDF(badInp, micropilesSoilDefaults, result),
    ).resolves.toMatchObject({
      blobUrl: expect.stringMatching(/^blob:/),
      filename: expect.stringMatching(/\.pdf$/),
    });
  });

  it('blobUrl y filename son strings no vacíos', async () => {
    const result = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
    const pdf = await exportMicropilesPDF(micropilesDefaults, micropilesSoilDefaults, result);
    expect(typeof pdf.blobUrl).toBe('string');
    expect(pdf.blobUrl.length).toBeGreaterThan(0);
    expect(typeof pdf.filename).toBe('string');
    expect(pdf.filename.length).toBeGreaterThan(0);
  });
});
