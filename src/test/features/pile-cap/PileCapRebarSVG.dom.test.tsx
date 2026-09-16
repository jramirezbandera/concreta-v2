// PileCapRebarSVG — la vista «Armado»: un único <svg> (el PDF toma el primero
// del clon) con planta, dos secciones y leyenda, para 2, 3 y 4 pilotes.
//
// Estrategia: motor → result → mount, sin mockear el result.

import { describe, expect, it } from 'vitest';
import { render as rtlRender } from '@testing-library/react';
import { PileCapRebarSVG } from '../../../features/pile-cap/PileCapRebarSVG';
import { calcPileCap, insetPolygon } from '../../../lib/calculations/pileCap';
import { pileCapDefaults } from '../../../data/defaults';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(ui, { wrapper: UnitSystemProvider });

function mount(n: number, width = 440, mode: 'screen' | 'pdf' = 'screen') {
  const inp = { ...pileCapDefaults, n };
  const result = calcPileCap(inp);
  expect(result.valid).toBe(true);
  const { container } = render(<PileCapRebarSVG inp={inp} result={result} width={width} mode={mode} />);
  const svgs = container.querySelectorAll('svg');
  expect(svgs).toHaveLength(1);
  return { svg: svgs[0], result, inp };
}

describe('PileCapRebarSVG — vista Armado', () => {
  for (const n of [2, 3, 4, 6]) {
    it(`n=${n}: un solo svg con planta, secciones y leyenda; sin NaN en las coordenadas`, () => {
      const { svg } = mount(n);
      const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent ?? '');
      // Dos plantas, como en los planos tipo: ARMADO INFERIOR y ARMADO SUPERIOR
      expect(texts.some((t) => t.startsWith('ARMADO INFERIOR'))).toBe(true);
      expect(texts.some((t) => /^ARMADO SUPERIOR · 2Ø12 por banda$/.test(t))).toBe(true);
      expect(texts).toContain('SECCIÓN LONGITUDINAL');
      expect(texts).toContain('SECCIÓN TRANSVERSAL');
      expect(texts.some((t) => /^Cercos( de banda)?: Ø12 c\/100/.test(t))).toBe(true);
      expect(texts.some((t) => /^Horizontal caras( \(práctica\))?: Ø12 c\/100/.test(t))).toBe(true);
      // La retícula inferior entre bandas es cosa de 3 y 4 pilotes (EHE-08 58.4.1.2.2.1)
      expect(texts.some((t) => t.startsWith('Retícula inferior: Ø12 c/100'))).toBe(n >= 3);
      // Sección transversal: cerco perimetral (n=2) o un cerco por banda cortada (2 con n=3 y n=4, 3 con n=6)
      const stirrupRects = Array.from(svg.querySelectorAll('rect')).filter((r) => r.getAttribute('rx') === '3');
      expect(stirrupRects.length).toBe(n === 2 ? 1 : n === 6 ? 3 : 2);
      expect(svg.outerHTML).not.toMatch(/NaN/);
    });
  }

  it('la planta dibuja tantas bandas inferiores como tirantes (n=2: 1, n=3: 3, n=4: 4, n=6: 7) con sus barras', () => {
    for (const [n, bandsX, bandsY] of [[2, 1, 0], [3, 3, 0], [4, 2, 2], [6, 3, 4]] as const) {
      const { svg, result } = mount(n);
      // Las barras inferiores son las <line> de trazo continuo y ancho 1.3
      const inf = Array.from(svg.querySelectorAll('line')).filter((l) => l.getAttribute('stroke-width') === '1.3');
      const perBand = Math.min(result.n_bars_x, 30);
      const perBandY = result.n_bars_y !== null ? Math.min(result.n_bars_y, 30) : perBand;
      expect(inf.length).toBe(bandsX * perBand + bandsY * perBandY);
    }
  });

  it('la planta superior lleva n_top barras por banda y ninguna banda inferior', () => {
    const { svg, result } = mount(4);
    // Superiores: <line> de ancho 1.1; 2 por banda × 4 bandas
    const sup = Array.from(svg.querySelectorAll('line')).filter((l) => l.getAttribute('stroke-width') === '1.1');
    expect(sup.length).toBe(2 * result.ties.length);
    const none = calcPileCap({ ...pileCapDefaults, n: 2, n_top: 0 });
    const { container } = render(<PileCapRebarSVG inp={{ ...pileCapDefaults, n: 2, n_top: 0 }} result={none} width={440} />);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent ?? '');
    expect(texts).toContain('ARMADO SUPERIOR · sin barras');
  });

  it('el clon del PDF (560 px) va en rejilla: planta a la izquierda y secciones a la derecha', () => {
    const { svg } = mount(2, 560, 'pdf');
    const h = Number(svg.getAttribute('height'));
    const w = Number(svg.getAttribute('width'));
    expect(w).toBe(560);
    expect(h).toBeLessThan(w);   // apaisado: cabe en el ancho de la página
    // En pantalla (440) se apila y sale más alto que ancho
    const { svg: tall } = mount(2, 440);
    expect(Number(tall.getAttribute('height'))).toBeGreaterThan(440);
  });

  it('insetPolygon: el rectángulo encoge el recubrimiento por cada lado', () => {
    const rect = [{ x: -100, y: -50 }, { x: 100, y: -50 }, { x: 100, y: 50 }, { x: -100, y: 50 }];
    const inner = insetPolygon(rect, 10);
    expect(inner[0]).toEqual({ x: -90, y: -40 });
    expect(inner[2]).toEqual({ x: 90, y: 40 });
  });
});
