// Estabilidad de taludes — vista de sección (vista 1).
// "Mesa de trabajo del ingeniero": SVG de precisión que superpone DOS capas:
//   1. Geometría VIVA (siempre, derivada de `inputs`): silueta del talud, estratos,
//      nivel freático y sobrecargas en coronación. Se dibuja aunque no haya cálculo.
//   2. Capa CALCULADA (solo si `result` != null): círculo crítico, masa deslizante,
//      dovelas (geometría EXACTA del worker, nunca recalculada), centro O + radios y
//      etiqueta de FoS. Si `result` es null/stale → solo la capa 1.
//
// mode='screen': paleta dark/light por tokens CSS.  mode='pdf': hexes fijos en
// color (espejo del tema claro), desacoplados del tema activo — la figura se
// rasteriza a PNG, así que los colores son seguros en cualquier visor.
// Coordenadas internas en METROS, y hacia arriba (frame PySlope); el flip de Y lo
// hace `sy()` al pintar. Sin emojis, sin rounded-lg, sin violeta, sin gradientes
// decorativos (DESIGN.md). Comentarios en español.

import type { ReactElement } from 'react';
import type { SlopeInputs, SoilLayer, SlopeLoad } from '../../data/defaults';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';
import type { SlopeResult, SlopePoint } from '../../lib/calculations/geotech/types';

interface SlopeStabilitySVGProps {
  inputs: SlopeInputs;
  result: SlopeResult | null;   // null/stale → solo geometría viva, sin capa calculada
  width: number;
  height?: number;
  mode?: 'screen' | 'pdf';      // default 'screen'
}

// ─── Paletas ──────────────────────────────────────────────────────────────────

interface StratumBand {
  fill1: string;   // cara superior del gradiente (hacia la rasante)
  fill2: string;   // cara inferior (más profunda)
}

interface Palette {
  bg:            string;
  panel:         string;
  panelBorder:   string;
  label:         string;   // etiquetas/anotaciones de texto principales
  dim:           string;   // texto/cotas secundarias
  ground:        string;   // línea de rasante (terreno)
  granularDot:   string;   // textura puntos (granular)
  cohesiveLine:  string;   // textura líneas (cohesivo)
  /** Paleta cíclica de estratos: estrato i → strataBands[i % 6]. Rotación por
   *  POSICIÓN (no por tipo) para que dos estratos contiguos se distingan; el
   *  tipo se lee por la textura (puntos vs líneas). */
  strataBands:   StratumBand[];
  water:         string;   // nivel freático
  load:          string;   // sobrecargas
  accent:        string;   // anotaciones (radios, O, cotas, límites)
  fail:          string;   // círculo crítico / superficie de rotura
  slice:         string;   // dovelas (tenues)
}

// Pantalla: tokens CSS (conmutan claro/oscuro). Suelo/estratos via --color-geo-*.
const SCREEN_PALETTE: Palette = {
  bg:           'transparent',
  panel:        'var(--color-bg-surface)',
  panelBorder:  'var(--color-border-main)',
  label:        'var(--color-chart-label)',
  dim:          'var(--color-chart-dim-text)',
  ground:       'var(--color-geo-ground)',
  granularDot:  'var(--color-geo-granular-dot)',
  cohesiveLine: 'var(--color-geo-cohesive-line)',
  strataBands: [
    { fill1: 'var(--color-geo-s1a)', fill2: 'var(--color-geo-s1b)' },
    { fill1: 'var(--color-geo-s2a)', fill2: 'var(--color-geo-s2b)' },
    { fill1: 'var(--color-geo-s3a)', fill2: 'var(--color-geo-s3b)' },
    { fill1: 'var(--color-geo-s4a)', fill2: 'var(--color-geo-s4b)' },
    { fill1: 'var(--color-geo-s5a)', fill2: 'var(--color-geo-s5b)' },
    { fill1: 'var(--color-geo-s6a)', fill2: 'var(--color-geo-s6b)' },
  ],
  water:  'var(--color-accent)',
  load:   'var(--color-state-warn)',
  accent: 'var(--color-accent)',
  fail:   'var(--color-state-fail)',
  slice:  'var(--color-text-disabled)',
};

// PDF: hexes fijos EN COLOR — espejo de los tokens geo del tema claro
// (src/index.css --color-geo-*) + estados de la marca, desacoplados del tema
// activo (un usuario en dark exporta el mismo PDF). La figura va rasterizada a
// PNG (embedSvgAsImage), así que el color es seguro en Acrobat.
const PDF_PALETTE: Palette = {
  bg:           '#ffffff',
  panel:        '#ffffff',
  panelBorder:  '#94a3b8',
  label:        '#111827',
  dim:          '#4b5563',
  ground:       '#5d4630',
  granularDot:  '#5c4520',
  cohesiveLine: '#3d2e1a',
  strataBands: [
    { fill1: '#e0c89a', fill2: '#b89968' },
    { fill1: '#c4bb88', fill2: '#9a9162' },
    { fill1: '#d49774', fill2: '#a96b48' },
    { fill1: '#b09480', fill2: '#84685a' },
    { fill1: '#cdb872', fill2: '#a39150' },
    { fill1: '#c08868', fill2: '#946248' },
  ],
  water:  '#0284c7',
  load:   '#d97706',
  accent: '#0284c7',
  fail:   '#dc2626',
  slice:  '#64748b',
};

// ─── Helpers de texto (réplica local: RetainingWallSVG no exporta svgText) ─────

const FONT_MONO = "ui-monospace, 'Geist Mono', monospace";
const FONT_SANS = "'Geist Sans', sans-serif";

// jsPDF/svg2pdf pinta <text> con Helvetica WinAnsi (sin glifos griegos; trata UTF-8
// como Latin-1). En mode='pdf' mapeamos griego/acentos a ASCII para que el PDF sea
// legible. En pantalla se conservan los glifos originales.
function svgText(s: string, isPdf: boolean): string {
  if (!isPdf) return s;
  return s
    .replace(/σ/g, 'sigma').replace(/Σ/g, 'Sum')
    .replace(/Δ/g, 'D').replace(/δ/g, 'd')
    .replace(/γ/g, 'g').replace(/φ/g, 'phi')
    .replace(/μ/g, 'mu').replace(/λ/g, 'lam')
    .replace(/τ/g, 't').replace(/θ/g, 'th')
    .replace(/η/g, 'eta').replace(/ε/g, 'eps').replace(/β/g, 'beta')
    .replace(/▽/g, 'NF').replace(/◄/g, '<').replace(/►/g, '>')
    .replace(/₁/g, '1').replace(/₂/g, '2').replace(/₃/g, '3').replace(/₄/g, '4')
    .replace(/²/g, '2').replace(/³/g, '3')
    .replace(/Ø/g, 'ph').replace(/°/g, 'deg').replace(/º/g, 'deg').replace(/·/g, '.')
    .replace(/′/g, "'").replace(/'/g, "'")
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n')
    .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[—–]/g, '-')
    // eslint-disable-next-line no-control-regex -- intencional: limitar al ASCII que soportan las fuentes core de jsPDF
    .replace(/[^\x00-\x7F]/g, '?');
}

const fmt1 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt2 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Flecha simple (réplica local minimal de Arrow). Coordenadas en px de pantalla.
function Arrow({
  x1, y1, x2, y2, color, sw = 1, head = 6, opacity = 1,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; sw?: number; head?: number; opacity?: number;
}): ReactElement | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const hx = x2 - ux * head;
  const hy = y2 - uy * head;
  const px = -uy * head * 0.45;
  const py = ux * head * 0.45;
  return (
    <g opacity={opacity}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <polygon points={`${x2},${y2} ${hx + px},${hy + py} ${hx - px},${hy - py}`} fill={color} />
    </g>
  );
}

// Chip de título arriba-izquierda (solo pantalla — en PDF se evita Tailwind/chrome).
function TitleChip({ label, dotColor, w, P }: { label: string; dotColor: string; w: number; P: Palette }): ReactElement {
  return (
    <g>
      <rect x={14} y={14} width={w} height={20} rx={3} fill={P.panel} stroke={P.panelBorder} />
      <circle cx={24} cy={24} r={3} fill={dotColor} />
      <text x={32} y={27.5} fontSize={10} fontFamily={FONT_SANS}
        fontWeight={600} fill={P.label} letterSpacing="0.05em">{label}</text>
    </g>
  );
}

// ─── Geometría: frame físico y transformación ─────────────────────────────────

interface Frame {
  scale: number;       // px por metro (uniforme)
  padTop: number;
  physH: number;       // alto físico del encuadre (m)
  sx: (x: number) => number;
  sy: (y: number) => number;
  xMin: number;        // límites físicos del encuadre (m)
}

// Construye la transformación con escala uniforme + centrado + flip de Y.
//   sx(x) = padLeft + (x - xMin)*scale
//   sy(y) = padTop  + (physH - y)*scale     (Y hacia arriba en el frame físico)
function makeFrame(
  xMin: number, xMax: number, yMin: number, yMax: number,
  drawW: number, drawH: number, padLeft: number, padTop: number,
): Frame {
  const physW = Math.max(xMax - xMin, 0.001);
  const physH = Math.max(yMax - yMin, 0.001);
  const scale = Math.min(drawW / physW, drawH / physH);
  // Centrado dentro del área de dibujo.
  const offX = padLeft + (drawW - physW * scale) / 2;
  const offY = padTop + (drawH - physH * scale) / 2;
  return {
    scale,
    padTop: offY,
    physH,
    xMin,
    sx: (x: number) => offX + (x - xMin) * scale,
    sy: (y: number) => offY + (yMax - y) * scale,
  };
}

// Perfil del terreno VIVO desde height+angle (cuando no hay result que dé el exacto).
// Convención PySlope groundProfile: coronación-izda → coronación-cima → pie → llano-dcha.
//   - Tramo llano superior (coronación) a y = H desde la izquierda.
//   - Cara inclinada bajando a ángulo β hasta el pie en y = 0.
//   - Tramo llano inferior a la derecha.
function liveGroundProfile(H: number, angleDeg: number, margin: number): SlopePoint[] {
  const beta = (Math.max(1, Math.min(89, angleDeg)) * Math.PI) / 180;
  const run = H / Math.tan(beta);          // proyección horizontal de la cara
  const xCrest = margin;                   // donde arranca el llano superior
  const xToe = xCrest + run;               // pie del talud
  return [
    { x: 0, y: H },                         // coronación-izda
    { x: xCrest, y: H },                    // coronación-cima (arranque de la cara)
    { x: xToe, y: 0 },                      // pie
    { x: xToe + margin, y: 0 },             // llano derecho
  ];
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function SlopeStabilitySVG({
  inputs,
  result,
  width,
  height,
  mode = 'screen',
}: SlopeStabilitySVGProps): ReactElement {
  const { system } = useUnitSystem();
  const isPdf = mode === 'pdf';
  const P = isPdf ? PDF_PALETTE : SCREEN_PALETTE;
  const H = Math.max(inputs.height, 0.1);
  const view = height ?? Math.round(width * 0.7);

  // Encuadre físico. Si hay result, usamos su groundProfile/limits (frame exacto de
  // la corrida); si no, derivamos la rasante viva de height+angle con margen ±1.2·H.
  const margin = Math.max(1.2 * H, 2);
  const ground: SlopePoint[] = result?.run.groundProfile?.length
    ? result.run.groundProfile
    : liveGroundProfile(H, inputs.angle, margin);

  const gxs = ground.map((p) => p.x);
  const gys = ground.map((p) => p.y);
  let xMin = Math.min(...gxs);
  let xMax = Math.max(...gxs);
  const yTopPhys = Math.max(...gys, H);
  // Borde inferior = apex REAL del arco de rotura dibujado (failureProfile), no el
  // fondo del círculo completo c.cy - c.r: ese reservaba una franja de terreno bajo
  // el talud que nunca se dibuja (la mayoría de la circunferencia) y aplastaba la
  // sección. El centro O y los radios se pintan encima; si caen fuera, se recortan.
  let yBotPhys = Math.min(...gys, 0);
  if (result) {
    const c = result.run.circle;
    const fp = result.run.failureProfile;
    const arcMinY = fp.length ? Math.min(...fp.map((p) => p.y)) : c.cy - c.r;
    yBotPhys = Math.min(yBotPhys, arcMinY);
    xMin = Math.min(xMin, result.run.limits.left);
    xMax = Math.max(xMax, result.run.limits.right);
  }
  // Holgura física: deja aire arriba (sobrecargas) y a los lados (etiquetas).
  const padPhysX = Math.max(0.4 * H, 0.6);
  const padPhysY = Math.max(0.5 * H, 0.8);
  xMin -= padPhysX;
  xMax += padPhysX;
  yBotPhys -= padPhysY * 0.4;
  const yTop = yTopPhys + padPhysY;     // espacio extra arriba para chips de carga

  // Márgenes de lienzo (px) — sitio para chip de título, leyenda y cotas.
  const padLeft = 14;
  const padTop = 44;
  const padRight = 14;
  const legendH = inputs.strata.length > 0 ? 16 + inputs.strata.length * 13 + 8 : 0;
  // Franja propia para las cotas de los límites de análisis (se rotulan a
  // view - padBottom + 11, bajo el borde del área de dibujo): sin ella, con
  // leyenda presente, los números caían DENTRO del cuadro de materiales
  // (fillOpacity 0.7 → se transparentaban pisándose con la leyenda).
  const limitStripH = 12;
  const padBottom = 14 + limitStripH + legendH;
  const drawW = Math.max(40, width - padLeft - padRight);
  const drawH = Math.max(40, view - padTop - padBottom);

  const F = makeFrame(xMin, xMax, yBotPhys, yTop, drawW, drawH, padLeft, padTop);
  const { sx, sy } = F;

  // Polilínea de la rasante en px (para clip de estratos y dibujo del terreno).
  const groundPx = ground.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
  const groundLineD = groundPx.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');

  // Polígono cerrado de la silueta del terreno (rasante + base del encuadre) para
  // recortar las bandas de estratos a la masa de suelo real.
  const yBasePx = sy(yBotPhys);
  const soilSilhouetteD =
    `${groundLineD} L ${groundPx[groundPx.length - 1].x.toFixed(2)} ${yBasePx.toFixed(2)} ` +
    `L ${groundPx[0].x.toFixed(2)} ${yBasePx.toFixed(2)} Z`;

  // Profundidad acumulada de estratos DESDE LA CORONACIÓN. Cada estrato i ocupa la
  // banda horizontal [crestY - Σt(<=i), crestY - Σt(<i)] en coordenadas físicas.
  //
  // crestY = cima REAL del perfil del terreno en uso. Con `result`, groundProfile
  // viene en el frame de PySlope (cota ~10-15 m, NO H); usar H aquí descuadraba las
  // bandas respecto a la silueta (aparecían como banda suelta debajo). Sin result,
  // liveGroundProfile da max(gys) = H, así que el comportamiento previo se conserva.
  const crestY = Math.max(...gys);
  const stratBandsRaw = inputs.strata.reduce<
    { layer: SoilLayer; i: number; yTopPhys: number; yBotPhys: number }[]
  >((arr, layer, i) => {
    const top = arr.length === 0 ? crestY : arr[arr.length - 1].yBotPhys;
    const bot = top - layer.thickness;
    arr.push({ layer, i, yTopPhys: top, yBotPhys: bot });
    return arr;
  }, []);
  // Extiende el último estrato hasta la base del encuadre: si el círculo crítico
  // baja más que la estratigrafía, evita dejar suelo sin rellenar bajo el clip.
  const stratBands = stratBandsRaw.map((b, idx, a) =>
    idx === a.length - 1 ? { ...b, yBotPhys: Math.min(b.yBotPhys, yBotPhys) } : b,
  );

  const ids = `slope`;   // prefijo estable de ids svg

  // ─── Capa calculada (solo si result != null) ───────────────────────────────
  const run = result?.run ?? null;

  // Arco de rotura (failureProfile) como path en px.
  let arcD = '';
  if (run && run.failureProfile.length > 1) {
    arcD = run.failureProfile
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
      .join(' ');
  }

  // Masa deslizante: entre la rasante (arriba) y el arco (abajo), de entry a exit.
  // Se cierra siguiendo el arco hacia adelante y la rasante hacia atrás.
  let massD = '';
  if (run && run.failureProfile.length > 1) {
    const arc = run.failureProfile;
    // Tramo de rasante entre exit.x y entry.x (recorrido inverso al arco).
    const xa = run.entry.x;
    const xb = run.exit.x;
    const lo = Math.min(xa, xb);
    const hi = Math.max(xa, xb);
    const topPts = ground.filter((p) => p.x >= lo && p.x <= hi);
    const arcFwd = arc.map((p) => `L ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`).join(' ');
    const topRev = topPts
      .slice()
      .reverse()
      .map((p) => `L ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
      .join(' ');
    massD =
      `M ${sx(arc[0].x).toFixed(2)} ${sy(arc[0].y).toFixed(2)} ${arcFwd} ${topRev} Z`;
  }

  // Centro O y radios punteados O→entry, O→exit.
  const O = run ? { x: sx(run.circle.cx), y: sy(run.circle.cy) } : null;
  const entryPx = run ? { x: sx(run.entry.x), y: sy(run.entry.y) } : null;
  const exitPx = run ? { x: sx(run.exit.x), y: sy(run.exit.y) } : null;

  // Etiqueta FoS cerca del apex (punto más bajo del arco).
  let fosLabelPx: { x: number; y: number } | null = null;
  if (run && run.failureProfile.length > 0) {
    let apex = run.failureProfile[0];
    for (const p of run.failureProfile) if (p.y < apex.y) apex = p;
    fosLabelPx = { x: sx(apex.x), y: sy(apex.y) + 18 };
  }

  // Nivel freático: cota física = coronación − profundidad. Línea horizontal + ▽.
  const hasWater = inputs.waterTableDepth != null;
  const wY = hasWater ? crestY - (inputs.waterTableDepth as number) : 0;

  return (
    <svg
      width={width}
      height={view}
      viewBox={`0 0 ${width} ${view}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', background: P.bg }}
      aria-label="Estabilidad de talud — sección"
      role="img"
    >
      <title>Estabilidad de talud — sección</title>

      <defs>
        {/* Recorte a la silueta del terreno para las bandas de estratos. */}
        <clipPath id={`${ids}-soil-clip`}>
          <path d={soilSilhouetteD} />
        </clipPath>
        {/* Gradientes + texturas por estrato (color por posición, textura por tipo). */}
        {stratBands.map((b) => {
          const band = P.strataBands[b.i % P.strataBands.length];
          const isGran = b.layer.type === 'granular';
          const texColor = isGran ? P.granularDot : P.cohesiveLine;
          return (
            <g key={`def-${b.i}`}>
              <linearGradient id={`${ids}-grad-${b.i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={band.fill1} />
                <stop offset="100%" stopColor={band.fill2} />
              </linearGradient>
              <pattern
                id={`${ids}-tex-${b.i}`}
                patternUnits="userSpaceOnUse"
                width={isGran ? 8 : 12}
                height={isGran ? 8 : 12}
              >
                {isGran ? (
                  <>
                    <circle cx="2" cy="2" r="0.7" fill={texColor} opacity="0.55" />
                    <circle cx="6" cy="5" r="0.6" fill={texColor} opacity="0.45" />
                    <circle cx="4" cy="7" r="0.5" fill={texColor} opacity="0.35" />
                  </>
                ) : (
                  <>
                    <line x1="0" y1="3" x2="12" y2="3" stroke={texColor} strokeWidth="0.5" opacity="0.55" />
                    <line x1="0" y1="8" x2="12" y2="8" stroke={texColor} strokeWidth="0.4" opacity="0.40" />
                  </>
                )}
              </pattern>
            </g>
          );
        })}
      </defs>

      {!isPdf && <TitleChip label="SECCIÓN DEL TALUD" dotColor={P.fail} w={155} P={P} />}
      <text
        x={width - 14}
        y={27}
        fontSize={9.5}
        textAnchor="end"
        fill={P.dim}
        fontFamily={FONT_MONO}
      >
        {svgText(`H = ${fmt2(inputs.height)} m · β = ${fmt1(inputs.angle)}°`, isPdf)}
      </text>

      {/* ── Capa 1: estratos del suelo (bandas horizontales recortadas a la silueta) ── */}
      <g clipPath={`url(#${ids}-soil-clip)`}>
        {stratBands.map((b) => {
          const yTopP = sy(b.yTopPhys);
          const yBotP = sy(b.yBotPhys);
          // Clamp al rango visible del lienzo de suelo.
          const yA = Math.min(yTopP, yBotP);
          const yB = Math.max(yTopP, yBotP);
          const h = yB - yA;
          if (h <= 0) return null;
          return (
            <g key={`band-${b.i}`}>
              <rect x={padLeft} y={yA} width={width - padLeft - padRight} height={h}
                fill={`url(#${ids}-grad-${b.i})`} />
              <rect x={padLeft} y={yA} width={width - padLeft - padRight} height={h}
                fill={`url(#${ids}-tex-${b.i})`} />
              {/* Línea de transición entre estratos (contraste suave). */}
              <line x1={padLeft} y1={yA} x2={width - padRight} y2={yA}
                stroke={isPdf ? '#ffffff' : '#f8fafc'} strokeWidth={0.5} opacity={0.3} />
            </g>
          );
        })}
      </g>

      {/* Rasante del terreno (silueta del talud) */}
      <path d={groundLineD} fill="none" stroke={P.ground} strokeWidth={1.6} strokeLinejoin="round" />

      {/* Nivel freático: línea discontinua + marcador ▽ + etiqueta "NF" */}
      {hasWater && wY > yBotPhys && wY < yTop && (() => {
        const yw = sy(wY);
        const xL = sx(xMin) + 4;
        const xR = sx(xMax) - 4;
        return (
          <g>
            <line x1={xL} y1={yw} x2={xR} y2={yw}
              stroke={P.water} strokeWidth={1} strokeDasharray="6 3" opacity={0.9} />
            {/* Triángulo ▽ (apex hacia abajo) sobre la línea, lado izquierdo */}
            <polygon
              points={`${xL + 18},${yw} ${xL + 30},${yw} ${xL + 24},${yw + 8}`}
              fill={P.water}
              opacity={0.9}
            />
            <line x1={xL + 16} y1={yw - 3} x2={xL + 32} y2={yw - 3} stroke={P.water} strokeWidth={0.8} />
            <text x={xL + 36} y={yw - 2} fontSize={9.5} fill={P.water} fontFamily={FONT_MONO}>
              {svgText(`NF z=${fmt2(inputs.waterTableDepth as number)} m`, isPdf)}
            </text>
          </g>
        );
      })()}

      {/* Sobrecargas en coronación (UDL = banda con flechas + chip kN/m²; line = flecha gruesa + chip kN/m) */}
      {inputs.loads.map((load: SlopeLoad) => {
        // offset se mide desde la coronación (x del arranque de la cara) hacia el trasdós
        // (sentido del límite izquierdo de análisis), es decir x decreciente.
        const xCrestTop = ground.length >= 2 ? ground[1].x : margin;
        // Borde IZQUIERDO del terreno dibujado: la sobrecarga vive sobre la coronación,
        // no sobre el padding del encuadre. Clampar aquí evita que la banda/flechas se
        // pinten fuera de la silueta del terreno (a la izquierda del talud).
        const xTerrainLeft = ground.length ? ground[0].x : xMin;
        const x0 = xCrestTop - load.offset;
        const yTopLoad = sy(crestY);
        if (load.kind === 'udl') {
          // Banda: de x0 hacia la izquierda `length` (0/ausente → toda la coronación
          // hasta el borde izquierdo del terreno, no el límite con padding del encuadre).
          const len = load.length && load.length > 0 ? load.length : x0 - xTerrainLeft;
          const xa = sx(Math.max(xTerrainLeft, x0 - len));
          const xb = sx(x0);
          const yBand = yTopLoad - 30;
          const n = Math.max(2, Math.min(7, Math.round(Math.abs(xb - xa) / 22)));
          return (
            <g key={`load-${load.id}`}>
              <line x1={xa} y1={yBand} x2={xb} y2={yBand} stroke={P.load} strokeWidth={1} />
              {Array.from({ length: n }).map((_, k) => {
                const xx = xa + (k * (xb - xa)) / (n - 1);
                return (
                  <Arrow key={`udlA-${load.id}-${k}`} x1={xx} y1={yBand + 2} x2={xx} y2={yTopLoad - 3}
                    color={P.load} sw={0.9} head={4} opacity={0.95} />
                );
              })}
              <text x={(xa + xb) / 2} y={yBand - 4} fontSize={9.5} fill={P.load}
                textAnchor="middle" fontFamily={FONT_MONO}>
                {svgText(`q = ${formatQuantity(load.magnitude, 'areaLoad', system, { precision: 1 })}`, isPdf)}
              </text>
            </g>
          );
        }
        // Carga lineal: una flecha gruesa hacia abajo en x0 + chip kN/m.
        const xx = sx(x0);
        return (
          <g key={`load-${load.id}`}>
            <Arrow x1={xx} y1={yTopLoad - 34} x2={xx} y2={yTopLoad - 3}
              color={P.load} sw={1.8} head={6} />
            <text x={xx} y={yTopLoad - 38} fontSize={9.5} fill={P.load}
              textAnchor="middle" fontFamily={FONT_MONO}>
              {svgText(`${formatQuantity(load.magnitude, 'linearLoad', system, { precision: 1 })}`, isPdf)}
            </text>
          </g>
        );
      })}

      {/* ── Capa 2: calculada (solo si result != null) ── */}
      {run && (
        <g>
          {/* Masa deslizante sombreada (entre rasante y arco) */}
          {massD && (
            <path d={massD} fill={P.fail} fillOpacity={0.12} stroke="none" />
          )}

          {/* Dovelas: líneas verticales yTop→yBase EXACTAS del worker (nunca recalcular) */}
          <g opacity={0.5}>
            {run.slices.map((s, i) => (
              <line
                key={`slice-${i}`}
                x1={sx(s.x)}
                y1={sy(s.yTop)}
                x2={sx(s.x)}
                y2={sy(s.yBase)}
                stroke={P.slice}
                strokeWidth={0.6}
              />
            ))}
          </g>

          {/* Círculo crítico = arco failureProfile */}
          {arcD && (
            <path d={arcD} fill="none" stroke={P.fail} strokeWidth={1.8} strokeLinejoin="round" />
          )}

          {/* Radios punteados O→entry y O→exit */}
          {O && entryPx && exitPx && (
            <g>
              <line x1={O.x} y1={O.y} x2={entryPx.x} y2={entryPx.y}
                stroke={P.accent} strokeWidth={0.9} strokeDasharray="5 3" opacity={0.85} />
              <line x1={O.x} y1={O.y} x2={exitPx.x} y2={exitPx.y}
                stroke={P.accent} strokeWidth={0.9} strokeDasharray="5 3" opacity={0.85} />
              {/* Centro O */}
              <circle cx={O.x} cy={O.y} r={3.2} fill={P.accent} />
              <circle cx={O.x} cy={O.y} r={6} fill="none" stroke={P.accent} strokeWidth={0.7} opacity={0.4} />
              <text x={O.x + 7} y={O.y - 5} fontSize={10} fill={P.accent} fontFamily={FONT_MONO}>O</text>
            </g>
          )}

          {/* Bloque rígido excluido (muro traspasado desde un módulo de muro):
              la banda que ninguna superficie de rotura puede atravesar. Se pinta
              ANTES de los marcadores de límites para quedar por debajo. */}
          {run.rigidBlock && (
            <g>
              <rect
                x={sx(run.rigidBlock.x0)}
                y={padTop}
                width={Math.max(sx(run.rigidBlock.x1) - sx(run.rigidBlock.x0), 1)}
                height={Math.max(sy(run.rigidBlock.yBase) - padTop, 1)}
                fill={P.accent}
                opacity={0.07}
              />
              <line
                x1={sx(run.rigidBlock.x0)} y1={sy(run.rigidBlock.yBase)}
                x2={sx(run.rigidBlock.x1)} y2={sy(run.rigidBlock.yBase)}
                stroke={P.accent} strokeWidth={1} strokeDasharray="4 2" opacity={0.55}
              />
              <text
                x={(sx(run.rigidBlock.x0) + sx(run.rigidBlock.x1)) / 2}
                y={sy(run.rigidBlock.yBase) - 4}
                fontSize={8} fill={P.accent} textAnchor="middle" fontFamily={FONT_MONO}
              >
                {svgText('muro — bloque rigido', isPdf)}
              </text>
            </g>
          )}

          {/* Marcadores de límites de análisis ◄ ► en la rasante */}
          {(() => {
            const yl = sy(0);   // referencia a cota del pie/llano
            const limMarks = [
              { x: run.limits.left, glyph: '◄' },
              { x: run.limits.right, glyph: '►' },
            ];
            return limMarks.map((m, i) => {
              const mx = sx(m.x);
              return (
                <g key={`lim-${i}`}>
                  <line x1={mx} y1={padTop} x2={mx} y2={view - padBottom}
                    stroke={P.accent} strokeWidth={0.6} strokeDasharray="2 4" opacity={0.4} />
                  <text x={mx} y={padTop - 4} fontSize={11} fill={P.accent}
                    textAnchor="middle" fontFamily={FONT_MONO}>
                    {svgText(m.glyph, isPdf)}
                  </text>
                  <text x={mx} y={view - padBottom + 11} fontSize={8} fill={P.dim}
                    textAnchor="middle" fontFamily={FONT_MONO}>
                    {svgText(`${fmt1(m.x)}`, isPdf)}
                  </text>
                  <line x1={mx} y1={yl} x2={mx} y2={yl} stroke="none" />
                </g>
              );
            });
          })()}

          {/* Etiqueta prominente de FoS cerca del apex */}
          {fosLabelPx && (
            <g>
              <rect
                x={fosLabelPx.x - 44}
                y={fosLabelPx.y - 12}
                width={88}
                height={20}
                rx={3}
                fill={P.panel}
                stroke={P.fail}
                strokeWidth={1}
                opacity={0.97}
              />
              <text
                x={fosLabelPx.x}
                y={fosLabelPx.y + 2}
                fontSize={12}
                fontWeight={700}
                fill={P.fail}
                textAnchor="middle"
                fontFamily={FONT_MONO}
              >
                {svgText(`FoS = ${run.fos.toFixed(2)}`, isPdf)}
              </text>
            </g>
          )}
        </g>
      )}

      {/* ── Leyenda de materiales embebida (una fila por estrato) ── */}
      {inputs.strata.length > 0 && (() => {
        const lx = padLeft;
        const ly = view - legendH - 8;
        const rowH = 13;
        return (
          <g>
            <rect x={lx} y={ly} width={width - padLeft - padRight} height={legendH}
              rx={3} fill={P.panel} fillOpacity={0.7} stroke={P.panelBorder} strokeWidth={0.5} />
            <text x={lx + 8} y={ly + 12} fontSize={8.5} fontFamily={FONT_SANS}
              fill={P.dim} letterSpacing="0.07em" fontWeight={600}>
              {svgText('MATERIALES', isPdf)}
            </text>
            {stratBands.map((b) => {
              const band = P.strataBands[b.i % P.strataBands.length];
              const texColor = b.layer.type === 'granular' ? P.granularDot : P.cohesiveLine;
              const cy = ly + 16 + b.i * rowH + 5;
              const layer: SoilLayer = b.layer;
              return (
                <g key={`leg-${b.i}`}>
                  <rect x={lx + 8} y={cy - 6} width={9} height={9}
                    fill={band.fill1} stroke={texColor} strokeWidth={0.6} />
                  <text x={lx + 24} y={cy + 1.5} fontSize={8.5} fill={P.label} fontFamily={FONT_MONO}>
                    {/* γ y c' convertidos al sistema activo (kN/m³↔t/m³, kPa↔kg/cm²) —
                        antes γ salía sin unidad y c' hardcodeaba kPa aunque el
                        resto de la app estuviera en técnico. */}
                    {svgText(
                      `E${layer.id} · γ=${formatQuantity(layer.gamma, 'weightDensity', system)}  φ'=${fmt1(layer.phi)}°  c'=${formatQuantity(layer.c, 'cohesion', system)}`,
                      isPdf,
                    )}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
}
