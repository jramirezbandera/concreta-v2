// Multi-floor elevation SVG — DB-SE-F masonry walls.
// Responsive (ResizeObserver) + heat map per machón + holes + lintels.

import { useEffect, useRef, useState } from 'react';
import type {
  MasonryWallState,
  PlantaResult,
  CriticoResult,
} from '../../lib/calculations/masonryWalls';
import { formatNumber, getUnitLabel } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';

const FORJADO_H = 16;

interface Props {
  state: MasonryWallState;
  plantasCalc: PlantaResult[];
  critico: CriticoResult | null;
  mostrarMapa: boolean;
  selectedHueco: string | null;
  selectedPlantaIdx: number;
  selectedMachonKey: string | null;
  onSelectHueco: (id: string, plIdx: number) => void;
  onSelectPlanta: (i: number) => void;
  onSelectMachon: (plIdx: number, machonId: string) => void;
  /** Cuando se proporcionan, el SVG ignora ResizeObserver y se renderiza a
   *  esas dimensiones fijas. Pensado para la copia oculta usada en exportación
   *  PDF (offscreen container donde ResizeObserver no dispara fiable). */
  forceWidth?: number;
  forceHeight?: number;
  /** Cuando true, ajusta colores diseñados para fondo oscuro del lienzo a un
   *  fondo blanco de papel: los huecos pasan de azul casi negro a gris claro
   *  para no aparecer como manchones negros sobre el PDF. El layout y el
   *  resto de colores (mapa de calor, dinteles, etiquetas) se mantienen. */
  forPdf?: boolean;
}

// Colormap viridis-like: 0 (frío) → 1 (caliente)
function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  // Theme-independent η scale (low=cool/light → high=red). The low anchor is a
  // light-medium blue (not near-black navy) so low-η cells read on BOTH the
  // white light canvas and the dark canvas. heatColor is module-level and can't
  // react to theme toggle, so a balanced ramp is the robust choice.
  const stops = [
    { t: 0.00, c: [130, 180, 225] },
    { t: 0.25, c: [56, 130, 200] },
    { t: 0.50, c: [80, 200, 180] },
    { t: 0.75, c: [245, 200, 60] },
    { t: 1.00, c: [239, 68, 68] },
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i].t && x <= stops[i + 1].t) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const k = (x - a.t) / (b.t - a.t || 1);
  const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * k);
  const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * k);
  const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * k);
  return `rgb(${r},${g},${bl})`;
}

export function MasonryWallsSVG({
  state, plantasCalc, critico, mostrarMapa,
  selectedHueco, selectedPlantaIdx, selectedMachonKey,
  onSelectHueco, onSelectPlanta, onSelectMachon,
  forceWidth, forceHeight, forPdf = false,
}: Props) {
  // Color de relleno del hueco: en el lienzo (fondo oscuro) usamos un azul casi
  // negro que se confunde con el fondo y refuerza visualmente la "ausencia de
  // muro". En PDF (fondo blanco) ese mismo color se lee como un agujero negro
  // que choca con el resto de la lámina; cambiamos a un gris claro para que el
  // hueco se distinga del muro sin gritarle al lector.
  const huecoFill = forPdf ? '#e5e7eb' : 'var(--color-bg-canvas)';
  // Screen colors follow the theme via var(); PDF keeps the exact previous
  // literals so print output is byte-identical (no PDF regression).
  const cAccent     = forPdf ? '#38bdf8'             : 'var(--color-accent)';
  const cAccentSoft = forPdf ? 'rgba(56,189,248,0.55)' : 'color-mix(in srgb, var(--color-accent) 55%, transparent)';
  const cDim        = forPdf ? '#475569'             : 'var(--color-chart-rebar-dim)';
  const cSection    = forPdf ? '#334155'             : 'var(--color-chart-section)';
  const cDimText    = forPdf ? '#94a3b8'             : 'var(--color-chart-dim-text)';
  const cBorder     = forPdf ? '#22304d'             : 'var(--color-border-main)';
  const cElevated   = forPdf ? '#1a2540'             : 'var(--color-bg-elevated)';
  const cOk         = forPdf ? '#22c55e'             : 'var(--color-state-ok)';
  const cWarn       = forPdf ? '#f59e0b'             : 'var(--color-state-warn)';
  const cFail       = forPdf ? '#ef4444'             : 'var(--color-state-fail)';
  const cOkSoft     = forPdf ? 'rgba(34,197,94,0.45)' : 'color-mix(in srgb, var(--color-state-ok) 45%, transparent)';
  const cSelect     = forPdf ? '#7dd3fc'             : 'var(--color-accent)';
  const cAccentFill = forPdf ? 'rgba(56,189,248,0.18)' : 'color-mix(in srgb, var(--color-accent) 18%, transparent)';
  const cWarnFill   = forPdf ? 'rgba(245,158,11,0.18)' : 'color-mix(in srgb, var(--color-state-warn) 18%, transparent)';
  const { system } = useUnitSystem();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 760, h: 600 });
  // Hover state — un único id activo entre todos los machones y huecos. El
  // estado existe para reforzar afordancia: stroke + brightness suben al pasar
  // el ratón, comunicando clickability sin necesidad de tooltip.
  const [hovered, setHovered] = useState<string | null>(null);
  const usingForcedSize = forceWidth != null && forceHeight != null;

  useEffect(() => {
    if (usingForcedSize) return;
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: Math.max(360, cr.width), h: Math.max(360, cr.height) });
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [usingForcedSize]);

  const width = forceWidth ?? size.w;
  const height = forceHeight ?? size.h;
  const monoFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";

  // Estado inválido (validation gate) → SVG placeholder en lugar de iterar
  // sobre plantas sin calc asociado, lo que produciría TypeError. La causa
  // típica: el usuario borra el espesor para escribir otro valor, durante un
  // tick `state.t = 0` y el motor devuelve invalid hasta que escriba el nuevo.
  if (plantasCalc.length !== state.plantas.length) {
    return (
      <div ref={wrapRef} style={{ width: '100%', height: '100%', minHeight: 360 }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill={cDim}
            fontSize="12"
            fontFamily={monoFamily}
          >
            Datos no válidos — ajusta los inputs en el panel izquierdo
          </text>
        </svg>
      </div>
    );
  }
  // padX = 90: holgura para los labels laterales del SVG.
  //  · Izquierda  → "FORJADO N" / "CUBIERTA" en x=ox-18 con text-anchor=end.
  //                 "CUBIERTA" mide ≈54 px → ox debe ser ≥ 72 px para no
  //                 cortarse contra el borde izquierdo del SVG.
  //  · Derecha    → labels "Planta N" + "η=X%" + colorbar lateral
  //                 (cbX = width-28). Con padX=90 quedan ≈14 px de gap
  //                 entre el final del muro y el inicio de los tick labels
  //                 del colorbar — suficiente sin amontonar.
  const padX = 90;
  const padTop = 24;
  const padBottom = 56;
  const innerW = width - padX * 2;

  const Htot_real = state.plantas.reduce((s, p) => s + p.H, 0);
  const innerH = height - padTop - padBottom - FORJADO_H * state.plantas.length;
  const sx = innerW / state.L;
  const sy = innerH / Htot_real;
  const s = Math.min(sx, sy);
  const muroW = state.L * s;
  const ox = (width - muroW) / 2;

  const cimY = height - padBottom;
  const plantaCoords: { yBottom: number; yTop: number; muroH: number; yForjadoTop: number; yForjadoBottom: number }[] = [];
  let yBottom = cimY;
  state.plantas.forEach((p) => {
    const muroH = p.H * s;
    const yTop = yBottom - muroH;
    const yForjadoTop = yTop - FORJADO_H;
    plantaCoords.push({ yBottom, yTop, muroH, yForjadoTop, yForjadoBottom: yTop });
    yBottom = yForjadoTop;
  });

  // Heatmap por UTILIZACIÓN (η) en lugar de tensión (σ). El usuario lee el
  // mismo dato dos veces (color + número impreso encima del machón), lo que
  // refuerza el mensaje y evita la cognitive load de mapear "esto está rojo
  // porque σ=1.6 MPa cerca de f_d" — basta con "esto está rojo porque η=91%".
  const fillFor = (m: { id: string }, pi: number) => {
    if (!mostrarMapa) return cElevated;
    return `url(#sg-${pi}-${m.id})`;
  };

  const criticalKey = critico ? `${critico.planta.index}-${critico.id}` : null;

  // Focus ring para navegación por teclado: el usuario ve un cyan dashed
  // outline alrededor del elemento focado. Compartido con hover state visual.

  // A11y: descripción legible para screen readers. Resume el estado del
  // edificio (plantas, η máximo, machón crítico) para que NVDA/VoiceOver
  // puedan anunciar el contenido del SVG sin necesidad de leer la lista de
  // primitives geométricas.
  const etaMaxGlobal = plantasCalc.length > 0
    ? Math.max(...plantasCalc.flatMap((pl) => pl.machones.map((m) => m.etaMax)))
    : 0;
  const verdict = etaMaxGlobal >= 1 ? 'INCUMPLE' : etaMaxGlobal >= 0.8 ? 'REVISAR' : 'CUMPLE';
  const a11yTitle = `Alzado del edificio · ${state.plantas.length} plantas · ${verdict} η=${(etaMaxGlobal * 100).toFixed(0)}%`;
  const a11yDesc = critico
    ? `Edificio multi-planta DB-SE-F. Plantas (de cubierta a planta baja): ${plantasCalc.slice().reverse().map((pl) => `${pl.nombre} η máx ${(Math.max(...pl.machones.map((m) => m.etaMax)) * 100).toFixed(0)}%`).join(', ')}. Machón crítico: ${critico.planta.nombre} machón ${critico.id} con η ${(critico.etaMax * 100).toFixed(0)}%.`
    : `Edificio de ${state.plantas.length} plantas, sin machón crítico identificado.`;

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', minHeight: 360 }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
        role="img"
        aria-labelledby="mw-svg-title mw-svg-desc"
      >
        <title id="mw-svg-title">{a11yTitle}</title>
        <desc id="mw-svg-desc">{a11yDesc}</desc>
        <defs>
          {plantasCalc.flatMap((pl, pi) => pl.machones.map((m) => {
            // Gradiente vertical de η: cabeza arriba (η_cabeza) y pie abajo
            // (η_pie). Clamp a [0,1] — un machón con η>1 (INCUMPLE) satura
            // en rojo en el extremo correspondiente; el número impreso ya
            // indica el valor exacto. La saturación SÍ comunica gravedad.
            const tTop = Math.max(0, Math.min(1, m.eta_cabeza));
            const tBot = Math.max(0, Math.min(1, m.eta_pie));
            return (
              <linearGradient key={`${pi}-${m.id}`} id={`sg-${pi}-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={heatColor(tTop)} stopOpacity="0.85" />
                <stop offset="100%" stopColor={heatColor(tBot)} stopOpacity="0.95" />
              </linearGradient>
            );
          }))}
          <pattern id="hatch-mw" patternUnits="userSpaceOnUse" width="6" height="6">
            <line x1="0" y1="6" x2="6" y2="0" stroke={cDim} strokeWidth="0.6" />
          </pattern>
        </defs>

        {/* Cimentación */}
        <g>
          <rect x={ox - 30} y={cimY} width={muroW + 60} height={12} fill={cBorder} />
          <rect x={ox - 30} y={cimY + 12} width={muroW + 60} height={12} fill="url(#hatch-mw)" />
          <text x={ox + muroW + 36} y={cimY + 9} fill={cDim} fontSize="9" fontFamily={monoFamily}>CIMENT.</text>
        </g>

        {state.plantas.map((pl, i) => {
          const c = plantaCoords[i];
          const calc = plantasCalc[i];
          // "Cubierta" nominal: convención visual del módulo (renumberPlantas).
          // Solo cuando hay al menos 2 plantas existe una nominal "Cubierta";
          // con N=1 la única planta es "Planta 1" en el panel y el forjado de
          // arriba se etiqueta "FORJADO 1" en el SVG, no "CUBIERTA".
          // (La noción física de cubierta — ρ_n=1.0 cuando no hay muro encima
          //  — vive en el motor de cálculo y no se ve aquí.)
          const esCubierta = i === state.plantas.length - 1 && state.plantas.length >= 2;
          const isSelectedPl = selectedPlantaIdx === i;
          const etaMaxPlanta = Math.max(...calc.machones.map((m) => m.etaMax));
          const colorPlanta = etaMaxPlanta >= 1 ? cFail : etaMaxPlanta >= 0.8 ? cWarn : cOk;

          return (
            <g key={pl.id}>
              {/* Forjado superior */}
              <g style={{ cursor: 'pointer' }} onClick={() => onSelectPlanta(i)}>
                <rect
                  x={ox - 14}
                  y={c.yForjadoTop}
                  width={muroW + 28}
                  height={FORJADO_H}
                  fill={esCubierta ? cElevated : cBorder}
                  stroke={isSelectedPl ? cAccent : (esCubierta ? cAccent : cDim)}
                  strokeWidth={isSelectedPl ? 1.5 : 1}
                  strokeDasharray={esCubierta ? '4 2' : '0'}
                />
                <text x={ox - 18} y={c.yForjadoTop + 11} textAnchor="end" fill={cDimText} fontSize="9" fontFamily={monoFamily}>
                  {esCubierta ? 'CUBIERTA' : `FORJADO ${i + 1}`}
                </text>
                {/* G=… Q=… anclado al borde derecho del forjado, alineado al
                    final. Antes flotaba fuera del muro (x=ox+muroW+18) y
                    chocaba con el colorbar lateral cuando muroW era ancho;
                    ahora vive sobre la franja del forjado y solo desaparece
                    si el muro es físicamente más estrecho que el texto, en
                    cuyo caso un overflow visual es preferible a un solape
                    con el colorbar. */}
                <text x={ox + muroW - 6} y={c.yForjadoTop + 11} textAnchor="end" fill={cAccent} fontSize="9" fontFamily={monoFamily}>
                  G={formatNumber(pl.q_G ?? 0, 'linearLoad', system)} Q={formatNumber(pl.q_Q ?? 0, 'linearLoad', system)} {getUnitLabel('linearLoad', system)}
                </text>
              </g>

              {/* Machones */}
              {calc.machones.map((m) => {
                const isCrit = criticalKey === `${i}-${m.id}`;
                const isSelMachon = selectedMachonKey === `${i}|${m.id}`;
                const isHovered = hovered === `m:${i}|${m.id}`;
                const stroke = isSelMachon
                  ? cSelect
                  : isCrit
                    ? cAccent
                    : (m.status === 'fail' ? cFail : m.status === 'warn' ? cWarn : cOkSoft);
                // Borde más grueso cuando status != ok: con el % de utilización
                // siempre en blanco, el borde es la señal categórica principal
                // del estado del machón. fail > warn > ok (default).
                const statusSw = m.status === 'fail' ? 1.8 : m.status === 'warn' ? 1.4 : 0.9;
                const sw = isSelMachon ? 2.4 : isCrit ? 1.8 : isHovered ? Math.max(1.5, statusSw) : statusSw;
                return (
                  <g
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Machón ${m.id} de ${pl.nombre}, η ${(m.etaMax * 100).toFixed(0)}% ${m.status === 'fail' ? 'incumple' : m.status === 'warn' ? 'revisar' : 'cumple'}, pulsa Enter para seleccionar`}
                    style={{ cursor: 'pointer', filter: isHovered && !isSelMachon ? 'brightness(1.25)' : undefined, outline: 'none' }}
                    onClick={(e) => { e.stopPropagation(); onSelectMachon(i, m.id); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectMachon(i, m.id);
                      }
                    }}
                    onFocus={() => setHovered(`m:${i}|${m.id}`)}
                    onBlur={() => setHovered((h) => (h === `m:${i}|${m.id}` ? null : h))}
                    onMouseEnter={() => setHovered(`m:${i}|${m.id}`)}
                    onMouseLeave={() => setHovered((h) => (h === `m:${i}|${m.id}` ? null : h))}
                  >
                    <title>{`${pl.nombre} · machón ${m.id} (${m.ancho.toFixed(0)} mm) · η = ${(m.etaMax * 100).toFixed(0)}%`}</title>
                    <rect
                      x={ox + m.x1 * s}
                      y={c.yTop}
                      width={m.ancho * s}
                      height={c.muroH}
                      fill={fillFor(m, i)}
                      stroke={stroke}
                      strokeWidth={sw}
                    />
                    {isSelMachon && (
                      <rect
                        x={ox + m.x1 * s + 2}
                        y={c.yTop + 2}
                        width={m.ancho * s - 4}
                        height={c.muroH - 4}
                        fill="none"
                        stroke={cSelect}
                        strokeWidth="0.6"
                        strokeDasharray="3 2"
                        pointerEvents="none"
                        opacity="0.6"
                      />
                    )}
                    {m.ancho * s > 26 && c.muroH > 28 && (
                      // Texto del % de utilización siempre en blanco. El
                      // código cromático del estado vive en el heatmap del
                      // propio machón, en su borde y en la etiqueta lateral
                      // de la planta — el texto interior solo tiene que ser
                      // legible. Sin contorno: el peso 700 sobre la
                      // saturación del heatmap basta para leerse.
                      <text
                        x={ox + (m.x1 + m.ancho / 2) * s}
                        y={c.yTop + c.muroH / 2 + 3}
                        textAnchor="middle"
                        // White on the heatmap fill / dark-navy PDF machon; in
                        // light theme with the map OFF the machon is light grey,
                        // so use the themed text color there.
                        fill={forPdf || mostrarMapa ? '#f8fafc' : 'var(--color-text-primary)'}
                        fontSize="9"
                        fontFamily={monoFamily}
                        fontWeight="700"
                      >
                        {(m.etaMax * 100).toFixed(0)}%
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Contorno muro */}
              <rect x={ox} y={c.yTop} width={muroW} height={c.muroH} fill="none" stroke={cBorder} strokeWidth="1" pointerEvents="none" />

              {/* Huecos: puerta y ventana respetan altura y alféizar. La puerta
                  arranca siempre desde el suelo (y=0); la ventana respeta su
                  alféizar (y > 0). En ambos casos el dintel puede tener muro
                  encima (modelado vía h_muro_sobre = max(0, H - (y + h))). */}
              {pl.huecos.map((h) => {
                const esPuerta = h.tipo === 'puerta';
                const hx = ox + h.x * s;
                const hw = h.w * s;
                const hy = c.yBottom - (h.y + h.h) * s;
                const hh = h.h * s;
                const isSel = selectedHueco === h.id;
                const isHov = hovered === `h:${h.id}`;
                const dintelH = Math.max(8, Math.min(14, c.muroH * 0.05));
                return (
                  <g
                    key={h.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${esPuerta ? 'Puerta' : 'Ventana'} ${h.id.slice(-4)} de ${pl.nombre}, ${h.w} mm × ${h.h} mm, pulsa Enter para editar`}
                    onClick={(e) => { e.stopPropagation(); onSelectHueco(h.id, i); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectHueco(h.id, i);
                      }
                    }}
                    onFocus={() => setHovered(`h:${h.id}`)}
                    onBlur={() => setHovered((x) => (x === `h:${h.id}` ? null : x))}
                    onMouseEnter={() => setHovered(`h:${h.id}`)}
                    onMouseLeave={() => setHovered((x) => (x === `h:${h.id}` ? null : x))}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  >
                    <title>{`${pl.nombre} · ${esPuerta ? 'puerta' : 'ventana'} ${h.id.slice(-4)} (${h.w}×${h.h} mm)`}</title>
                    <rect
                      x={hx} y={hy} width={hw} height={hh}
                      fill={huecoFill}
                      stroke={isSel ? cAccent : isHov ? cAccentSoft : cDim}
                      strokeWidth={isSel ? 1.6 : isHov ? 1.4 : 0.8}
                    />
                    {/* DINTEL */}
                    <rect
                      x={hx - 4}
                      y={hy - dintelH}
                      width={hw + 8}
                      height={dintelH}
                      fill={isSel ? cAccentFill : cWarnFill}
                      stroke={isSel ? cAccent : cWarn}
                      strokeWidth="1"
                    />
                    <line x1={hx - 4} y1={hy - dintelH} x2={hx - 4} y2={hy} stroke={isSel ? cAccent : cWarn} strokeWidth="1.5" />
                    <line x1={hx + hw + 4} y1={hy - dintelH} x2={hx + hw + 4} y2={hy} stroke={isSel ? cAccent : cWarn} strokeWidth="1.5" />
                    {!esPuerta && (
                      <line x1={hx - 1} y1={hy + hh} x2={hx + hw + 1} y2={hy + hh} stroke={cDimText} strokeWidth="1" />
                    )}
                    {!esPuerta && hw > 30 && hh > 30 && (
                      <g stroke={isSel ? cAccent : cSection} strokeWidth="0.6" opacity="0.7">
                        <line x1={hx + hw / 2} y1={hy + 2} x2={hx + hw / 2} y2={hy + hh - 2} />
                        <line x1={hx + 2} y1={hy + hh / 2} x2={hx + hw - 2} y2={hy + hh / 2} />
                      </g>
                    )}
                    {esPuerta && hw > 18 && hh > 30 && (
                      <line
                        x1={hx + hw - 6}
                        y1={hy + hh / 2 - 6}
                        x2={hx + hw - 6}
                        y2={hy + hh / 2 + 6}
                        stroke={isSel ? cAccent : cSection}
                        strokeWidth="1.2"
                      />
                    )}
                    {hw > 18 && hh > 14 && (
                      <text
                        x={hx + hw / 2}
                        y={hy + (esPuerta ? hh - 8 : hh / 2 + 3)}
                        textAnchor="middle"
                        fill={isSel ? cAccent : cDim}
                        fontSize="8"
                        fontFamily={monoFamily}
                      >
                        {esPuerta ? 'P' : 'V'}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Reacciones de dintel */}
              {calc.dinteles.map((d) => {
                const huecoDef = pl.huecos.find((h) => h.id === d.id);
                if (!huecoDef) return null;
                // Misma referencia para puerta y ventana: el dintel está en
                // el borde superior del hueco (y + h desde la base de planta).
                const yRef = c.yBottom - (huecoDef.y + huecoDef.h) * s;
                const xL = ox + d.x1 * s;
                const xR = ox + d.x2 * s;
                return (
                  <g key={`r-${d.id}`} opacity={selectedHueco === d.id ? 1 : 0.5}>
                    <text
                      x={(xL + xR) / 2}
                      y={yRef - 14}
                      textAnchor="middle"
                      fill={cWarn}
                      fontSize="8"
                      fontFamily={monoFamily}
                    >
                      R={formatNumber(d.R_apoyo, 'force', system)}
                    </text>
                  </g>
                );
              })}

              {/* Etiqueta lateral */}
              <text
                x={ox + muroW + 18}
                y={c.yTop + c.muroH / 2 + 3}
                fill={isSelectedPl ? cAccent : cDimText}
                fontSize="10"
                fontFamily={monoFamily}
                fontWeight={isSelectedPl ? 600 : 400}
              >
                {pl.nombre}
              </text>
              <text
                x={ox + muroW + 18}
                y={c.yTop + c.muroH / 2 + 16}
                fill={colorPlanta}
                fontSize="9"
                fontFamily={monoFamily}
              >
                η={(etaMaxPlanta * 100).toFixed(0)}%
              </text>

              {/* Cota H */}
              <line x1={ox - 22} y1={c.yTop} x2={ox - 22} y2={c.yBottom} stroke={cDim} strokeWidth="0.5" />
              <line x1={ox - 25} y1={c.yTop} x2={ox - 19} y2={c.yTop} stroke={cDim} strokeWidth="0.5" />
              <line x1={ox - 25} y1={c.yBottom} x2={ox - 19} y2={c.yBottom} stroke={cDim} strokeWidth="0.5" />
              <text x={ox - 26} y={c.yTop + c.muroH / 2 + 3} textAnchor="end" fill={cDim} fontSize="8" fontFamily={monoFamily}>
                {(pl.H / 1000).toFixed(2)} m
              </text>
            </g>
          );
        })}

        {/* Segundo pase: flechas de carga (encima de los muros) */}
        {state.plantas.map((pl, i) => {
          const c = plantaCoords[i];
          return (
            <g key={`arr-${pl.id}`}>
              {Array.from({ length: 10 }).map((_, k) => {
                const fx = ox + (muroW * (k + 0.5)) / 10;
                return (
                  <g key={k} opacity="0.85">
                    <line x1={fx} y1={c.yForjadoTop - 8} x2={fx} y2={c.yForjadoTop - 1} stroke={cAccent} strokeWidth="1" />
                    <path d={`M${fx - 1.8} ${c.yForjadoTop - 3.5} L${fx} ${c.yForjadoTop - 1} L${fx + 1.8} ${c.yForjadoTop - 3.5}`} fill={cAccent} />
                  </g>
                );
              })}
              {pl.puntuales.map((p) => {
                const px = ox + p.x * s;
                return (
                  <g key={`pt-${p.id}`}>
                    <line x1={px} y1={c.yForjadoTop - 22} x2={px} y2={c.yForjadoTop - 2} stroke={cAccent} strokeWidth="1.6" />
                    <path d={`M${px - 3} ${c.yForjadoTop - 6} L${px} ${c.yForjadoTop - 1} L${px + 3} ${c.yForjadoTop - 6}`} fill={cAccent} />
                    <text x={px} y={c.yForjadoTop - 26} textAnchor="middle" fill={cAccent} fontSize="8" fontFamily={monoFamily}>
                      {`G${p.P_G ?? 0}+Q${p.P_Q ?? 0}`}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Colorbar de utilización (η). Anclado al borde derecho del SVG con
            sus tick labels DENTRO (entre wall y bar) para no comerse contenido
            fuera del viewport — antes flotaba en el medio y pisaba las
            etiquetas de planta y de forjado. */}
        {mostrarMapa && (() => {
          const cbW = 10;
          const cbX = width - 18 - cbW;        // pegado al margen derecho
          const cbY = padTop + 20;
          const cbH = Math.min(280, height - padTop - padBottom - 60);
          const stops = [0, 0.25, 0.5, 0.75, 1];
          // Umbrales semánticos del módulo: warn ≥ 0.8, fail ≥ 1.0.
          const thresholds: Array<{ t: number; label: string; color: string }> = [
            { t: 0.80, label: '80%', color: cWarn },
            { t: 1.00, label: '100%', color: cFail },
          ];
          return (
            <g>
              <defs>
                <linearGradient id="cb-grad-mw" x1="0" y1="1" x2="0" y2="0">
                  {stops.map((t) => (
                    <stop key={t} offset={`${t * 100}%`} stopColor={heatColor(t)} stopOpacity="0.95" />
                  ))}
                </linearGradient>
              </defs>
              <text x={cbX + cbW / 2} y={cbY - 8} textAnchor="middle" fill={cDimText} fontSize="9" fontFamily={monoFamily} fontWeight="600">η</text>
              <text x={cbX + cbW / 2} y={cbY + cbH + 18} textAnchor="middle" fill={cDim} fontSize="8" fontFamily={monoFamily}>util.</text>
              <rect x={cbX} y={cbY} width={cbW} height={cbH} fill="url(#cb-grad-mw)" stroke={cBorder} strokeWidth="0.6" />
              {/* Tick labels a la IZQUIERDA del bar (entre bar y wall) para
                  no salirse del viewport por la derecha. */}
              {[1, 0.75, 0.5, 0.25, 0].map((t) => {
                const yy = cbY + cbH * (1 - t);
                return (
                  <g key={t}>
                    <line x1={cbX - 4} y1={yy} x2={cbX} y2={yy} stroke={cDim} strokeWidth="0.6" />
                    <text x={cbX - 6} y={yy + 3} textAnchor="end" fill={cDimText} fontSize="9" fontFamily={monoFamily}>
                      {`${Math.round(t * 100)}%`}
                    </text>
                  </g>
                );
              })}
              {/* Umbrales 80% (warn) y 100% (fail) — marcadores horizontales
                  sobre el bar, mismo color que el estado en los machones. */}
              {thresholds.map(({ t, label, color }) => {
                const yy = cbY + cbH * (1 - t);
                return (
                  <g key={label}>
                    <line x1={cbX} y1={yy} x2={cbX + cbW} y2={yy} stroke={color} strokeWidth="1.6" />
                    <line x1={cbX + cbW} y1={yy} x2={cbX + cbW + 3} y2={yy} stroke={color} strokeWidth="1.6" />
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* Cota L abajo */}
        <line x1={ox} y1={cimY + 32} x2={ox + muroW} y2={cimY + 32} stroke={cDim} strokeWidth="0.6" />
        <line x1={ox} y1={cimY + 28} x2={ox} y2={cimY + 36} stroke={cDim} strokeWidth="0.6" />
        <line x1={ox + muroW} y1={cimY + 28} x2={ox + muroW} y2={cimY + 36} stroke={cDim} strokeWidth="0.6" />
        <text x={ox + muroW / 2} y={cimY + 44} textAnchor="middle" fill={cDimText} fontSize="9" fontFamily={monoFamily}>
          L = {(state.L / 1000).toFixed(2)} m  ·  t = {(state.t / 10).toFixed(1)} cm
        </text>
      </svg>
    </div>
  );
}
