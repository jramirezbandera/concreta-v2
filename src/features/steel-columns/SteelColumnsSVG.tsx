// Steel Columns SVG — two panels:
//   Left:  cross-section (I-section or 2UPN box)
//   Right: column geometry diagram (BC symbols + buckled shape + Lk labels)
//
// mode='screen': dark theme colors
// mode='pdf':    inline styles, grayscale

import { type SteelColumnInputs, type ColumnBCType } from '../../data/defaults';
import { type SteelColumnResult } from '../../lib/calculations/steelColumns';
import { getProfile, buildUPNBox } from '../../data/steelProfiles';

interface SteelColumnsSVGProps {
  inp: SteelColumnInputs;
  result: SteelColumnResult | null;
  mode: 'screen' | 'pdf';
  width: number;
  height: number;
}

const SCREEN = {
  bg: 'transparent',
  sectionFill: '#263348',
  sectionStroke: '#334155',
  weldStroke: '#475569',
  dim: '#94a3b8',
  dimText: '#94a3b8',
  column: '#94a3b8',
  buckled: '#38bdf8',
  support: '#94a3b8',
  hatch: '#475569',
  lkLabel: '#38bdf8',
  label: '#64748b',
};

const PDF = {
  bg: '#ffffff',
  sectionFill: '#f0f0f0',
  sectionStroke: '#000000',
  weldStroke: '#888888',
  dim: '#666666',
  dimText: '#444444',
  column: '#333333',
  buckled: '#444444',
  support: '#333333',
  hatch: '#666666',
  lkLabel: '#000000',
  label: '#666666',
};

// ─── Cross-section panel ──────────────────────────────────────────────────────

function ISectionShape({
  ox, oy, sW, sH, tf, tw,
  profile, C, isPdf,
}: {
  ox: number; oy: number; sW: number; sH: number; tf: number; tw: number;
  profile: { h: number; b: number; tf: number; tw: number; label: string };
  C: typeof SCREEN; isPdf: boolean;
}) {
  const halfTw = tw / 2;
  const cx = ox + sW / 2;

  return (
    <g>
      {/* Top flange */}
      <rect x={ox} y={oy} width={sW} height={tf}
        fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1} />
      {/* Bottom flange */}
      <rect x={ox} y={oy + sH - tf} width={sW} height={tf}
        fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1} />
      {/* Web */}
      <rect x={cx - halfTw} y={oy + tf} width={tw} height={sH - 2 * tf}
        fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1} />

      {/* Dim h — left side */}
      <line x1={ox - 8} y1={oy} x2={ox - 8} y2={oy + sH} stroke={C.dim} strokeWidth={0.75} />
      <line x1={ox - 11} y1={oy} x2={ox - 5} y2={oy} stroke={C.dim} strokeWidth={0.75} />
      <line x1={ox - 11} y1={oy + sH} x2={ox - 5} y2={oy + sH} stroke={C.dim} strokeWidth={0.75} />
      <text x={ox - 16} y={oy + sH / 2} dominantBaseline="middle" textAnchor="middle"
        fontSize={8} fill={C.dimText} transform={`rotate(-90, ${ox - 16}, ${oy + sH / 2})`}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '8px' } : undefined}
        className={isPdf ? undefined : 'text-[8px] font-mono fill-text-secondary'}>
        h={profile.h}
      </text>

      {/* Dim b — top */}
      <line x1={ox} y1={oy - 10} x2={ox + sW} y2={oy - 10} stroke={C.dim} strokeWidth={0.75} />
      <line x1={ox} y1={oy - 13} x2={ox} y2={oy - 7} stroke={C.dim} strokeWidth={0.75} />
      <line x1={ox + sW} y1={oy - 13} x2={ox + sW} y2={oy - 7} stroke={C.dim} strokeWidth={0.75} />
      <text x={ox + sW / 2} y={oy - 14} textAnchor="middle" fontSize={8} fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '8px' } : undefined}
        className={isPdf ? undefined : 'text-[8px] font-mono fill-text-secondary'}>
        b={profile.b}
      </text>

      {/* tf label */}
      <text x={ox - 4} y={oy + tf / 2} textAnchor="end" dominantBaseline="middle"
        fontSize={7} fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '7px' } : undefined}
        className={isPdf ? undefined : 'text-[7px] font-mono fill-text-disabled'}>
        tf={profile.tf}
      </text>

      {/* tw label */}
      <text x={cx} y={oy + sH / 2} textAnchor="middle" dominantBaseline="middle"
        fontSize={7} fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '7px' } : undefined}
        className={isPdf ? undefined : 'text-[7px] font-mono fill-text-disabled'}>
        tw={profile.tw}
      </text>

      {/* Profile label */}
      <text x={ox + sW / 2} y={oy + sH + 14} textAnchor="middle" fontSize={9} fontWeight={600}
        fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '9px', fontWeight: '600' } : undefined}
        className={isPdf ? undefined : 'text-[9px] font-semibold font-mono fill-text-secondary'}>
        {profile.label}
      </text>
    </g>
  );
}

function UPNBoxShape({
  ox, oy, sW, sH, tf, tw,
  profile, C, isPdf,
}: {
  ox: number; oy: number; sW: number; sH: number; tf: number; tw: number;
  profile: { h: number; b: number; tf: number; tw: number; size: number };
  C: typeof SCREEN; isPdf: boolean;
}) {
  // Left UPN: web on left, flanges extend right
  // Right UPN: web on right, flanges extend left
  const cx = ox + sW / 2;

  return (
    <g>
      {/* Left UPN web */}
      <rect x={ox} y={oy} width={tw} height={sH}
        fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1} />
      {/* Left UPN top flange */}
      <rect x={ox} y={oy} width={sW / 2} height={tf}
        fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1} />
      {/* Left UPN bottom flange */}
      <rect x={ox} y={oy + sH - tf} width={sW / 2} height={tf}
        fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1} />

      {/* Right UPN web */}
      <rect x={ox + sW - tw} y={oy} width={tw} height={sH}
        fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1} />
      {/* Right UPN top flange */}
      <rect x={cx} y={oy} width={sW / 2} height={tf}
        fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1} />
      {/* Right UPN bottom flange */}
      <rect x={cx} y={oy + sH - tf} width={sW / 2} height={tf}
        fill={C.sectionFill} stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1} />

      {/* Weld lines at center junction */}
      <line x1={cx} y1={oy + 2} x2={cx} y2={oy + tf - 2}
        stroke={C.weldStroke} strokeWidth={1.5} strokeDasharray="2,1" />
      <line x1={cx} y1={oy + sH - tf + 2} x2={cx} y2={oy + sH - 2}
        stroke={C.weldStroke} strokeWidth={1.5} strokeDasharray="2,1" />

      {/* Dim h — left side */}
      <line x1={ox - 8} y1={oy} x2={ox - 8} y2={oy + sH} stroke={C.dim} strokeWidth={0.75} />
      <line x1={ox - 11} y1={oy} x2={ox - 5} y2={oy} stroke={C.dim} strokeWidth={0.75} />
      <line x1={ox - 11} y1={oy + sH} x2={ox - 5} y2={oy + sH} stroke={C.dim} strokeWidth={0.75} />
      <text x={ox - 16} y={oy + sH / 2} dominantBaseline="middle" textAnchor="middle"
        fontSize={8} fill={C.dimText} transform={`rotate(-90, ${ox - 16}, ${oy + sH / 2})`}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '8px' } : undefined}
        className={isPdf ? undefined : 'text-[8px] font-mono fill-text-secondary'}>
        h={profile.h}
      </text>

      {/* Dim b_total — top */}
      <line x1={ox} y1={oy - 10} x2={ox + sW} y2={oy - 10} stroke={C.dim} strokeWidth={0.75} />
      <line x1={ox} y1={oy - 13} x2={ox} y2={oy - 7} stroke={C.dim} strokeWidth={0.75} />
      <line x1={ox + sW} y1={oy - 13} x2={ox + sW} y2={oy - 7} stroke={C.dim} strokeWidth={0.75} />
      <text x={ox + sW / 2} y={oy - 14} textAnchor="middle" fontSize={8} fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '8px' } : undefined}
        className={isPdf ? undefined : 'text-[8px] font-mono fill-text-secondary'}>
        b={profile.b}
      </text>

      {/* Profile label */}
      <text x={ox + sW / 2} y={oy + sH + 14} textAnchor="middle" fontSize={9} fontWeight={600}
        fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '9px', fontWeight: '600' } : undefined}
        className={isPdf ? undefined : 'text-[9px] font-semibold font-mono fill-text-secondary'}>
        2UPN {profile.size}
      </text>
    </g>
  );
}

// ─── Column geometry panel ────────────────────────────────────────────────────

/** Wall hatch: filled rectangle with diagonal hatching lines */
function WallHatch({ x, y, w, h, C }: {
  x: number; y: number; w: number; h: number; C: typeof SCREEN;
}) {
  const lines: React.ReactNode[] = [];
  const step = 4;
  for (let i = -h; i < w + h; i += step) {
    const x1 = Math.max(x, x + i);
    const y1 = x + i < x ? y + (x - (x + i)) : y;
    const x2 = Math.min(x + w, x + i + h);
    const y2 = x + i + h > x + w ? y + h - ((x + i + h) - (x + w)) : y + h;
    if (x1 < x2) {
      lines.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={C.hatch} strokeWidth={0.5} />);
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={C.sectionFill} stroke={C.support} strokeWidth={1} />
      {lines}
    </g>
  );
}

/** Triangle pin at top of column — apex touches column (at cy), base opens upward away from column */
function PinTop({ cx, cy, size, C }: { cx: number; cy: number; size: number; C: typeof SCREEN }) {
  const pts = `${cx},${cy} ${cx - size},${cy - size * 1.5} ${cx + size},${cy - size * 1.5}`;
  return <polygon points={pts} fill="none" stroke={C.support} strokeWidth={1.25} />;
}

/** Triangle pin at bottom of column — apex touches column (at cy), base opens downward away from column */
function PinBot({ cx, cy, size, C }: { cx: number; cy: number; size: number; C: typeof SCREEN }) {
  const pts = `${cx},${cy} ${cx - size},${cy + size * 1.5} ${cx + size},${cy + size * 1.5}`;
  return <polygon points={pts} fill="none" stroke={C.support} strokeWidth={1.25} />;
}

/** Open circle (custom BC) */
function OpenCircle({ cx, cy, r, C }: { cx: number; cy: number; r: number; C: typeof SCREEN }) {
  return <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.support} strokeWidth={1.25} />;
}

function ColumnGeometry({
  bcType, Ly, Lz, beta_y, beta_z, C, isPdf,
  panelX, panelY, panelW, panelH,
}: {
  bcType: ColumnBCType;
  Ly: number;
  Lz: number;
  beta_y: number;
  beta_z: number;
  C: typeof SCREEN; isPdf: boolean;
  panelX: number; panelY: number; panelW: number; panelH: number;
}) {
  const padTop = 40;
  const padBot = 40;
  const colH = panelH - padTop - padBot;
  const colX = panelX + panelW / 2;
  const topY = panelY + padTop;
  const botY = topY + colH;

  // Buckled shape amplitude
  const amp = panelW * 0.12;

  // Generate buckled shape points based on bcType
  function bucklePath(bcT: ColumnBCType): string {
    const N = 30;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = topY + t * colH;
      let dx = 0;
      if (bcT === 'pp') {
        // Pin-Pin: half sine, zero at both ends, max at midspan
        dx = amp * Math.sin(Math.PI * t);
      } else if (bcT === 'pf') {
        // Pin at top (t=0), Fixed at bottom (t=1)
        // Both ends have zero lateral displacement; fixed end has zero slope.
        // Approximate with t*(1-t)^2 normalised to unit amplitude (max at t=1/3).
        dx = amp * 6.75 * t * Math.pow(1 - t, 2);
      } else if (bcT === 'fc') {
        // Fixed at base (t=1), Free at top (t=0) — cantilever
        // Zero displacement AND zero slope at fixed base; max displacement at free top.
        dx = amp * (1 - Math.cos(Math.PI * (1 - t) / 2));
      } else if (bcT === 'ff') {
        // Fixed-Fixed: zero displacement AND zero slope at both ends.
        // sin²(πt) = (1 - cos(2πt)) / 2 — symmetric arch, max at midspan.
        dx = amp * Math.pow(Math.sin(Math.PI * t), 2);
      } else {
        // custom: generic S-shape
        dx = amp * Math.sin(2 * Math.PI * t);
      }
      pts.push([colX + dx, y]);
    }
    return pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  }

  const hatchW = 20;
  const hatchH = 8;
  const pinSize = 6;

  // Top support symbol
  function TopSupport() {
    if (bcType === 'ff') {
      return <WallHatch x={colX - hatchW / 2} y={topY - hatchH} w={hatchW} h={hatchH} C={C} />;
    }
    if (bcType === 'pf') {
      // Articulado at top (pin)
      return <PinTop cx={colX} cy={topY} size={pinSize} C={C} />;
    }
    if (bcType === 'fc') {
      // free top — open circle
      return <OpenCircle cx={colX} cy={topY} r={pinSize * 0.7} C={C} />;
    }
    if (bcType === 'custom') {
      return <OpenCircle cx={colX} cy={topY} r={pinSize * 0.7} C={C} />;
    }
    // pp, fp — pin at top
    return <PinTop cx={colX} cy={topY} size={pinSize} C={C} />;
  }

  // Bottom support symbol
  function BotSupport() {
    if (bcType === 'pp') {
      return <PinBot cx={colX} cy={botY} size={pinSize} C={C} />;
    }
    if (bcType === 'pf') {
      // Empotrado at bottom (fixed)
      return <WallHatch x={colX - hatchW / 2} y={botY} w={hatchW} h={hatchH} C={C} />;
    }
    // ff, fc, custom — fixed/wall at base
    return <WallHatch x={colX - hatchW / 2} y={botY} w={hatchW} h={hatchH} C={C} />;
  }

  const Lk_y = (beta_y * Ly).toFixed(0);
  const Lk_z = (beta_z * Lz).toFixed(0);

  return (
    <g>
      {/* Main column line */}
      <line x1={colX} y1={topY} x2={colX} y2={botY}
        stroke={C.column} strokeWidth={2} />

      {/* Buckled shape */}
      <path d={bucklePath(bcType)} fill="none" stroke={C.buckled} strokeWidth={1.25}
        strokeDasharray="4,3" />

      {/* Support symbols */}
      <TopSupport />
      <BotSupport />

      {/* L label (left side) */}
      <line x1={colX - 30} y1={topY} x2={colX - 30} y2={botY}
        stroke={C.dim} strokeWidth={0.75} />
      <line x1={colX - 33} y1={topY} x2={colX - 27} y2={topY} stroke={C.dim} strokeWidth={0.75} />
      <line x1={colX - 33} y1={botY} x2={colX - 27} y2={botY} stroke={C.dim} strokeWidth={0.75} />
      <text x={colX - 38} y={(topY + botY) / 2} textAnchor="middle" dominantBaseline="middle"
        fontSize={8} fill={C.dimText}
        transform={`rotate(-90, ${colX - 38}, ${(topY + botY) / 2})`}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '8px' } : undefined}
        className={isPdf ? undefined : 'text-[8px] font-mono fill-text-secondary'}>
        Ly={Ly}
      </text>

      {/* Lk_y label */}
      <text x={colX + 14} y={topY + colH * 0.35} textAnchor="start" dominantBaseline="middle"
        fontSize={8} fontWeight={600} fill={C.lkLabel}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '8px', fontWeight: '600' } : undefined}
        className={isPdf ? undefined : 'text-[8px] font-semibold font-mono'}>
        Lky={Lk_y}
      </text>

      {/* Lk_z label */}
      <text x={colX + 14} y={topY + colH * 0.6} textAnchor="start" dominantBaseline="middle"
        fontSize={8} fontWeight={600} fill={C.lkLabel}
        style={isPdf ? { fontFamily: 'monospace', fontSize: '8px', fontWeight: '600' } : undefined}
        className={isPdf ? undefined : 'text-[8px] font-semibold font-mono'}>
        Lkz={Lk_z}
      </text>

      {/* Legend at bottom */}
      <text x={colX} y={botY + (bcType === 'pp' ? pinSize * 1.5 : hatchH) + 14}
        textAnchor="middle" fontSize={9} fill={C.label}
        style={isPdf ? { fontFamily: 'sans-serif', fontSize: '9px' } : undefined}
        className={isPdf ? undefined : 'text-[9px] fill-text-disabled'}>
        {bcType === 'pp' ? 'Art.-Art.' : bcType === 'pf' ? 'Art.-Emp.' : bcType === 'ff' ? 'Emp.-Emp.' : bcType === 'fc' ? 'Emp.-Libre' : 'β personalizado'}
      </text>
    </g>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function SteelColumnsSVG({ inp, mode, width, height }: SteelColumnsSVGProps) {
  const isPdf = mode === 'pdf';
  const C = isPdf ? PDF : SCREEN;

  const leftW = Math.floor(width * 0.38);
  const rightW = width - leftW;

  // ── Left panel: cross-section ─────────────────────────────────────────────
  const padL = { top: 32, bottom: 28, left: 36, right: 12 };
  const drawLW = leftW - padL.left - padL.right;
  const drawLH = height - padL.top - padL.bottom;

  let sectionShape: React.ReactNode = null;

  if (inp.sectionType === '2UPN') {
    const box = buildUPNBox(inp.size);
    if (box) {
      const scaleX = drawLW / box.b;
      const scaleY = drawLH / box.h;
      const scale = Math.min(scaleX, scaleY) * 0.88;
      const sW = box.b * scale;
      const sH = box.h * scale;
      const ox = padL.left + (drawLW - sW) / 2;
      const oy = padL.top + (drawLH - sH) / 2;

      sectionShape = (
        <UPNBoxShape
          ox={ox} oy={oy} sW={sW} sH={sH}
          tf={box.tf * scale} tw={box.tw * scale}
          profile={box} C={C} isPdf={isPdf}
        />
      );
    }
  } else {
    const profile = getProfile(inp.sectionType as 'HEA' | 'HEB' | 'IPE', inp.size);
    if (profile) {
      const scaleX = drawLW / profile.b;
      const scaleY = drawLH / profile.h;
      const scale = Math.min(scaleX, scaleY) * 0.88;
      const sW = profile.b * scale;
      const sH = profile.h * scale;
      const ox = padL.left + (drawLW - sW) / 2;
      const oy = padL.top + (drawLH - sH) / 2;

      sectionShape = (
        <ISectionShape
          ox={ox} oy={oy} sW={sW} sH={sH}
          tf={profile.tf * scale} tw={profile.tw * scale}
          profile={profile} C={C} isPdf={isPdf}
        />
      );
    } else {
      sectionShape = (
        <text x={leftW / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle"
          fontSize={11} fill={C.label}
          className={isPdf ? undefined : 'fill-text-disabled'}>
          Perfil no disponible
        </text>
      );
    }
  }

  // ── Right panel: column geometry ──────────────────────────────────────────

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Sección transversal y geometría del pilar"
      style={{ background: C.bg }}
    >
      {/* Divider */}
      <line x1={leftW} y1={8} x2={leftW} y2={height - 8}
        stroke={isPdf ? '#dddddd' : '#253147'} strokeWidth={1} />

      {/* Left panel: cross-section */}
      {sectionShape}

      {/* Right panel: column geometry */}
      <ColumnGeometry
        bcType={inp.bcType}
        Ly={inp.Ly}
        Lz={inp.Lz}
        beta_y={inp.beta_y}
        beta_z={inp.beta_z}
        C={C} isPdf={isPdf}
        panelX={leftW} panelY={0} panelW={rightW} panelH={height}
      />
    </svg>
  );
}

