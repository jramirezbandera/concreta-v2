import { type PileCapInputs } from '../../data/defaults';
import { type PileCapResult } from '../../lib/calculations/pileCap';

interface PileCapSVGProps {
  inp:    PileCapInputs;
  result: PileCapResult;
  width:  number;
  mode?:  'screen' | 'pdf';
}

// Color tokens — screen vs pdf
function colors(isPdf: boolean) {
  return {
    bg:         isPdf ? '#ffffff' : 'transparent',
    capFill:    isPdf ? '#f1f5f9' : 'var(--color-bg-surface,#1e293b)',
    capStroke:  isPdf ? '#334155' : '#475569',
    colFill:    isPdf ? '#cbd5e1' : '#334155',
    colStroke:  isPdf ? '#475569' : '#64748b',
    pileFill:   isPdf ? '#ffffff' : 'var(--color-bg-primary,#0f172a)',
    pileStroke: isPdf ? '#0ea5e9' : '#38bdf8',
    tieStroke:  isPdf ? '#22c55e' : '#22c55e',
    strutStroke:isPdf ? '#f59e0b' : '#f59e0b',
    textMain:   isPdf ? '#0f172a' : '#f8fafc',
    textSec:    isPdf ? '#475569' : '#94a3b8',
    accent:     isPdf ? '#0ea5e9' : '#38bdf8',
  };
}

// ── Plan view ────────────────────────────────────────────────────────────────

function PlanView({
  inp, result, size, isPdf,
}: { inp: PileCapInputs; result: PileCapResult; size: number; isPdf: boolean }) {
  const c = colors(isPdf);
  const { pilePos, reactions, L_x, L_y, R_max } = result;
  const d_p   = inp.d_p as number;
  const b_col = inp.b_col as number;
  const h_col = inp.h_col as number;

  // Scale: fit cap dimensions + small margin
  const margin = 20;
  const scaleX = (size - 2 * margin) / L_x;
  const scaleY = (size - 2 * margin) / L_y;
  const scale  = Math.min(scaleX, scaleY);

  // Origin = cap center in px
  const ox = size / 2;
  const oy = size / 2;

  const px = (x: number) => ox + x * scale;
  const py = (y: number) => oy - y * scale;  // SVG y-axis flipped

  const capHalfX = (L_x / 2) * scale;
  const capHalfY = (L_y / 2) * scale;
  const colHalfX = (b_col / 2) * scale;
  const colHalfY = (h_col / 2) * scale;
  const r_pile   = (d_p / 2) * scale;

  // Clamp pile radius to a visible range
  const r_px = Math.min(Math.max(r_pile, 5), 20);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Vista en planta del encepado"
    >
      {/* Cap outline */}
      <rect
        x={ox - capHalfX} y={oy - capHalfY}
        width={2 * capHalfX} height={2 * capHalfY}
        fill={c.capFill} stroke={c.capStroke} strokeWidth={1.5}
      />

      {/* Tie lines (bottom layer) */}
      {pilePos.map((p, i) =>
        pilePos.slice(i + 1).map((q, j) => (
          <line
            key={`tie-${i}-${j}`}
            x1={px(p.x)} y1={py(p.y)}
            x2={px(q.x)} y2={py(q.y)}
            stroke={c.tieStroke} strokeWidth={1.2} strokeDasharray="4 3"
            opacity={0.6}
          />
        ))
      )}

      {/* Column */}
      <rect
        x={ox - colHalfX} y={oy - colHalfY}
        width={2 * colHalfX} height={2 * colHalfY}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1}
      />

      {/* Piles */}
      {pilePos.map((p, i) => {
        const isCrit = reactions[i] === R_max;
        return (
          <g key={`pile-${i}`}>
            <circle
              cx={px(p.x)} cy={py(p.y)} r={r_px}
              fill={c.pileFill}
              stroke={isCrit ? c.accent : c.pileStroke}
              strokeWidth={isCrit ? 2 : 1.5}
            />
            {/* Reaction label */}
            <text
              x={px(p.x)}
              y={py(p.y) + r_px + 10}
              textAnchor="middle"
              fontSize={isPdf ? 7 : 8}
              fill={c.textSec}
              fontFamily="monospace"
            >
              {`R${i + 1}=${reactions[i].toFixed(0)}kN`}
            </text>
          </g>
        );
      })}

      {/* Dimension labels */}
      <text
        x={ox} y={oy - capHalfY - 5}
        textAnchor="middle" fontSize={isPdf ? 7 : 8}
        fill={c.textSec} fontFamily="monospace"
      >
        {`Lx=${L_x.toFixed(0)} mm`}
      </text>
      <text
        x={ox + capHalfX + 5} y={oy}
        textAnchor="start" fontSize={isPdf ? 7 : 8}
        fill={c.textSec} fontFamily="monospace"
        dominantBaseline="middle"
      >
        {`Ly=${L_y.toFixed(0)}`}
      </text>

      {/* Legend */}
      <circle cx={12} cy={size - 14} r={4} fill={c.pileFill} stroke={c.accent} strokeWidth={1.5} />
      <text x={20} y={size - 10} fontSize={isPdf ? 6 : 7} fill={c.textSec} fontFamily="monospace">
        pilote crítico
      </text>
    </svg>
  );
}

// ── Section view ─────────────────────────────────────────────────────────────

function SectionView({
  inp, result, width, isPdf,
}: { inp: PileCapInputs; result: PileCapResult; width: number; isPdf: boolean }) {
  const c = colors(isPdf);
  const h_enc  = inp.h_enc as number;
  const b_col  = inp.b_col as number;
  const n      = inp.n as number;
  const d_p    = inp.d_p as number;
  const cover  = inp.cover as number;
  const { L_x, z_eff, theta_deg } = result;

  const height = Math.round(width * 0.55);

  // Scale to fit cap width + top column stub + small margin
  const margin = 20;
  const colStubH = 80;  // px — symbolic column stub above cap
  const totalH = height - margin * 2 - colStubH;
  const scale = Math.min(
    (width - 2 * margin) / L_x,
    totalH / h_enc,
  );

  const capW  = L_x * scale;
  const capH  = h_enc * scale;
  const colW  = b_col * scale;
  const r_pile = Math.min(Math.max((d_p / 2) * scale, 5), 18);
  const cov_px = cover * scale;

  // Section origin: cap top-left
  const ox = (width - capW) / 2;
  const oy = margin + colStubH;

  // Pile x positions for n=2 (symmetric, only 2 piles)
  // For n=3/4: show 2 representative piles at ±s/2 in x for section view
  const s = inp.s as number;
  const pile_x_left  = ox + (L_x / 2 - s / 2) * scale;
  const pile_x_right = ox + (L_x / 2 + s / 2) * scale;
  const pile_y       = oy + capH + r_pile;   // pile tops at cap bottom

  // Tie bar y position (from cap bottom)
  const tie_y = oy + capH - cov_px;

  // Strut lines: from column base (cap top center) to each pile top
  const col_cx = ox + capW / 2;
  const col_by = oy;  // cap top = col base

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Sección transversal del encepado"
    >
      {/* Column stub */}
      <rect
        x={col_cx - colW / 2} y={oy - colStubH + 10}
        width={colW} height={colStubH - 10}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1}
      />

      {/* Cap body */}
      <rect
        x={ox} y={oy}
        width={capW} height={capH}
        fill={c.capFill} stroke={c.capStroke} strokeWidth={1.5}
      />

      {/* Strut lines (left and right) */}
      <line
        x1={col_cx} y1={col_by}
        x2={pile_x_left} y2={pile_y - r_pile}
        stroke={c.strutStroke} strokeWidth={1.2} strokeDasharray="5 3"
      />
      <line
        x1={col_cx} y1={col_by}
        x2={pile_x_right} y2={pile_y - r_pile}
        stroke={c.strutStroke} strokeWidth={1.2} strokeDasharray="5 3"
      />

      {/* Strut angle annotation (right side) */}
      <text
        x={col_cx + (pile_x_right - col_cx) / 2 + 5}
        y={col_by + (pile_y - r_pile - col_by) / 2}
        fontSize={isPdf ? 6.5 : 7.5}
        fill={c.strutStroke}
        fontFamily="monospace"
        textAnchor="start"
      >
        {`θ=${theta_deg.toFixed(1)}°`}
      </text>

      {/* Tie bar (horizontal line at cover depth) */}
      <line
        x1={pile_x_left} y1={tie_y}
        x2={pile_x_right} y2={tie_y}
        stroke={c.tieStroke} strokeWidth={2}
      />
      {/* Tie bar dots at piles */}
      <circle cx={pile_x_left}  cy={tie_y} r={3} fill={c.tieStroke} />
      <circle cx={pile_x_right} cy={tie_y} r={3} fill={c.tieStroke} />

      {/* Cover annotation */}
      <line
        x1={ox - 10} y1={oy + capH} x2={ox - 10} y2={tie_y}
        stroke={c.textSec} strokeWidth={0.8}
      />
      <text
        x={ox - 13} y={(oy + capH + tie_y) / 2}
        fontSize={isPdf ? 6 : 7} fill={c.textSec}
        fontFamily="monospace" textAnchor="end" dominantBaseline="middle"
      >
        {`c=${cover.toFixed(0)}`}
      </text>

      {/* z_eff annotation */}
      <line
        x1={ox + capW + 10} y1={oy + capH - cov_px}
        x2={ox + capW + 10} y2={oy}
        stroke={c.textSec} strokeWidth={0.8}
      />
      <text
        x={ox + capW + 14} y={oy + (capH - cov_px) / 2}
        fontSize={isPdf ? 6 : 7} fill={c.textSec}
        fontFamily="monospace" dominantBaseline="middle"
      >
        {`z=${z_eff.toFixed(0)}`}
      </text>

      {/* Piles (circles below cap) */}
      {[pile_x_left, pile_x_right].map((px, i) => (
        <g key={`sec-pile-${i}`}>
          <circle cx={px} cy={pile_y} r={r_pile}
            fill={c.pileFill} stroke={c.pileStroke} strokeWidth={1.5} />
          {n > 2 && (
            <text x={px} y={pile_y + r_pile + 10}
              textAnchor="middle" fontSize={isPdf ? 6 : 7}
              fill={c.textSec} fontFamily="monospace">
              {n === 3 ? (i === 0 ? 'B' : 'C') : (i === 0 ? '1,3' : '2,4')}
            </text>
          )}
        </g>
      ))}

      {/* Cap depth label */}
      <text
        x={ox / 2} y={oy + capH / 2}
        textAnchor="middle" fontSize={isPdf ? 7 : 8}
        fill={c.textSec} fontFamily="monospace" dominantBaseline="middle"
      >
        {`h=${h_enc}`}
      </text>

      {/* Legend row */}
      <line x1={8}  y1={height - 8} x2={22} y2={height - 8} stroke={c.strutStroke} strokeWidth={1.5} strokeDasharray="4 2" />
      <text x={26} y={height - 5} fontSize={isPdf ? 6 : 7} fill={c.textSec} fontFamily="monospace">biela</text>
      <line x1={60} y1={height - 8} x2={74} y2={height - 8} stroke={c.tieStroke} strokeWidth={2} />
      <text x={78} y={height - 5} fontSize={isPdf ? 6 : 7} fill={c.textSec} fontFamily="monospace">tirante</text>
    </svg>
  );
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

export function PileCapSVG({ inp, result, width, mode = 'screen' }: PileCapSVGProps) {
  const isPdf = mode === 'pdf';

  if (!result.valid) {
    return (
      <div
        className={mode === 'screen' ? 'flex items-center justify-center text-text-disabled text-sm' : undefined}
        style={{ width, height: 80 }}
      >
        {mode === 'screen' && <span>Sin datos — completar entradas</span>}
      </div>
    );
  }

  const planSize = Math.min(width, 280);

  return (
    <div
      id={mode === 'pdf' ? 'pile-cap-svg-pdf' : undefined}
      className={mode === 'screen' ? 'canvas-dot-grid flex flex-col items-center gap-2 py-4' : undefined}
      style={mode === 'pdf' ? { background: '#fff' } : undefined}
    >
      {/* Plan view */}
      <PlanView inp={inp} result={result} size={planSize} isPdf={isPdf} />

      {/* Divider label */}
      <div
        className={mode === 'screen' ? 'text-[10px] font-mono text-text-disabled uppercase tracking-wider' : undefined}
        style={mode === 'pdf' ? { textAlign: 'center', fontSize: 8, color: '#999', fontFamily: 'monospace', marginTop: 4 } : undefined}
      >
        Sección transversal
      </div>

      {/* Section view */}
      <SectionView inp={inp} result={result} width={width} isPdf={isPdf} />
    </div>
  );
}
