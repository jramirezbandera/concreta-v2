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

  // Each SVG uses its own zone's bars — no cross-referencing between zones
  const stirrupDiam = isPositive
    ? inp.vano_stirrupDiam as number
    : inp.apoyo_stirrupDiam as number;
  const stirrupLegs = isPositive
    ? inp.vano_stirrupLegs as number
    : inp.apoyo_stirrupLegs as number;

  // Bottom bars (always drawn at bottom of section)
  const botBarDiam = isPositive
    ? inp.vano_bot_barDiam as number
    : inp.apoyo_bot_barDiam as number;
  const botNBars = isPositive
    ? inp.vano_bot_nBars as number
    : inp.apoyo_bot_nBars as number;

  // Top bars (always drawn at top of section)
  const topBarDiam = isPositive
    ? inp.vano_top_barDiam as number
    : inp.apoyo_top_barDiam as number;
  const topNBars = isPositive
    ? inp.vano_top_nBars as number
    : inp.apoyo_top_nBars as number;

  const scaleX = drawW / b;
  const scaleY = drawH / h;
  const scale = Math.min(scaleX, scaleY);

  const sW = b * scale;
  const sH = h * scale;

  const ox = margin.left + (drawW - sW) / 2;
  const oy = margin.top  + (drawH - sH) / 2;

  const coverPx = cover * scale;
  const stirrupPx = stirrupDiam * scale;

  // Bottom bars
  const botBarDiamPx = Math.max(4, botBarDiam * scale * 0.8);
  const botBarY = oy + sH - coverPx - stirrupPx - botBarDiamPx / 2;
  const botBarSpacing = botNBars > 1 ? (sW - 2 * coverPx - botBarDiamPx) / (botNBars - 1) : 0;
  const botBarStartX = ox + coverPx + botBarDiamPx / 2;
  const botBars = Array.from({ length: botNBars }, (_, i) => ({
    cx: botBarStartX + i * botBarSpacing,
    cy: botBarY,
    r:  botBarDiamPx / 2,
  }));

  // Top bars
  const topBarDiamPx = Math.max(4, topBarDiam * scale * 0.8);
  const topBarY = oy + coverPx + stirrupPx + topBarDiamPx / 2;
  const topBarSpacing = topNBars > 1 ? (sW - 2 * coverPx - topBarDiamPx) / (topNBars - 1) : 0;
  const topBarStartX = ox + coverPx + topBarDiamPx / 2;
  const topBars = Array.from({ length: topNBars }, (_, i) => ({
    cx: topBarStartX + i * topBarSpacing,
    cy: topBarY,
    r:  topBarDiamPx / 2,
  }));

  // Use the correct section result based on moment sign
  const sectionResult = isPositive ? result.vano : result.apoyo;

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

  // Active bars: tension bars are active (accent), compression bars dimmed
  // positive (vano, M+): tension = bottom bars, compression = top bars
  // negative (apoyo, M-): tension = top bars, compression = bottom bars
  const botColor   = isPositive ? colors.rebarActive : colors.rebarDim;
  const topColor   = isPositive ? colors.rebarDim    : colors.rebarActive;
  const botOpacity = isPositive ? 1    : 0.45;
  const topOpacity = isPositive ? 0.45 : 1;

  // Interior stirrup leg lines (nLegs > 2 → nLegs-2 evenly-spaced vertical lines)
  const interiorLegs = stirrupLegs > 2
    ? Array.from({ length: stirrupLegs - 2 }, (_, i) => {
        const x = ox + coverPx + (i + 1) * (sW - 2 * coverPx) / (stirrupLegs - 1);
        return (
          <line
            key={`leg-${i}`}
            x1={x} y1={oy + coverPx}
            x2={x} y2={oy + sH - coverPx}
            stroke={colors.stirrup}
            strokeWidth={isPdf ? 1 : 0.75}
            opacity={0.5}
          />
        );
      })
    : null;

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

      {/* Interior stirrup leg lines */}
      {interiorLegs}

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

      {/* Top bars */}
      {topBars.map((bar, i) => (
        <circle
          key={`top-${i}`}
          cx={bar.cx} cy={bar.cy} r={bar.r}
          fill={isPdf ? topColor : 'none'}
          stroke={topColor}
          strokeWidth={isPdf ? 1 : 1.5}
          opacity={topOpacity}
        />
      ))}

      {/* Bottom bars */}
      {botBars.map((bar, i) => (
        <circle
          key={`bot-${i}`}
          cx={bar.cx} cy={bar.cy} r={bar.r}
          fill={isPdf ? botColor : 'none'}
          stroke={botColor}
          strokeWidth={isPdf ? 1 : 1.5}
          opacity={botOpacity}
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
