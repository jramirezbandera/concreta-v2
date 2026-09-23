// Geometría en planta de la placa de anclaje (lib/calculations/anchor-plate/
// geometria.ts): dónde caen las barras, dónde están las cartelas, cuánto aire
// queda entre unas y otras, y los dos modelos de placa que dependen de eso
// (área eficaz y voladizo equivalente por líneas de rotura). Es el módulo que
// comparten el motor y el SVG desde 2026-09-23; hasta entonces cada uno tenía
// su idea de dónde estaba el acero y las barras salían pintadas sobre las
// cartelas.

import { describe, expect, it } from 'vitest';
import {
  huellaPerfil,
  rigidizadores,
  posicionesBarras,
  normalizarDisposicion,
  holguras,
  apoyosBarra,
  areaEficaz,
  areaUnion,
  areaPoligono,
  recortarPoligonoARect,
  coefPanelTresLados,
  voladizoPanelTresLados,
  voladizoEsquina,
  voladizoEquivalente,
} from '../../lib/calculations/anchor-plate/geometria';
import { anchorPlateDefaults } from '../../data/defaults';

// HEB-200 (h = bf = 200, tf = 15, tw = 9) en placa 400×300, barras a 50 del
// borde: la geometría histórica del módulo.
const G = {
  ...anchorPlateDefaults,
  plate_a: 400, plate_b: 300,
  bar_edge_x: 50, bar_edge_y: 50,
  bar_spacing_x: 100, bar_spacing_y: 80,
  rib_t: 10,
};
const hu = huellaPerfil(G);

describe('huella del perfil', () => {
  it('HEB-200: caja 200×200 con dos alas de 15 y alma de 9, en catálogo', () => {
    expect(hu.catalogo).toBe(true);
    expect(hu.h).toBe(200);
    expect(hu.bf).toBe(200);
    expect(hu.walls).toHaveLength(3);
    expect(hu.walls[0]).toEqual({ x1: 85, x2: 100, y1: -100, y2: 100 });
    expect(hu.walls[2]).toEqual({ x1: -85, x2: 85, y1: -4.5, y2: 4.5 });
  });
  it('perfil fuera de catálogo: caja estimada al 60 % de la placa y catalogo=false', () => {
    const h2 = huellaPerfil({ ...G, sectionSize: 9999 });
    expect(h2.catalogo).toBe(false);
    expect(h2.h).toBe(240);
    expect(h2.bf).toBe(180);
  });
});

describe('rigidizadores: pegados a las caras del pilar y de borde a borde', () => {
  it('rib_count=0 → ninguno', () => {
    expect(rigidizadores({ ...G, rib_count: 0 }, hu)).toEqual([]);
  });
  it('rib_count=2 → el par X en las puntas de las alas (y = ±100..110), de x = −200 a +200, vuelo 100', () => {
    const r = rigidizadores({ ...G, rib_count: 2 }, hu);
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.eje === 'x')).toBe(true);
    expect(r[0].rect).toEqual({ x1: -200, x2: 200, y1: 100, y2: 110 });
    expect(r[1].rect).toEqual({ x1: -200, x2: 200, y1: -110, y2: -100 });
    expect(r[0].vuelo).toBe(100);
  });
  it('rib_count=4 → añade el par Y pegado a las caras de las alas (x = ±100..110), de y = −150 a +150, vuelo 50', () => {
    const r = rigidizadores({ ...G, rib_count: 4 }, hu);
    expect(r).toHaveLength(4);
    const y = r.filter((x) => x.eje === 'y');
    expect(y).toHaveLength(2);
    expect(y[0].rect).toEqual({ x1: 100, x2: 110, y1: -150, y2: 150 });
    expect(y[1].rect).toEqual({ x1: -110, x2: -100, y1: -150, y2: 150 });
    expect(y[0].vuelo).toBe(50);
  });
});

describe('disposición de las barras', () => {
  const xs = (n: 4 | 6 | 8 | 12) => posicionesBarras({ ...G, bar_nLayout: n });
  it('4 → las cuatro esquinas (±150, ±100), ordenadas por fila y columna', () => {
    expect(xs(4)).toEqual([
      { x: -150, y: -100 }, { x: 150, y: -100 }, { x: -150, y: 100 }, { x: 150, y: 100 },
    ]);
  });
  it('6 → tres por extremo del eje fuerte: las esquinas más (±150, 0); ninguna en x = 0', () => {
    const p = xs(6);
    expect(p).toHaveLength(6);
    expect(p.filter((b) => b.x === 0)).toHaveLength(0);
    expect(p.filter((b) => b.y === 0).map((b) => b.x).sort((a, b) => a - b)).toEqual([-150, 150]);
  });
  it('8 → anillo: esquinas + (0, ±100) + (±150, 0); nunca en (0, 0)', () => {
    const p = xs(8);
    expect(p).toHaveLength(8);
    expect(p.some((b) => b.x === 0 && b.y === 0)).toBe(false);
    expect(p.filter((b) => b.x === 0).map((b) => b.y).sort((a, b) => a - b)).toEqual([-100, 100]);
    expect(p.filter((b) => b.y === 0).map((b) => b.x).sort((a, b) => a - b)).toEqual([-150, 150]);
  });
  it('12 → anillo con pares: (±sx/2, ±100) y (±150, ±sy/2)', () => {
    const p = xs(12);
    expect(p).toHaveLength(12);
    expect(p.filter((b) => Math.abs(b.x) === 50 && Math.abs(b.y) === 100)).toHaveLength(4);
    expect(p.filter((b) => Math.abs(b.x) === 150 && Math.abs(b.y) === 40)).toHaveLength(4);
    expect(p.filter((b) => Math.abs(b.x) === 150 && Math.abs(b.y) === 100)).toHaveLength(4);
  });
  it('la retícula 3×3 retirada (9) se lee como el anillo de 8; un valor extraño, como 4', () => {
    expect(normalizarDisposicion(9)).toBe(8);
    expect(normalizarDisposicion(7)).toBe(4);
    expect(posicionesBarras({ ...G, bar_nLayout: 9 as unknown as 8 })).toEqual(xs(8));
  });
});

describe('holguras: las barras no pueden pisar el perfil ni una cartela', () => {
  it('la geometría histórica (400×300, ey=50, par X) pone las cuatro esquinas SOBRE la cartela: holgura 0', () => {
    const rigs = rigidizadores({ ...G, rib_count: 2 }, hu);
    const h = holguras(posicionesBarras({ ...G, bar_nLayout: 4 }), hu, rigs);
    expect(h).toHaveLength(4);
    for (const x of h) {
      expect(x.acero).toBe(0);
      expect(x.contra).toBe('rigidizador');
      expect(x.campo).toBe('bar_edge_y');   // se esquiva moviendo la barra en y
    }
  });
  it('los defaults nuevos (350×350, anillo de 8, «#») dejan 25 mm a cada cartela y 0,75·φ = 15 no avisa', () => {
    const d = anchorPlateDefaults;
    const hd = huellaPerfil(d);
    const h = holguras(posicionesBarras(d), hd, rigidizadores(d, hd));
    expect(h).toHaveLength(8);
    for (const x of h) expect(x.acero).toBeCloseTo(25, 6);
    expect(Math.min(...h.map((x) => x.vecina))).toBeCloseTo(135, 6);
  });
  it('una barra del par central pegada a la cartela Y apunta a la separación, no al borde', () => {
    // Placa 400×400 (barras a ±150 en y, lejos del par X) y 12 barras con
    // sx = 240: el par central cae en x = ±120, a 10 mm de la cara exterior
    // de la cartela Y (100..110).
    const inp = { ...G, plate_b: 400, bar_nLayout: 12 as const, bar_spacing_x: 240, rib_count: 4 as const };
    const h = holguras(posicionesBarras(inp), hu, rigidizadores(inp, hu));
    const par = h.filter((x) => x.campo === 'bar_spacing_x');
    expect(par.length).toBeGreaterThan(0);
    for (const x of par) expect(x.acero).toBeCloseTo(10, 6);
  });
});

describe('apoyos que ve una barra traccionada (T-stub)', () => {
  it('sin cartelas, la esquina (150, 100) se apoya en la cara del ala: m = 50, e = 50', () => {
    const ap = apoyosBarra({ x: 150, y: 100 }, G, hu, [])!;
    expect(ap.m).toBe(50);
    expect(ap.e).toBe(50);
    expect(ap.eje).toBe('x');
    expect(ap.apoyo).toBe('perfil');
  });
  it('con el «#», la esquina de los defaults (135, 135) se apoya en la cartela a 25 mm y el panel mide 65', () => {
    const d = anchorPlateDefaults;
    const hd = huellaPerfil(d);
    const ap = apoyosBarra({ x: 135, y: 135 }, d, hd, rigidizadores(d, hd))!;
    expect(ap.m).toBeCloseTo(25, 6);
    expect(ap.apoyo).toBe('rigidizador');
    expect(ap.e).toBeCloseTo(40, 6);
    expect(ap.anchoPanel).toBeCloseTo(65, 6);   // de la cara de la cartela Y (110) al borde (175)
  });
  it('la barra centrada del anillo (0, 135) se apoya en la cartela X y su panel es el hueco entre las cartelas Y (200)', () => {
    const d = anchorPlateDefaults;
    const hd = huellaPerfil(d);
    const ap = apoyosBarra({ x: 0, y: 135 }, d, hd, rigidizadores(d, hd))!;
    expect(ap.eje).toBe('y');
    expect(ap.m).toBeCloseTo(25, 6);
    expect(ap.anchoPanel).toBeCloseTo(200, 6);
  });
  it('una barra dentro de una cartela o bajo el perfil no tiene T-stub (null)', () => {
    const rigs = rigidizadores({ ...G, rib_count: 2 }, hu);
    expect(apoyosBarra({ x: 150, y: 100 }, G, hu, rigs)).toBeNull();
    expect(apoyosBarra({ x: 0, y: 0 }, G, hu, [])).toBeNull();
  });
});

describe('áreas', () => {
  it('unión de dos rectángulos solapados: 100×100 ∪ 50×50 desplazado = 10 000 + 2 500 − 625', () => {
    expect(areaUnion([
      { x1: 0, x2: 100, y1: 0, y2: 100 },
      { x1: 75, x2: 125, y1: 75, y2: 125 },
    ])).toBe(11875);
  });
  it('bloque ∩ franja: la mitad derecha de una placa 400×300 con una franja x ∈ [58, 152] es 94×300', () => {
    const bloque = [{ x: 0, y: -150 }, { x: 200, y: -150 }, { x: 200, y: 150 }, { x: 0, y: 150 }];
    const corte = recortarPoligonoARect(bloque, { x1: 58, x2: 152, y1: -150, y2: 150 });
    expect(areaPoligono(corte)).toBeCloseTo(94 * 300, 6);
    expect(areaPoligono(recortarPoligonoARect(bloque, { x1: -152, x2: -58, y1: -150, y2: 150 }))).toBe(0);
  });
  it('área eficaz: con c → 0 es el acero del perfil; con c enorme, la placa entera', () => {
    expect(areaEficaz(G, hu, [], 1e-9).A_eff).toBeCloseTo(2 * 200 * 15 + 170 * 9, 3);
    expect(areaEficaz(G, hu, [], 1e6).A_eff).toBe(400 * 300);
  });
  it('área eficaz: cada par de cartelas la aumenta y nunca pasa de la placa', () => {
    const c = 42.4;
    const a0 = areaEficaz(G, hu, [], c).A_eff;
    const a2 = areaEficaz(G, hu, rigidizadores({ ...G, rib_count: 2 }, hu), c).A_eff;
    const a4 = areaEficaz(G, hu, rigidizadores({ ...G, rib_count: 4 }, hu), c).A_eff;
    expect(a2).toBeGreaterThan(a0);
    expect(a4).toBeGreaterThan(a2);
    expect(a4).toBeLessThanOrEqual(400 * 300);
    // La franja tributaria del par X: [100 − c, 110 + c] × 400, recortada a ±150.
    const { franjas } = areaEficaz(G, hu, rigidizadores({ ...G, rib_count: 2 }, hu), c);
    expect(franjas[0]).toEqual({ x1: -200, x2: 200, y1: 100 - c, y2: 150 });
  });
});

describe('líneas de rotura', () => {
  it('panel de tres lados: k crece con la anchura y tiende al voladizo puro (1/2)', () => {
    expect(coefPanelTresLados(1)).toBeCloseTo(0.0353, 3);
    expect(coefPanelTresLados(2)).toBeCloseTo(0.0853, 3);
    expect(coefPanelTresLados(4)).toBeCloseTo(0.1667, 3);
    expect(coefPanelTresLados(2000)).toBeGreaterThan(0.49);
    let prev = 0;
    for (const rho of [0.5, 1, 2, 3, 5, 8, 13, 21, 50]) {
      const k = coefPanelTresLados(rho);
      expect(k).toBeGreaterThan(prev);
      prev = k;
    }
  });
  it('voladizo equivalente del panel: c·√(2k); con la anchura muy grande vuelve a c', () => {
    expect(voladizoPanelTresLados(200, 100)).toBeCloseTo(41.3, 0);
    expect(voladizoPanelTresLados(1e5, 100)).toBeGreaterThan(99);
    expect(voladizoPanelTresLados(0, 100)).toBe(0);
  });
  it('esquina apoyada en dos bordes: cuadrada ≈ 0,413·c; con un vuelo muy largo, el otro manda como voladizo', () => {
    expect(voladizoEsquina(100, 100)).toBeCloseTo(41.3, 0);
    expect(voladizoEsquina(100, 100)).toBe(voladizoEsquina(100, 100));
    expect(voladizoEsquina(1e5, 40)).toBeGreaterThan(39.5);
    expect(voladizoEsquina(40, 1e5)).toBeCloseTo(voladizoEsquina(1e5, 40), 6);
  });
  it('voladizo equivalente de la placa 400×300 con HEB-200: 100 / 41 / 39 según las cartelas', () => {
    expect(voladizoEquivalente({ ...G, rib_count: 0 }, hu).c).toBe(100);
    const r2 = voladizoEquivalente({ ...G, rib_count: 2 }, hu);
    expect(r2.c).toBeCloseTo(41.3, 0);
    expect(r2.zona).toContain('franja lateral');
    const r4 = voladizoEquivalente({ ...G, rib_count: 4 }, hu);
    expect(r4.c).toBeCloseTo(39.4, 0);
  });
});

describe('2UPN en cajón (2026-09-23): las cuatro caras son macizas', () => {
  // 2UPN 200: h = 200 (canto de la UPN, a lo largo del eje fuerte), b = 2·75 =
  // 150, tf = 11,5, tw = 8,5. En la placa de los defaults (350×350, anillo de
  // 8Ø20 a 40 del borde, «#» de 10 mm).
  const B = { ...anchorPlateDefaults, sectionType: '2UPN' as const, sectionSize: 200 };
  const hb = huellaPerfil(B);

  it('huella: caja 200×150 con las alas en x = ±100 (11,5) y las almas en y = ±75 (8,5)', () => {
    expect(hb.tipo).toBe('2UPN');
    expect(hb.catalogo).toBe(true);
    expect(hb.h).toBe(200);
    expect(hb.bf).toBe(150);
    expect(hb.walls).toHaveLength(4);
    expect(hb.walls[0]).toEqual({ x1: 88.5, x2: 100, y1: -75, y2: 75 });
    expect(hb.walls[2]).toEqual({ x1: -100, x2: 100, y1: 66.5, y2: 75 });
  });

  it('un tamaño que no existe en la serie UPN cae a la caja estimada, y sigue diciendo que es un cajón', () => {
    const h2 = huellaPerfil({ ...B, sectionSize: 210 });
    expect(h2.catalogo).toBe(false);
    expect(h2.tipo).toBe('2UPN');
  });

  it('el «#» abraza el cajón: par X pegado a las almas (y = ±75..85, vuelo 75) y par Y a las alas (x = ±100..110, vuelo 100)', () => {
    const r = rigidizadores(B, hb);
    expect(r).toHaveLength(4);
    expect(r[0].rect).toEqual({ x1: -175, x2: 175, y1: 75, y2: 85 });
    expect(r[0].vuelo).toBe(75);
    expect(r[2].rect).toEqual({ x1: 100, x2: 110, y1: -175, y2: 175 });
    expect(r[2].vuelo).toBe(100);
  });

  it('el anillo de 8 deja 25 mm a las cartelas Y y 50 a las X: nada por debajo de 0,75·φ', () => {
    const barras = posicionesBarras(B);
    const h = holguras(barras, hb, rigidizadores(B, hb));
    expect(h).toHaveLength(8);
    expect(h.filter((x) => x.acero < 0.75 * B.bar_diam)).toHaveLength(0);
    expect(Math.min(...h.map((x) => x.acero))).toBeCloseTo(25, 6);
    const centradas = h.filter((_, i) => Math.abs(barras[i].x) < 1e-6);
    expect(centradas).toHaveLength(2);
    for (const x of centradas) expect(x.acero).toBeCloseTo(50, 6);
  });

  it('área eficaz sin cartelas: la corona de ancho c alrededor de las cuatro paredes, con el hueco del cajón fuera', () => {
    // c = 10: envolvente 220×170 menos el hueco interior que la corona no
    // alcanza, (200 − 2·11,5 − 2·10) × (150 − 2·8,5 − 2·10) = 157 × 113.
    const { A_eff } = areaEficaz(B, hb, [], 10);
    expect(A_eff).toBeCloseTo(220 * 170 - 157 * 113, 6);
  });

  it('apoyos: la barra centrada (0, 135) se apoya en la cartela del alma a 50 con panel 200; la (135, 0) en la del ala a 25 con panel 150', () => {
    const rigs = rigidizadores(B, hb);
    const a1 = apoyosBarra({ x: 0, y: 135 }, B, hb, rigs)!;
    expect(a1.eje).toBe('y');
    expect(a1.m).toBeCloseTo(50, 6);
    expect(a1.apoyo).toBe('rigidizador');
    expect(a1.anchoPanel).toBeCloseTo(200, 6);
    const a2 = apoyosBarra({ x: 135, y: 0 }, B, hb, rigs)!;
    expect(a2.eje).toBe('x');
    expect(a2.m).toBeCloseTo(25, 6);
    expect(a2.anchoPanel).toBeCloseTo(150, 6);
  });

  it('sin cartelas, el alma del cajón apoya a la barra que queda a su altura: (0, 100) → m = 25 al perfil', () => {
    const ap = apoyosBarra({ x: 0, y: 100 }, B, hb, [])!;
    expect(ap.eje).toBe('y');
    expect(ap.m).toBeCloseTo(25, 6);
    expect(ap.apoyo).toBe('perfil');
  });

  it('voladizo equivalente con el «#»: franja lateral (150 de ancho, fondo 65), celda central (200, fondo 90) y esquina 65×90', () => {
    const v = voladizoEquivalente(B, hb);
    const candidatos = [voladizoPanelTresLados(150, 65), voladizoPanelTresLados(200, 90), voladizoEsquina(65, 90)];
    expect(v.c).toBeCloseTo(Math.max(...candidatos), 9);
  });
});
