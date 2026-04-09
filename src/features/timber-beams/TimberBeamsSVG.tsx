// Timber Beams SVG — two panels:
//   Left:  cross-section (rectangle b×h, with fire residual section overlay)
//   Right: beam elevation + loads + deflected shape
//
// mode='screen': dark theme  |  mode='pdf': white background

import { type TimberBeamInputs } from '../../data/defaults';
import { type TimberBeamResult } from '../../lib/calculations/timberBeams';

interface TimberBeamsSVGProps {
  inp: TimberBeamInputs;
  result: TimberBeamResult;
  mode: 'screen' | 'pdf';
  width: number;
  height: number;
}

const SCREEN = {
  bg: 'transparent',
  sectionFill: '#1e293b',
  sectionStroke: '#475569',
  charFill: '#dc2626',
  charStroke: '#ef4444',
  residualFill: '#c8966c',
  residualStroke: '#d4a06e',
  dim: '#64748b',
  dimText: '#94a3b8',
  loadArrow: '#f59e0b',
  beam: '#c8966c',
  beamStroke: '#d4a06e',
  deflected: '#38bdf8',
  support: '#94a3b8',
  hatch: '#475569',
  label: '#64748b',
};

const PDF = {
  bg: '#ffffff',
  sectionFill: '#f5efe6',
  sectionStroke: '#333333',
  charFill: '#cc3333',
  charStroke: '#aa0000',
  residualFill: '#e8d5b0',
  residualStroke: '#8B6914',
  dim: '#666666',
  dimText: '#444444',
  loadArrow: '#cc7700',
  beam: '#d4a96a',
  beamStroke: '#8B6914',
  deflected: '#1d4ed8',
  support: '#333333',
  hatch: '#666666',
  label: '#666666',
};

// ─── Cross-section panel ──────────────────────────────────────────────────────
function CrossSection({
  inp, result, C, isPdf, panelW, panelH,
}: {
  inp: TimberBeamInputs;
  result: TimberBeamResult;
  C: typeof SCREEN; isPdf: boolean;
  panelW: number; panelH: number;
}) {
  const margin = 28;
  const availW = panelW - 2 * margin;
  const availH = panelH - 2 * margin;
  const scale  = Math.min(availW / inp.b, availH / inp.h) * 0.85;

  const sW = inp.b * scale;
  const sH = inp.h * scale;
  const ox = (panelW - sW) / 2;
  const oy = (panelH - sH) / 2;

  const fireActive = result.valid && result.fireActive;
  const def_px = fireActive ? result.def * scale : 0;
  const exposedBot = fireActive;
  const exposedSides = fireActive;
  const exposedTop = fireActive && inp.exposedFaces === 4;

  const b_ef_px = fireActive ? result.b_ef * scale : sW;
  const h_ef_px = fireActive ? result.h_ef * scale : sH;

  // Residual section: centred horizontally (equal left+right def), bottom-aligned (char from bottom)
  const rOx = ox + (sW - b_ef_px) / 2;
  const rOy = oy + (exposedTop ? (sH - h_ef_px) / 2 : 0);

  return (
    <g>
      {/* Full section background */}
      <rect x={ox} y={oy} width={sW} height={sH}
        fill={fireActive ? C.charFill : C.sectionFill}
        stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1}
        opacity={fireActive ? 0.25 : 1}
      />

      {/* Residual section (timber remaining after charring) */}
      {fireActive && b_ef_px > 0 && h_ef_px > 0 && (
        <rect x={rOx} y={rOy} width={b_ef_px} height={h_ef_px}
          fill={C.residualFill} stroke={C.residualStroke} strokeWidth={isPdf ? 1.5 : 1}
        />
      )}

      {/* Grain lines on residual section */}
      {Array.from({ length: 5 }, (_, i) => {
        const gy = rOy + (h_ef_px * (i + 1)) / 6;
        return (
          <line key={i}
            x1={rOx + 3} y1={gy} x2={rOx + b_ef_px - 3} y2={gy}
            stroke={fireActive ? C.residualStroke : C.sectionStroke}
            strokeWidth={0.4} opacity={0.35}
          />
        );
      })}

      {/* Fire char labels */}
      {fireActive && (
        <>
          {exposedSides && def_px > 2 && (
            <text x={ox + def_px / 2} y={oy + sH / 2}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={7} fill={C.charFill} fontFamily="monospace"
              transform={`rotate(-90, ${ox + def_px / 2}, ${oy + sH / 2})`}
            >
              {result.def.toFixed(0)}mm
            </text>
          )}
          {exposedBot && def_px > 2 && (
            <text x={ox + sW / 2} y={oy + sH - def_px / 2}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={7} fill={C.charFill} fontFamily="monospace"
            >
              {result.def.toFixed(0)}mm
            </text>
          )}
        </>
      )}

      {/* Dimension b — top */}
      <line x1={ox} y1={oy - 9} x2={ox + sW} y2={oy - 9} stroke={C.dim} strokeWidth={0.7} />
      <line x1={ox} y1={oy - 12} x2={ox} y2={oy - 6} stroke={C.dim} strokeWidth={0.7} />
      <line x1={ox + sW} y1={oy - 12} x2={ox + sW} y2={oy - 6} stroke={C.dim} strokeWidth={0.7} />
      <text x={ox + sW / 2} y={oy - 13} textAnchor="middle" fontSize={8} fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace' } : undefined}
        className={isPdf ? undefined : 'font-mono text-[8px]'}>
        b={inp.b}
      </text>

      {/* Dimension h — left */}
      <line x1={ox - 9} y1={oy} x2={ox - 9} y2={oy + sH} stroke={C.dim} strokeWidth={0.7} />
      <line x1={ox - 12} y1={oy} x2={ox - 6} y2={oy} stroke={C.dim} strokeWidth={0.7} />
      <line x1={ox - 12} y1={oy + sH} x2={ox - 6} y2={oy + sH} stroke={C.dim} strokeWidth={0.7} />
      <text x={ox - 16} y={oy + sH / 2} textAnchor="middle" dominantBaseline="middle"
        fontSize={8} fill={C.dimText}
        transform={`rotate(-90, ${ox - 16}, ${oy + sH / 2})`}
        style={isPdf ? { fontFamily: 'monospace' } : undefined}
        className={isPdf ? undefined : 'font-mono text-[8px]'}>
        h={inp.h}
      </text>

      {/* Grade label */}
      <text x={panelW / 2} y={oy + sH + 16} textAnchor="middle" fontSize={9} fontWeight={600}
        fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace' } : undefined}
        className={isPdf ? undefined : 'font-mono font-semibold text-[9px]'}>
        {inp.gradeId}
      </text>

      {/* Fire label */}
      {fireActive && (
        <text x={panelW / 2} y={oy + sH + 27} textAnchor="middle" fontSize={7}
          fill={C.charFill}
          style={isPdf ? { fontFamily: 'monospace' } : undefined}
          className={isPdf ? undefined : 'font-mono text-[7px]'}>
          {inp.fireResistance} — def={result.def.toFixed(0)}mm
        </text>
      )}
    </g>
  );
}

// ─── Elevation panel ──────────────────────────────────────────────────────────

function WallHatch({ x, y, w, h, C }: { x: number; y: number; w: number; h: number; C: typeof SCREEN }) {
  const lines: React.ReactNode[] = [];
  const step = 4;
  for (let i = -h; i < w + h; i += step) {
    const x1 = Math.max(x, x + i);
    const y1 = x + i < x ? y + (x - (x + i)) : y;
    const x2 = Math.min(x + w, x + i + h);
    const y2 = x + i + h > x + w ? y + h - ((x + i + h) - (x + w)) : y + h;
    if (x1 < x2) {
      lines.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.hatch} strokeWidth={0.5} />);
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={C.sectionFill} stroke={C.support} strokeWidth={1} />
      {lines}
    </g>
  );
}

function Elevation({
  inp, result, C, isPdf, panelX, panelW, panelH,
}: {
  inp: TimberBeamInputs;
  result: TimberBeamResult;
  C: typeof SCREEN; isPdf: boolean;
  panelX: number; panelW: number; panelH: number;
}) {
  const padLeft  = 12;
  const padRight = 12;

  const beamDepth = Math.max(panelH * 0.10, 8);  // visual beam height in px

  const availW = panelW - padLeft - padRight;

  const x0 = panelX + padLeft;
  const x1 = x0 + availW;
  const midY = panelH / 2;

  // Beam rectangle
  const beamTop = midY - beamDepth / 2;
  const beamBot = midY + beamDepth / 2;

  // Support symbols
  const hatchW = 18;
  const hatchH = 8;
  const pinSize = 6;
  const bc = inp.beamType;

  function LeftSupport() {
    if (bc === 'cantilever' || bc === 'fp' || bc === 'ff') {
      return <WallHatch x={x0 - hatchW} y={midY - hatchH / 2} w={hatchW} h={hatchH} C={C} />;
    }
    // pin (ss)
    return (
      <polygon
        points={`${x0},${beamBot} ${x0 - pinSize},${beamBot + pinSize * 1.5} ${x0 + pinSize},${beamBot + pinSize * 1.5}`}
        fill="none" stroke={C.support} strokeWidth={1.25}
      />
    );
  }

  function RightSupport() {
    if (bc === 'ff') {
      return <WallHatch x={x1} y={midY - hatchH / 2} w={hatchW} h={hatchH} C={C} />;
    }
    if (bc === 'cantilever') {
      return <circle cx={x1} cy={midY} r={pinSize * 0.7} fill="none" stroke={C.support} strokeWidth={1.25} />;
    }
    if (bc === 'fp') {
      // pinned right
      return (
        <polygon
          points={`${x1},${beamBot} ${x1 - pinSize},${beamBot + pinSize * 1.5} ${x1 + pinSize},${beamBot + pinSize * 1.5}`}
          fill="none" stroke={C.support} strokeWidth={1.25}
        />
      );
    }
    // ss — pin right
    return (
      <polygon
        points={`${x1},${beamBot} ${x1 - pinSize},${beamBot + pinSize * 1.5} ${x1 + pinSize},${beamBot + pinSize * 1.5}`}
        fill="none" stroke={C.support} strokeWidth={1.25}
      />
    );
  }

  // Load arrows (UDL): 6 arrows downward
  const nArrows = 7;
  const arrowTop = beamTop - 18;

  // Deflected shape
  const N = 30;
  const amp = panelH * 0.10;
  const deflPts: [number, number][] = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N;
    const x = x0 + t * availW;
    let dy = 0;
    if (bc === 'ss') {
      dy = amp * Math.sin(Math.PI * t);
    } else if (bc === 'cantilever') {
      dy = amp * (1 - Math.cos(Math.PI * (1 - t) / 2));
    } else if (bc === 'fp') {
      dy = amp * 6.75 * t * Math.pow(1 - t, 2);
    } else {
      dy = amp * Math.pow(Math.sin(Math.PI * t), 2);
    }
    return [x, midY + dy];
  });
  const deflPath = deflPts
    .map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(' ');

  // Load label — ULS design value, consistent with MEd/VEd shown below (γG=1.35, γQ=1.50)
  const wEd = 1.35 * inp.gk + 1.50 * inp.qk;
  const loadLabel = wEd > 0 ? `Ed=${wEd.toFixed(1)} kN/m` : '';

  const textStyle = isPdf ? { fontFamily: 'monospace', fontSize: '8px' } : undefined;
  const cls = isPdf ? undefined : 'font-mono text-[8px]';

  return (
    <g>
      {/* Beam body */}
      <rect x={x0} y={beamTop} width={availW} height={beamDepth}
        fill={C.beam} stroke={C.beamStroke} strokeWidth={isPdf ? 1 : 0.8}
      />

      {/* Load arrows + bar */}
      <line x1={x0} y1={arrowTop} x2={x1} y2={arrowTop} stroke={C.loadArrow} strokeWidth={1} />
      {Array.from({ length: nArrows }, (_, i) => {
        const ax = x0 + (i / (nArrows - 1)) * availW;
        return (
          <g key={i}>
            <line x1={ax} y1={arrowTop} x2={ax} y2={beamTop - 2}
              stroke={C.loadArrow} strokeWidth={1.25} />
            <polygon
              points={`${ax},${beamTop - 2} ${ax - 2.5},${beamTop - 7} ${ax + 2.5},${beamTop - 7}`}
              fill={C.loadArrow}
            />
          </g>
        );
      })}

      {/* Load label */}
      {loadLabel && (
        <text x={(x0 + x1) / 2} y={arrowTop - 5} textAnchor="middle"
          fontSize={8} fill={C.loadArrow} style={textStyle} className={cls}>
          {loadLabel}
        </text>
      )}

      {/* Deflected shape */}
      <path d={deflPath} fill="none" stroke={C.deflected} strokeWidth={1.25}
        strokeDasharray="4,3" />

      {/* Supports */}
      <LeftSupport />
      <RightSupport />

      {/* L dimension label */}
      <line x1={x0} y1={beamBot + 16} x2={x1} y2={beamBot + 16} stroke={C.dim} strokeWidth={0.7} />
      <line x1={x0} y1={beamBot + 13} x2={x0} y2={beamBot + 19} stroke={C.dim} strokeWidth={0.7} />
      <line x1={x1} y1={beamBot + 13} x2={x1} y2={beamBot + 19} stroke={C.dim} strokeWidth={0.7} />
      <text x={(x0 + x1) / 2} y={beamBot + 26} textAnchor="middle"
        fontSize={8} fill={C.dimText} style={textStyle} className={cls}>
        L={inp.L}m
      </text>

      {/* ELU/ELS summary */}
      {result.valid && (
        <>
          <text x={(x0 + x1) / 2} y={panelH - 10} textAnchor="middle"
            fontSize={7} fill={C.label} style={textStyle} className={cls}>
            MEd={result.MEd.toFixed(1)}kNm  VEd={result.VEd.toFixed(1)}kN
          </text>
        </>
      )}
    </g>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function TimberBeamsSVG({ inp, result, mode, width, height }: TimberBeamsSVGProps) {
  const isPdf = mode === 'pdf';
  const C = isPdf ? PDF : SCREEN;

  const leftW  = Math.floor(width * 0.35);
  const rightW = width - leftW;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Sección transversal y alzado de viga de madera"
      style={{ background: C.bg }}
    >
      {/* Divider */}
      <line x1={leftW} y1={6} x2={leftW} y2={height - 6}
        stroke={isPdf ? '#e0e0e0' : '#253147'} strokeWidth={0.8} />

      {/* Panel labels */}
      <text x={leftW / 2} y={10} textAnchor="middle" fontSize={8} fill={C.label}
        style={isPdf ? { fontFamily: 'monospace' } : undefined}
        className={isPdf ? undefined : 'font-mono text-[8px] fill-text-disabled'}>
        SECCIÓN
      </text>
      <text x={leftW + rightW / 2} y={10} textAnchor="middle" fontSize={8} fill={C.label}
        style={isPdf ? { fontFamily: 'monospace' } : undefined}
        className={isPdf ? undefined : 'font-mono text-[8px] fill-text-disabled'}>
        ALZADO
      </text>

      {/* Left: cross-section */}
      <CrossSection inp={inp} result={result} C={C} isPdf={isPdf} panelW={leftW} panelH={height} />

      {/* Right: elevation */}
      <Elevation inp={inp} result={result} C={C} isPdf={isPdf} panelX={leftW} panelW={rightW} panelH={height} />
    </svg>
  );
}
