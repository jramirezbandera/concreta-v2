// Steel column My-Mz biaxial interaction contour SVG.
//
// At the applied axial load N_Ed, the closed region of (My, Mz) moment pairs
// the column resists — EC3 6.61/6.62. Those two interaction checks are linear
// in (My, Mz) at fixed N, so the safe region is a POLYGON: the section-
// resistance rectangle clipped by the two interaction lines.
//
// The applied (My_Ed, Mz_Ed) point is marked — green inside the region
// (biaxial check passes), red + ring outside. One diagram = the honest
// biaxial verdict, unlike two separate N-M diagrams which can each read
// "pass" while the biaxial interaction fails.
//
// mode='screen': dark theme. mode='pdf': grayscale + inline styles.

import {
  type SteelInteraction,
  buildSteelInteractionPolygon,
} from '../../lib/calculations/steelColumns';

interface SteelColumnInteractionSVGProps {
  data: SteelInteraction;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

const SCREEN = {
  axis: '#475569', grid: '#22304d',
  envelope: '#38bdf8', envelopeFill: 'rgba(56,189,248,0.12)',
  label: '#e2e8f0', labelDim: '#94a3b8',
  ok: '#22c55e', fail: '#ef4444',
  bg: 'transparent',
};
const PDF = {
  axis: '#666666', grid: '#dddddd',
  envelope: '#0ea5e9', envelopeFill: 'rgba(14,165,233,0.12)',
  label: '#1e293b', labelDim: '#64748b',
  ok: '#16a34a', fail: '#dc2626',
  bg: '#ffffff',
};

export function SteelColumnInteractionSVG({
  data,
  mode = 'screen',
  width = 300,
  height = 300,
}: SteelColumnInteractionSVGProps) {
  const C = mode === 'pdf' ? PDF : SCREEN;
  const padTop = 30, padBottom = 36, padLeft = 48, padRight = 16;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const poly = buildSteelInteractionPolygon(data);
  const { applied, inside, line1, line2 } = data;

  // Utilización a flexión esviada: máximo de las dos rectas de interacción
  // evaluadas en el punto solicitante. util_k = (1−rhs_k) + cy·My + cz·Mz.
  const utilOf = (ln: typeof line1) =>
    (1 - ln.rhs) + ln.cy * applied.My + ln.cz * applied.Mz;
  const eta = Math.max(utilOf(line1), utilOf(line2));

  // Encuadre al contorno real (no al rectángulo de resistencias de sección):
  // la zona segura suele ser menor que My_cap×Mz_cap porque la interacción la
  // recorta. Incluye el punto solicitante para que el marcador siempre se vea.
  const myMax = Math.max(applied.My, ...poly.map((p) => p.My), 1) * 1.15;
  const mzMax = Math.max(applied.Mz, ...poly.map((p) => p.Mz), 1) * 1.15;

  const xAt = (My: number) => padLeft + (My / myMax) * plotW;
  const yAt = (Mz: number) => padTop + plotH - (Mz / mzMax) * plotH;

  const polyPath = poly.length >= 3
    ? poly.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.My).toFixed(1)} ${yAt(p.Mz).toFixed(1)}`).join(' ') + ' Z'
    : null;

  const mx = xAt(applied.My);
  const my = yAt(applied.Mz);
  const markerColor = inside ? C.ok : C.fail;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Contorno de interacción biaxial My-Mz: My_Ed=${applied.My.toFixed(1)}, Mz_Ed=${applied.Mz.toFixed(1)} kN·m, ${inside ? 'dentro' : 'fuera'} de la envolvente, η=${isFinite(eta) ? eta.toFixed(2) : '∞'}`}
      style={{ background: C.bg, display: 'block' }}
    >
      {/* Título */}
      <text x={padLeft} y={14} fill={C.label} fontSize="10" fontWeight="600"
        fontFamily="var(--font-mono)" textAnchor="start">
        INTERACCIÓN BIAXIAL
      </text>
      <text x={width - padRight} y={14} fill={inside ? C.ok : C.fail} fontSize="10"
        fontWeight="600" fontFamily="var(--font-mono)" textAnchor="end">
        η = {isFinite(eta) ? eta.toFixed(2) : '∞'}
      </text>

      {/* Ejes */}
      <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotH}
        stroke={C.axis} strokeWidth="1" />
      <line x1={padLeft} y1={padTop + plotH} x2={padLeft + plotW} y2={padTop + plotH}
        stroke={C.axis} strokeWidth="1" />

      {/* Envolvente de capacidad (polígono) */}
      {polyPath ? (
        <path d={polyPath} fill={C.envelopeFill} stroke={C.envelope} strokeWidth="1.6" />
      ) : (
        <text x={padLeft + plotW / 2} y={padTop + plotH / 2} fill={C.fail} fontSize="9"
          textAnchor="middle" fontFamily="var(--font-mono)">
          el axil agota la capacidad
        </text>
      )}

      {/* Guías del marcador a los ejes */}
      <line x1={mx} y1={my} x2={mx} y2={padTop + plotH}
        stroke={markerColor} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.7" />
      <line x1={padLeft} y1={my} x2={mx} y2={my}
        stroke={markerColor} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.7" />
      {/* Marcador solicitante — relleno por estado, anillo extra si fuera */}
      {!inside && (
        <circle cx={mx} cy={my} r="7" fill="none" stroke={C.fail} strokeWidth="1.2" />
      )}
      <circle cx={mx} cy={my} r="3.5" fill={markerColor}
        stroke={mode === 'pdf' ? '#ffffff' : '#0b1220'} strokeWidth="1" />
      <text x={mx + 9} y={my - 5} fill={C.label} fontSize="9" fontWeight="600"
        fontFamily="var(--font-mono)" textAnchor="start">
        ({applied.My.toFixed(1)}; {applied.Mz.toFixed(1)})
      </text>

      {/* Ticks */}
      <text x={padLeft} y={padTop + plotH + 12} fill={C.labelDim} fontSize="7.5"
        textAnchor="middle" fontFamily="var(--font-mono)">0</text>
      <text x={padLeft + plotW} y={padTop + plotH + 12} fill={C.labelDim} fontSize="7.5"
        textAnchor="middle" fontFamily="var(--font-mono)">{(myMax / 1.15).toFixed(0)}</text>
      <text x={padLeft - 4} y={padTop + 3} fill={C.labelDim} fontSize="7.5"
        textAnchor="end" fontFamily="var(--font-mono)">{(mzMax / 1.15).toFixed(0)}</text>

      {/* Etiquetas de eje */}
      <text x={padLeft + plotW / 2} y={height - 6} fill={C.labelDim} fontSize="8"
        textAnchor="middle" fontFamily="var(--font-mono)">
        My (kN·m)
      </text>
      <text x={11} y={padTop + plotH / 2} fill={C.labelDim} fontSize="8"
        textAnchor="middle" fontFamily="var(--font-mono)"
        transform={`rotate(-90 11 ${padTop + plotH / 2})`}>
        Mz (kN·m)
      </text>
    </svg>
  );
}
