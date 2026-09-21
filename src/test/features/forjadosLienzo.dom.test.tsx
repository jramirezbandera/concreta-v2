/**
 * INVARIANTE DEL LIENZO DE FORJADOS: lo que el dibujo escribe, el dibujo lo
 * enseña entero.
 *
 * Origen (auditoría de diseño 2026-09-21): los rótulos del lado derecho se
 * colocaban en `ox + b/2 + 14`, que con el margen simétrico de entonces caía
 * en `width − 26`. A 10 px mono «h = 350» mide 42 px, así que el texto se
 * salía del `viewBox` y el SVG lo recortaba en silencio: la fibra neutra
 * ponía «x = 2» donde la tabla decía 29,2 mm, y el mismo recorte viajaba al
 * PDF, que reutiliza este componente. Ninguna suite lo veía porque el cálculo
 * estaba bien: lo que fallaba era el dibujo.
 *
 * Aquí se comprueba, para las dos variantes, los dos casos y los tres tamaños
 * a los que se monta (escritorio, móvil y el clon del PDF), que ningún rótulo
 * se sale del lienzo ni se pisa con otro. Y que con la entrada inválida el
 * dibujo se calla en vez de pintar una sección degenerada.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ForjadosSVG } from '../../features/forjados/ForjadosSVG';
import { calcForjados } from '../../lib/calculations/rcSlabs';
import { forjadosDefaults } from '../../data/defaults';
import { variantSwitchPatch } from '../../data/forjadoTipologias';
import { cajasTexto, fuera, solapes } from '../helpers/rotulos';
import type { ForjadosInputs } from '../../data/defaults';

afterEach(() => cleanup());

/** Los tres tamaños reales a los que `features/forjados/index.tsx` lo monta. */
const TAMANOS: { nombre: string; width: number; height?: number }[] = [
  { nombre: 'escritorio', width: 884, height: 340 },
  { nombre: 'móvil', width: 311 },
  { nombre: 'PDF', width: 480 },
];

const RETICULAR = forjadosDefaults;
const MACIZA: ForjadosInputs = { ...forjadosDefaults, ...variantSwitchPatch(forjadosDefaults, 'maciza') };

function pinta(inp: ForjadosInputs, section: 'vano' | 'apoyo', width: number, height?: number) {
  const result = calcForjados(inp);
  const { container } = render(
    <ForjadosSVG inp={inp} result={result} section={section} width={width} height={height} />,
  );
  const svg = container.querySelector('svg') as SVGSVGElement;
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  return { svg, vbW: vb[2], vbH: vb[3] };
}

describe('lienzo de forjados — los rótulos caben y no se pisan', () => {
  for (const variante of [
    { nombre: 'reticular', inp: RETICULAR },
    { nombre: 'losa maciza', inp: MACIZA },
  ]) {
    for (const section of ['vano', 'apoyo'] as const) {
      for (const t of TAMANOS) {
        it(`${variante.nombre} · ${section} · ${t.nombre}`, () => {
          const { svg, vbW, vbH } = pinta(variante.inp, section, t.width, t.height);
          const cajas = cajasTexto(svg);
          expect(cajas.length).toBeGreaterThan(0);
          expect(fuera(cajas, vbW, vbH)).toEqual([]);
          expect(solapes(cajas)).toEqual([]);
        });
      }
    }
  }

  /* Un canto de cuatro cifras alarga «h = …» y empuja el margen derecho: es el
     caso que rompía el original. */
  it('un canto de cuatro cifras sigue cabiendo', () => {
    const { svg, vbW, vbH } = pinta({ ...RETICULAR, h: 1000 }, 'vano', 884, 340);
    const cajas = cajasTexto(svg);
    expect(cajas.map((c) => c.texto)).toContain('h = 1000');
    expect(fuera(cajas, vbW, vbH)).toEqual([]);
    expect(solapes(cajas)).toEqual([]);
  });
});

describe('lienzo de forjados — dice lo que dibuja', () => {
  it('el rótulo de la fibra neutra lleva el mismo número que la tabla', () => {
    const result = calcForjados(RETICULAR);
    const { svg } = pinta(RETICULAR, 'vano', 884, 340);
    const textos = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '');
    // La tabla escribe `dec(x, 1)`: coma decimal y un decimal. El dibujo hacía
    // `toFixed(0)`, así que enseñaba «29» donde la tabla ponía «29,2».
    const esperado = `x = ${result.vano.x.toFixed(1).replace('.', ',')}`;
    expect(textos).toContain(esperado);
  });

  it('nombra el caso y la rama, que es lo que distingue los dos dibujos', () => {
    const vano = pinta(RETICULAR, 'vano', 884, 340);
    const apoyo = pinta(RETICULAR, 'apoyo', 884, 340);
    const leer = (s: SVGSVGElement) => [...s.querySelectorAll('text')].map((t) => t.textContent ?? '').join(' | ');
    expect(leer(vano.svg)).toContain('Vano (M+)');
    expect(leer(apoyo.svg)).toContain('Apoyo (M−)');
    // El aria-label dice desde qué cara se mide `x`: en vano desde arriba y en
    // apoyo desde abajo, que es el dato que el dibujo se callaba.
    expect(apoyo.svg.getAttribute('aria-label')).toMatch(/cara comprimida/);
  });

  it('cada instancia tiene su propio id de recorte', () => {
    const a = pinta(RETICULAR, 'vano', 884, 340);
    const b = pinta(RETICULAR, 'vano', 480);
    const idA = a.svg.querySelector('clipPath')?.id;
    const idB = b.svg.querySelector('clipPath')?.id;
    expect(idA).toBeTruthy();
    expect(idA).not.toBe(idB);
  });
});

describe('lienzo de forjados — entrada inválida', () => {
  it('con canto 0 no pinta una sección degenerada', () => {
    const inp = { ...RETICULAR, h: 0 };
    const result = calcForjados(inp);
    expect(result.valid).toBe(false);
    const { container } = render(
      <ForjadosSVG inp={inp} result={result} section="vano" width={884} height={340} />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.querySelectorAll('rect')).toHaveLength(0);
    expect(svg.querySelectorAll('circle')).toHaveLength(0);
    expect(svg.textContent).toContain('Sin sección que dibujar');
  });
});
