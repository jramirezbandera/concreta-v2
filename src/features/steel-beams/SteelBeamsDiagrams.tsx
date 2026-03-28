import { type FC } from 'react';
import { type BeamType } from '../../data/defaults';

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

  const labelColor = isPdf ? '#555555' : '#94a3b8';
  const baseColor  = isPdf ? '#555555' : '#475569';
  const divColor   = isPdf ? '#cccccc' : '#1e293b';
  const fillLabel  = isPdf ? '#333333' : '#f8fafc';
  const vPosLabel  = isPdf ? '#336633' : '#22c55e';
  const vNegLabel  = isPdf ? '#663333' : '#ef4444';
  const admColor   = isPdf ? '#888888' : '#64748b';
  const ff         = isPdf ? 'monospace' : undefined;

  // ── Support symbols ───────────────────────────────────────────────────────

  const triH = 5;
  const leftTri  = (by: number) =>
    `M ${bx0},${by} L ${bx0 - 4},${by + triH} L ${bx0 + 4},${by + triH} Z`;
  const rightTri = (by: number) =>
    `M ${bx1},${by} L ${bx1 - 4},${by + triH} L ${bx1 + 4},${by + triH} Z`;

  // Fixed wall: filled rect + 2 diagonal hatch lines (standard structural notation)
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
  // Shape function per beam type (raw, normalized so |extreme| = 1.0).
  // Positive = sagging, negative = hogging.
  const mShapeFn: (t: number) => number =
    beamType === 'ss'         ? (t) => 4 * t * (1 - t)          :  // peak +1 at midspan
    beamType === 'cantilever' ? (t) => -(1 - t)                  :  // -1 at root, 0 at tip
    beamType === 'fp'         ? (t) => -1 + 5 * t - 4 * t * t   :  // -1 at x=0, zero at x=0.25L
    /* ff */                    (t) => -1 + 6 * t - 6 * t * t;     // -1 at ends, +0.5 at midspan

  const rawVals = Array.from({ length: N + 1 }, (_, i) => mShapeFn(i / N));
  const rawMin  = Math.min(...rawVals);
  const rawMax  = Math.max(...rawVals);

  // Scale so the full shape range fits between label and bottom margin.
  const mAvailH = secH - labelH - chartBot;
  const mUnit   = mAvailH / Math.max(rawMax - rawMin, 0.01);
  // Baseline y: push down enough so hogging (rawMin < 0) fits above labelH.
  const mBaseY  = M_Y0 + labelH + (rawMin < 0 ? -rawMin * mUnit : 0);

  // Screen-space points
  const mRawPts: Array<[number, number]> = rawVals.map((v, i) => [
    bx0 + bw * (i / N),
    mBaseY + v * mUnit,
  ]);

  // Label: place in the governing region (hogging if present, otherwise sagging).
  const mLabelY = rawMin < 0
    ? mBaseY + rawMin * mUnit * 0.5
    : mBaseY + rawMax * mUnit * 0.65;

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
      // Zero crossing at t=0.25
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
      // Zero crossings at t = (3 ± √3)/6 ≈ 0.211 and 0.789
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

  let vShapeEl: React.ReactNode;
  let vLabelAX: number, vLabelAY: number;
  let vLabelBX: number, vLabelBY: number;
  let vLabelAColor: string, vLabelBColor: string;
  let vLabelA: string, vLabelB: string;

  switch (beamType) {
    case 'ss': {
      // Symmetric: +VEdA left of midspan, -VEdA right
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
      vLabelAX = bx0 + (vMidX - bx0) * 0.4; vLabelAY = vCenterY - vChartH * 0.45;
      vLabelBX = vMidX + (bx1 - vMidX) * 0.6; vLabelBY = vCenterY + vChartH * 0.55;
      vLabelAColor = vPosLabel; vLabelBColor = vNegLabel;
      vLabelA = `+${VEdA.toFixed(1)} kN`; vLabelB = `-${VEdA.toFixed(1)} kN`;
      break;
    }

    case 'cantilever': {
      // All positive: max at left (root), zero at right (tip)
      vShapeEl = (
        <>
          <path d={`M ${bx0},${vCenterY - vChartH} L ${bx1},${vCenterY} L ${bx0},${vCenterY} Z`}
            fill={vPosFill} stroke="none" />
          <line x1={bx0} y1={vCenterY - vChartH} x2={bx1} y2={vCenterY}
            stroke={vPosStroke} strokeWidth={1.5} />
          <line x1={bx0} y1={vCenterY} x2={bx1} y2={vCenterY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      vLabelAX = bx0 + bw * 0.25; vLabelAY = vCenterY - vChartH * 0.55;
      vLabelBX = bx0 + bw * 0.75; vLabelBY = vCenterY - vChartH * 0.15;
      vLabelAColor = vPosLabel; vLabelBColor = admColor;
      vLabelA = `+${VEdA.toFixed(1)} kN`; vLabelB = '0 kN';
      break;
    }

    case 'fp': {
      // +5wL/8 at left (t=0), zero at t=5/8, -3wL/8 at right (t=1)
      const vZeroX = bx0 + bw * (5 / 8);
      const vPosH  = vChartH;                        // left: full height (VEdA = 5wL/8)
      const vNegH  = vChartH * (VEdB / VEdA);        // right: proportional (VEdB = 3wL/8)
      vShapeEl = (
        <>
          {/* Positive trapezoid left */}
          <path d={`M ${bx0},${vCenterY - vPosH} L ${vZeroX},${vCenterY} L ${bx0},${vCenterY} Z`}
            fill={vPosFill} stroke="none" />
          <line x1={bx0} y1={vCenterY - vPosH} x2={vZeroX} y2={vCenterY}
            stroke={vPosStroke} strokeWidth={1.5} />
          {/* Negative triangle right */}
          <path d={`M ${vZeroX},${vCenterY} L ${bx1},${vCenterY + vNegH} L ${bx1},${vCenterY} Z`}
            fill={vNegFill} stroke="none" />
          <line x1={vZeroX} y1={vCenterY} x2={bx1} y2={vCenterY + vNegH}
            stroke={vNegStroke} strokeWidth={1.5} />
          <line x1={bx0} y1={vCenterY} x2={bx1} y2={vCenterY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      vLabelAX = bx0 + (vZeroX - bx0) * 0.35; vLabelAY = vCenterY - vPosH * 0.5;
      vLabelBX = vZeroX + (bx1 - vZeroX) * 0.6; vLabelBY = vCenterY + vNegH * 0.6;
      vLabelAColor = vPosLabel; vLabelBColor = vNegLabel;
      vLabelA = `+${VEdA.toFixed(1)} kN`; vLabelB = `-${VEdB.toFixed(1)} kN`;
      break;
    }

    case 'ff': {
      // Same as ss: symmetric ±VEdA, zero crossing at midspan
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
      vLabelAX = bx0 + (vMidX - bx0) * 0.4; vLabelAY = vCenterY - vChartH * 0.45;
      vLabelBX = vMidX + (bx1 - vMidX) * 0.6; vLabelBY = vCenterY + vChartH * 0.55;
      vLabelAColor = vPosLabel; vLabelBColor = vNegLabel;
      vLabelA = `+${VEdA.toFixed(1)} kN`; vLabelB = `-${VEdA.toFixed(1)} kN`;
      break;
    }
  }

  // ── δ diagram geometry ────────────────────────────────────────────────────
  const dBaseY = D_Y0 + chartTopOff;

  // Deflection shape per beam type (all sagging / downward, fill below baseline)
  // Normalized so peak = 1.0 filling chartH
  let dPts: Array<[number, number]>;
  switch (beamType) {
    case 'ss':
    case 'ff': {
      // Symmetric parabola, peak at midspan
      dPts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        dPts.push([bx0 + bw * t, dBaseY + 4 * t * (1 - t) * chartH]);
      }
      break;
    }
    case 'cantilever': {
      // Cubic curve, zero slope at root (left), max deflection at tip (right)
      // Normalized cantilever UDL shape: δ(t) = (6t² - 4t³ + t⁴) / 3 at t=1 → norm to 1
      dPts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const raw = (6 * t * t - 4 * t * t * t + t * t * t * t) / 3;
        dPts.push([bx0 + bw * t, dBaseY + raw * chartH]);
      }
      break;
    }
    case 'fp': {
      // Asymmetric, max at ≈0.4215L from fixed end
      // Approximation: cubic × asymmetric factor
      // δ(t) ≈ t²(1-t)·(1+0.6t) normalized to peak=1 at t≈0.4215
      dPts = [];
      let dMax = 0;
      const rawFn = (t: number) => t * t * (1 - t) * (1 + 0.6 * t);
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

  const dFillLabelY = dBaseY + chartH * 0.65;
  const mFillLabelX = (bx0 + bx1) / 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ══ M diagram ════════════════════════════════════════════════════ */}
      <text x={bx0} y={M_Y0 + 11} fontSize={9} fill={labelColor} fontFamily={ff}>
        M (kNm)
      </text>
      {mShapeEl}
      <text x={mFillLabelX} y={mLabelY} fontSize={8} fill={fillLabel}
        fontFamily={ff} textAnchor="middle" dominantBaseline="middle">
        {MEd.toFixed(1)} kNm
      </text>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <line x1={bx0} y1={V_Y0 - 4} x2={bx1} y2={V_Y0 - 4}
        stroke={divColor} strokeWidth={0.5} strokeDasharray="3,3" />

      {/* ══ V diagram ════════════════════════════════════════════════════ */}
      <text x={bx0} y={V_Y0 + 11} fontSize={9} fill={labelColor} fontFamily={ff}>
        V (kN)
      </text>
      {vShapeEl}
      <text x={vLabelAX} y={vLabelAY} fontSize={8} fill={vLabelAColor}
        fontFamily={ff} textAnchor="middle" dominantBaseline="middle">
        {vLabelA}
      </text>
      <text x={vLabelBX} y={vLabelBY} fontSize={8} fill={vLabelBColor}
        fontFamily={ff} textAnchor="middle" dominantBaseline="middle">
        {vLabelB}
      </text>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <line x1={bx0} y1={D_Y0 - 4} x2={bx1} y2={D_Y0 - 4}
        stroke={divColor} strokeWidth={0.5} strokeDasharray="3,3" />

      {/* ══ δ diagram ════════════════════════════════════════════════════ */}
      <text x={bx0} y={D_Y0 + 11} fontSize={9} fill={labelColor} fontFamily={ff}>
        δ (mm)
      </text>
      <path d={dFillPath} fill={dFill} stroke="none" />
      <polyline points={dPolyline} fill="none" stroke={dStroke} strokeWidth={1.5} />
      <line x1={bx0} y1={dBaseY} x2={bx1} y2={dBaseY} stroke={baseColor} strokeWidth={1} />
      <text x={mFillLabelX} y={dFillLabelY} fontSize={8} fill={fillLabel}
        fontFamily={ff} textAnchor="middle" dominantBaseline="middle">
        {deltaMax.toFixed(1)} mm
      </text>
      <text x={bx1 - 2} y={D_Y0 + secH - 4} fontSize={7} fill={admColor}
        fontFamily={ff} textAnchor="end">
        L/{deflLimit} = {deltaAdm.toFixed(1)} mm
      </text>
    </svg>
  );
};
