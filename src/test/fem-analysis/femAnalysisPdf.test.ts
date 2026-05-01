// FEM 2D — PDF export smoke test
//
// Verifies that the PDF export function:
//   1. Returns a valid PdfResult shape (blobUrl, filename, pageCount).
//   2. Produces at least 2 pages for a multi-bar model (cover + per-bar).
//   3. Works even when the model has 'fail' verdict (memory rule: PDF never
//      disabled, engineers must be able to document non-compliant designs).
//   4. Filename includes today's date prefix.

import { describe, expect, it, beforeAll } from 'vitest';
import { exportFemAnalysisPDF } from '../../lib/pdf/femAnalysis';
import { cloneDesignPreset } from '../../features/fem-analysis/presets';
import { solveDesignModel } from '../../features/fem-analysis/solveDesignModel';

beforeAll(() => {
  // jsdom doesn't implement URL.createObjectURL by default
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:mock';
  }
});

describe('femAnalysis PDF export', () => {
  it('returns a valid PdfResult shape', async () => {
    const model = cloneDesignPreset('continuous');
    const result = solveDesignModel(model);
    const pdf = await exportFemAnalysisPDF(model, result);
    expect(pdf.blobUrl).toBeDefined();
    expect(typeof pdf.filename).toBe('string');
    expect(pdf.filename).toMatch(/^concreta-fem-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('produces at least 1 page per bar + 1 cover for continuous (3 bars)', async () => {
    const model = cloneDesignPreset('continuous');
    const result = solveDesignModel(model);
    const pdf = await exportFemAnalysisPDF(model, result);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(4); // 1 cover + 3 bars
  });

  it('exports cantilever (1 bar) → 2 pages (cover + 1 bar)', async () => {
    const model = cloneDesignPreset('cantilever');
    const result = solveDesignModel(model);
    const pdf = await exportFemAnalysisPDF(model, result);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(2);
  });

  it('exports even when bar has pending armado (no result)', async () => {
    const model = cloneDesignPreset('beam');
    // Strip armado to force pending status
    model.bars[0].vano_armado = undefined;
    model.bars[0].apoyo_armado = undefined;
    const result = solveDesignModel(model);
    expect(result.status).toBe('pending');
    const pdf = await exportFemAnalysisPDF(model, result);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(2);
  });

  it('exports even when model has invariant errors (e.g. no supports → fail)', async () => {
    const model = cloneDesignPreset('beam');
    model.supports = []; // triggers NO_SUPPORTS fail
    const result = solveDesignModel(model);
    expect(result.status).toBe('fail');
    const pdf = await exportFemAnalysisPDF(model, result);
    // PDF still produces — engineers may need it to document the broken state
    expect(pdf.blobUrl).toBeDefined();
  });
});
