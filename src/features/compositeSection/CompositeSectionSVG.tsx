import { type CompositeSectionInputs } from '../../data/defaults';
import { type CompositeSectionResult } from '../../lib/calculations/compositeSection';

interface CompositeSectionSVGProps {
  inp: CompositeSectionInputs;
  result: CompositeSectionResult;
  width: number;
  mode?: 'screen' | 'pdf';
}

export function CompositeSectionSVG({ result, width, mode = 'screen' }: CompositeSectionSVGProps) {
  const isPdf = mode === 'pdf';

  // Color tokens
  const colProfile  = isPdf ? 'none'    : 'none';
  const strProfile  = isPdf ? '#444'    : 'var(--color-border-main, #334155)';
  const colPlate    = isPdf ? 'none'    : 'none';
  const strPlate    = isPdf ? '#888'    : 'var(--color-text-primary, #f8fafc)';
  const strAccent   = isPdf ? '#000'    : '#38bdf8';   // composite centroid
  const strDisabled = isPdf ? '#bbb'    : '#475569';   // Steiner arms + element centroids
  const strText     = isPdf ? '#444'    : '#94a3b8';
  const strTextDim  = isPdf ? '#888'    : '#475569';

  if (!result.valid || result.totalHeight === 0 || result.elements.length === 0) {
    const h = Math.round(width * 0.6);
    return (
      <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-label="Sección compuesta — sin datos">
        <text x={width / 2} y={h / 2} textAnchor="middle" fill={strText} fontSize={11} fontFamily="monospace">
          {result.error ?? 'Sin datos'}
        </text>
      </svg>
    );
  }

  const { elements, totalHeight, profileH, profileB, profileTf, profileTw } = result;
  const hasProfile = profileH > 0;

  // ── Bounding box (physical mm coordinates, x relative to web centre) ────────
  const xs: number[] = [];
  for (const e of elements) {
    xs.push(e.xCenter_mm - e.width_mm / 2);
    xs.push(e.xCenter_mm + e.width_mm / 2);
  }
  if (hasProfile) {
    xs.push(-profileB / 2);
    xs.push(+profileB / 2);
  }
  const xMin_mm = Math.min(...xs);
  const xMax_mm = Math.max(...xs);
  const secW_mm = Math.max(xMax_mm - xMin_mm, 1);

  // ── Scale ─────────────────────────────────────────────────────────────────
  const PAD_L = 48;   // left: room for y_c annotation
  const PAD_R = 24;
  const PAD_T = 24;
  const PAD_B = 32;   // bottom: room for total height annotation

  const availW = width - PAD_L - PAD_R;
  const maxH = Math.max(width * 0.9, 220);
  const availH = maxH - PAD_T - PAD_B;

  const scale = Math.min(availW / secW_mm, availH / totalHeight);
  const svgH = Math.round(totalHeight * scale + PAD_T + PAD_B);

  // ── Coordinate transform ──────────────────────────────────────────────────
  // Physical → SVG screen (flip y, shift origin)
  const sx = (x_mm: number) => PAD_L + (x_mm - xMin_mm) * scale;
  const sy = (y_mm: number) => PAD_T + (totalHeight - y_mm) * scale;

  // Width / height in px
  const pw = (w_mm: number) => w_mm * scale;
  const ph = (h_mm: number) => h_mm * scale;

  // ── Render helpers ────────────────────────────────────────────────────────
  const yc = result.yc_mm;
  const yCx = sy(yc);
  const fullXL = sx(xMin_mm);
  const fullXR = sx(xMax_mm);

  const profileYBot = elements.find((e) => e.isProfile)?.yBottom_mm ?? 0;

  return (
    <svg
      width={width}
      height={svgH}
      viewBox={`0 0 ${width} ${svgH}`}
      aria-label="Sección compuesta — visualización"
      style={{ display: 'block' }}
    >
      {/* ── Steiner arms (behind elements) ────────────────────────────────── */}
      {elements.map((e, i) => {
        if (e.isProfile) return null;
        const ex = sx(e.xCenter_mm);
        const ey_elem = sy(e.yc_mm);
        return (
          <line
            key={`arm-${i}`}
            x1={ex} y1={ey_elem}
            x2={ex} y2={yCx}
            stroke={strDisabled}
            strokeWidth={0.8}
            strokeDasharray="3 2"
          />
        );
      })}

      {/* ── Profile I-shape ────────────────────────────────────────────────── */}
      {hasProfile && (() => {
        const xFL = sx(-profileB / 2);
        const fW  = pw(profileB);
        const tfH = ph(profileTf);
        const webH = ph(Math.max(profileH - 2 * profileTf, 0));
        const xWL = sx(-profileTw / 2);
        const wW  = pw(profileTw);
        const yProfBot = sy(profileYBot);
        const yBotFlange = yProfBot - ph(profileTf);
        const yWeb       = yBotFlange - webH;
        const yTopFlange = yWeb - tfH;
        return (
          <>
            {/* bottom flange */}
            <rect x={xFL} y={yBotFlange} width={fW} height={tfH}
              fill={colProfile} stroke={strProfile} strokeWidth={1.2} />
            {/* web */}
            <rect x={xWL} y={yWeb} width={wW} height={webH}
              fill={colProfile} stroke={strProfile} strokeWidth={1.2} />
            {/* top flange */}
            <rect x={xFL} y={yTopFlange} width={fW} height={tfH}
              fill={colProfile} stroke={strProfile} strokeWidth={1.2} />
          </>
        );
      })()}

      {/* ── Plates ────────────────────────────────────────────────────────── */}
      {elements.filter((e) => !e.isProfile).map((e, i) => {
        const rx = sx(e.xCenter_mm - e.width_mm / 2);
        const ry = sy(e.yBottom_mm + e.height_mm);
        const rw = pw(e.width_mm);
        const rh = ph(e.height_mm);
        // Label inside if tall enough
        const showLabel = rh > 14 && rw > 20;
        return (
          <g key={`plate-${i}`}>
            <rect x={rx} y={ry} width={rw} height={rh}
              fill={colPlate}
              stroke={strPlate}
              strokeWidth={1.0}
            />
            {showLabel && (
              <text
                x={rx + rw / 2}
                y={ry + rh / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill={strTextDim}
                fontSize={9}
                fontFamily="monospace"
              >
                {e.label}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Element centroid dots ──────────────────────────────────────────── */}
      {elements.map((e, i) => (
        <circle
          key={`dot-${i}`}
          cx={sx(e.xCenter_mm)}
          cy={sy(e.yc_mm)}
          r={2.5}
          fill={strDisabled}
          stroke="none"
        />
      ))}

      {/* ── Composite centroid line ────────────────────────────────────────── */}
      <line
        x1={fullXL - 6} y1={yCx}
        x2={fullXR + 6} y2={yCx}
        stroke={strAccent}
        strokeWidth={1.0}
        strokeDasharray="6 3"
      />

      {/* CG label on right */}
      <text
        x={fullXR + 10}
        y={yCx}
        dominantBaseline="central"
        fill={strAccent}
        fontSize={9}
        fontFamily="monospace"
      >
        CG
      </text>

      {/* ── yc annotation on left ─────────────────────────────────────────── */}
      <text
        x={PAD_L - 6}
        y={yCx}
        textAnchor="end"
        dominantBaseline="central"
        fill={strAccent}
        fontSize={9}
        fontFamily="monospace"
      >
        {yc.toFixed(0)}mm
      </text>

      {/* ── Total height annotation ────────────────────────────────────────── */}
      {(() => {
        const xAnn = sx(xMin_mm) - 18;
        const yTop = sy(totalHeight);
        const yBot = sy(0);
        return (
          <>
            <line x1={xAnn} y1={yBot} x2={xAnn} y2={yTop}
              stroke={strTextDim} strokeWidth={0.8} />
            <line x1={xAnn - 3} y1={yBot} x2={xAnn + 3} y2={yBot}
              stroke={strTextDim} strokeWidth={0.8} />
            <line x1={xAnn - 3} y1={yTop} x2={xAnn + 3} y2={yTop}
              stroke={strTextDim} strokeWidth={0.8} />
            <text
              x={xAnn - 5}
              y={(yTop + yBot) / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill={strTextDim}
              fontSize={8}
              fontFamily="monospace"
              transform={`rotate(-90, ${xAnn - 5}, ${(yTop + yBot) / 2})`}
            >
              {totalHeight.toFixed(0)} mm
            </text>
          </>
        );
      })()}
    </svg>
  );
}
