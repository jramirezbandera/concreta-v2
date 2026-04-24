// Isolated footing SVG — single <svg> with three <g> groups (planta, sección,
// diagrama de presión). Layouts horizontally (≥380 wide) or vertically.
// Pressure rendering follows result.distributionType; overturning_fail shows a
// "VUELCO GEOMÉTRICO" stamp. Per plan §4.4.1 + DESIGN.md SVG rules.

import { type IsolatedFootingInputs } from '../../data/defaults';
import { type IsolatedFootingResult } from '../../lib/calculations/isolatedFooting';
import { formatQuantity } from '../../lib/units/format';
import type { UnitSystem } from '../../lib/units/types';

interface Props {
  inp:    IsolatedFootingInputs;
  result: IsolatedFootingResult;
  width:  number;
  mode?:  'screen' | 'pdf';
  system?: UnitSystem;
}

interface Box { x: number; y: number; w: number; h: number }

function colors(isPdf: boolean) {
  return {
    footFill:    isPdf ? '#f0f0f0' : 'var(--color-bg-surface,#1e293b)',
    footStroke:  isPdf ? '#333333' : 'var(--color-border-main,#334155)',
    colFill:     isPdf ? '#d8d8d8' : 'var(--color-bg-elevated,#334155)',
    colStroke:   isPdf ? '#333333' : 'var(--color-text-disabled,#475569)',
    effDash:     isPdf ? '#666666' : 'var(--color-accent,#38bdf8)',
    rebar:       isPdf ? '#000000' : 'var(--color-text-primary,#f8fafc)',
    coverLine:   isPdf ? '#888888' : 'var(--color-text-disabled,#475569)',
    groundLine:  isPdf ? '#666666' : 'var(--color-text-secondary,#94a3b8)',
    groundHatch: isPdf ? '#999999' : 'var(--color-text-disabled,#475569)',
    cota:        isPdf ? '#000000' : 'var(--color-accent,#38bdf8)',
    textMain:    isPdf ? '#000000' : 'var(--color-text-primary,#f8fafc)',
    textSec:     isPdf ? '#666666' : 'var(--color-text-secondary,#94a3b8)',
    textDis:     isPdf ? '#999999' : 'var(--color-text-disabled,#475569)',
    pressLow:    isPdf ? '#cccccc' : 'var(--color-accent,#38bdf8)',
    pressHigh:   isPdf ? '#666666' : 'var(--color-state-fail,#ef4444)',
    fail:        isPdf ? '#666666' : 'var(--color-state-fail,#ef4444)',
  };
}

// ── Planta ────────────────────────────────────────────────────────────────────

function Planta({
  inp, result, box, c, isPdf, gradId,
}: {
  inp: IsolatedFootingInputs; result: IsolatedFootingResult;
  box: Box; c: ReturnType<typeof colors>; isPdf: boolean; gradId: string;
}) {
  const { B, L, bc, hc } = inp;
  const { ex_sls, ey_sls, distributionType } = result;
  const isFail = distributionType === 'overturning_fail';

  // Uniform scale (no distortion)
  const inset = 18;
  const scale = Math.min((box.w - 2 * inset) / B, (box.h - 2 * inset) / L);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const halfB = (B / 2) * scale;
  const halfL = (L / 2) * scale;

  // Footing rect
  const fx = cx - halfB;
  const fy = cy - halfL;
  const fw = 2 * halfB;
  const fh = 2 * halfL;

  // Pilar (column) at center
  const halfBc = (bc / 2) * scale;
  const halfHc = (hc / 2) * scale;

  // Effective area (Meyerhof B'×L'), only if eccentricity meaningful
  const ex = Math.abs(ex_sls);
  const ey = Math.abs(ey_sls);
  const Beff = Math.max(0, B - 2 * ex);
  const Leff = Math.max(0, L - 2 * ey);
  const hasEcc = (ex > 0.001 || ey > 0.001) && !isFail && Beff > 0 && Leff > 0;
  const halfBeff = (Beff / 2) * scale;
  const halfLeff = (Leff / 2) * scale;

  return (
    <g aria-label="Planta">
      {/* Base rect */}
      <rect
        x={fx} y={fy} width={fw} height={fh}
        fill={isFail ? (isPdf ? '#eeeeee' : 'rgba(239,68,68,0.15)') : c.footFill}
        stroke={c.footStroke} strokeWidth={1.25}
      />

      {/* Pressure gradient overlay (skip on fail) */}
      {!isFail && (
        <rect
          x={fx} y={fy} width={fw} height={fh}
          fill={`url(#${gradId})`} stroke="none" pointerEvents="none"
        />
      )}

      {/* Effective area (dashed, accent) */}
      {hasEcc && (
        <rect
          x={cx - halfBeff} y={cy - halfLeff}
          width={2 * halfBeff} height={2 * halfLeff}
          fill="none" stroke={c.effDash} strokeWidth={1.5}
          strokeDasharray="4 2"
        />
      )}

      {/* Pilar */}
      <rect
        x={cx - halfBc} y={cy - halfHc}
        width={2 * halfBc} height={2 * halfHc}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1}
      />

      {/* Cotas B (abajo) y L (derecha) */}
      <line x1={fx} y1={fy + fh + 8} x2={fx + fw} y2={fy + fh + 8}
        stroke={c.cota} strokeWidth={0.75} />
      <text
        x={cx} y={fy + fh + 18}
        textAnchor="middle" fontSize={10} fontFamily="monospace" fill={c.cota}
      >{`B=${B.toFixed(2)} m`}</text>

      <line x1={fx + fw + 8} y1={fy} x2={fx + fw + 8} y2={fy + fh}
        stroke={c.cota} strokeWidth={0.75} />
      <text
        x={fx + fw + 14} y={cy}
        textAnchor="middle" fontSize={10} fontFamily="monospace" fill={c.cota}
        dominantBaseline="middle"
        transform={`rotate(-90 ${fx + fw + 14} ${cy})`}
      >{`L=${L.toFixed(2)} m`}</text>

      {/* Cruz centro de presiones (cuando hay eccentricidad) */}
      {hasEcc && (
        <g>
          {/* Centro geométrico (gris) */}
          <circle cx={cx} cy={cy} r={2} fill={c.textDis} />
          {/* Centro de presiones (accent) — desplazado por (ex, ey) */}
          <circle
            cx={cx + ex_sls * scale} cy={cy + ey_sls * scale}
            r={2.5} fill={c.cota}
          />
        </g>
      )}

      {/* "VUELCO GEOMÉTRICO" stamp */}
      {isFail && (
        <text
          x={cx} y={cy + 4}
          textAnchor="middle" fontSize={14} fontWeight={600} fontFamily="monospace"
          fill={c.fail}
        >VUELCO GEOMÉTRICO</text>
      )}
    </g>
  );
}

// ── Sección ──────────────────────────────────────────────────────────────────

function Seccion({
  inp, result, box, c, isPdf, hatchId,
}: {
  inp: IsolatedFootingInputs; result: IsolatedFootingResult;
  box: Box; c: ReturnType<typeof colors>; isPdf: boolean; hatchId: string;
}) {
  const { B, h, bc, Df, phi_x } = inp;
  const { distributionType, d_x } = result;
  const isFail = distributionType === 'overturning_fail';

  // Vertical layout: ground line at top, footing below, column stub above ground
  const inset = 14;
  // Total vertical content: stub (≈40px) + Df (terreno) + h (zapata)
  const stubPx = 38;
  const physVert = Df + h;
  const physHoriz = B * 1.10; // a bit of breathing room beyond B
  const scaleV = (box.h - 2 * inset - stubPx) / physVert;
  const scaleH = (box.w - 2 * inset) / physHoriz;
  const scale = Math.min(scaleV, scaleH);

  const capW = B * scale;
  const capH = h * scale;
  const colW = bc * scale;
  const dfPx = Df * scale;

  const cx = box.x + box.w / 2;
  // Ground line y: top of footing is dfPx below; stub is above ground
  const groundY = box.y + inset + stubPx;
  const footTopY = groundY + dfPx;
  const footLeftX = cx - capW / 2;

  // Cover and rebar
  const coverPx = Math.max(2, (inp.cover / 1000) * scale);
  const phiPx = Math.min(Math.max((phi_x / 1000) * scale, 2), 5);
  const rebarY = footTopY + capH - coverPx - phiPx / 2;

  return (
    <g aria-label="Sección vertical">
      {/* Terreno hatch (entre groundY y footTopY) */}
      <rect
        x={footLeftX - 14} y={groundY}
        width={capW + 28} height={dfPx}
        fill={`url(#${hatchId})`} opacity={0.4}
      />

      {/* Línea de terreno natural */}
      <line
        x1={footLeftX - 18} y1={groundY}
        x2={footLeftX + capW + 18} y2={groundY}
        stroke={c.groundLine} strokeWidth={1}
      />

      {/* Pilar — continuo desde arriba, atraviesa el terreno hasta el trasdós de la zapata */}
      <rect
        x={cx - colW / 2} y={box.y + inset}
        width={colW} height={footTopY - (box.y + inset)}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1}
      />

      {/* Cuerpo zapata */}
      <rect
        x={footLeftX} y={footTopY}
        width={capW} height={capH}
        fill={c.footFill} stroke={c.footStroke} strokeWidth={1.25}
      />
      {isFail && (
        <rect
          x={footLeftX} y={footTopY} width={capW} height={capH}
          fill={isPdf ? '#eeeeee' : 'rgba(239,68,68,0.10)'} stroke="none"
        />
      )}

      {/* Cover line + rebar */}
      <rect
        x={footLeftX + coverPx / 2} y={footTopY + coverPx / 2}
        width={capW - coverPx} height={capH - coverPx}
        fill="none" stroke={c.coverLine} strokeWidth={0.75} strokeDasharray="2 2"
      />
      {!isFail && (
        <line
          x1={footLeftX + 4} y1={rebarY}
          x2={footLeftX + capW - 4} y2={rebarY}
          stroke={c.rebar} strokeWidth={phiPx} strokeLinecap="round"
        />
      )}

      {/* Cota Df — dentro del hatch, entre el trasdós izquierdo y el pilar */}
      <text
        x={(footLeftX + (cx - colW / 2)) / 2} y={groundY + dfPx / 2}
        textAnchor="middle" fontSize={9} fontFamily="monospace" fill={c.cota}
        dominantBaseline="middle"
      >{`Df=${Df.toFixed(2)} m`}</text>

      {/* Cota h (derecha) — rotada vertical para no salir del box */}
      <line x1={footLeftX + capW + 10} y1={footTopY} x2={footLeftX + capW + 10} y2={footTopY + capH}
        stroke={c.cota} strokeWidth={0.75} />
      <text
        x={footLeftX + capW + 16} y={footTopY + capH / 2}
        textAnchor="middle" fontSize={10} fontFamily="monospace" fill={c.cota}
        dominantBaseline="middle"
        transform={`rotate(-90 ${footLeftX + capW + 16} ${footTopY + capH / 2})`}
      >{`h=${h.toFixed(2)} m`}</text>

      {/* d (canto útil) — sutil, debajo del rebar */}
      {!isFail && d_x > 0 && (
        <text
          x={footLeftX + capW / 2} y={rebarY - 4}
          textAnchor="middle" fontSize={9} fontFamily="monospace" fill={c.textDis}
        >{`d=${d_x.toFixed(0)} mm`}</text>
      )}
    </g>
  );
}

// ── Diagrama de presión ───────────────────────────────────────────────────────

function Diagrama({
  inp, result, box, c, isPdf, system,
}: {
  inp: IsolatedFootingInputs; result: IsolatedFootingResult;
  box: Box; c: ReturnType<typeof colors>; isPdf: boolean; system: UnitSystem;
}) {
  const { B } = inp;
  const { distributionType, sigma_max, sigma_min, loaded_area_fraction } = result;
  const isFail = distributionType === 'overturning_fail';
  const isBitri = distributionType !== 'trapezoidal' && !isFail;

  // Empty state for fail
  if (isFail) {
    return (
      <g aria-label="Diagrama de presión — vuelco">
        <rect
          x={box.x} y={box.y} width={box.w} height={box.h}
          fill="none" stroke={c.fail} strokeWidth={1} strokeDasharray="4 3"
          opacity={0.5}
        />
        <text
          x={box.x + box.w / 2} y={box.y + box.h / 2}
          textAnchor="middle" fontSize={11} fontFamily="monospace" fill={c.textDis}
          dominantBaseline="middle"
        >Diagrama no aplicable — vuelco</text>
      </g>
    );
  }

  const inset = 14;
  const topTitlePad = 16;                        // room for "σ bajo zapata" title
  const bottomPad = isBitri ? 26 : 12;           // room for Lc label (bitri) or nothing
  const baseY = box.y + box.h - bottomPad;       // baseline of pressure shape
  const topAvailable = box.h - bottomPad - inset - topTitlePad;
  const pressMaxPx = Math.max(20, topAvailable);
  const widthPx = box.w - 2 * inset;
  const x0 = box.x + inset;
  const xRight = x0 + widthPx;

  // Polygon points: pressure profile (from x=0 to x=B along x-axis)
  // For trapezoidal: σmin at left, σmax at right (full width).
  // For bitri: σ goes from σmax at right to 0 at x = B - Lc, where Lc = loaded_area_fraction · B (uniaxial sense).
  const sigMaxPx = pressMaxPx;
  const sigMinPx = sigma_max > 0 ? Math.max(0, (sigma_min / sigma_max) * pressMaxPx) : 0;

  let poly: string;
  let lcLineX: number | null = null;

  if (!isBitri) {
    // Trapezoidal
    poly = [
      `${x0},${baseY}`,
      `${x0},${baseY - sigMinPx}`,
      `${xRight},${baseY - sigMaxPx}`,
      `${xRight},${baseY}`,
    ].join(' ');
  } else {
    // Bitriangular: triangle from despegue point to xRight
    const lcFrac = Math.max(0, Math.min(1, loaded_area_fraction));
    const lcPx = Math.max(0, lcFrac * widthPx);
    const xLc = xRight - lcPx;
    lcLineX = xLc;
    poly = [
      `${xLc},${baseY}`,
      `${xRight},${baseY - sigMaxPx}`,
      `${xRight},${baseY}`,
    ].join(' ');
  }

  return (
    <g aria-label="Diagrama de presión">
      {/* Subtitle (top) */}
      <text
        x={box.x + box.w / 2} y={box.y + 10}
        textAnchor="middle" fontSize={9} fontFamily="monospace" fill={c.textDis}
      >{`σ bajo zapata — eje B (${B.toFixed(2)} m)`}</text>

      {/* Baseline */}
      <line
        x1={x0} y1={baseY} x2={xRight} y2={baseY}
        stroke={c.footStroke} strokeWidth={1}
      />

      {/* Pressure shape */}
      <polygon
        points={poly}
        fill={isPdf ? '#888888' : 'rgba(239,68,68,0.30)'}
        stroke={c.pressHigh} strokeWidth={0.75}
      />

      {/* Cota σmax (right) */}
      <text
        x={xRight} y={baseY - sigMaxPx - 4}
        textAnchor="end" fontSize={10} fontFamily="monospace" fill={c.cota}
      >{`σmax=${formatQuantity(sigma_max, 'soilPressure', system)}`}</text>

      {/* Cota σmin (left) */}
      {!isBitri && (
        <text
          x={x0} y={baseY - sigMinPx - 4}
          textAnchor="start" fontSize={10} fontFamily="monospace" fill={c.cota}
        >{`σmin=${formatQuantity(sigma_min, 'soilPressure', system)}`}</text>
      )}

      {/* Línea Lc + cota (bitri) */}
      {isBitri && lcLineX !== null && (
        <>
          <line
            x1={lcLineX} y1={baseY - 3} x2={lcLineX} y2={baseY + 6}
            stroke={c.cota} strokeWidth={0.75} strokeDasharray="3 2"
          />
          <text
            x={(lcLineX + xRight) / 2} y={baseY + 16}
            textAnchor="middle" fontSize={10} fontFamily="monospace" fill={c.cota}
          >{`Lc=${(loaded_area_fraction * B).toFixed(2)} m`}</text>
        </>
      )}
    </g>
  );
}

// ── Mini-leyenda gradiente (a11y para colorblind) ─────────────────────────────

function GradientLegend({
  result, x, y, w, c, isPdf, gradId, system,
}: {
  result: IsolatedFootingResult;
  x: number; y: number; w: number;
  c: ReturnType<typeof colors>; isPdf: boolean; gradId: string; system: UnitSystem;
}) {
  if (result.distributionType === 'overturning_fail') return null;
  const barW = Math.min(80, w * 0.35);
  const barH = 6;
  const minStr = formatQuantity(result.sigma_min, 'soilPressure', system, { withUnit: false });
  const maxStr = formatQuantity(result.sigma_max, 'soilPressure', system);
  return (
    <g aria-hidden="true">
      <rect
        x={x} y={y} width={barW} height={barH}
        fill={`url(#${gradId})`} stroke={c.textDis} strokeWidth={0.5}
      />
      <text
        x={x + barW + 8} y={y + barH - 1}
        fontSize={9} fontFamily="monospace" fill={c.textSec}
      >{`σmin=${minStr}  ··  σmax=${maxStr}`}</text>
      {/* discreet gray suffix unused, color-blind accessible via numbers above */}
      <text x={0} y={0} fontSize={0} fill={isPdf ? '#000' : 'transparent'}>{' '}</text>
    </g>
  );
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

export function IsolatedFootingSVG({ inp, result, width, mode = 'screen', system = 'si' }: Props) {
  const isPdf = mode === 'pdf';
  const c = colors(isPdf);

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

  const isVertical = !isPdf && width < 380;
  const isWide = !isPdf && width >= 760;
  const margin = 12;
  // In wide mode, fill the canvas container (min-h-90 = 360px) so the three
  // panels look as large as possible.
  const wideBoxH = 320;
  const totalH = isVertical ? 480 : isWide ? wideBoxH + 2 * margin + 16 : 400;

  let plantaBox: Box, seccionBox: Box, diagramaBox: Box;
  if (isVertical) {
    plantaBox   = { x: margin, y: margin,        w: width - 2 * margin, h: 196 };
    seccionBox  = { x: margin, y: margin + 208,  w: width - 2 * margin, h: 144 };
    diagramaBox = { x: margin, y: margin + 364,  w: width - 2 * margin, h: 100 };
  } else if (isWide) {
    // Three panels side-by-side — uses full screen width
    const gap = 24;
    const thirdW = (width - 2 * margin - 2 * gap) / 3;
    plantaBox   = { x: margin,                             y: margin, w: thirdW, h: wideBoxH };
    seccionBox  = { x: margin + thirdW + gap,              y: margin, w: thirdW, h: wideBoxH };
    diagramaBox = { x: margin + 2 * (thirdW + gap),        y: margin, w: thirdW, h: wideBoxH };
  } else {
    const halfW = (width - 2 * margin - 24) / 2;
    plantaBox   = { x: margin,                 y: margin,           w: halfW, h: 220 };
    seccionBox  = { x: margin + halfW + 24,    y: margin,           w: halfW, h: 220 };
    diagramaBox = { x: margin, y: margin + 220 + 16, w: width - 2 * margin, h: 132 };
  }

  // Stable IDs per render mode (allows two SVG instances on screen + PDF)
  const idSuffix = isPdf ? 'pdf' : 'screen';
  const gradId = `if-press-grad-${idSuffix}`;
  const legendGradId = `if-press-legend-grad-${idSuffix}`;
  const hatchId = `if-soil-hatch-${idSuffix}`;

  // Gradient direction from biaxial eccentricity. Points from σmin → σmax corner
  // (low-pressure side to high-pressure side). With ex only → horizontal;
  // with ey only → vertical; both → diagonal.
  // NOTE: gradient uses objectBoundingBox, so the vector is in normalized rect
  // space — visually accurate enough even when B ≠ L.
  const e_mag = Math.hypot(result.ex_sls, result.ey_sls);
  const vx = e_mag > 1e-9 ? result.ex_sls / e_mag : 1;
  const vy = e_mag > 1e-9 ? result.ey_sls / e_mag : 0;
  const gx1 = 0.5 - vx / 2;
  const gy1 = 0.5 - vy / 2;
  const gx2 = 0.5 + vx / 2;
  const gy2 = 0.5 + vy / 2;

  const titleId = `if-svg-title-${idSuffix}`;
  const descId = `if-svg-desc-${idSuffix}`;
  const distLabel = ({
    trapezoidal:           'trapecial',
    bitriangular_uniaxial: 'bitriangular uniaxial',
    bitriangular_biaxial:  'bitriangular biaxial',
    overturning_fail:      'vuelco geométrico',
  } as const)[result.distributionType];

  // Legend position (below diagrama, inside SVG)
  const legendY = diagramaBox.y + diagramaBox.h + 14;
  const legendX = margin;
  const wrapH = legendY + 12;
  const heightOut = Math.max(totalH, wrapH);

  return (
    <div
      id={isPdf ? 'isolated-footing-svg-pdf' : undefined}
      className={mode === 'screen' ? 'canvas-dot-grid' : undefined}
      style={isPdf ? { background: '#fff' } : undefined}
    >
      <svg
        width={width}
        height={heightOut}
        viewBox={`0 0 ${width} ${heightOut}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>Zapata aislada — planta, sección y diagrama de presión</title>
        <desc id={descId}>
          {`Planta ${inp.B}×${inp.L} m con pilar ${inp.bc}×${inp.hc} m. `}
          {`Distribución ${distLabel}. `}
          {`σmáx ${formatQuantity(result.sigma_max, 'soilPressure', system)}, σmín ${formatQuantity(result.sigma_min, 'soilPressure', system)}.`}
        </desc>

        <defs>
          {/* Pressure gradient — planta (directional, reflects biaxial eccentricity) */}
          <linearGradient id={gradId} x1={gx1} y1={gy1} x2={gx2} y2={gy2}>
            {isPdf ? (
              <>
                <stop offset="0%"   stopColor="#cccccc" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#666666" stopOpacity="0.8" />
              </>
            ) : (
              <>
                <stop offset="0%"   stopColor="var(--color-accent,#38bdf8)"     stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--color-state-fail,#ef4444)" stopOpacity="0.55" />
              </>
            )}
          </linearGradient>
          {/* Pressure gradient — leyenda (always horizontal) */}
          <linearGradient id={legendGradId} x1="0" y1="0" x2="1" y2="0">
            {isPdf ? (
              <>
                <stop offset="0%"   stopColor="#cccccc" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#666666" stopOpacity="0.8" />
              </>
            ) : (
              <>
                <stop offset="0%"   stopColor="var(--color-accent,#38bdf8)"     stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--color-state-fail,#ef4444)" stopOpacity="0.55" />
              </>
            )}
          </linearGradient>
          {/* Soil hatch */}
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={c.groundHatch} strokeWidth="0.6" />
          </pattern>
        </defs>

        <Planta  inp={inp} result={result} box={plantaBox}   c={c} isPdf={isPdf} gradId={gradId} />
        <Seccion inp={inp} result={result} box={seccionBox}  c={c} isPdf={isPdf} hatchId={hatchId} />
        <Diagrama inp={inp} result={result} box={diagramaBox} c={c} isPdf={isPdf} system={system} />

        <GradientLegend result={result} x={legendX} y={legendY} w={width - 2 * margin}
          c={c} isPdf={isPdf} gradId={legendGradId} system={system} />
      </svg>
    </div>
  );
}
