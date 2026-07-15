// exportSlopeStabilityPDF — integración con jsPDF real (jsdom).
//
// Pyodide no corre en jsdom: el cliente PySlope va MOCKEADO (igual que el
// adapter test) para producir un SlopeResult realista que alimente al PDF.
// En jsdom NO existen los clones SVG (#slope-stability-svg-pdf,
// #slope-search-svg-pdf) → ambas figuras se omiten sin romper la salida; el
// objetivo aquí es que el cuerpo (tablas + trazabilidad + disclaimer) compile
// y exporte. Cubre además la rama defensiva de dovelas sin física.

import { describe, it, expect, vi, beforeAll } from "vitest";

// Worker mockeado: emite un SlopeRun con dovelas SIN física (alpha/W/u ausentes)
// para validar la rama defensiva ("—") de la tabla de dovelas.
vi.mock("../../lib/calculations/geotech/client", () => ({
  getPySlope: vi.fn(async () => ({
    analyze: vi.fn(async (_inputsJson: string, optsJson: string) => {
      const opts = JSON.parse(optsJson) as Record<string, number>;
      const minored = (opts.gammaC ?? 1) > 1;
      const fos = minored ? 1.4 : 2.0;
      return JSON.stringify({
        fos,
        circle: { cx: 13.8, cy: 17.3, r: 7.8 },
        entry: { x: 7.4, y: 13 },
        exit: { x: 16.5, y: 10 },
        // Dovelas con geometría pero SIN física (alpha/weight/u ausentes).
        slices: [
          { x: 8.0, xL: 7.4, xR: 8.6, yTop: 13.2, yBase: 11.0 },
          { x: 9.2, xL: 8.6, xR: 9.8, yTop: 13.0, yBase: 10.6 },
        ],
        failureProfile: [],
        groundProfile: [],
        limits: { left: 0, right: 5 },
        slicesN: 25,
        method: "bishop",
        searchCircles: [],
      });
    }),
  })),
  cancelAndRewarm: vi.fn(),
  terminatePySlope: vi.fn(),
}));

import { exportSlopeStabilityPDF } from "../../lib/pdf/slopeStability";
import { calcSlope } from "../../lib/calculations/geotech/slope";
import { slopeDefaults, type SlopeInputs } from "../../data/defaults";
import { pdfBytes, utf16Runs } from "./utf16";

beforeAll(() => {
  if (typeof URL.createObjectURL !== "function") {
    URL.createObjectURL = () => "blob:mock";
  }
});

describe("exportSlopeStabilityPDF", () => {
  it("exporta un PdfResult válido con el FTUX por defecto (sin clones SVG en jsdom)", async () => {
    const result = await calcSlope(slopeDefaults);
    const pdf = await exportSlopeStabilityPDF(slopeDefaults, result);
    expect(pdf.blobUrl).toMatch(/^blob:/);
    expect(pdf.filename).toMatch(/\.pdf$/);
    expect(pdf.filename).toMatch(/talud/i);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("incluye la fila sísmica neutra sin tirar (utilization 0 → '—' en Ut%)", async () => {
    const result = await calcSlope(slopeDefaults);
    const seismic = result.checks.find((c) => c.neutral);
    expect(seismic).toBeDefined();
    const pdf = await exportSlopeStabilityPDF(slopeDefaults, result);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("contexto global-foundation (tabla de checks ampliada) exporta sin crash", async () => {
    const inp: SlopeInputs = { ...slopeDefaults, context: "global-foundation" };
    const result = await calcSlope(inp);
    const pdf = await exportSlopeStabilityPDF(inp, result);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("dovelas SIN física (alpha/W/u ausentes) no rompen la tabla (rama '—')", async () => {
    const result = await calcSlope(slopeDefaults);
    expect(result.run.slices.length).toBeGreaterThan(0);
    expect(result.run.slices[0].weight).toBeUndefined();
    await expect(exportSlopeStabilityPDF(slopeDefaults, result)).resolves.toMatchObject({
      blobUrl: expect.stringMatching(/^blob:/),
      filename: expect.stringMatching(/\.pdf$/),
    });
  });

  it("corrida con método Fellenius exporta sin crash (disclaimer/traza dinámicos)", async () => {
    const result = await calcSlope({ ...slopeDefaults, method: "fellenius" });
    // El motor mockeado emite method según corra; forzamos la corrida mostrada a
    // Fellenius para ejercitar el etiquetado dinámico del PDF (slopeMethodLabel).
    const fellenius = { ...result, run: { ...result.run, method: "fellenius" } };
    const pdf = await exportSlopeStabilityPDF(
      { ...slopeDefaults, method: "fellenius" },
      fellenius,
    );
    expect(pdf.blobUrl).toMatch(/^blob:/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("run SIN dovelas (slices vacío) omite la tabla de dovelas sin tirar", async () => {
    const result = await calcSlope(slopeDefaults);
    const emptySlices = { ...result, run: { ...result.run, slices: [] } };
    const pdf = await exportSlopeStabilityPDF(slopeDefaults, emptySlices);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("exporta en sistema técnico (cargas/estratos/dovelas convertidos) sin crash", async () => {
    // Con NF y ambos tipos de carga para ejercitar todos los caminos de
    // conversión (areaLoad, linearLoad, weightDensity, cohesion, force).
    const inp: SlopeInputs = {
      ...slopeDefaults,
      waterTableDepth: 1.5,
      loads: [
        { id: 1, kind: "udl", magnitude: 10, offset: 0, length: 2 },
        { id: 2, kind: "line", magnitude: 15, offset: 1 },
      ],
    };
    const result = await calcSlope(inp);
    const pdf = await exportSlopeStabilityPDF(inp, result, "tecnico");
    expect(pdf.blobUrl).toMatch(/^blob:/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  // Invariante Latin-1 (ver src/test/pdf/utf16.ts). Vive aquí, y no en
  // latin1Encoding.dom.test.ts, porque este módulo necesita el mock de Pyodide.
  it("no emite ningun texto en UTF-16", async () => {
    const result = await calcSlope(slopeDefaults);
    const pdf = await pdfBytes(() => exportSlopeStabilityPDF(slopeDefaults, result, "si", "Talud 1"));
    expect(utf16Runs(pdf)).toEqual([]);
  });
});
