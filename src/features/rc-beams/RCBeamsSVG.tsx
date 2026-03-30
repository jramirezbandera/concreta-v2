// RC Beam cross-section SVG.
//
// momentSign='positive' — vano (M+): compression top, stress block top, tension bars bottom.
// momentSign='negative' — apoyo (M-): compression bottom, stress block bottom, tension bars top.
//
// mode='screen': Tailwind CSS custom properties
// mode='pdf':    inline styles, grayscale

import { type RCBeamInputs } from '../../data/defaults';
import { type RCBeamResult } from '../../lib/calculations/rcBeams';

interface RCBeamsSVGProps {
  inp: RCBeamInputs;
  result: RCBeamResult;
  momentSign?: 'positive' | 'negative';
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

const SCREEN_COLORS = {
  section:      '#334155',
  sectionFill:  '#1e293b',
  rebarActive:  '#38bdf8',  // accent — active section bars
  rebarDim:     '#475569',  // dimmed — inactive section bars
  stirrup:      '#94a3b8',
  axis:         '#38bdf8',
  stressBlock:  '#38bdf8',
  dim:          '#94a3b8',
  dimText:      '#94a3b8',
  bg:           'transparent',
};

const PDF_COLORS = {
  section:      '#000000',
  sectionFill:  '#f8f8f8',
  rebarActive:  '#333333',
  rebarDim:     '#aaaaaa',
  stirrup:      '#666666',
  axis:         '#000000',
  stressBlock:  '#cccccc',
  dim:          '#666666',
  dimText:      '#666666',
  bg:           '#ffffff',
};

export function RCBeamsSVG({
  inp,
  result,
  momentSign = 'positive',
  mode = 'screen',
  width = 300,
  height = 360,
}: RCBeamsSVGProps) {
  const isPdf = mode === 'pdf';
  const colors = isPdf ? PDF_COLORS : SCREEN_COLORS;
  const isPositive = momentSign === 'positive';

  const margin = { top: 40, bottom: 40, left: 48, right: 48 };
  const drawW = width - margin.left - margin.right;
  const drawH = height - margin.top - margin.bottom;

  const b = inp.b as number;
  const h = inp.h as number;
  const cover = inp.cover as number;
  const midStirrupDiam = inp.midspan_stirrupDiam as number;
  const supStirrupDiam = inp.support_stirrupDiam as number;
  const stirrupDiam = isPositive ? midStirrupDiam : supStirrupDiam;
  const midBarDiam = inp.midspan_barDiam as number;
  const supBarDiam = inp.support_barDiam as number;
  const midNBars = inp.midspan_nBars as number;
  const supNBars = inp.support_nBars as number;

  const scaleX = drawW / b;
  const scaleY = drawH / h;
  const scale = Math.min(scaleX, scaleY);

  const sW = b * scale;
  const sH = h * scale;

  const ox = margin.left + (drawW - sW) / 2;
  const oy = margin.top  + (drawH - sH) / 2;

  const coverPx = cover * scale;
  const stirrupPx = stirrupDiam * scale;

  // Midspan (bottom bars)
  const midBarDiamPx = Math.max(4, midBarDiam * scale * 0.8);
  const midBarY = oy + sH - coverPx - stirrupPx - midBarDiamPx / 2;
  const midBarSpacing = midNBars > 1 ? (sW - 2 * coverPx - midBarDiamPx) / (midNBars - 1) : 0;
  const midBarStartX = ox + coverPx + midBarDiamPx / 2;
  const midBars = Array.from({ length: midNBars }, (_, i) => ({
    cx: midBarStartX + i * midBarSpacing,
    cy: midBarY,
    r:  midBarDiamPx / 2,
  }));

  // Support (top bars)
  const supBarDiamPx = Math.max(4, supBarDiam * scale * 0.8);
  const supBarY = oy + coverPx + stirrupPx + supBarDiamPx / 2;
  const supBarSpacing = supNBars > 1 ? (sW - 2 * coverPx - supBarDiamPx) / (supNBars - 1) : 0;
  const supBarStartX = ox + coverPx + supBarDiamPx / 2;
  const supBars = Array.from({ length: supNBars }, (_, i) => ({
    cx: supBarStartX + i * supBarSpacing,
    cy: supBarY,
    r:  supBarDiamPx / 2,
  }));

  // Use the correct section result based on moment sign
  const sectionResult = isPositive ? result.midspan : result.support;

  // x = neutral axis depth from compression face (mm → px)
  const xNA    = sectionResult.valid ? sectionResult.x * scale : 0;
  const xBlock = Math.max(3, xNA * 0.8);  // Whitney rect block, min 3px visible
  const dPx    = sectionResult.valid ? sectionResult.d * scale : sH * 0.9;

  // Positions derived from compression face direction
  // positive: compression at TOP → y counted from oy downward
  // negative: compression at BOTTOM → y counted from oy+sH upward
  const stressBlockY = isPositive ? oy : oy + sH - xBlock;
  const naY          = isPositive ? oy + xNA    : oy + sH - xNA;
  const dLineY       = isPositive ? oy + dPx    : oy + sH - dPx;

  // Active bars: tension bars are active (accent), opposite side dimmed
  const midColor   = isPositive ? colors.rebarActive : colors.rebarDim;
  const supColor   = isPositive ? colors.rebarDim    : colors.rebarActive;
  const midOpacity = isPositive ? 1   : 0.45;
  const supOpacity = isPositive ? 0.45 : 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={isPdf ? { background: colors.bg } : undefined}
    >
      {/* Stress block (Whitney equivalent rectangular) */}
      {sectionResult.valid && (
        <rect
          x={ox} y={stressBlockY}
          width={sW} height={xBlock}
          fill={colors.stressBlock}
          opacity={isPdf ? 0.4 : 0.15}
        />
      )}

      {/* Section outline */}
      <rect
        x={ox} y={oy}
        width={sW} height={sH}
        fill="none"
        stroke={colors.section}
        strokeWidth={isPdf ? 2 : 1.5}
      />

      {/* Stirrup outline (inset from cover) */}
      <rect
        x={ox + coverPx}
        y={oy + coverPx}
        width={sW - 2 * coverPx}
        height={sH - 2 * coverPx}
        fill="none"
        stroke={colors.stirrup}
        strokeWidth={isPdf ? 1.5 : 1}
        opacity={0.6}
      />

      {/* Neutral axis — dashed, from compression face */}
      {sectionResult.valid && (
        <line
          x1={ox - 6} y1={naY}
          x2={ox + sW + 6} y2={naY}
          stroke={colors.axis}
          strokeWidth={1}
          strokeDasharray="5 3"
          opacity={0.9}
        />
      )}

      {/* Effective depth line */}
      {sectionResult.valid && (
        <line
          x1={ox - 4} y1={dLineY}
          x2={ox + sW + 4} y2={dLineY}
          stroke={colors.dim}
          strokeWidth={0.75}
          strokeDasharray="2 4"
          opacity={0.5}
        />
      )}

      {/* Support (top) bars */}
      {supBars.map((bar, i) => (
        <circle
          key={`sup-${i}`}
          cx={bar.cx} cy={bar.cy} r={bar.r}
          fill={isPdf ? supColor : 'none'}
          stroke={supColor}
          strokeWidth={isPdf ? 1 : 1.5}
          opacity={supOpacity}
        />
      ))}

      {/* Midspan (bottom) bars */}
      {midBars.map((bar, i) => (
        <circle
          key={`mid-${i}`}
          cx={bar.cx} cy={bar.cy} r={bar.r}
          fill={isPdf ? midColor : 'none'}
          stroke={midColor}
          strokeWidth={isPdf ? 1 : 1.5}
          opacity={midOpacity}
        />
      ))}

      {/* === Dimension annotations === */}
      <DimLine
        x1={ox} y1={oy - 14} x2={ox + sW} y2={oy - 14}
        label={`b = ${b}`} unit="mm"
        color={colors.dimText} isPdf={isPdf} horizontal
      />
      <DimLine
        x1={ox + sW + 14} y1={oy} x2={ox + sW + 14} y2={oy + sH}
        label={`h = ${h}`} unit="mm"
        color={colors.dimText} isPdf={isPdf} horizontal={false}
      />

      {/* "FN" label next to neutral axis */}
      {sectionResult.valid && (
        <text
          x={ox - 8}
          y={naY}
          textAnchor="end"
          dominantBaseline="middle"
          fontSize={7}
          fill={colors.axis}
          style={isPdf ? { fontFamily: 'monospace', fontSize: '7px', fill: colors.axis } : undefined}
          className={isPdf ? undefined : 'text-[7px] font-mono fill-accent'}
        >
          FN
        </text>
      )}
    </svg>
  );
}

function DimLine({
  x1, y1, x2, y2, label, unit, color, isPdf, horizontal,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; unit: string; color: string;
  isPdf: boolean; horizontal: boolean;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const fontSize = 9;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.75} />
      {horizontal ? (
        <>
          <line x1={x1} y1={y1 - 3} x2={x1} y2={y1 + 3} stroke={color} strokeWidth={0.75} />
          <line x1={x2} y1={y2 - 3} x2={x2} y2={y2 + 3} stroke={color} strokeWidth={0.75} />
          <text x={mx} y={y1 - 4} textAnchor="middle" fontSize={fontSize} fill={color}
            style={isPdf ? { fontFamily: 'monospace', fontSize: `${fontSize}px`, fill: color } : undefined}
            className={isPdf ? undefined : 'text-[9px] font-mono fill-text-secondary'}
          >
            {label} {unit}
          </text>
        </>
      ) : (
        <>
          <line x1={x1 - 3} y1={y1} x2={x1 + 3} y2={y1} stroke={color} strokeWidth={0.75} />
          <line x1={x2 - 3} y1={y2} x2={x2 + 3} y2={y2} stroke={color} strokeWidth={0.75} />
          <text
            x={x1 + 4} y={my}
            textAnchor="start" dominantBaseline="middle"
            fontSize={fontSize} fill={color}
            style={isPdf ? { fontFamily: 'monospace', fontSize: `${fontSize}px`, fill: color } : undefined}
            className={isPdf ? undefined : 'text-[9px] font-mono fill-text-secondary'}
          >
            {label} {unit}
          </text>
        </>
      )}
    </g>
  );
}
