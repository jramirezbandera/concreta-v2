// RC Column cross-section SVG — biaxial bending.
// Shows corner bars + face bars with independent diameters.
// Neutral axis line (x_star_y — primary y-axis bending).
// Annotations: text-only in top area (no arrow shapes).
//
// mode='screen': dark theme colors
// mode='pdf':    grayscale + white background

import { type RCColumnInputs } from '../../data/defaults';
import { type RCColumnResult } from '../../lib/calculations/rcColumns';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';
import type { UnitSystem } from '../../lib/units/types';

interface RCColumnsSVGProps {
  inp: RCColumnInputs;
  result: RCColumnResult;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

// Screen palette via theme tokens (dark values match the old literals exactly).
const SCREEN_COLORS = {
  section:     'var(--color-chart-section)',       // #334155
  sectionFill: 'var(--color-chart-section-fill)',  // #1e293b
  rebarCorner: 'var(--color-chart-rebar)',         // #38bdf8 — corner bars
  rebarFaceX:  'var(--color-chart-rebar)',         // #38bdf8 — top/bottom face bars
  rebarFaceY:  'var(--color-chart-rebar-faint)',   // #64748b — side bars (dimmed)
  stirrup:     'var(--color-chart-stirrup)',       // #94a3b8
  stressBlock: 'var(--color-chart-stress)',        // #38bdf8
  axis:        'var(--color-chart-axis)',          // #38bdf8
  dim:         'var(--color-chart-dim)',           // #94a3b8
  bg:          'transparent',
};

const PDF_COLORS = {
  section:     '#334155',
  sectionFill: '#f1f5f9',
  rebarCorner: '#0ea5e9',
  rebarFaceX:  '#38bdf8',
  rebarFaceY:  '#94a3b8',
  stirrup:     '#64748b',
  stressBlock: '#38bdf8',
  axis:        '#0ea5e9',
  dim:         '#64748b',
  bg:          '#ffffff',
};

export function RCColumnsSVG({
  inp,
  result,
  mode = 'screen',
  width = 280,
  height = 320,
}: RCColumnsSVGProps) {
  const isPdf = mode === 'pdf';
  const colors = isPdf ? PDF_COLORS : SCREEN_COLORS;
  const { system } = useUnitSystem();

  if ((inp.sectionType ?? 'rectangular') === 'circular') {
    return (
      <RCColumnsCircularSVG
        inp={inp} result={result} colors={colors} isPdf={isPdf}
        width={width} height={height} system={system}
      />
    );
  }

  const { b, h, cover, stirrupDiam, cornerBarDiam, nBarsX, barDiamX, nBarsY, barDiamY } = inp;

  // Margins: top for annotations, bottom for b label, left for N label, right for h label
  const margin = { top: 44, bottom: 32, left: 52, right: 36 };
  const drawW = width - margin.left - margin.right;
  const drawH = height - margin.top - margin.bottom;

  const scale = Math.min(drawW / b, drawH / h);
  const sw = b * scale;
  const sh = h * scale;

  const sx = margin.left + (drawW - sw) / 2;
  const sy = margin.top + (drawH - sh) / 2;

  const secY = (mmY: number) => sy + mmY * scale;
  const secX = (mmX: number) => sx + mmX * scale;

  // Stirrup rectangle
  const stX = sx + cover * scale;
  const stY = sy + cover * scale;
  const stW = sw - 2 * cover * scale;
  const stH = sh - 2 * cover * scale;

  // Bar radii (min 2px, max 8px)
  const cornerR = Math.min(Math.max((cornerBarDiam / 2) * scale, 2), 8);
  const faceXR  = nBarsX > 0 ? Math.min(Math.max((barDiamX / 2) * scale, 2), 7) : 0;
  const faceYR  = nBarsY > 0 ? Math.min(Math.max((barDiamY / 2) * scale, 2), 7) : 0;

  // Corner positions (4 corners)
  const d_prime = cover + stirrupDiam + cornerBarDiam / 2;
  const d_y     = h - cover - stirrupDiam - cornerBarDiam / 2;
  const d_z     = b - cover - stirrupDiam - cornerBarDiam / 2;

  const cornerXs = [secX(d_prime), secX(d_z)];
  const cornerYs = [secY(d_prime), secY(d_y)];

  // Top/bottom face bars (nBarsX per face, evenly spaced between corners)
  function faceXBarPositions(): number[] {
    if (nBarsX === 0) return [];
    return Array.from({ length: nBarsX }, (_, i) =>
      secX(d_prime + (i + 1) * (b - 2 * d_prime) / (nBarsX + 1))
    );
  }

  // Left/right face bars (nBarsY per face)
  function faceYBarPositions(): number[] {
    if (nBarsY === 0) return [];
    return Array.from({ length: nBarsY }, (_, i) =>
      secY(d_prime + (i + 1) * (h - 2 * d_prime) / (nBarsY + 1))
    );
  }

  const faceXPositions = faceXBarPositions();
  const faceYPositions = faceYBarPositions();

  // Neutral axis (x_star_y — y-axis primary bending)
  const x_star_y = result.valid ? result.x_star_y : 0;
  const naY = result.valid ? secY(x_star_y) : sy;
  const naVisible = result.valid && x_star_y > 0 && x_star_y < h;

  // Whitney stress block
  const blockH = result.valid ? Math.min(0.8 * x_star_y * scale, sh) : 0;

  // Lambda + moment text
  const lambdaStr = result.valid
    ? `\u03bby=${result.lambda_y.toFixed(0)}  \u03bbz=${result.lambda_z.toFixed(0)}`
    : '';
  const isSlender = result.valid && (result.lambda_y > 25 || result.lambda_z > 25);
  const slenderTag = isSlender ? 'ESBELTA' : 'CORTA';

  const MEdy_str = result.valid ? `MEdy=${formatQuantity(inp.MEdy as number, 'moment', system)}` : '';
  const MEdz_str = result.valid ? `MEdz=${formatQuantity(inp.MEdz as number, 'moment', system)}` : '';

  const fontSize = isPdf ? 9 : Math.max(8, Math.min(11, width / 28));
  const smallFont = Math.max(7, fontSize - 1.5);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: colors.bg }}
      aria-label="Diagrama de pilar — sección transversal"
    >
      {/* Whitney stress block */}
      {result.valid && blockH > 0 && (
        <rect
          x={sx}
          y={sy}
          width={sw}
          height={blockH}
          fill={colors.stressBlock}
          fillOpacity={0.18}
        />
      )}

      {/* Section rectangle */}
      <rect
        x={sx} y={sy} width={sw} height={sh}
        fill={colors.sectionFill}
        stroke={colors.section}
        strokeWidth={isPdf ? 1.2 : 1.5}
      />

      {/* Stirrup */}
      <rect
        x={stX} y={stY} width={stW} height={stH}
        fill="none"
        stroke={colors.stirrup}
        strokeWidth={Math.max(0.8, stirrupDiam * scale * 0.3)}
        strokeLinejoin="round"
      />

      {/* Neutral axis dashed line */}
      {naVisible && (
        <line
          x1={sx - 6} y1={naY} x2={sx + sw + 6} y2={naY}
          stroke={colors.axis}
          strokeWidth={isPdf ? 0.8 : 1}
          strokeDasharray="5 3"
        />
      )}
      {naVisible && (
        <text x={sx + sw + 8} y={naY + 3}
          fill={colors.axis} fontSize={smallFont} fontFamily="monospace">
          FN
        </text>
      )}

      {/* Left/right face bars (faceY — side bars, dimmed) — drawn behind corners */}
      {faceYPositions.map((cy, i) => (
        <g key={`fy-${i}`}>
          <circle cx={secX(d_prime)} cy={cy} r={faceYR}
            fill={colors.rebarFaceY} stroke={colors.section} strokeWidth={0.5} />
          <circle cx={secX(d_z)} cy={cy} r={faceYR}
            fill={colors.rebarFaceY} stroke={colors.section} strokeWidth={0.5} />
        </g>
      ))}

      {/* Top/bottom face bars (faceX) */}
      {faceXPositions.map((cx, i) => (
        <g key={`fx-${i}`}>
          <circle cx={cx} cy={secY(d_prime)} r={faceXR}
            fill={colors.rebarFaceX} stroke={colors.section} strokeWidth={0.5} />
          <circle cx={cx} cy={secY(d_y)} r={faceXR}
            fill={colors.rebarFaceX} stroke={colors.section} strokeWidth={0.5} />
        </g>
      ))}

      {/* Corner bars (always 4) */}
      {cornerXs.map((cx, xi) =>
        cornerYs.map((cy, yi) => (
          <circle key={`c-${xi}-${yi}`}
            cx={cx} cy={cy} r={cornerR}
            fill={colors.rebarCorner}
            stroke={colors.section}
            strokeWidth={0.5}
          />
        ))
      )}

      {/* Dimension label: b (bottom) */}
      <text
        x={sx + sw / 2} y={sy + sh + 18}
        fill={colors.dim} fontSize={fontSize} fontFamily="sans-serif" textAnchor="middle"
      >
        b = {b} mm
      </text>

      {/* Dimension label: h (right) */}
      <text
        x={sx + sw + 16} y={sy + sh / 2}
        fill={colors.dim} fontSize={fontSize} fontFamily="sans-serif"
        textAnchor="start" dominantBaseline="middle"
      >
        h={h}
      </text>

      {/* N annotation (left) */}
      <text
        x={sx - 8} y={sy + sh / 2}
        fill={colors.dim} fontSize={smallFont} fontFamily="monospace"
        textAnchor="end" dominantBaseline="middle"
      >
        N={inp.Nd}kN
      </text>

      {/* Top annotations: λy/λz tag + MEdy/MEdz */}
      {result.valid && (
        <>
          <text
            x={sx + sw / 2} y={sy - 22}
            fill={colors.axis} fontSize={smallFont} fontFamily="monospace" textAnchor="middle"
          >
            {lambdaStr} — {slenderTag}
          </text>
          <text
            x={sx + sw / 2} y={sy - 9}
            fill={colors.dim} fontSize={smallFont} fontFamily="monospace" textAnchor="middle"
          >
            {MEdy_str}  {MEdz_str}
          </text>
        </>
      )}
    </svg>
  );
}

// ── Circular cross-section ───────────────────────────────────────────────────
// Círculo + cerco circular + n barras del anillo + cuerda de fibra neutra a
// 0.8·x_star (segmento de Whitney sombreado). Etiquetas: λ única y M_res.
function RCColumnsCircularSVG({
  inp, result, colors, isPdf, width, height, system,
}: {
  inp: RCColumnInputs;
  result: RCColumnResult;
  colors: typeof SCREEN_COLORS;
  isPdf: boolean;
  width: number;
  height: number;
  system: UnitSystem;
}) {
  const D = inp.D ?? 350;
  const { cover, stirrupDiam } = inp;
  const circBarDiam = inp.circBarDiam ?? 16;
  const n = inp.nBarsCirc ?? 6;

  const margin = { top: 44, bottom: 32, left: 36, right: 36 };
  const drawW = width - margin.left - margin.right;
  const drawH = height - margin.top - margin.bottom;
  const scale = Math.min(drawW, drawH) / D;
  const radius = (D / 2) * scale;
  const cx = margin.left + drawW / 2;
  const cy = margin.top + drawH / 2;
  const topY = cy - radius; // fibra más comprimida (arriba)

  const stirrupR = Math.max((D / 2 - cover) * scale, 1);
  const r_s = (D - 2 * cover - 2 * stirrupDiam - circBarDiam) / 2;
  const r_s_px = Math.max(r_s * scale, 0);
  const barR = Math.min(Math.max((circBarDiam / 2) * scale, 2), 8);

  // Posición de barras: θ=0 en la fibra superior (orientación simétrica D2).
  const bars = Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return { x: cx + r_s_px * Math.sin(t), y: cy - r_s_px * Math.cos(t) };
  });

  const x_star = result.valid ? (result.x_star ?? 0) : 0;
  const naVisible = result.valid && x_star > 0 && x_star < D;
  const naY = topY + x_star * scale;
  const blockH = result.valid ? Math.min(0.8 * x_star * scale, 2 * radius) : 0;

  const lambda = result.valid ? (result.lambda ?? 0) : 0;
  const slenderTag = lambda > 25 ? 'ESBELTA' : 'CORTA';
  const M_res_str = result.valid ? `M_res=${formatQuantity(result.M_res ?? 0, 'moment', system)}` : '';

  const fontSize = isPdf ? 9 : Math.max(8, Math.min(11, width / 28));
  const smallFont = Math.max(7, fontSize - 1.5);
  const clipId = `circ-clip-${isPdf ? 'pdf' : 'screen'}`;

  return (
    <svg
      width={width} height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: colors.bg }}
      aria-label="Diagrama de pilar circular — sección transversal"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={radius} />
        </clipPath>
      </defs>

      {/* Segmento comprimido (bloque de Whitney) — casquete recortado al círculo */}
      {result.valid && blockH > 0 && (
        <rect
          x={cx - radius} y={topY} width={2 * radius} height={blockH}
          fill={colors.stressBlock} fillOpacity={0.18}
          clipPath={`url(#${clipId})`}
        />
      )}

      {/* Sección circular */}
      <circle
        cx={cx} cy={cy} r={radius}
        fill={colors.sectionFill} stroke={colors.section}
        strokeWidth={isPdf ? 1.2 : 1.5}
      />

      {/* Cerco circular */}
      <circle
        cx={cx} cy={cy} r={stirrupR}
        fill="none" stroke={colors.stirrup}
        strokeWidth={Math.max(0.8, stirrupDiam * scale * 0.3)}
      />

      {/* Fibra neutra (cuerda) */}
      {naVisible && (
        <>
          <line
            x1={cx - radius - 6} y1={naY} x2={cx + radius + 6} y2={naY}
            stroke={colors.axis} strokeWidth={isPdf ? 0.8 : 1} strokeDasharray="5 3"
          />
          <text x={cx + radius + 8} y={naY + 3} fill={colors.axis} fontSize={smallFont} fontFamily="monospace">
            FN
          </text>
        </>
      )}

      {/* Barras del anillo */}
      {bars.map((p, i) => (
        <circle key={`cb-${i}`} cx={p.x} cy={p.y} r={barR}
          fill={colors.rebarCorner} stroke={colors.section} strokeWidth={0.5} />
      ))}

      {/* Dimensión D */}
      <text x={cx} y={cy + radius + 18} fill={colors.dim} fontSize={fontSize} fontFamily="sans-serif" textAnchor="middle">
        D = {D} mm
      </text>

      {/* N (izquierda) */}
      <text x={cx - radius - 8} y={cy} fill={colors.dim} fontSize={smallFont} fontFamily="monospace"
        textAnchor="end" dominantBaseline="middle">
        N={inp.Nd}kN
      </text>

      {/* Anotaciones superiores: λ + M_res */}
      {result.valid && (
        <>
          <text x={cx} y={margin.top - 22} fill={colors.axis} fontSize={smallFont} fontFamily="monospace" textAnchor="middle">
            λ={lambda.toFixed(0)} — {slenderTag}
          </text>
          <text x={cx} y={margin.top - 9} fill={colors.dim} fontSize={smallFont} fontFamily="monospace" textAnchor="middle">
            {M_res_str}
          </text>
        </>
      )}
    </svg>
  );
}
