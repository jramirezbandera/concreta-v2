import { describe, it, expect } from 'vitest';
import {
  unionOffsetPerimeter,
  roundedRectPerimeter,
  buildCross,
  crossPerimetersClipped,
  type Rect,
} from '../../lib/calculations/crossPerimeter';

// ── Engine primitive: single rounded rectangle = 2(w+h)+2πr (EXACT) ───────────
// Σds telescopes to the true segment/arc length, so a lone rect has ~0 error.
describe('unionOffsetPerimeter — primitiva exacta', () => {
  it('un rectángulo dilatado r = 2(w+h)+2πr', () => {
    const rect: Rect = { x0: -50, y0: -50, x1: 50, y1: 50 }; // 100×100
    expect(unionOffsetPerimeter([rect], 20, [], 0.5))
      .toBeCloseTo(roundedRectPerimeter(100, 100, 20), 3);   // 400 + 2π·20
  });

  it('r=0 → perímetro de la placa = 2(w+h)', () => {
    const rect: Rect = { x0: 0, y0: 0, x1: 200, y1: 120 };
    expect(unionOffsetPerimeter([rect], 0, [], 0.5)).toBeCloseTo(640, 3);
  });

  it('dos piezas separadas (> 2r) → suma de perímetros', () => {
    const a: Rect = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const b: Rect = { x0: 1000, y0: 0, x1: 1100, y1: 100 };
    const each = roundedRectPerimeter(100, 100, 20);
    expect(unionOffsetPerimeter([a, b], 20, [], 0.5)).toBeCloseTo(2 * each, 2);
  });
});

// ── Recorte por borde libre (hand-calc) ───────────────────────────────────────
describe('unionOffsetPerimeter — recorte por semiplano (hand-calc)', () => {
  it('placa r=0 cortada a la mitad → 3 lados, sin la cuerda del borde', () => {
    // [0,0,100,100], concreto y≥50: top(100) + media izq(50) + media dcha(50) = 200.
    // La arista inferior (y=0) y la cuerda en y=50 NO cuentan.
    const rect: Rect = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const clip = [{ nx: 0, ny: 1, c: 50 }];
    expect(unionOffsetPerimeter([rect], 0, clip, 0.25)).toBeCloseTo(200, 0);
  });

  it('rect dilatado cortado en la cara inferior → quita arista y arcos de abajo', () => {
    // [−50,−50,50,50], r=20, concreto y≥−50 (borde en la cara inferior):
    // dcha(100)+izq(100)+top(100) + 2 arcos sup (2·π/2·20) = 300 + 62.83 = 362.83.
    const rect: Rect = { x0: -50, y0: -50, x1: 50, y1: 50 };
    const clip = [{ nx: 0, ny: 1, c: -50 }];
    expect(unionOffsetPerimeter([rect], 20, clip, 0.25)).toBeCloseTo(362.83, 0);
  });
});

// ── buildCross: brazos presentes + clips por posición ─────────────────────────
describe('buildCross', () => {
  const g = { plateA: 300, plateB: 300, bEff: 65, Leff: 300 } as const;
  it('interior: 4 brazos, sin clips', () => {
    const { rects, clips, nArms } = buildCross({ ...g, position: 'interior' });
    expect(nArms).toBe(4);
    expect(rects.length).toBe(5); // plate + 4
    expect(clips.length).toBe(0);
  });
  it('borde: 3 brazos (sin −y), 1 clip y≥yE', () => {
    const { clips, nArms } = buildCross({ ...g, position: 'borde', edgeY: 100 });
    expect(nArms).toBe(3);
    expect(clips).toEqual([{ nx: 0, ny: 1, c: -150 - 100 }]); // −B/2 − edgeY
  });
  it('esquina: 2 brazos (sin −y, −x), 2 clips', () => {
    const { clips, nArms } = buildCross({ ...g, position: 'esquina', edgeY: 0, edgeX: 0 });
    expect(nArms).toBe(2);
    expect(clips.length).toBe(2);
  });
});

// ── Cruz truncada: propiedades de seguridad ───────────────────────────────────
describe('crossPerimetersClipped — seguridad por truncado', () => {
  const base = { plateA: 300, plateB: 300, bEff: 65, Leff: 327.3 } as const;
  const d = 200;

  it('borde con edgeY grande → clip inactivo (≈ unión de 3 brazos sin recorte)', () => {
    const far = crossPerimetersClipped({ ...base, position: 'borde', edgeY: 5000 }, d);
    // Reconstruye la unión 3-brazos sin clip y compara.
    const { rects } = buildCross({ ...base, position: 'borde', edgeY: 5000 });
    const u1NoClip = unionOffsetPerimeter(rects, 2 * d, []);
    expect(far.u1).toBeCloseTo(u1NoClip, 0);
  });

  it('acercar el borde RECORTA u1 (más cerca → u1 menor → vEd mayor): monótono', () => {
    const u1 = (edgeY: number) =>
      crossPerimetersClipped({ ...base, position: 'borde', edgeY }, d).u1;
    const near = u1(0), mid = u1(200), far = u1(5000);
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThan(far);
  });

  it('clip nunca alarga: u1(borde) ≤ u1(borde, edge=∞)', () => {
    const clipped = crossPerimetersClipped({ ...base, position: 'borde', edgeY: 50 }, d).u1;
    const open = crossPerimetersClipped({ ...base, position: 'borde', edgeY: 1e6 }, d).u1;
    expect(clipped).toBeLessThanOrEqual(open + 1);
  });

  it('interior > borde > esquina con bordes pegados (más libres → menos perímetro)', () => {
    const i = crossPerimetersClipped({ ...base, position: 'interior' }, d).u1;
    const b = crossPerimetersClipped({ ...base, position: 'borde', edgeY: 0 }, d).u1;
    const e = crossPerimetersClipped({ ...base, position: 'esquina', edgeY: 0, edgeX: 0 }, d).u1;
    expect(i).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(e);
  });

  it('uTip también se recorta en borde pegado (no queda en valor interior)', () => {
    const open = crossPerimetersClipped({ ...base, position: 'borde', edgeY: 5000 }, d).uTip;
    const near = crossPerimetersClipped({ ...base, position: 'borde', edgeY: 0 }, d).uTip;
    expect(near).toBeLessThanOrEqual(open + 1);
  });

  it('u0 (cara de placa) se recorta en el borde libre', () => {
    const open = crossPerimetersClipped({ ...base, position: 'borde', edgeY: 5000 }, d).u0;
    const near = crossPerimetersClipped({ ...base, position: 'borde', edgeY: 0 }, d).u0;
    // Con el borde en la cara inferior de la placa, esa arista no cuenta → u0 menor.
    expect(near).toBeLessThan(open);
  });
});
