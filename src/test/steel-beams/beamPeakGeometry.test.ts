import { describe, it, expect } from 'vitest';
import { beamPeakGeometry, type BeamPeakInputs } from '../../features/steel-beams/beamPeakGeometry';
import { CLEAR_MIN, PEAK_OFFSET } from '../../features/steel-beams/diagramStyle';

const base = {
  bx0: 0,
  bx1: 100,
  mBaseY: 50,
  mUnit: 20,
  vCenterY: 100,
  vChartH: 30,
  vPosH: 30,
  vNegH: 15,
  dBaseY: 200,
  chartH: 20,
} satisfies Omit<BeamPeakInputs, 'beamType' | 'rawMin' | 'rawMax'>;

const CLEAR = Math.max(CLEAR_MIN, PEAK_OFFSET);

describe('beamPeakGeometry — ss', () => {
  const g = beamPeakGeometry({ ...base, beamType: 'ss', rawMin: 0, rawMax: 1 });

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
  const g = beamPeakGeometry({ ...base, beamType: 'cantilever', rawMin: -1, rawMax: 0 });

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

  it('δ peak at tip (right end)', () => {
    expect(g.dPeak).toEqual({ x: 100, y: 220 });
  });
});

describe('beamPeakGeometry — fp', () => {
  const g = beamPeakGeometry({ ...base, beamType: 'fp', rawMin: -1, rawMax: 0.5625 });

  it('M peak at left fixed end, hogging', () => {
    expect(g.mPeak).toEqual({ x: 0, y: 30 });
  });

  it('M label sits CLEAR below peak (off the fixed-wall glyph)', () => {
    expect(g.mLabel.y - g.mPeak.y).toBe(CLEAR);
  });

  it('V− peak uses vNegH (smaller than vPosH)', () => {
    expect(g.vNegPeak).toEqual({ x: 100, y: 115 });
  });

  it('δ peak at ≈0.5785L from fixed end (textbook propped-cantilever UDL)', () => {
    expect(g.dPeak.x).toBeCloseTo(57.85, 2);
    expect(g.dPeak.y).toBe(220);
  });
});

describe('beamPeakGeometry — ff', () => {
  const g = beamPeakGeometry({ ...base, beamType: 'ff', rawMin: -1, rawMax: 0.5 });

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
