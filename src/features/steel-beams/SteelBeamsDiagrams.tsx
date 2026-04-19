import { type FC } from 'react';
import { type BeamType } from '../../data/defaults';
import {
  FF_MONO, FS_PEAK, FS_AXIS, FS_ADM, FS_FF_SAG, DOT_R,
  peakColor, axisColor, admColor,
} from './diagramStyle';
import { beamPeakGeometry, type LabelPos } from './beamPeakGeometry';

interface SteelBeamsDiagramsProps {
  beamType: BeamType;
  MEd: number;       // kNm — M peak label
  VEdA: number;      // kN  — shear at left end (governing shear for all types)
  VEdB: number;      // kN  — shear at right end (= VEdA for ss/ff/cantilever; 3wL/8 for fp)
  L: number;         // mm
  deltaMax: number;  // mm — computed δmax
  deltaAdm: number;  // mm — L/n limit
  deflLimit: number; // n in L/n admissible limit
  mode: 'screen' | 'pdf';
  width: number;
  height: number;
}

export const SteelBeamsDiagrams: FC<SteelBeamsDiagramsProps> = ({
  beamType, MEd, VEdA, VEdB, deltaMax, deltaAdm, deflLimit, mode, width, height,
}) => {
  // Invariant: VEdA > 0 guarantees safe VEdB/VEdA division in the fp shear-shape
  // computation below. Callers pass VEdA=0 only when the calc failed upstream.
  if (MEd <= 0 || VEdA <= 0) return null;

  const isPdf = mode === 'pdf';

  const padX = 24;
  const bx0 = padX;
  const bx1 = width - padX;
  const bw = bx1 - bx0;
  const N = 40;

  // ── Layout: 3 equal sections, 8px gaps ──────────────────────────────────
  const gap = 8;
  const secH = Math.floor((height - 2 * gap) / 3);
  const M_Y0 = 0;
  const V_Y0 = secH + gap;
  const D_Y0 = 2 * (secH + gap);

  const labelH = 14;
  const chartTopOff = labelH + 4;
  const chartBot    = 16;
  const chartH      = secH - chartTopOff - chartBot;

  // ── Colors ───────────────────────────────────────────────────────────────
  const mFill      = isPdf ? 'rgba(56,189,248,0.12)' : 'rgba(56,189,248,0.2)';
  const mStroke    = isPdf ? '#336699'               : '#38bdf8';
  const vPosFill   = isPdf ? 'rgba(34,197,94,0.12)'  : 'rgba(34,197,94,0.2)';
  const vPosStroke = isPdf ? '#336633'               : '#22c55e';
  const vNegFill   = isPdf ? 'rgba(239,68,68,0.12)'  : 'rgba(239,68,68,0.2)';
  const vNegStroke = isPdf ? '#663333'               : '#ef4444';

  const dStatus = deltaMax > deltaAdm ? 'fail' : deltaMax / deltaAdm > 0.8 ? 'warn' : 'ok';
  const dFill = dStatus === 'fail'
    ? (isPdf ? 'rgba(239,68,68,0.12)'  : 'rgba(239,68,68,0.2)')
    : dStatus === 'warn'
    ? (isPdf ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.2)')
    : (isPdf ? 'rgba(34,197,94,0.12)'  : 'rgba(34,197,94,0.2)');
  const dStroke = dStatus === 'fail'
    ? (isPdf ? '#663333' : '#ef4444')
    : dStatus === 'warn'
    ? (isPdf ? '#664400' : '#f59e0b')
    : (isPdf ? '#336633' : '#22c55e');

  const baseColor  = isPdf ? '#555555' : '#475569';
  const divColor   = isPdf ? '#cccccc' : '#1e293b';
  const vPosLabelC = isPdf ? '#336633' : '#22c55e';
  const vNegLabelC = isPdf ? '#663333' : '#ef4444';
  const C_PEAK = peakColor(isPdf);
  const C_AXIS = axisColor(isPdf);
  const C_ADM  = admColor(isPdf);

  // ── Support symbols ───────────────────────────────────────────────────────

  const triH = 5;
  const leftTri  = (by: number) =>
    `M ${bx0},${by} L ${bx0 - 4},${by + triH} L ${bx0 + 4},${by + triH} Z`;
  const rightTri = (by: number) =>
    `M ${bx1},${by} L ${bx1 - 4},${by + triH} L ${bx1 + 4},${by + triH} Z`;

  const fixedWallLeft = (by: number, h: number) => (
    <>
      <rect x={bx0 - 4} y={by - h / 2} width={4} height={h} fill={baseColor} />
      <line x1={bx0 - 4} y1={by - h / 2 + h * 0.2} x2={bx0} y2={by - h / 2 + h * 0.5}
        stroke={baseColor} strokeWidth={0.75} />
      <line x1={bx0 - 4} y1={by - h / 2 + h * 0.5} x2={bx0} y2={by - h / 2 + h * 0.8}
        stroke={baseColor} strokeWidth={0.75} />
    </>
  );
  const fixedWallRight = (by: number, h: number) => (
    <>
      <rect x={bx1} y={by - h / 2} width={4} height={h} fill={baseColor} />
      <line x1={bx1} y1={by - h / 2 + h * 0.2} x2={bx1 + 4} y2={by - h / 2 + h * 0.5}
        stroke={baseColor} strokeWidth={0.75} />
      <line x1={bx1} y1={by - h / 2 + h * 0.5} x2={bx1 + 4} y2={by - h / 2 + h * 0.8}
        stroke={baseColor} strokeWidth={0.75} />
    </>
  );

  // ── M diagram geometry ────────────────────────────────────────────────────
  const mShapeFn: (t: number) => number =
    beamType === 'ss'         ? (t) => 4 * t * (1 - t)          :
    beamType === 'cantilever' ? (t) => -(1 - t)                  :
    beamType === 'fp'         ? (t) => -1 + 5 * t - 4 * t * t   :
    /* ff */                    (t) => -1 + 6 * t - 6 * t * t;

  const rawVals = Array.from({ length: N + 1 }, (_, i) => mShapeFn(i / N));
  const rawMin  = Math.min(...rawVals);
  const rawMax  = Math.max(...rawVals);

  const mAvailH = secH - labelH - chartBot;
  const mUnit   = mAvailH / Math.max(rawMax - rawMin, 0.01);
  const mBaseY  = M_Y0 + labelH + (rawMin < 0 ? -rawMin * mUnit : 0);

  const mRawPts: Array<[number, number]> = rawVals.map((v, i) => [
    bx0 + bw * (i / N),
    mBaseY + v * mUnit,
  ]);

  const wallH = mUnit * 0.6;

  const ptsToPolyline = (pts: Array<[number, number]>) =>
    pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const ptsToFillPath = (pts: Array<[number, number]>, baseY: number) =>
    `M ${pts[0][0].toFixed(1)},${baseY} ` +
    pts.map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
    ` L ${pts[pts.length - 1][0].toFixed(1)},${baseY} Z`;

  let mShapeEl: React.ReactNode;

  switch (beamType) {
    case 'ss': {
      mShapeEl = (
        <>
          <path d={ptsToFillPath(mRawPts, mBaseY)} fill={mFill} stroke="none" />
          <polyline points={ptsToPolyline(mRawPts)} fill="none" stroke={mStroke} strokeWidth={1.5} />
          <line x1={bx0} y1={mBaseY} x2={bx1} y2={mBaseY} stroke={baseColor} strokeWidth={1} />
          <path d={leftTri(mBaseY)}  fill={baseColor} />
          <path d={rightTri(mBaseY)} fill={baseColor} />
        </>
      );
      break;
    }
    case 'cantilever': {
      mShapeEl = (
        <>
          <path d={ptsToFillPath(mRawPts, mBaseY)} fill={mFill} stroke="none" />
          <polyline points={ptsToPolyline(mRawPts)} fill="none" stroke={mStroke} strokeWidth={1.5} />
          <line x1={bx0} y1={mBaseY} x2={bx1} y2={mBaseY} stroke={baseColor} strokeWidth={1} />
          {fixedWallLeft(mBaseY, wallH)}
          <circle cx={bx1} cy={mBaseY} r={3} fill="none" stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
    case 'fp': {
      const zeroX   = bx0 + bw * 0.25;
      const hogPts  = mRawPts.filter(([x]) => x <= zeroX + 2);
      const sagPts  = mRawPts.filter(([x]) => x >= zeroX - 2);
      mShapeEl = (
        <>
          <path d={ptsToFillPath(hogPts, mBaseY)} fill={mFill} stroke="none" />
          <path d={ptsToFillPath(sagPts, mBaseY)} fill={mFill} stroke="none" />
          <polyline points={ptsToPolyline(mRawPts)} fill="none" stroke={mStroke} strokeWidth={1.5} />
          <line x1={bx0} y1={mBaseY} x2={bx1} y2={mBaseY} stroke={baseColor} strokeWidth={1} />
          {fixedWallLeft(mBaseY, wallH)}
          <path d={rightTri(mBaseY)} fill={baseColor} />
        </>
      );
      break;
    }
    case 'ff': {
      const x1      = bx0 + bw * (3 - Math.sqrt(3)) / 6;
      const x2      = bx0 + bw * (3 + Math.sqrt(3)) / 6;
      const hogLPts = mRawPts.filter(([x]) => x <= x1 + 2);
      const sagPts  = mRawPts.filter(([x]) => x >= x1 - 2 && x <= x2 + 2);
      const hogRPts = mRawPts.filter(([x]) => x >= x2 - 2);
      mShapeEl = (
        <>
          <path d={ptsToFillPath(hogLPts, mBaseY)} fill={mFill} stroke="none" />
          <path d={ptsToFillPath(sagPts,  mBaseY)} fill={mFill} stroke="none" />
          <path d={ptsToFillPath(hogRPts, mBaseY)} fill={mFill} stroke="none" />
          <polyline points={ptsToPolyline(mRawPts)} fill="none" stroke={mStroke} strokeWidth={1.5} />
          <line x1={bx0} y1={mBaseY} x2={bx1} y2={mBaseY} stroke={baseColor} strokeWidth={1} />
          {fixedWallLeft(mBaseY, wallH)}
          {fixedWallRight(mBaseY, wallH)}
        </>
      );
      break;
    }
  }

  // ── V diagram geometry ────────────────────────────────────────────────────
  const vCenterY = V_Y0 + chartTopOff + chartH / 2;
  const vChartH  = chartH / 2 - 2;

  // Lifted to outer scope so beamPeakGeometry receives the real heights
  const vPosH = vChartH;
  const vNegH =
    beamType === 'fp'         ? vChartH * (VEdB / VEdA) :
    beamType === 'cantilever' ? 0                       :
                                vChartH;

  let vShapeEl: React.ReactNode;

  switch (beamType) {
    case 'ss': {
      const vMidX = (bx0 + bx1) / 2;
      vShapeEl = (
        <>
          <path d={`M ${bx0},${vCenterY - vChartH} L ${vMidX},${vCenterY} L ${bx0},${vCenterY} Z`}
            fill={vPosFill} stroke="none" />
          <line x1={bx0} y1={vCenterY - vChartH} x2={vMidX} y2={vCenterY}
            stroke={vPosStroke} strokeWidth={1.5} />
          <path d={`M ${vMidX},${vCenterY} L ${bx1},${vCenterY + vChartH} L ${bx1},${vCenterY} Z`}
            fill={vNegFill} stroke="none" />
          <line x1={vMidX} y1={vCenterY} x2={bx1} y2={vCenterY + vChartH}
            stroke={vNegStroke} strokeWidth={1.5} />
          <line x1={bx0} y1={vCenterY} x2={bx1} y2={vCenterY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
    case 'cantilever': {
      vShapeEl = (
        <>
          <path d={`M ${bx0},${vCenterY - vChartH} L ${bx1},${vCenterY} L ${bx0},${vCenterY} Z`}
            fill={vPosFill} stroke="none" />
          <line x1={bx0} y1={vCenterY - vChartH} x2={bx1} y2={vCenterY}
            stroke={vPosStroke} strokeWidth={1.5} />
          <line x1={bx0} y1={vCenterY} x2={bx1} y2={vCenterY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
    case 'fp': {
      const vZeroX = bx0 + bw * (5 / 8);
      vShapeEl = (
        <>
          <path d={`M ${bx0},${vCenterY - vPosH} L ${vZeroX},${vCenterY} L ${bx0},${vCenterY} Z`}
            fill={vPosFill} stroke="none" />
          <line x1={bx0} y1={vCenterY - vPosH} x2={vZeroX} y2={vCenterY}
            stroke={vPosStroke} strokeWidth={1.5} />
          <path d={`M ${vZeroX},${vCenterY} L ${bx1},${vCenterY + vNegH} L ${bx1},${vCenterY} Z`}
            fill={vNegFill} stroke="none" />
          <line x1={vZeroX} y1={vCenterY} x2={bx1} y2={vCenterY + vNegH}
            stroke={vNegStroke} strokeWidth={1.5} />
          <line x1={bx0} y1={vCenterY} x2={bx1} y2={vCenterY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
    case 'ff': {
      const vMidX = (bx0 + bx1) / 2;
      vShapeEl = (
        <>
          <path d={`M ${bx0},${vCenterY - vChartH} L ${vMidX},${vCenterY} L ${bx0},${vCenterY} Z`}
            fill={vPosFill} stroke="none" />
          <line x1={bx0} y1={vCenterY - vChartH} x2={vMidX} y2={vCenterY}
            stroke={vPosStroke} strokeWidth={1.5} />
          <path d={`M ${vMidX},${vCenterY} L ${bx1},${vCenterY + vChartH} L ${bx1},${vCenterY} Z`}
            fill={vNegFill} stroke="none" />
          <line x1={vMidX} y1={vCenterY} x2={bx1} y2={vCenterY + vChartH}
            stroke={vNegStroke} strokeWidth={1.5} />
          <line x1={bx0} y1={vCenterY} x2={bx1} y2={vCenterY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
  }

  // ── δ diagram geometry ────────────────────────────────────────────────────
  const dBaseY = D_Y0 + chartTopOff;

  let dPts: Array<[number, number]>;
  switch (beamType) {
    case 'ss':
    case 'ff': {
      dPts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        dPts.push([bx0 + bw * t, dBaseY + 4 * t * (1 - t) * chartH]);
      }
      break;
    }
    case 'cantilever': {
      dPts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const raw = (6 * t * t - 4 * t * t * t + t * t * t * t) / 3;
        dPts.push([bx0 + bw * t, dBaseY + raw * chartH]);
      }
      break;
    }
    case 'fp': {
      dPts = [];
      let dMax = 0;
      // Analytical deflection shape for fixed-left / pinned-right propped
      // cantilever under UDL: y ∝ t²(1−t)(3−2t). Peaks at t ≈ 0.5785.
      const rawFn = (t: number) => t * t * (1 - t) * (3 - 2 * t);
      for (let i = 0; i <= N; i++) {
        dMax = Math.max(dMax, rawFn(i / N));
      }
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        dPts.push([bx0 + bw * t, dBaseY + (rawFn(t) / dMax) * chartH]);
      }
      break;
    }
  }

  const dPolyline = dPts!.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const dFillPath =
    `M ${bx0},${dBaseY} ` +
    dPts!.map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
    ` L ${bx1},${dBaseY} Z`;

  // ── Label + peak-dot geometry (shared helper) ─────────────────────────────
  const geom = beamPeakGeometry({
    beamType, bx0, bx1, mBaseY, mUnit, rawMin, rawMax,
    vCenterY, vChartH, vPosH, vNegH, dBaseY, chartH,
  });

  const renderLabel = (
    pos: LabelPos, text: string,
    opts: { fontSize?: number; color?: string; bold?: boolean } = {},
  ) => (
    <text
      x={pos.x} y={pos.y}
      fontSize={opts.fontSize ?? FS_PEAK}
      fontWeight={opts.bold === false ? undefined : 600}
      fill={opts.color ?? C_PEAK}
      textAnchor={pos.anchor}
      dominantBaseline="middle"
      style={{ fontFamily: FF_MONO }}
    >
      {text}
    </text>
  );

  const renderDot = (p: { x: number; y: number }, color: string) => (
    <circle cx={p.x} cy={p.y} r={DOT_R} fill={color} stroke="none" />
  );

  // ff sagging secondary value: |MEd|×0.5 (UDL assumption)
  const ffSagValue = beamType === 'ff' ? Math.abs(MEd) * 0.5 : 0;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ══ M diagram ════════════════════════════════════════════════════ */}
      <text x={bx0} y={M_Y0 + 11} fontSize={FS_AXIS} fill={C_AXIS}
        style={{ fontFamily: FF_MONO }}>
        M (kNm)
      </text>
      {mShapeEl}
      {renderDot(geom.mPeak, mStroke)}
      {renderLabel(geom.mLabel, `${MEd.toFixed(1)} kNm`)}
      {geom.mPeakSecondary && renderDot(geom.mPeakSecondary, mStroke)}
      {geom.mLabelSecondary && renderLabel(
        geom.mLabelSecondary,
        `${ffSagValue.toFixed(1)} kNm`,
        { fontSize: FS_FF_SAG, color: C_ADM, bold: false },
      )}

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <line x1={bx0} y1={V_Y0 - 4} x2={bx1} y2={V_Y0 - 4}
        stroke={divColor} strokeWidth={0.5} strokeDasharray="3,3" />

      {/* ══ V diagram ════════════════════════════════════════════════════ */}
      <text x={bx0} y={V_Y0 + 11} fontSize={FS_AXIS} fill={C_AXIS}
        style={{ fontFamily: FF_MONO }}>
        V (kN)
      </text>
      {vShapeEl}
      {renderDot(geom.vPosPeak, vPosStroke)}
      {renderLabel(geom.vPosLabel, `+${VEdA.toFixed(1)} kN`, { color: vPosLabelC })}
      {geom.vNegPeak && renderDot(geom.vNegPeak, vNegStroke)}
      {geom.vNegLabel && renderLabel(
        geom.vNegLabel,
        `-${(beamType === 'fp' ? VEdB : VEdA).toFixed(1)} kN`,
        { color: vNegLabelC },
      )}

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <line x1={bx0} y1={D_Y0 - 4} x2={bx1} y2={D_Y0 - 4}
        stroke={divColor} strokeWidth={0.5} strokeDasharray="3,3" />

      {/* ══ δ diagram ════════════════════════════════════════════════════ */}
      <text x={bx0} y={D_Y0 + 11} fontSize={FS_AXIS} fill={C_AXIS}
        style={{ fontFamily: FF_MONO }}>
        δ (mm)
      </text>
      <path d={dFillPath} fill={dFill} stroke="none" />
      <polyline points={dPolyline} fill="none" stroke={dStroke} strokeWidth={1.5} />
      <line x1={bx0} y1={dBaseY} x2={bx1} y2={dBaseY} stroke={baseColor} strokeWidth={1} />
      {renderDot(geom.dPeak, dStroke)}
      {renderLabel(geom.dLabel, `${deltaMax.toFixed(1)} mm`)}
      {/* Cantilever δ peak is at the right end, so place the admissible note
          at the left to avoid collision. Other beam types have the peak at or
          near midspan, so right-aligned keeps a tidy diagonal. */}
      <text
        x={beamType === 'cantilever' ? bx0 + 2 : bx1 - 2}
        y={D_Y0 + secH - 4}
        fontSize={FS_ADM}
        fill={C_ADM}
        style={{ fontFamily: FF_MONO }}
        textAnchor={beamType === 'cantilever' ? 'start' : 'end'}
      >
        L/{deflLimit} = {deltaAdm.toFixed(1)} mm
      </text>
    </svg>
  );
};
