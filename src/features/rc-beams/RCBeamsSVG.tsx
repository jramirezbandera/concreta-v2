// RC Beam cross-section SVG — shows both midspan (bottom) and support (top) bars.
// Active section bars drawn in accent color; inactive bars drawn dimmed.
// Stirrups always shown at full opacity.
//
// mode='screen': Tailwind CSS custom properties
// mode='pdf':    inline styles, grayscale

import { type RCBeamInputs } from '../../data/defaults';
import { type RCBeamResult } from '../../lib/calculations/rcBeams';

interface RCBeamsSVGProps {
  inp: RCBeamInputs;
  result: RCBeamResult;
  section?: 'vano' | 'apoyo';
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

const SCREEN_COLORS = {
  section:      '#334155',
  sectionFill:  '#1e293b',
  rebarActive:  '#38bdf8',  // accent — active section bars
  rebarDim:     '#475569',  // dimmed — inactive section bars
  stirrup:      '#94a3b8',  // always full opacity
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
  section = 'vano',
  mode = 'screen',
  width = 300,
  height = 360,
}: RCBeamsSVGProps) {
  const isPdf = mode === 'pdf';
  const colors = isPdf ? PDF_COLORS : SCREEN_COLORS;

  const margin = { top: 40, bottom: 40, left: 48, right: 48 };
  const drawW = width - margin.left - margin.right;
  const drawH = height - margin.top - margin.bottom;

  const b = inp.b as number;
  const h = inp.h as number;
  const cover = inp.cover as number;
  const stirrupDiam = inp.stirrupDiam as number;
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

  // Neutral axis from midspan result (for visualization)
  const midResult = result.midspan;
  const xNA = midResult.valid ? midResult.x * scale : 0;
  const xBlock = xNA * 0.8;
  const dPx = midResult.valid ? midResult.d * scale : sH * 0.9;

  // Active / inactive bar colors
  const midColor = section === 'vano'  ? colors.rebarActive : colors.rebarDim;
  const supColor = section === 'apoyo' ? colors.rebarActive : colors.rebarDim;
  const midOpacity = section === 'vano'  ? 1 : 0.45;
  const supOpacity = section === 'apoyo' ? 1 : 0.45;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={isPdf ? { background: colors.bg } : undefined}
    >
      {/* Stress block (Whitney) — midspan */}
      {midResult.valid && section === 'vano' && (
        <rect
          x={ox} y={oy}
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
        strokeDasharray="none"
        opacity={0.6}
      />

      {/* Neutral axis (dashed) — midspan */}
      {midResult.valid && (
        <line
          x1={ox - 6} y1={oy + xNA}
          x2={ox + sW + 6} y2={oy + xNA}
          stroke={colors.axis}
          strokeWidth={1}
          strokeDasharray="5 3"
          opacity={section === 'vano' ? 0.9 : 0.3}
        />
      )}

      {/* Effective depth line — midspan */}
      {midResult.valid && (
        <line
          x1={ox - 4} y1={oy + dPx}
          x2={ox + sW + 4} y2={oy + dPx}
          stroke={colors.dim}
          strokeWidth={0.75}
          strokeDasharray="2 4"
          opacity={section === 'vano' ? 0.5 : 0.15}
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

      {/* Neutral axis label */}
      {midResult.valid && (
        <text
          x={ox + sW + 10}
          y={oy + xNA}
          dominantBaseline="middle"
          fontSize={8}
          fill={colors.axis}
          style={isPdf ? { fontFamily: 'monospace', fontSize: '8px', fill: colors.axis } : undefined}
          className={isPdf ? undefined : 'text-[8px] font-mono fill-accent'}
          opacity={section === 'vano' ? 1 : 0.3}
        >
          FN
        </text>
      )}

      {/* Section labels */}
      <text
        x={ox + sW / 2} y={oy + sH - coverPx - stirrupPx * 0.5}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={7}
        fill={midColor}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '7px', fill: midColor } : undefined}
        className={isPdf ? undefined : 'text-[7px] font-mono'}
        opacity={midOpacity * 0.7}
      >
        vano
      </text>
      <text
        x={ox + sW / 2} y={oy + coverPx + stirrupPx * 0.5}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={7}
        fill={supColor}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '7px', fill: supColor } : undefined}
        className={isPdf ? undefined : 'text-[7px] font-mono'}
        opacity={supOpacity * 0.7}
      >
        apoyo
      </text>
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
