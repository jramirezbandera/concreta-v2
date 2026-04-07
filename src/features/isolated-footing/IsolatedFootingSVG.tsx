import { type IsolatedFootingInputs } from '../../data/defaults';
import { type IsolatedFootingResult } from '../../lib/calculations/isolatedFooting';

interface IsolatedFootingSVGProps {
  inp:    IsolatedFootingInputs;
  result: IsolatedFootingResult;
  width:  number;
  mode?:  'screen' | 'pdf';
}

function colors(isPdf: boolean) {
  return {
    bg:          isPdf ? '#ffffff' : 'transparent',
    footFill:    isPdf ? '#f0f0f0' : 'var(--color-bg-surface,#1e293b)',
    footStroke:  isPdf ? '#555'    : '#475569',
    colFill:     isPdf ? '#d8d8d8' : '#334155',
    colStroke:   isPdf ? '#333'    : '#64748b',
    effBorder:   isPdf ? '#888'    : '#f59e0b',
    pressHigh:   isPdf ? '#cc0000' : '#ef4444',
    pressLow:    isPdf ? '#0055cc' : '#38bdf8',
    rebarStroke: isPdf ? '#228822' : '#22c55e',
    groundLine:  isPdf ? '#886633' : '#b45309',
    textMain:    isPdf ? '#111'    : '#f8fafc',
    textSec:     isPdf ? '#555'    : '#94a3b8',
    accent:      isPdf ? '#000'    : '#38bdf8',
  };
}

// ── Plan view ─────────────────────────────────────────────────────────────────

function PlanView({
  inp, result, size, isPdf,
}: { inp: IsolatedFootingInputs; result: IsolatedFootingResult; size: number; isPdf: boolean }) {
  const c = colors(isPdf);

  const B  = inp.B  as number;
  const L  = inp.L  as number;
  const bc = inp.bc as number;
  const hc = inp.hc as number;
  const { B_eff, L_eff, sigma_max, sigma_min, ex, ey } = result;

  const margin = 22;
  const scaleX = (size - 2 * margin) / B;
  const scaleY = (size - 2 * margin) / L;
  const scale  = Math.min(scaleX, scaleY);

  const ox = size / 2;
  const oy = size / 2;

  const halfB = (B / 2) * scale;
  const halfL = (L / 2) * scale;
  const halfBc = (bc / 2) * scale;
  const halfHc = (hc / 2) * scale;

  const hasEcc = ex > 0.001 || ey > 0.001;
  const halfBeff = (B_eff / 2) * scale;
  const halfLeff = (L_eff / 2) * scale;

  // Color stops for pressure gradient (σmin → σmax)
  // We map the footing rectangle with a gradient indicating pressure distribution.
  const pressRange = sigma_max - sigma_min;
  const sigmaColor = (sigma: number) => {
    const t = pressRange > 0 ? (sigma - sigma_min) / pressRange : 0.5;
    const r = Math.round(56 + (239 - 56) * t);
    const g = Math.round(189 - 100 * t);
    const b_ch = Math.round(248 - 200 * t);
    return `rgb(${r},${g},${b_ch})`;
  };

  // Gradient ID (unique per SVG to avoid conflicts in PDF with multiple SVGs)
  const gradId = isPdf ? 'pf-grad-pdf' : 'pf-grad';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Vista en planta de la zapata"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={sigmaColor(sigma_min)} stopOpacity="0.5" />
          <stop offset="100%" stopColor={sigmaColor(sigma_max)} stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Footing outline (fill + pressure gradient overlay) */}
      <rect
        x={ox - halfB} y={oy - halfL}
        width={2 * halfB} height={2 * halfL}
        fill={c.footFill} stroke={c.footStroke} strokeWidth={1.5}
      />
      {/* Pressure gradient overlay */}
      <rect
        x={ox - halfB} y={oy - halfL}
        width={2 * halfB} height={2 * halfL}
        fill={`url(#${gradId})`} stroke="none"
      />

      {/* Effective area dashed (only if eccentricity) */}
      {hasEcc && (
        <rect
          x={ox - halfBeff} y={oy - halfLeff}
          width={2 * halfBeff} height={2 * halfLeff}
          fill="none" stroke={c.effBorder} strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}

      {/* Column */}
      <rect
        x={ox - halfBc} y={oy - halfHc}
        width={2 * halfBc} height={2 * halfHc}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1}
      />

      {/* Dimension label B */}
      <text
        x={ox} y={oy - halfL - 5}
        textAnchor="middle" fontSize={isPdf ? 7 : 8}
        fill={c.textSec} fontFamily="monospace"
      >
        {`B=${B.toFixed(2)}m`}
      </text>

      {/* Dimension label L */}
      <text
        x={ox + halfB + 5} y={oy}
        textAnchor="start" fontSize={isPdf ? 7 : 8}
        fill={c.textSec} fontFamily="monospace" dominantBaseline="middle"
      >
        {`L=${L.toFixed(2)}m`}
      </text>

      {/* σmax / σmin labels */}
      <text
        x={ox + halfB - 3} y={oy}
        textAnchor="end" fontSize={isPdf ? 6 : 7}
        fill={c.pressHigh} fontFamily="monospace" dominantBaseline="middle"
      >
        {`${sigma_max.toFixed(0)}kPa`}
      </text>
      <text
        x={ox - halfB + 3} y={oy}
        textAnchor="start" fontSize={isPdf ? 6 : 7}
        fill={c.pressLow} fontFamily="monospace" dominantBaseline="middle"
      >
        {`${Math.max(sigma_min, 0).toFixed(0)}kPa`}
      </text>

      {/* Effective area label if eccentricity */}
      {hasEcc && (
        <text
          x={ox} y={oy + halfLeff + 10}
          textAnchor="middle" fontSize={isPdf ? 5.5 : 6.5}
          fill={c.effBorder} fontFamily="monospace"
        >
          {`B'×L'=${B_eff.toFixed(2)}×${L_eff.toFixed(2)}m`}
        </text>
      )}
    </svg>
  );
}

// ── Section view ──────────────────────────────────────────────────────────────

function SectionView({
  inp, result, width, isPdf,
}: { inp: IsolatedFootingInputs; result: IsolatedFootingResult; width: number; isPdf: boolean }) {
  const c = colors(isPdf);

  const B  = inp.B  as number;
  const h  = inp.h  as number;
  const bc = inp.bc as number;
  const Df = inp.Df as number;
  const phi_x = inp.phi_x as number;

  const { sigma_max, sigma_min, d_x, ax } = result;

  const height = Math.round(width * 0.60);
  const margin = 20;
  const colStubH = 60;
  const groundLineH = 18;
  const pressH = 40;   // px — max height of pressure diagram

  const totalContentH = height - margin * 2 - colStubH - groundLineH - pressH;
  const scale = Math.min(
    (width - 2 * margin) / B,
    totalContentH / h,
  );

  const capW = B * scale;
  const capH = h * scale;
  const colW = bc * scale;
  const cov_px = (inp.cover as number) / 1000 * scale;
  const phi_px = Math.min(Math.max(phi_x * scale / 1000, 3), 5);

  const ox = (width - capW) / 2;
  const oy = margin + colStubH + groundLineH;   // top of footing

  const col_cx = ox + capW / 2;

  // Pressure diagram (trapezoid below footing)
  const sigMin = Math.max(sigma_min, 0);  // no tension for diagram
  const sigMax = sigma_max;
  const leftH  = Math.max(sigMin / sigMax, 0) * pressH;
  const rightH = pressH;

  // Rebar y position (from cap bottom, cover_px + phi_px/2)
  const rebar_y = oy + capH - cov_px - phi_px / 2;

  // Ax annotation
  const col_left = col_cx - (bc / 2) * scale;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Sección transversal de la zapata"
    >
      {/* Ground line (dotted) at Df above footing top */}
      <line
        x1={ox - 10} y1={oy}
        x2={ox + capW + 10} y2={oy}
        stroke={c.groundLine} strokeWidth={1} strokeDasharray="5 3"
      />
      <text
        x={ox - 12} y={oy}
        textAnchor="end" fontSize={isPdf ? 6 : 7}
        fill={c.groundLine} fontFamily="monospace" dominantBaseline="middle"
      >
        {`GL`}
      </text>

      {/* Df annotation (vertical) */}
      <line
        x1={ox + capW + 10} y1={oy - groundLineH}
        x2={ox + capW + 10} y2={oy}
        stroke={c.textSec} strokeWidth={0.7}
      />
      <text
        x={ox + capW + 14} y={oy - groundLineH / 2}
        fontSize={isPdf ? 5.5 : 6.5}
        fill={c.textSec} fontFamily="monospace" dominantBaseline="middle"
      >
        {`Df=${Df.toFixed(2)}m`}
      </text>

      {/* Column stub */}
      <rect
        x={col_cx - colW / 2} y={margin}
        width={colW} height={colStubH}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1}
      />

      {/* Footing body */}
      <rect
        x={ox} y={oy}
        width={capW} height={capH}
        fill={c.footFill} stroke={c.footStroke} strokeWidth={1.5}
      />

      {/* Rebar line (x bars) */}
      <line
        x1={ox + 4} y1={rebar_y}
        x2={ox + capW - 4} y2={rebar_y}
        stroke={c.rebarStroke} strokeWidth={phi_px}
        strokeLinecap="round"
      />

      {/* d_x annotation (right side) */}
      <line
        x1={ox + capW + 8} y1={rebar_y}
        x2={ox + capW + 8} y2={oy}
        stroke={c.textSec} strokeWidth={0.7}
      />
      <text
        x={ox + capW + 12} y={oy + (rebar_y - oy) / 2}
        fontSize={isPdf ? 5.5 : 6.5}
        fill={c.textSec} fontFamily="monospace" dominantBaseline="middle"
      >
        {`d=${d_x.toFixed(0)}`}
      </text>

      {/* ax cantilever arrow (left side, below column) */}
      <line
        x1={ox} y1={oy + capH + 5}
        x2={col_left} y2={oy + capH + 5}
        stroke={c.textSec} strokeWidth={0.7}
        markerEnd="none"
      />
      <text
        x={(ox + col_left) / 2} y={oy + capH + 12}
        textAnchor="middle" fontSize={isPdf ? 5.5 : 6.5}
        fill={c.textSec} fontFamily="monospace"
      >
        {`ax=${(ax / 1000).toFixed(2)}m`}
      </text>

      {/* h label (left of footing) */}
      <text
        x={ox - 8} y={oy + capH / 2}
        textAnchor="end" fontSize={isPdf ? 6 : 7}
        fill={c.textSec} fontFamily="monospace" dominantBaseline="middle"
      >
        {`h=${h.toFixed(2)}`}
      </text>

      {/* Pressure diagram (trapezoidal below footing) */}
      <polygon
        points={[
          `${ox},${oy + capH}`,
          `${ox},${oy + capH + leftH}`,
          `${ox + capW},${oy + capH + rightH}`,
          `${ox + capW},${oy + capH}`,
        ].join(' ')}
        fill={c.pressHigh}
        fillOpacity={0.25}
        stroke={c.pressHigh}
        strokeWidth={0.8}
      />
      {/* Pressure labels */}
      <text
        x={ox + 2} y={oy + capH + Math.max(leftH, 8) + 9}
        fontSize={isPdf ? 5.5 : 6.5}
        fill={c.pressLow} fontFamily="monospace"
      >
        {`${sigMin.toFixed(0)}kPa`}
      </text>
      <text
        x={ox + capW - 2} y={oy + capH + rightH + 9}
        textAnchor="end" fontSize={isPdf ? 5.5 : 6.5}
        fill={c.pressHigh} fontFamily="monospace"
      >
        {`${sigMax.toFixed(0)}kPa`}
      </text>

      {/* B label at bottom */}
      <text
        x={ox + capW / 2} y={height - 4}
        textAnchor="middle" fontSize={isPdf ? 6 : 7}
        fill={c.textSec} fontFamily="monospace"
      >
        {`B=${B.toFixed(2)} m`}
      </text>
    </svg>
  );
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

export function IsolatedFootingSVG({ inp, result, width, mode = 'screen' }: IsolatedFootingSVGProps) {
  const isPdf = mode === 'pdf';

  if (!result.valid && result.error) {
    return (
      <div
        className={mode === 'screen' ? 'flex items-center justify-center text-text-disabled text-sm' : undefined}
        style={{ width, height: 80 }}
      >
        {mode === 'screen' && <span>Sin datos — completar entradas</span>}
      </div>
    );
  }

  const planSize = Math.min(width, 260);

  return (
    <div
      id={mode === 'pdf' ? 'isolated-footing-svg-pdf' : undefined}
      className={mode === 'screen' ? 'canvas-dot-grid flex flex-col items-center gap-2 py-4' : undefined}
      style={mode === 'pdf' ? { background: '#fff' } : undefined}
    >
      <PlanView inp={inp} result={result} size={planSize} isPdf={isPdf} />

      <div
        className={mode === 'screen' ? 'text-[10px] font-mono text-text-disabled uppercase tracking-wider' : undefined}
        style={mode === 'pdf' ? { textAlign: 'center', fontSize: 8, color: '#999', fontFamily: 'monospace', marginTop: 4 } : undefined}
      >
        Sección transversal
      </div>

      <SectionView inp={inp} result={result} width={width} isPdf={isPdf} />
    </div>
  );
}
