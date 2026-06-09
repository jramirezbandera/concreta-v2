// RC Beam — strain diagram SVG.
//
// Distribución lineal de deformaciones a lo largo del canto (plane sections,
// Bernoulli). Eje Y = altura de fibra (0 = top, h = bottom). Eje X = strain ‰.
// Marcas etiquetadas en:
//   - Fibra superior (y=0):     ε_top
//   - As' compresión (y=r_s):  ε_s_comp
//   - As tracción (y=d):       ε_s_tens
//   - Fibra inferior (y=h):    ε_bot
//
// Convención: ε > 0 = tracción (derecha), ε < 0 = compresión (izquierda).
// La línea diagonal cruza el eje vertical en y = x (fibra neutra).

import { type SectionAtMomentResult } from '../../lib/calculations/rcBeamsSection';

interface RCBeamStrainSVGProps {
  /** Result from solveSectionAtMoment. */
  sectionResult: SectionAtMomentResult;
  /** Total section depth (mm) — el motor lo conoce vía inp.h pero el SVG
   *  necesita acceso para escalar. */
  h: number;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
}

// Screen palette via theme tokens (dark values match the old literals exactly).
const SCREEN_COLORS = {
  axis: 'var(--color-chart-rebar-dim)',                              // #475569
  axisLabel: 'var(--color-chart-dim-text)',                          // #94a3b8
  strainLine: 'var(--color-accent)',                                 // #38bdf8
  strainFill: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
  marker: 'var(--color-accent)',                                     // #38bdf8
  marker_yieldTens: 'var(--color-state-ok)',                         // #22c55e
  marker_yieldComp: 'var(--color-state-warn)',                       // #f59e0b
  marker_crushed: 'var(--color-state-fail)',                         // #ef4444
  label: 'var(--color-chart-label)',                                 // #e2e8f0
  labelDim: 'var(--color-chart-dim-text)',                           // #94a3b8
  bg: 'transparent',
};

const PDF_COLORS = {
  axis: '#475569',
  axisLabel: '#475569',
  strainLine: '#0ea5e9',
  strainFill: 'rgba(14,165,233,0.10)',
  marker: '#0ea5e9',
  marker_yieldTens: '#16a34a',
  marker_yieldComp: '#d97706',
  marker_crushed: '#dc2626',
  label: '#1e293b',
  labelDim: '#64748b',
  bg: '#ffffff',
};

export function RCBeamStrainSVG({
  sectionResult,
  h,
  mode = 'screen',
  width = 220,
  height = 300,
}: RCBeamStrainSVGProps) {
  const C = mode === 'pdf' ? PDF_COLORS : SCREEN_COLORS;
  const padTop = 24, padBottom = 24, padLeft = 32, padRight = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Strain values en ‰ para la escala de display.
  const { epsilon_top, epsilon_s_comp, epsilon_s_tens, epsilon_bot, d, r_s } = sectionResult;
  const epsTopP = epsilon_top * 1000;
  const epsBotP = epsilon_bot * 1000;
  const epsSCompP = epsilon_s_comp * 1000;
  const epsSTensP = epsilon_s_tens * 1000;

  // Escala de strain: encontrar |ε_max| para escalar el plot.
  // Si todo es 0 (sección descargada), fallback a ±1‰.
  const maxAbs = Math.max(Math.abs(epsTopP), Math.abs(epsBotP), 1);
  const xZero = padLeft + plotW / 2;
  const xScale = (plotW / 2) / maxAbs;

  // Y scale (altura sección):
  const yScale = plotH / h;
  const yAt = (y: number) => padTop + y * yScale;
  const xForStrain = (eps: number) => xZero + eps * xScale;

  // Línea de strain: del punto (ε_top, 0) al (ε_bot, h)
  const x1 = xForStrain(epsTopP);
  const y1 = yAt(0);
  const x2 = xForStrain(epsBotP);
  const y2 = yAt(h);

  // Crosshatching / fill: polígono entre la línea de strain y el eje X=0.
  const fillPath = `M ${xZero} ${y1} L ${x1} ${y1} L ${x2} ${y2} L ${xZero} ${y2} Z`;

  // Color de marker según estado material
  const markerColorComp = sectionResult.steelYielded_comp ? C.marker_yieldComp : C.marker;
  const markerColorTens = sectionResult.steelYielded_tens ? C.marker_yieldTens : C.marker;
  const markerColorTop = sectionResult.concreteCrushed ? C.marker_crushed : C.marker;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Diagrama de deformación: ε_top=${epsTopP.toFixed(2)}‰, ε_s=${epsSTensP.toFixed(2)}‰`}
      style={{ background: C.bg, display: 'block' }}
    >
      {/* Marco vertical (la sección como rectángulo silueta) */}
      <rect
        x={xZero - 1.5} y={padTop}
        width={3} height={plotH}
        fill={C.axis}
        opacity="0.4"
      />

      {/* Eje X cero (línea vertical centrada) */}
      <line
        x1={xZero} y1={padTop - 4}
        x2={xZero} y2={padTop + plotH + 4}
        stroke={C.axis} strokeWidth="0.5" strokeDasharray="2 2"
      />

      {/* Fill de strain */}
      <path d={fillPath} fill={C.strainFill} />

      {/* Línea diagonal de strain */}
      <line
        x1={x1} y1={y1}
        x2={x2} y2={y2}
        stroke={C.strainLine} strokeWidth="1.5"
      />

      {/* Marcadores en fibras clave */}
      {/* Top fiber */}
      <FiberMarker
        cx={x1} cy={y1}
        labelX={x1} labelY={y1 - 8}
        value={epsTopP.toFixed(2)}
        color={markerColorTop}
        labelColor={C.label}
        align="middle"
      />
      {/* As' (compresión, y = r_s) */}
      <FiberMarker
        cx={xForStrain(epsSCompP)} cy={yAt(r_s)}
        labelX={xForStrain(epsSCompP) - 4} labelY={yAt(r_s) + 3}
        value={epsSCompP.toFixed(2)}
        color={markerColorComp}
        labelColor={C.label}
        align="end"
      />
      {/* As (tracción, y = d) */}
      <FiberMarker
        cx={xForStrain(epsSTensP)} cy={yAt(d)}
        labelX={xForStrain(epsSTensP) + 4} labelY={yAt(d) + 3}
        value={epsSTensP.toFixed(2)}
        color={markerColorTens}
        labelColor={C.label}
        align="start"
      />
      {/* Bottom fiber */}
      <FiberMarker
        cx={x2} cy={y2}
        labelX={x2} labelY={y2 + 14}
        value={epsBotP.toFixed(2)}
        color={C.marker}
        labelColor={C.label}
        align="middle"
      />

      {/* Y-axis label (altura) */}
      <text
        x={6} y={padTop + plotH / 2}
        fill={C.axisLabel} fontSize="9"
        fontFamily="var(--font-mono)"
        transform={`rotate(-90 6 ${padTop + plotH / 2})`}
        textAnchor="middle"
      >
        ALTURA FIBRA (mm)
      </text>

      {/* X-axis label (‰) — esquina inferior-izquierda, al pie del eje de
          deformación. Centrado verticalmente a la derecha flotaba en espacio
          muerto y parecía un segundo eje Y; al pie a la derecha chocaba con el
          valor de la fibra inferior. La esquina inf-izq está libre. */}
      <text
        x={padLeft} y={padTop + plotH + 18}
        fill={C.axisLabel} fontSize="9"
        fontFamily="var(--font-mono)"
        textAnchor="start"
      >
        ε ‰
      </text>

      {/* Tick labels en el eje vertical (0 y h) */}
      <text x={xZero} y={padTop - 4} fill={C.labelDim} fontSize="8" textAnchor="middle" fontFamily="var(--font-mono)">{h}</text>
      <text x={xZero} y={padTop + plotH + 12} fill={C.labelDim} fontSize="8" textAnchor="middle" fontFamily="var(--font-mono)">0</text>
    </svg>
  );
}

interface FiberMarkerProps {
  cx: number; cy: number;
  labelX: number; labelY: number;
  value: string;
  color: string;
  labelColor: string;
  align: 'start' | 'middle' | 'end';
}

function FiberMarker({ cx, cy, labelX, labelY, value, color, labelColor, align }: FiberMarkerProps) {
  return (
    <>
      <circle cx={cx} cy={cy} r="3" fill={color} stroke="var(--color-bg-primary)" strokeWidth="1" />
      <text
        x={labelX} y={labelY}
        fill={labelColor} fontSize="10"
        fontFamily="var(--font-mono)"
        textAnchor={align}
        fontWeight="600"
      >
        {value}
      </text>
    </>
  );
}
