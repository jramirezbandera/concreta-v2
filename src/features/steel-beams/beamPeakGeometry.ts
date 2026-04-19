import { CLEAR_MIN, PEAK_OFFSET } from './diagramStyle';
import type { BeamType } from '../../data/defaults';

export interface LabelPos {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface Peak {
  x: number;
  y: number;
}

export interface BeamPeakInputs {
  beamType: BeamType;
  bx0: number;
  bx1: number;
  mBaseY: number;
  mUnit: number;
  rawMin: number;
  rawMax: number;
  vCenterY: number;
  vChartH: number;
  vPosH: number;
  vNegH: number;
  dBaseY: number;
  chartH: number;
}

export interface BeamPeakGeometry {
  mLabel: LabelPos;
  mPeak: Peak;
  mLabelSecondary?: LabelPos;
  mPeakSecondary?: Peak;
  vPosLabel: LabelPos;
  vPosPeak: Peak;
  vNegLabel?: LabelPos;
  vNegPeak?: Peak;
  dLabel: LabelPos;
  dPeak: Peak;
}

export function beamPeakGeometry(inp: BeamPeakInputs): BeamPeakGeometry {
  const {
    beamType, bx0, bx1, mBaseY, mUnit, rawMin, rawMax,
    vCenterY, vChartH, vPosH, vNegH, dBaseY, chartH,
  } = inp;

  const bw = bx1 - bx0;
  const clear = Math.max(CLEAR_MIN, PEAK_OFFSET);
  const vInset = 6;

  switch (beamType) {
    case 'ss': {
      const mx = (bx0 + bx1) / 2;
      const peakY = mBaseY + rawMax * mUnit;
      return {
        mLabel: { x: mx, y: peakY + clear, anchor: 'middle' },
        mPeak:  { x: mx, y: peakY },
        vPosLabel: { x: bx0 + vInset, y: vCenterY - vChartH + clear, anchor: 'start' },
        vPosPeak:  { x: bx0, y: vCenterY - vChartH },
        vNegLabel: { x: bx1 - vInset, y: vCenterY + vChartH - clear, anchor: 'end' },
        vNegPeak:  { x: bx1, y: vCenterY + vChartH },
        dLabel: { x: mx, y: dBaseY + chartH + clear, anchor: 'middle' },
        dPeak:  { x: mx, y: dBaseY + chartH },
      };
    }
    case 'cantilever': {
      const peakY = mBaseY + rawMin * mUnit;
      return {
        mLabel: { x: bx0 + 4, y: peakY + clear, anchor: 'start' },
        mPeak:  { x: bx0, y: peakY },
        vPosLabel: { x: bx0 + vInset, y: vCenterY - vChartH + clear, anchor: 'start' },
        vPosPeak:  { x: bx0, y: vCenterY - vChartH },
        dLabel: { x: bx1 - 4, y: dBaseY + chartH + clear, anchor: 'end' },
        dPeak:  { x: bx1, y: dBaseY + chartH },
      };
    }
    case 'fp': {
      const peakY = mBaseY + rawMin * mUnit;
      // Analytical max deflection for fixed-left / pinned-right propped cantilever
      // under UDL occurs at t = (15−√33)/16 ≈ 0.5785 from the fixed end.
      const dX = bx0 + bw * 0.5785;
      return {
        mLabel: { x: bx0 + 4, y: peakY + clear, anchor: 'start' },
        mPeak:  { x: bx0, y: peakY },
        vPosLabel: { x: bx0 + vInset, y: vCenterY - vPosH + clear, anchor: 'start' },
        vPosPeak:  { x: bx0, y: vCenterY - vPosH },
        vNegLabel: { x: bx1 - vInset, y: vCenterY + vNegH - clear, anchor: 'end' },
        vNegPeak:  { x: bx1, y: vCenterY + vNegH },
        dLabel: { x: dX, y: dBaseY + chartH + clear, anchor: 'middle' },
        dPeak:  { x: dX, y: dBaseY + chartH },
      };
    }
    case 'ff': {
      const hogPeakY = mBaseY + rawMin * mUnit;
      const sagPeakY = mBaseY + rawMax * mUnit;
      const mx = (bx0 + bx1) / 2;
      return {
        mLabel: { x: bx0 + 4, y: hogPeakY + clear, anchor: 'start' },
        mPeak:  { x: bx0, y: hogPeakY },
        mLabelSecondary: { x: mx, y: sagPeakY + clear, anchor: 'middle' },
        mPeakSecondary:  { x: mx, y: sagPeakY },
        vPosLabel: { x: bx0 + vInset, y: vCenterY - vChartH + clear, anchor: 'start' },
        vPosPeak:  { x: bx0, y: vCenterY - vChartH },
        vNegLabel: { x: bx1 - vInset, y: vCenterY + vChartH - clear, anchor: 'end' },
        vNegPeak:  { x: bx1, y: vCenterY + vChartH },
        dLabel: { x: mx, y: dBaseY + chartH + clear, anchor: 'middle' },
        dPeak:  { x: mx, y: dBaseY + chartH },
      };
    }
  }
}
