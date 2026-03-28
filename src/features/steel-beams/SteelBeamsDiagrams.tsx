import { type FC } from 'react';

interface SteelBeamsDiagramsProps {
  MEd: number;       // kNm — M peak label
  VEd: number;       // kN  — V end labels
  L: number;         // mm
  deltaMax: number;  // mm — computed δmax
  deltaAdm: number;  // mm — L/300 limit
  mode: 'screen' | 'pdf';
  width: number;
  height: number;
}

export const SteelBeamsDiagrams: FC<SteelBeamsDiagramsProps> = ({
  MEd, VEd, deltaMax, deltaAdm, mode, width, height,
}) => {
  if (MEd <= 0 || VEd <= 0) return null;

  const isPdf = mode === 'pdf';

  const padX = 24;
  const bx0 = padX;
  const bx1 = width - padX;
  const bw = bx1 - bx0;
  const vMidX = (bx0 + bx1) / 2;

  // ── Layout: 3 equal sections, 8px gaps ──────────────────────────────────
  const gap = 8;
  const secH = Math.floor((height - 2 * gap) / 3);
  const M_Y0 = 0;
  const V_Y0 = secH + gap;
  const D_Y0 = 2 * (secH + gap);

  const labelH = 14;  // section header height
  const triH = 5;
  const N = 40;

  // Chart geometry (enough bottom margin so labels don't spill into next section)
  const chartTopOff = labelH + 4;                      // offset from section top to baseline
  const chartBot    = 16;                              // reserve below chart peak for labels
  const chartH      = secH - chartTopOff - chartBot;  // usable chart height

  // ── M section ────────────────────────────────────────────────────────────
  const mBaseY = M_Y0 + chartTopOff;

  const mPts: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    mPts.push([bx0 + bw * t, mBaseY + 4 * t * (1 - t) * chartH]);
  }
  const mPolyline = mPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const mFillPath =
    `M ${bx0},${mBaseY} ` +
    mPts.map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
    ` L ${bx1},${mBaseY} Z`;

  // ── V section ────────────────────────────────────────────────────────────
  const vCenterY = V_Y0 + chartTopOff + chartH / 2;
  const vChartH  = chartH / 2 - 2;

  // ── δ section ────────────────────────────────────────────────────────────
  const dBaseY = D_Y0 + chartTopOff;
  // Normalized parabola — always fills chart height regardless of magnitude
  // (values shown as text; color = pass/warn/fail)
  const dPts: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    dPts.push([bx0 + bw * t, dBaseY + 4 * t * (1 - t) * chartH]);
  }
  const dPolyline = dPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const dFillPath =
    `M ${bx0},${dBaseY} ` +
    dPts.map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
    ` L ${bx1},${dBaseY} Z`;

  // δ status
  const dStatus = deltaMax > deltaAdm ? 'fail' : deltaMax / deltaAdm > 0.8 ? 'warn' : 'ok';

  // ── Colors ───────────────────────────────────────────────────────────────
  const mFill      = isPdf ? 'rgba(56,189,248,0.12)' : 'rgba(56,189,248,0.2)';
  const mStroke    = isPdf ? '#336699'               : '#38bdf8';
  const vPosFill   = isPdf ? 'rgba(34,197,94,0.12)'  : 'rgba(34,197,94,0.2)';
  const vPosStroke = isPdf ? '#336633'               : '#22c55e';
  const vNegFill   = isPdf ? 'rgba(239,68,68,0.12)'  : 'rgba(239,68,68,0.2)';
  const vNegStroke = isPdf ? '#663333'               : '#ef4444';

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
  const fillLabel  = isPdf ? '#333333' : '#f8fafc';   // label inside fill
  const vPosLabel  = isPdf ? '#336633' : '#22c55e';
  const vNegLabel  = isPdf ? '#663333' : '#ef4444';
  const admColor   = isPdf ? '#888888' : '#64748b';
  const ff         = isPdf ? 'monospace' : undefined;

  const leftTri  = (by: number) =>
    `M ${bx0},${by} L ${bx0 - 4},${by - triH} L ${bx0 + 4},${by - triH} Z`;
  const rightTri = (by: number) =>
    `M ${bx1},${by} L ${bx1 - 4},${by - triH} L ${bx1 + 4},${by - triH} Z`;

  // Label inside fill: centered at 65% of chart height from baseline (near widest part)
  const mFillLabelY = mBaseY + chartH * 0.65;
  const dFillLabelY = dBaseY + chartH * 0.65;

  // V label positions: centered inside each triangle
  const vPosLabelX = bx0 + (vMidX - bx0) * 0.4;
  const vPosLabelY = vCenterY - vChartH * 0.45;
  const vNegLabelX = vMidX + (bx1 - vMidX) * 0.6;
  const vNegLabelY = vCenterY + vChartH * 0.55;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ══ M — positive moment, tension below ══════════════════════════ */}
      <text x={bx0} y={M_Y0 + 11} fontSize={9} fill={labelColor} fontFamily={ff}>
        M (kNm)
      </text>
      <path d={mFillPath} fill={mFill} stroke="none" />
      <polyline points={mPolyline} fill="none" stroke={mStroke} strokeWidth={1.5} />
      <line x1={bx0} y1={mBaseY} x2={bx1} y2={mBaseY} stroke={baseColor} strokeWidth={1} />
      <path d={leftTri(mBaseY)}  fill={baseColor} />
      <path d={rightTri(mBaseY)} fill={baseColor} />
      {/* Value label inside fill */}
      <text x={vMidX} y={mFillLabelY} fontSize={8} fill={fillLabel}
        fontFamily={ff} textAnchor="middle" dominantBaseline="middle">
        {MEd.toFixed(1)} kNm
      </text>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <line x1={bx0} y1={V_Y0 - 4} x2={bx1} y2={V_Y0 - 4}
        stroke={divColor} strokeWidth={0.5} strokeDasharray="3,3" />

      {/* ══ V — linear shear ════════════════════════════════════════════ */}
      <text x={bx0} y={V_Y0 + 11} fontSize={9} fill={labelColor} fontFamily={ff}>
        V (kN)
      </text>
      {/* Positive half (left, above baseline) */}
      <path
        d={`M ${bx0},${vCenterY - vChartH} L ${vMidX},${vCenterY} L ${bx0},${vCenterY} Z`}
        fill={vPosFill} stroke="none"
      />
      <line x1={bx0} y1={vCenterY - vChartH} x2={vMidX} y2={vCenterY}
        stroke={vPosStroke} strokeWidth={1.5} />
      {/* Negative half (right, below baseline) */}
      <path
        d={`M ${vMidX},${vCenterY} L ${bx1},${vCenterY + vChartH} L ${bx1},${vCenterY} Z`}
        fill={vNegFill} stroke="none"
      />
      <line x1={vMidX} y1={vCenterY} x2={bx1} y2={vCenterY + vChartH}
        stroke={vNegStroke} strokeWidth={1.5} />
      <line x1={bx0} y1={vCenterY} x2={bx1} y2={vCenterY}
        stroke={baseColor} strokeWidth={1} />
      {/* Labels centered inside each triangle */}
      <text x={vPosLabelX} y={vPosLabelY} fontSize={8} fill={vPosLabel}
        fontFamily={ff} textAnchor="middle" dominantBaseline="middle">
        +{VEd.toFixed(1)} kN
      </text>
      <text x={vNegLabelX} y={vNegLabelY} fontSize={8} fill={vNegLabel}
        fontFamily={ff} textAnchor="middle" dominantBaseline="middle">
        -{VEd.toFixed(1)} kN
      </text>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <line x1={bx0} y1={D_Y0 - 4} x2={bx1} y2={D_Y0 - 4}
        stroke={divColor} strokeWidth={0.5} strokeDasharray="3,3" />

      {/* ══ δ — deflection, normalized shape, color = status ════════════ */}
      <text x={bx0} y={D_Y0 + 11} fontSize={9} fill={labelColor} fontFamily={ff}>
        δ (mm)
      </text>
      <path d={dFillPath} fill={dFill} stroke="none" />
      <polyline points={dPolyline} fill="none" stroke={dStroke} strokeWidth={1.5} />
      <line x1={bx0} y1={dBaseY} x2={bx1} y2={dBaseY} stroke={baseColor} strokeWidth={1} />
      <path d={leftTri(dBaseY)}  fill={baseColor} />
      <path d={rightTri(dBaseY)} fill={baseColor} />
      {/* δmax label inside fill */}
      <text x={vMidX} y={dFillLabelY} fontSize={8} fill={fillLabel}
        fontFamily={ff} textAnchor="middle" dominantBaseline="middle">
        {deltaMax.toFixed(1)} mm
      </text>
      {/* δadm label at bottom of section — always within SVG bounds */}
      <text x={bx1 - 2} y={D_Y0 + secH - 4} fontSize={7} fill={admColor}
        fontFamily={ff} textAnchor="end">
        L/300 = {deltaAdm.toFixed(1)} mm
      </text>
    </svg>
  );
};
