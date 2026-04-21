// Timber Columns SVG — two panels:
//   Left:  column elevation with load arrows (N, V, M), support symbols, dimensions
//   Right: cross-section (b×h rectangle, fire residual section overlay)
//
// mode='screen': dark theme  |  mode='pdf': white background

import type { ReactElement } from 'react';
import { type TimberColumnInputs } from '../../data/defaults';
import { type TimberColumnResult } from '../../lib/calculations/timberColumns';

interface TimberColumnsSVGProps {
  inp: TimberColumnInputs;
  result: TimberColumnResult;
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
  column: '#c8966c',
  columnStroke: '#d4a06e',
  support: '#94a3b8',
  hatch: '#475569',
  label: '#64748b',
  momentCurve: '#38bdf8',
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
  column: '#d4a96a',
  columnStroke: '#8B6914',
  support: '#333333',
  hatch: '#666666',
  label: '#666666',
  momentCurve: '#1d4ed8',
};

// ─── Cross-section panel ──────────────────────────────────────────────────────
function CrossSection({
  inp, result, C, isPdf, panelX, panelW, panelH,
}: {
  inp: TimberColumnInputs;
  result: TimberColumnResult;
  C: typeof SCREEN; isPdf: boolean;
  panelX: number; panelW: number; panelH: number;
}) {
  const margin = 20;
  const availW = panelW - 2 * margin;
  const availH = panelH - 2 * margin;
  const scale  = Math.min(availW / Math.max(inp.b, 1), availH / Math.max(inp.h, 1)) * 0.75;

  const sW = inp.b * scale;
  const sH = inp.h * scale;
  const ox  = panelX + (panelW - sW) / 2;
  const oy  = (panelH - sH) / 2;

  const fireActive = result.valid && result.fireActive;
  const def_px = fireActive ? result.def * scale : 0;
  const b_ef_px = fireActive ? result.b_ef * scale : sW;
  const h_ef_px = fireActive ? result.h_ef * scale : sH;

  // Residual section: centred horizontally, and depending on faces exposed
  const rOx = ox + (sW - b_ef_px) / 2;
  const rOy = inp.exposedFaces === 4
    ? oy + (sH - h_ef_px) / 2
    : oy; // 3 faces: top not protected → residual aligns at top

  const fs  = isPdf ? 8 : 9;
  const fsS = isPdf ? 7 : 8;

  // Grain lines
  const grainCount = 4;
  const grainLines: ReactElement[] = [];
  for (let i = 1; i <= grainCount; i++) {
    const gy = oy + (sH * i) / (grainCount + 1);
    grainLines.push(
      <line key={i} x1={ox + 2} y1={gy} x2={ox + sW - 2} y2={gy}
        stroke={C.hatch} strokeWidth={isPdf ? 0.5 : 0.6} strokeDasharray="4 3" opacity={0.5} />,
    );
  }

  // Moment axis indicator (dot for axis going into the page on the bending axis)
  const axisColor = C.momentCurve;
  const axisLabel = inp.momentAxis === 'strong' ? 'eje y (fuerte)' : 'eje z (débil)';

  return (
    <g>
      {/* Full section */}
      <rect x={ox} y={oy} width={sW} height={sH}
        fill={fireActive ? C.charFill : C.sectionFill}
        stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1}
        opacity={fireActive ? 0.25 : 1}
      />

      {/* Wood grain lines */}
      {!fireActive && grainLines}

      {/* Residual section */}
      {fireActive && b_ef_px > 0 && h_ef_px > 0 && (
        <rect x={rOx} y={rOy} width={b_ef_px} height={h_ef_px}
          fill={C.residualFill} stroke={C.residualStroke} strokeWidth={isPdf ? 1.5 : 1}
          opacity={0.9}
        />
      )}
      {fireActive && b_ef_px > 0 && h_ef_px > 0 && Array.from({ length: grainCount }, (_, i) => {
        const gy = rOy + (h_ef_px * (i + 1)) / (grainCount + 1);
        return (
          <line key={i} x1={rOx + 2} y1={gy} x2={rOx + b_ef_px - 2} y2={gy}
            stroke={C.columnStroke} strokeWidth={isPdf ? 0.5 : 0.6} strokeDasharray="4 3" opacity={0.4} />
        );
      })}

      {/* Char depth annotation */}
      {fireActive && def_px > 0 && (
        <text x={ox + sW / 2} y={oy + sH + 12} textAnchor="middle"
          fontSize={fsS} fill={C.charFill} fontFamily="monospace">
          {`def=${result.def.toFixed(1)}mm`}
        </text>
      )}

      {/* b dimension (horizontal, bottom) */}
      <text x={ox + sW / 2} y={oy + sH + (fireActive ? 22 : 12)} textAnchor="middle"
        fontSize={fs} fill={C.dimText} fontFamily="monospace">
        {`b=${inp.b}`}
      </text>

      {/* h dimension (vertical, right) */}
      <g transform={`translate(${ox + sW + 10}, ${oy + sH / 2}) rotate(-90)`}>
        <text x={0} y={0} textAnchor="middle"
          fontSize={fs} fill={C.dimText} fontFamily="monospace">
          {`h=${inp.h}`}
        </text>
      </g>

      {/* Moment axis label */}
      <text x={ox + sW / 2} y={oy - 8} textAnchor="middle"
        fontSize={fsS} fill={axisColor} fontFamily="sans-serif">
        {axisLabel}
      </text>

      {/* Axis dot — moment bending axis symbol */}
      <circle cx={ox + sW / 2} cy={oy + sH / 2}
        r={isPdf ? 3 : 3.5} fill="none" stroke={axisColor} strokeWidth={1} opacity={0.6} />
      <circle cx={ox + sW / 2} cy={oy + sH / 2}
        r={isPdf ? 1 : 1.2} fill={axisColor} opacity={0.6} />
    </g>
  );
}

// ─── Column elevation panel ───────────────────────────────────────────────────
function ColumnElevation({
  inp, C, isPdf, panelW, panelH,
}: {
  inp: TimberColumnInputs;
  C: typeof SCREEN; isPdf: boolean;
  panelW: number; panelH: number;
}) {
  const colW  = 36;  // column visual width (px)
  const cx    = panelW * 0.38;  // column center x
  const yTop  = 32;
  const yBot  = panelH - 28;
  const colH  = yBot - yTop;
  const colX  = cx - colW / 2;

  const fs    = isPdf ? 8 : 9;
  const arrowSz = 8;

  // Hatch support symbol (ground)
  function HatchSupport({ x, y, flipped }: { x: number; y: number; flipped?: boolean }) {
    const w = 28;
    const lineY = flipped ? y - 4 : y + 4;
    const dir   = flipped ? -1 : 1;
    const hatchLines = Array.from({ length: 5 }, (_, i) => {
      const hx = x - w / 2 + i * (w / 4);
      return <line key={i} x1={hx} y1={lineY} x2={hx - 6 * dir} y2={lineY + 6 * dir}
        stroke={C.support} strokeWidth={1} />;
    });
    return (
      <g>
        <line x1={x - w / 2} y1={lineY} x2={x + w / 2} y2={lineY}
          stroke={C.support} strokeWidth={1.5} />
        {hatchLines}
      </g>
    );
  }

  // Arrow head
  function ArrowHead({ x, y, dir }: { x: number; y: number; dir: 'up' | 'down' | 'left' | 'right' }) {
    const pts: Record<string, string> = {
      up:    `${x},${y} ${x - arrowSz / 2},${y + arrowSz} ${x + arrowSz / 2},${y + arrowSz}`,
      down:  `${x},${y} ${x - arrowSz / 2},${y - arrowSz} ${x + arrowSz / 2},${y - arrowSz}`,
      left:  `${x},${y} ${x + arrowSz},${y - arrowSz / 2} ${x + arrowSz},${y + arrowSz / 2}`,
      right: `${x},${y} ${x - arrowSz},${y - arrowSz / 2} ${x - arrowSz},${y + arrowSz / 2}`,
    };
    return <polygon points={pts[dir]} fill={C.loadArrow} />;
  }

  // Column body
  const hasN = inp.Nd > 0;
  const hasV = inp.Vd > 0;
  const hasM = inp.Md > 0;

  // Effective length annotation (show both if different)
  const betaLabel = inp.beta_y === inp.beta_z
    ? `β=${inp.beta_y}`
    : `βy=${inp.beta_y} / βz=${inp.beta_z}`;
  const LefLabel = inp.beta_y === inp.beta_z
    ? `Lef=${(inp.beta_y * inp.L).toFixed(1)}m`
    : `Lef,y=${(inp.beta_y * inp.L).toFixed(1)}m`;

  return (
    <g>
      {/* Column body */}
      <rect x={colX} y={yTop} width={colW} height={colH}
        fill={C.column} stroke={C.columnStroke} strokeWidth={isPdf ? 1.5 : 1}
        opacity={0.85}
      />

      {/* Grain lines on column */}
      {Array.from({ length: 5 }, (_, i) => {
        const gy = yTop + (colH * (i + 1)) / 6;
        return (
          <line key={i} x1={colX + 2} y1={gy} x2={colX + colW - 2} y2={gy}
            stroke={C.columnStroke} strokeWidth={isPdf ? 0.5 : 0.6}
            strokeDasharray="5 3" opacity={0.4} />
        );
      })}

      {/* Bottom support */}
      <HatchSupport x={cx} y={yBot} />

      {/* Top: N load arrow (pointing down onto column) */}
      {hasN && (
        <g>
          <line x1={cx} y1={yTop - 28} x2={cx} y2={yTop - arrowSz}
            stroke={C.loadArrow} strokeWidth={isPdf ? 1.5 : 1.5} />
          <ArrowHead x={cx} y={yTop} dir="down" />
          <text x={cx + 6} y={yTop - 18} fontSize={fs} fill={C.dimText} fontFamily="monospace">
            {`Nd=${inp.Nd}kN`}
          </text>
        </g>
      )}

      {/* V load arrow (horizontal, at top) */}
      {hasV && (
        <g>
          <line x1={cx - colW / 2 - 28} y1={yTop + 10} x2={cx - colW / 2 - arrowSz} y2={yTop + 10}
            stroke={C.loadArrow} strokeWidth={isPdf ? 1.5 : 1.5} />
          <ArrowHead x={cx - colW / 2} y={yTop + 10} dir="right" />
          <text x={cx - colW / 2 - 26} y={yTop + 8} fontSize={fs} fill={C.dimText}
            fontFamily="monospace" textAnchor="end">
            {`Vd=${inp.Vd}kN`}
          </text>
        </g>
      )}

      {/* Applied moment — curved arrow indicator at top of column
          (Md is a scalar design value; no distribution assumed) */}
      {hasM && (() => {
        const mx = cx + colW / 2 + 10;
        const my = yTop + 12;
        const r  = 7;
        return (
          <g>
            <path
              d={`M ${mx - r} ${my} A ${r} ${r} 0 1 1 ${mx + r} ${my}`}
              fill="none" stroke={C.loadArrow} strokeWidth={isPdf ? 1.5 : 1.5}
            />
            <ArrowHead x={mx + r} y={my} dir="down" />
            <text x={mx + r + 6} y={my + 4} fontSize={fs} fill={C.dimText} fontFamily="monospace">
              {`Md=${inp.Md}kNm`}
            </text>
          </g>
        );
      })()}

      {/* Dimension: L (left side of column) */}
      <line x1={colX - 14} y1={yTop} x2={colX - 14} y2={yBot}
        stroke={C.dim} strokeWidth={0.8} />
      <line x1={colX - 18} y1={yTop} x2={colX - 10} y2={yTop}
        stroke={C.dim} strokeWidth={0.8} />
      <line x1={colX - 18} y1={yBot} x2={colX - 10} y2={yBot}
        stroke={C.dim} strokeWidth={0.8} />
      <text x={colX - 22} y={(yTop + yBot) / 2 + 4} textAnchor="middle"
        fontSize={fs} fill={C.dimText} fontFamily="monospace"
        transform={`rotate(-90, ${colX - 22}, ${(yTop + yBot) / 2 + 4})`}>
        {`L=${inp.L}m`}
      </text>

      {/* β and Lef labels */}
      <text x={colX + colW + 6} y={yTop + colH * 0.35} fontSize={fs - 1}
        fill={C.dim} fontFamily="monospace">
        {betaLabel}
      </text>
      <text x={colX + colW + 6} y={yTop + colH * 0.35 + 11} fontSize={fs - 1}
        fill={C.dim} fontFamily="monospace">
        {LefLabel}
      </text>

      {/* Grade + section label at bottom */}
      <text x={cx} y={yBot + 18} textAnchor="middle"
        fontSize={fs} fill={C.dimText} fontFamily="monospace">
        {`${inp.gradeId}  ${inp.b}×${inp.h}mm`}
      </text>
    </g>
  );
}

// ─── Main SVG ─────────────────────────────────────────────────────────────────
export function TimberColumnsSVG({ inp, result, mode, width, height }: TimberColumnsSVGProps) {
  const C     = mode === 'pdf' ? PDF : SCREEN;
  const isPdf = mode === 'pdf';

  // Panel split: elevation 58%, cross-section 42%
  const elevW = Math.round(width * 0.58);
  const sectW = width - elevW;

  const divX = elevW;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {/* Background */}
      {isPdf && <rect width={width} height={height} fill={C.bg} />}

      {/* Divider */}
      <line x1={divX} y1={8} x2={divX} y2={height - 8}
        stroke={isPdf ? '#cccccc' : '#334155'} strokeWidth={0.5} />

      {/* Column elevation */}
      <ColumnElevation
        inp={inp} C={C} isPdf={isPdf}
        panelW={elevW} panelH={height}
      />

      {/* Cross-section */}
      <CrossSection
        inp={inp} result={result} C={C} isPdf={isPdf}
        panelX={divX} panelW={sectW} panelH={height}
      />
    </svg>
  );
}
