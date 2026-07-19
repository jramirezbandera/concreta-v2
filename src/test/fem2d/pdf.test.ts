// FEM 2D — exportador PDF (integración con jsPDF real en jsdom).
//
// En jsdom NO existen los clones SVG (#fem2d-*-svg-pdf) → las figuras se omiten
// sin romper la salida (embedFigure devuelve false). El objetivo aquí es que el
// cuerpo (cabecera + describeModel + resultados + tablas + disclaimer) exporte
// un PdfResult válido para las 4 topologías Y para un modelo 'custom' (editor
// libre), y que el nombre de archivo respete el título del elemento. La
// maquetación/encoding los auditan pdfLayout + latin1 (fem2d está registrado
// en pdfCases).

import { beforeAll, describe, expect, it } from 'vitest';
import { describeModel, exportFem2DPDF, fem2dFallbackFilename } from '../../lib/pdf/fem2d';
import { setMemberMaterial } from '../../features/fem2d/modelOps';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import { buildModelFromState, fem2dUiDefaults, TEMPLATE_ORDER, type Fem2DUiState } from '../../features/fem2d/uiState';
import type { Fem2DModel } from '../../features/fem2d/types';

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:mock';
  }
});

function modelFor(id: Fem2DUiState['templateId']): Fem2DModel {
  const state = { ...fem2dUiDefaults(), templateId: id };
  return buildModelFromState(state).model!;
}

describe('exportFem2DPDF', () => {
  it('exporta un PdfResult válido para cada topología por defecto', async () => {
    for (const id of TEMPLATE_ORDER) {
      const model = modelFor(id);
      const result = analyzeFem2D(model);
      expect(result.ok, `${id} debe resolver`).toBe(true);

      const pdf = await exportFem2DPDF(model, result, 'si');
      expect(pdf.blobUrl).toMatch(/^blob:/);
      expect(pdf.filename).toMatch(/\.pdf$/);
      expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('el título del elemento gobierna el nombre de archivo (slug); vacío → fallback', async () => {
    const model = modelFor('portal-frame');
    const result = analyzeFem2D(model);

    const titled = await exportFem2DPDF(model, result, 'si', 'Pórtico nave A');
    expect(titled.filename).toBe('portico-nave-a.pdf');

    const untitled = await exportFem2DPDF(model, result, 'si', '');
    expect(untitled.filename).toBe(fem2dFallbackFilename('portal-frame'));
    expect(untitled.filename).toBe('fem2d-portico-simple.pdf');
  });

  it('modelo custom (editor libre) → cabecera propia y fallback de estructura', async () => {
    const model: Fem2DModel = { ...modelFor('gable'), templateId: 'custom' };
    const result = analyzeFem2D(model);
    expect(result.ok).toBe(true);

    const pdf = await exportFem2DPDF(model, result, 'si', '');
    expect(pdf.blobUrl).toMatch(/^blob:/);
    expect(pdf.filename).toBe('fem2d-estructura.pdf');
    expect(fem2dFallbackFilename('custom')).toBe('fem2d-estructura.pdf');
  });

  it('exporta también en sistema técnico (conversión de cargas en describeModel)', async () => {
    const model = modelFor('multistory');
    const result = analyzeFem2D(model);
    const pdf = await exportFem2DPDF(model, result, 'tecnico');
    expect(pdf.blobUrl).toMatch(/^blob:/);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('un modelo con barra HA exporta, y describeModel la describe como sección HA', async () => {
    const base = modelFor('portal-frame');
    const rc = setMemberMaterial(base, 'v1', 'rc');
    expect(rc.ok).toBe(true);
    if (!rc.ok) return;
    const model = rc.model;
    const result = analyzeFem2D(model);
    expect(result.ok).toBe(true);
    // La viga HA se comprueba de verdad (armado estampado por defecto).
    expect(result.checks!.perMember.v1.status).not.toBe('pending');

    const lines = describeModel(model, 'si').flatMap((s) => s.lines);
    expect(lines.some((l) => l.includes('30×50 cm HA-25'))).toBe(true);

    const pdf = await exportFem2DPDF(model, result, 'si', 'Pórtico mixto');
    expect(pdf.blobUrl).toMatch(/^blob:/);
    expect(pdf.filename).toBe('portico-mixto.pdf');
  });
});
