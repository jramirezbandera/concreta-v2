import { describe, it, expect } from 'vitest';
import { beamPeakGeometry, type BeamPeakInputs } from '../../features/steel-beams/beamPeakGeometry';
import { CLEAR_MIN, PEAK_OFFSET } from '../../features/steel-beams/diagramStyle';

// Celdas de prueba: M y V con los mismos rangos que usaba el layout apilado
// antiguo; δ con la línea admisible en el fondo del área (caso CUMPLE).
const base = {
  m: { x0: 0, x1: 100, baseY: 50, unit: 20 },
  v: { x0: 0, x1: 100, centerY: 100, posH: 30, negH: 30 },
  d: { x0: 0, x1: 100, baseY: 200, depth: 20, admY: 240 },
};

const inputs = (
  beamType: BeamPeakInputs['beamType'],
  rawMin: number,
  rawMax: number,
  over: { negH?: number; d?: Partial<typeof base.d> } = {},
): BeamPeakInputs => ({
  beamType,
  m: { ...base.m, rawMin, rawMax },
  v: { ...base.v, negH: over.negH ?? base.v.negH },
  d: { ...base.d, ...over.d },
});

const CLEAR = Math.max(CLEAR_MIN, PEAK_OFFSET);

describe('beamPeakGeometry — ss', () => {
  const g = beamPeakGeometry(inputs('ss', 0, 1));

  it('M peak at midspan, sagging below baseline', () => {
    expect(g.mPeak).toEqual({ x: 50, y: 70 });
  });

  it('V+ peak at left support top corner', () => {
    expect(g.vPosPeak).toEqual({ x: 0, y: 70 });
  });

  it('V− peak at right support bottom corner', () => {
    expect(g.vNegPeak).toEqual({ x: 100, y: 130 });
  });

  it('δ peak at midspan, max downward', () => {
    expect(g.dPeak).toEqual({ x: 50, y: 220 });
  });

  it('clearance floor: label sits at least CLEAR_MIN from peak', () => {
    expect(Math.abs(g.mLabel.y - g.mPeak.y)).toBe(CLEAR);
    expect(CLEAR).toBeGreaterThanOrEqual(CLEAR_MIN);
  });
});

describe('beamPeakGeometry — cantilever', () => {
  const g = beamPeakGeometry(inputs('cantilever', -1, 0, { negH: 0 }));

  it('M peak at root (fixed end), hogging above baseline', () => {
    expect(g.mPeak).toEqual({ x: 0, y: 30 });
  });

  it('M label sits CLEAR below peak (not near fixed-wall glyph on baseline)', () => {
    expect(g.mLabel.y - g.mPeak.y).toBe(CLEAR);
  });

  it('no V− peak (triangle goes to 0 at tip — no label)', () => {
    expect(g.vNegPeak).toBeUndefined();
    expect(g.vNegLabel).toBeUndefined();
  });

  it('δ peak at tip (right end), label anchored inward', () => {
    expect(g.dPeak).toEqual({ x: 100, y: 220 });
    expect(g.dLabel.anchor).toBe('end');
  });
});

describe('beamPeakGeometry — fp', () => {
  const g = beamPeakGeometry(inputs('fp', -1, 0.5625, { negH: 15 }));

  it('M peak at left fixed end, hogging', () => {
    expect(g.mPeak).toEqual({ x: 0, y: 30 });
  });

  it('M label sits CLEAR below peak (off the fixed-wall glyph)', () => {
    expect(g.mLabel.y - g.mPeak.y).toBe(CLEAR);
  });

  it('V− peak uses negH (smaller than posH)', () => {
    expect(g.vNegPeak).toEqual({ x: 100, y: 115 });
  });

  it('δ peak at ≈0.5785L from fixed end (textbook propped-cantilever UDL)', () => {
    expect(g.dPeak.x).toBeCloseTo(57.85, 2);
    expect(g.dPeak.y).toBe(220);
  });
});

describe('beamPeakGeometry — ff', () => {
  const g = beamPeakGeometry(inputs('ff', -1, 0.5));

  it('M hero peak at left fixed end, hogging', () => {
    expect(g.mPeak).toEqual({ x: 0, y: 30 });
  });

  it('M hero label sits CLEAR below hero peak (off the fixed-wall glyph)', () => {
    expect(g.mLabel.y - g.mPeak.y).toBe(CLEAR);
  });

  it('M secondary peak at midspan, sagging', () => {
    expect(g.mPeakSecondary).toEqual({ x: 50, y: 60 });
  });

  it('δ peak at midspan (symmetric)', () => {
    expect(g.dPeak).toEqual({ x: 50, y: 220 });
  });
});

describe('beamPeakGeometry — δ label vs línea admisible', () => {
  it('lejos del límite: etiqueta CLEAR bajo el pico', () => {
    const g = beamPeakGeometry(inputs('ss', 0, 1, { d: { depth: 20, admY: 240 } }));
    expect(g.dLabel.y).toBe(220 + CLEAR);
  });

  it('utilización alta (pico junto al límite): la etiqueta salta bajo la línea', () => {
    // depth 36 → label naïf en 200+36+CLEAR=246, dentro de la ventana de la
    // línea admisible (admY=240 ± ~) → se recoloca en admY+12.
    const g = beamPeakGeometry(inputs('ss', 0, 1, { d: { depth: 36, admY: 240 } }));
    expect(g.dLabel.y).toBe(240 + 12);
  });

  it('caso NO CUMPLE (curva más profunda que el límite): etiqueta bajo el pico', () => {
    // admY muy por encima del fondo de la curva → la etiqueta naïf no la toca.
    const g = beamPeakGeometry(inputs('ss', 0, 1, { d: { depth: 40, admY: 220 } }));
    expect(g.dLabel.y).toBe(240 + CLEAR);
  });
});
