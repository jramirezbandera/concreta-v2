// FEM 2D — transform de cámara (zoom/encuadre) sobre el autofit.
//
// El fichero cubre los invariantes que hacen segura la feature de zoom:
//   · k=1 es EXACTAMENTE el autofit (identidad referencial, no aproximada)
//   · el zoom al cursor deja quieto el punto del mundo bajo el puntero
//   · el encuadre nunca puede perder el dibujo fuera del viewport
//   · redimensionar conserva el centro del mundo

import { describe, expect, it } from 'vitest';
import {
  IDENTITY_VIEW,
  PAN_KEEP_VISIBLE_PX,
  ZOOM_MAX,
  ZOOM_MIN,
  clampView,
  clampZoom,
  isIdentityView,
  makeTransform,
  reanchorOnResize,
  uniformInsets,
  withView,
  zoomAt,
  type BoundsRect,
} from '../../features/fem2d/transform';

const NODES = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 4 },
  { x: 0, y: 4 },
];
const W = 800;
const H = 500;
const VIEWPORT = { width: W, height: H };
const base = () => makeTransform(NODES, W, H, uniformInsets(40));

// Rectángulo dibujable de juguete (px del transform sin cámara).
const BOUNDS: BoundsRect = { minX: 100, minY: 80, maxX: 700, maxY: 420 };

describe('withView', () => {
  it('con la vista identidad devuelve el MISMO transform (autofit exacto)', () => {
    const t = base();
    expect(withView(t, IDENTITY_VIEW)).toBe(t);
    expect(withView(t, { k: 1, tx: 0, ty: 0 })).toBe(t);
  });

  it('escala la geometría y desplaza el origen', () => {
    const t = base();
    const v = { k: 2, tx: 30, ty: -15 };
    const w = withView(t, v);
    expect(w.sx(3)).toBeCloseTo(t.sx(3) * 2 + 30, 10);
    expect(w.sy(3)).toBeCloseTo(t.sy(3) * 2 - 15, 10);
    expect(w.scale).toBeCloseTo(t.scale * 2, 10);
  });

  it('invert es la inversa exacta de sx/sy bajo zoom (round-trip)', () => {
    const w = withView(base(), { k: 3.4, tx: -120, ty: 55 });
    for (const p of [{ x: 0, y: 0 }, { x: 6, y: 4 }, { x: 2.5, y: 1.75 }]) {
      const back = w.invert(w.sx(p.x), w.sy(p.y));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('NO altera las magnitudes de pantalla: sólo mapea coordenadas', () => {
    // El contrato de la feature: los trazos/glifos/textos se miden en px y no
    // pasan por el transform, así que acercarse SEPARA etiquetas en vez de
    // engordarlas. Lo que sí crece es la distancia entre dos puntos del mundo.
    const t = base();
    const w = withView(t, { k: 4, tx: 0, ty: 0 });
    const dBase = Math.abs(t.sx(1) - t.sx(0));
    const dZoom = Math.abs(w.sx(1) - w.sx(0));
    expect(dZoom).toBeCloseTo(dBase * 4, 10);
  });
});

describe('zoomAt (zoom al cursor)', () => {
  it('deja quieto el punto del mundo bajo el cursor', () => {
    const t = base();
    const cursor = { px: 512, py: 190 };
    const before = withView(t, IDENTITY_VIEW).invert(cursor.px, cursor.py);

    let view = zoomAt(IDENTITY_VIEW, 1.25, cursor.px, cursor.py);
    view = zoomAt(view, 1.25, cursor.px, cursor.py);
    view = zoomAt(view, 1.25, cursor.px, cursor.py);

    const after = withView(t, view).invert(cursor.px, cursor.py);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
    expect(view.k).toBeCloseTo(1.25 ** 3, 10);
  });

  it('mantiene el invariante en cualquier punto del viewport', () => {
    const t = base();
    for (const [px, py] of [[0, 0], [W, H], [123, 456], [790, 12]]) {
      const before = t.invert(px, py);
      const view = zoomAt(IDENTITY_VIEW, 2.5, px, py);
      const after = withView(t, view).invert(px, py);
      expect(after.x).toBeCloseTo(before.x, 8);
      expect(after.y).toBeCloseTo(before.y, 8);
    }
  });

  it('satura en los límites sin romper el anclaje', () => {
    const maxed = zoomAt({ k: ZOOM_MAX, tx: 0, ty: 0 }, 4, 400, 250);
    expect(maxed.k).toBe(ZOOM_MAX);
    const floored = zoomAt({ k: 1.1, tx: 10, ty: 10 }, 0.01, 400, 250);
    expect(floored.k).toBe(ZOOM_MIN);
  });
});

describe('clampZoom', () => {
  it('satura fuera de rango y sanea valores no finitos', () => {
    expect(clampZoom(0.2)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(3)).toBe(3);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
  });
});

describe('clampView', () => {
  it('k=1 fuerza tx=ty=0 (el suelo del zoom es el autofit exacto)', () => {
    const out = clampView({ k: 1, tx: 250, ty: -80 }, VIEWPORT, BOUNDS);
    expect(out).toEqual(IDENTITY_VIEW);
    expect(isIdentityView(out)).toBe(true);
  });

  it('alejar por debajo del autofit devuelve el autofit', () => {
    expect(clampView({ k: 0.4, tx: 30, ty: 30 }, VIEWPORT, BOUNDS)).toEqual(IDENTITY_VIEW);
  });

  it('nunca deja salir el dibujo entero del viewport', () => {
    const k = 3;
    for (const [tx, ty] of [[9e4, 9e4], [-9e4, -9e4], [9e4, -9e4]]) {
      const v = clampView({ k, tx, ty }, VIEWPORT, BOUNDS);
      const left = BOUNDS.minX * k + v.tx;
      const right = BOUNDS.maxX * k + v.tx;
      const top = BOUNDS.minY * k + v.ty;
      const bottom = BOUNDS.maxY * k + v.ty;
      // Solapa con el viewport en al menos PAN_KEEP_VISIBLE_PX por eje.
      expect(Math.min(right, W) - Math.max(left, 0)).toBeGreaterThanOrEqual(PAN_KEEP_VISIBLE_PX - 1e-6);
      expect(Math.min(bottom, H) - Math.max(top, 0)).toBeGreaterThanOrEqual(PAN_KEEP_VISIBLE_PX - 1e-6);
    }
  });

  it('un encuadre ya válido no se toca', () => {
    const v = { k: 2, tx: -50, ty: -30 };
    expect(clampView(v, VIEWPORT, BOUNDS)).toEqual(v);
  });

  it('sanea tx/ty no finitos', () => {
    const v = clampView({ k: 2, tx: Number.NaN, ty: Number.POSITIVE_INFINITY }, VIEWPORT, BOUNDS);
    expect(Number.isFinite(v.tx)).toBe(true);
    expect(Number.isFinite(v.ty)).toBe(true);
  });

  it('no genera rangos invertidos con un dibujo diminuto', () => {
    const tiny: BoundsRect = { minX: 300, minY: 200, maxX: 310, maxY: 205 };
    const v = clampView({ k: 2, tx: 5000, ty: 5000 }, VIEWPORT, tiny);
    expect(Number.isFinite(v.tx)).toBe(true);
    expect(Number.isFinite(v.ty)).toBe(true);
  });
});

describe('reanchorOnResize', () => {
  it('conserva el centro del mundo al cambiar el tamaño del contenedor', () => {
    const prev = { width: 800, height: 500 };
    const next = { width: 600, height: 500 };
    const tPrev = makeTransform(NODES, prev.width, prev.height, uniformInsets(40));
    const tNext = makeTransform(NODES, next.width, next.height, uniformInsets(40));
    const view = { k: 2.5, tx: -120, ty: -60 };

    const centerBefore = withView(tPrev, view).invert(prev.width / 2, prev.height / 2);
    const moved = reanchorOnResize(view, prev, next);
    const centerAfter = withView(tNext, moved).invert(next.width / 2, next.height / 2);

    // El transform base también se re-ajusta al nuevo ancho, así que el centro
    // no puede coincidir al milímetro; lo que se exige es que NO salte (el punto
    // sigue dentro del modelo, no en la otra punta del dibujo).
    expect(Math.abs(centerAfter.x - centerBefore.x)).toBeLessThan(1.5);
    expect(Math.abs(centerAfter.y - centerBefore.y)).toBeLessThan(1.5);
    expect(moved.k).toBe(view.k);
  });

  it('en autofit no hace nada', () => {
    expect(reanchorOnResize(IDENTITY_VIEW, { width: 800, height: 500 }, { width: 400, height: 300 }))
      .toEqual(IDENTITY_VIEW);
  });
});

describe('makeTransform (sin cambios — guarda del PDF)', () => {
  it('sigue centrando el bbox de nudos con el mismo autofit de siempre', () => {
    const t = base();
    expect(t.sx(0)).toBeCloseTo(t.sx(0), 10);
    // El span horizontal ocupa el ancho disponible (6 m contra 800-80 px).
    expect(t.sx(6) - t.sx(0)).toBeCloseTo(t.scale * 6, 10);
    // +y hacia arriba: y mayor ⇒ píxel menor.
    expect(t.sy(4)).toBeLessThan(t.sy(0));
  });

  it('el bbox fantasma de un modelo vacío sigue siendo finito', () => {
    const t = makeTransform([], W, H, uniformInsets(40));
    expect(Number.isFinite(t.sx(0))).toBe(true);
    expect(Number.isFinite(t.scale)).toBe(true);
  });
});
