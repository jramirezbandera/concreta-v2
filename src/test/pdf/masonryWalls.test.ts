// Integration tests for the masonry-walls PDF exporter.
//
// Strategy: drive `exportMasonryWallsPDF` end-to-end with real jsPDF (jsdom
// environment via vitest) and assert structural invariants from PdfResult
// + recomputed engine state.
//
// What this verifies:
//   - Multi-page structure scales with #plantas (no silent truncation).
//   - Page count follows: 1 cover + 1 datos + 1 governing + N appendix + 1 anexo.
//   - Invalid state short-circuits to 1 page.
//   - Filename + blobUrl shape stays stable.
//   - Edge cases (no huecos, 20 plantas, técnico units) don't throw.
//   - Re-exporting the same state yields the same inputsFingerprint.

import { describe, expect, it, beforeAll } from 'vitest';
import { exportMasonryWallsPDF } from '../../lib/pdf/masonryWalls';
import {
  calcularEdificio,
  defaultMasonryState,
  getCriticoEdificio,
  overallStatus,
  plantaTemplate,
  type MasonryWallState,
  type EdificioInvalid,
  type PlantaResult,
} from '../../lib/calculations/masonryWalls';
import { inputsFingerprint } from '../../lib/pdf/utils';

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:mock';
  }
});

/** Run the engine + collect everything the PDF needs. Mirrors what the
 *  component does before calling export. */
function compute(state: MasonryWallState) {
  const r = calcularEdificio(state);
  if (r.invalid !== false) {
    return { plantasCalc: [] as PlantaResult[], critico: null, overall: { v: 'fail' as const, label: 'INCUMPLE', eta: 1 }, invalid: r as EdificioInvalid };
  }
  return {
    plantasCalc: r.plantas,
    critico: getCriticoEdificio(r.plantas),
    overall: overallStatus(r.plantas),
    invalid: null,
  };
}

describe('exportMasonryWallsPDF', () => {
  it('returns valid PdfResult shape for default state (4 plantas)', async () => {
    const state = defaultMasonryState();
    const c = compute(state);
    const pdf = await exportMasonryWallsPDF({ state, ...c, system: 'si' });
    expect(pdf.blobUrl).toMatch(/^blob:/);
    expect(pdf.filename).toMatch(/^muros-fabrica-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('produces the documented page structure: 1 cover + 1 datos + 1 governing + N appendix + 1 anexo', async () => {
    // Default state has 4 plantas → 1 + 1 + 1 + 4 + 1 = 8 pages.
    const state = defaultMasonryState();
    const c = compute(state);
    const pdf = await exportMasonryWallsPDF({ state, ...c, system: 'si' });
    expect(pdf.pageCount).toBe(1 + 1 + 1 + state.plantas.length + 1);
  });

  it('scales monotonically: more plantas → more pages, no truncation', async () => {
    const make = (n: number): MasonryWallState => {
      const plantas = [
        plantaTemplate(0, false),
        ...Array.from({ length: n - 2 }, (_, i) => plantaTemplate(i + 1, false)),
        plantaTemplate(n - 1, true),
      ];
      return { ...defaultMasonryState(), plantas };
    };
    const small = await exportMasonryWallsPDF({ state: make(2), ...compute(make(2)), system: 'si' });
    const med = await exportMasonryWallsPDF({ state: make(8), ...compute(make(8)), system: 'si' });
    const big = await exportMasonryWallsPDF({ state: make(20), ...compute(make(20)), system: 'si' });
    expect(small.pageCount).toBeLessThan(med.pageCount);
    expect(med.pageCount).toBeLessThan(big.pageCount);
    // INVARIANTE: nunca truncar. Lower bound: 1 cover + 1 datos + 1 governing
    // + N appendix + 1 anexo = N + 4. La governing-page puede desbordar a
    // más páginas si hay muchas plantas (cada bloque ~56mm; ~4 por A4
    // portrait); ese overflow es BUENO — ensureSpace nunca trunca. La
    // assertion solo garantiza el suelo, no el techo.
    expect(big.pageCount).toBeGreaterThanOrEqual(20 + 4);
  });

  it('invalid state short-circuits to 1 page with banner (legal-safe single page)', async () => {
    // Force invalid: spessore demasiado fino
    const state: MasonryWallState = { ...defaultMasonryState(), t: 30 };
    const c = compute(state);
    expect(c.invalid).not.toBeNull();
    const pdf = await exportMasonryWallsPDF({ state, ...c, system: 'si' });
    expect(pdf.pageCount).toBe(1);
  });

  it('handles cubierta sin huecos (typical roof) without throwing', async () => {
    // defaultMasonryState ya tiene cubierta sin huecos en el slot 3 (esCubierta=true).
    const state = defaultMasonryState();
    const c = compute(state);
    expect(state.plantas[state.plantas.length - 1].huecos.length).toBe(0);
    const pdf = await exportMasonryWallsPDF({ state, ...c, system: 'si' });
    expect(pdf.pageCount).toBeGreaterThanOrEqual(5);
  });

  it('técnico unit system does not throw and still produces multi-page', async () => {
    const state = defaultMasonryState();
    const c = compute(state);
    const pdf = await exportMasonryWallsPDF({ state, ...c, system: 'tecnico' });
    expect(pdf.pageCount).toBeGreaterThanOrEqual(5);
  });

  it('renders project metadata when set (does not throw)', async () => {
    const state: MasonryWallState = {
      ...defaultMasonryState(),
      proyecto: 'Rehabilitación Calle Mayor 23',
      expediente: 'EXP-2026-0042',
      autor: 'Javier Ramírez Bandera, ICCP',
      fechaProyecto: '2026-05-23',
    };
    const c = compute(state);
    const pdf = await exportMasonryWallsPDF({ state, ...c, system: 'si' });
    expect(pdf.pageCount).toBeGreaterThanOrEqual(5);
  });

  it('renders without metadata (prints "Sin especificar" — does not throw)', async () => {
    const state: MasonryWallState = {
      ...defaultMasonryState(),
      proyecto: undefined,
      expediente: undefined,
      autor: undefined,
    };
    const c = compute(state);
    const pdf = await exportMasonryWallsPDF({ state, ...c, system: 'si' });
    expect(pdf.pageCount).toBeGreaterThanOrEqual(5);
  });

  it('inputsFingerprint is stable across two computes of the same state (provenance invariant)', () => {
    const state = defaultMasonryState();
    const fp1 = inputsFingerprint(state);
    const fp2 = inputsFingerprint({ ...state }); // shallow clone, same content
    expect(fp1).toBe(fp2);
  });

  it('inputsFingerprint changes when state changes (provenance discriminates)', () => {
    const a = defaultMasonryState();
    const b = { ...a, L: a.L + 100 };
    expect(inputsFingerprint(a)).not.toBe(inputsFingerprint(b));
  });

  it('exports even when overall is INCUMPLE — PDF never disabled by verdict (memory: feedback_pdf_export_never_disabled)', async () => {
    // Force failure: muro muy esbelto + carga alta
    const state: MasonryWallState = {
      ...defaultMasonryState(),
      t: 120, // muy fino
      plantas: defaultMasonryState().plantas.map((p) => ({ ...p, q_G: 25, q_Q: 15 })),
    };
    const c = compute(state);
    if (c.invalid) {
      // Engine flagged invalid before reaching INCUMPLE — still a valid path.
      const pdf = await exportMasonryWallsPDF({ state, ...c, system: 'si' });
      expect(pdf.pageCount).toBe(1);
    } else {
      expect(c.overall.v === 'fail' || c.overall.v === 'warn').toBe(true);
      const pdf = await exportMasonryWallsPDF({ state, ...c, system: 'si' });
      expect(pdf.pageCount).toBeGreaterThanOrEqual(5);
    }
  });

  it('each appendix page has its planta documented (no machón silently dropped)', async () => {
    // We can't easily extract text from the binary PDF here without pdfjs-dist,
    // but we can verify the pageCount invariant: exactly 1 appendix page per
    // planta. If the rebuild ever silently dropped a planta, this would fail.
    const state = defaultMasonryState();
    const c = compute(state);
    const pdf = await exportMasonryWallsPDF({ state, ...c, system: 'si' });
    // 1 cover + 1 datos + 1 governing + N appendix + 1 anexo
    const expectedAppendix = state.plantas.length;
    expect(pdf.pageCount).toBe(3 + expectedAppendix + 1);
  });
});
