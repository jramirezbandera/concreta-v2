// RC Column N-M interaction diagram SVG.
//
// Capacity envelope (axial N vs moment M) for ONE bending axis:
//   - solid curve  = capacity WITH the actual reinforcement
//   - dashed curve = capacity of the plain concrete section (no rebar) —
//                    the reference that shows how much the steel adds
//   - marker       = applied pair (N_Ed, M_Ed,tot); filled green inside the
//                    envelope, red + ring outside
//
// The N axis is signed: tension (negative) -> compression (positive). M >= 0.
//
// mode='screen': dark theme. mode='pdf': grayscale + inline styles.

import { type AxisInteraction } from '../../lib/calculations/rcColumns';

interface RCColumnInteractionSVGProps {
  data: AxisInteraction;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

// Screen palette via theme tokens (dark values match the old literals).
const SCREEN = {
  axis: 'var(--color-chart-rebar-dim)', grid: 'var(--color-border-main)', zero: 'var(--color-chart-rebar-faint)',
  reinforced: 'var(--color-accent)', plain: 'var(--color-chart-rebar-faint)',
  label: 'var(--color-chart-label)', labelDim: 'var(--color-chart-dim-text)',
  ok: 'var(--color-state-ok)', fail: 'var(--color-state-fail)',
  bg: 'transparent',
};
const PDF = {
  axis: '#666666', grid: '#dddddd', zero: '#999999',
  reinforced: '#0ea5e9', plain: '#999999',
  label: '#1e293b', labelDim: '#64748b',
  ok: '#16a34a', fail: '#dc2626',
  bg: '#ffffff',
};

export function RCColumnInteractionSVG({
  data,
  mode = 'screen',
  width = 300,
  height = 300,
}: RCColumnInteractionSVGProps) {
  const C = mode === 'pdf' ? PDF : SCREEN;
  const padTop = 30, padBottom = 34, padLeft = 44, padRight = 16;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const { reinforced, plain, applied, inside, utilization, governing, axis } = data;

  // Degenerate guard — section produced no usable envelope.
  if (reinforced.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`Diagrama de interacción ${axis}: sin datos`}
        style={{ background: C.bg, display: 'block' }}>
        <text x={width / 2} y={height / 2} fill={C.labelDim} fontSize="10"
          textAnchor="middle" fontFamily="var(--font-mono)">sin datos</text>
      </svg>
    );
  }

  // ── Bounds — include the applied point so the marker is always on-plot ────
  const allN = [...reinforced.map((p) => p.N), ...plain.map((p) => p.N), applied.N, 0];
  const allM = [...reinforced.map((p) => p.M), ...plain.map((p) => p.M), applied.M, 0];
  const nMin = Math.min(...allN);
  const nMax = Math.max(...allN);
  const mMax = Math.max(...allM) * 1.12 || 1;
  const nSpan = nMax - nMin || 1;

  const xAt = (N: number) => padLeft + ((N - nMin) / nSpan) * plotW;
  const yAt = (M: number) => padTop + plotH - (M / mMax) * plotH;

  const toPath = (pts: typeof reinforced) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.N).toFixed(1)} ${yAt(p.M).toFixed(1)}`).join(' ');

  const mx = xAt(applied.N);
  const my = yAt(applied.M);
  const markerColor = inside ? C.ok : C.fail;

  // Axis ticks — endpoints + zero, rounded to integers.
  const nTicks = [nMin, 0, nMax].filter((v, i, a) => a.indexOf(v) === i);
  const mTicks = [0, mMax / 2, mMax / 1.12];

  const x0 = xAt(0);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Diagrama de interacción N-M eje ${axis}: N_Ed=${applied.N.toFixed(0)} kN, M_Ed=${applied.M.toFixed(1)} kN·m, ${inside ? 'dentro' : 'fuera'} de la envolvente, η=${isFinite(utilization) ? utilization.toFixed(2) : '∞'}`}
      style={{ background: C.bg, display: 'block' }}
    >
      <g opacity={governing ? 1 : 0.55}>
        {/* Título */}
        <text x={padLeft} y={14} fill={C.label} fontSize="10" fontWeight="600"
          fontFamily="var(--font-mono)" textAnchor="start">
          EJE {axis.toUpperCase()}
        </text>
        {governing && (
          <text x={padLeft + 42} y={14} fill={markerColor} fontSize="8" fontWeight="600"
            fontFamily="var(--font-mono)" textAnchor="start">
            GOBERNANTE
          </text>
        )}
        {/* η utilización, esquina superior derecha */}
        <text x={width - padRight} y={14} fill={inside ? C.ok : C.fail} fontSize="10"
          fontWeight="600" fontFamily="var(--font-mono)" textAnchor="end">
          η = {isFinite(utilization) ? utilization.toFixed(2) : '∞'}
        </text>

        {/* Marco del plot */}
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotH}
          stroke={C.axis} strokeWidth="1" />
        <line x1={padLeft} y1={padTop + plotH} x2={padLeft + plotW} y2={padTop + plotH}
          stroke={C.axis} strokeWidth="1" />

        {/* Línea de N = 0 (separa tracción / compresión) */}
        {x0 > padLeft + 1 && x0 < padLeft + plotW - 1 && (
          <line x1={x0} y1={padTop} x2={x0} y2={padTop + plotH}
            stroke={C.zero} strokeWidth="0.6" strokeDasharray="2 2" />
        )}

        {/* Curva sin armar (discontinua) */}
        <path d={toPath(plain)} fill="none" stroke={C.plain} strokeWidth="1.1"
          strokeDasharray="4 3" />
        {/* Curva con armado (sólida) */}
        <path d={toPath(reinforced)} fill="none" stroke={C.reinforced} strokeWidth="1.6" />

        {/* Guías del marcador hacia los ejes */}
        <line x1={mx} y1={my} x2={mx} y2={padTop + plotH}
          stroke={markerColor} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.7" />
        <line x1={padLeft} y1={my} x2={mx} y2={my}
          stroke={markerColor} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.7" />
        {/* Marcador solicitante — relleno por estado; anillo extra si fuera */}
        {!inside && (
          <circle cx={mx} cy={my} r="7" fill="none" stroke={C.fail} strokeWidth="1.2" />
        )}
        <circle cx={mx} cy={my} r="3.5" fill={markerColor}
          stroke={mode === 'pdf' ? '#ffffff' : '#0b1220'} strokeWidth="1" />
        <text x={mx + 9} y={my - 5} fill={C.label} fontSize="9" fontWeight="600"
          fontFamily="var(--font-mono)" textAnchor="start">
          ({applied.N.toFixed(0)}; {applied.M.toFixed(1)})
        </text>

        {/* Ticks eje N */}
        {nTicks.map((v) => (
          <text key={`n${v}`} x={xAt(v)} y={padTop + plotH + 12} fill={C.labelDim}
            fontSize="7.5" textAnchor="middle" fontFamily="var(--font-mono)">
            {v.toFixed(0)}
          </text>
        ))}
        {/* Ticks eje M */}
        {mTicks.map((v) => (
          <text key={`m${v}`} x={padLeft - 4} y={yAt(v) + 3} fill={C.labelDim}
            fontSize="7.5" textAnchor="end" fontFamily="var(--font-mono)">
            {v.toFixed(0)}
          </text>
        ))}

        {/* Etiquetas de eje */}
        <text x={padLeft + plotW / 2} y={height - 6} fill={C.labelDim} fontSize="8"
          textAnchor="middle" fontFamily="var(--font-mono)">
          N (kN)
        </text>
        <text x={11} y={padTop + plotH / 2} fill={C.labelDim} fontSize="8"
          textAnchor="middle" fontFamily="var(--font-mono)"
          transform={`rotate(-90 11 ${padTop + plotH / 2})`}>
          M (kN·m)
        </text>

        {/* Leyenda */}
        <line x1={padLeft} y1={height - 18} x2={padLeft + 14} y2={height - 18}
          stroke={C.reinforced} strokeWidth="1.6" />
        <text x={padLeft + 17} y={height - 15} fill={C.labelDim} fontSize="7"
          fontFamily="var(--font-mono)" textAnchor="start">con armado</text>
        <line x1={padLeft + 78} y1={height - 18} x2={padLeft + 92} y2={height - 18}
          stroke={C.plain} strokeWidth="1.1" strokeDasharray="4 3" />
        <text x={padLeft + 95} y={height - 15} fill={C.labelDim} fontSize="7"
          fontFamily="var(--font-mono)" textAnchor="start">sin armar</text>
      </g>
    </svg>
  );
}
