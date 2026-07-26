// FEM 2D — cuarentena de la CÁMARA en el camino del PDF.
//
// Por qué un test estático y no una comparación de bytes: en jsdom los clones
// SVG (#fem2d-*-svg-pdf) no existen, así que el exportador omite las figuras
// (ver cabecera de pdf.test.ts). Es decir, la suite NO PUEDE detectar que una
// figura salga mal encuadrada: todos los tests pasarían y el PDF llevaría la
// geometría recortada. Un documento de cálculo plausible pero incorrecto es el
// peor fallo posible de este módulo.
//
// La garantía es por tanto estructural, con el mismo enfoque que
// quarantine.test.ts usa para el solver falso: se prohíbe que el camino del PDF
// toque la cámara, y se comprueba que en mode='pdf' el transform es EXACTAMENTE
// el autofit puro.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  IDENTITY_VIEW,
  makeTransform,
  uniformInsets,
  withView,
} from '../../lib/canvas/transform';
import { beamColumn, fem2dModel, node2d, nodeLoad, support2d } from '../../features/fem2d/builder';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import type { Fem2DLoad } from '../../features/fem2d/types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FEM2D_DIR = path.resolve(HERE, '../../features/fem2d');
const PDF_MODULE = path.resolve(HERE, '../../lib/pdf/fem2d.ts');
const read = (p: string) => readFileSync(p, 'utf8');

describe('cuarentena de la cámara en el PDF', () => {
  it('el exportador PDF no importa la cámara (ni el hook ni withView)', () => {
    const src = read(PDF_MODULE);
    expect(src).not.toMatch(/useCanvasView2D/);
    expect(src).not.toMatch(/withView/);
    expect(src).not.toMatch(/canvasView/);
  });

  it('Fem2DCanvas neutraliza la cámara en mode="pdf"', () => {
    // El componente sirve pantalla Y PDF: el hook se llama siempre (reglas de
    // hooks) pero debe quedar inerte, y el transform que se pinta debe ser el
    // autofit puro. Ambas cosas dependen de la bandera `pdf`.
    const src = read(path.join(FEM2D_DIR, 'Fem2DCanvas.tsx'));
    expect(src).toMatch(/withView\(base, pdf \? IDENTITY_VIEW : canvasView\)/);
    expect(src).toMatch(/enabled: !pdf/);
  });

  it('el hook nunca se llama de forma condicional (reglas de hooks)', () => {
    for (const file of ['Fem2DCanvas.tsx', 'Fem2DEditorCanvas.tsx']) {
      const src = read(path.join(FEM2D_DIR, file));
      // Un `if (...) useCanvasView2D(` o un `&& useCanvasView2D(` romperían el
      // orden de hooks en cuanto el modo cambiara entre renders.
      expect(src, file).not.toMatch(/(if\s*\([^)]*\)\s*\{?\s*|&&\s*|\?\s*)useCanvasView2D\(/);
    }
  });

  it('withView con la vista identidad devuelve el MISMO objeto (autofit intacto)', () => {
    const nodes = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }];
    const t = makeTransform(nodes, 640, 420, uniformInsets(40));
    expect(withView(t, IDENTITY_VIEW)).toBe(t);

    // Y produce exactamente las mismas coordenadas que el autofit puro.
    const w = withView(t, IDENTITY_VIEW);
    for (const n of nodes) {
      expect(w.sx(n.x)).toBe(t.sx(n.x));
      expect(w.sy(n.y)).toBe(t.sy(n.y));
    }
    expect(w.scale).toBe(t.scale);
  });

  it('claves heredadas: ELU/ELS_c/ELS_cp existen para TODA barra (el PDF indexa por ellas)', () => {
    // Los clones PDF (index.tsx:497/500/503) no pasan `combo` → default 'ELU'
    // (Fem2DCanvas.tsx). Si el diseño aditivo dejara caer los alias en un
    // refactor, las figuras N/V/M saldrían en BLANCO — y jsdom no ve los clones,
    // así que ningún test de bytes lo detectaría. Esta guarda estructural sí.
    const bench = (loads: Fem2DLoad[], selfWeight = false) =>
      analyzeFem2D(
        fem2dModel({
          nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
          members: [beamColumn('m1', 'n1', 'n2')],
          supports: [support2d('n1', 'fixed')],
          loads,
          selfWeight,
        }),
      );
    const cases = [
      bench([nodeLoad('g', 'n2', { lc: 'G', Fy: -10 })]), // 0 variables → els_cp fuera de la lista
      bench([
        nodeLoad('g', 'n2', { lc: 'G', Fy: -10 }),
        nodeLoad('q', 'n2', { lc: 'Q', useCategory: 'B', Fy: -8 }),
        nodeLoad('w', 'n2', { lc: 'W', Fx: 5 }),
      ]),
      bench([], true), // sólo peso propio
    ];
    for (const r of cases) {
      expect(r.ok).toBe(true);
      for (const env of Object.values(r.checks!.envelopes)) {
        expect(env.ELU).toBeDefined();
        expect(env.ELS_c).toBeDefined();
        expect(env.ELS_cp).toBeDefined();
        // Y siguen siendo el MISMO objeto que su clave de vista (criterio 4): si
        // se rompiera la identidad, la ficha y el PDF divergirían de la vista.
        expect(env.ELU).toBe(env['env:ELU']);
        expect(env.ELS_c).toBe(env['env:ELS_c']);
        expect(env.ELS_cp).toBe(env['els_cp']);
      }
    }
  });

  it('el tamaño de los clones PDF no depende del panel en pantalla', () => {
    // Los 4 clones se montan con width/height literales; si alguien los pasara
    // a svgW/svgH, la figura exportada cambiaría con el tamaño de la ventana.
    const src = read(path.join(FEM2D_DIR, 'index.tsx'));
    const clones = src.match(/id="fem2d-[^"]+-svg-pdf"[\s\S]{0,240}?\/>/g) ?? [];
    expect(clones.length).toBe(4);
    for (const clone of clones) {
      expect(clone).toMatch(/mode="pdf"/);
      expect(clone).toMatch(/width=\{\d+\}/);
      expect(clone).toMatch(/height=\{\d+\}/);
      expect(clone).not.toMatch(/svgW|svgH|canvasView/);
    }
  });
});
