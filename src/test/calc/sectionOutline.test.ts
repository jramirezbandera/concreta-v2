// Contorno dibujable de la sección — módulo puro (lib/sections/outline).
//
// Se testea sin DOM porque lo que puede salir mal es GEOMETRÍA: un flag de
// barrido invertido convierte un acuerdo cóncavo en una panza convexa, y un
// radio sin acotar cruza el contorno sobre sí mismo. Las dos cosas se ven en
// los números antes que en la pantalla.

import { describe, it, expect } from 'vitest';
import { sectionOutline, outlinePathD, type SectionOutline } from '../../lib/sections/outline';
import { makeISectionBySize, makeUPNBoxBySize, makeCHS, makeRHS } from '../../lib/sections';

const ipe300 = makeISectionBySize('IPE', 300)!;   // h 300, b 150, tf 10.7, tw 7.1, r 15
const rhs150 = makeRHS(150, 100, 8, 'cold-formed');  // r exterior = 2.5t = 20
const shs100 = makeRHS(100, 100, 5, 'hot-finished'); // r exterior = 1.5t = 7.5

const arcs = (o: SectionOutline) =>
  o.contours.flatMap((c) => c.segments.filter((s) => 'r' in s)) as
    Array<{ to: readonly [number, number]; r: number; sweep: 0 | 1 }>;

/** Todos los vértices del contorno, incluido el de arranque. */
const points = (o: SectionOutline) =>
  o.contours.flatMap((c) => [c.start, ...c.segments.map((s) => s.to)]);

describe('sectionOutline — perfil en I con acuerdos', () => {
  const outline = sectionOutline(ipe300)!;

  it('un solo contorno cerrado, sin regla de relleno (no hay agujero)', () => {
    expect(outline.contours).toHaveLength(1);
    expect(outline.fillRule).toBeUndefined();
  });

  it('CUATRO acuerdos, todos con el radio del catálogo y todos CÓNCAVOS', () => {
    const a = arcs(outline);
    expect(a).toHaveLength(4);
    for (const seg of a) {
      expect(seg.r).toBe(ipe300.r);   // 15 mm
      // sweep 0 con +y hacia abajo recorriendo en horario = arco cóncavo. Con
      // sweep 1 el acuerdo saldría abombado hacia fuera, como una soldadura.
      expect(seg.sweep).toBe(0);
    }
  });

  it('los acuerdos arrancan en la cara del ala y mueren en la cara del alma', () => {
    const yFlange = -ipe300.h / 2 + ipe300.tf;   // cara inferior del ala superior
    const xWeb = ipe300.tw / 2;
    const a = arcs(outline);
    // Superior derecho: de (tw/2 + r, cara del ala) a (tw/2, cara + r).
    expect(a[0].to[0]).toBeCloseTo(xWeb, 6);
    expect(a[0].to[1]).toBeCloseTo(yFlange + ipe300.r, 6);
  });

  it('el contorno no se sale del bounding box del perfil', () => {
    const hx = ipe300.b / 2, hy = ipe300.h / 2;
    for (const [x, y] of points(outline)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(hx + 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(hy + 1e-9);
    }
    // Y llega a tocarlo en los cuatro extremos: es la silueta entera.
    const xs = points(outline).map((p) => p[0]);
    const ys = points(outline).map((p) => p[1]);
    expect(Math.max(...xs)).toBeCloseTo(hx, 6);
    expect(Math.min(...xs)).toBeCloseTo(-hx, 6);
    expect(Math.max(...ys)).toBeCloseTo(hy, 6);
    expect(Math.min(...ys)).toBeCloseTo(-hy, 6);
  });

  it('un radio imposible se acota en vez de cruzar el contorno', () => {
    // r = 500 en un perfil de 150 de ancho: sin tope, el acuerdo se comería el
    // vuelo del ala y el trazo se cruzaría sobre sí mismo.
    const absurdo = sectionOutline({ kind: 'I', h: 300, b: 150, tf: 10.7, tw: 7.1, r: 500 })!;
    const rMax = Math.min(150 / 2 - 7.1 / 2, 300 / 2 - 10.7);
    for (const seg of arcs(absurdo)) expect(seg.r).toBeCloseTo(rMax, 6);
    for (const [x, y] of points(absurdo)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(75 + 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(150 + 1e-9);
    }
  });

  it('sin acuerdo (r = 0) no emite arcos: queda el perfil soldado de siempre', () => {
    const soldado = sectionOutline({ kind: 'I', h: 300, b: 150, tf: 10.7, tw: 7.1, r: 0 })!;
    expect(arcs(soldado)).toHaveLength(0);
  });
});

describe('sectionOutline — tubo rectangular', () => {
  it('dos contornos y even-odd: la pared es el hueco entre ambos', () => {
    const o = sectionOutline(rhs150)!;
    expect(o.contours).toHaveLength(2);
    expect(o.fillRule).toBe('evenodd');
  });

  it('radio exterior el del producto, interior r − t', () => {
    const o = sectionOutline(rhs150)!;
    const [outer, inner] = o.contours;
    const rOf = (c: typeof outer) => (c.segments.find((s) => 'r' in s) as { r: number }).r;
    expect(rOf(outer)).toBeCloseTo(rhs150.r, 6);           // 20 mm (2.5t en frío)
    expect(rOf(inner)).toBeCloseTo(rhs150.r - rhs150.tf, 6); // 12 mm
    // Cuatro esquinas por contorno, todas CONVEXAS.
    expect(arcs(o)).toHaveLength(8);
    for (const seg of arcs(o)) expect(seg.sweep).toBe(1);
  });

  it('el contorno exterior es la envolvente h × b y el interior descuenta la pared', () => {
    const o = sectionOutline(rhs150)!;
    const ext = o.contours[0], int = o.contours[1];
    const xs = (c: typeof ext) => [c.start, ...c.segments.map((s) => s.to)].map((p) => p[0]);
    const ys = (c: typeof ext) => [c.start, ...c.segments.map((s) => s.to)].map((p) => p[1]);
    expect(Math.max(...xs(ext))).toBeCloseTo(rhs150.b / 2, 6);
    expect(Math.max(...ys(ext))).toBeCloseTo(rhs150.h / 2, 6);
    expect(Math.max(...xs(int))).toBeCloseTo(rhs150.b / 2 - rhs150.tf, 6);
    expect(Math.max(...ys(int))).toBeCloseTo(rhs150.h / 2 - rhs150.tf, 6);
  });

  it('SHS es el mismo camino con h = b', () => {
    const o = sectionOutline(shs100)!;
    expect(o.contours).toHaveLength(2);
    expect(arcs(o)[0].r).toBeCloseTo(shs100.r, 6);  // 7.5 mm (1.5t en caliente)
  });
});

describe('sectionOutline — familias que siguen con su dibujo de siempre', () => {
  it('CHS y 2UPN devuelven null', () => {
    // La corona del tubo circular y el cajón de dos UPN ya se dibujan bien con
    // las primitivas; el cajón además tiene r = 0 en el adaptador.
    expect(sectionOutline(makeCHS(168.3, 8, 'hot-finished'))).toBeNull();
    expect(sectionOutline(makeUPNBoxBySize(200)!)).toBeNull();
  });

  it('una sección degenerada no revienta: null', () => {
    expect(sectionOutline({ kind: 'I', h: 0, b: 0, tf: 0, tw: 0, r: 0 })).toBeNull();
    expect(sectionOutline({ kind: 'RHS', h: 100, b: 100, tf: 0, tw: 0, r: 0 })).toBeNull();
  });
});

describe('outlinePathD', () => {
  const id = (mm: number) => mm;

  it('cierra cada contorno y usa arcos de menos de 180° (large-arc 0)', () => {
    const d = outlinePathD(sectionOutline(rhs150)!, id, id, id);
    expect(d.match(/Z/g)).toHaveLength(2);       // un cierre por contorno
    expect(d.match(/M /g)).toHaveLength(2);
    expect(d).toContain('A ');
    expect(d).not.toMatch(/A [\d.]+,[\d.]+ 0 1 /);  // ningún large-arc-flag a 1
  });

  it('la proyección traslada y escala; el radio SOLO escala', () => {
    const d = outlinePathD(sectionOutline(ipe300)!, (mm) => 100 + mm * 2, (mm) => 50 + mm * 2, (mm) => mm * 2);
    // Arranque: esquina superior izquierda (−75, −150) → (100−150, 50−300).
    expect(d.startsWith('M -50,-250')).toBe(true);
    expect(d).toContain('A 30,30');   // r = 15 mm × 2
  });

  it('un tramo recto no se emite como arco', () => {
    const recto = outlinePathD(
      sectionOutline({ kind: 'I', h: 300, b: 150, tf: 10.7, tw: 7.1, r: 0 })!, id, id, id,
    );
    expect(recto).not.toContain('A ');
  });
});
