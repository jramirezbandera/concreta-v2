// RC Beam — mobilized forces SVG.
//
// Diagrama de fuerzas que equilibran el momento aplicado, dibujado como un
// diagrama de cuerpo libre alrededor de la sección:
//
//   - Lado IZQUIERDO  → compresión:
//       · ENVELOPE rectangular punteado: el bloque parábola-rectángulo CE 21.3.3
//         a plena capacidad (σ=fcd uniforme entre y=0 y y=x). Es el "techo"
//         de lo que la cabeza de compresión podría aportar si el hormigón
//         estuviera plenamente plastificado.
//       · FILLED σ_c(y): la distribución real de tensiones al Md aplicado,
//         siempre contenida dentro del envelope. Cuando ε_top ≥ ε_c2 el fill
//         alcanza el borde izquierdo del envelope (parte alta = rectángulo)
//         y se curva al acercarse a la fibra neutra (parte baja = parábola).
//       · Flecha F_s' en y=r_s (acero comprimido) apuntando HACIA la sección.
//   - Lado DERECHO   → tracción:
//       · Flecha F_s en y=d. Apunta HACIA la sección (←), sentido OPUESTO a
//         las flechas de compresión (→). Compresión y tracción forman el par
//         de fuerzas resistente: dibujarlas con distinto sentido deja claro
//         de un vistazo qué fibra comprime y cuál tracciona.
//
// Convención de signos (magnitudes): compresión negativa, tracción positiva.
//
// Etiquetas SIEMPRE inside-bounds (anchor=start desde el borde izquierdo del
// envelope, no end-anchor que clipea fuera del SVG).

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

// Screen palette via theme tokens (dark values match the old literals exactly).
const SCREEN_COLORS = {
  section: 'var(--color-chart-section)',                              // #334155
  envelope: 'var(--color-chart-rebar-dim)',                          // #475569
  compArrow: 'var(--color-accent)',                                  // #38bdf8
  compFill: 'color-mix(in srgb, var(--color-accent) 35%, transparent)',
  compStroke: 'var(--color-accent)',                                 // #38bdf8
  tensArrow: 'var(--color-state-ok)',                                // #22c55e
  axis: 'var(--color-chart-rebar-dim)',                              // #475569
  label: 'var(--color-chart-label)',                                 // #e2e8f0
  labelDim: 'var(--color-chart-dim-text)',                           // #94a3b8
  bg: 'transparent',
};

const PDF_COLORS = {
  section: '#334155',
  envelope: '#94a3b8',
  compArrow: '#0ea5e9',
  compFill: 'rgba(14,165,233,0.35)',
  compStroke: '#0ea5e9',
  tensArrow: '#16a34a',
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
  // Padding más generoso a la izquierda para acomodar etiquetas dentro del SVG.
  const padTop = 28, padBottom = 24, padLeft = 8, padRight = 8;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  // Sección desplazada al 55% para dejar más espacio al bloque de compresión (izq)
  // que es lo más visualmente denso. La parte derecha sólo lleva 2 flechas.
  const xSection = padLeft + plotW * 0.55;
  const yScale = plotH / h;
  const yAt = (y: number) => padTop + y * yScale;

  const { F_concrete, F_s_comp, F_s_tens, z_s_comp, z_s_tens, x, epsilon_top } = sectionResult;
  const concrete = getConcrete(fck);
  const { fcd, eps_c2, n } = concrete;

  // Magnitudes para escalar las flechas de acero.
  const maxF = Math.max(Math.abs(F_s_comp), Math.abs(F_s_tens), 1);
  const maxArrowLen = (plotW - (xSection - padLeft)) * 0.85; // ancho disponible a la derecha
  const arrowLen = (F: number) => (Math.abs(F) / maxF) * maxArrowLen;

  // Escala del bloque: si σ=fcd → ancho = blockMaxW.
  // blockMaxW = todo el ancho disponible a la izquierda menos pequeño margen.
  const blockMaxW = (xSection - padLeft) * 0.78;
  const blockLeftX = xSection - blockMaxW;
  const sigmaScale = (sigma: number) => (sigma / fcd) * blockMaxW;

  // σ en la fibra superior (para mostrar % de fcd utilizado).
  let sigmaTop = 0;
  const epsTopAbs = Math.abs(epsilon_top);
  if (epsilon_top < 0) {
    if (epsTopAbs <= eps_c2) {
      sigmaTop = fcd * (1 - Math.pow(1 - epsTopAbs / eps_c2, n));
    } else {
      sigmaTop = fcd;
    }
  }
  const sigmaTopPct = (sigmaTop / fcd) * 100;

  // Construir el polígono de tensiones reales. Sólo si hay compresión real.
  let stressBlockPath: string | null = null;
  if (x > 0.01 && epsilon_top < 0) {
    const N = 28;
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= N; i++) {
      const y = x - (x * i) / N; // y va de x → 0
      const epsAbs = epsTopAbs * (x - y) / x;
      const sigma = epsAbs <= eps_c2
        ? fcd * (1 - Math.pow(1 - epsAbs / eps_c2, n))
        : fcd;
      const xLeft = xSection - sigmaScale(sigma);
      points.push([xLeft, yAt(y)]);
    }
    // Polígono cerrado: esquina sup-der → borde derecho (sección) baja a la
    // fibra neutra → curva σ_c(y) sube hasta la esquina sup-izq → Z cierra el
    // borde superior. Sin diagonales espurias.
    const startTop = `M ${xSection.toFixed(2)} ${yAt(0).toFixed(2)}`;
    const pointsPath = points.map(([px, py]) => `L ${px.toFixed(2)} ${py.toFixed(2)}`).join(' ');
    stressBlockPath = `${startTop} ${pointsPath} Z`;
  }

  // ¿Dibujamos envelope? Sólo si la cabeza de compresión existe (x>0).
  const showEnvelope = x > 0.01;
  const envelopeYTop = yAt(0);
  const envelopeYBot = yAt(x);
  const envelopeH = envelopeYBot - envelopeYTop;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Fuerzas movilizadas: F_c=${F_concrete.toFixed(1)} kN (bloque parábola-rectángulo, σ_top=${sigmaTop.toFixed(1)} MPa = ${sigmaTopPct.toFixed(0)}% de fcd), F_s'=${F_s_comp.toFixed(1)} kN, F_s=${F_s_tens.toFixed(1)} kN`}
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

      {/* Sección vertical */}
      <line x1={xSection} y1={padTop} x2={xSection} y2={padTop + plotH} stroke={C.section} strokeWidth="2.5" />
      <line x1={xSection - 6} y1={padTop} x2={xSection + 6} y2={padTop} stroke={C.section} strokeWidth="1.5" />
      <line x1={xSection - 6} y1={padTop + plotH} x2={xSection + 6} y2={padTop + plotH} stroke={C.section} strokeWidth="1.5" />

      {/* === BLOQUE DE COMPRESIÓN === */}
      {showEnvelope && (
        <>
          {/* Envelope rectangular punteado (σ=fcd plateau, max capacity) */}
          <rect
            x={blockLeftX}
            y={envelopeYTop}
            width={blockMaxW}
            height={envelopeH}
            fill="none"
            stroke={C.envelope}
            strokeWidth="0.6"
            strokeDasharray="3 2"
          />
          {/* Filled actual stress curve */}
          {stressBlockPath && (
            <path d={stressBlockPath} fill={C.compFill} stroke={C.compStroke} strokeWidth="1.2" />
          )}
          {/* Línea horizontal punteada en y=x (fibra neutra) */}
          <line
            x1={blockLeftX - 4} y1={envelopeYBot}
            x2={xSection + 6} y2={envelopeYBot}
            stroke={C.labelDim} strokeWidth="0.5" strokeDasharray="2 2"
          />
          {/* Label F_c — anchor=start desde el borde izquierdo del envelope.
              Se sitúa JUSTO ENCIMA del envelope para no colisionar con F_s'. */}
          <text
            x={blockLeftX} y={envelopeYTop - 14}
            fill={C.label} fontSize="10" textAnchor="start"
            fontFamily="var(--font-mono)" fontWeight="600"
          >
            F_c = {formatQuantity(Math.abs(F_concrete), 'force', system)}
          </text>
          <text
            x={blockLeftX} y={envelopeYTop - 4}
            fill={C.labelDim} fontSize="8" textAnchor="start"
            fontFamily="var(--font-mono)"
          >
            σ_top={sigmaTop.toFixed(1)} MPa ({sigmaTopPct.toFixed(0)}% fcd)
          </text>
          {/* Label fcd en el borde izquierdo del envelope */}
          <text
            x={blockLeftX - 2} y={envelopeYTop + envelopeH / 2}
            fill={C.labelDim} fontSize="7" textAnchor="end"
            fontFamily="var(--font-mono)"
            transform={`rotate(-90 ${blockLeftX - 2} ${envelopeYTop + envelopeH / 2})`}
          >
            σ=fcd={fcd.toFixed(1)}
          </text>
          {/* Label FN debajo de la línea punteada de la fibra neutra */}
          <text
            x={xSection + 8} y={envelopeYBot + 9}
            fill={C.labelDim} fontSize="8" textAnchor="start"
            fontFamily="var(--font-mono)"
          >
            FN (y=x={x.toFixed(0)}mm)
          </text>
        </>
      )}

      {/* === FLECHA F_s' (acero comprimido) === */}
      {Math.abs(F_s_comp) > 1e-3 && F_s_comp < 0 && (
        <CompArrow
          y={yAt(z_s_comp)}
          xSection={xSection}
          length={arrowLen(F_s_comp)}
          color={C.compArrow}
          markerId="arr-comp"
          label={`F_s' = ${formatQuantity(Math.abs(F_s_comp), 'force', system)}`}
          labelColor={C.label}
          minLeftX={padLeft + 2}
        />
      )}
      {Math.abs(F_s_comp) > 1e-3 && F_s_comp > 0 && (
        <TensArrow
          y={yAt(z_s_comp)}
          xSection={xSection}
          length={arrowLen(F_s_comp)}
          color={C.tensArrow}
          markerId="arr-tens"
          label={`F_s' = ${formatQuantity(Math.abs(F_s_comp), 'force', system)}`}
          labelColor={C.label}
          maxRightX={width - padRight - 2}
        />
      )}

      {/* === FLECHA F_s (acero traccionado) === */}
      {F_s_tens > 0 && (
        <TensArrow
          y={yAt(z_s_tens)}
          xSection={xSection}
          length={arrowLen(F_s_tens)}
          color={C.tensArrow}
          markerId="arr-tens"
          label={`F_s = ${formatQuantity(Math.abs(F_s_tens), 'force', system)}`}
          labelColor={C.label}
          maxRightX={width - padRight - 2}
        />
      )}
      {F_s_tens < 0 && (
        <CompArrow
          y={yAt(z_s_tens)}
          xSection={xSection}
          length={arrowLen(F_s_tens)}
          color={C.compArrow}
          markerId="arr-comp"
          label={`F_s = ${formatQuantity(Math.abs(F_s_tens), 'force', system)}`}
          labelColor={C.label}
          minLeftX={padLeft + 2}
        />
      )}

      {/* Tick labels y=0 y y=h */}
      <text x={xSection + 8} y={padTop + 4} fill={C.labelDim} fontSize="8" textAnchor="start" fontFamily="var(--font-mono)">y=0</text>
      <text x={xSection + 8} y={padTop + plotH - 1} fill={C.labelDim} fontSize="8" textAnchor="start" fontFamily="var(--font-mono)">y=h</text>
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Arrow components — labels positioned to stay inside SVG bounds.
// -----------------------------------------------------------------------------

interface CompArrowProps {
  y: number;
  xSection: number;
  length: number;
  color: string;
  markerId: string;
  label: string;
  labelColor: string;
  /** Mínimo x para etiqueta (no salirse del SVG por la izquierda). */
  minLeftX: number;
}

function CompArrow({ y, xSection, length, color, markerId, label, labelColor, minLeftX }: CompArrowProps) {
  // Flecha apunta HACIA la sección (de izquierda a derecha hacia xSection).
  const xStart = xSection - length - 2;
  const xEnd = xSection - 2;
  // Etiqueta justo encima de la cola de la flecha, anchor=start.
  // Si xStart se sale por la izquierda, anclamos al minLeftX.
  const labelX = Math.max(minLeftX, xStart);
  return (
    <>
      <line x1={xStart} y1={y} x2={xEnd} y2={y} stroke={color} strokeWidth="1.5" markerEnd={`url(#${markerId})`} />
      <text x={labelX} y={y - 4} fill={labelColor} fontSize="10" fontFamily="var(--font-mono)" fontWeight="600" textAnchor="start">
        {label}
      </text>
    </>
  );
}

interface TensArrowProps {
  y: number;
  xSection: number;
  length: number;
  color: string;
  markerId: string;
  label: string;
  labelColor: string;
  /** Máximo x para etiqueta (no salirse del SVG por la derecha). */
  maxRightX: number;
}

function TensArrow({ y, xSection, length, color, markerId, label, labelColor, maxRightX }: TensArrowProps) {
  const xNear = xSection + 2;             // extremo junto a la sección
  const xFar = xSection + length + 2;     // extremo lejano
  // La flecha de tracción apunta HACIA la sección (←): cuerpo a la derecha,
  // punta en xNear. Sentido opuesto a las de compresión (→) → el par de
  // fuerzas resistente se lee de un vistazo.
  const labelX = Math.min(maxRightX, xFar);
  return (
    <>
      <line x1={xFar} y1={y} x2={xNear} y2={y} stroke={color} strokeWidth="1.5" markerEnd={`url(#${markerId})`} />
      <text x={labelX} y={y - 4} fill={labelColor} fontSize="10" fontFamily="var(--font-mono)" fontWeight="600" textAnchor="end">
        {label}
      </text>
    </>
  );
}
