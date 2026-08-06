// RHSAdapter — SHS/RHS parametric hollow sections.
//
// Primary oracle: independent numerical strip integration of the exact
// rounded-rectangle ring geometry (same test philosophy as the circular
// column fiber references). The adapter's closed-form composition must agree
// within 0.2% on A / Iy / Iz / Wel / Wpl.
//
// Secondary anchors: the EN 10219-2 standard area formula (algebraic
// identity) and published catalogue rows for cold-formed SHS 100×100×5
// (±3% absorbs table rounding).

import { describe, it, expect } from 'vitest';
import { RHSAdapter, makeRHS, createSection } from '../../lib/sections';

/** Width of a solid rounded rectangle at height y from the centroid. */
function widthAt(b: number, h: number, r: number, y: number): number {
  const ay = Math.abs(y);
  if (ay > h / 2) return 0;
  const yc = h / 2 - r;
  if (ay <= yc || r <= 0) return b;
  const dx = r - Math.sqrt(Math.max(0, r * r - (ay - yc) * (ay - yc)));
  return b - 2 * dx;
}

/** Strip-integrated properties of the tube (outer minus inner), mm units. */
function stripProps(h: number, b: number, t: number, ro: number, ri: number) {
  const N = 40000;
  const dy = h / N;
  let A = 0, I = 0, Q = 0;
  for (let i = 0; i < N; i++) {
    const y = -h / 2 + (i + 0.5) * dy;
    const wOut = widthAt(b, h, ro, y);
    const wIn = Math.abs(y) <= (h - 2 * t) / 2 ? widthAt(b - 2 * t, h - 2 * t, ri, y) : 0;
    const w = wOut - wIn;
    A += w * dy;
    I += w * y * y * dy;
    if (y > 0) Q += w * y * dy;
  }
  return { A, I, Wel: I / (h / 2), Wpl: 2 * Q };
}

/** Corner radii mirror of the adapter (EN 10219-2 / EN 10210-2). */
function radii(t: number, process: 'hot-finished' | 'cold-formed') {
  if (process === 'hot-finished') return { ro: 1.5 * t, ri: 1.0 * t };
  const ro = t <= 6 ? 2 * t : t <= 10 ? 2.5 * t : 3 * t;
  return { ro, ri: ro - t };
}

const CASES: Array<{ h: number; b: number; t: number; process: 'hot-finished' | 'cold-formed' }> = [
  { h: 100, b: 100, t: 5, process: 'cold-formed' },
  { h: 100, b: 100, t: 5, process: 'hot-finished' },
  { h: 120, b: 80, t: 5, process: 'cold-formed' },
  { h: 200, b: 100, t: 8, process: 'cold-formed' },
  { h: 250, b: 150, t: 10, process: 'cold-formed' },
  { h: 300, b: 200, t: 12.5, process: 'hot-finished' },
];

describe('RHSAdapter — strip-integration oracle', () => {
  for (const c of CASES) {
    it(`${c.h}×${c.b}×${c.t} (${c.process}) matches numeric integration`, () => {
      const s = new RHSAdapter(c);
      const { ro, ri } = radii(c.t, c.process);
      const ref = stripProps(c.h, c.b, c.t, ro, ri);
      expect(Math.abs(s.A * 100 - ref.A) / ref.A).toBeLessThan(0.002);
      expect(Math.abs(s.Iy * 1e4 - ref.I) / ref.I).toBeLessThan(0.002);
      expect(Math.abs(s.Wel_y * 1e3 - ref.Wel) / ref.Wel).toBeLessThan(0.002);
      expect(Math.abs(s.Wpl_y * 1e3 - ref.Wpl) / ref.Wpl).toBeLessThan(0.002);

      // Iz / Wz by the transposed geometry (swap h ↔ b).
      const refZ = stripProps(c.b, c.h, c.t, ro, ri);
      expect(Math.abs(s.Iz * 1e4 - refZ.I) / refZ.I).toBeLessThan(0.002);
      expect(Math.abs(s.Wpl_z * 1e3 - refZ.Wpl) / refZ.Wpl).toBeLessThan(0.002);
    });
  }

  it('EN 10219 standard area formula holds exactly', () => {
    for (const c of CASES) {
      const s = new RHSAdapter(c);
      const { ro, ri } = radii(c.t, c.process);
      const A_std = 2 * c.t * (c.h + c.b - 2 * c.t) - (4 - Math.PI) * (ro * ro - ri * ri);
      expect(s.A * 100).toBeCloseTo(A_std, 6);
    }
  });

  it('published hot-finished SHS 100×100×5 row (EN 10210 tables) within 2%', () => {
    const s = makeRHS(100, 100, 5, 'hot-finished');
    expect(Math.abs(s.A - 18.7) / 18.7).toBeLessThan(0.02);       // cm²
    expect(Math.abs(s.Iy - 279) / 279).toBeLessThan(0.02);        // cm⁴
    expect(Math.abs(s.Wpl_y - 66.4) / 66.4).toBeLessThan(0.02);   // cm³
  });

  it('published cold-formed SHS 100×100×5 row (EN 10219 tables) within 2%', () => {
    const s = makeRHS(100, 100, 5, 'cold-formed');
    expect(Math.abs(s.A - 18.36) / 18.36).toBeLessThan(0.02);     // cm²
    expect(Math.abs(s.Iy - 271) / 271).toBeLessThan(0.02);        // cm⁴
    expect(Math.abs(s.Wpl_y - 64.6) / 64.6).toBeLessThan(0.02);   // cm³
  });
});

describe('RHSAdapter — EC3 behaviour', () => {
  it('SHS is axially symmetric (Iy = Iz, Wpl_y = Wpl_z)', () => {
    const s = makeRHS(150, 150, 8, 'cold-formed');
    expect(s.Iy).toBeCloseTo(s.Iz, 8);
    expect(s.Wpl_y).toBeCloseTo(s.Wpl_z, 8);
    expect(s.isSquare).toBe(true);
    expect(s.label).toContain('SHS');
  });

  it('buckling curve: a (hot) / c (cold), both axes', () => {
    expect(makeRHS(150, 100, 8, 'hot-finished').getBucklingAlpha()).toEqual({ alpha_y: 0.21, alpha_z: 0.21 });
    expect(makeRHS(150, 100, 8, 'cold-formed').getBucklingAlpha()).toEqual({ alpha_y: 0.49, alpha_z: 0.49 });
  });

  it('closed section: Mcr = ∞, LTB alpha = NaN, Iw = 0', () => {
    const s = makeRHS(200, 100, 8, 'cold-formed');
    expect(s.computeMcr(6000, 1.0, 210000, 81000)).toBe(Infinity);
    expect(Number.isNaN(s.getLTBAlpha())).toBe(true);
    expect(s.Iw).toBe(0);
  });

  it('shear area A·h/(b+h) — EC3 §6.2.6(3)(f)', () => {
    const s = makeRHS(200, 100, 8, 'cold-formed');
    expect(s.shearAreaZ()).toBeCloseTo((s.A * 100 * 200) / 300, 6);
  });

  it('classification: stocky SHS class 1, thin-walled RHS class 4 in compression', () => {
    // SHS 100×100×5 S275: c/t = (100−15)/5 = 17 « 33ε → class 1.
    expect(makeRHS(100, 100, 5, 'cold-formed').classify(275)).toBe(1);
    // 300×300×5 S355: c/t = 57 > 42ε (34.2) → class 4.
    expect(makeRHS(300, 300, 5, 'cold-formed').classify(355)).toBe(4);
    // Bending mode is laxer on the web: 200×100×4 S275 → web c/t = 47
    // (< 72ε), flange c/t = 22 (< 33ε) → class ≤ 2 in bending.
    expect(makeRHS(200, 100, 4, 'cold-formed').classify(275, 'bending')).toBeLessThanOrEqual(2);
  });

  it('torsion constant matches the closed thin-wall formula', () => {
    const c = { h: 200, b: 100, t: 8, process: 'cold-formed' as const };
    const s = new RHSAdapter(c);
    const { ro, ri } = radii(c.t, c.process);
    const Rc = (ro + ri) / 2;
    const p = 2 * ((c.h - c.t) + (c.b - c.t)) - 2 * Rc * (4 - Math.PI);
    const Ap = (c.h - c.t) * (c.b - c.t) - Rc * Rc * (4 - Math.PI);
    const It_ref = (c.t ** 3 * p) / 3 + (4 * Ap * Ap * c.t) / p;
    expect(s.It * 1e4).toBeCloseTo(It_ref, 4);
  });

  it('degenerate dims produce a zero-A section (caller rejects)', () => {
    expect(makeRHS(100, 100, 0, 'cold-formed').A).toBe(0);
    const s = makeRHS(30, 30, 20, 'cold-formed'); // b ≤ 2t
    expect(s.A).toBe(0);
  });

  it('createSection routes the RHS descriptor', () => {
    const s = createSection({ kind: 'RHS', h: 120, b: 80, t: 5, process: 'cold-formed' });
    expect(s?.kind).toBe('RHS');
    expect(s?.label).toContain('RHS 120×80×5');
  });
});

describe('RHSAdapter — designación declarada vs derivada', () => {
  // La familia la elige el usuario en el selector; un tubo definido como RHS
  // con h = b seguía rotulándose SHS y contradecía la propia pantalla.
  it('RHS declarado con h = b se rotula RHS, no SHS', () => {
    const s = makeRHS(100, 100, 8, 'cold-formed', false);
    expect(s.isSquare).toBe(false);
    expect(s.label).toBe('RHS 100×100×8 (EN 10219)');
  });

  it('SHS declarado se rotula SHS', () => {
    expect(makeRHS(100, 100, 8, 'cold-formed', true).label).toBe('SHS 100×100×8 (EN 10219)');
  });

  it('sin declaración se deriva de la geometría (catálogo, FEM, tests)', () => {
    expect(makeRHS(100, 100, 8, 'cold-formed').label).toContain('SHS');
    expect(makeRHS(150, 100, 8, 'cold-formed').label).toContain('RHS');
  });

  it('la designación NO toca la física: mismas propiedades y misma curva', () => {
    const declaredRhs = makeRHS(100, 100, 8, 'cold-formed', false);
    const declaredShs = makeRHS(100, 100, 8, 'cold-formed', true);
    expect(declaredRhs.A).toBe(declaredShs.A);
    expect(declaredRhs.Iy).toBe(declaredShs.Iy);
    expect(declaredRhs.Wpl_y).toBe(declaredShs.Wpl_y);
    expect(declaredRhs.It).toBe(declaredShs.It);
    expect(declaredRhs.classify(275)).toBe(declaredShs.classify(275));
    expect(declaredRhs.getBucklingAlpha()).toEqual(declaredShs.getBucklingAlpha());
  });

  it('createSection propaga la declaración del descriptor', () => {
    const s = createSection({ kind: 'RHS', h: 120, b: 120, t: 6, process: 'hot-finished', square: false });
    expect(s?.label).toBe('RHS 120×120×6 (EN 10210)');
  });
});
