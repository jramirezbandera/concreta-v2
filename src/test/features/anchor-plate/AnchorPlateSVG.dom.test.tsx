// AnchorPlateSVG — el dibujo tiene que enseñar la MISMA geometría que calcula
// el motor: cartelas pegadas a las caras del pilar y continuas de borde a
// borde, barras en las celdas que dejan, y el alzado con la cartela del frente
// achaflanada a 45°. Hasta 2026-09-23 las barras de la disposición 6/8/9
// salían pintadas encima de las cartelas (y el motor ni se enteraba).
//
// Estrategia: motor → result → mount, sin mockear el result. Los elementos se
// buscan por `data-role`, que el componente pone para esto.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { AnchorPlateSVG } from '../../../features/anchor-plate/AnchorPlateSVG';
import { calcAnchorPlate } from '../../../lib/calculations/anchorPlate';
import { anchorPlateDefaults, type AnchorPlateInputs } from '../../../data/defaults';

interface Caja { x: number; y: number; w: number; h: number }
interface Circulo { cx: number; cy: number; r: number }

function montar(patch: Partial<AnchorPlateInputs> = {}, width = 720, height = 792) {
  const inp = { ...anchorPlateDefaults, ...patch };
  const result = calcAnchorPlate(inp);
  const { container } = render(
    <AnchorPlateSVG inp={inp} result={result} mode="screen" width={width} height={height} />,
  );
  const svg = container.querySelector('svg')!;
  const num = (el: Element, a: string) => Number(el.getAttribute(a));
  const cajas = (role: string): Caja[] =>
    Array.from(svg.querySelectorAll(`rect[data-role="${role}"]`)).map((r) => ({
      x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height'),
    }));
  const barras: Circulo[] = Array.from(svg.querySelectorAll('circle[data-role="barra-planta"]')).map((c) => ({
    cx: num(c, 'cx'), cy: num(c, 'cy'), r: num(c, 'r'),
  }));
  const poligono = svg.querySelector('polygon[data-role="rigidizador-alzado"]');
  const puntos = poligono
    ? poligono.getAttribute('points')!.trim().split(/\s+/).map((par) => {
      const [x, y] = par.split(',').map(Number);
      return { x, y };
    })
    : [];
  return { inp, result, svg, cajas, barras, puntos };
}

/** Distancia del centro del círculo a la caja (0 si está dentro). */
function distancia(c: Circulo, k: Caja): number {
  const dx = Math.max(k.x - c.cx, 0, c.cx - (k.x + k.w));
  const dy = Math.max(k.y - c.cy, 0, c.cy - (k.y + k.h));
  return Math.hypot(dx, dy);
}

describe('AnchorPlateSVG — planta: las barras no pisan las cartelas', () => {
  for (const n of [4, 6, 8, 12] as const) {
    it(`disposición ${n} con el «#» de los defaults: ninguna barra toca una cartela`, () => {
      const { cajas, barras, result } = montar({ bar_nLayout: n });
      const rigs = cajas('rigidizador-planta');
      expect(rigs).toHaveLength(4);
      expect(barras).toHaveLength(n);
      for (const b of barras) for (const r of rigs) {
        expect(distancia(b, r)).toBeGreaterThan(b.r);
      }
      expect(result.warnings.filter((w) => w.severity === 'fail')).toHaveLength(0);
    });
  }

  it('la geometría histórica (400×300, ey=50, par X) pinta las barras sobre la cartela Y el motor lo marca como no construible', () => {
    const { cajas, barras, result } = montar({
      plate_a: 400, plate_b: 300, bar_nLayout: 4, bar_edge_x: 50, bar_edge_y: 50, rib_count: 2,
    });
    const rigs = cajas('rigidizador-planta');
    expect(rigs).toHaveLength(2);
    const pisan = barras.filter((b) => rigs.some((r) => distancia(b, r) < b.r));
    expect(pisan).toHaveLength(4);
    expect(result.warnings.some((w) => w.severity === 'fail' && /pisa/.test(w.message))).toBe(true);
  });

  it('las cartelas van de borde a borde de la placa y pegadas al pilar (par X horizontal, par Y vertical)', () => {
    const { cajas } = montar();
    const placa = cajas('placa-planta')[0];
    const rigs = cajas('rigidizador-planta');
    const horizontales = rigs.filter((r) => r.w > r.h);
    const verticales = rigs.filter((r) => r.h > r.w);
    expect(horizontales).toHaveLength(2);
    expect(verticales).toHaveLength(2);
    for (const r of horizontales) {
      expect(r.x).toBeCloseTo(placa.x, 6);
      expect(r.w).toBeCloseTo(placa.w, 6);
    }
    for (const r of verticales) {
      expect(r.y).toBeCloseTo(placa.y, 6);
      expect(r.h).toBeCloseTo(placa.h, 6);
    }
    // Simétricas respecto al centro de la placa y separadas por el canto del HEB-200 (200 mm).
    const escala = placa.w / anchorPlateDefaults.plate_a;
    const [v1, v2] = verticales.sort((a, b) => a.x - b.x);
    expect(v2.x - (v1.x + v1.w)).toBeCloseTo(200 * escala, 6);
  });

  it('rib_count=0: sin cartelas en planta ni en alzado', () => {
    const { cajas, svg } = montar({ rib_count: 0 });
    expect(cajas('rigidizador-planta')).toHaveLength(0);
    expect(svg.querySelector('[data-role="rigidizador-alzado"]')).toBeNull();
    expect(svg.querySelector('[data-role="rigidizador-alzado-canto"]')).toBeNull();
  });

  it('el perfil se dibuja con su contorno real (un path con arcos), no como tres rectángulos', () => {
    const { svg } = montar();
    const perfil = svg.querySelector('path[data-role="perfil-planta"]');
    expect(perfil).not.toBeNull();
    expect(perfil!.getAttribute('d')).toMatch(/ A /);
  });
});

describe('AnchorPlateSVG — alzado: la cartela del frente, achaflanada a 45°', () => {
  it('rib_count=2: un polígono de borde a borde de la placa con dos tramos a 45° y sin tiras de canto', () => {
    const { cajas, puntos, svg } = montar({ rib_count: 2 });
    expect(puntos).toHaveLength(6);
    const placa = cajas('placa-alzado')[0];
    const xs = puntos.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(placa.x, 6);
    expect(Math.max(...xs)).toBeCloseTo(placa.x + placa.w, 6);
    // Los dos chaflanes: tramos consecutivos con |dx| = |dy| > 0.
    const chaflanes = puntos.filter((p, i) => {
      const q = puntos[(i + 1) % puntos.length];
      const dx = Math.abs(q.x - p.x), dy = Math.abs(q.y - p.y);
      return dx > 1 && Math.abs(dx - dy) < 1e-6;
    });
    expect(chaflanes).toHaveLength(2);
    // Apoya en la cara superior de la placa y sube rib_h a escala sobre el pilar.
    const escala = placa.w / anchorPlateDefaults.plate_a;
    expect(Math.max(...puntos.map((p) => p.y))).toBeCloseTo(placa.y, 6);
    expect(placa.y - Math.min(...puntos.map((p) => p.y))).toBeCloseTo(anchorPlateDefaults.rib_h * escala, 6);
    expect(svg.querySelectorAll('[data-role="rigidizador-alzado-canto"]')).toHaveLength(0);
  });

  it('rib_count=4: además, las dos cartelas del par Y de canto, pegadas a las caras de las alas', () => {
    const { cajas } = montar({ rib_count: 4 });
    const cantos = cajas('rigidizador-alzado-canto');
    const placa = cajas('placa-alzado')[0];
    expect(cantos).toHaveLength(2);
    const escala = placa.w / anchorPlateDefaults.plate_a;
    const centro = placa.x + placa.w / 2;
    const [c1, c2] = cantos.sort((a, b) => a.x - b.x);
    expect(centro - (c1.x + c1.w)).toBeCloseTo(100 * escala, 6);   // cara del ala del HEB-200
    expect(c2.x - centro).toBeCloseTo(100 * escala, 6);
    expect(c1.w).toBeCloseTo(anchorPlateDefaults.rib_t * escala, 6);
  });

  it('el chaflán muere donde lo lleva el 45° cuando el vuelo es corto (placa 260 con HEB-200)', () => {
    // vuelo = 30 < caída (120 − 36 = 84): el extremo queda a 120 − 30 = 90 sobre la placa.
    const { cajas, puntos } = montar({ plate_a: 260, plate_b: 400, bar_edge_x: 20, rib_count: 2 });
    const placa = cajas('placa-alzado')[0];
    const escala = placa.w / 260;
    const extremo = puntos.find((p) => Math.abs(p.x - placa.x) < 1e-6 && p.y < placa.y - 1)!;
    expect(placa.y - extremo.y).toBeCloseTo(90 * escala, 6);
  });
});

describe('AnchorPlateSVG — una sola escala para las dos vistas', () => {
  it('la placa mide lo mismo en planta y en alzado', () => {
    const { cajas } = montar();
    expect(cajas('placa-planta')[0].w).toBeCloseTo(cajas('placa-alzado')[0].w, 6);
  });
});
