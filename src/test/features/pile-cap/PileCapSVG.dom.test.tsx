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

// ── Maqueta del dibujo: escala, alineación y rótulos ───────────────────
//
// Hasta 2026-09-21 cada vista se escalaba contra una caja de ALTO FIJO
// (`width·0.62` la planta, `width·0.55` menos 80 px de arranque de pilar la
// sección). Consecuencias, las dos visibles en el PDF entregado:
//
//   • cualquier encepado más alto que ancho en planta se escalaba por el alto
//     y dejaba un tercio del lienzo en blanco a los lados: con 6 micropilotes
//     de 2200×2700 el encepado medía 76 px de los 320 del lienzo del PDF —en
//     el papel, 20 mm de los 85 de su columna— y los rótulos de reacción se
//     pisaban unos a otros.
//   • la sección salía a un quinto de la escala de la planta, que es justo lo
//     que un plano no hace.
//
// jsdom no mide texto: la caja de cada rótulo se estima con el paso de la
// monoespaciada, el mismo criterio con el que el dibujo los coloca (y el mismo
// que usa el test del lienzo de viento y nieve).
interface Caja { texto: string; x0: number; x1: number; y0: number; y1: number }

function cajasTexto(svg: SVGSVGElement): Caja[] {
  return [...svg.querySelectorAll('text')]
    .filter((t) => !t.hasAttribute('transform'))   // la cota Ly va girada 90º
    .map((t) => {
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      const tam = Number(t.getAttribute('font-size') ?? 10);
      const texto = t.textContent ?? '';
      const w = texto.length * tam * 0.6;
      const ancla = t.getAttribute('text-anchor') ?? 'start';
      const x0 = ancla === 'end' ? x - w : ancla === 'middle' ? x - w / 2 : x;
      return { texto, x0, x1: x0 + w, y0: y - tam * 0.75, y1: y + tam * 0.2 };
    });
}

function solapes(cajas: Caja[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i]; const b = cajas[j];
      const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (dx > 2 && dy > 2) out.push(`«${a.texto}» ∩ «${b.texto}»`);
    }
  }
  return out;
}

/** Geometrías que destaparon el problema, incluida la del usuario (6 micros). */
const CASOS: [string, Partial<typeof pileCapDefaults>][] = [
  ['2 micropilotes (defaults)', { n: 2 }],
  ['3 micropilotes', { n: 3 }],
  ['4 micropilotes', { n: 4 }],
  ['6 micropilotes 2200×2700 (la obra del usuario)', {
    n: 6, s: 1000, s_x: 1500, d_p: 185, h_enc: 900,
    N_Ed: 2250, R_adm: 422, fck: 30, phi_tie: 16, cover: 70, b_col: 300, h_col: 300,
  }],
  ['6 micropilotes muy alargado en y', { n: 6, s: 1800, s_x: 900, N_Ed: 1200 }],
  ['4 micropilotes con momentos (reacciones distintas)', { n: 4, Mx_Ed: 40, My_Ed: 40 }],
];

const ANCHOS = [320, 440];   // el del clon del PDF y el del lienzo de pantalla

describe('PileCapSVG — maqueta: escala compartida y rótulos sin solapes', () => {
  for (const [nombre, tweak] of CASOS) {
    for (const width of ANCHOS) {
      it(`${nombre} a ${width} px`, () => {
        const inp = { ...pileCapDefaults, ...tweak };
        const result = calcPileCap(inp);
        expect(result.valid).toBe(true);
        const { container } = render(
          <PileCapSVG inp={inp} result={result} width={width} mode="pdf" />,
        );
        const plan = container.querySelector('svg[aria-label="Vista en planta del encepado"]') as SVGSVGElement;
        const sec = container.querySelector('svg[aria-label="Sección transversal del encepado"]') as SVGSVGElement;
        expect(plan).not.toBeNull();
        expect(sec).not.toBeNull();

        // 1. Ningún rótulo encima de otro, en ninguna de las dos vistas
        expect(solapes(cajasTexto(plan))).toEqual([]);
        expect(solapes(cajasTexto(sec))).toEqual([]);

        // 2. Nada se sale del lienzo
        for (const svg of [plan, sec]) {
          const w = Number(svg.getAttribute('width'));
          const h = Number(svg.getAttribute('height'));
          for (const c of cajasTexto(svg)) {
            expect(c.x0).toBeGreaterThan(-2);
            expect(c.x1).toBeLessThan(w + 2);
            expect(c.y0).toBeGreaterThan(-2);
            expect(c.y1).toBeLessThan(h + 2);
          }
        }

        // 3. El encepado OCUPA el lienzo. Manda el ancho útil, salvo que la
        //    planta sea tan alargada que el tope de alto entre en juego: ahí
        //    el dibujo se hace estrecho a propósito, para no convertir el
        //    lienzo en una tira. Una cosa o la otra, nunca pequeño en las dos.
        const pts = plan.querySelector('polygon')!.getAttribute('points')!
          .trim().split(/\s+/).map((par) => par.split(',').map(Number));
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const anchoPlanta = Math.max(...xs) - Math.min(...xs);
        const altoPlanta = Math.max(...ys) - Math.min(...ys);
        if (altoPlanta < width * 1.1) {
          expect(anchoPlanta / width).toBeGreaterThan(0.5);
        } else {
          expect(altoPlanta / width).toBeGreaterThan(1.1);
        }

        // 4. Planta y sección, a la MISMA escala y alineadas: se puede bajar
        //    una cota de una a otra, como en un plano.
        const rects = [...sec.querySelectorAll('rect')];
        const capa = rects.reduce((a, b) =>
          Number(b.getAttribute('width')) > Number(a.getAttribute('width')) ? b : a);
        expect(Number(capa.getAttribute('width'))).toBeCloseTo(anchoPlanta, 1);
        expect(Number(capa.getAttribute('x'))).toBeCloseTo(Math.min(...xs), 1);
      });
    }
  }
});
