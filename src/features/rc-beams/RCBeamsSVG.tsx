// RC Beam cross-section SVG — bending (ELU Flexión) mode
// Shows: section outline, rebar circles, neutral axis, Whitney stress block, dimension annotations.
//
// mode='screen': Tailwind colors via CSS custom properties
// mode='pdf':    inline styles only, grayscale, explicit x/y on all text

import { type RCBeamInputs } from '../../data/defaults';
import { type RCBeamResult } from '../../lib/calculations/rcBeams';

interface RCBeamsSVGProps {
  inp: RCBeamInputs;
  result: RCBeamResult;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

const SCREEN_COLORS = {
  section: '#334155',       // border-main
  sectionFill: '#1e293b',   // bg-surface
  rebar: '#f8fafc',         // text-primary
  axis: '#38bdf8',          // accent
  stressBlock: '#38bdf8',   // accent (semi-transparent via opacity)
  dim: '#94a3b8',           // text-secondary
  dimText: '#94a3b8',
  bg: 'transparent',
};

const PDF_COLORS = {
  section: '#000000',
  sectionFill: '#f8f8f8',
  rebar: '#333333',
  axis: '#000000',
  stressBlock: '#cccccc',
  dim: '#666666',
  dimText: '#666666',
  bg: '#ffffff',
};

export function RCBeamsSVG({
  inp,
  result,
  mode = 'screen',
  width = 300,
  height = 360,
}: RCBeamsSVGProps) {
  const isPdf = mode === 'pdf';
  const colors = isPdf ? PDF_COLORS : SCREEN_COLORS;

  // Layout: draw section centered with 40px margin on each side
  const margin = { top: 32, bottom: 32, left: 48, right: 48 };
  const drawW = width - margin.left - margin.right;
  const drawH = height - margin.top - margin.bottom;

  // Scale: fit the b×h section into drawW × drawH
  const scaleX = drawW / inp.b;
  const scaleY = drawH / inp.h;
  const scale = Math.min(scaleX, scaleY);

  const sW = inp.b * scale;   // section width in SVG px
  const sH = inp.h * scale;   // section height in SVG px

  const ox = margin.left + (drawW - sW) / 2;  // section origin x
  const oy = margin.top + (drawH - sH) / 2;   // section origin y

  // Section rectangle
  // Neutral axis (from top face)
  const xNA = result.valid ? result.x * scale : 0;
  // Stress block depth (0.8·x per Whitney)
  const xBlock = xNA * 0.8;
  // Effective depth
  const dPx = result.valid ? result.d * scale : sH * 0.9;
  // Cover in px
  const coverPx = inp.cover * scale;
  // Bar radius in px (visual minimum 4px)
  const barDiamPx = Math.max(4, inp.barDiam * scale * 0.8);

  // Distribute bars horizontally in the tension zone (bottom)
  const barY = oy + sH - coverPx - barDiamPx / 2;
  const barSpacing = inp.nBars > 1 ? (sW - 2 * coverPx - barDiamPx) / (inp.nBars - 1) : 0;
  const barStartX = ox + coverPx + barDiamPx / 2;

  const bars = Array.from({ length: inp.nBars }, (_, i) => ({
    cx: barStartX + i * barSpacing,
    cy: barY,
    r: barDiamPx / 2,
  }));

  const font = isPdf ? 'font-family: monospace; font-size: 10px;' : '';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={isPdf ? { background: colors.bg } : undefined}
    >
      {/* Stress block (Whitney, from top) */}
      {result.valid && (
        <rect
          x={ox}
          y={oy}
          width={sW}
          height={xBlock}
          fill={colors.stressBlock}
          opacity={isPdf ? 0.5 : 0.2}
        />
      )}

      {/* Section outline */}
      <rect
        x={ox}
        y={oy}
        width={sW}
        height={sH}
        fill="none"
        stroke={colors.section}
        strokeWidth={isPdf ? 2 : 1.5}
      />

      {/* Neutral axis (dashed) */}
      {result.valid && (
        <line
          x1={ox - 6}
          y1={oy + xNA}
          x2={ox + sW + 6}
          y2={oy + xNA}
          stroke={colors.axis}
          strokeWidth={1}
          strokeDasharray="5 3"
        />
      )}

      {/* Effective depth line */}
      {result.valid && (
        <line
          x1={ox - 4}
          y1={oy + dPx}
          x2={ox + sW + 4}
          y2={oy + dPx}
          stroke={colors.dim}
          strokeWidth={0.75}
          strokeDasharray="2 4"
          opacity={0.5}
        />
      )}

      {/* Rebar circles */}
      {bars.map((bar, i) => (
        <circle
          key={i}
          cx={bar.cx}
          cy={bar.cy}
          r={bar.r}
          fill={isPdf ? colors.rebar : 'none'}
          stroke={colors.rebar}
          strokeWidth={isPdf ? 1 : 1.5}
        />
      ))}

      {/* === Dimension annotations === */}

      {/* b annotation (top) */}
      <DimLine
        x1={ox} y1={oy - 14} x2={ox + sW} y2={oy - 14}
        label={`b = ${inp.b}`} unit="mm"
        color={colors.dimText} isPdf={isPdf}
        horizontal
      />

      {/* h annotation (right) */}
      <DimLine
        x1={ox + sW + 14} y1={oy} x2={ox + sW + 14} y2={oy + sH}
        label={`h = ${inp.h}`} unit="mm"
        color={colors.dimText} isPdf={isPdf}
        horizontal={false}
      />

      {/* x annotation (left of section, if valid) */}
      {result.valid && xNA > 8 && (
        <g>
          <line x1={ox - 4} y1={oy} x2={ox - 4} y2={oy + xNA} stroke={colors.dim} strokeWidth={0.75} />
          <text
            x={ox - 8}
            y={oy + xNA / 2}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={isPdf ? 9 : 9}
            fill={colors.dim}
            style={isPdf ? parseStyle(font) : undefined}
            className={isPdf ? undefined : 'text-[9px] font-mono fill-text-secondary'}
          >
            x={result.x.toFixed(0)}mm
          </text>
        </g>
      )}

      {/* Neutral axis label */}
      {result.valid && (
        <text
          x={ox + sW + 10}
          y={oy + xNA}
          dominantBaseline="middle"
          fontSize={isPdf ? 8 : 8}
          fill={colors.axis}
          style={isPdf ? { ...parseStyle(font), fill: colors.axis } : undefined}
          className={isPdf ? undefined : 'text-[8px] font-mono fill-accent'}
        >
          FN
        </text>
      )}
    </svg>
  );
}

// Inline dimension line with arrows and label
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
      {/* Tick marks */}
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
            x={x1 + 4}
            y={my}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={fontSize}
            fill={color}
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

function parseStyle(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  s.split(';').forEach((part) => {
    const [k, v] = part.split(':');
    if (k && v) out[k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v.trim();
  });
  return out;
}
