/**
 * La geometría de los dibujos coloca las zonas que el motor ya ha medido: aquí
 * se comprueba que las coloca sin perder ni inventar área, dentro del
 * edificio y sin solaparse, en las dos direcciones y con las dos cumbreras.
 */

import { describe, expect, it } from 'vitest';
import { calcularViento } from '../../lib/acciones';
import { desarrolloFachadas, escalaQueCabe, zonasCubiertaEnPlanta, type Rect } from '../../features/viento-nieve/lienzo/geometria';

const DIMS = { x: 20, y: 12 };

function edificio(cumbrera: 'x' | 'y') {
  const ancho = cumbrera === 'x' ? DIMS.y : DIMS.x;
  return calcularViento({
    zona: 'B',
    aspereza: 'IV',
    plantas: [{ h: 3 }, { h: 6 }, { h: 9 }],
    dimensiones: DIMS,
    cubierta: { pendiente: 40, alturaCoronacion: 9 + (ancho / 2) * Math.tan((40 * Math.PI) / 180), cumbrera },
    paramentos: {},
  });
}

const area = (r: Rect) => r.w * r.h;
const solapan = (a: Rect, b: Rect) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

describe('zonas de la cubierta en planta', () => {
  for (const cumbrera of ['x', 'y'] as const) {
    for (const direccion of ['perpendicular', 'paralela'] as const) {
      it(`cumbrera ∥ ${cumbrera.toUpperCase()}, viento ${direccion}: cada zona conserva su área, todo cabe y nada se solapa`, () => {
        const v = edificio(cumbrera);
        const d = v.cubierta![direccion];
        const planta = zonasCubiertaEnPlanta(d, cumbrera, DIMS);

        // El viento perpendicular a una cumbrera ∥ X sopla según Y.
        expect(planta.viento).toBe((direccion === 'perpendicular') === (cumbrera === 'x') ? 'y' : 'x');

        for (const z of d.zonas) {
          const suma = planta.rects.filter((r) => r.zona.zona === z.zona).reduce((s, r) => s + area(r), 0);
          expect(suma).toBeCloseTo(z.area * z.piezas, 9);
        }
        const total = planta.rects.reduce((s, r) => s + area(r), 0);
        expect(total).toBeCloseTo(DIMS.x * DIMS.y, 9);

        for (const r of planta.rects) {
          expect(r.x).toBeGreaterThanOrEqual(-1e-9);
          expect(r.y).toBeGreaterThanOrEqual(-1e-9);
          expect(r.x + r.w).toBeLessThanOrEqual(DIMS.x + 1e-9);
          expect(r.y + r.h).toBeLessThanOrEqual(DIMS.y + 1e-9);
        }
        for (let i = 0; i < planta.rects.length; i++) {
          for (let j = i + 1; j < planta.rects.length; j++) {
            expect(solapan(planta.rects[i], planta.rects[j])).toBe(false);
          }
        }
      });
    }
  }

  it('con viento perpendicular los rincones F están en el alero de barlovento y J justo tras la cumbrera', () => {
    const v = edificio('x');
    const planta = zonasCubiertaEnPlanta(v.cubierta!.perpendicular, 'x', DIMS);
    const F = planta.rects.filter((r) => r.zona.zona === 'F');
    expect(F).toHaveLength(2);
    expect(F.map((r) => r.y)).toEqual([0, 0]);
    expect(F.map((r) => r.x).sort((a, b) => a - b)).toEqual([0, 20 - F[0].w]);
    const J = planta.rects.find((r) => r.zona.zona === 'J')!;
    expect(J.y).toBeCloseTo(6, 9);
    expect(planta.cumbrera).toEqual({ x1: 0, y1: 6, x2: 20, y2: 6 });
  });

  it('con viento paralelo hay una pieza por faldón y el viento entra por el hastial de la izquierda', () => {
    const v = edificio('x');
    const planta = zonasCubiertaEnPlanta(v.cubierta!.paralela, 'x', DIMS);
    expect(planta.viento).toBe('x');
    const H = planta.rects.filter((r) => r.zona.zona === 'H');
    expect(H).toHaveLength(2);
    expect(H.map((r) => r.y).sort((a, b) => a - b)).toEqual([0, 6]);
    expect(H[0].x).toBeCloseTo(v.cubierta!.paralela.e / 10, 9);
  });
});

describe('desarrollo de las fachadas', () => {
  it('D · lateral · E · lateral, con A pegada a D en las dos laterales', () => {
    const v = edificio('x');
    const des = desarrolloFachadas(v.paramentos!.y, 'x');
    expect(des.segmentos.map((s) => s.nombre)).toEqual(['D', 'lateral', 'E', 'lateral2']);
    expect(des.total).toBeCloseTo(2 * 20 + 2 * 12, 9);
    const [D, lat1, E, lat2] = des.segmentos;
    expect(D.tramos[0].zona.zona).toBe('D');
    expect(E.tramos[0].zona.zona).toBe('E');
    expect(lat1.tramos.map((t) => t.zona.zona)).toEqual(['A', 'B']);
    expect(lat1.tramos[0].x0).toBe(0);
    expect(lat2.tramos.map((t) => t.zona.zona)).toEqual(['B', 'A']);
    expect(lat2.tramos[1].x0 + lat2.tramos[1].ancho).toBeCloseTo(12, 9);
    expect(lat1.tramos.reduce((s, t) => s + t.ancho, 0)).toBeCloseTo(12, 9);
    // Con la cumbrera ∥ X y viento según Y las laterales son los hastiales.
    expect(D.hastial).toBe(false);
    expect(lat1.hastial).toBe(true);
  });

  it('según X la lateral lleva C y D/E son los hastiales', () => {
    const v = edificio('x');
    const des = desarrolloFachadas(v.paramentos!.x, 'x');
    expect(des.segmentos[1].tramos.map((t) => t.zona.zona)).toEqual(['A', 'B', 'C']);
    expect(des.segmentos[3].tramos.map((t) => t.zona.zona)).toEqual(['C', 'B', 'A']);
    expect(des.segmentos[0].hastial).toBe(true);
    expect(des.segmentos[1].hastial).toBe(false);
    expect(desarrolloFachadas(v.paramentos!.x, null).segmentos.every((s) => !s.hastial)).toBe(true);
  });
});

describe('escala', () => {
  it('cabe por el lado que limita', () => {
    expect(escalaQueCabe(20, 12, 400, 400)).toBe(20);
    expect(escalaQueCabe(20, 12, 400, 120)).toBe(10);
    expect(escalaQueCabe(0, 12, 400, 120)).toBe(1);
  });
});
