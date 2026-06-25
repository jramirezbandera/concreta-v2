// Estabilidad de taludes — vista 2: malla de centros / mapa de FoS (vista 2).
// "Abanico de búsqueda": dibuja TODOS los círculos de prueba que PySlope evaluó,
// cada arco de rotura coloreado por su FoS (rojo = peligro / FoS bajo → ámbar →
// verde → azul = FoS alto), sobre el perfil del terreno atenuado de contexto. El
// círculo crítico (mínimo FoS) se resalta encima de todo en `state-fail`, igual
// que en la vista 1. Una colorbar/leyenda de gradiente embebida (modelada sobre
// `GradientLegend` de zapata) cierra el mapa, con valores numéricos en los
// extremos para accesibilidad daltónica.
//
// El gradiente de FoS es FUNCIONAL (mapea un escalar a color), no decorativo —
// permitido por DESIGN.md (excepción "gradiente funcional de estado").
//
// Reusa el andamiaje de la vista 1 (SlopeStabilitySVG): escala uniforme + flip de
// Y, paletas dual screen/pdf, sanitización `svgText` en PDF, tokens `--color-*`.
// mode='screen' usa tokens que conmutan por tema; mode='pdf' usa grises/hex.
// Coordenadas internas en METROS, y hacia arriba (frame PySlope); el flip de Y lo
// hace `sy()`. Sin emojis, sin rounded-lg, sin violeta. Comentarios en español.
//
// NOTA geometría: los círculos de prueba de `searchCircles` solo traen {cx,cy,r,fos}
// (no su arco exacto, que PySlope descarta). Para el ABANICO de contexto se muestrea
// el arco de cada círculo en JS — esto es dibujo-aproximado de la malla de búsqueda
// (§10.8 "dibujar los arcos de s._search"), NO la superficie crítica: el crítico se
// pinta con la geometría EXACTA del worker (`run.failureProfile`), respetando la
// decisión de defensibilidad (§9.4 #8).

import type { ReactElement } from 'react';
import type { SlopeInputs } from '../../data/defaults';
import type { SlopeRun, SlopePoint, SlopeCircleFoS } from '../../lib/calculations/geotech/types';

interface SlopeSearchSVGProps {
  inp: SlopeInputs;
  run: SlopeRun | null;          // null → solo perfil de contexto, sin abanico
  width: number;
  height?: number;
  mode?: 'screen' | 'pdf';       // default 'screen'
}

// ─── Paletas ──────────────────────────────────────────────────────────────────

interface Palette {
  bg:          string;
  panel:       string;
  panelBorder: string;
  label:       string;   // etiquetas/anotaciones principales
  dim:         string;   // texto/cotas secundarias
  ground:      string;   // perfil del terreno (atenuado)
  // Paradas del gradiente funcional de FoS (rojo→ámbar→verde→azul).
  fosFail:     string;   // FoS bajo (peligro)
  fosWarn:     string;   // FoS marginal
  fosOk:       string;   // FoS adecuado
  fosHigh:     string;   // FoS muy alto (sobredimensionado)
  critical:    string;   // círculo crítico resaltado
}

// Pantalla: tokens CSS (conmutan claro/oscuro).
const SCREEN_PALETTE: Palette = {
  bg:          'transparent',
  panel:       'var(--color-bg-surface)',
  panelBorder: 'var(--color-border-main)',
  label:       'var(--color-chart-label)',
  dim:         'var(--color-chart-dim-text)',
  ground:      'var(--color-geo-ground)',
  fosFail:     'var(--color-state-fail)',
  fosWarn:     'var(--color-state-warn)',
  fosOk:       'var(--color-state-ok)',
  fosHigh:     'var(--color-accent)',
  critical:    'var(--color-state-fail)',
};

// PDF: hexes fijos (impresión, desacoplado del tema).
const PDF_PALETTE: Palette = {
  bg:          '#ffffff',
  panel:       '#ffffff',
  panelBorder: '#999999',
  label:       '#000000',
  dim:         '#666666',
  ground:      '#333333',
  fosFail:     '#dc2626',
  fosWarn:     '#d97706',
  fosOk:       '#16a34a',
  fosHigh:     '#2563eb',
  critical:    '#000000',
};

// ─── Helpers de texto (réplica local, igual que la vista 1) ────────────────────

const FONT_MONO = "ui-monospace, 'Geist Mono', monospace";
const FONT_SANS = "'Geist Sans', sans-serif";

// jsPDF/svg2pdf pinta <text> con Helvetica WinAnsi (sin glifos griegos). En PDF
// mapeamos griego/acentos a ASCII; en pantalla se conservan los glifos.
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

const fmt2 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

// ─── Geometría: frame físico y transformación (idéntico a la vista 1) ──────────

interface Frame {
  scale: number;
  sx: (x: number) => number;
  sy: (y: number) => number;
}

// Escala uniforme + centrado + flip de Y.
//   sx(x) = offX + (x - xMin)*scale
//   sy(y) = offY + (yMax - y)*scale     (Y hacia arriba en el frame físico)
function makeFrame(
  xMin: number, xMax: number, yMin: number, yMax: number,
  drawW: number, drawH: number, padLeft: number, padTop: number,
): Frame {
  const physW = Math.max(xMax - xMin, 0.001);
  const physH = Math.max(yMax - yMin, 0.001);
  const scale = Math.min(drawW / physW, drawH / physH);
  const offX = padLeft + (drawW - physW * scale) / 2;
  const offY = padTop + (drawH - physH * scale) / 2;
  return {
    scale,
    sx: (x: number) => offX + (x - xMin) * scale,
    sy: (y: number) => offY + (yMax - y) * scale,
  };
}

// Perfil del terreno VIVO desde height+angle (cuando no hay run con groundProfile).
function liveGroundProfile(H: number, angleDeg: number, margin: number): SlopePoint[] {
  const beta = (Math.max(1, Math.min(89, angleDeg)) * Math.PI) / 180;
  const run = H / Math.tan(beta);
  const xCrest = margin;
  const xToe = xCrest + run;
  return [
    { x: 0, y: H },
    { x: xCrest, y: H },
    { x: xToe, y: 0 },
    { x: xToe + margin, y: 0 },
  ];
}

// ─── Mapa de FoS → color ────────────────────────────────────────────────────
//
// Escala determinista por TRAMOS lineales sobre las 4 paradas:
//   FoS ≤ 1.0  → rojo (fail)          [rotura / inadmisible]
//   FoS  1.3   → ámbar (warn)         [marginal CTE/transitorio]
//   FoS  1.5   → verde (ok)           [adecuado permanente]
//   FoS ≥ 3.0  → azul (high)          [muy sobredimensionado]
// Devuelve un color sólido (token o hex) tomando la parada del segmento dominante.
// Mantenemos colores DISCRETOS por tramo (no interpolación rgb) porque las paradas
// screen son tokens CSS `var(--color-*)` que no se pueden mezclar en JS; el degradado
// percibido lo da el conjunto del abanico. La COLORBAR sí usa el <linearGradient>
// continuo (resuelto por el navegador) para comunicar la escala completa.
const FOS_STOPS: { v: number }[] = [{ v: 1.0 }, { v: 1.3 }, { v: 1.5 }, { v: 3.0 }];

function fosColor(fos: number, P: Palette): string {
  if (fos <= FOS_STOPS[1].v) return P.fosFail;     // ≤ 1.3 → rojo
  if (fos <= FOS_STOPS[2].v) return P.fosWarn;     // 1.3–1.5 → ámbar
  if (fos < FOS_STOPS[3].v) return P.fosOk;        // 1.5–3.0 → verde
  return P.fosHigh;                                // ≥ 3.0 → azul
}

// Opacidad del trazo por FoS: los círculos peligrosos (FoS bajo) se ven algo más;
// el abanico no satura porque los trazos son finos y de baja opacidad base.
function fosOpacity(fos: number): number {
  if (fos <= 1.3) return 0.5;
  if (fos <= 1.6) return 0.38;
  return 0.28;
}

// ─── Submuestreo determinista del abanico ──────────────────────────────────────
//
// `searchCircles` puede traer ~1000+ entradas. Para que el render sea fluido se
// limita a ~MAX_ARCS arcos. Submuestreo determinista (1 de cada k tras ordenar por
// FoS) CONSERVANDO siempre el crítico (FoS mínimo) y los de FoS más bajo (los más
// relevantes para mostrar la robustez del mínimo). Umbral: > MAX_ARCS dispara el
// muestreo. El orden por FoS ascendente garantiza que, al recortar, sobreviven los
// arcos peligrosos.
const MAX_ARCS = 600;

function sampleCircles(circles: SlopeCircleFoS[]): { shown: SlopeCircleFoS[]; sampled: boolean } {
  if (circles.length <= MAX_ARCS) return { shown: circles, sampled: false };
  // Orden ascendente por FoS: los más bajos (peligrosos) van primero y se conservan.
  const sorted = circles.slice().sort((a, b) => a.fos - b.fos);
  // Conservar SIEMPRE el primer cuarto (FoS más bajos) íntegro.
  const keepLow = Math.floor(MAX_ARCS * 0.25);
  const head = sorted.slice(0, keepLow);
  const rest = sorted.slice(keepLow);
  const budget = MAX_ARCS - keepLow;
  const k = Math.ceil(rest.length / budget);    // 1 de cada k del resto
  const tail = rest.filter((_, i) => i % k === 0);
  return { shown: head.concat(tail), sampled: true };
}

// Puntos FÍSICOS del arco inferior de un círculo de prueba (cx,cy,r) entre sus
// cortes con la rasante. Intersecta el círculo con la polilínea del terreno y
// muestrea el arco inferior (lo que cae bajo el talud). Devuelve [] si no corta en
// dos puntos válidos. Compartido por el pintado del arco y por el cálculo del
// encuadre (min-y REALMENTE dibujado, no el fondo del círculo completo).
function searchArcSamples(c: SlopeCircleFoS, ground: SlopePoint[]): SlopePoint[] {
  // Intersecciones círculo↔segmentos del perfil. Recoge parámetros x de corte.
  const xs: number[] = [];
  for (let i = 0; i < ground.length - 1; i++) {
    const a = ground[i];
    const b = ground[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const fx = a.x - c.cx;
    const fy = a.y - c.cy;
    const A = dx * dx + dy * dy;
    if (A < 1e-9) continue;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - c.r * c.r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
      if (t >= -1e-6 && t <= 1 + 1e-6) xs.push(a.x + t * dx);
    }
  }
  if (xs.length < 2) return [];
  const xa = Math.min(...xs);
  const xb = Math.max(...xs);
  // Ángulos al centro de los cortes; muestreamos el arco INFERIOR (y < cy).
  const angAt = (x: number) => {
    const cl = Math.max(-1, Math.min(1, (x - c.cx) / c.r));
    // y bajo el centro → tomamos el ramal inferior (asin negativo).
    return Math.atan2(-Math.sqrt(Math.max(0, 1 - cl * cl)), cl);
  };
  const a0 = angAt(xa);
  const a1 = angAt(xb);
  const steps = 16;
  const pts: SlopePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = a0 + (a1 - a0) * t;
    pts.push({ x: c.cx + c.r * Math.cos(ang), y: c.cy + c.r * Math.sin(ang) });
  }
  return pts;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function SlopeSearchSVG({
  inp,
  run,
  width,
  height,
  mode = 'screen',
}: SlopeSearchSVGProps): ReactElement {
  const isPdf = mode === 'pdf';
  const P = isPdf ? PDF_PALETTE : SCREEN_PALETTE;
  const H = Math.max(inp.height, 0.1);
  const view = height ?? Math.round(width * 0.7);

  // Perfil del terreno de contexto: exacto del run si lo hay, vivo si no.
  const margin = Math.max(1.2 * H, 2);
  const ground: SlopePoint[] = run?.groundProfile?.length
    ? run.groundProfile
    : liveGroundProfile(H, inp.angle, margin);

  // Abanico submuestreado de círculos de prueba.
  const allCircles = run?.searchCircles ?? [];
  const { shown: arcs, sampled } = sampleCircles(allCircles);

  // Muestreo físico de cada arco una sola vez: lo reutilizan el encuadre (min-y
  // realmente dibujado) y el pintado (mapeo a px), sin recalcular intersecciones.
  const arcSamples = arcs.map((c) => searchArcSamples(c, ground));

  // ── Encuadre físico: engloba el perfil + los arcos DIBUJADOS + el arco crítico.
  // NO se usa c.cy - c.r (fondo del círculo completo): reservaba lienzo vacío bajo
  // el talud (la mayor parte de la circunferencia no se dibuja) y aplastaba el mapa.
  // Tampoco se sube hasta c.cy: la nube de centros se pinta encima y los lejanos se
  // recortan, dejando que los arcos coloreados llenen el lienzo.
  const gxs = ground.map((p) => p.x);
  const gys = ground.map((p) => p.y);
  let xMin = Math.min(...gxs);
  let xMax = Math.max(...gxs);
  const yTopPhys = Math.max(...gys, H);
  let yBotPhys = Math.min(...gys, 0);
  for (const pts of arcSamples) {
    for (const p of pts) yBotPhys = Math.min(yBotPhys, p.y);
  }
  if (run) {
    for (const p of run.failureProfile) yBotPhys = Math.min(yBotPhys, p.y);
    xMin = Math.min(xMin, run.limits.left);
    xMax = Math.max(xMax, run.limits.right);
  }
  // Holgura física (aire para etiquetas / colorbar).
  const padPhysX = Math.max(0.4 * H, 0.6);
  const padPhysY = Math.max(0.5 * H, 0.8);
  xMin -= padPhysX;
  xMax += padPhysX;
  yBotPhys -= padPhysY * 0.4;
  const yTop = yTopPhys + padPhysY;

  // Márgenes de lienzo (px) — sitio para chip de título y colorbar inferior.
  const padLeft = 14;
  const padTop = 44;
  const padRight = 14;
  const legendH = 30;          // colorbar embebida abajo
  const padBottom = 14 + legendH;
  const drawW = Math.max(40, width - padLeft - padRight);
  const drawH = Math.max(40, view - padTop - padBottom);

  const F = makeFrame(xMin, xMax, yBotPhys, yTop, drawW, drawH, padLeft, padTop);
  const { sx, sy } = F;

  // Perfil del terreno (línea atenuada de contexto).
  const groundPx = ground.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
  const groundLineD = groundPx
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  // Arco crítico EXACTO del worker (nunca recalculado) — geometría de defensibilidad.
  let criticalArcD = '';
  if (run && run.failureProfile.length > 1) {
    criticalArcD = run.failureProfile
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
      .join(' ');
  }

  // Dominio de la colorbar = escala de COLOR fija (FOS_STOPS[0]..[3] = 1,0..3,0),
  // NO el rango de datos: con un FoS máximo outlier (p.ej. 38) la barra comprimía
  // todo el rango útil a una rendija roja y casi todo se leía azul. La colorbar
  // comunica la escala de color; la marca sitúa el FoS crítico dentro de ella.
  const FOS_LO = FOS_STOPS[0].v; // 1,0
  const FOS_HI = FOS_STOPS[3].v; // 3,0

  // IDs estables por modo (permite instancia screen + clon PDF sin colisión).
  const idSuffix = isPdf ? 'pdf' : 'screen';
  const gradId = `slope-fos-grad-${idSuffix}`;

  return (
    <svg
      width={width}
      height={view}
      viewBox={`0 0 ${width} ${view}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', background: P.bg }}
      aria-label="Estabilidad de talud — malla de centros / mapa de FoS"
      role="img"
    >
      <title>Estabilidad de talud — malla de centros / mapa de FoS</title>

      <defs>
        {/* Gradiente FUNCIONAL de FoS para la colorbar (rojo→ámbar→verde→azul).
            Horizontal. No es decorativo: comunica la escala FoS de la leyenda. */}
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={P.fosFail} />
          <stop offset="33%"  stopColor={P.fosWarn} />
          <stop offset="60%"  stopColor={P.fosOk} />
          <stop offset="100%" stopColor={P.fosHigh} />
        </linearGradient>
      </defs>

      {!isPdf && <TitleChip label="MALLA DE CENTROS · MAPA DE FoS" dotColor={P.critical} w={222} P={P} />}
      <text
        x={width - 14}
        y={27}
        fontSize={9.5}
        textAnchor="end"
        fill={P.dim}
        fontFamily={FONT_MONO}
      >
        {svgText(
          `${allCircles.length} círculos${sampled ? ` · ${arcs.length} mostrados` : ''}`,
          isPdf,
        )}
      </text>

      {/* ── Contexto: perfil del terreno atenuado ── */}
      <path
        d={groundLineD}
        fill="none"
        stroke={P.ground}
        strokeWidth={1.4}
        strokeLinejoin="round"
        opacity={0.35}
      />

      {/* ── Abanico de arcos de prueba, coloreados por FoS ── */}
      <g strokeLinejoin="round" fill="none">
        {arcs.map((c, i) => {
          const pts = arcSamples[i];
          if (pts.length === 0) return null;
          const d = pts
            .map((p, k) => `${k === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
            .join(' ');
          return (
            <path
              key={`arc-${i}`}
              d={d}
              stroke={fosColor(c.fos, P)}
              strokeWidth={0.7}
              opacity={fosOpacity(c.fos)}
            />
          );
        })}
      </g>

      {/* ── Centros de los círculos mostrados (nube de puntos por FoS) ──
           Solo los que caen dentro del encuadre centrado en el talud; los lejanos
           (la mayoría, muy por encima) se omiten en vez de pintarse fuera de lienzo. */}
      <g>
        {arcs.map((c, i) => {
          if (c.cx < xMin || c.cx > xMax || c.cy < yBotPhys || c.cy > yTop) return null;
          return (
            <circle
              key={`ctr-${i}`}
              cx={sx(c.cx)}
              cy={sy(c.cy)}
              r={0.9}
              fill={fosColor(c.fos, P)}
              opacity={Math.min(0.85, fosOpacity(c.fos) + 0.25)}
            />
          );
        })}
      </g>

      {/* ── Círculo crítico resaltado encima de todo (geometría exacta del worker) ── */}
      {run && criticalArcD && (() => {
        // Apex del arco crítico = punto más bajo dibujado. La etiqueta FoS se ancla
        // aquí (antes colgaba de O, que ahora puede caer fuera del encuadre y llevarse
        // la etiqueta con él).
        let apex = run.failureProfile[0];
        for (const p of run.failureProfile) if (p.y < apex.y) apex = p;
        return (
          <g>
            <path
              d={criticalArcD}
              fill="none"
              stroke={P.critical}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {/* Centro O del crítico (se recorta si cae fuera del encuadre) */}
            <circle cx={sx(run.circle.cx)} cy={sy(run.circle.cy)} r={3.2} fill={P.critical} />
            <circle cx={sx(run.circle.cx)} cy={sy(run.circle.cy)} r={6}
              fill="none" stroke={P.critical} strokeWidth={0.7} opacity={0.4} />
            {/* Etiqueta FoS anclada al apex del arco (siempre dentro del lienzo) */}
            <text
              x={sx(apex.x)}
              y={sy(apex.y) + 16}
              fontSize={11}
              fontWeight={700}
              fill={P.critical}
              textAnchor="middle"
              fontFamily={FONT_MONO}
            >
              {svgText(`FoS = ${run.fos.toFixed(2)}`, isPdf)}
            </text>
          </g>
        );
      })()}

      {/* ── Colorbar / leyenda de gradiente FoS (a11y: valores numéricos) ── */}
      {(() => {
        const lx = padLeft + 4;
        const ly = view - legendH - 4;
        const barW = Math.min(150, drawW * 0.42);
        const barH = 7;
        // Valores numéricos en los extremos de la escala de color (daltónico-seguro).
        const loStr = fmt2(FOS_LO);
        const hiStr = fmt2(FOS_HI);
        return (
          <g aria-hidden="true">
            <text x={lx} y={ly - 2} fontSize={8.5} fontFamily={FONT_SANS}
              fill={P.dim} letterSpacing="0.07em" fontWeight={600}>
              {svgText('FACTOR DE SEGURIDAD (FoS)', isPdf)}
            </text>
            <rect
              x={lx} y={ly + 4} width={barW} height={barH}
              fill={`url(#${gradId})`} stroke={P.panelBorder} strokeWidth={0.5}
            />
            {/* Marca del FoS crítico sobre la barra (posición proporcional 0→3). */}
            {run && (() => {
              const f = Math.max(FOS_LO, Math.min(FOS_HI, run.fos));
              const mx = lx + ((f - FOS_LO) / (FOS_HI - FOS_LO)) * barW;
              return (
                <g>
                  <line x1={mx} y1={ly + 1} x2={mx} y2={ly + 4 + barH + 2}
                    stroke={P.critical} strokeWidth={1.2} />
                  <text x={mx} y={ly + 4 + barH + 11} fontSize={8} textAnchor="middle"
                    fill={P.critical} fontFamily={FONT_MONO}>
                    {svgText(run.fos.toFixed(2), isPdf)}
                  </text>
                </g>
              );
            })()}
            {/* Extremos numéricos: peligro (izq) → seguro (dcha) */}
            <text x={lx} y={ly + 4 + barH + 11} fontSize={8} fill={P.fosFail} fontFamily={FONT_MONO}>
              {svgText(loStr, isPdf)}
            </text>
            <text x={lx + barW} y={ly + 4 + barH + 11} fontSize={8} textAnchor="end"
              fill={P.fosHigh} fontFamily={FONT_MONO}>
              {svgText(hiStr, isPdf)}
            </text>
            <text x={lx + barW + 10} y={ly + 4 + barH} fontSize={8.5} fill={P.dim} fontFamily={FONT_MONO}>
              {svgText('rojo = peligro · azul = sobredimensionado', isPdf)}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
