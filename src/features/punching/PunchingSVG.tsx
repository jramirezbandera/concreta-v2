import { type PunchingInputs, type PunchingMode, type PunchingPosition } from '../../data/defaults';
import { type PunchingResult } from '../../lib/calculations/punching';

interface PunchingSVGProps {
  inp: PunchingInputs;
  result: PunchingResult;
  width: number;
  mode?: 'screen' | 'pdf';
}

// ── Plan view (top) ───────────────────────────────────────────────────────────
function PlanView({
  inp,
  result,
  size,
  svgMode,
}: {
  inp: PunchingInputs;
  result: PunchingResult;
  size: number;
  svgMode: 'screen' | 'pdf';
}) {
  const isPdf = svgMode === 'pdf';
  const cx = inp.cx as number;
  const cy = inp.cy as number;
  const d  = inp.d as number;
  const sr = inp.sr as number;
  const position = inp.position as PunchingPosition;
  const useCircular = (inp.isCircular as boolean) && position === 'interior';
  const hasShearReinf = inp.hasShearReinf as boolean;

  // Scale: fit the uout circle + column + margin
  const rOut = result.rOut;
  const maxRadius = Math.max(rOut + cx / 2 + cy / 2, 2 * d + cx / 2 + cy / 2) * 1.25;
  const scale = (size / 2 - 20) / maxRadius; // px per mm

  // Center of plan view
  const ox = size / 2;
  let oy = size / 2;
  // For borde/esquina, shift origin toward interior so edge lines show
  if (position === 'borde')   oy = size * 0.7;
  if (position === 'esquina') oy = size * 0.75;

  // Critical perimeter at 2d from column face
  const r_u1_rect_x = cx / 2 + 2 * d;
  const r_u1_rect_y = cy / 2 + 2 * d;

  // Loaded area dimensions in px
  const hcx = (cx / 2) * scale;
  const hcy = (cy / 2) * scale;
  const r_u1_px_x = r_u1_rect_x * scale;
  const r_u1_px_y = r_u1_rect_y * scale;
  const rOut_px = Math.max(rOut * scale, 0);

  // Color tokens
  const colArea    = isPdf ? '#cbd5e1'    : 'var(--color-bg-elevated, #263348)';
  const strokeArea = isPdf ? '#334155'    : 'var(--color-border-main, #334155)';
  const strokeU1   = isPdf ? '#0ea5e9'    : '#38bdf8'; // accent
  const strokeUout = isPdf ? '#64748b'    : '#64748b'; // text-secondary
  const strokeEdge = isPdf ? '#ef4444'    : '#ef4444'; // state-fail
  const textCol    = isPdf ? '#475569'    : '#94a3b8';
  const strokeSw   = isPdf ? '#94a3b8'    : '#475569'; // stirrups: softer than u1

  // Borde/esquina edge lines
  const edgeLines: React.ReactElement[] = [];
  if (position === 'borde' || position === 'esquina') {
    edgeLines.push(
      <line key="edge-top" x1={0} y1={oy} x2={size} y2={oy}
        stroke={strokeEdge} strokeWidth={1.5} strokeDasharray="5 3" />
    );
  }
  if (position === 'esquina') {
    edgeLines.push(
      <line key="edge-left" x1={ox} y1={0} x2={ox} y2={size}
        stroke={strokeEdge} strokeWidth={1.5} strokeDasharray="5 3" />
    );
  }

  // u1 perimeter shape
  const u1EllipseRx = r_u1_px_x;
  const u1EllipseRy = r_u1_px_y;

  // uout circle
  const showUout = rOut_px > 0 && rOut_px > hcx;

  // Stirrup grid lines (plan view, tipo viga, when hasShearReinf)
  const stirrupLines: React.ReactElement[] = [];
  if (hasShearReinf && sr > 0) {
    const srPx = sr * scale;
    const nRows = Math.min(Math.max(Math.floor(1.5 * d / sr), 1), 5);

    for (let n = 1; n <= nRows; n++) {
      const xOff = hcx + n * srPx;
      const yOff = hcy + n * srPx;

      // X-direction stirrups: vertical tick marks at ±xOff, spanning ±hcy
      // Right side (always)
      stirrupLines.push(
        <line key={`sx-r-${n}`}
          x1={ox + xOff} y1={oy - hcy}
          x2={ox + xOff} y2={oy + hcy}
          stroke={strokeSw} strokeWidth={1.5} strokeLinecap="round"
        />
      );
      // Left side (not for esquina)
      if (position !== 'esquina') {
        stirrupLines.push(
          <line key={`sx-l-${n}`}
            x1={ox - xOff} y1={oy - hcy}
            x2={ox - xOff} y2={oy + hcy}
            stroke={strokeSw} strokeWidth={1.5} strokeLinecap="round"
          />
        );
      }

      // Y-direction stirrups: horizontal tick marks at ±yOff, spanning ±hcx
      // Bottom side (always — toward slab interior)
      stirrupLines.push(
        <line key={`sy-b-${n}`}
          x1={ox - hcx} y1={oy + yOff}
          x2={ox + hcx} y2={oy + yOff}
          stroke={strokeSw} strokeWidth={1.5} strokeLinecap="round"
        />
      );
      // Top side (only for interior)
      if (position === 'interior') {
        stirrupLines.push(
          <line key={`sy-t-${n}`}
            x1={ox - hcx} y1={oy - yOff}
            x2={ox + hcx} y2={oy - yOff}
            stroke={strokeSw} strokeWidth={1.5} strokeLinecap="round"
          />
        );
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label="Vista en planta — punzonamiento"
    >
      {/* Background */}
      {!isPdf && (
        <rect width={size} height={size} fill="var(--color-bg-canvas, #0f172a)" />
      )}

      {/* Edge lines (borde/esquina) */}
      {edgeLines}

      {/* uout perimeter */}
      {showUout && (
        <ellipse
          cx={ox} cy={oy}
          rx={rOut_px} ry={rOut_px}
          fill="none"
          stroke={strokeUout}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}

      {/* u1 perimeter */}
      {useCircular ? (
        <ellipse
          cx={ox} cy={oy}
          rx={u1EllipseRx} ry={u1EllipseRx}
          fill="none"
          stroke={strokeU1}
          strokeWidth={1.5}
        />
      ) : (
        <rect
          x={ox - u1EllipseRx} y={oy - u1EllipseRy}
          width={u1EllipseRx * 2} height={u1EllipseRy * 2}
          rx={2 * d * scale}
          fill="none"
          stroke={strokeU1}
          strokeWidth={1.5}
        />
      )}

      {/* Stirrup grid (plan view tipo viga) */}
      {stirrupLines}

      {/* Loaded area */}
      {useCircular ? (
        <ellipse
          cx={ox} cy={oy}
          rx={hcx} ry={hcx}
          fill={colArea}
          stroke={strokeArea}
          strokeWidth={1}
        />
      ) : (
        <rect
          x={ox - hcx} y={oy - hcy}
          width={hcx * 2} height={hcy * 2}
          fill={colArea}
          stroke={strokeArea}
          strokeWidth={1}
        />
      )}

      {/* Label: u1 */}
      <text
        x={ox + u1EllipseRx + 4}
        y={oy - 4}
        fontSize={10}
        fontFamily="monospace"
        fill={strokeU1}
      >
        u1
      </text>

      {/* Label: uout */}
      {showUout && (
        <text
          x={ox + rOut_px + 4}
          y={oy + 12}
          fontSize={10}
          fontFamily="monospace"
          fill={textCol}
        >
          uout
        </text>
      )}

      {/* Cota: 2d annotation */}
      <line
        x1={ox + hcx} y1={oy}
        x2={ox + u1EllipseRx} y2={oy}
        stroke={strokeU1}
        strokeWidth={0.75}
        markerEnd="url(#arrow-u1)"
      />
      <text
        x={ox + hcx + (u1EllipseRx - hcx) / 2}
        y={oy - 5}
        fontSize={9}
        fontFamily="monospace"
        textAnchor="middle"
        fill={strokeU1}
      >
        2d
      </text>

      <defs>
        <marker id="arrow-u1" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill={strokeU1} />
        </marker>
      </defs>
    </svg>
  );
}

// ── Section view (bottom) ─────────────────────────────────────────────────────
function SectionView({
  inp,
  width,
  height,
  svgMode,
}: {
  inp: PunchingInputs;
  width: number;
  height: number;
  svgMode: 'screen' | 'pdf';
}) {
  const isPdf  = svgMode === 'pdf';
  const cx     = inp.cx as number;
  const d      = inp.d as number;
  const sr     = inp.sr as number;
  const mode   = inp.mode as PunchingMode;

  const SLAB_H_PX   = height * 0.35;
  const SLAB_TOP    = height * 0.25;
  const SLAB_BOT    = SLAB_TOP + SLAB_H_PX;
  const CENTER_X    = width / 2;
  const PILLAR_H    = height * 0.35;

  const maxColPx = width * 0.25;
  const colScale = maxColPx / Math.max(cx, 300);
  const colHalfW = Math.max((cx / 2) * colScale, 20);

  const coneOutX = colHalfW + SLAB_H_PX / 2;

  // Colors
  const slabFill    = isPdf ? '#f1f5f9'   : 'var(--color-bg-surface, #1e293b)';
  const slabStroke  = isPdf ? '#334155'   : 'var(--color-border-main, #334155)';
  const colFill     = isPdf ? '#cbd5e1'   : 'var(--color-bg-elevated, #263348)';
  const coneStroke   = isPdf ? '#64748b'  : '#94a3b8';
  const rebarStroke  = isPdf ? '#0f172a'  : '#f8fafc';
  const arrowColor   = isPdf ? '#0f172a'  : '#f8fafc';
  const accentColor  = isPdf ? '#0ea5e9'  : '#38bdf8';
  const stirrupColor = isPdf ? '#94a3b8'  : '#475569'; // softer than accent

  const arrowPilar = mode === 'pilar';

  // Stirrups: beam-type at sr spacing, up to 1.5d from column face
  const hasShearReinf = inp.hasShearReinf as boolean;
  const position = inp.position as PunchingPosition;
  // Section view: cx is parallel to free edge for borde/esquina
  // "Right" side in section = away from free edge (interior direction in cx axis)
  // For borde/esquina: free edge is on the right (+x) in plan; suppress right stirrups.
  // For interior: both sides.
  const showRightStirrup = position === 'interior';
  const showLeftStirrup  = position !== 'esquina';
  const stirrupRects: React.ReactElement[] = [];
  if (hasShearReinf && sr > 0) {
    const srPx = Math.max(sr * colScale, 6);
    const nStirrups = Math.min(Math.max(Math.floor(1.5 * d / sr), 1), 4);
    for (let i = 1; i <= nStirrups; i++) {
      const offset = colHalfW + i * srPx;
      if (showRightStirrup) {
        stirrupRects.push(
          <rect key={`sw-r-${i}`}
            x={CENTER_X + offset - 3}
            y={SLAB_TOP + SLAB_H_PX * 0.12}
            width={6}
            height={SLAB_H_PX * 0.76}
            fill="none"
            stroke={stirrupColor}
            strokeWidth={1.2}
          />
        );
      }
      if (showLeftStirrup) {
        stirrupRects.push(
          <rect key={`sw-l-${i}`}
            x={CENTER_X - offset - 3}
            y={SLAB_TOP + SLAB_H_PX * 0.12}
            width={6}
            height={SLAB_H_PX * 0.76}
            fill="none"
            stroke={stirrupColor}
            strokeWidth={1.2}
          />
        );
      }
    }
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="Sección transversal — punzonamiento"
    >
      {!isPdf && (
        <rect width={width} height={height} fill="var(--color-bg-canvas, #0f172a)" />
      )}

      {/* Column (pilar mode) below slab */}
      {mode === 'pilar' && (
        <rect
          x={CENTER_X - colHalfW}
          y={SLAB_BOT}
          width={colHalfW * 2}
          height={PILLAR_H}
          fill={colFill}
          stroke={slabStroke}
          strokeWidth={1}
        />
      )}

      {/* Slab */}
      <rect
        x={0}
        y={SLAB_TOP}
        width={width}
        height={SLAB_H_PX}
        fill={slabFill}
        stroke={slabStroke}
        strokeWidth={1}
      />

      {/* Loaded area top (carga-puntual mode) */}
      {mode === 'carga-puntual' && (
        <rect
          x={CENTER_X - colHalfW}
          y={SLAB_TOP - PILLAR_H * 0.4}
          width={colHalfW * 2}
          height={PILLAR_H * 0.4}
          fill={colFill}
          stroke={slabStroke}
          strokeWidth={1}
        />
      )}

      {/* Punching cone lines */}
      <line
        x1={CENTER_X - colHalfW} y1={SLAB_TOP}
        x2={CENTER_X - coneOutX} y2={SLAB_BOT}
        stroke={coneStroke} strokeWidth={1}
      />
      <line
        x1={CENTER_X + colHalfW} y1={SLAB_TOP}
        x2={CENTER_X + coneOutX} y2={SLAB_BOT}
        stroke={coneStroke} strokeWidth={1}
      />

      {/* Stirrups (beam-type, tipo viga) */}
      {stirrupRects}

      {/* Flexural bars */}
      {[...Array(5)].map((_, i) => {
        const bx = CENTER_X - 2 * colHalfW + i * colHalfW;
        const by = arrowPilar ? SLAB_BOT - 6 : SLAB_TOP + 6;
        return (
          <circle key={i} cx={bx} cy={by} r={3} fill="none" stroke={rebarStroke} strokeWidth={1} />
        );
      })}

      {/* VEd arrow */}
      {arrowPilar ? (
        <>
          <line
            x1={CENTER_X} y1={SLAB_BOT + PILLAR_H * 0.7}
            x2={CENTER_X} y2={SLAB_BOT + 4}
            stroke={arrowColor} strokeWidth={1.5} markerEnd="url(#arrow-ved)"
          />
          <text x={CENTER_X + 8} y={SLAB_BOT + PILLAR_H * 0.55}
            fontSize={10} fontFamily="monospace" fill={arrowColor}>VEd</text>
        </>
      ) : (
        <>
          <line
            x1={CENTER_X} y1={SLAB_TOP - PILLAR_H * 0.55}
            x2={CENTER_X} y2={SLAB_TOP - PILLAR_H * 0.05}
            stroke={arrowColor} strokeWidth={1.5} markerEnd="url(#arrow-ved)"
          />
          <text x={CENTER_X + 8} y={SLAB_TOP - PILLAR_H * 0.35}
            fontSize={10} fontFamily="monospace" fill={arrowColor}>VEd</text>
        </>
      )}

      {/* d annotation */}
      <line
        x1={width * 0.88} y1={arrowPilar ? SLAB_BOT - 6 : SLAB_TOP + 6}
        x2={width * 0.88} y2={arrowPilar ? SLAB_TOP : SLAB_BOT}
        stroke={accentColor} strokeWidth={0.75}
      />
      <text x={width * 0.88 + 4} y={(SLAB_TOP + SLAB_BOT) / 2 + 4}
        fontSize={10} fontFamily="monospace" fill={accentColor}>d</text>

      <defs>
        <marker id="arrow-ved" markerWidth={6} markerHeight={6} refX={3} refY={6} orient="auto">
          <path d="M0,0 L3,6 L6,0 z" fill={arrowColor} />
        </marker>
      </defs>
    </svg>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function PunchingSVG({ inp, result, width, mode = 'screen' }: PunchingSVGProps) {
  const planSize   = Math.min(width, 360);
  const sectionH   = Math.round(planSize * 0.5);

  return (
    <div className={mode === 'screen' ? 'canvas-dot-grid' : undefined}>
      <PlanView    inp={inp} result={result} size={planSize}   svgMode={mode} />
      <SectionView inp={inp} width={planSize} height={sectionH} svgMode={mode} />
    </div>
  );
}
