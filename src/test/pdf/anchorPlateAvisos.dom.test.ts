// El PDF de placas de anclaje tiene que explicar su veredicto (2026-09-25).
//
// El «pilar 1» del usuario salía INCUMPLE «rige: concrete-interaction» y el
// papel callaba lo otro que lo hacía incumplir: las 6 barras estaban sobre las
// alas del HEB 200 («no es construible»). Los avisos de validación fuerzan el
// veredicto pero no se imprimían. Y la ficha decía «Rugosa (mu = 0.40)», un μ
// que el motor dejó de aplicar en la auditoría #26, además de citar el
// «CE Anejo 11» para los anclajes (en el CE es el enderezado de muestras de
// acero en rollo) y el «Anejo 18» para la placa base (bases de proyecto).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const { instrument } = await import('./layoutProbe');
  const Real = mod.default ?? mod.jsPDF;
  const Patched: any = function (...args: any[]) { return instrument(new Real(...args)); };
  return { ...mod, default: Patched, jsPDF: Patched };
});

import { layoutViolations, resetProbe, texts } from './layoutProbe';
import { exportAnchorPlatePDF } from '../../lib/pdf/anchorPlate';
import { calcAnchorPlate, edgeAxisPatch } from '../../lib/calculations/anchorPlate';
import { anchorPlateDefaults, type AnchorPlateInputs } from '../../data/defaults';

/** Los datos del PDF «pilar 1» que mandó el usuario. */
const PILAR_1: AnchorPlateInputs = {
  ...anchorPlateDefaults,
  title: 'pilar 1',
  NEd: 200, NEd_G: 120, Mx: 45, My: 10, VEd: 40, Vx: 40, Vy: 0,
  plate_a: 400, plate_b: 400, plate_t: 20,
  bar_nLayout: 6, bar_diam: 20, bar_edge_x: 100, bar_edge_y: 100, bar_hef: 300,
  top_connection: 'tuerca_arandela',
  fck: 30,
  ...edgeAxisPatch('x', 200, 200), ...edgeAxisPatch('y', 200, 200),
  plate_margin_x: 150, plate_margin_y: 150, surface_type: 'roughened',
};

async function exportar(inp: AnchorPlateInputs) {
  resetProbe();
  const r = calcAnchorPlate(inp);
  await exportAnchorPlatePDF(inp, r, 'si');
  return { r, todo: texts.map((t) => t.t).join('\n') };
}

describe('PDF placas de anclaje — el veredicto se explica en el papel', () => {
  beforeEach(resetProbe);

  it('imprime los avisos de validación: el de las barras sobre el perfil y el del macizo que no cuadra', async () => {
    const { r, todo } = await exportar(PILAR_1);
    expect(r.warnings.some((w) => w.severity === 'fail')).toBe(true);
    expect(todo).toContain('AVISOS');
    expect(todo).toContain('pisan el perfil');
    expect(todo).toContain('El macizo no cuadra en x');
    expect(layoutViolations(20)).toEqual([]);
  });

  it('el veredicto nombra la comprobación por su descripción, no por el id interno', async () => {
    const { todo } = await exportar(PILAR_1);
    expect(todo).toContain('rige: Interacción N+V hormigón');
    expect(todo).not.toContain('concrete-interaction');
  });

  it('si el hormigón cumple, el INCUMPLE lo pone el aviso y el veredicto lo dice', async () => {
    // Con cX = 350 (y el macizo coherente) ninguna fila pasa del 100 %.
    const inp = { ...PILAR_1, ...edgeAxisPatch('x', 350, 350), ...edgeAxisPatch('y', 350, 350), plate_margin_x: 250, plate_margin_y: 250 };
    const { r, todo } = await exportar(inp);
    expect(r.worstUtil).toBeLessThan(1);
    expect(r.overallStatus).toBe('fail');
    expect(todo).toContain('rige: barras no construibles, ver avisos');
  });

  it('la superficie ya no promete μ = 0,40 y las citas son las del CE de verdad', async () => {
    const { todo } = await exportar(PILAR_1);
    expect(todo).toContain('Rugosa (Cf,d = 0,20)');
    expect(todo).not.toMatch(/mu = 0\.40/);
    expect(todo).not.toMatch(/Anejo 1[18]\b/);
    expect(todo).toContain('CE Anejo 26');
    expect(todo).toContain('EN 1992-4');
  });

  it('el brazo x_c sólo sale cuando el solver lo tiene (el biaxial publica 0)', async () => {
    const { r, todo } = await exportar(PILAR_1);
    expect(r.solver.x_c).toBe(0);
    expect(todo).not.toContain('Brazo palanca');
  });

  it('sin avisos no hay sección AVISOS', async () => {
    const { r, todo } = await exportar(anchorPlateDefaults);
    expect(r.warnings).toHaveLength(0);
    expect(todo).not.toContain('AVISOS');
  });
});
