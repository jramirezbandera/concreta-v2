// Steel Beam SVG — sección transversal del perfil en I con cotas.
//
// mode='screen': dark theme colors via CSS vars
// mode='pdf':    inline styles, grayscale

import { type SteelBeamResult } from '../../lib/calculations/steelBeams';
import { FF_MONO } from './diagramStyle';

interface SteelBeamsSVGProps {
  result: SteelBeamResult;
  mode: 'screen' | 'pdf';
  width: number;
  height: number;
}

// Screen palette via theme tokens; PDF palette literal grayscale.
const SCREEN = {
  bg: 'transparent',
  sectionFill: 'var(--color-chart-section-fill)',
  sectionStroke: 'var(--color-chart-section)',
  dim: 'var(--color-chart-dim)',
  dimText: 'var(--color-chart-dim-text)',
};

const PDF = {
  bg: '#ffffff',
  sectionFill: '#f0f0f0',
  sectionStroke: '#000000',
  dim: '#666666',
  dimText: '#444444',
};

export function SteelBeamsSVG({ result, mode, width, height }: SteelBeamsSVGProps) {
  const isPdf = mode === 'pdf';
  const C = isPdf ? PDF : SCREEN;

  const profile = result.profile;

  const pad = { top: 30, bottom: 30, left: 36, right: 20 };
  const drawW = width - pad.left - pad.right;
  const drawH = height - pad.top - pad.bottom;

  let sectionG: React.ReactNode = null;

  if (profile) {
    const ph = profile.h;   // mm
    const pb = profile.b;   // mm

    const scale = Math.min(drawW / pb, drawH / ph);

    const sW = pb * scale;
    const sH = ph * scale;

    const ox = pad.left + (drawW - sW) / 2;
    const oy = pad.top + (drawH - sH) / 2;

    const tf = profile.tf * scale;
    const tw = profile.tw * scale;
    const halfTw = tw / 2;
    const cx = ox + sW / 2;

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

        {/* Dimension: h (left side, rotated label — keeps text inside panel) */}
        <line
          x1={ox - 8} y1={oy}
          x2={ox - 8} y2={oy + sH}
          stroke={C.dim} strokeWidth={0.75}
        />
        <line x1={ox - 11} y1={oy}      x2={ox - 5} y2={oy}      stroke={C.dim} strokeWidth={0.75} />
        <line x1={ox - 11} y1={oy + sH} x2={ox - 5} y2={oy + sH} stroke={C.dim} strokeWidth={0.75} />
        <text
          x={ox - 16}
          y={oy + sH / 2}
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize={11}
          fill={C.dimText}
          transform={`rotate(-90, ${ox - 16}, ${oy + sH / 2})`}
          style={isPdf ? { fontFamily: FF_MONO, fontSize: '11px' } : undefined}
          className={isPdf ? undefined : 'text-[11px] font-mono fill-text-secondary'}
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
          fontSize={11}
          fill={C.dimText}
          style={isPdf ? { fontFamily: FF_MONO, fontSize: '11px' } : undefined}
          className={isPdf ? undefined : 'text-[11px] font-mono fill-text-secondary'}
        >
          b={profile.b}
        </text>

        {/* tf/tw labels — en la zona VACÍA a la derecha del alma (antes iban
            centrados sobre el ala/alma y pisaban sus propios trazos): tf justo
            bajo el ala superior, tw a media altura junto al alma. */}
        <text
          x={cx + halfTw + 6}
          y={webTop + 9}
          textAnchor="start"
          dominantBaseline="middle"
          fontSize={11}
          fill={C.dimText}
          style={isPdf ? { fontFamily: FF_MONO, fontSize: '11px' } : undefined}
          className={isPdf ? undefined : 'text-[11px] font-mono fill-text-secondary'}
        >
          tf={profile.tf}
        </text>

        <text
          x={cx + halfTw + 6}
          y={oy + sH / 2}
          textAnchor="start"
          dominantBaseline="middle"
          fontSize={11}
          fill={C.dimText}
          style={isPdf ? { fontFamily: FF_MONO, fontSize: '11px' } : undefined}
          className={isPdf ? undefined : 'text-[11px] font-mono fill-text-secondary'}
        >
          tw={profile.tw}
        </text>

        {/* Profile label */}
        <text
          x={ox + sW / 2}
          y={oy + sH + 16}
          textAnchor="middle"
          fontSize={12}
          fontWeight="600"
          fill={C.dimText}
          style={isPdf ? { fontFamily: FF_MONO, fontSize: '12px', fontWeight: '600' } : undefined}
          className={isPdf ? undefined : 'text-[12px] font-semibold font-mono fill-text-secondary'}
        >
          {profile.label}
        </text>
      </g>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={isPdf ? { background: C.bg } : undefined}
    >
      {sectionG}
    </svg>
  );
}
