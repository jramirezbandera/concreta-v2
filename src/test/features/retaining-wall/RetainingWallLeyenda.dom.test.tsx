/**
 * INVARIANTE DE LA LEYENDA DEL ARMADO: cabe en su tira, y la tira no pisa el
 * muro.
 *
 * Origen (2026-09-22): la tira se repartía siempre en TRES columnas y el
 * dibujo le reservaba SIEMPRE 110 px de margen inferior, midiera lo que
 * midiera el lienzo. A 340 px cada columna quedaba en 81 px, así que
 * «Sup. zapata (talón)» se comía su propio «Ø12 c/200» —el rótulo y su cifra
 * se pisaban— y nadie lo veía porque el cálculo estaba bien y el PDF, que se
 * monta a 560, sí cabía.
 *
 * Ahora el número de columnas sale de medir la entrada más ancha (y baja a los
 * rótulos cortos antes que a una sola columna), y el alto de la tira ES el
 * margen inferior del dibujo. Aquí se comprueba, en los seis anchos a los que
 * se monta y en los dos juegos de textos (pantalla y el ASCII del PDF), que
 * ningún rótulo de la leyenda se pisa con otro ni se sale de la tira, que la
 * tira no se mete en el hormigón, y que a tamaño de PDF se siguen viendo las
 * tres columnas de siempre.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RetainingWallSVG } from '../../../features/retaining-wall/RetainingWallSVG';
import { calcRetainingWall } from '../../../lib/calculations/retainingWall';
import { retainingWallDefaults } from '../../../data/defaults';
import { cajasTexto, solapes, type CajaRotulo } from '../../helpers/rotulos';

afterEach(() => cleanup());

/** Los anchos reales: `mobileW` va de 240 a 480, escritorio hasta 500, PDF 560. */
const ANCHOS = [240, 300, 340, 400, 500, 560];

/** Armado completo: las siete familias, que es cuando la leyenda va más justa. */
const INP = {
  ...retainingWallDefaults, H: 4, hf: 0.6, bTalon: 1.8,
  diam_fv_int: 12, diam_fv_ext: 12, diam_fh: 12,
  diam_zs: 12, diam_zi: 12, diam_zt_inf: 12, diam_zt_sup: 12,
} as typeof retainingWallDefaults;

function pinta(width: number, height: number, mode: 'screen' | 'pdf') {
  const { container } = render(
    <RetainingWallSVG inp={INP} result={calcRetainingWall(INP)}
      mode={mode} width={width} height={height} view="rebar" />,
  );
  const svg = container.querySelector('svg') as SVGSVGElement;
  const tira = svg.querySelector('rect[fill-opacity="0.6"]') as SVGRectElement;
  const y0 = Number(tira.getAttribute('y'));
  const x0 = Number(tira.getAttribute('x'));
  return {
    svg,
    tira: { x0, y0, x1: x0 + Number(tira.getAttribute('width')), y1: y0 + Number(tira.getAttribute('height')) },
    hormigon: [...svg.querySelectorAll('rect')]
      .filter((r) => (r.getAttribute('fill') ?? '').startsWith('url('))
      .map((r) => Number(r.getAttribute('y')) + Number(r.getAttribute('height'))),
  };
}

describe.each(['screen', 'pdf'] as const)('leyenda del armado (%s)', (mode) => {
  it.each(ANCHOS)('a %i px ningún rótulo se pisa ni se sale de la tira', (width) => {
    const height = width === 560 ? 460 : Math.round(width * (480 / 420));
    const { svg, tira, hormigon } = pinta(width, height, mode);
    const dentro: CajaRotulo[] = cajasTexto(svg).filter((c) => c.y0 >= tira.y0);

    expect(dentro.length).toBeGreaterThanOrEqual(8); // 7 familias + «LEYENDA»
    expect(solapes(dentro)).toEqual([]);
    expect(dentro.filter((c) => c.x0 < tira.x0 - 2 || c.x1 > tira.x1 + 2)).toEqual([]);
    // La tira arranca por debajo del hormigón: nunca se dibuja encima del muro.
    expect(Math.max(...hormigon)).toBeLessThanOrEqual(tira.y0);
  });
});

it('a tamaño de PDF la leyenda mantiene sus tres columnas', () => {
  const { svg, tira } = pinta(560, 460, 'pdf');
  const columnas = new Set(
    cajasTexto(svg)
      .filter((c) => c.y0 >= tira.y0 && c.texto !== 'LEYENDA')
      .map((c) => Math.round(c.x0)),
  );
  expect(columnas.size).toBe(6); // 3 columnas × (rótulo + cifra)
});
