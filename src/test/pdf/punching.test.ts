// exportPunchingPDF — modo cruceta, integración con jsPDF real (jsdom).
//
// Foco: la política de Concreta de que el PDF NUNCA se gatea por validez del
// result (el usuario puede necesitar documentar un perfil que falla). Cubre el
// modo cruceta nuevo y verifica que los modos pilar/carga-puntual siguen
// exportando (no regresión).

import { describe, expect, it, beforeAll } from 'vitest';
import { exportPunchingPDF } from '../../lib/pdf/punching';
import { calcPunching } from '../../lib/calculations/punching';
import { punchingDefaults, type PunchingInputs } from '../../data/defaults';

const cru: PunchingInputs = { ...punchingDefaults, mode: 'pilar-cruceta' };

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:mock';
  }
});

describe('exportPunchingPDF — modo cruceta', () => {
  it('FTUX cruceta válido → PdfResult con blobUrl, filename y page count', async () => {
    const result = calcPunching(cru);
    expect(result.valid).toBe(true);

    const pdf = await exportPunchingPDF(cru, result);
    expect(pdf.blobUrl).toMatch(/^blob:/);
    expect(pdf.filename).toMatch(/\.pdf$/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('perfil UPN que FALLA sigue exportando sin tirar (PDF nunca deshabilitado)', async () => {
    // Política Concreta: el PDF nunca se gatea por validez. El usuario puede
    // necesitar documentar un caso no apto; el motor refleja el estado real.
    const inp = { ...cru, VEd: 900, upnSize: 160 };
    const result = calcPunching(inp);
    expect(result.valid).toBe(false);

    await expect(exportPunchingPDF(inp, result)).resolves.toMatchObject({
      blobUrl: expect.stringMatching(/^blob:/),
      filename: expect.stringMatching(/\.pdf$/),
    });
  });

  it('borde y esquina exportan (cabida del ala + perímetros de placa)', async () => {
    for (const inp of [
      { ...cru, position: 'borde' as const, edgeY: 500 },
      { ...cru, position: 'esquina' as const, edgeY: 500, edgeX: 500 },
    ]) {
      const result = calcPunching(inp);
      const pdf = await exportPunchingPDF(inp, result);
      expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('modos pilar y carga-puntual siguen exportando (no regresión)', async () => {
    for (const mode of ['pilar', 'carga-puntual'] as const) {
      const inp = { ...punchingDefaults, mode };
      const result = calcPunching(inp);
      const pdf = await exportPunchingPDF(inp, result);
      expect(pdf.blobUrl, `modo ${mode} no exportó`).toMatch(/^blob:/);
    }
  });
});
