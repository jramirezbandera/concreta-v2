// RC Column cross-section SVG — biaxial bending.
// Shows corner bars + face bars with independent diameters.
// Neutral axis line (x_star_y — primary y-axis bending).
// Annotations: text-only in top area (no arrow shapes).
//
// mode='screen': dark theme colors
// mode='pdf':    grayscale + white background

import { type RCColumnInputs } from '../../data/defaults';
import { type RCColumnResult } from '../../lib/calculations/rcColumns';

interface RCColumnsSVGProps {
  inp: RCColumnInputs;
  result: RCColumnResult;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

const SCREEN_COLORS = {
  section:     '#334155',
  sectionFill: '#1e293b',
  rebarCorner: '#38bdf8',   // accent — corner bars
  rebarFaceX:  '#38bdf8',   // top/bottom face bars (same accent, slightly smaller)
  rebarFaceY:  '#64748b',   // left/right face bars (dimmed — side bars for y-axis)
  stirrup:     '#94a3b8',
  stressBlock: '#38bdf8',
  axis:        '#38bdf8',
  dim:         '#94a3b8',
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

  const MEdy_str = result.valid ? `MEdy=${inp.MEdy}kNm` : '';
  const MEdz_str = result.valid ? `MEdz=${inp.MEdz}kNm` : '';

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
