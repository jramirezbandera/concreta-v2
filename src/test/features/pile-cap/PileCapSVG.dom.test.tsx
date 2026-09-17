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
  it('n=2, n=4 y n=6: rectángulo de 4 vértices', () => {
    expect(planPolygon(2).pts).toHaveLength(4);
    expect(planPolygon(4).pts).toHaveLength(4);
    expect(planPolygon(6).pts).toHaveLength(4);
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

  it('tirantes = bandas del motor: 1 con n=2, 3 con n=3, 4 con n=4 y 7 con n=6 (sin diagonales)', () => {
    const ties = (n: number) => planPolygon(n).plan.querySelectorAll('line').length;
    expect(ties(2)).toBe(1);
    expect(ties(3)).toBe(3);
    expect(ties(4)).toBe(4);
    expect(ties(6)).toBe(7);
  });

  // Hasta el 2026-09-17 el micropilote más cargado se dibujaba con el MISMO
  // color que los demás (`accent` y `pileStroke` eran el mismo token) y sólo
  // cambiaba el grosor del trazo, 1,5 → 2: la leyenda señalaba algo invisible.
  it('el micropilote más cargado se distingue por color y relleno, no sólo por el trazo', () => {
    const inp = { ...pileCapDefaults, n: 6, Mx_Ed: 20, My_Ed: 20 };
    const result = calcPileCap(inp);
    const { container } = render(<PileCapSVG inp={inp} result={result} width={440} mode="pdf" />);
    const plan = container.querySelector('svg[aria-label="Vista en planta del encepado"]')!;
    // Sin placa de reparto, los círculos del dibujo son los micropilotes; el de
    // la leyenda va anclado a la izquierda (cx = 12).
    const micros = Array.from(plan.querySelectorAll('circle')).filter((el) => el.getAttribute('cx') !== '12');
    expect(micros).toHaveLength(6);
    const iCrit = result.reactions.indexOf(result.R_max);
    const strokes = micros.map((el) => el.getAttribute('stroke'));
    expect(new Set(strokes).size).toBe(2);
    expect(strokes.filter((st) => st === strokes[iCrit])).toHaveLength(1);
    expect(micros[iCrit].getAttribute('fill')).not.toBe(micros[(iCrit + 1) % 6].getAttribute('fill'));
    // Y la leyenda lo llama por su nombre: son micropilotes
    const texts = Array.from(plan.querySelectorAll('text')).map((t) => t.textContent ?? '');
    expect(texts).toContain('micropilote más cargado');
    expect(texts.some((t) => t.replace(/micropilote/g, '').includes('pilote'))).toBe(false);
  });

  it('la cota superior queda por encima del contorno (no lo pisa)', () => {
    const { pts, plan } = planPolygon(3);
    const top = Math.min(...pts.map((p) => p.y));
    const label = Array.from(plan.querySelectorAll('text'))
      .find((t) => (t.textContent ?? '').startsWith('s='))!;
    expect(Number(label.getAttribute('y'))).toBeLessThan(top);
  });
});
