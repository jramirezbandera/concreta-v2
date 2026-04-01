// Retaining wall section SVG — elevation view (per unit width).
// mode='screen': dark theme CSS custom properties
// mode='pdf':    grayscale inline styles

import { type RetainingWallInputs } from '../../data/defaults';
import { type RetainingWallResult } from '../../lib/calculations/retainingWall';

interface RetainingWallSVGProps {
  inp: RetainingWallInputs;
  result: RetainingWallResult;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

const SCREEN_COLORS = {
  concrete:      '#334155',
  concreteFill:  '#1e293b',
  soil:          '#78716c',
  soilFill:      '#292524',
  earthPressure: '#94a3b8',
  hydro:         '#7dd3fc',
  seismic:       '#fcd34d',
  reaction:      '#22c55e',
  passive:       '#a78bfa',
  weight:        '#94a3b8',
  dim:           '#475569',
  nfLine:        '#7dd3fc',
  pivot:         '#38bdf8',
  text:          '#94a3b8',
};

const PDF_COLORS = {
  concrete:      '#000000',
  concreteFill:  '#f0f0f0',
  soil:          '#888888',
  soilFill:      '#e8e8e8',
  earthPressure: '#444444',
  hydro:         '#888888',
  seismic:       '#666666',
  reaction:      '#222222',
  passive:       '#666666',
  weight:        '#444444',
  dim:           '#888888',
  nfLine:        '#888888',
  pivot:         '#000000',
  text:          '#666666',
};

function Arrow({
  x1, y1, x2, y2, color, strokeWidth, headLen = 6,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; strokeWidth: number; headLen?: number;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return null;
  const ux = dx / len;
  const uy = dy / len;
  // Arrowhead at (x2,y2) pointing in (ux,uy) direction
  const hx = x2 - ux * headLen;
  const hy = y2 - uy * headLen;
  const px = -uy * headLen * 0.35;
  const py = ux * headLen * 0.35;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeWidth} />
      <polygon
        points={`${x2},${y2} ${hx + px},${hy + py} ${hx - px},${hy - py}`}
        fill={color}
      />
    </g>
  );
}

export function RetainingWallSVG({
  inp,
  result,
  mode = 'screen',
  width = 420,
  height = 480,
}: RetainingWallSVGProps) {
  const isPdf  = mode === 'pdf';
  const colors = isPdf ? PDF_COLORS : SCREEN_COLORS;
  const sw     = isPdf ? 1.0 : 0.75;   // base strokeWidth
  const fs     = isPdf ? 7   : 8;       // base font size

  const H_m    = inp.H      as number;
  const hf_m   = inp.hf     as number;
  const tF_m   = inp.tFuste as number;
  const bP_m   = inp.bPunta as number;
  const bT_m   = inp.bTalon as number;
  const hw_m   = inp.hw     as number;
  const H_total = H_m + hf_m;
  const B_m     = bP_m + tF_m + bT_m;

  const margin = { top: 50, bottom: 60, left: 60, right: 80 };
  const drawW  = width  - margin.left - margin.right;
  const drawH  = height - margin.top  - margin.bottom;

  const scaleX  = B_m > 0     ? drawW / B_m     : 60;
  const scaleY  = H_total > 0 ? drawH / H_total : 60;
  const scale   = Math.min(scaleX, scaleY);

  // Center geometry horizontally
  const offsetX = (drawW - B_m * scale) / 2;
  const ox = margin.left + offsetX;
  const oy = margin.top;

  // Key pixel coordinates
  const x_toe        = ox;
  const x_stem_left  = ox + bP_m * scale;
  const x_stem_right = ox + (bP_m + tF_m) * scale;
  const x_heel       = ox + B_m * scale;
  const y_top        = oy;
  const y_fuste_base = oy + H_m * scale;
  const y_base       = oy + H_total * scale;
  const y_nf         = oy + hw_m * scale;

  const hasWater = hw_m < H_total;
  const hasSeismic = (inp.kh as number) > 0;

  const cover_m   = inp.cover as number;
  const hasFvInt  = result.valid && result.As_prov_fv_int > 0;
  const hasFvExt  = result.valid && result.As_prov_fv_ext > 0;
  const hasFh     = result.valid && result.As_prov_fh > 0;
  const hasZs     = result.valid && result.As_prov_zs > 0;
  const hasZi     = result.valid && result.As_prov_zi > 0;

  // Arrow sizing — proportional to pressure
  const Ka    = result.valid ? result.Ka : 0.333;
  const p_ref = Ka * (inp.gammaSuelo as number) * H_total + Ka * (inp.q as number);
  const arrowMaxPx = Math.min(bP_m * scale * 0.9, 55);

  // N arrow rows for earth pressure (evenly spaced over stem height)
  const N_arrows = 10;
  const earthArrows: Array<{ y: number; len: number }> = [];
  for (let i = 0; i < N_arrows; i++) {
    const z = (H_m * i) / (N_arrows - 1);  // depth from top of wall (m)
    const h_dry = Math.min(hw_m, H_total);
    const gamma_sub = (inp.gammaSat as number) - 10;
    let p: number;
    if (z <= h_dry) {
      p = Ka * (inp.gammaSuelo as number) * z + Ka * (inp.q as number);
    } else {
      const z_sub = z - h_dry;
      p = Ka * (inp.gammaSuelo as number) * h_dry + Ka * gamma_sub * z_sub + Ka * (inp.q as number);
    }
    const len = p_ref > 0 ? (p / p_ref) * arrowMaxPx : 0;
    earthArrows.push({ y: oy + z * scale, len });
  }

  // Hydrostatic arrows (if water)
  const N_hydro = 6;
  const hydroArrows: Array<{ y: number; len: number }> = [];
  if (hasWater) {
    const h_wet_total = H_total - Math.min(hw_m, H_total);
    const ew_ref = 10 * h_wet_total;
    for (let i = 0; i < N_hydro; i++) {
      const z_w = (h_wet_total * i) / (N_hydro - 1);
      const p_w = 10 * z_w;
      const len = ew_ref > 0 ? (p_w / ew_ref) * (arrowMaxPx * 0.5) : 0;
      hydroArrows.push({
        y: Math.min(hw_m, H_total) * scale + oy + z_w * scale,
        len,
      });
    }
  }

  // Upward soil reaction — trapezoidal polygon at footing base
  const sig_max  = result.valid ? result.sigma_max : 0;
  const sig_min  = result.valid ? result.sigma_min  : 0;
  const a_eff    = result.valid
    ? (result.e <= B_m / 6 ? B_m : Math.max(3 * (B_m / 2 - result.e), 0))
    : B_m;
  const reactionMaxPx = Math.min(hf_m * scale * 0.8, 30);
  const sig_ref  = Math.max(sig_max, 1);
  const r_max_px = reactionMaxPx;
  const r_min_px = (sig_min / sig_ref) * reactionMaxPx;
  // Reaction polygon: from (x_toe, y_base) clockwise
  const rx1 = x_toe;
  const rx2 = x_toe + a_eff * scale;
  const reactionPoly = `${rx1},${y_base} ${rx2},${y_base} ${rx2},${y_base - r_min_px} ${rx1},${y_base - r_max_px}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Sección transversal muro de contención"
      role="img"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <title>Muro de contención — sección transversal</title>

      {/* Hatch pattern for soil */}
      <defs>
        <pattern id="soilHatch" patternUnits="userSpaceOnUse" width="8" height="8">
          <line x1="0" y1="8" x2="8" y2="0" stroke={colors.soil} strokeWidth={0.75} opacity={0.5} />
        </pattern>
      </defs>

      {/* ── Soil fill on heel (behind stem) ── */}
      <rect
        x={x_stem_right} y={y_top}
        width={x_heel - x_stem_right} height={y_fuste_base - y_top}
        fill={colors.soilFill}
      />
      <rect
        x={x_stem_right} y={y_top}
        width={x_heel - x_stem_right} height={y_fuste_base - y_top}
        fill="url(#soilHatch)"
      />

      {/* ── Upward soil reaction ── */}
      {result.valid && sig_max > 0 && (
        <polygon
          points={reactionPoly}
          fill={colors.reaction}
          opacity={0.25}
        />
      )}
      {result.valid && sig_max > 0 && (
        <line
          x1={rx1} y1={y_base - r_max_px}
          x2={rx2} y2={y_base - r_min_px}
          stroke={colors.reaction}
          strokeWidth={sw}
          opacity={0.8}
        />
      )}

      {/* ── Earth pressure arrows (horizontal, pointing left) ── */}
      {earthArrows.map((a, i) => (
        a.len > 1 && (
          <Arrow
            key={`ea-${i}`}
            x1={x_stem_right - a.len} y1={a.y}
            x2={x_stem_right}         y2={a.y}
            color={colors.earthPressure} strokeWidth={sw} headLen={5}
          />
        )
      ))}

      {/* ── Hydrostatic arrows ── */}
      {hydroArrows.map((a, i) => (
        a.len > 1 && (
          <Arrow
            key={`hw-${i}`}
            x1={x_stem_right - a.len} y1={a.y}
            x2={x_stem_right}         y2={a.y}
            color={colors.hydro} strokeWidth={sw} headLen={4}
          />
        )
      ))}

      {/* ── Seismic increment (dashed amber triangle) ── */}
      {hasSeismic && result.valid && result.KAD !== undefined && (
        <polygon
          points={`${x_stem_right},${y_top} ${x_stem_right - arrowMaxPx * 0.4},${y_fuste_base} ${x_stem_right},${y_fuste_base}`}
          fill={colors.seismic}
          fillOpacity={0.12}
          stroke={colors.seismic}
          strokeWidth={sw}
          strokeDasharray="4 3"
          strokeOpacity={0.6}
        />
      )}

      {/* ── Passive resistance arrow (at toe level) ── */}
      <Arrow
        x1={x_toe} y1={y_fuste_base + hf_m * scale * 0.5}
        x2={x_toe + Math.min(tF_m * scale * 0.5, 20)} y2={y_fuste_base + hf_m * scale * 0.5}
        color={colors.passive} strokeWidth={sw + 0.25} headLen={6}
      />

      {/* ── NF water level ── */}
      {hasWater && hw_m * scale < (y_fuste_base - y_top) && (
        <>
          <line
            x1={x_stem_right} y1={y_nf}
            x2={x_heel}       y2={y_nf}
            stroke={colors.nfLine}
            strokeWidth={sw}
            strokeDasharray="5 3"
            opacity={0.8}
          />
          <text
            x={x_heel + 4} y={y_nf + 3}
            fontSize={fs - 1} fill={colors.nfLine}
            fontFamily="monospace"
          >
            NF
          </text>
        </>
      )}

      {/* ── Footing (zapata) ── */}
      <rect
        x={x_toe} y={y_fuste_base}
        width={x_heel - x_toe} height={y_base - y_fuste_base}
        fill={colors.concreteFill}
        stroke={colors.concrete}
        strokeWidth={sw + 0.5}
      />

      {/* ── Stem (fuste) ── */}
      <rect
        x={x_stem_left} y={y_top}
        width={x_stem_right - x_stem_left} height={y_fuste_base - y_top}
        fill={colors.concreteFill}
        stroke={colors.concrete}
        strokeWidth={sw + 0.5}
      />

      {/* ── Rebar indicator lines (dashed, at cover depth) ── */}
      {/* fv_int — trasdós (right face of stem, inside at cover) */}
      {hasFvInt && (
        <line
          x1={x_stem_right - cover_m * scale} y1={y_top + 4}
          x2={x_stem_right - cover_m * scale} y2={y_fuste_base - 4}
          stroke={isPdf ? '#555555' : '#38bdf8'}
          strokeWidth={sw + 0.5}
          strokeDasharray="4 3"
          opacity={0.7}
        />
      )}
      {/* fv_ext — intradós (left face of stem, inside at cover) */}
      {hasFvExt && (
        <line
          x1={x_stem_left + cover_m * scale} y1={y_top + 4}
          x2={x_stem_left + cover_m * scale} y2={y_fuste_base - 4}
          stroke={isPdf ? '#555555' : '#38bdf8'}
          strokeWidth={sw + 0.5}
          strokeDasharray="4 3"
          opacity={0.5}
        />
      )}
      {/* fh — horizontal (mid-stem, short horizontal dash) */}
      {hasFh && (
        <line
          x1={x_stem_left + cover_m * scale}     y1={(y_top + y_fuste_base) / 2}
          x2={x_stem_right - cover_m * scale}    y2={(y_top + y_fuste_base) / 2}
          stroke={isPdf ? '#555555' : '#38bdf8'}
          strokeWidth={sw}
          strokeDasharray="3 4"
          opacity={0.5}
        />
      )}
      {/* zs — zapata superior / talón (top face of footing, inside at cover) */}
      {hasZs && (
        <line
          x1={x_stem_right + 3}            y1={y_fuste_base + cover_m * scale}
          x2={x_heel - 3}                  y2={y_fuste_base + cover_m * scale}
          stroke={isPdf ? '#555555' : '#38bdf8'}
          strokeWidth={sw + 0.5}
          strokeDasharray="4 3"
          opacity={0.7}
        />
      )}
      {/* zi — zapata inferior / punta (bottom face of footing, inside at cover) */}
      {hasZi && (
        <line
          x1={x_toe + 3}                   y1={y_base - cover_m * scale}
          x2={x_stem_left - 3}             y2={y_base - cover_m * scale}
          stroke={isPdf ? '#555555' : '#38bdf8'}
          strokeWidth={sw + 0.5}
          strokeDasharray="4 3"
          opacity={0.7}
        />
      )}

      {/* ── Weight arrows (downward) ── */}
      {/* W_fuste */}
      <Arrow
        x1={(x_stem_left + x_stem_right) / 2} y1={y_top + (y_fuste_base - y_top) * 0.3}
        x2={(x_stem_left + x_stem_right) / 2} y2={y_top + (y_fuste_base - y_top) * 0.6}
        color={colors.weight} strokeWidth={sw} headLen={5}
      />
      {/* W_zap */}
      <Arrow
        x1={(x_toe + x_heel) / 2} y1={y_fuste_base + 3}
        x2={(x_toe + x_heel) / 2} y2={y_base - 5}
        color={colors.weight} strokeWidth={sw} headLen={4}
      />
      {/* W_heel soil */}
      {bT_m > 0 && (
        <Arrow
          x1={(x_stem_right + x_heel) / 2} y1={y_top + (y_fuste_base - y_top) * 0.25}
          x2={(x_stem_right + x_heel) / 2} y2={y_top + (y_fuste_base - y_top) * 0.55}
          color={colors.weight} strokeWidth={sw} headLen={5}
        />
      )}

      {/* ── Moment origin pivot dot ── */}
      <circle
        cx={x_toe} cy={y_base}
        r={3.5}
        fill={colors.pivot}
        opacity={0.9}
      />

      {/* ── Dimension annotations ── */}
      {/* H — left of stem */}
      <line x1={x_stem_left - 12} y1={y_top} x2={x_stem_left - 12} y2={y_fuste_base} stroke={colors.dim} strokeWidth={sw * 0.7} />
      <line x1={x_stem_left - 15} y1={y_top}        x2={x_stem_left - 9} y2={y_top}        stroke={colors.dim} strokeWidth={sw * 0.7} />
      <line x1={x_stem_left - 15} y1={y_fuste_base} x2={x_stem_left - 9} y2={y_fuste_base} stroke={colors.dim} strokeWidth={sw * 0.7} />
      <text
        x={x_stem_left - 22} y={(y_top + y_fuste_base) / 2 + 3}
        fontSize={fs} fill={colors.text} textAnchor="middle"
        fontFamily="monospace"
        transform={`rotate(-90, ${x_stem_left - 22}, ${(y_top + y_fuste_base) / 2 + 3})`}
      >
        H
      </text>

      {/* hf — left of footing */}
      <line x1={x_toe - 12} y1={y_fuste_base} x2={x_toe - 12} y2={y_base} stroke={colors.dim} strokeWidth={sw * 0.7} />
      <line x1={x_toe - 15} y1={y_fuste_base} x2={x_toe - 9} y2={y_fuste_base} stroke={colors.dim} strokeWidth={sw * 0.7} />
      <line x1={x_toe - 15} y1={y_base}       x2={x_toe - 9} y2={y_base}       stroke={colors.dim} strokeWidth={sw * 0.7} />
      <text
        x={x_toe - 22} y={(y_fuste_base + y_base) / 2 + 3}
        fontSize={fs} fill={colors.text} textAnchor="middle"
        fontFamily="monospace"
        transform={`rotate(-90, ${x_toe - 22}, ${(y_fuste_base + y_base) / 2 + 3})`}
      >
        hf
      </text>

      {/* B total — below footing */}
      <line x1={x_toe}  y1={y_base + 14} x2={x_heel} y2={y_base + 14} stroke={colors.dim} strokeWidth={sw * 0.7} />
      <line x1={x_toe}  y1={y_base + 11} x2={x_toe}  y2={y_base + 17} stroke={colors.dim} strokeWidth={sw * 0.7} />
      <line x1={x_heel} y1={y_base + 11} x2={x_heel} y2={y_base + 17} stroke={colors.dim} strokeWidth={sw * 0.7} />
      <text
        x={(x_toe + x_heel) / 2} y={y_base + 26}
        fontSize={fs} fill={colors.text} textAnchor="middle" fontFamily="monospace"
      >
        B = {B_m.toFixed(2)} m
      </text>

      {/* bPunta label */}
      {bP_m > 0 && (
        <text
          x={(x_toe + x_stem_left) / 2} y={y_base + 8}
          fontSize={fs - 1} fill={colors.dim} textAnchor="middle" fontFamily="monospace"
        >
          bP
        </text>
      )}

      {/* bTalon label */}
      {bT_m > 0 && (
        <text
          x={(x_stem_right + x_heel) / 2} y={y_base + 8}
          fontSize={fs - 1} fill={colors.dim} textAnchor="middle" fontFamily="monospace"
        >
          bT
        </text>
      )}

      {/* Section labels */}
      {bP_m * scale > 20 && (
        <text
          x={(x_stem_left + x_stem_right) / 2} y={y_top - 6}
          fontSize={fs - 1} fill={colors.text} textAnchor="middle" fontFamily="monospace"
        >
          e = {result.valid ? result.e.toFixed(2) : '—'} m
        </text>
      )}
    </svg>
  );
}
