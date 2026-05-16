// RC Beam — mobilized forces SVG.
//
// Diagrama de fuerzas movilizadas que equilibran el momento aplicado.
// Vertical (mismo height que la sección y el strain SVG), con 3 flechas:
//   - F_concrete (en z_concrete del bloque comprimido): flecha hacia adentro
//   - F_s_comp (en r_s): compresión steel
//   - F_s_tens (en d): tracción steel, flecha hacia afuera
//
// Convención: F > 0 = tracción (vector hacia derecha desde la sección).
// Magnitudes en kN/Tn según unit system activo (formatQuantity).

import { type SectionAtMomentResult } from '../../lib/calculations/rcBeamsSection';
import { formatQuantity } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';

interface RCBeamForcesSVGProps {
  sectionResult: SectionAtMomentResult;
  h: number;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

const SCREEN_COLORS = {
  section: '#334155',
  sectionFill: 'transparent',
  compArrow: '#38bdf8',
  tensArrow: '#22c55e',
  zeroArrow: '#64748b',
  axis: '#475569',
  label: '#e2e8f0',
  labelDim: '#94a3b8',
  bg: 'transparent',
};

const PDF_COLORS = {
  section: '#334155',
  sectionFill: '#f8fafc',
  compArrow: '#0ea5e9',
  tensArrow: '#16a34a',
  zeroArrow: '#475569',
  axis: '#475569',
  label: '#1e293b',
  labelDim: '#64748b',
  bg: '#ffffff',
};

export function RCBeamForcesSVG({
  sectionResult,
  h,
  mode = 'screen',
  width = 220,
  height = 300,
}: RCBeamForcesSVGProps) {
  const { system } = useUnitSystem();
  const C = mode === 'pdf' ? PDF_COLORS : SCREEN_COLORS;
  const padTop = 24, padBottom = 24, padLeft = 32, padRight = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const xSection = padLeft + plotW * 0.25; // sección a la izquierda del plot
  const yScale = plotH / h;
  const yAt = (y: number) => padTop + y * yScale;

  const { F_concrete, F_s_comp, F_s_tens, z_concrete, z_s_comp, z_s_tens } = sectionResult;
  // Magnitudes para escalar las flechas. Mayor magnitud → flecha más larga.
  const maxF = Math.max(Math.abs(F_concrete), Math.abs(F_s_comp), Math.abs(F_s_tens), 1);
  const maxArrowLen = plotW * 0.65;
  const arrowLen = (F: number) => (Math.abs(F) / maxF) * maxArrowLen;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Fuerzas movilizadas: F_c=${F_concrete.toFixed(1)} kN, F_s'=${F_s_comp.toFixed(1)} kN, F_s=${F_s_tens.toFixed(1)} kN`}
      style={{ background: C.bg, display: 'block' }}
    >
      <defs>
        <marker id="arr-tens" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L10,5 L0,10 Z" fill={C.tensArrow} />
        </marker>
        <marker id="arr-comp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L10,5 L0,10 Z" fill={C.compArrow} />
        </marker>
        <marker id="arr-zero" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 Z" fill={C.zeroArrow} />
        </marker>
      </defs>

      {/* Sección como línea vertical (silueta) */}
      <line
        x1={xSection} y1={padTop}
        x2={xSection} y2={padTop + plotH}
        stroke={C.section} strokeWidth="2.5"
      />
      {/* Top + bottom caps */}
      <line x1={xSection - 6} y1={padTop} x2={xSection + 6} y2={padTop} stroke={C.section} strokeWidth="1.5" />
      <line x1={xSection - 6} y1={padTop + plotH} x2={xSection + 6} y2={padTop + plotH} stroke={C.section} strokeWidth="1.5" />

      {/* Flecha F_concrete (compresión, va hacia dentro = derecha desde la izquierda) */}
      <ForceArrow
        y={yAt(z_concrete)}
        xStart={xSection - arrowLen(F_concrete)}
        xEnd={xSection - 2}
        color={F_concrete < 0 ? C.compArrow : C.zeroArrow}
        markerId={F_concrete < 0 ? 'arr-comp' : 'arr-zero'}
        label={`F_c = ${formatQuantity(Math.abs(F_concrete), 'force', system)}`}
        labelColor={C.label}
        labelAlign="end"
        labelX={xSection - arrowLen(F_concrete) - 4}
      />

      {/* Flecha F_s_comp en r_s (compresión) */}
      {Math.abs(F_s_comp) > 1e-3 && (
        <ForceArrow
          y={yAt(z_s_comp)}
          xStart={xSection - arrowLen(F_s_comp)}
          xEnd={xSection - 2}
          color={F_s_comp < 0 ? C.compArrow : C.tensArrow}
          markerId={F_s_comp < 0 ? 'arr-comp' : 'arr-tens'}
          label={`F_s' = ${formatQuantity(Math.abs(F_s_comp), 'force', system)}`}
          labelColor={C.label}
          labelAlign="end"
          labelX={xSection - arrowLen(F_s_comp) - 4}
        />
      )}

      {/* Flecha F_s_tens en d (tracción hacia afuera = derecha desde la sección) */}
      <ForceArrow
        y={yAt(z_s_tens)}
        xStart={xSection + 2}
        xEnd={xSection + arrowLen(F_s_tens)}
        color={F_s_tens > 0 ? C.tensArrow : C.zeroArrow}
        markerId={F_s_tens > 0 ? 'arr-tens' : 'arr-zero'}
        label={`F_s = ${formatQuantity(Math.abs(F_s_tens), 'force', system)}`}
        labelColor={C.label}
        labelAlign="start"
        labelX={xSection + arrowLen(F_s_tens) + 4}
      />

      {/* Y-axis label */}
      <text
        x={6} y={padTop + plotH / 2}
        fill={C.labelDim} fontSize="9"
        fontFamily="var(--font-mono)"
        transform={`rotate(-90 6 ${padTop + plotH / 2})`}
        textAnchor="middle"
      >
        ALTURA FIBRA (mm)
      </text>

      {/* Tick labels 0 y h */}
      <text x={xSection - 10} y={padTop - 4} fill={C.labelDim} fontSize="8" textAnchor="end" fontFamily="var(--font-mono)">{h}</text>
      <text x={xSection - 10} y={padTop + plotH + 10} fill={C.labelDim} fontSize="8" textAnchor="end" fontFamily="var(--font-mono)">0</text>
    </svg>
  );
}

interface ForceArrowProps {
  y: number;
  xStart: number;
  xEnd: number;
  color: string;
  markerId: string;
  label: string;
  labelColor: string;
  labelAlign: 'start' | 'middle' | 'end';
  labelX: number;
}

function ForceArrow({ y, xStart, xEnd, color, markerId, label, labelColor, labelAlign, labelX }: ForceArrowProps) {
  return (
    <>
      <line
        x1={xStart} y1={y}
        x2={xEnd} y2={y}
        stroke={color} strokeWidth="1.5"
        markerEnd={`url(#${markerId})`}
      />
      <text
        x={labelX} y={y - 4}
        fill={labelColor} fontSize="10"
        fontFamily="var(--font-mono)"
        fontWeight="600"
        textAnchor={labelAlign}
      >
        {label}
      </text>
    </>
  );
}
