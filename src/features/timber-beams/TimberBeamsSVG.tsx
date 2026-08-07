/* eslint-disable react-hooks/static-components -- the support sub-components are local presentational helpers that close over draw geometry and hold no state; per-render identity is harmless. */
// Timber Beams SVG — two panels:
//   Left:  cross-section (rectangle b×h, with fire residual section overlay)
//   Right: beam elevation + loads + deflected shape
//
// mode='screen': dark theme  |  mode='pdf': white background

import { type TimberBeamInputs } from '../../data/defaults';
import { type TimberBeamResult } from '../../lib/calculations/timberBeams';
import { beamDeflection, type PointLoad } from '../../lib/calculations/beamResponse';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';
import type { UnitSystem } from '../../lib/units/types';

interface TimberBeamsSVGProps {
  inp: TimberBeamInputs;
  result: TimberBeamResult;
  mode: 'screen' | 'pdf';
  width: number;
  height: number;
}

// Structural roles via theme tokens; wood/char are material colors (read on both
// themes) so they stay literal — same principle as the PDF grayscale exception.
const SCREEN = {
  bg: 'transparent',
  // La sección es MADERA: mismo tono que el alzado. El token de sección neutro
  // (--color-chart-section-fill) vale #161619 en oscuro = el color del panel,
  // así que el relleno desaparecía sobre el lienzo.
  sectionFill: '#c8966c',
  sectionStroke: '#d4a06e',
  grain: '#8a6242',
  wallFill: 'var(--color-chart-section-fill)',
  charFill: '#dc2626',
  charStroke: '#ef4444',
  residualFill: '#c8966c',
  residualStroke: '#d4a06e',
  dim: 'var(--color-chart-rebar-faint)',
  dimText: 'var(--color-chart-dim-text)',
  loadArrow: 'var(--color-state-warn)',
  beam: '#c8966c',
  beamStroke: '#d4a06e',
  deflected: 'var(--color-accent)',
  support: 'var(--color-chart-stirrup)',
  hatch: 'var(--color-chart-rebar-dim)',
  label: 'var(--color-chart-rebar-faint)',
};

const PDF = {
  bg: '#ffffff',
  sectionFill: '#f5efe6',
  sectionStroke: '#333333',
  grain: '#333333',
  wallFill: '#f5efe6',
  charFill: '#cc3333',
  charStroke: '#aa0000',
  residualFill: '#e8d5b0',
  residualStroke: '#8B6914',
  dim: '#666666',
  dimText: '#444444',
  loadArrow: '#cc7700',
  beam: '#d4a96a',
  beamStroke: '#8B6914',
  deflected: '#1d4ed8',
  support: '#333333',
  hatch: '#666666',
  label: '#666666',
};

// ─── Cross-section panel ──────────────────────────────────────────────────────
function CrossSection({
  inp, result, C, isPdf, panelW, panelH,
}: {
  inp: TimberBeamInputs;
  result: TimberBeamResult;
  C: typeof SCREEN; isPdf: boolean;
  panelW: number; panelH: number;
}) {
  const margin = 28;
  const availW = panelW - 2 * margin;
  const availH = panelH - 2 * margin;
  const scale  = Math.min(availW / inp.b, availH / inp.h) * 0.85;

  const sW = inp.b * scale;
  const sH = inp.h * scale;
  const ox = (panelW - sW) / 2;
  const oy = (panelH - sH) / 2;

  const fireActive = result.valid && result.fireActive;
  const def_px = fireActive ? result.def * scale : 0;
  const exposedBot = fireActive;
  const exposedSides = fireActive;
  const exposedTop = fireActive && inp.exposedFaces === 4;

  const b_ef_px = fireActive ? result.b_ef * scale : sW;
  const h_ef_px = fireActive ? result.h_ef * scale : sH;

  // Residual section: centred horizontally (equal left+right def), bottom-aligned (char from bottom)
  const rOx = ox + (sW - b_ef_px) / 2;
  const rOy = oy + (exposedTop ? (sH - h_ef_px) / 2 : 0);

  return (
    <g>
      {/* Full section background */}
      <rect x={ox} y={oy} width={sW} height={sH}
        fill={fireActive ? C.charFill : C.sectionFill}
        stroke={C.sectionStroke} strokeWidth={isPdf ? 1.5 : 1}
        opacity={fireActive ? 0.25 : 1}
      />

      {/* Residual section (timber remaining after charring) */}
      {fireActive && b_ef_px > 0 && h_ef_px > 0 && (
        <rect x={rOx} y={rOy} width={b_ef_px} height={h_ef_px}
          fill={C.residualFill} stroke={C.residualStroke} strokeWidth={isPdf ? 1.5 : 1}
        />
      )}

      {/* Grain lines on residual section */}
      {Array.from({ length: 5 }, (_, i) => {
        const gy = rOy + (h_ef_px * (i + 1)) / 6;
        return (
          <line key={i}
            x1={rOx + 3} y1={gy} x2={rOx + b_ef_px - 3} y2={gy}
            stroke={fireActive ? C.residualStroke : C.grain}
            strokeWidth={0.4} opacity={0.35}
          />
        );
      })}

      {/* Fire char labels */}
      {fireActive && (
        <>
          {exposedSides && def_px > 2 && (
            <text x={ox + def_px / 2} y={oy + sH / 2}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={7} fill={C.charFill} fontFamily="monospace"
              transform={`rotate(-90, ${ox + def_px / 2}, ${oy + sH / 2})`}
            >
              {result.def.toFixed(0)}mm
            </text>
          )}
          {exposedBot && def_px > 2 && (
            <text x={ox + sW / 2} y={oy + sH - def_px / 2}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={7} fill={C.charFill} fontFamily="monospace"
            >
              {result.def.toFixed(0)}mm
            </text>
          )}
        </>
      )}

      {/* Dimension b — top */}
      <line x1={ox} y1={oy - 9} x2={ox + sW} y2={oy - 9} stroke={C.dim} strokeWidth={0.7} />
      <line x1={ox} y1={oy - 12} x2={ox} y2={oy - 6} stroke={C.dim} strokeWidth={0.7} />
      <line x1={ox + sW} y1={oy - 12} x2={ox + sW} y2={oy - 6} stroke={C.dim} strokeWidth={0.7} />
      <text x={ox + sW / 2} y={oy - 13} textAnchor="middle" fontSize={8} fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace' } : undefined}
        className={isPdf ? undefined : 'font-mono text-[8px]'}>
        b={inp.b}
      </text>

      {/* Dimension h — left */}
      <line x1={ox - 9} y1={oy} x2={ox - 9} y2={oy + sH} stroke={C.dim} strokeWidth={0.7} />
      <line x1={ox - 12} y1={oy} x2={ox - 6} y2={oy} stroke={C.dim} strokeWidth={0.7} />
      <line x1={ox - 12} y1={oy + sH} x2={ox - 6} y2={oy + sH} stroke={C.dim} strokeWidth={0.7} />
      <text x={ox - 16} y={oy + sH / 2} textAnchor="middle" dominantBaseline="middle"
        fontSize={8} fill={C.dimText}
        transform={`rotate(-90, ${ox - 16}, ${oy + sH / 2})`}
        style={isPdf ? { fontFamily: 'monospace' } : undefined}
        className={isPdf ? undefined : 'font-mono text-[8px]'}>
        h={inp.h}
      </text>

      {/* Grade label */}
      <text x={panelW / 2} y={oy + sH + 16} textAnchor="middle" fontSize={9} fontWeight={600}
        fill={C.dimText}
        style={isPdf ? { fontFamily: 'monospace' } : undefined}
        className={isPdf ? undefined : 'font-mono font-semibold text-[9px]'}>
        {inp.gradeId}
      </text>

      {/* Fire label */}
      {fireActive && (
        <text x={panelW / 2} y={oy + sH + 27} textAnchor="middle" fontSize={7}
          fill={C.charFill}
          style={isPdf ? { fontFamily: 'monospace' } : undefined}
          className={isPdf ? undefined : 'font-mono text-[7px]'}>
          {inp.fireResistance} — def={result.def.toFixed(0)}mm
        </text>
      )}
    </g>
  );
}

// ─── Elevation panel ──────────────────────────────────────────────────────────

function WallHatch({ x, y, w, h, C }: { x: number; y: number; w: number; h: number; C: typeof SCREEN }) {
  const lines: React.ReactNode[] = [];
  const step = 4;
  for (let i = -h; i < w + h; i += step) {
    const x1 = Math.max(x, x + i);
    const y1 = x + i < x ? y + (x - (x + i)) : y;
    const x2 = Math.min(x + w, x + i + h);
    const y2 = x + i + h > x + w ? y + h - ((x + i + h) - (x + w)) : y + h;
    if (x1 < x2) {
      lines.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.hatch} strokeWidth={0.5} />);
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={C.wallFill} stroke={C.support} strokeWidth={1} />
      {lines}
    </g>
  );
}

function Elevation({
  inp, result, C, isPdf, panelX, panelW, panelH, system,
}: {
  inp: TimberBeamInputs;
  result: TimberBeamResult;
  C: typeof SCREEN; isPdf: boolean;
  panelX: number; panelW: number; panelH: number;
  system: UnitSystem;
}) {
  const padLeft  = 12;
  const padRight = 12;

  const beamDepth = Math.max(panelH * 0.10, 8);  // visual beam height in px

  const availW = panelW - padLeft - padRight;

  const x0 = panelX + padLeft;
  const x1 = x0 + availW;
  const midY = panelH / 2;

  // Beam rectangle
  const beamTop = midY - beamDepth / 2;
  const beamBot = midY + beamDepth / 2;

  // Support symbols
  const hatchW = 18;
  const hatchH = 8;
  const pinSize = 6;
  const bc = inp.beamType;

  function LeftSupport() {
    if (bc === 'cantilever' || bc === 'fp' || bc === 'ff') {
      return <WallHatch x={x0 - hatchW} y={midY - hatchH / 2} w={hatchW} h={hatchH} C={C} />;
    }
    // pin (ss)
    return (
      <polygon
        points={`${x0},${beamBot} ${x0 - pinSize},${beamBot + pinSize * 1.5} ${x0 + pinSize},${beamBot + pinSize * 1.5}`}
        fill="none" stroke={C.support} strokeWidth={1.25}
      />
    );
  }

  function RightSupport() {
    if (bc === 'ff') {
      return <WallHatch x={x1} y={midY - hatchH / 2} w={hatchW} h={hatchH} C={C} />;
    }
    if (bc === 'cantilever') {
      return <circle cx={x1} cy={midY} r={pinSize * 0.7} fill="none" stroke={C.support} strokeWidth={1.25} />;
    }
    if (bc === 'fp') {
      // pinned right
      return (
        <polygon
          points={`${x1},${beamBot} ${x1 - pinSize},${beamBot + pinSize * 1.5} ${x1 + pinSize},${beamBot + pinSize * 1.5}`}
          fill="none" stroke={C.support} strokeWidth={1.25}
        />
      );
    }
    // ss — pin right
    return (
      <polygon
        points={`${x1},${beamBot} ${x1 - pinSize},${beamBot + pinSize * 1.5} ${x1 + pinSize},${beamBot + pinSize * 1.5}`}
        fill="none" stroke={C.support} strokeWidth={1.25}
      />
    );
  }

  // Load arrows (UDL): 6 arrows downward
  const nArrows = 7;
  const arrowTop = beamTop - 18;

  // Carga puntual — el dato tiene que VERSE: sin la flecha en su posición, el
  // alzado contaría una historia distinta de la que calcula el motor.
  const hasPoint = inp.P_G + inp.P_Q > 0;
  const tP = hasPoint && inp.L > 0 ? Math.min(Math.max(inp.aP / inp.L, 0), 1) : 0;
  const xP = x0 + tP * availW;
  // La flecha arranca por encima de la barra de reparto. En el SVG móvil el
  // alto baja a ~95 px: se acorta y se queda sin etiqueta antes que salirse.
  const pTop = Math.max(Math.min(arrowTop - 12, beamTop - 30), 16);

  // Deformada REAL: la curva que sale del mismo motor que calcula la flecha, no
  // una senoide dibujada a mano por tipo de viga (que mentía en cuanto entraba
  // una carga puntual). Solo interesa la FORMA ⇒ EI = 1 y sin cortante; se
  // normaliza por el máximo.
  const N = 40;
  const amp = panelH * 0.10;
  const wSer = inp.gk + inp.qk;
  const pSer: PointLoad[] = hasPoint ? [{ P: inp.P_G + inp.P_Q, a: inp.aP }] : [];
  const curve = beamDeflection(bc, inp.L, wSer, pSer, 1, 0, 0);
  const deflPts: [number, number][] = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N;
    const dy = curve.max > 0 ? amp * curve.at(t * inp.L) / curve.max : 0;
    return [x0 + t * availW, midY + dy];
  });
  const deflPath = deflPts
    .map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(' ');

  // Load labels — ULS design values, consistent with MEd/VEd shown below (γG=1.35, γQ=1.50)
  const wEd = 1.35 * inp.gk + 1.50 * inp.qk;
  const loadLabel = wEd > 0 ? `Ed=${formatQuantity(wEd, 'linearLoad', system, { precision: 1 })}` : '';
  const PEd = 1.35 * inp.P_G + 1.50 * inp.P_Q;
  const pLabel = hasPoint ? `Pd=${formatQuantity(PEd, 'force', system, { precision: 1 })}` : '';
  const showPLabel = pTop - 4 > 16;

  // Cotas. Las reacciones necesitan ~48 px bajo la viga: si el panel no los
  // tiene (el SVG móvil se escala a ~95 px de alto) se omiten del dibujo —
  // siguen estando en el listado de resultados y en el PDF— y la cota de L
  // vuelve a su sitio de siempre.
  const showReactions = result.valid && panelH - beamBot >= 70;
  const reacTail = beamBot + 28;
  const reacHead = beamBot + 14;
  const dimY = showReactions ? beamBot + 48 : beamBot + 16;

  const textStyle = isPdf ? { fontFamily: 'monospace', fontSize: '8px' } : undefined;
  const cls = isPdf ? undefined : 'font-mono text-[8px]';

  return (
    <g>
      {/* Beam body */}
      <rect x={x0} y={beamTop} width={availW} height={beamDepth}
        fill={C.beam} stroke={C.beamStroke} strokeWidth={isPdf ? 1 : 0.8}
      />

      {/* Load arrows + bar */}
      <line x1={x0} y1={arrowTop} x2={x1} y2={arrowTop} stroke={C.loadArrow} strokeWidth={1} />
      {Array.from({ length: nArrows }, (_, i) => {
        const ax = x0 + (i / (nArrows - 1)) * availW;
        return (
          <g key={i}>
            <line x1={ax} y1={arrowTop} x2={ax} y2={beamTop - 2}
              stroke={C.loadArrow} strokeWidth={1.25} />
            <polygon
              points={`${ax},${beamTop - 2} ${ax - 2.5},${beamTop - 7} ${ax + 2.5},${beamTop - 7}`}
              fill={C.loadArrow}
            />
          </g>
        );
      })}

      {/* Load label */}
      {loadLabel && (
        <text x={(x0 + x1) / 2} y={arrowTop - 5} textAnchor="middle"
          fontSize={8} fill={C.loadArrow} style={textStyle} className={cls}>
          {loadLabel}
        </text>
      )}

      {/* Carga puntual */}
      {hasPoint && (
        <g>
          <line x1={xP} y1={pTop} x2={xP} y2={beamTop - 2}
            stroke={C.loadArrow} strokeWidth={2} />
          <polygon
            points={`${xP},${beamTop - 1} ${xP - 3.5},${beamTop - 8} ${xP + 3.5},${beamTop - 8}`}
            fill={C.loadArrow}
          />
          {showPLabel && (
            <text x={xP} y={pTop - 4} textAnchor="middle"
              fontSize={8} fill={C.loadArrow} style={textStyle} className={cls}>
              {pLabel}
            </text>
          )}
        </g>
      )}

      {/* Deflected shape */}
      <path d={deflPath} fill="none" stroke={C.deflected} strokeWidth={1.25}
        strokeDasharray="4,3" />

      {/* Supports */}
      <LeftSupport />
      <RightSupport />

      {/* Reacciones en apoyos (solo el valor vertical; el momento de
          empotramiento va en el listado de resultados y en el PDF) */}
      {showReactions && result.reactions.map((r) => {
        const rx = r.id === 'left' ? x0 : x1;
        // Los apoyos caen a 12 px de los bordes del panel: con la etiqueta
        // centrada en el apoyo, la mitad se salía del viewBox y se cortaba.
        const labelX = Math.min(Math.max(rx, panelX + 26), panelX + panelW - 26);
        return (
          <g key={r.id}>
            <line x1={rx} y1={reacTail} x2={rx} y2={reacHead}
              stroke={C.deflected} strokeWidth={1.25} />
            <polygon
              points={`${rx},${reacHead} ${rx - 2.5},${reacHead + 5} ${rx + 2.5},${reacHead + 5}`}
              fill={C.deflected}
            />
            <text x={labelX} y={reacTail + 8} textAnchor="middle"
              fontSize={7} fill={C.deflected} style={textStyle} className={cls}>
              R={formatQuantity(r.R_d, 'force', system, { precision: 1 })}
            </text>
          </g>
        );
      })}

      {/* L dimension label */}
      <line x1={x0} y1={dimY} x2={x1} y2={dimY} stroke={C.dim} strokeWidth={0.7} />
      <line x1={x0} y1={dimY - 3} x2={x0} y2={dimY + 3} stroke={C.dim} strokeWidth={0.7} />
      <line x1={x1} y1={dimY - 3} x2={x1} y2={dimY + 3} stroke={C.dim} strokeWidth={0.7} />
      {hasPoint && (
        <>
          <line x1={xP} y1={dimY - 3} x2={xP} y2={dimY + 3} stroke={C.dim} strokeWidth={0.7} />
          <text x={(x0 + xP) / 2} y={dimY - 4} textAnchor="middle"
            fontSize={7} fill={C.dimText} style={textStyle} className={cls}>
            a={inp.aP}m
          </text>
        </>
      )}
      <text x={(x0 + x1) / 2} y={dimY + 10} textAnchor="middle"
        fontSize={8} fill={C.dimText} style={textStyle} className={cls}>
        L={inp.L}m
      </text>

      {/* ELU/ELS summary */}
      {result.valid && (
        <>
          <text x={(x0 + x1) / 2} y={panelH - (showReactions ? 6 : 10)} textAnchor="middle"
            fontSize={7} fill={C.label} style={textStyle} className={cls}>
            MEd={formatQuantity(result.MEd, 'moment', system, { precision: 1 })}  VEd={formatQuantity(result.VEd, 'force', system, { precision: 1 })}
          </text>
        </>
      )}
    </g>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function TimberBeamsSVG({ inp, result, mode, width, height }: TimberBeamsSVGProps) {
  const isPdf = mode === 'pdf';
  const C = isPdf ? PDF : SCREEN;
  const { system } = useUnitSystem();

  const leftW  = Math.floor(width * 0.35);
  const rightW = width - leftW;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Sección transversal y alzado de viga de madera"
      style={{ background: C.bg }}
    >
      {/* Divider */}
      <line x1={leftW} y1={6} x2={leftW} y2={height - 6}
        stroke={isPdf ? '#e0e0e0' : '#253147'} strokeWidth={0.8} />

      {/* Panel labels */}
      <text x={leftW / 2} y={10} textAnchor="middle" fontSize={8} fill={C.label}
        style={isPdf ? { fontFamily: 'monospace' } : undefined}
        className={isPdf ? undefined : 'font-mono text-[8px] fill-text-disabled'}>
        SECCIÓN
      </text>
      <text x={leftW + rightW / 2} y={10} textAnchor="middle" fontSize={8} fill={C.label}
        style={isPdf ? { fontFamily: 'monospace' } : undefined}
        className={isPdf ? undefined : 'font-mono text-[8px] fill-text-disabled'}>
        ALZADO
      </text>

      {/* Left: cross-section */}
      <CrossSection inp={inp} result={result} C={C} isPdf={isPdf} panelW={leftW} panelH={height} />

      {/* Right: elevation */}
      <Elevation inp={inp} result={result} C={C} isPdf={isPdf} panelX={leftW} panelW={rightW} panelH={height} system={system} />
    </svg>
  );
}
