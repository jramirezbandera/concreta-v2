// RC Beam — mobilized forces SVG.
//
// Diagrama de fuerzas que equilibran el momento aplicado, dibujado como un
// diagrama de cuerpo libre alrededor de la sección:
//
//   - Lado IZQUIERDO  → compresión (vectores apuntando HACIA la sección):
//       · Bloque de tensiones σ_c(y) en la cabeza de compresión (parábola-
//         rectángulo CE 21.3.3), llenado entre y=0 y y=x.
//       · Flecha F_s' en y=r_s (acero comprimido) apuntando a la sección.
//   - Lado DERECHO   → tracción (vectores apuntando AFUERA de la sección):
//       · Flecha F_s en y=d (acero traccionado).
//
// Convención cartesiana clásica: compresión negativa (←), tracción positiva (→).
// El bloque parábola-rectángulo es la integral de σ_c que produce el resultante
// F_c — más informativo que una sola flecha porque muestra cómo está
// realmente distribuida la tensión en la cabeza.
//
// Si ε_top ≤ ε_c2: sólo rama parabólica (sin meseta rectangular).
// Si ε_top  > ε_c2: hay meseta σ=fcd desde y=0 hasta y_p (transición).

import { type SectionAtMomentResult } from '../../lib/calculations/rcBeamsSection';
import { getConcrete } from '../../data/materials';
import { formatQuantity } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';

interface RCBeamForcesSVGProps {
  sectionResult: SectionAtMomentResult;
  h: number;
  /** fck para resolver fcd / ε_c2 / n de la parábola-rectángulo. */
  fck: number;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

const SCREEN_COLORS = {
  section: '#334155',
  sectionFill: 'transparent',
  compArrow: '#38bdf8',
  compFill: 'rgba(56,189,248,0.30)',
  compStroke: '#38bdf8',
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
  compFill: 'rgba(14,165,233,0.30)',
  compStroke: '#0ea5e9',
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
  fck,
  mode = 'screen',
  width = 220,
  height = 300,
}: RCBeamForcesSVGProps) {
  const { system } = useUnitSystem();
  const C = mode === 'pdf' ? PDF_COLORS : SCREEN_COLORS;
  const padTop = 24, padBottom = 24, padLeft = 18, padRight = 18;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const xSection = padLeft + plotW * 0.5; // sección al centro
  const yScale = plotH / h;
  const yAt = (y: number) => padTop + y * yScale;

  const { F_concrete, F_s_comp, F_s_tens, z_s_comp, z_s_tens, x, epsilon_top } = sectionResult;
  const concrete = getConcrete(fck);
  const { fcd, eps_c2, n } = concrete;

  // Magnitudes para escalar las flechas de acero.
  const maxF = Math.max(Math.abs(F_s_comp), Math.abs(F_s_tens), 1);
  const maxArrowLen = plotW * 0.40;
  const arrowLen = (F: number) => (Math.abs(F) / maxF) * maxArrowLen;

  // Escala del bloque de tensiones σ_c: σ=fcd → blockMaxW píxeles.
  const blockMaxW = plotW * 0.40;
  const sigmaScale = (sigma: number) => (sigma / fcd) * blockMaxW; // sigma ≥ 0

  // Construir el polígono parábola-rectángulo. Solo si hay compresión real (x>0
  // y |epsilon_top|>0). Sampleamos N puntos entre y=0 y y=x.
  let stressBlockPath: string | null = null;
  if (x > 0.01 && epsilon_top < 0) {
    const epsTopAbs = Math.abs(epsilon_top);
    const N = 24;
    const points: Array<[number, number]> = [];
    // Empezar en la fibra neutra (y=x, σ=0) y subir hasta la fibra superior (y=0).
    for (let i = 0; i <= N; i++) {
      const y = x - (x * i) / N; // y va de x → 0
      const epsAbs = epsTopAbs * (x - y) / x; // 0 en y=x, ε_top en y=0
      let sigma: number;
      if (epsAbs <= eps_c2) {
        sigma = fcd * (1 - Math.pow(1 - epsAbs / eps_c2, n));
      } else {
        sigma = fcd;
      }
      // El bloque se dibuja a la izquierda de la sección. xLeft < xSection.
      const xLeft = xSection - sigmaScale(sigma);
      points.push([xLeft, yAt(y)]);
    }
    // Cerrar el polígono por la línea de la sección (lado derecho).
    const startTop = `M ${xSection.toFixed(2)} ${yAt(0).toFixed(2)}`;
    const pointsPath = points.map(([px, py]) => `L ${px.toFixed(2)} ${py.toFixed(2)}`).join(' ');
    const closeBottom = `L ${xSection.toFixed(2)} ${yAt(x).toFixed(2)} Z`;
    stressBlockPath = `${startTop} ${pointsPath} ${closeBottom}`;
  }

  // Centroide del bloque (donde colocamos la etiqueta F_c).
  const z_concrete = sectionResult.z_concrete;
  const fcLabelX = xSection - blockMaxW - 6;
  const fcLabelY = yAt(z_concrete);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Fuerzas movilizadas: F_c=${F_concrete.toFixed(1)} kN (compresión, bloque parábola-rectángulo), F_s'=${F_s_comp.toFixed(1)} kN, F_s=${F_s_tens.toFixed(1)} kN`}
      style={{ background: C.bg, display: 'block' }}
    >
      <defs>
        <marker id="arr-tens" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L10,5 L0,10 Z" fill={C.tensArrow} />
        </marker>
        <marker id="arr-comp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L10,5 L0,10 Z" fill={C.compArrow} />
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

      {/* Bloque de tensiones σ_c — parábola-rectángulo a la izquierda */}
      {stressBlockPath && (
        <>
          <path d={stressBlockPath} fill={C.compFill} stroke={C.compStroke} strokeWidth="1" />
          {/* Línea horizontal punteada en y=x indicando la fibra neutra */}
          <line
            x1={xSection - blockMaxW - 4} y1={yAt(x)}
            x2={xSection + 4} y2={yAt(x)}
            stroke={C.labelDim} strokeWidth="0.5" strokeDasharray="2 2"
          />
          <text
            x={xSection - blockMaxW - 6} y={yAt(x) - 2}
            fill={C.labelDim} fontSize="8" textAnchor="end" fontFamily="var(--font-mono)"
          >
            FN (y=x)
          </text>
          {/* Etiqueta F_c centrada en z_concrete */}
          <text
            x={fcLabelX} y={fcLabelY - 4}
            fill={C.label} fontSize="10" textAnchor="end" fontFamily="var(--font-mono)" fontWeight="600"
          >
            F_c = {formatQuantity(Math.abs(F_concrete), 'force', system)}
          </text>
          <text
            x={fcLabelX} y={fcLabelY + 7}
            fill={C.labelDim} fontSize="8" textAnchor="end" fontFamily="var(--font-mono)"
          >
            σ_máx = {fcd.toFixed(1)} MPa
          </text>
        </>
      )}

      {/* F_s_comp en r_s — flecha apuntando hacia la sección (←, compresión) */}
      {Math.abs(F_s_comp) > 1e-3 && F_s_comp < 0 && (
        <ForceArrow
          y={yAt(z_s_comp)}
          xStart={xSection - arrowLen(F_s_comp) - 2}
          xEnd={xSection - 2}
          color={C.compArrow}
          markerId="arr-comp"
          label={`F_s' = ${formatQuantity(Math.abs(F_s_comp), 'force', system)}`}
          labelColor={C.label}
          labelAlign="end"
          labelX={xSection - arrowLen(F_s_comp) - 6}
        />
      )}
      {/* Caso edge: As' en tracción (sección con FN muy alta) → mostrar a la derecha */}
      {Math.abs(F_s_comp) > 1e-3 && F_s_comp > 0 && (
        <ForceArrow
          y={yAt(z_s_comp)}
          xStart={xSection + 2}
          xEnd={xSection + arrowLen(F_s_comp) + 2}
          color={C.tensArrow}
          markerId="arr-tens"
          label={`F_s' = ${formatQuantity(Math.abs(F_s_comp), 'force', system)}`}
          labelColor={C.label}
          labelAlign="start"
          labelX={xSection + arrowLen(F_s_comp) + 6}
        />
      )}

      {/* F_s_tens en d — flecha apuntando hacia afuera (→, tracción) */}
      {F_s_tens > 0 && (
        <ForceArrow
          y={yAt(z_s_tens)}
          xStart={xSection + 2}
          xEnd={xSection + arrowLen(F_s_tens) + 2}
          color={C.tensArrow}
          markerId="arr-tens"
          label={`F_s = ${formatQuantity(Math.abs(F_s_tens), 'force', system)}`}
          labelColor={C.label}
          labelAlign="start"
          labelX={xSection + arrowLen(F_s_tens) + 6}
        />
      )}
      {/* Caso edge: As en compresión (sección con FN debajo de d) → mostrar a la izquierda */}
      {F_s_tens < 0 && (
        <ForceArrow
          y={yAt(z_s_tens)}
          xStart={xSection - arrowLen(F_s_tens) - 2}
          xEnd={xSection - 2}
          color={C.compArrow}
          markerId="arr-comp"
          label={`F_s = ${formatQuantity(Math.abs(F_s_tens), 'force', system)}`}
          labelColor={C.label}
          labelAlign="end"
          labelX={xSection - arrowLen(F_s_tens) - 6}
        />
      )}

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
      <text x={xSection + 8} y={padTop + 4} fill={C.labelDim} fontSize="8" textAnchor="start" fontFamily="var(--font-mono)">y=0</text>
      <text x={xSection + 8} y={padTop + plotH - 1} fill={C.labelDim} fontSize="8" textAnchor="start" fontFamily="var(--font-mono)">y=h</text>
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
