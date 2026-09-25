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

describe('AnchorPlateSVG — pilar 2UPN en cajón (2026-09-23)', () => {
  // 2UPN 200 = cajón 200 × 150 en la placa de los defaults (350×350, «#», anillo de 8).
  const CAJON = { sectionType: '2UPN' as const, sectionSize: 200 };

  it('planta: las dos U enfrentadas (dos paths sin arcos) y ninguna barra del anillo toca el «#»', () => {
    const { svg, cajas, barras, result } = montar(CAJON);
    const us = Array.from(svg.querySelectorAll('path[data-role="perfil-planta"]'));
    expect(us).toHaveLength(2);
    for (const u of us) expect(u.getAttribute('d')).not.toMatch(/ A /);
    const rigs = cajas('rigidizador-planta');
    expect(rigs).toHaveLength(4);
    expect(barras).toHaveLength(8);
    for (const b of barras) for (const r of rigs) expect(distancia(b, r)).toBeGreaterThan(b.r);
    expect(result.warnings.filter((w) => w.severity === 'fail')).toHaveLength(0);
  });

  it('planta: el par X abraza las almas del cajón (y = ±75) y el par Y sus alas (x = ±100)', () => {
    const { cajas } = montar(CAJON);
    const placa = cajas('placa-planta')[0];
    const escala = placa.w / anchorPlateDefaults.plate_a;
    const cx = placa.x + placa.w / 2, cy = placa.y + placa.h / 2;
    const rigs = cajas('rigidizador-planta');
    const horizontales = rigs.filter((r) => r.w > r.h).sort((p, q) => p.y - q.y);
    const verticales = rigs.filter((r) => r.h > r.w).sort((p, q) => p.x - q.x);
    expect(horizontales).toHaveLength(2);
    expect(verticales).toHaveLength(2);
    expect(cy - (horizontales[0].y + horizontales[0].h)).toBeCloseTo(75 * escala, 6);
    expect(horizontales[1].y - cy).toBeCloseTo(75 * escala, 6);
    expect(cx - (verticales[0].x + verticales[0].w)).toBeCloseTo(100 * escala, 6);
    expect(verticales[1].x - cx).toBeCloseTo(100 * escala, 6);
  });

  it('alzado: el pilar es una chapa maciza de ancho h = 200 (el alma de la U de delante), centrada en la placa', () => {
    const { cajas } = montar(CAJON);
    const pilar = cajas('perfil-alzado');
    expect(pilar).toHaveLength(1);
    const placa = cajas('placa-alzado')[0];
    const escala = placa.w / anchorPlateDefaults.plate_a;
    expect(pilar[0].w).toBeCloseTo(200 * escala, 6);
    expect(pilar[0].x + pilar[0].w / 2).toBeCloseTo(placa.x + placa.w / 2, 6);
    expect(cajas('rigidizador-alzado-canto')).toHaveLength(2);
  });

  it('el HEB de los defaults sigue viéndose como dos alas de canto y el alma: tres tiras', () => {
    expect(montar().cajas('perfil-alzado')).toHaveLength(3);
  });
});

// ─── Cotas cX y cY (2026-09-25) ──────────────────────────────────────────
// El usuario no sabía de qué barra se medía cX. La planta la acota desde el
// eje de la fila exterior de barras, con la medida que usa el CÁLCULO: si el
// macizo está mal descrito, la cota no llega a la cara dibujada.

/** Caja estimada de un <text> (monoespaciada: 0,6·cuerpo por carácter). */
function cajaTexto(t: Element): Caja {
  const fs = Number(t.getAttribute('font-size'));
  const w = (t.textContent ?? '').length * fs * 0.6;
  const x = Number(t.getAttribute('x'));
  const y = Number(t.getAttribute('y'));
  const ancla = t.getAttribute('text-anchor') ?? 'start';
  const x0 = ancla === 'middle' ? x - w / 2 : ancla === 'end' ? x - w : x;
  const medio = t.getAttribute('dominant-baseline') === 'middle';
  const y0 = medio ? y - fs / 2 : y - 0.8 * fs;
  if (/rotate\(-90/.test(t.getAttribute('transform') ?? '')) {
    // De canto: lee de abajo arriba y el ojo de la letra mira a la izquierda.
    const y0r = ancla === 'middle' ? y - w / 2 : y - w;
    return { x: x - 0.8 * fs, y: y0r, w: fs, h: w };
  }
  return { x: x0, y: y0, w, h: fs };
}
const solapan = (a: Caja, b: Caja) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('AnchorPlateSVG — cotas cX y cY del macizo', () => {
  const PILAR_1: Partial<AnchorPlateInputs> = {
    NEd: 200, NEd_G: 120, Mx: 45, My: 10, VEd: 40, Vx: 40, Vy: 0,
    plate_a: 400, plate_b: 400, bar_nLayout: 6, bar_edge_x: 50, bar_edge_y: 50, fck: 30,
    pedestal_cX: 200, pedestal_cX1: 200, pedestal_cX2: 200,
    pedestal_cY: 200, pedestal_cY1: 200, pedestal_cY2: 200,
    plate_margin_x: 150, plate_margin_y: 150,
  };

  it('cX arranca en el eje de la fila exterior de barras y llega a la cara +x del macizo', () => {
    const { svg, barras, cajas } = montar(PILAR_1);
    const placa = cajas('placa-planta')[0];
    const escala = placa.w / 400;
    const lineas = Array.from(svg.querySelectorAll('[data-role="cota-cX"] line'));
    const cota = lineas[lineas.length - 1];
    const xBarra = Math.max(...barras.map((b) => b.cx));
    expect(Number(cota.getAttribute('x1'))).toBeCloseTo(xBarra, 3);
    expect(Number(cota.getAttribute('x2')) - Number(cota.getAttribute('x1'))).toBeCloseTo(200 * escala, 3);
    const macizo = cajas('macizo-planta')[0];
    expect(Number(cota.getAttribute('x2'))).toBeCloseTo(macizo.x + macizo.w, 3);
    expect(svg.querySelector('[data-role="cota-cX-texto"]')!.textContent).toBe('cX = 200');
    expect(svg.querySelector('[data-role="cota-cY-texto"]')!.textContent).toBe('cY = 200');
  });

  it('cY baja de la fila exterior en y hasta la cara +y del macizo', () => {
    const { svg, barras, cajas } = montar(PILAR_1);
    const lineas = Array.from(svg.querySelectorAll('[data-role="cota-cY"] line'));
    const cota = lineas[lineas.length - 1];
    expect(Number(cota.getAttribute('y1'))).toBeCloseTo(Math.max(...barras.map((b) => b.cy)), 3);
    const macizo = cajas('macizo-planta')[0];
    expect(Number(cota.getAttribute('y2'))).toBeCloseTo(macizo.y + macizo.h, 3);
  });

  it('macizo mal descrito (cX = 200 con ex + mX = 250): la cota se queda 50 mm antes de la cara', () => {
    const { svg, cajas } = montar({ ...PILAR_1, bar_edge_x: 100 });
    const escala = cajas('placa-planta')[0].w / 400;
    const lineas = Array.from(svg.querySelectorAll('[data-role="cota-cX"] line'));
    const x2 = Number(lineas[lineas.length - 1].getAttribute('x2'));
    const macizo = cajas('macizo-planta')[0];
    expect(macizo.x + macizo.w - x2).toBeCloseTo(50 * escala, 3);
  });

  const CASOS: Array<[string, Partial<AnchorPlateInputs>]> = [
    ['defaults', {}],
    ['pilar 1', PILAR_1],
    ...([4, 6, 8, 12] as const).map((n): [string, Partial<AnchorPlateInputs>] => [`disposición ${n}`, { bar_nLayout: n }]),
    ['momento débil dominante (eje neutro tumbado)', { Mx: 0, My: 45 }],
    ['momento débil negativo', { Mx: 5, My: -45 }],
    ['macizo justo (vuelo 60)', { plate_margin_x: 60, plate_margin_y: 60, ...{ pedestal_cX: 100, pedestal_cX1: 100, pedestal_cX2: 100, pedestal_cY: 100, pedestal_cY1: 100, pedestal_cY2: 100 } }],
    ['macizo grande (vuelo 400)', { plate_margin_x: 400, plate_margin_y: 400, ...{ pedestal_cX: 440, pedestal_cX1: 440, pedestal_cX2: 440, pedestal_cY: 440, pedestal_cY1: 440, pedestal_cY2: 440 } }],
  ];
  for (const [nombre, patch] of CASOS) {
    it(`${nombre}: los rótulos de cX y cY no pisan ningún otro texto ni se salen del lienzo`, () => {
      const { svg } = montar(patch);
      const todos = Array.from(svg.querySelectorAll('text'));
      for (const rol of ['cota-cX-texto', 'cota-cY-texto']) {
        const t = svg.querySelector(`[data-role="${rol}"]`)!;
        const caja = cajaTexto(t);
        expect(caja.x, `${rol} se sale por la izquierda`).toBeGreaterThanOrEqual(0);
        expect(caja.x + caja.w, `${rol} se sale por la derecha`).toBeLessThanOrEqual(720);
        for (const otro of todos) {
          if (otro === t) continue;
          expect(solapan(caja, cajaTexto(otro)), `${rol} pisa «${otro.textContent}»`).toBe(false);
        }
      }
    });
  }
});
