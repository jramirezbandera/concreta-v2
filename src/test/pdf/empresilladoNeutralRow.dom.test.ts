// La fila informativa del PDF de empresillado NO es una comprobación.
//
// «Capacidad solo del empresillado (pilar RC despreciado…)» es una nota de
// alcance: no tiene valor, ni límite, ni utilización. El exportador la pintaba
// por el camino de las filas normales y salía con «0%» y «N/A» en las columnas
// Ut%/Estado — que se lee como una comprobación que el módulo no ha sabido
// hacer, justo lo contrario de lo que dice. Ahora va con su etiqueta (LÍMITES).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const { instrument } = await import('./layoutProbe');
  const Real = mod.default ?? mod.jsPDF;
  const Patched: any = function (...args: any[]) { return instrument(new Real(...args)); };
  return { ...mod, default: Patched, jsPDF: Patched };
});

import { resetProbe, texts } from './layoutProbe';
import { pdfStr } from '../../lib/pdf/utils';
import { exportEmpresalladoPDF } from '../../lib/pdf/empresillado';
import { calcEmpresillado } from '../../lib/calculations/empresillado';
import { empresalladoDefaults } from '../../data/defaults';

describe('PDF empresillado — fila de alcance', () => {
  beforeEach(resetProbe);

  it('la nota lleva etiqueta LIMITES y no «0%» ni «N/A»', async () => {
    const r = calcEmpresillado(empresalladoDefaults);
    await exportEmpresalladoPDF(empresalladoDefaults, r, 'si');

    const all = texts.map((t) => t.t);
    expect(all.some((t) => t.includes('Capacidad solo del empresillado'))).toBe(true);
    expect(all).toContain('LÍMITES');   // LÍMITES en latin1
    expect(all).not.toContain('N/A');
    // El «0%» de la nota: ninguna otra fila del caso por defecto está a 0%.
    expect(all.filter((t) => t === '0%')).toEqual([]);
  });

  it('todas las comprobaciones del motor se pintan en la tabla', async () => {
    const r = calcEmpresillado(empresalladoDefaults);
    await exportEmpresalladoPDF(empresalladoDefaults, r, 'si');

    // `pdfStr` reescribe guiones largos y letras griegas (η → eta) y jsPDF
    // trocea por ancho: se pasa la descripción por el mismo filtro y se
    // compara sin espacios ni puntuación, para no atar el test al maquetado.
    const squash = (s: string) => pdfStr(s).replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    const joined = squash(texts.map((t) => t.t).join(''));
    for (const c of r.checks) {
      expect(joined, `falta la fila ${c.id}`).toContain(squash(c.description).slice(0, 20));
    }
  });
});
