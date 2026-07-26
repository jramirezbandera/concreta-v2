// FEM 2D — límites navegables del lienzo.
//
// Lo que se fija aquí: el rectángulo contra el que se acota el encuadre incluye
// TODO lo que el usuario reconoce como el dibujo (cargas, etiquetas, apoyos,
// cotas, bandas de diagrama), no sólo el bbox de nudos. Si sólo cubriera nudos,
// una carga o una etiqueta periférica quedaría fuera del alcance del pan.

import { describe, expect, it } from 'vitest';
import { computeLoadStackCounts, computeLoadStacks } from '../../features/fem2d/canvasTheme';
import { getDrawableBounds } from '../../features/fem2d/drawableBounds';
import { labelHalfBox, loadGeometry } from '../../features/fem2d/loadGeometry';
import { addMemberUdl, addNodeLoad } from '../../features/fem2d/modelOps';
import { makeTransform, uniformInsets } from '../../lib/canvas/transform';
import { buildModelFromState, fem2dUiDefaults } from '../../features/fem2d/uiState';
import type { Fem2DModel } from '../../features/fem2d/types';

const W = 800;
const H = 520;

function boundsOf(model: Fem2DModel) {
  const t = makeTransform(model.nodes, W, H, uniformInsets(40));
  return {
    rect: getDrawableBounds({ model, sx: t.sx, sy: t.sy, width: W, height: H, system: 'si' }),
    t,
  };
}

function modelFor(templateId: 'pratt-truss' | 'portal-frame'): Fem2DModel {
  return buildModelFromState({ ...fem2dUiDefaults(), templateId }).model!;
}

describe('getDrawableBounds', () => {
  it('envuelve el bbox de nudos con holgura por los cuatro lados', () => {
    const model = modelFor('portal-frame');
    const { rect, t } = boundsOf(model);
    const xs = model.nodes.map((n) => t.sx(n.x));
    const ys = model.nodes.map((n) => t.sy(n.y));

    expect(rect.minX).toBeLessThan(Math.min(...xs));
    expect(rect.maxX).toBeGreaterThan(Math.max(...xs));
    expect(rect.minY).toBeLessThan(Math.min(...ys));
    expect(rect.maxY).toBeGreaterThan(Math.max(...ys));
  });

  it('reserva más abajo que arriba (apoyos + cadena de cotas X)', () => {
    const model = modelFor('portal-frame');
    const { rect, t } = boundsOf(model);
    const ys = model.nodes.map((n) => t.sy(n.y));
    const above = Math.min(...ys) - rect.minY;
    const below = rect.maxY - Math.max(...ys);
    expect(below).toBeGreaterThan(above);
  });

  it('reserva la cadena de cotas Y a la izquierda', () => {
    const model = modelFor('portal-frame');
    const { rect, t } = boundsOf(model);
    const xs = model.nodes.map((n) => t.sx(n.x));
    const left = Math.min(...xs) - rect.minX;
    const right = rect.maxX - Math.max(...xs);
    expect(left).toBeGreaterThan(right);
  });

  // El contrato que de verdad importa: NINGUNA parte pintada de una carga
  // (flecha, banda o etiqueta de valor) puede quedar fuera del rectángulo, o el
  // encuadre acotado la dejaría inalcanzable. Se comprueba contra loadGeometry,
  // la misma fuente que dibuja canvasGlyphs y contra la que clica hitTest.
  function assertLoadsInside(model: Fem2DModel) {
    const { rect, t } = boundsOf(model);
    const stacks = computeLoadStacks(model);
    const counts = computeLoadStackCounts(model);
    const nodeById = new Map(model.nodes.map((n) => [n.id, n]));

    expect(model.loads.length).toBeGreaterThan(0);
    for (const load of model.loads) {
      const geom = loadGeometry({
        load, model, sx: t.sx, sy: t.sy, system: 'si',
        stackIndex: stacks.get(load.id) ?? 0,
        stackTotal: counts.get(load.id) ?? 1,
        nodeById,
      });
      if (!geom) continue;
      const pts = geom.kind === 'arrow'
        ? [geom.tail, geom.head]
        : [geom.tail0, geom.tail1, geom.tip0, geom.tip1];
      const half = labelHalfBox(geom.text);
      pts.push(
        { x: geom.label.x - half.hw, y: geom.label.y - half.hh },
        { x: geom.label.x + half.hw, y: geom.label.y + half.hh },
      );
      for (const p of pts) {
        expect(p.x, `${load.id} x dentro del rectángulo`).toBeGreaterThanOrEqual(rect.minX);
        expect(p.x, `${load.id} x dentro del rectángulo`).toBeLessThanOrEqual(rect.maxX);
        expect(p.y, `${load.id} y dentro del rectángulo`).toBeGreaterThanOrEqual(rect.minY);
        expect(p.y, `${load.id} y dentro del rectángulo`).toBeLessThanOrEqual(rect.maxY);
      }
    }
  }

  it('contiene la pila de cargas puntuales de una Pratt (glifos + etiquetas)', () => {
    // Varias cargas sobre el MISMO nudo: se apilan y se alejan del modelo, que
    // es el caso que motivó acotar por límites dibujables y no por nudos.
    let loaded = modelFor('pratt-truss');
    const node = loaded.nodes[Math.floor(loaded.nodes.length / 2)];
    for (let i = 0; i < 4; i++) {
      const res = addNodeLoad(loaded, node.id); // preset gravedad por defecto
      if (res.ok) loaded = res.model;
    }
    assertLoadsInside(loaded);
  });

  it('contiene la banda y la etiqueta de una carga distribuida', () => {
    const bare = modelFor('portal-frame');
    const beam = bare.members.find((m) => m.elementType !== 'two-force') ?? bare.members[0];
    const res = addMemberUdl(bare, beam.id); // preset gravedad por defecto
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    assertLoadsInside(res.model);
  });

  it('modelo vacío: rectángulo finito del tamaño del viewport (no navegable)', () => {
    const empty: Fem2DModel = { ...modelFor('portal-frame'), nodes: [], members: [], supports: [], loads: [] };
    const t = makeTransform(empty.nodes, W, H, uniformInsets(40));
    const rect = getDrawableBounds({ model: empty, sx: t.sx, sy: t.sy, width: W, height: H, system: 'si' });

    expect(Number.isFinite(rect.minX)).toBe(true);
    expect(Number.isFinite(rect.maxY)).toBe(true);
    expect(rect.maxX).toBeGreaterThan(rect.minX);
    expect(rect.maxY).toBeGreaterThan(rect.minY);
  });

  it('la amplitud de banda de diagrama escala con el viewport', () => {
    const model = modelFor('portal-frame');
    const t = makeTransform(model.nodes, W, H, uniformInsets(40));
    const small = getDrawableBounds({ model, sx: t.sx, sy: t.sy, width: 400, height: 300, system: 'si' });
    const large = getDrawableBounds({ model, sx: t.sx, sy: t.sy, width: 1600, height: 1000, system: 'si' });
    expect(large.maxX - large.minX).toBeGreaterThan(small.maxX - small.minX);
  });

  it('es estable: dos llamadas con la misma entrada dan el mismo rectángulo', () => {
    const model = modelFor('pratt-truss');
    expect(boundsOf(model).rect).toEqual(boundsOf(model).rect);
  });
});
