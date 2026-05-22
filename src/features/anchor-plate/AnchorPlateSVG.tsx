import type { AnchorPlateInputs } from '../../data/defaults';
import type { AnchorPlateResult } from '../../lib/calculations/anchorPlate';
import { makeISectionBySize } from '../../lib/sections';

interface Props {
  inp: AnchorPlateInputs;
  result: AnchorPlateResult;
  mode: 'screen' | 'pdf';
  width: number;
  height: number;
}

// Colors chosen to match the steel-columns module:
//  screen = accent on dark bg; pdf = black strokes on white.
const COLORS = {
  screen: {
    plate:        '#334155',
    plate_stroke: '#38bdf8',
    profile:      '#0f172a',
    profile_stroke: '#64748b',
    bolt_c:       '#1e293b',
    bolt_t:       '#ef4444',
    bolt_stroke:  '#94a3b8',
    rib:          '#475569',
    rib_hatch:    '#64748b',
    pedestal:     '#1e293b',
    pedestal_stroke: '#475569',
    compression:  'rgba(56,189,248,0.15)',
    compression_stroke: '#38bdf8',
    neutral_axis: '#cbd5e1',   // M9: distinto del compression_stroke (#38bdf8)
    cone_stroke:  '#94a3b8',
    text:         '#f8fafc',
    dim:          '#64748b',
  },
  pdf: {
    plate:        '#f1f5f9',
    plate_stroke: '#0ea5e9',
    profile:      '#cbd5e1',
    profile_stroke: '#334155',
    bolt_c:       '#ffffff',
    bolt_t:       '#ef4444',
    bolt_stroke:  '#334155',
    rib:          '#e2e8f0',
    rib_hatch:    '#64748b',
    pedestal:     '#ffffff',
    pedestal_stroke: '#475569',
    // M12 (Phase 4): opacidad subida (0.15 → 0.35) para que el bloque
    // comprimido siga siendo legible en impresión B&W. Combinado con M26
    // (hatching pattern superpuesto) la zona se distingue sin color.
    compression:  'rgba(14,165,233,0.35)',
    compression_stroke: '#0ea5e9',
    neutral_axis: '#475569',   // M9: distinto del compression_stroke (#0ea5e9)
    cone_stroke:  '#64748b',
    text:         '#0f172a',
    dim:          '#64748b',
  },
};

// L15 (Phase 4) — IDs estables para aria-labelledby. El sufijo `mode`
// evita colisión entre el SVG de pantalla y el oculto del PDF.
let svgInstanceCounter = 0;

export function AnchorPlateSVG({ inp, result, mode, width, height }: Props) {
  const C = COLORS[mode];
  const profile = makeISectionBySize(inp.sectionType, inp.sectionSize)?.profile;
  // ID determinista a partir de `mode` para que no genere mismatch SSR/CSR.
  const titleId = `anchor-plate-svg-title-${mode}`;
  const descId  = `anchor-plate-svg-desc-${mode}`;
  void svgInstanceCounter;

  // Dual-panel layout: planta (top) + alzado (bottom).
  const panelGap = 12;
  const panelH = (height - panelGap) / 2;

  // ─── PLANTA (top) — scale plate to fit panel width with pedestal margin ──
  const plantaPad = 24;
  const pedestalW = inp.plate_a + 2 * inp.plate_margin_x;
  const pedestalH = inp.plate_b + 2 * inp.plate_margin_y;
  const scalePlanta = Math.min(
    (width - 2 * plantaPad) / pedestalW,
    (panelH - 2 * plantaPad) / pedestalH,
  );

  const pw = pedestalW * scalePlanta;
  const ph = pedestalH * scalePlanta;
  const pCx = width / 2;
  const pCy = plantaPad + ph / 2;

  const plateW = inp.plate_a * scalePlanta;
  const plateH = inp.plate_b * scalePlanta;

  // Profile footprint (planta): I-section outline, rotated so h is along plate_a
  const profH = (profile?.h ?? 200) * scalePlanta;
  const profB = (profile?.b ?? 200) * scalePlanta;
  const profTf = (profile?.tf ?? 15) * scalePlanta;
  const profTw = (profile?.tw ?? 9) * scalePlanta;

  // ─── ALZADO (bottom) ─────────────────────────────────────────────────────
  const alzadoPad = 24;
  const alzadoTopGap = 8;
  // Visible column stub above plate. Must extend above the stiffeners so they
  // never visually float above the column — otherwise rib_h > 60 (the previous
  // fixed default) would render the rigidizador taller than the column.
  const colStubMin = 60;
  const colH = inp.rib_count > 0
    ? Math.max(colStubMin, inp.rib_h + 20)
    : colStubMin;
  const hef_visible = inp.bar_hef;
  const alzadoNaturalH = colH + inp.plate_t + hef_visible + 20;  // mm equivalent
  const alzadoNaturalW = pedestalW;
  const scaleAlzado = Math.min(
    (width - 2 * alzadoPad) / alzadoNaturalW,
    (panelH - 2 * alzadoPad) / alzadoNaturalH,
  );
  const plateYrect = panelH + panelGap + alzadoPad + colH * scaleAlzado + alzadoTopGap;
  const aPlateW = inp.plate_a * scaleAlzado;
  const aPlateT = Math.max(3, inp.plate_t * scaleAlzado);
  const aCx = width / 2;
  const aPlateX = aCx - aPlateW / 2;

  const hefVisPx = inp.bar_hef * scaleAlzado;
  const pedestalAlzadoW = pedestalW * scaleAlzado;
  const pedestalAlzadoX = aCx - pedestalAlzadoW / 2;
  const pedestalAlzadoY = plateYrect + aPlateT;
  const pedestalAlzadoH = hefVisPx + 20;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      style={{ fontFamily: 'var(--font-mono, monospace)' }}
    >
      <title id={titleId}>Placa de anclaje — planta y alzado</title>
      <desc id={descId}>
        {`${inp.sectionType} ${inp.sectionSize}, placa ${inp.plate_a}×${inp.plate_b}×${inp.plate_t} mm, `}
        {`${inp.bar_nLayout} barras Ø${inp.bar_diam} ${inp.bar_grade}. `}
        {result.valid
          ? `Modo solver: ${result.solver.mode}, ${result.solver.n_t} barras traccionadas. `
              + `Veredicto global: ${result.overallStatus.toUpperCase()} `
              + `(utilización máxima ${isFinite(result.worstUtil) ? (result.worstUtil * 100).toFixed(0) + '%' : '∞'}).`
          : 'Sin solicitación introducida.'}
      </desc>

      {/* ═══════════ PLANTA ═══════════ */}
      <g>
        {/* Pedestal outline */}
        <rect
          x={pCx - pw / 2}
          y={pCy - ph / 2}
          width={pw}
          height={ph}
          fill={C.pedestal}
          stroke={C.pedestal_stroke}
          strokeDasharray="4 3"
          strokeWidth={1}
        />

        {/* Plate */}
        <rect
          x={pCx - plateW / 2}
          y={pCy - plateH / 2}
          width={plateW}
          height={plateH}
          fill={C.plate}
          stroke={C.plate_stroke}
          strokeWidth={1.5}
        />

        {/* M26 (Phase 4) — pattern de hatching para la zona comprimida (PDF).
            En B&W el fill por color no se distingue del fondo; superponemos
            líneas diagonales para que la zona sea identificable sin color.
            En pantalla se omite (el dark theme ya tiene contraste). */}
        {mode === 'pdf' && (
          <pattern id={`hatch-compression-${mode}`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke={C.compression_stroke} strokeWidth="0.6" opacity="0.7" />
          </pattern>
        )}

        {/* Compression zone — biaxial: real polygon from solver (plate-local mm).
            Axis-aligned: simple rectangular approximation (no solver polygon). */}
        {result.valid && result.solver.lifted && result.solver.block && result.solver.block.length >= 3 && (() => {
          const block = result.solver.block!;
          const pts = block
            .map((p) => `${pCx + p.x * scalePlanta},${pCy + p.y * scalePlanta}`)
            .join(' ');
          // L10 (Phase 5) — centroide del polígono para etiquetar fjd dentro.
          let cx_mm = 0;
          let y_min = Infinity, y_max = -Infinity;
          for (const p of block) {
            cx_mm += p.x;
            y_min = Math.min(y_min, p.y);
            y_max = Math.max(y_max, p.y);
          }
          cx_mm /= block.length;
          // F5 (design-review): situar el label en el tercio superior del bbox
          // del polígono en lugar del centroide vertical. Cuando el polígono
          // cubre toda la altura de la placa (mid-y = pCy), el centroide
          // coincidía con la cota lateral "b = ..." (también en pCy) y los
          // textos se solapaban.
          const cy_mm = y_min + (y_max - y_min) * 0.3;
          const lblX = pCx + cx_mm * scalePlanta;
          const lblY = pCy + cy_mm * scalePlanta;
          return (
            <>
              <polygon
                points={pts}
                fill={C.compression}
                stroke={C.compression_stroke}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              {mode === 'pdf' && (
                <polygon points={pts} fill={`url(#hatch-compression-${mode})`} stroke="none" />
              )}
              {result.solver.fjd_MPa !== undefined && (
                <text
                  x={lblX}
                  y={lblY}
                  fill={C.compression_stroke}
                  fontSize={9}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  opacity={0.95}
                  style={{ paintOrder: 'stroke', stroke: mode === 'pdf' ? '#ffffff' : '#0f172a', strokeWidth: 2 }}
                >
                  {`fjd=${result.solver.fjd_MPa.toFixed(1)} MPa`}
                </text>
              )}
            </>
          );
        })()}
        {result.valid && result.solver.lifted && !result.solver.block && (() => {
          // Axis-aligned fallback rectangle (no solver polygon available).
          const mxSign = Math.sign(inp.Mx) || 1;
          const blockW = plateW * 0.35;
          const blockX = mxSign > 0 ? pCx + plateW / 2 - blockW : pCx - plateW / 2;
          return (
            <>
              <rect
                x={blockX}
                y={pCy - plateH / 2}
                width={blockW}
                height={plateH}
                fill={C.compression}
                stroke={C.compression_stroke}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              {mode === 'pdf' && (
                <rect x={blockX} y={pCy - plateH / 2} width={blockW} height={plateH}
                      fill={`url(#hatch-compression-${mode})`} stroke="none" />
              )}
            </>
          );
        })()}

        {/* Neutral axis line (biaxial only — phi_NA + d_NA in plate coords).
            M9 (Phase 4) — color distinto del compression_stroke (que era
            cyan-dashed igual al borde del polígono comprimido) + label con
            el ángulo φ. */}
        {result.valid && result.solver.phi_NA !== undefined && result.solver.d_NA !== undefined && (() => {
          const phi = result.solver.phi_NA!;
          const d = result.solver.d_NA!;
          const cos = Math.cos(phi), sin = Math.sin(phi);
          // NA line: x·cos + y·sin = d. Extend far enough to cross the plate.
          const L = Math.hypot(inp.plate_a, inp.plate_b);
          const x0 = d * cos - L * sin;
          const y0 = d * sin + L * cos;
          const x1 = d * cos + L * sin;
          const y1 = d * sin - L * cos;
          // Label position: extremo +sin de la línea, ligeramente hacia afuera.
          const labelMm = 1.05 * (inp.plate_a / 2);
          const lbx = pCx + (d * cos + labelMm * sin) * scalePlanta;
          const lby = pCy + (d * sin - labelMm * cos) * scalePlanta;
          // φ normalizado a [-90°, +90°] para legibilidad ingenieril.
          let phi_deg = (phi * 180) / Math.PI;
          while (phi_deg > 90) phi_deg -= 180;
          while (phi_deg < -90) phi_deg += 180;
          return (
            <g>
              <line
                x1={pCx + x0 * scalePlanta}
                y1={pCy + y0 * scalePlanta}
                x2={pCx + x1 * scalePlanta}
                y2={pCy + y1 * scalePlanta}
                stroke={C.neutral_axis}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                opacity={0.85}
              />
              <text
                x={lbx}
                y={lby}
                fill={C.neutral_axis}
                fontSize={9}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {`EN (φ=${phi_deg.toFixed(0)}°)`}
              </text>
            </g>
          );
        })()}

        {/* Profile footprint (I-section) centered on plate */}
        {profile && (
          <g>
            {/* Top flange */}
            <rect x={pCx - profH / 2} y={pCy - profB / 2}       width={profH} height={profTf} fill={C.profile} stroke={C.profile_stroke} strokeWidth={1} />
            {/* Bottom flange */}
            <rect x={pCx - profH / 2} y={pCy + profB / 2 - profTf} width={profH} height={profTf} fill={C.profile} stroke={C.profile_stroke} strokeWidth={1} />
            {/* Web */}
            <rect x={pCx - profTw / 2} y={pCy - profB / 2 + profTf} width={profTw} height={profB - 2 * profTf} fill={C.profile} stroke={C.profile_stroke} strokeWidth={1} />
          </g>
        )}

        {/* Rigidizadores (planta).
            checkPlateBending convention (anchorPlate.ts):
              rib_count=2: 2 nervios paralelos al eje fuerte, a ambos lados de
                           las alas → uno en cada voladizo de plate_a, centrado
                           en y, extendido en x desde el ala hasta el borde de
                           la placa (longitud = c_strong = (plate_a − h)/2).
              rib_count=4: 2 adicionales paralelos al eje débil → uno en cada
                           voladizo de plate_b, centrado en x, extendido en y
                           (longitud = c_weak = (plate_b − b)/2).
            Aquí dibujamos el FOOTPRINT del nervio en planta: largo × espesor.
            rib_h (altura vertical) NO se muestra en planta — solo en alzado. */}
        {inp.rib_count >= 2 && profile && (() => {
          const ribT = inp.rib_t * scalePlanta;
          const profH_px = profile.h * scalePlanta;
          const profB_px = profile.b * scalePlanta;
          // Voladizos en píxeles, desde el ala hasta el borde de la placa.
          const cStrongPx = Math.max(0, (plateW - profH_px) / 2);
          const cWeakPx   = Math.max(0, (plateH - profB_px) / 2);
          return (
            <g>
              {/* Nervios paralelos al eje fuerte (en los voladizos x). */}
              <rect x={pCx - plateW / 2} y={pCy - ribT / 2}
                    width={cStrongPx} height={ribT}
                    fill={C.rib} stroke={C.rib_hatch} strokeWidth={1} />
              <rect x={pCx + profH_px / 2} y={pCy - ribT / 2}
                    width={cStrongPx} height={ribT}
                    fill={C.rib} stroke={C.rib_hatch} strokeWidth={1} />
              {inp.rib_count === 4 && (
                <>
                  {/* Nervios paralelos al eje débil (en los voladizos y). */}
                  <rect x={pCx - ribT / 2} y={pCy - plateH / 2}
                        width={ribT} height={cWeakPx}
                        fill={C.rib} stroke={C.rib_hatch} strokeWidth={1} />
                  <rect x={pCx - ribT / 2} y={pCy + profB_px / 2}
                        width={ribT} height={cWeakPx}
                        fill={C.rib} stroke={C.rib_hatch} strokeWidth={1} />
                </>
              )}
            </g>
          );
        })()}

        {/* Barras (planta: círculo según diámetro real) */}
        {result.solver.bolts.map((b) => {
          const bx = pCx + b.x * scalePlanta;
          const by = pCy + b.y * scalePlanta;
          const r = Math.max(3, (inp.bar_diam / 2) * scalePlanta);
          const filled = b.inTension && b.Ft > 0;
          return (
            <circle
              key={b.index}
              cx={bx}
              cy={by}
              r={r}
              fill={filled ? C.bolt_t : C.bolt_c}
              stroke={C.bolt_stroke}
              strokeWidth={1.2}
            />
          );
        })}

        {/* Panel title */}
        <text x={12} y={16} fill={C.text} fontSize={10} opacity={0.7}>
          Planta
        </text>
        {/* M14 (Phase 4) — flecha de convención de signos Mx: indica el lado
            que tracciona bajo +Mx. Sin esto el usuario no sabe qué lado del
            grupo se levanta al cambiar el signo. */}
        <g opacity={0.75} fill={C.text}>
          <line x1={width - 18} y1={panelH - 16} x2={width - 4} y2={panelH - 16}
                stroke={C.text} strokeWidth={0.8} opacity={0.5} />
          <path d={`M ${width - 4} ${panelH - 16} l -4 -2 l 0 4 z`} fill={C.text} opacity={0.5} />
          <text x={width - 6} y={panelH - 4} fontSize={8} textAnchor="end" opacity={0.6}>
            +Mx tracciona −x
          </text>
        </g>
        {/* L7 (Phase 4) — witness lines (líneas de extensión) en las cotas
            a y b: arranque de tick sobre el borde de la placa hacia la cota,
            haciéndolas verdaderas anotaciones de plano y no texto suelto. */}
        {/* Cota a (paralela al eje x) */}
        <g stroke={C.dim} strokeWidth={0.5}>
          <line x1={pCx - plateW / 2} y1={pCy - plateH / 2} x2={pCx - plateW / 2} y2={pCy - plateH / 2 - 10} />
          <line x1={pCx + plateW / 2} y1={pCy - plateH / 2} x2={pCx + plateW / 2} y2={pCy - plateH / 2 - 10} />
          <line x1={pCx - plateW / 2} y1={pCy - plateH / 2 - 7} x2={pCx + plateW / 2} y2={pCy - plateH / 2 - 7} />
        </g>
        <text x={pCx} y={pCy - plateH / 2 - 11} fill={C.dim} fontSize={9} textAnchor="middle">
          a = {inp.plate_a}
        </text>
        {/* Cota b (paralela al eje y) */}
        <g stroke={C.dim} strokeWidth={0.5}>
          <line x1={pCx + plateW / 2} y1={pCy - plateH / 2} x2={pCx + plateW / 2 + 10} y2={pCy - plateH / 2} />
          <line x1={pCx + plateW / 2} y1={pCy + plateH / 2} x2={pCx + plateW / 2 + 10} y2={pCy + plateH / 2} />
          <line x1={pCx + plateW / 2 + 7} y1={pCy - plateH / 2} x2={pCx + plateW / 2 + 7} y2={pCy + plateH / 2} />
        </g>
        <text x={pCx + plateW / 2 + 11} y={pCy} fill={C.dim} fontSize={9} textAnchor="start" dominantBaseline="middle">
          b = {inp.plate_b}
        </text>
      </g>

      {/* ═══════════ ALZADO ═══════════ */}
      <g>
        {/* Panel separator */}
        <line x1={0} y1={panelH} x2={width} y2={panelH} stroke={C.dim} strokeWidth={0.5} strokeDasharray="2 2" />

        {/* Pedestal (hormigón) */}
        <rect
          x={pedestalAlzadoX}
          y={pedestalAlzadoY}
          width={pedestalAlzadoW}
          height={pedestalAlzadoH}
          fill={C.pedestal}
          stroke={C.pedestal_stroke}
          strokeDasharray="4 3"
          strokeWidth={1}
        />
        {/* Hormigón hatch — id is suffixed by mode so the screen SVG and the
            hidden PDF SVG can coexist in the DOM without url(#…) colliding (M23). */}
        <pattern id={`hatch-concrete-${mode}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.pedestal_stroke} strokeWidth="0.5" />
        </pattern>
        <rect x={pedestalAlzadoX} y={pedestalAlzadoY} width={pedestalAlzadoW} height={pedestalAlzadoH} fill={`url(#hatch-concrete-${mode})`} />

        {/* Column profile silhouette (D10 — 5-second visual tell) */}
        {profile && (() => {
          const colScale = scaleAlzado;
          const colW = profile.h * colScale;   // h is along plate_a in our convention
          const colTf = profile.tf * colScale;
          const colTw = profile.tw * colScale;
          const colBf = profile.b * colScale;  // used for flange thickness indicator only
          const colX = aCx - colW / 2;
          const colY = plateYrect - colH * scaleAlzado;
          const colHpx = colH * scaleAlzado;
          // Simplified I-section elevation: two outer vertical lines + web
          return (
            <g>
              <rect x={colX} y={colY} width={colTf} height={colHpx} fill={C.profile} stroke={C.profile_stroke} strokeWidth={1} />
              <rect x={colX + colW - colTf} y={colY} width={colTf} height={colHpx} fill={C.profile} stroke={C.profile_stroke} strokeWidth={1} />
              <rect x={aCx - colTw / 2} y={colY} width={colTw} height={colHpx} fill={C.profile} stroke={C.profile_stroke} strokeWidth={1} />
              {/* Profile label */}
              <text x={aCx} y={colY - 4} fill={C.text} fontSize={9} textAnchor="middle" opacity={0.7}>
                {inp.sectionType} {inp.sectionSize}
              </text>
              {/* Unused but referenced to silence lint */}
              <g style={{ display: 'none' }} data-col-bf={colBf} />
            </g>
          );
        })()}

        {/* Rigidizadores (alzado).
            En el alzado vemos el plano X-Z, donde X = eje fuerte (plate_a) y
            Z = vertical. Los nervios paralelos al eje fuerte (rib_count ≥ 2)
            tienen su SILUETA completa visible: ancho = c_strong (extensión en
            x desde el ala hasta el borde de la placa), alto = rib_h.
            Los nervios paralelos al eje débil (rib_count == 4) son perpen-
            diculares al plano del alzado — su silueta se solapa con el alma
            del perfil. Para no clutter visual, no se dibujan aquí. */}
        {inp.rib_count >= 2 && profile && (() => {
          const ribH = inp.rib_h * scaleAlzado;
          const profH_px = profile.h * scaleAlzado;
          const cStrongPx = Math.max(0, (aPlateW - profH_px) / 2);
          const ribY = plateYrect - ribH;
          return (
            <g>
              <rect x={aCx - aPlateW / 2} y={ribY}
                    width={cStrongPx} height={ribH}
                    fill={C.rib} stroke={C.rib_hatch} strokeWidth={1} />
              <rect x={aCx + profH_px / 2} y={ribY}
                    width={cStrongPx} height={ribH}
                    fill={C.rib} stroke={C.rib_hatch} strokeWidth={1} />
            </g>
          );
        })()}

        {/* Placa */}
        <rect
          x={aPlateX}
          y={plateYrect}
          width={aPlateW}
          height={aPlateT}
          fill={C.plate}
          stroke={C.plate_stroke}
          strokeWidth={1.5}
        />

        {/* Barras de anclaje (alzado) — dos detalles ortogonales:
            top_connection (cabeza sobre la placa):
              soldada         → cordón de soldadura en la cara superior.
              tuerca_arandela → tuerca + arandela (rectángulo) sobresaliendo.
            bottom_anchorage (extremo embebido):
              prolongacion_recta → barra recta hasta hef.
              patilla            → doblado 90° al final.
              gancho             → doblado ≥135° al final.
              arandela_tuerca    → arandela + tuerca al fondo (pullout). */}
        {/* H7 (Phase 5): agrupar barras por x — en el alzado las que comparten
            posición se solapan. Antes el filter por `arr.findIndex` mostraba
            sólo la primera de cada columna; para layout 9 el usuario veía 3
            barras donde el solver tiene 9. Ahora se renderiza una represen-
            tante por columna (la tensa si la hay, para que el color refleje
            el peor caso) y un sufijo "×N" cuando N > 1. */}
        {(() => {
          const byX = new Map<number, typeof result.solver.bolts>();
          for (const b of result.solver.bolts) {
            const key = Math.round(b.x);    // robustez frente a float drift
            const arr = byX.get(key) ?? [];
            arr.push(b);
            byX.set(key, arr);
          }
          return Array.from(byX.entries());
        })()
          .map(([xKey, group]) => {
            const rep = group.find((b) => b.inTension && b.Ft > 0) ?? group[0];
            const count = group.length;
            const bx = aCx + rep.x * scaleAlzado;
            const barR = Math.max(2, (inp.bar_diam / 2) * scaleAlzado);
            const filled = rep.inTension && rep.Ft > 0;
            const barTopY = plateYrect + aPlateT / 2;
            const barBotY = barTopY + hefVisPx;
            const strokeCol = filled ? C.bolt_t : C.bolt_stroke;

            // Cabeza sobre la placa: pequeña proyección que sobresale cuando no
            // está soldada, pastilla de soldadura plana cuando lo está.
            const headAboveY = plateYrect - 4;

            return (
              <g key={`alz-col-${xKey}`}>
                {/* Shaft de la barra (línea gruesa según diámetro) */}
                <line
                  x1={bx} y1={barTopY}
                  x2={bx} y2={barBotY}
                  stroke={strokeCol}
                  strokeWidth={Math.max(1.2, barR)}
                />

                {/* Parte superior sobre la placa — driven by top_connection */}
                {inp.top_connection === 'tuerca_arandela' && (
                  <>
                    <line x1={bx} y1={barTopY} x2={bx} y2={headAboveY} stroke={strokeCol} strokeWidth={Math.max(1.2, barR)} />
                    {/* Tuerca (hex simplificada como rectángulo) */}
                    <rect
                      x={bx - barR * 1.6}
                      y={headAboveY - barR * 1.4}
                      width={barR * 3.2}
                      height={barR * 1.4}
                      fill={filled ? C.bolt_t : C.bolt_c}
                      stroke={C.bolt_stroke}
                      strokeWidth={1}
                    />
                  </>
                )}
                {inp.top_connection === 'soldada' && (
                  // Cordón de soldadura: triángulo a cada lado del eje en la cara superior de la placa
                  <g>
                    <path
                      d={`M ${bx - barR} ${plateYrect} L ${bx - barR - 4} ${plateYrect} L ${bx - barR} ${plateYrect - 4} Z`}
                      fill={C.bolt_stroke}
                    />
                    <path
                      d={`M ${bx + barR} ${plateYrect} L ${bx + barR + 4} ${plateYrect} L ${bx + barR} ${plateYrect - 4} Z`}
                      fill={C.bolt_stroke}
                    />
                  </g>
                )}

                {/* Detalle del extremo embebido — driven by bottom_anchorage */}
                {inp.bottom_anchorage === 'patilla' && (
                  <path
                    d={`M ${bx} ${barBotY} L ${bx + Math.max(8, barR * 4)} ${barBotY}`}
                    stroke={strokeCol}
                    strokeWidth={Math.max(1.2, barR)}
                    fill="none"
                    strokeLinecap="round"
                  />
                )}
                {inp.bottom_anchorage === 'gancho' && (
                  <path
                    d={`M ${bx} ${barBotY} Q ${bx + barR * 3} ${barBotY} ${bx + barR * 3} ${barBotY - barR * 3}`}
                    stroke={strokeCol}
                    strokeWidth={Math.max(1.2, barR)}
                    fill="none"
                    strokeLinecap="round"
                  />
                )}
                {inp.bottom_anchorage === 'arandela_tuerca' && (() => {
                  const wR = Math.max(barR * 1.5, (inp.washer_od / 2) * scaleAlzado);
                  return (
                    <g>
                      {/* Arandela (rectángulo plano en elevación) */}
                      <rect
                        x={bx - wR}
                        y={barBotY - barR * 0.8}
                        width={wR * 2}
                        height={barR * 1.6}
                        fill={C.bolt_c}
                        stroke={C.bolt_stroke}
                        strokeWidth={1}
                      />
                      {/* Tuerca debajo de la arandela */}
                      <rect
                        x={bx - barR * 1.3}
                        y={barBotY + barR * 0.8}
                        width={barR * 2.6}
                        height={barR * 1.2}
                        fill={C.bolt_c}
                        stroke={C.bolt_stroke}
                        strokeWidth={1}
                      />
                    </g>
                  );
                })()}
                {/* prolongacion_recta: barra recta, sin remate en el fondo */}

                {/* H7 — sufijo "×N" cuando hay más de una barra en la columna */}
                {count > 1 && (
                  <text
                    x={bx + barR + 3}
                    y={barTopY + 8}
                    fill={C.text}
                    fontSize={8}
                    opacity={0.7}
                  >
                    ×{count}
                  </text>
                )}
              </g>
            );
          })}

        {/* Panel title + hef/t dimensions */}
        <text x={12} y={panelH + panelGap + 16} fill={C.text} fontSize={10} opacity={0.7}>
          Alzado
        </text>
        {/* L7 (Phase 4) — cota hef: witness lines desde la cara inf. de la
            placa y el extremo de la barra hacia la línea de cota. */}
        {(() => {
          const dimX = aCx + pedestalAlzadoW / 2 + 10;
          const yTop = plateYrect + aPlateT;
          const yBot = plateYrect + aPlateT + hefVisPx;
          return (
            <g>
              <g stroke={C.dim} strokeWidth={0.5}>
                <line x1={aCx + pedestalAlzadoW / 2} y1={yTop} x2={dimX + 3} y2={yTop} />
                <line x1={aCx + pedestalAlzadoW / 2} y1={yBot} x2={dimX + 3} y2={yBot} />
                <line x1={dimX} y1={yTop} x2={dimX} y2={yBot} />
              </g>
              <text x={dimX + 4} y={(yTop + yBot) / 2} fill={C.dim} fontSize={9} textAnchor="start" dominantBaseline="middle">
                hef = {inp.bar_hef}
              </text>
            </g>
          );
        })()}
        {/* L7 — cota t (espesor placa): witness lines a la izquierda. */}
        {(() => {
          const dimX = aCx - pedestalAlzadoW / 2 - 10;
          const yTop = plateYrect;
          const yBot = plateYrect + aPlateT;
          return (
            <g>
              <g stroke={C.dim} strokeWidth={0.5}>
                <line x1={aCx - aPlateW / 2} y1={yTop} x2={dimX - 3} y2={yTop} />
                <line x1={aCx - aPlateW / 2} y1={yBot} x2={dimX - 3} y2={yBot} />
                <line x1={dimX} y1={yTop} x2={dimX} y2={yBot} />
              </g>
              <text x={dimX - 4} y={(yTop + yBot) / 2} fill={C.dim} fontSize={9} textAnchor="end" dominantBaseline="middle">
                t = {inp.plate_t}
              </text>
            </g>
          );
        })()}
      </g>
    </svg>
  );
}
