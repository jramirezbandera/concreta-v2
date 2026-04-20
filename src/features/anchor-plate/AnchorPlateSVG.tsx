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
    cone_stroke:  '#94a3b8',
    text:         '#f8fafc',
    dim:          '#64748b',
  },
  pdf: {
    plate:        '#ffffff',
    plate_stroke: '#000000',
    profile:      '#e5e7eb',
    profile_stroke: '#000000',
    bolt_c:       '#ffffff',
    bolt_t:       '#d1d5db',
    bolt_stroke:  '#000000',
    rib:          '#f3f4f6',
    rib_hatch:    '#6b7280',
    pedestal:     '#ffffff',
    pedestal_stroke: '#9ca3af',
    compression:  'rgba(0,0,0,0.08)',
    compression_stroke: '#000000',
    cone_stroke:  '#6b7280',
    text:         '#000000',
    dim:          '#6b7280',
  },
};

export function AnchorPlateSVG({ inp, result, mode, width, height }: Props) {
  const C = COLORS[mode];
  const profile = makeISectionBySize(inp.sectionType, inp.sectionSize)?.profile;

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
  const colH = 60;                              // visible column stub above plate
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
      style={{ fontFamily: 'var(--font-mono, monospace)' }}
    >
      <title>Placa de anclaje — planta y alzado</title>
      <desc>{`${inp.sectionType} ${inp.sectionSize}, placa ${inp.plate_a}×${inp.plate_b}×${inp.plate_t} mm, ${inp.bar_nLayout} barras Ø${inp.bar_diam} ${inp.bar_grade}`}</desc>

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

        {/* Compression zone — biaxial: real polygon from solver (plate-local mm).
            Axis-aligned: simple rectangular approximation (no solver polygon). */}
        {result.valid && result.solver.lifted && result.solver.block && result.solver.block.length >= 3 && (() => {
          const pts = result.solver.block!
            .map((p) => `${pCx + p.x * scalePlanta},${pCy + p.y * scalePlanta}`)
            .join(' ');
          return (
            <polygon
              points={pts}
              fill={C.compression}
              stroke={C.compression_stroke}
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          );
        })()}
        {result.valid && result.solver.lifted && !result.solver.block && (() => {
          // Axis-aligned fallback rectangle (no solver polygon available).
          const mxSign = Math.sign(inp.Mx) || 1;
          const blockW = plateW * 0.35;
          const blockX = mxSign > 0 ? pCx + plateW / 2 - blockW : pCx - plateW / 2;
          return (
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
          );
        })()}

        {/* Neutral axis line (biaxial only — phi_NA + d_NA in plate coords) */}
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
          return (
            <line
              x1={pCx + x0 * scalePlanta}
              y1={pCy + y0 * scalePlanta}
              x2={pCx + x1 * scalePlanta}
              y2={pCy + y1 * scalePlanta}
              stroke={C.compression_stroke}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              opacity={0.8}
            />
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
        {/* Dimensions a × b */}
        <text x={pCx} y={pCy - plateH / 2 - 4} fill={C.dim} fontSize={9} textAnchor="middle">
          a = {inp.plate_a}
        </text>
        <text x={pCx + plateW / 2 + 4} y={pCy} fill={C.dim} fontSize={9} textAnchor="start">
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
        {/* Hormigón hatch */}
        <pattern id="hatch-concrete" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.pedestal_stroke} strokeWidth="0.5" />
        </pattern>
        <rect x={pedestalAlzadoX} y={pedestalAlzadoY} width={pedestalAlzadoW} height={pedestalAlzadoH} fill="url(#hatch-concrete)" />

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

        {/* Rigidizadores (alzado: rectangles on either side of profile) */}
        {inp.rib_count >= 2 && profile && (() => {
          const ribH = inp.rib_h * scaleAlzado;
          const ribT = inp.rib_t * scaleAlzado;
          const profB_px = profile.b * scaleAlzado;
          const ribY = plateYrect - ribH;
          return (
            <g>
              <rect x={aCx - profB_px / 2 - ribT / 2} y={ribY} width={ribT} height={ribH} fill={C.rib} stroke={C.rib_hatch} strokeWidth={1} />
              <rect x={aCx + profB_px / 2 - ribT / 2} y={ribY} width={ribT} height={ribH} fill={C.rib} stroke={C.rib_hatch} strokeWidth={1} />
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
        {result.solver.bolts
          .filter((b, i, arr) => arr.findIndex((bb) => bb.x === b.x) === i)
          .map((b) => {
            const bx = aCx + b.x * scaleAlzado;
            const barR = Math.max(2, (inp.bar_diam / 2) * scaleAlzado);
            const filled = b.inTension && b.Ft > 0;
            const barTopY = plateYrect + aPlateT / 2;
            const barBotY = barTopY + hefVisPx;
            const strokeCol = filled ? C.bolt_t : C.bolt_stroke;

            // Cabeza sobre la placa: pequeña proyección que sobresale cuando no
            // está soldada, pastilla de soldadura plana cuando lo está.
            const headAboveY = plateYrect - 4;

            return (
              <g key={`alz-${b.index}`}>
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
              </g>
            );
          })}

        {/* Panel title + hef dim */}
        <text x={12} y={panelH + panelGap + 16} fill={C.text} fontSize={10} opacity={0.7}>
          Alzado
        </text>
        <text x={aCx + aPlateW / 2 + 4} y={plateYrect + aPlateT / 2 + hefVisPx / 2} fill={C.dim} fontSize={9} textAnchor="start">
          hef = {inp.bar_hef}
        </text>
        <text x={aCx - aPlateW / 2 - 4} y={plateYrect + aPlateT / 2 + 3} fill={C.dim} fontSize={9} textAnchor="end">
          t = {inp.plate_t}
        </text>
      </g>
    </svg>
  );
}
