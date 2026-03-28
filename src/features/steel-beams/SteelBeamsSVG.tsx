// Steel Beam SVG — two panels: I-section cross-section + M-V interaction envelope.
//
// mode='screen': dark theme colors via CSS vars
// mode='pdf':    inline styles, grayscale

import { type SteelBeamInputs } from '../../data/defaults';
import { type SteelBeamResult } from '../../lib/calculations/steelBeams';

interface SteelBeamsSVGProps {
  inp?: SteelBeamInputs;
  result: SteelBeamResult;
  mode: 'screen' | 'pdf';
  width: number;
  height: number;
}

const SCREEN = {
  bg: 'transparent',
  sectionFill: '#263348',
  sectionStroke: '#334155',
  dim: '#94a3b8',
  dimText: '#94a3b8',
  axis: '#334155',
  axisLabel: '#64748b',
  envelope: '#38bdf8',
  pointOk: '#22c55e',
  pointWarn: '#f59e0b',
  pointFail: '#ef4444',
  pointNeutral: '#64748b',
  gridLine: '#1e293b',
};

const PDF = {
  bg: '#ffffff',
  sectionFill: '#f0f0f0',
  sectionStroke: '#000000',
  dim: '#666666',
  dimText: '#444444',
  axis: '#333333',
  axisLabel: '#555555',
  envelope: '#444444',
  pointOk: '#333333',
  pointWarn: '#666666',
  pointFail: '#000000',
  pointNeutral: '#888888',
  gridLine: '#dddddd',
};

function statusColor(eta: number, colors: typeof SCREEN): string {
  if (eta < 0.8) return colors.pointOk;
  if (eta < 1.0) return colors.pointWarn;
  return colors.pointFail;
}

export function SteelBeamsSVG({ result, mode, width, height }: SteelBeamsSVGProps) {
  const isPdf = mode === 'pdf';
  const C = isPdf ? PDF : SCREEN;

  const profile = result.profile;

  // ── Layout ────────────────────────────────────────────────────────────────
  const leftW = Math.floor(width * 0.42);
  const rightW = width - leftW;

  // ── Left panel: I-section cross-section ───────────────────────────────────
  const padL = { top: 28, bottom: 28, left: 30, right: 16 };
  const drawLW = leftW - padL.left - padL.right;
  const drawLH = height - padL.top - padL.bottom;

  let sectionG: React.ReactNode = null;

  if (profile) {
    const ph = profile.h;   // mm
    const pb = profile.b;   // mm

    const scaleX = drawLW / pb;
    const scaleY = drawLH / ph;
    const scale = Math.min(scaleX, scaleY);

    const sW = pb * scale;
    const sH = ph * scale;

    const ox = padL.left + (drawLW - sW) / 2;
    const oy = padL.top + (drawLH - sH) / 2;

    const tf = profile.tf * scale;
    const tw = profile.tw * scale;
    const halfTw = tw / 2;
    const halfSW = sW / 2;
    const cx = ox + halfSW;

    // I-shape path (simplified, no fillet)
    const topFlangeY = oy;
    const botFlangeY = oy + sH - tf;
    const webTop = oy + tf;
    const webBot = oy + sH - tf;

    sectionG = (
      <g>
        {/* Top flange */}
        <rect
          x={ox} y={topFlangeY}
          width={sW} height={tf}
          fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1}
        />
        {/* Bottom flange */}
        <rect
          x={ox} y={botFlangeY}
          width={sW} height={tf}
          fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1}
        />
        {/* Web */}
        <rect
          x={cx - halfTw} y={webTop}
          width={tw} height={webBot - webTop}
          fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1}
        />

        {/* Dimension: h (right side) */}
        <line
          x1={ox + sW + 10} y1={oy}
          x2={ox + sW + 10} y2={oy + sH}
          stroke={C.dim} strokeWidth={0.75}
        />
        <line x1={ox + sW + 7} y1={oy} x2={ox + sW + 13} y2={oy} stroke={C.dim} strokeWidth={0.75} />
        <line x1={ox + sW + 7} y1={oy + sH} x2={ox + sW + 13} y2={oy + sH} stroke={C.dim} strokeWidth={0.75} />
        <text
          x={ox + sW + 14}
          y={oy + sH / 2}
          dominantBaseline="middle"
          fontSize={8}
          fill={C.dimText}
          style={isPdf ? { fontFamily: 'monospace', fontSize: '8px' } : undefined}
          className={isPdf ? undefined : 'text-[8px] font-mono fill-text-secondary'}
        >
          h={profile.h}
        </text>

        {/* Dimension: b (top) */}
        <line x1={ox} y1={oy - 10} x2={ox + sW} y2={oy - 10} stroke={C.dim} strokeWidth={0.75} />
        <line x1={ox} y1={oy - 13} x2={ox} y2={oy - 7} stroke={C.dim} strokeWidth={0.75} />
        <line x1={ox + sW} y1={oy - 13} x2={ox + sW} y2={oy - 7} stroke={C.dim} strokeWidth={0.75} />
        <text
          x={ox + sW / 2}
          y={oy - 14}
          textAnchor="middle"
          fontSize={8}
          fill={C.dimText}
          style={isPdf ? { fontFamily: 'monospace', fontSize: '8px' } : undefined}
          className={isPdf ? undefined : 'text-[8px] font-mono fill-text-secondary'}
        >
          b={profile.b}
        </text>

        {/* tf label */}
        <text
          x={ox - 4}
          y={topFlangeY + tf / 2}
          textAnchor="end"
          dominantBaseline="middle"
          fontSize={7}
          fill={C.dimText}
          style={isPdf ? { fontFamily: 'monospace', fontSize: '7px' } : undefined}
          className={isPdf ? undefined : 'text-[7px] font-mono fill-text-disabled'}
        >
          tf={profile.tf}
        </text>

        {/* tw label */}
        <text
          x={cx}
          y={oy + sH / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={7}
          fill={C.dimText}
          style={isPdf ? { fontFamily: 'monospace', fontSize: '7px' } : undefined}
          className={isPdf ? undefined : 'text-[7px] font-mono fill-text-disabled'}
        >
          tw={profile.tw}
        </text>

        {/* Profile label */}
        <text
          x={ox + sW / 2}
          y={oy + sH + 14}
          textAnchor="middle"
          fontSize={9}
          fontWeight="600"
          fill={C.dimText}
          style={isPdf ? { fontFamily: 'monospace', fontSize: '9px', fontWeight: '600' } : undefined}
          className={isPdf ? undefined : 'text-[9px] font-semibold font-mono fill-text-secondary'}
        >
          {profile.label}
        </text>
      </g>
    );
  }

  // ── Right panel: M-V interaction diagram ──────────────────────────────────
  const padR = { top: 24, bottom: 32, left: 36, right: 16 };
  const plotW = rightW - padR.left - padR.right;
  const plotH = height - padR.top - padR.bottom;

  const rx = leftW + padR.left;  // plot origin x
  const ry = padR.top;            // plot origin y (top)

  // Scale: plot goes from (0,0) to (1,1) in VEd/Vc,Rd × MEd/Mc,Rd space
  const toPlotX = (v: number) => rx + v * plotW;
  const toPlotY = (m: number) => ry + plotH - m * plotH;  // flip y

  // D-shaped M-V interaction envelope
  const N = 30;
  const envelopePoints = Array.from({ length: N + 1 }, (_, i) => {
    const v = i / N;
    const m = Math.max(0, 1 - Math.max(0, 2 * v - 1) ** 2);
    return `${toPlotX(v).toFixed(1)},${toPlotY(m).toFixed(1)}`;
  });
  const envelopePath = `M ${envelopePoints[0]} L ${envelopePoints.slice(1).join(' L ')} L ${toPlotX(1).toFixed(1)},${toPlotY(0).toFixed(1)} L ${toPlotX(0).toFixed(1)},${toPlotY(0).toFixed(1)} Z`;

  // Grid lines at 0.5
  const gridV = toPlotX(0.5);
  const gridM = toPlotY(0.5);

  // Design point
  const ptX = result.valid ? toPlotX(Math.min(result.eta_V, 1.5)) : null;
  const ptY = result.valid ? toPlotY(Math.min(result.eta_M, 1.5)) : null;
  const ptColor = result.valid ? statusColor(result.eta_MV, C) : C.pointNeutral;

  const fontSize = 7;
  const labelStyle = isPdf
    ? { fontFamily: 'monospace', fontSize: `${fontSize}px` }
    : undefined;
  const labelClass = isPdf ? undefined : `text-[${fontSize}px] font-mono fill-text-disabled`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={isPdf ? { background: C.bg } : undefined}
    >
      {/* ── Left panel: I-section ── */}
      {sectionG}

      {/* ── Divider ── */}
      <line
        x1={leftW} y1={8}
        x2={leftW} y2={height - 8}
        stroke={isPdf ? '#cccccc' : '#1e293b'}
        strokeWidth={1}
      />

      {/* ── Right panel: M-V diagram ── */}

      {/* Envelope fill */}
      <path
        d={envelopePath}
        fill={C.envelope}
        opacity={isPdf ? 0.08 : 0.06}
      />
      {/* Envelope stroke */}
      <path
        d={`M ${envelopePoints[0]} L ${envelopePoints.slice(1).join(' L ')}`}
        fill="none"
        stroke={C.envelope}
        strokeWidth={1.25}
        opacity={0.7}
      />

      {/* Grid line at 0.5 */}
      <line
        x1={gridV} y1={ry}
        x2={gridV} y2={ry + plotH}
        stroke={C.gridLine}
        strokeWidth={0.5}
        strokeDasharray="3 3"
      />
      <line
        x1={rx} y1={gridM}
        x2={rx + plotW} y2={gridM}
        stroke={C.gridLine}
        strokeWidth={0.5}
        strokeDasharray="3 3"
      />

      {/* Axes */}
      <line
        x1={rx} y1={ry}
        x2={rx} y2={ry + plotH}
        stroke={C.axis}
        strokeWidth={1}
      />
      <line
        x1={rx} y1={ry + plotH}
        x2={rx + plotW} y2={ry + plotH}
        stroke={C.axis}
        strokeWidth={1}
      />

      {/* X-axis ticks and labels */}
      {[0, 0.5, 1.0].map((v) => (
        <g key={`xt-${v}`}>
          <line
            x1={toPlotX(v)} y1={ry + plotH}
            x2={toPlotX(v)} y2={ry + plotH + 4}
            stroke={C.axis} strokeWidth={0.75}
          />
          <text
            x={toPlotX(v)}
            y={ry + plotH + 11}
            textAnchor="middle"
            fontSize={fontSize}
            fill={C.axisLabel}
            style={labelStyle}
            className={labelClass}
          >
            {v}
          </text>
        </g>
      ))}

      {/* Y-axis ticks and labels */}
      {[0, 0.5, 1.0].map((m) => (
        <g key={`yt-${m}`}>
          <line
            x1={rx - 4} y1={toPlotY(m)}
            x2={rx} y2={toPlotY(m)}
            stroke={C.axis} strokeWidth={0.75}
          />
          <text
            x={rx - 6}
            y={toPlotY(m)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={fontSize}
            fill={C.axisLabel}
            style={labelStyle}
            className={labelClass}
          >
            {m}
          </text>
        </g>
      ))}

      {/* Axis labels */}
      <text
        x={rx + plotW / 2}
        y={ry + plotH + 24}
        textAnchor="middle"
        fontSize={7}
        fill={C.axisLabel}
        style={labelStyle}
        className={labelClass}
      >
        VEd / Vc,Rd
      </text>

      <text
        x={rx - 28}
        y={ry + plotH / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={7}
        fill={C.axisLabel}
        transform={`rotate(-90, ${rx - 28}, ${ry + plotH / 2})`}
        style={labelStyle}
        className={labelClass}
      >
        MEd / Mc,Rd
      </text>

      {/* Design point */}
      {ptX !== null && ptY !== null && (
        <g>
          {/* Crosshair lines */}
          <line
            x1={rx} y1={ptY!}
            x2={ptX!} y2={ptY!}
            stroke={ptColor} strokeWidth={0.5} opacity={0.5} strokeDasharray="2 2"
          />
          <line
            x1={ptX!} y1={ry + plotH}
            x2={ptX!} y2={ptY!}
            stroke={ptColor} strokeWidth={0.5} opacity={0.5} strokeDasharray="2 2"
          />
          {/* Point */}
          <circle
            cx={ptX!}
            cy={ptY!}
            r={4}
            fill={ptColor}
            opacity={0.9}
          />
          <circle
            cx={ptX!}
            cy={ptY!}
            r={4}
            fill="none"
            stroke={ptColor}
            strokeWidth={1.5}
            opacity={1}
          />
        </g>
      )}

      {/* Panel title */}
      <text
        x={rx + plotW / 2}
        y={ry - 10}
        textAnchor="middle"
        fontSize={8}
        fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '8px' } : undefined}
        className={isPdf ? undefined : 'text-[8px] font-mono fill-text-secondary'}
      >
        Interacción M-V
      </text>
    </svg>
  );
}
