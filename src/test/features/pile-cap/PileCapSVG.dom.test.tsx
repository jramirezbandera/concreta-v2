// PileCapSVG — la planta dibuja el contorno que devuelve el motor: rectángulo
// para 2 y 4 micropilotes y el triángulo achaflanado (hexágono) para 3, que
// hasta 2026-09-15 se pintaba como un rectángulo Lx × Ly que no existe en obra.
//
// Estrategia: motor → result → mount, sin mockear el result.

import { describe, expect, it } from 'vitest';
import { render as rtlRender } from '@testing-library/react';
import { PileCapSVG } from '../../../features/pile-cap/PileCapSVG';
import { calcPileCap } from '../../../lib/calculations/pileCap';
import { pileCapDefaults } from '../../../data/defaults';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(ui, { wrapper: UnitSystemProvider });

function planPolygon(n: number, width = 440) {
  const inp = { ...pileCapDefaults, n };
  const result = calcPileCap(inp);
  expect(result.valid).toBe(true);
  const { container } = render(
    <PileCapSVG inp={inp} result={result} width={width} mode="pdf" />,
  );
  const plan = container.querySelector('svg[aria-label="Vista en planta del encepado"]');
  expect(plan).not.toBeNull();
  const poly = plan!.querySelector('polygon');
  expect(poly).not.toBeNull();
  const pts = poly!.getAttribute('points')!.trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  });
  return { pts, plan: plan!, size: Number(plan!.getAttribute('width')) };
}

describe('PileCapSVG — contorno en planta', () => {
  it('n=2 y n=4: rectángulo de 4 vértices', () => {
    expect(planPolygon(2).pts).toHaveLength(4);
    expect(planPolygon(4).pts).toHaveLength(4);
  });

  it('n=3: hexágono (triángulo achaflanado) dentro del lienzo, con el chaflán superior horizontal', () => {
    const { pts, size } = planPolygon(3);
    expect(pts).toHaveLength(6);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(size);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(size);
    }
    // Chaflán superior: los dos primeros vértices a la misma altura, arriba del todo
    expect(pts[0].y).toBeCloseTo(pts[1].y, 6);
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(pts[0].y, 6);
    // Vértices más anchos a la altura de los pilotes inferiores, no en la base
    const xs = pts.map((p) => p.x);
    const left = pts[xs.indexOf(Math.min(...xs))];
    const bottom = Math.max(...pts.map((p) => p.y));
    expect(left.y).toBeLessThan(bottom);
  });

  it('n=3: cota s · e arriba y envolvente a la derecha, sin Lx/Ly', () => {
    const { plan } = planPolygon(3);
    const texts = Array.from(plan.querySelectorAll('text')).map((t) => t.textContent ?? '');
    expect(texts.some((t) => /^s=1200 · e=400 mm$/.test(t))).toBe(true);
    expect(texts.some((t) => /^env\. \d+×\d+ mm$/.test(t))).toBe(true);
    expect(texts.some((t) => t.startsWith('Lx='))).toBe(false);
  });

  it('tirantes sólo entre pilotes contiguos: 1 con n=2, 3 con n=3 y 4 con n=4 (sin diagonales)', () => {
    const ties = (n: number) => planPolygon(n).plan.querySelectorAll('line').length;
    expect(ties(2)).toBe(1);
    expect(ties(3)).toBe(3);
    expect(ties(4)).toBe(4);
  });

  it('la cota superior queda por encima del contorno (no lo pisa)', () => {
    const { pts, plan } = planPolygon(3);
    const top = Math.min(...pts.map((p) => p.y));
    const label = Array.from(plan.querySelectorAll('text'))
      .find((t) => (t.textContent ?? '').startsWith('s='))!;
    expect(Number(label.getAttribute('y'))).toBeLessThan(top);
  });
});
