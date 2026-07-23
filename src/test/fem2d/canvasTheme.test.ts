// FEM 2D — canvas theme pure helpers: sign-run splitting for the two-colour
// N/V/M diagram bands (blue = positive, red = negative).
//
// signRuns contract: maximal same-sign runs, zero crossings interpolated so
// consecutive runs share an on-axis frontier point; zero samples continue the
// current run; an all-zero series paints nothing.

import { describe, expect, it } from 'vitest';
import { diagColorFor, diagramScale, DIAG_NEG, DIAG_NEG_PDF, DIAG_POS, DIAG_POS_PDF, signRuns } from '../../features/fem2d/canvasTheme';

describe('signRuns', () => {
  it('single-sign series → one run with the original samples', () => {
    const runs = signRuns([0, 1, 2], [3, 5, 4]);
    expect(runs).toHaveLength(1);
    expect(runs[0].sign).toBe(1);
    expect(runs[0].pts).toEqual([
      { x: 0, v: 3 },
      { x: 1, v: 5 },
      { x: 2, v: 4 },
    ]);
  });

  it('splits at the interpolated zero crossing (both runs end/start on the axis)', () => {
    // 1 → −1 over [0, 1]: crossing at x = 0.5.
    const runs = signRuns([0, 1], [1, -1]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual({ sign: 1, pts: [{ x: 0, v: 1 }, { x: 0.5, v: 0 }] });
    expect(runs[1]).toEqual({ sign: -1, pts: [{ x: 0.5, v: 0 }, { x: 1, v: -1 }] });
  });

  it('asymmetric crossing lands where the line crosses zero, not at the midpoint', () => {
    // 3 → −1 over [0, 4]: crossing at x = 3.
    const runs = signRuns([0, 4], [3, -1]);
    expect(runs[0].pts[1].x).toBeCloseTo(3, 12);
    expect(runs[1].pts[0].x).toBeCloseTo(3, 12);
  });

  it('a zero SAMPLE at the change is the frontier itself (no duplicate point)', () => {
    const runs = signRuns([0, 1, 2], [1, 0, -1]);
    expect(runs).toHaveLength(2);
    expect(runs[0].pts).toEqual([{ x: 0, v: 1 }, { x: 1, v: 0 }]);
    expect(runs[1].pts).toEqual([{ x: 1, v: 0 }, { x: 2, v: -1 }]);
  });

  it('zero samples INSIDE a run do not split it', () => {
    const runs = signRuns([0, 1, 2], [2, 0, 3]);
    expect(runs).toHaveLength(1);
    expect(runs[0].sign).toBe(1);
  });

  it('leading zeros adopt the first real sign', () => {
    const runs = signRuns([0, 1, 2], [0, 0, -2]);
    expect(runs).toHaveLength(1);
    expect(runs[0].sign).toBe(-1);
    expect(runs[0].pts[0]).toEqual({ x: 0, v: 0 });
  });

  it('all-zero series yields no runs (nothing to paint)', () => {
    expect(signRuns([0, 1, 2], [0, 0, 0])).toEqual([]);
    // Solver float noise below EPS counts as zero — no hairline runs.
    expect(signRuns([0, 1], [1e-12, -1e-12])).toEqual([]);
  });

  it('double crossing (sagging + hogging + sagging) → three runs', () => {
    const runs = signRuns([0, 1, 2, 3], [1, -1, -1, 1]);
    expect(runs.map((r) => r.sign)).toEqual([1, -1, 1]);
    expect(runs[0].pts[runs[0].pts.length - 1]).toEqual({ x: 0.5, v: 0 });
    expect(runs[2].pts[0]).toEqual({ x: 2.5, v: 0 });
  });

  it('empty input → no runs', () => {
    expect(signRuns([], [])).toEqual([]);
  });
});

describe('diagramScale — escala de amplitud del diagrama (trampa 3)', () => {
  const ampPx = 40; // ampFor típico

  it('vista NO gobernante: escala a scaleRef ⇒ se dibuja MENOR (scaleMax = pico de scaleRef)', () => {
    // env:ELU pico 84; un elu:* no gobernante pico 41. La amplitud la fija 84,
    // así que 41 se dibuja a ~la mitad de altura, comparable con su envolvente.
    const { k, scaleMax } = diagramScale(41, 84, ampPx, 1);
    expect(scaleMax).toBe(84);
    expect(k).toBeCloseTo(ampPx / 84, 12);
    // Menor que si se autonormalizara.
    expect(Math.abs(k)).toBeLessThan(ampPx / 41);
  });

  it('GUARDA de desbordamiento: la vista supera a su scaleRef ⇒ autonormaliza (no se sale)', () => {
    // Contraejemplo del plan: env:ELS_c pico 5, pero els_cp pico 10. Sin guarda,
    // k = ampPx/5 dibujaría el doble de ampPx (invade cotas). Con guarda,
    // scaleMax = max(5, 10) = 10 ⇒ el pico ocupa exactamente ampPx.
    const { k, scaleMax } = diagramScale(10, 5, ampPx, 1);
    expect(scaleMax).toBe(10);
    expect(Math.abs(k) * 10).toBeCloseTo(ampPx, 12); // el pico cabe justo en ampPx
  });

  it('elu:* / els_c: (pico ≤ scaleRef) ⇒ scaleMax === pico de scaleRef, idéntico', () => {
    const { scaleMax } = diagramScale(30, 84, ampPx, 1);
    expect(scaleMax).toBe(84);
  });

  it('todo-cero ⇒ k = 0 (sin división por cero)', () => {
    const { k, scaleMax } = diagramScale(0, 0, ampPx, 1);
    expect(scaleMax).toBe(0);
    expect(k).toBe(0);
  });

  it('offsetSign se propaga al signo de k (M dibuja el sagging hacia −y)', () => {
    expect(diagramScale(50, 50, ampPx, -1).k).toBeLessThan(0);
    expect(diagramScale(50, 50, ampPx, 1).k).toBeGreaterThan(0);
  });
});

describe('diagColorFor', () => {
  it('screen uses the theme tokens; PDF the fixed hex mirror', () => {
    expect(diagColorFor(1, false)).toBe(DIAG_POS);
    expect(diagColorFor(-1, false)).toBe(DIAG_NEG);
    expect(diagColorFor(1, true)).toBe(DIAG_POS_PDF);
    expect(diagColorFor(-1, true)).toBe(DIAG_NEG_PDF);
  });

  it('zero counts as positive (a flat-zero label never reads as negative)', () => {
    expect(diagColorFor(0, false)).toBe(DIAG_POS);
    expect(diagColorFor(Math.sign(0), true)).toBe(DIAG_POS_PDF);
  });
});
