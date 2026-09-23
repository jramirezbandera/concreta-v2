/**
 * Los rótulos del lienzo de zapatas no se pisan ni se salen.
 *
 * jsdom no mide texto, así que un test de contenido («el SVG dice σmax») pasa
 * con el dibujo hecho un nudo. Aquí se ESTIMA la caja de cada `<text>` con la
 * misma regla que usan los lienzos para reservar sus márgenes
 * (`anchoEstimado`) y se falla si dos se cruzan o si alguna se sale.
 *
 * Mismo helper que `viento-nieve/lienzo.dom.test.tsx`, con una diferencia: aquí
 * hay cotas GIRADAS (la L de la planta, Df y h en la maqueta estrecha), y una
 * caja sin rotar daría 130 px de ancho donde el dibujo gasta 12. Se rotan las
 * cuatro esquinas antes de comparar.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { IsolatedFootingSVG, type IsolatedFootingView } from '../../features/isolated-footing/IsolatedFootingSVG';
import { calcIsolatedFooting } from '../../lib/calculations/isolatedFooting';
import { isolatedFootingDefaults, type IsolatedFootingInputs } from '../../data/defaults';

interface Caja { texto: string; x0: number; x1: number; y0: number; y1: number }

/** Desplazamiento acumulado de los `<g transform="translate(...)">` de encima.
 *  Sin esto las dos figuras del lienzo caen una sobre otra: cada una dibuja en
 *  coordenadas locales y es su grupo el que la coloca. */
function desplazamiento(el: Element): [number, number] {
  let dx = 0;
  let dy = 0;
  for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
    const m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(n.getAttribute('transform') ?? '');
    if (m) {
      dx += Number(m[1]);
      dy += Number(m[2]);
    }
  }
  return [dx, dy];
}

function cajasTexto(svg: SVGSVGElement): Caja[] {
  return [...svg.querySelectorAll('text')].map((t) => {
    const x = Number(t.getAttribute('x'));
    const y = Number(t.getAttribute('y'));
    const tam = Number(t.getAttribute('font-size') ?? 11);
    const texto = t.textContent ?? '';
    const estilo = t.getAttribute('style') ?? '';
    const porCaracter = estilo.includes('mono') ? 0.6 : 0.52;
    const negrita = Number(t.getAttribute('font-weight') ?? 400) >= 600 ? 1.05 : 1;
    const w = texto.length * tam * porCaracter * negrita;
    const ancla = t.getAttribute('text-anchor') ?? 'start';
    const x0 = ancla === 'end' ? x - w : ancla === 'middle' ? x - w / 2 : x;
    let esquinas = [
      [x0, y - tam * 0.75], [x0 + w, y - tam * 0.75],
      [x0 + w, y + tam * 0.2], [x0, y + tam * 0.2],
    ];
    // Las cotas giradas llevan `transform="rotate(a rx ry)"`.
    const tr = /rotate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(t.getAttribute('transform') ?? '');
    if (tr) {
      const a = (Number(tr[1]) * Math.PI) / 180;
      const rx = Number(tr[2]);
      const ry = Number(tr[3]);
      const cos = Math.cos(a);
      const sen = Math.sin(a);
      esquinas = esquinas.map(([px, py]) => [
        rx + (px - rx) * cos - (py - ry) * sen,
        ry + (px - rx) * sen + (py - ry) * cos,
      ]);
    }
    const [dx, dy] = desplazamiento(t);
    const xs = esquinas.map((p) => p[0] + dx);
    const ys = esquinas.map((p) => p[1] + dy);
    return { texto, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
}

function solapes(cajas: Caja[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i];
      const b = cajas[j];
      const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (dx > 2 && dy > 2) out.push(`«${a.texto}» ∩ «${b.texto}»`);
    }
  }
  return out;
}

function fuera(cajas: Caja[], width: number, height: number): string[] {
  return cajas
    .filter((c) => c.x0 < -2 || c.x1 > width + 2 || c.y0 < -2 || c.y1 > height + 2)
    .map((c) => `«${c.texto}»`);
}

function montar(inp: IsolatedFootingInputs, view: IsolatedFootingView, width: number) {
  const result = calcIsolatedFooting(inp);
  const html = renderToStaticMarkup(
    <UnitSystemProvider>
      <IsolatedFootingSVG inp={inp} result={result} width={width} view={view} mode="pdf" />
    </UnitSystemProvider>,
  );
  const doc = new DOMParser().parseFromString(
    html.slice(html.indexOf('<svg'), html.lastIndexOf('</svg>') + 6),
    'image/svg+xml',
  );
  const svg = doc.documentElement as unknown as SVGSVGElement;
  return { svg, alto: Number(svg.getAttribute('height')) };
}

const EXC: IsolatedFootingInputs = {
  ...isolatedFootingDefaults,
  B: 2.4, L: 1.8, h: 0.45, bc: 0.4, hc: 0.3, Df: 1.0,
  N: 450, My: 120, H: 30, phi_x: 16, s_x: 150, phi_y: 12, s_y: 200,
};

const CASOS: Array<[string, IsolatedFootingInputs]> = [
  ['centrada (defaults)', isolatedFootingDefaults],
  ['excéntrica flexible', EXC],
  ['despegue parcial', { ...EXC, My: 260 }],
  ['rígida con momento', { ...EXC, h: 0.6 }],
  ['vuelco geométrico', { ...EXC, My: 700 }],
  ['zapata alargada', { ...EXC, B: 3.6, L: 1.2, My: 180 }],
  ['zapata pequeña', { ...isolatedFootingDefaults, B: 1.0, L: 1.0, h: 0.3, Df: 0.5, N: 120 }],
];

const VISTAS: IsolatedFootingView[] = ['terreno', 'armado', 'modelo'];
// 1100 y 760: maqueta de dos figuras en fila. 560: el clon del PDF. 340 y 300:
// móvil y el ancho más estrecho que el módulo llega a servir.
const ANCHOS = [1100, 760, 560, 340, 300];

describe('lienzo de zapatas: los rótulos no se pisan ni se salen', () => {
  for (const [nombre, inp] of CASOS) {
    for (const vista of VISTAS) {
      it(`${nombre} · vista ${vista}`, () => {
        for (const ancho of ANCHOS) {
          const { svg, alto } = montar(inp, vista, ancho);
          const cajas = cajasTexto(svg);
          expect(cajas.length, `${ancho} px: el lienzo no ha escrito nada`).toBeGreaterThan(4);
          expect(solapes(cajas), `rótulos que se pisan a ${ancho} px`).toEqual([]);
          expect(fuera(cajas, ancho, alto), `rótulos fuera del lienzo a ${ancho} px`).toEqual([]);
        }
      });
    }
  }
});

describe('lienzo de zapatas: una sola escala para sección y planta', () => {
  // Invariante 2 de los lienzos: si dos vistas se leen en proyección, la cota
  // de una tiene que caer donde debe en la otra. Se comprueba sobre la cota B,
  // que ambas figuras dibujan: la línea tiene que medir lo mismo en las dos.
  for (const [nombre, inp] of CASOS) {
    it(nombre, () => {
      for (const ancho of ANCHOS) {
        const { svg } = montar(inp, 'armado', ancho);
        const anchos = [...svg.querySelectorAll('text')]
          .filter((t) => (t.textContent ?? '').startsWith('B = '))
          .map((t) => {
            // El texto de la cota va centrado sobre su línea: la línea es el
            // hermano `<line>` más largo del mismo grupo.
            const g = t.parentElement!;
            const lineas = [...g.querySelectorAll('line')]
              .map((l) => Math.abs(Number(l.getAttribute('x2')) - Number(l.getAttribute('x1'))));
            return Math.max(...lineas);
          });
        expect(anchos.length, `${ancho} px: faltan cotas B`).toBe(2);
        expect(Math.abs(anchos[0] - anchos[1]), `sección y planta a distinta escala a ${ancho} px`).toBeLessThan(0.5);
      }
    });
  }
});
