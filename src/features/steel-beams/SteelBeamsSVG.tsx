// Steel Beam SVG — sección transversal del perfil en I con cotas.
//
// mode='screen': dark theme colors via CSS vars
// mode='pdf':    inline styles, grayscale

import { type SteelBeamResult } from '../../lib/calculations/steelBeams';
import { sectionOutline, outlinePathD } from '../../lib/sections';
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

    const webTop = oy + tf;

    // Contorno con los ACUERDOS alma-ala (lib/sections/outline). Antes eran
    // tres rectángulos pegados, que es la silueta de un perfil soldado.
    const outline = sectionOutline({ kind: 'I', ...profile });
    const cy = oy + sH / 2;
    const d = outline
      ? outlinePathD(outline, (mm) => cx + mm * scale, (mm) => cy + mm * scale, (mm) => mm * scale)
      : '';

    sectionG = (
      <g>
        <title>{`Perfil ${profile.label}`}</title>
        <path
          d={d}
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
  } else if (result.section) {
    // Tubos / 2UPN — sin registro de catálogo I. El tubo rectangular se dibuja
    // por su CONTORNO (esquinas redondeadas con el radio real del producto,
    // igual que en pilares); el cajón de 2UPN y la corona del CHS siguen con
    // las primitivas genéricas del adapter, que ya los resuelven bien.
    const s = result.section;
    const prims = s.getPrimitives();
    const outline = sectionOutline(s);
    const bw = Math.max(1e-6, prims.bbox.maxX - prims.bbox.minX);
    const bh = Math.max(1e-6, prims.bbox.maxY - prims.bbox.minY);
    const scale = Math.min(drawW / bw, drawH / bh) * 0.9;
    const cx0 = pad.left + drawW / 2;
    const cy0 = pad.top + drawH / 2;
    const X = (x: number) => cx0 + x * scale;
    const Y = (y: number) => cy0 + y * scale;
    const left = X(prims.bbox.minX);
    const right = X(prims.bbox.maxX);
    const top = Y(prims.bbox.minY);
    const bottom = Y(prims.bbox.maxY);
    const strokeW = isPdf ? 1.5 : 1;

    sectionG = (
      <g>
        <title>{`Perfil ${s.label}`}</title>
        {outline ? (
          <path
            d={outlinePathD(outline, X, Y, (mm) => mm * scale)}
            fillRule={outline.fillRule}
            fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={strokeW}
          />
        ) : prims.shapes.map((sh, i) => {
          switch (sh.type) {
            case 'rect':
              return (
                <rect key={i} x={X(sh.x)} y={Y(sh.y)} width={sh.w * scale} height={sh.h * scale}
                  fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={strokeW} />
              );
            case 'circle':
              return (
                <circle key={i} cx={X(sh.cx)} cy={Y(sh.cy)} r={sh.r * scale}
                  fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={strokeW} />
              );
            case 'ring': {
              const ro = sh.rOuter * scale;
              const ri = sh.rInner * scale;
              const cxx = X(sh.cx);
              const cyy = Y(sh.cy);
              return (
                <path
                  key={i}
                  d={`M ${cxx - ro},${cyy} a ${ro},${ro} 0 1 0 ${2 * ro},0 a ${ro},${ro} 0 1 0 ${-2 * ro},0 Z ` +
                    `M ${cxx - ri},${cyy} a ${ri},${ri} 0 1 0 ${2 * ri},0 a ${ri},${ri} 0 1 0 ${-2 * ri},0 Z`}
                  fillRule="evenodd"
                  fill={C.sectionFill}
                  stroke={C.sectionStroke}
                  strokeWidth={strokeW}
                />
              );
            }
            case 'line':
              return (
                <line key={i} x1={X(sh.x1)} y1={Y(sh.y1)} x2={X(sh.x2)} y2={Y(sh.y2)}
                  stroke={C.sectionStroke} strokeWidth={0.75}
                  strokeDasharray={sh.dashed ? '3 2' : undefined} />
              );
          }
        })}


        {/* Dimension: h (left side) */}
        <line x1={left - 8} y1={top} x2={left - 8} y2={bottom} stroke={C.dim} strokeWidth={0.75} />
        <line x1={left - 11} y1={top} x2={left - 5} y2={top} stroke={C.dim} strokeWidth={0.75} />
        <line x1={left - 11} y1={bottom} x2={left - 5} y2={bottom} stroke={C.dim} strokeWidth={0.75} />
        <text
          x={left - 16} y={(top + bottom) / 2}
          dominantBaseline="middle" textAnchor="middle" fontSize={11} fill={C.dimText}
          transform={`rotate(-90, ${left - 16}, ${(top + bottom) / 2})`}
          style={isPdf ? { fontFamily: FF_MONO, fontSize: '11px' } : undefined}
          className={isPdf ? undefined : 'text-[11px] font-mono fill-text-secondary'}
        >
          h={s.h}
        </text>

        {/* Dimension: b (top) */}
        <line x1={left} y1={top - 10} x2={right} y2={top - 10} stroke={C.dim} strokeWidth={0.75} />
        <line x1={left} y1={top - 13} x2={left} y2={top - 7} stroke={C.dim} strokeWidth={0.75} />
        <line x1={right} y1={top - 13} x2={right} y2={top - 7} stroke={C.dim} strokeWidth={0.75} />
        <text
          x={(left + right) / 2} y={top - 14}
          textAnchor="middle" fontSize={11} fill={C.dimText}
          style={isPdf ? { fontFamily: FF_MONO, fontSize: '11px' } : undefined}
          className={isPdf ? undefined : 'text-[11px] font-mono fill-text-secondary'}
        >
          b={s.b}
        </text>

        {/* Section label */}
        <text
          x={(left + right) / 2} y={bottom + 16}
          textAnchor="middle" fontSize={12} fontWeight="600" fill={C.dimText}
          style={isPdf ? { fontFamily: FF_MONO, fontSize: '12px', fontWeight: '600' } : undefined}
          className={isPdf ? undefined : 'text-[12px] font-semibold font-mono fill-text-secondary'}
        >
          {s.label}
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
