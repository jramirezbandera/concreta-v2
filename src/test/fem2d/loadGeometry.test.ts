// FEM 2D — geometría de los glifos de carga (pura, en píxeles).
//
// Es la fuente ÚNICA que comparten el dibujo (canvasGlyphs) y el clic
// (hitTest), así que aquí se fijan los contratos de los que dependen ambos:
// una carga nula no existe visualmente, y las capas apiladas encajan unas
// contra otras (las puntas de la capa k caen en el raíl de la k−1).

import { describe, expect, it } from 'vitest';
import { computeLoadStackCounts, computeLoadStacks } from '../../features/fem2d/canvasTheme';
import { hitsLoadLabel, loadGeometry } from '../../features/fem2d/loadGeometry';
import type { Fem2DLoad, Fem2DModel } from '../../features/fem2d/types';

// Dintel horizontal n1(0,0) → n2(6,0). Con esta escala (50 px/m, sin voltear
// y) la barra ocupa (0,0)→(300,0) en pantalla.
function beam(loads: Fem2DLoad[]): Fem2DModel {
  return {
    templateId: 'custom',
    selfWeight: false,
    nodes: [
      { id: 'n1', x: 0, y: 0 },
      { id: 'n2', x: 6, y: 0 },
    ],
    members: [{
      id: 'b1', i: 'n1', j: 'n2',
      material: 'steel', steelSelection: { profileKey: 'steel_IPE240', steel: 'S275' },
      releases: { i: false, j: false },
    }],
    supports: [
      { node: 'n1', type: 'pinned' },
      { node: 'n2', type: 'roller' },
    ],
    loads,
  };
}
const s50 = (v: number) => v * 50;

const udl = (id: string, wy: number): Fem2DLoad =>
  ({ id, kind: 'udl', lc: 'G', member: 'b1', wx: 0, wy, frame: 'global' });

function geomOf(model: Fem2DModel, id: string) {
  const load = model.loads.find((l) => l.id === id)!;
  return loadGeometry({
    load,
    model,
    sx: s50,
    sy: s50,
    system: 'si',
    stackIndex: computeLoadStacks(model).get(id) ?? 0,
    stackTotal: computeLoadStackCounts(model).get(id) ?? 1,
  });
}

describe('loadGeometry — carga de magnitud nula', () => {
  it('no devuelve geometría (no se dibuja ni se puede clicar)', () => {
    const model = beam([udl('l0', 0)]);
    expect(geomOf(model, 'l0')).toBeNull();
  });

  it('no ocupa capa: la carga real de al lado sigue pegada a la barra', () => {
    // El fallo original: un "b7 · 0" fantasma empujaba la carga buena una banda
    // hacia afuera (puntas sin raíl al que apuntar y etiqueta a 55 px).
    const model = beam([udl('l0', 0), udl('l1', -10)]);
    expect(computeLoadStacks(model).get('l1')).toBe(0);
    expect(computeLoadStackCounts(model).get('l1')).toBe(1);

    const g = geomOf(model, 'l1');
    expect(g?.kind).toBe('band');
    if (g?.kind !== 'band') return;
    // Capa 0 ⇒ las puntas se clavan EN el eje de la barra (y = 0).
    expect(g.tip0).toEqual({ x: 0, y: 0 });
    expect(g.tip1).toEqual({ x: 300, y: 0 });
    // …y el raíl de cola queda a una banda (16 px) del eje.
    expect(g.tail0.y).toBeCloseTo(-16, 6);
    // Etiqueta a 24 px del eje (una sola capa), con el valor formateado.
    expect(g.label.y).toBeCloseTo(-26, 6);
    expect(g.text).toBe('10.00 kN/m');
  });
});

describe('loadGeometry — pila de cargas sobre una misma barra', () => {
  it('las puntas de la capa k caen en el raíl de cola de la k−1', () => {
    const model = beam([udl('g', -10), udl('q', -4)]);
    const g0 = geomOf(model, 'g');
    const g1 = geomOf(model, 'q');
    expect(g0?.kind === 'band' && g1?.kind === 'band').toBe(true);
    if (g0?.kind !== 'band' || g1?.kind !== 'band') return;
    // Contrato del que depende que TODAS las capas lleven punta de flecha.
    expect(g1.tip0).toEqual(g0.tail0);
    expect(g1.tip1).toEqual(g0.tail1);
    // Las dos etiquetas se apartan de la pila entera y no se pisan entre sí.
    expect(g0.label.y).toBeCloseTo(-42, 6);   // 2·16 + 8
    expect(g1.label.y).toBeCloseTo(-57, 6);   // + 15 de separación
  });
});

describe('hitsLoadLabel', () => {
  it('la caja del texto rodea al ancla y no se extiende sin límite', () => {
    const model = beam([udl('l1', -10)]);
    const g = geomOf(model, 'l1')!;
    // Centro de la caja (la línea base va 3.5 px por debajo del centro).
    expect(hitsLoadLabel(g, g.label.x, g.label.y - 3.5)).toBe(true);
    // Un carácter de más por el lado ancho sigue dentro; 100 px, fuera.
    expect(hitsLoadLabel(g, g.label.x + 25, g.label.y - 3.5)).toBe(true);
    expect(hitsLoadLabel(g, g.label.x + 100, g.label.y - 3.5)).toBe(false);
    expect(hitsLoadLabel(g, g.label.x, g.label.y + 20)).toBe(false);
  });
});
