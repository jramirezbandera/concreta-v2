/**
 * La planta dibujada: el número de cada plano va en su burbuja, fuera del
 * rectángulo, y dentro sólo la fuerza. Con un único rótulo «1 · 592 kN» el
 * separador se leía como punto de millar: «1592 kN».
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { PlantaSVG } from '../../features/seismic-ncse02/SeismicSVG';
import {
  defaultSeismicState,
  evaluarSismo,
  normalizeSeismicState,
  type SeismicState,
} from '../../features/seismic-ncse02/state';

afterEach(cleanup);

function textos(s: SeismicState, eje: 'x' | 'y' | 'ambas', width: number) {
  const { container } = render(
    <UnitSystemProvider>
      <PlantaSVG state={s} evaluacion={evaluarSismo(s)} eje={eje} width={width} modo="pdf" />
    </UnitSystemProvider>,
  );
  // Sólo el texto propio de cada <text>: algunos llevan un <title> dentro
  // (el tooltip), y ése no se ve en la figura.
  return [...container.querySelectorAll('svg text')].map((t) => ({
    t: [...t.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join(''),
    y: Number(t.getAttribute('y')),
  }));
}

/** Cinco planos de X: los cuatro por defecto y uno añadido en el centro. */
function conPlanoEnMedio(): SeismicState {
  const d = defaultSeismicState();
  return normalizeSeismicState({
    ...d,
    x: { ...d.x, elementos: [...d.x.elementos, { id: 'medio', x: 0, k: 1 }] },
  });
}

describe('PlantaSVG', () => {
  it('numera los planos activos en burbujas, en el orden de la planta, y deja la fuerza sola', () => {
    const ts = textos(conPlanoEnMedio(), 'x', 360);
    // Las burbujas: cinco números sueltos, consecutivos de abajo (y mayor en
    // pantalla) arriba.
    const burbujas = ts.filter((x) => /^[0-9]+$/.test(x.t));
    expect(burbujas.map((b) => b.t)).toEqual(['1', '2', '3', '4', '5']);
    for (let i = 1; i < burbujas.length; i++) expect(burbujas[i].y).toBeLessThan(burbujas[i - 1].y);
    // Las fuerzas: una por plano y SIN número delante. La cabecera «Σ f = …»
    // es la única otra que termina en kN.
    const fuerzas = ts.filter((x) => /kN$/.test(x.t) && !x.t.startsWith('Σ'));
    expect(fuerzas).toHaveLength(5);
    for (const f of fuerzas) expect(f.t).toMatch(/^\d[\d.,]* kN$/);
    expect(ts.some((x) => /^\d+ · /.test(x.t))).toBe(false);
  });

  it('en modo «ambas» las dos familias llevan burbuja y ninguna lleva fuerza', () => {
    const ts = textos(defaultSeismicState(), 'ambas', 600).map((x) => x.t);
    expect(ts.filter((t) => /^[0-9]+$/.test(t)).sort()).toEqual(['1', '1', '2', '2', '3', '3', '4', '4']);
    expect(ts.some((t) => /kN$/.test(t))).toBe(false);
  });

  it('el plano imposible lleva su burbuja en rojo y, dentro, la coordenada a corregir', () => {
    const d = defaultSeismicState();
    const s = normalizeSeismicState({
      ...d,
      x: { ...d.x, elementos: [...d.x.elementos, { id: 'fuera', x: 9, k: 1 }] },
    });
    const ts = textos(s, 'x', 360).map((x) => x.t);
    expect(ts).toContain('x = 9,00 m');
    expect(ts).toContain('5');
    expect(ts).toContain('1 plano fuera de la planta');
  });
});
