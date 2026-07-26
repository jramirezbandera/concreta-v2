// FEM 2D — screen-space hit-testing (pure).

import { describe, expect, it } from 'vitest';
import { HIT_NODE_PX, distPointSegment, hitTest, segmentIntersectsRect, selectInRect } from '../../features/fem2d/hitTest';
import { buildModelFromState, fem2dUiDefaults } from '../../features/fem2d/uiState';
import { IDENTITY_VIEW, makeTransform, uniformInsets, withView } from '../../lib/canvas/transform';
import type { Fem2DModel } from '../../features/fem2d/types';

// Identity projection: world units ARE pixels (tests reason in px directly).
const id = (v: number) => v;

function portal() {
  // Portal frame: n1(0,0) n2(0,3.5) n3(6,3.5) n4(6,0); p1: n1→n2, v1: n2→n3.
  return buildModelFromState({ ...fem2dUiDefaults(), templateId: 'portal-frame' }).model!;
}

describe('distPointSegment', () => {
  it('perpendicular distance + clamped t', () => {
    const mid = distPointSegment(5, 2, 0, 0, 10, 0);
    expect(mid.d).toBeCloseTo(2, 9);
    expect(mid.t).toBeCloseTo(0.5, 9);
  });

  it('clamps beyond the endpoints', () => {
    const past = distPointSegment(14, 3, 0, 0, 10, 0);
    expect(past.t).toBe(1);
    expect(past.d).toBeCloseTo(5, 9); // hypot(4, 3)
    const before = distPointSegment(-3, 4, 0, 0, 10, 0);
    expect(before.t).toBe(0);
    expect(before.d).toBeCloseTo(5, 9);
  });

  it('degenerate zero-length segment', () => {
    const r = distPointSegment(3, 4, 0, 0, 0, 0);
    expect(r.d).toBeCloseTo(5, 9);
    expect(r.t).toBe(0);
  });
});

describe('hitTest', () => {
  it('node beats member near a joint', () => {
    const model = portal();
    // Click 5 px from node n2 (0, 3.5) — also within the member band of p1/v1.
    const hit = hitTest(model, 3, 3.5 + 4, id, id);
    expect(hit).toEqual({ kind: 'node', id: 'n2' });
  });

  it('member hit carries the clamped projection t', () => {
    const model = portal();
    // Realistic scale (50 px/m): the identity space is so small that EVERY
    // point sits within the 14 px node radius of some joint. v1 runs
    // n2(0,175) → n3(300,175) px; click 5 px above its 1/3 point.
    const s50 = (v: number) => v * 50;
    const hit = hitTest(model, 100, 175 - 5, s50, s50);
    expect(hit?.kind).toBe('member');
    if (hit?.kind !== 'member') return;
    expect(hit.id).toBe('v1');
    expect(hit.t).toBeCloseTo(100 / 300, 6);
  });

  it('empty space → null', () => {
    const model = portal();
    expect(hitTest(model, 3, 3.5 + HIT_NODE_PX + 30, id, id)).toBeNull();
  });

  it('nearest node wins when two are within tolerance', () => {
    const model = portal();
    // Punto entre n1(0,0) y n4(6,0) imposible (14px radio, 6 de separación en
    // este espacio identidad: ambos dentro) → gana el más cercano (n4).
    const hit = hitTest(model, 4, 0, id, id);
    expect(hit).toEqual({ kind: 'node', id: 'n4' });
  });
});

describe('hitTest — loads (opts.loads)', () => {
  // Horizontal beam n1(0,0) → n2(6,0) with a UDL, a mid point load and a
  // horizontal node load. With the 50 px/m scale the member runs (0,0)→(300,0)
  // on screen; the UDL band (stack 0) hangs 0…16 px ABOVE it (gravity ↓ ⇒
  // arrows point down), and the mid point load (stack 1 on the same member)
  // spans −58…0 px at x=150.
  function loadedBeam(): Fem2DModel {
    return {
      templateId: 'custom',
      selfWeight: false,
      nodes: [
        { id: 'n1', x: 0, y: 0 },
        { id: 'n2', x: 6, y: 0 },
      ],
      members: [{
        id: 'b1', i: 'n1', j: 'n2', role: 'viga', elementType: 'beam-column',
        material: 'steel', steelSelection: { profileKey: 'steel_IPE240', steel: 'S275' },
        releases: { i: false, j: false },
      }],
      supports: [
        { node: 'n1', type: 'pinned' },
        { node: 'n2', type: 'roller' },
      ],
      loads: [
        { id: 'l1', kind: 'udl', lc: 'G', member: 'b1', wx: 0, wy: -10, frame: 'global' },
        { id: 'l2', kind: 'point-member', lc: 'G', member: 'b1', pos: 0.5, Fx: 0, Fy: -10, frame: 'global' },
        { id: 'l3', kind: 'node', lc: 'W', node: 'n1', Fx: 10, Fy: 0 },
      ],
    };
  }
  const s50 = (v: number) => v * 50;

  it('clicking the UDL rail selects the load', () => {
    const hit = hitTest(loadedBeam(), 75, -16, s50, s50, { loads: true });
    expect(hit).toEqual({ kind: 'load', id: 'l1' });
  });

  it('clicking the member axis under a band still selects the member', () => {
    const hit = hitTest(loadedBeam(), 75, -3, s50, s50, { loads: true });
    expect(hit?.kind).toBe('member');
  });

  it('clicking the stacked point-load arrow shaft selects that load', () => {
    // l2 (stack 1) spans y ∈ [−58, 0] at x=150; y=−40 is beyond l1's band
    // strip (centre −8, tol 16) so only l2 can claim it.
    const hit = hitTest(loadedBeam(), 150, -40, s50, s50, { loads: true });
    expect(hit).toEqual({ kind: 'load', id: 'l2' });
  });

  it('clicking a horizontal node-load shaft selects it (past the node radius)', () => {
    // l3 points +x with head at n1 (0,0): shaft spans x ∈ [−26, 0].
    const hit = hitTest(loadedBeam(), -20, 0, s50, s50, { loads: true });
    expect(hit).toEqual({ kind: 'load', id: 'l3' });
  });

  it('without opts.loads the glyphs are transparent (placement tools)', () => {
    expect(hitTest(loadedBeam(), 75, -16, s50, s50)).toBeNull();
    const axis = hitTest(loadedBeam(), 75, -3, s50, s50);
    expect(axis?.kind).toBe('member');
  });
});

describe('hitTest — etiqueta de valor de una carga', () => {
  const s50 = (v: number) => v * 50;
  // Dintel con UNA sola UDL: capa 0, banda 0…−16 px y etiqueta con la línea
  // base a −26 px (centro de la caja del texto en −29.5), fuera del alcance de
  // la banda (que llega a −24).
  function beamWithUdl(extraMember = false): Fem2DModel {
    return {
      templateId: 'custom',
      selfWeight: false,
      nodes: [
        { id: 'n1', x: 0, y: 0 },
        { id: 'n2', x: 6, y: 0 },
        // Barra paralela justo por encima (pantalla y = −30), donde cae la
        // etiqueta de la UDL de b1.
        ...(extraMember ? [{ id: 'n3', x: 0, y: -0.6 }, { id: 'n4', x: 6, y: -0.6 }] : []),
      ],
      members: [
        {
          id: 'b1', i: 'n1', j: 'n2', role: 'viga' as const, elementType: 'beam-column' as const,
          material: 'steel' as const, steelSelection: { profileKey: 'steel_IPE240', steel: 'S275' as const },
          releases: { i: false, j: false },
        },
        ...(extraMember ? [{
          id: 'b2', i: 'n3', j: 'n4', role: 'viga' as const, elementType: 'beam-column' as const,
          material: 'steel' as const, steelSelection: { profileKey: 'steel_IPE240', steel: 'S275' as const },
          releases: { i: false, j: false },
        }] : []),
      ],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', member: 'b1', wx: 0, wy: -10, frame: 'global' }],
    };
  }

  it('clicar el TEXTO de la carga la selecciona (no solo la flecha)', () => {
    const hit = hitTest(beamWithUdl(), 150, -29.5, s50, s50, { loads: true, system: 'si' });
    expect(hit).toEqual({ kind: 'load', id: 'l1' });
  });

  it('la etiqueta es el impacto más DÉBIL: una barra debajo se lleva el clic', () => {
    const hit = hitTest(beamWithUdl(true), 150, -29.5, s50, s50, { loads: true, system: 'si' });
    expect(hit?.kind).toBe('member');
    if (hit?.kind !== 'member') return;
    expect(hit.id).toBe('b2');
  });

  it('lejos del texto no hay impacto', () => {
    expect(hitTest(beamWithUdl(), 150, -60, s50, s50, { loads: true, system: 'si' })).toBeNull();
  });
});

describe('segmentIntersectsRect (Liang-Barsky)', () => {
  const r = { x0: 0, y0: 0, x1: 10, y1: 10 };
  it('contained, crossing and missing segments', () => {
    expect(segmentIntersectsRect(2, 2, 8, 8, r)).toBe(true); // dentro
    expect(segmentIntersectsRect(-5, 5, 15, 5, r)).toBe(true); // atraviesa
    expect(segmentIntersectsRect(-5, 15, 15, 15, r)).toBe(false); // paralelo fuera
    expect(segmentIntersectsRect(-5, -5, -1, 20, r)).toBe(false); // pasa por la izquierda
  });
});

describe('selectInRect (ventana / captura)', () => {
  // Portal a 50 px/m: n1(0,0) n2(0,175) n3(300,175) n4(300,0) en pantalla.
  const s50 = (v: number) => v * 50;

  it('window (→): only fully contained members; loads by anchor', () => {
    const model = portal();
    const wind = model.loads.find((l) => l.kind === 'node')!;
    // Caja alrededor del pilar izquierdo: n1 y n2 dentro → p1 entera; v1 toca
    // en n2 pero n3 queda fuera → NO se selecciona.
    const sel = selectInRect(model, { x0: -20, y0: -20, x1: 40, y1: 200 }, s50, s50, false);
    expect([...sel.nodes].sort()).toEqual(['n1', 'n2']);
    expect(sel.members).toEqual(['p1']);
    // El viento ancla en n2 (dentro); las UDL anclan en el centro del dintel (fuera).
    expect(sel.loads).toEqual([wind.id]);
  });

  it('crossing (←): touching members count too', () => {
    const model = portal();
    const sel = selectInRect(model, { x0: -20, y0: -20, x1: 40, y1: 200 }, s50, s50, true);
    expect([...sel.members].sort()).toEqual(['p1', 'v1']);
  });

  it('crossing catches a member whose two ends are outside; window does not', () => {
    const model = portal();
    // Banda vertical fina por el centro del vano: ningún nudo dentro.
    const rect = { x0: 140, y0: 150, x1: 160, y1: 200 };
    const crossing = selectInRect(model, rect, s50, s50, true);
    expect(crossing.nodes).toEqual([]);
    expect(crossing.members).toEqual(['v1']);
    const window = selectInRect(model, rect, s50, s50, false);
    expect(window.members).toEqual([]);
  });

  it('UDL loads anchor at their extent midpoint', () => {
    const model = portal();
    const sel = selectInRect(model, { x0: 100, y0: 160, x1: 200, y1: 190 }, s50, s50, false);
    // Las dos UDL del dintel (G y Q) anclan en (150, 175).
    expect(sel.loads.length).toBe(2);
    expect(sel.nodes).toEqual([]);
    expect(sel.members).toEqual([]);
  });
});

// ── Regresión: hit-testing bajo la cámara (zoom/encuadre) ───────────────────
// El transform envuelto se le pasa a hitTest igual que el autofit, así que lo
// que hay que garantizar es que las TOLERANCIAS siguen en píxeles de pantalla:
// ampliar no puede engordar el área sensible de un nudo (si lo hiciera, en un
// modelo denso ampliado sería imposible clicar una barra entre dos nudos).
describe('hitTest bajo zoom (regresión de la cámara)', () => {
  const nodes = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }];
  const base = makeTransform(nodes, 600, 400, uniformInsets(40));

  it('el mismo nudo se selecciona antes y después de ampliar', () => {
    const model = portal();
    const node = model.nodes[0];
    for (const view of [IDENTITY_VIEW, { k: 3, tx: -120, ty: -90 }]) {
      const t = withView(base, view);
      const hit = hitTest(model, t.sx(node.x), t.sy(node.y), t.sx, t.sy, {});
      expect(hit?.kind, `k=${view.k}`).toBe('node');
      expect(hit?.id, `k=${view.k}`).toBe(node.id);
    }
  });

  it('la tolerancia del nudo NO escala con el zoom (sigue en px de pantalla)', () => {
    const model = portal();
    const node = model.nodes[0];
    const t = withView(base, { k: 4, tx: 0, ty: 0 });
    const cx = t.sx(node.x), cy = t.sy(node.y);

    // Justo dentro del radio de captura en píxeles: sigue siendo el nudo.
    expect(hitTest(model, cx + HIT_NODE_PX - 2, cy, t.sx, t.sy, {})?.kind).toBe('node');
    // Al doble del radio ya NO puede ser el nudo, por mucho zoom que haya: si
    // la tolerancia hubiera escalado ×4, aquí seguiríamos capturando el nudo.
    const far = hitTest(model, cx + HIT_NODE_PX * 2 + 4, cy, t.sx, t.sy, {});
    expect(far?.kind === 'node' && far.id === node.id).toBe(false);
  });

  it('el marquee sigue trabajando en coordenadas de pantalla con zoom', () => {
    const model = portal();
    const t = withView(base, { k: 2.2, tx: -60, ty: -40 });
    const xs = model.nodes.map((n) => t.sx(n.x));
    const ys = model.nodes.map((n) => t.sy(n.y));
    const sel = selectInRect(
      model,
      { x0: Math.min(...xs) - 5, y0: Math.min(...ys) - 5, x1: Math.max(...xs) + 5, y1: Math.max(...ys) + 5 },
      t.sx, t.sy, false,
    );
    expect(sel.nodes.length).toBe(model.nodes.length);
  });
});
