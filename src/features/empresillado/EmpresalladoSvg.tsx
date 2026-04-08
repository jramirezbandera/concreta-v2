// Dual-panel SVG for Empresillado module.
// Left panel: cross-section (bc × hc column + 4 L-angles at corners).
// Right panel: elevation (column height L with batten plates at spacing s).

import { type EmpresalladoInputs } from '../../data/defaults';
import { type EmpresalladoResult } from '../../lib/calculations/empresillado';
import { getAngleProfile } from '../../data/angleProfiles';

export type SvgMode = 'screen' | 'pdf';

interface EmpresalladoSvgProps {
  inp: EmpresalladoInputs;
  result: EmpresalladoResult;
  mode: SvgMode;
  width: number;   // total width for both panels
  height: number;
}

// ── Color tokens ─────────────────────────────────────────────────────────────
function colors(mode: SvgMode) {
  if (mode === 'pdf') {
    return {
      bg: '#ffffff',
      surface: '#f3f4f6',
      border: '#6b7280',
      accent: '#1e40af',
      textPrimary: '#111827',
      textSecondary: '#374151',
      textDisabled: '#9ca3af',
      stateOk: '#16a34a',
      stateWarn: '#d97706',
      stateFail: '#dc2626',
      stateNeutral: '#6b7280',
    };
  }
  return {
    bg: 'transparent',
    surface: '#1e293b',
    border: '#334155',
    accent: '#38bdf8',
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    textDisabled: '#475569',
    stateOk: '#22c55e',
    stateWarn: '#f59e0b',
    stateFail: '#ef4444',
    stateNeutral: '#64748b',
  };
}

function statusColor(util: number, c: ReturnType<typeof colors>): string {
  if (util < 0.8) return c.stateOk;
  if (util < 1.0) return c.stateWarn;
  return c.stateFail;
}

// ─── Cross-section panel ──────────────────────────────────────────────────────
function CrossSection({
  inp, result, c, panelW, panelH,
}: {
  inp: EmpresalladoInputs;
  result: EmpresalladoResult;
  c: ReturnType<typeof colors>;
  panelW: number;
  panelH: number;
}) {
  const { bc, hc } = inp;
  const profile = getAngleProfile(inp.perfil);
  const t_mm = profile?.t ?? 10;
  const b_mm = profile?.b ?? 100;
  const e_cm = profile?.e ?? 2.5;

  // Scale column into canvas with 20px margin
  // Legs run along column faces inward, only the thickness (t) protrudes outside
  const margin = 22;
  const availW = panelW - 2 * margin;
  const availH = panelH - 2 * margin;
  const scale = Math.min(availW / (bc + 2 * t_mm), availH / (hc + 2 * t_mm));

  const colW = bc * scale;
  const colH = hc * scale;
  // Center column (which is inset by b_mm on each side)
  const ox = panelW / 2 - colW / 2;
  const oy = panelH / 2 - colH / 2;

  const t_px = t_mm * scale;
  const b_px = b_mm * scale;

  // Governing chord utilization (worst of chords, cordones)
  const chordUtil = result.valid
    ? result.checks.find((ch) => ch.id === 'cordones')?.utilization ?? 0
    : 0;
  const govColor = result.valid ? statusColor(chordUtil, c) : c.stateNeutral;

  // Chord centroid positions for markers (in canvas coords)
  // centroid = back_of_leg + e = -(colW/2 + b_px) + t_px + e*scale ... simplified:
  // L is placed outside column, centroid at (colW/2 + e_px) from column center
  const e_px = e_cm * 10 * scale;  // e in mm * scale

  // Chord centroid positions — e from the back of each leg
  // TL: back of horizontal leg at y=oy → centroid at oy-e_px; back of vertical at x=ox → centroid at ox-e_px
  const corners = [
    { cx: ox - e_px, cy: oy - e_px },   // TL
    { cx: ox + colW + e_px, cy: oy - e_px },  // TR
    { cx: ox - e_px, cy: oy + colH + e_px },  // BL
    { cx: ox + colW + e_px, cy: oy + colH + e_px }, // BR
  ];

  // Load arrows: N (↓), Mx (→ curve), My (→ horizontal)
  const arrowY = oy - b_px - 14;
  const cx_col = ox + colW / 2;
  const nOpacity = N_arrow_opacity(inp.N_Ed);
  const mxOpacity = N_arrow_opacity(inp.Mx_Ed);
  const myOpacity = N_arrow_opacity(inp.My_Ed);

  return (
    <g>
      {/* Column body */}
      <rect
        x={ox} y={oy} width={colW} height={colH}
        fill={c.surface} stroke={c.border} strokeWidth={1}
      />

      {/* 4 L-angles at corners — concave side faces column corner, legs run along column faces */}
      {/* Top-left: horizontal leg goes RIGHT along top face, vertical leg goes DOWN along left face */}
      <rect x={ox} y={oy - t_px} width={b_px} height={t_px} fill={c.surface} stroke={c.border} strokeWidth={0.8} />
      <rect x={ox - t_px} y={oy} width={t_px} height={b_px} fill={c.surface} stroke={c.border} strokeWidth={0.8} />
      {/* Top-right: horizontal leg goes LEFT, vertical leg goes DOWN along right face */}
      <rect x={ox + colW - b_px} y={oy - t_px} width={b_px} height={t_px} fill={c.surface} stroke={c.border} strokeWidth={0.8} />
      <rect x={ox + colW} y={oy} width={t_px} height={b_px} fill={c.surface} stroke={c.border} strokeWidth={0.8} />
      {/* Bottom-left: horizontal leg goes RIGHT along bottom face, vertical leg goes UP along left face */}
      <rect x={ox} y={oy + colH} width={b_px} height={t_px} fill={c.surface} stroke={c.border} strokeWidth={0.8} />
      <rect x={ox - t_px} y={oy + colH - b_px} width={t_px} height={b_px} fill={c.surface} stroke={c.border} strokeWidth={0.8} />
      {/* Bottom-right: horizontal leg goes LEFT, vertical leg goes UP along right face */}
      <rect x={ox + colW - b_px} y={oy + colH} width={b_px} height={t_px} fill={c.surface} stroke={c.border} strokeWidth={0.8} />
      <rect x={ox + colW} y={oy + colH - b_px} width={t_px} height={b_px} fill={c.surface} stroke={c.border} strokeWidth={0.8} />

      {/* Centroid markers — calc centroid at dx=bc/2+e outside column, shown as reference dots */}
      {corners.map((corner, i) => (
        <circle
          key={i}
          cx={corner.cx} cy={corner.cy} r={2.5}
          fill={i === 0 && result.valid ? govColor : c.stateNeutral}
          opacity={i === 0 ? 0.8 : 0.35}
        />
      ))}

      {/* N arrow (↓) at top center */}
      <g opacity={nOpacity}>
        <line x1={cx_col} y1={arrowY - 8} x2={cx_col} y2={arrowY} stroke={c.accent} strokeWidth={1.5} markerEnd="url(#arrow)" />
        <text x={cx_col + 4} y={arrowY - 10} fontSize={8} fill={c.accent} fontFamily="monospace">N</text>
      </g>

      {/* Mx arc indicator (left side) */}
      <g opacity={mxOpacity}>
        <path d={`M ${ox - b_px - 10},${oy + colH / 2 - 6} a 8 8 0 0 1 0 12`} fill="none" stroke={c.accent} strokeWidth={1.2} />
        <text x={ox - b_px - 22} y={oy + colH / 2 + 3} fontSize={7} fill={c.accent} fontFamily="monospace">Mx</text>
      </g>

      {/* My arc indicator (bottom) */}
      <g opacity={myOpacity}>
        <path d={`M ${ox + colW / 2 - 6},${oy + colH + b_px + 10} a 8 8 0 0 0 12 0`} fill="none" stroke={c.accent} strokeWidth={1.2} />
        <text x={ox + colW / 2 - 8} y={oy + colH + b_px + 22} fontSize={7} fill={c.accent} fontFamily="monospace">My</text>
      </g>

      {/* Dimension labels */}
      <text x={ox + colW / 2} y={panelH - 4} textAnchor="middle" fontSize={9} fill={c.textSecondary} fontFamily="monospace">
        bc={bc} mm
      </text>
      <text
        x={6} y={oy + colH / 2}
        textAnchor="middle" fontSize={9} fill={c.textSecondary} fontFamily="monospace"
        transform={`rotate(-90, 6, ${oy + colH / 2})`}
      >
        hc={hc} mm
      </text>
    </g>
  );
}

function N_arrow_opacity(val: number): number {
  return Math.abs(val) < 1e-9 ? 0.1 : 1;
}

// ─── Elevation panel ──────────────────────────────────────────────────────────
function Elevation({
  inp, result, c, panelW, panelH, offsetX,
}: {
  inp: EmpresalladoInputs;
  result: EmpresalladoResult;
  c: ReturnType<typeof colors>;
  panelW: number;
  panelH: number;
  offsetX: number;
}) {
  const profile = getAngleProfile(inp.perfil);
  const t_mm = profile?.t ?? 10;

  // Layout margins: left for L-label, right for s-annotation
  const leftM  = 28;
  const rightM = 38;
  const topM   = 22;   // room for N arrow + top fixture
  const botM   = 14;

  const availW = panelW - leftM - rightM;
  const availH = panelH - topM - botM;

  // Content: column face bc wide, total height L (mm)
  // Chords add t on each side — keep proportional
  const contentW = inp.bc + 2 * t_mm;
  const scale    = Math.min(availW / contentW, availH / inp.L);

  const t_px  = t_mm * scale;
  const bc_px = inp.bc * scale;
  const L_px  = inp.L  * scale;
  const s_px  = inp.s  * scale;
  const lp_px = Math.max(inp.lp * scale, 3);  // min 3px visible

  // Center horizontally in the available zone
  const drawX = offsetX + leftM + (availW - (bc_px + 2 * t_px)) / 2;
  const drawY = topM + (availH - L_px) / 2;

  // Key x/y coordinates
  const lChordX  = drawX;               // outer face of left chord
  const colX     = drawX + t_px;        // left face of RC column
  const colRX    = colX + bc_px;        // right face of RC column
  const rChordRX = colRX + t_px;        // outer face of right chord
  const midX     = (lChordX + rChordRX) / 2;
  const topY     = drawY;
  const botY     = drawY + L_px;

  // Battens (capped at 20 for readability)
  const nBattens  = Math.min(Math.floor(inp.L / inp.s) + 1, 20);
  const sValid    = result.valid;

  // Status colors
  const globalUtil = result.valid
    ? result.checks.find((ch) => ch.id === 'pandeo-global')?.utilization ?? 0
    : 0;
  const chordColor  = result.valid ? statusColor(globalUtil, c) : c.stateNeutral;
  const battenColor = sValid ? c.accent : c.stateNeutral;

  // s annotation tick positions (between first two battens)
  const s_y1 = topY;
  const s_y2 = topY + s_px;
  const s_mid = (s_y1 + s_y2) / 2;

  return (
    <g>
      {/* ── RC column body (hatched look) ─────────────────────────────────── */}
      <defs>
        <clipPath id="col-clip">
          <rect x={colX} y={topY} width={bc_px} height={L_px} />
        </clipPath>
      </defs>
      <rect x={colX} y={topY} width={bc_px} height={L_px}
        fill={c.surface} stroke={c.border} strokeWidth={1} />
      {/* subtle diagonal hatch lines to indicate concrete */}
      <g clipPath="url(#col-clip)" opacity={0.5}>
        {Array.from({ length: Math.ceil((bc_px + L_px) / 10) }, (_, i) => {
          const d = i * 10;
          return (
            <line key={i}
              x1={colX + d} y1={topY}
              x2={colX} y2={topY + d}
              stroke={c.border} strokeWidth={0.4}
            />
          );
        })}
      </g>

      {/* ── Left chord (L-angle, full height) ────────────────────────────── */}
      <rect x={lChordX} y={topY} width={t_px} height={L_px}
        fill={chordColor} stroke="none" opacity={0.85} />

      {/* ── Right chord ───────────────────────────────────────────────────── */}
      <rect x={colRX} y={topY} width={t_px} height={L_px}
        fill={chordColor} stroke="none" opacity={0.85} />

      {/* ── Batten plates ─────────────────────────────────────────────────── */}
      {Array.from({ length: nBattens }, (_, i) => {
        const cy = topY + (i / Math.max(nBattens - 1, 1)) * L_px;
        return (
          <rect
            key={i}
            x={lChordX} y={cy - lp_px / 2}
            width={bc_px + 2 * t_px} height={lp_px}
            fill={battenColor} stroke="none" opacity={0.9}
          />
        );
      })}

      {/* ── Top fixture — collar (biempotrado) ───────────────────────────── */}
      <rect x={lChordX - 4} y={topY - 5} width={bc_px + 2 * t_px + 8} height={5}
        fill={c.border} stroke="none" />
      {/* fixed wall hatch at top */}
      {[-8, -4, 0, 4, 8].map((dx) => (
        <line key={dx}
          x1={midX + dx} y1={topY - 5}
          x2={midX + dx - 4} y2={topY - 10}
          stroke={c.border} strokeWidth={1} />
      ))}

      {/* ── Bottom fixture — base plate (biempotrado) ────────────────────── */}
      <rect x={lChordX - 4} y={botY} width={bc_px + 2 * t_px + 8} height={5}
        fill={c.border} stroke="none" />
      {/* ground hatch */}
      {[-8, -4, 0, 4, 8].map((dx) => (
        <line key={dx}
          x1={midX + dx} y1={botY + 5}
          x2={midX + dx + 4} y2={botY + 10}
          stroke={c.border} strokeWidth={1} />
      ))}

      {/* ── N axial force arrow ───────────────────────────────────────────── */}
      <g opacity={N_arrow_opacity(inp.N_Ed)}>
        <line x1={midX} y1={topY - 18} x2={midX} y2={topY - 5}
          stroke={c.accent} strokeWidth={1.5} />
        <polygon
          points={`${midX - 3},${topY - 8} ${midX + 3},${topY - 8} ${midX},${topY - 5}`}
          fill={c.accent}
        />
        <text x={midX + 5} y={topY - 13} fontSize={8} fill={c.accent} fontFamily="monospace">N</text>
      </g>

      {/* ── L dimension (left side) ───────────────────────────────────────── */}
      <line x1={lChordX - 6} y1={topY} x2={lChordX - 6} y2={botY}
        stroke={c.textSecondary} strokeWidth={0.7} />
      <line x1={lChordX - 9} y1={topY} x2={lChordX - 3} y2={topY}
        stroke={c.textSecondary} strokeWidth={0.7} />
      <line x1={lChordX - 9} y1={botY} x2={lChordX - 3} y2={botY}
        stroke={c.textSecondary} strokeWidth={0.7} />
      <text
        x={lChordX - 8} y={(topY + botY) / 2}
        textAnchor="middle" fontSize={7} fill={c.textSecondary} fontFamily="monospace"
        transform={`rotate(-90, ${lChordX - 8}, ${(topY + botY) / 2})`}
      >
        L={inp.L}
      </text>

      {/* ── s spacing annotation (right side, between first two battens) ──── */}
      {nBattens >= 2 && sValid && (
        <g>
          <line x1={rChordRX + 5} y1={s_y1} x2={rChordRX + 5} y2={s_y2}
            stroke={c.textSecondary} strokeWidth={0.7} />
          <line x1={rChordRX + 2} y1={s_y1} x2={rChordRX + 8} y2={s_y1}
            stroke={c.textSecondary} strokeWidth={0.7} />
          <line x1={rChordRX + 2} y1={s_y2} x2={rChordRX + 8} y2={s_y2}
            stroke={c.textSecondary} strokeWidth={0.7} />
          <text x={rChordRX + 11} y={s_mid + 3} fontSize={7} fill={c.textSecondary} fontFamily="monospace">
            s={inp.s}
          </text>
          {/* lp annotation on a batten */}
          {lp_px > 5 && (
            <text x={rChordRX + 11} y={s_mid + 12} fontSize={6} fill={c.textDisabled} fontFamily="monospace">
              lp={inp.lp}
            </text>
          )}
        </g>
      )}
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function EmpresalladoSvg({ inp, result, mode, width, height }: EmpresalladoSvgProps) {
  const c = colors(mode);
  const panelW = Math.floor(width / 2);
  const panelH = height;

  return (
    <svg
      width={width} height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Sección transversal y alzado empresillado"
    >
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={c.accent} />
        </marker>
      </defs>

      {/* Background */}
      {mode === 'pdf' && <rect width={width} height={height} fill={c.bg} />}

      {/* Panel divider */}
      <line x1={panelW} y1={4} x2={panelW} y2={panelH - 4} stroke={c.border} strokeWidth={0.5} strokeDasharray="4 3" />

      {/* Left: cross-section */}
      <CrossSection inp={inp} result={result} c={c} panelW={panelW} panelH={panelH} />

      {/* Right: elevation */}
      <Elevation inp={inp} result={result} c={c} panelW={panelW} panelH={panelH} offsetX={panelW} />

      {/* Panel labels */}
      <text x={panelW / 2} y={10} textAnchor="middle" fontSize={8} fill={c.textDisabled} fontFamily="monospace">
        SECCIÓN
      </text>
      <text x={panelW + panelW / 2} y={10} textAnchor="middle" fontSize={8} fill={c.textDisabled} fontFamily="monospace">
        ALZADO
      </text>
    </svg>
  );
}
