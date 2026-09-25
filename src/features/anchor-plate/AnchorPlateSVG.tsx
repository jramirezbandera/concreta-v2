import { useId } from 'react';
import type { AnchorPlateInputs } from '../../data/defaults';
import { resolveEdges, type AnchorPlateResult } from '../../lib/calculations/anchorPlate';
import { sectionOutline, outlinePathD } from '../../lib/sections';
import {
  huellaPerfil,
  rigidizadores,
  DISPOSICION_LABEL,
  normalizarDisposicion,
} from '../../lib/calculations/anchor-plate/geometria';
import { formatQuantity } from '../../lib/units/format';
import type { UnitSystem } from '../../lib/units/types';

interface Props {
  inp: AnchorPlateInputs;
  result: AnchorPlateResult;
  mode: 'screen' | 'pdf';
  width: number;
  height: number;
  /**
   * Sistema en el que se rotula el dibujo; por defecto el SI, que es como lo da
   * el motor. Lo pasan la pantalla y el clon del PDF —el exportador de este
   * módulo también formatea en el sistema activo—, y va como prop para que el
   * componente siga siendo puro fuera de un `UnitSystemProvider`.
   */
  system?: UnitSystem;
}

// Colors chosen to match the steel-columns module:
//  screen = accent on dark bg; pdf = black strokes on white.
const COLORS = {
  // Screen palette via theme tokens (dark ≈ old literals; profile→bg, na→label).
  screen: {
    plate:        'var(--color-chart-section-fill)',
    plate_stroke: 'var(--color-accent)',
    profile:      'var(--color-chart-profile)',
    profile_stroke: 'var(--color-chart-rebar-dim)',
    bolt_c:       'var(--color-chart-section-fill)',
    // Traccionada iba en `state-fail`. El predicado es `inTension && Ft > 0`:
    // estar traccionada no es una tasa de utilización ni un aviso, así que no
    // es un estado. DESIGN.md §131-133 y components/canvas/paleta.ts:9 dicen lo
    // mismo: «los colores de estado son para el ESTADO: nunca para codificar
    // magnitudes en el dibujo». Una barra al 12% se pintaba del mismo rojo que
    // el INCUMPLE de la tabla —y el MISMO concepto físico, acero traccionado,
    // es `state-ok` verde en encepados (los tirantes)—. Accent, que es el token
    // con rol dual documentado para «estado calculado vivo», y leyenda debajo
    // del dibujo, como en encepados y zapatas.
    bolt_t:       'var(--color-accent)',
    legend:       'var(--color-text-secondary)',
    bolt_stroke:  'var(--color-chart-stirrup)',
    rib:          'var(--color-chart-rebar-dim)',
    rib_hatch:    'var(--color-chart-rebar-faint)',
    pedestal:     'var(--color-chart-section-fill)',
    pedestal_stroke: 'var(--color-chart-rebar-dim)',
    compression:  'color-mix(in srgb, var(--color-accent) 15%, transparent)',
    compression_stroke: 'var(--color-accent)',
    neutral_axis: 'var(--color-chart-label)',   // M9: distinto del compression_stroke
    cone_stroke:  'var(--color-chart-stirrup)',
    text:         'var(--color-text-primary)',
    // Las cotas iban en `chart-rebar-faint`, que index.css documenta como
    // «secondary/side bars»: armadura, no anotación. En el tema oscuro vale
    // #6b6f79 y da 3,89:1 sobre el lienzo (#0c0c0e), por debajo del 4,5:1 de
    // AA para texto de 9 px, así que TODAS las cotas del dibujo —a, b, t,
    // hef— quedaban por debajo del mínimo en el tema firma. `chart-dim-text`
    // es el token que el sistema tiene para esto (es el que usan CotaH/CotaV
    // de components/canvas/primitivas) y da 7,28:1.
    dim:          'var(--color-chart-dim-text)',
  },
  pdf: {
    plate:        '#f1f5f9',
    plate_stroke: '#0ea5e9',
    profile:      '#cbd5e1',
    profile_stroke: '#334155',
    bolt_c:       '#ffffff',
    bolt_t:       '#0284c7',
    legend:       '#475569',
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

// DESIGN.md separa las dos voces del dibujo y el `Rotulo` compartido de
// components/canvas lo dice igual: «sans por defecto, mono para los números».
// La raíz del SVG forzaba mono a TODO, rótulos incluidos. `MONO` marca los
// textos que llevan cifras —cotas, fjd, el ángulo del eje neutro, el ×N y la
// designación del perfil—; el resto (Planta, Alzado, el convenio de signos y
// la leyenda) hereda la sans de la raíz.
const MONO = { fontFamily: 'var(--font-mono, monospace)' } as const;

/** Redondeo a 3 decimales para los `d` escritos a mano (como outlinePathD). */
const n3 = (v: number): number => Math.round(v * 1000) / 1000;

export function AnchorPlateSVG({ inp, result, mode, width, height, system = 'si' }: Props) {
  const C = COLORS[mode];
  // La MISMA geometría que usa el motor (anchor-plate/geometria.ts): huella
  // del perfil (I/H o cajón 2UPN) y cartelas de borde a borde pegadas a sus
  // caras. Dibujo y cálculo no pueden discrepar sobre dónde está el acero.
  const hu = huellaPerfil(inp);
  const rigs = rigidizadores(inp, hu);
  const disposicion = normalizarDisposicion(inp.bar_nLayout);
  // L15 (Phase 4) — IDs estables para aria-labelledby.
  //
  // El sufijo era `mode`, pensado para separar el SVG de pantalla del oculto
  // del PDF. Pero el módulo monta TRES: el de escritorio (`hidden lg:flex`),
  // el de móvil (`lg:hidden`) y el del PDF. Los dos primeros son
  // `mode='screen'`, así que emitían los mismos `na-clip-screen`,
  // `hatch-concrete-screen`, `-title-screen` y `-desc-screen`. Por debajo de
  // 1024 px ganaba el primero del documento —el de escritorio, en
  // `display:none`— y el de móvil resolvía su recorte y su patrón contra una
  // caja de 720×792 que no se estaba viendo: el eje neutro cruzaba el lienzo
  // entero y el macizo salía sin rayado. En escritorio no se notaba porque
  // ganaba el bueno. `useId` da un sufijo único por instancia y estable entre
  // servidor y cliente.
  const uid = useId();
  const titleId = `anchor-plate-svg-title-${uid}`;
  const descId  = `anchor-plate-svg-desc-${uid}`;

  // Dual-panel layout: planta (arriba) + alzado (abajo).
  const panelGap = 12;
  const pad = 24;

  // ─── Geometría natural de cada vista, en mm ──────────────────────────────
  const pedestalW = inp.plate_a + 2 * inp.plate_margin_x;
  const pedestalH = inp.plate_b + 2 * inp.plate_margin_y;

  // Visible column stub above plate. Must extend above the stiffeners so they
  // never visually float above the column — otherwise rib_h > 60 (the previous
  // fixed default) would render the rigidizador taller than the column.
  const colStubMin = 60;
  const colH = inp.rib_count > 0
    ? Math.max(colStubMin, inp.rib_h + 20)
    : colStubMin;
  const hef_visible = inp.bar_hef;
  const alzadoNaturalW = pedestalW;
  const alzadoNaturalH = colH + inp.plate_t + hef_visible;   // mm que escalan

  // ─── UNA escala para las dos vistas ──────────────────────────────────────
  //
  // Planta y alzado comparten eje (`width/2`), así que el ojo las lee como un
  // par en proyección: tienen que ir a la MISMA escala o una cota bajada de una
  // a otra no cae donde debe. Antes cada vista se ajustaba por su cuenta a su
  // medio panel de alto fijo, y con los valores por defecto la misma placa de
  // 400 mm salía 228 px en planta y 285 px en alzado (+25%), el mismo macizo de
  // 700 mm salía 399 y 500 px, y las barras de la planta no caían sobre las del
  // alzado. Mismo criterio que `escalaComun` de PileCapSVG.
  //
  // El reparto vertical lo manda el dibujo, no un 50/50: se descuentan primero
  // los huecos en px y se escala lo que está en mm.
  const alzadoTopGap = 8;      // px, holgura entre el pie del pilar y la placa
  const pedestalBottomPx = 20; // px, macizo dibujado por debajo de hef
  const legendH = 16;          // px, franja de la leyenda al pie
  const alturaUtil = height - 2 * pad - panelGap - alzadoTopGap - pedestalBottomPx - legendH;
  const escala = Math.min(
    (width - 2 * pad) / Math.max(pedestalW, alzadoNaturalW),
    alturaUtil / (pedestalH + alzadoNaturalH),
  );
  const scalePlanta = escala;
  const scaleAlzado = escala;

  // ─── Rótulos que no se pisan ─────────────────────────────────────────────
  //
  // El dibujo colocaba cada rótulo en coordenadas fijas y no comprobaba nada,
  // así que `fjd=...` se salía por el borde derecho de la placa y se metía en
  // la cota «b = ...» (5 colisiones medidas con getBBox), y «EN (φ=...)» caía
  // sobre la línea de cota «a = ...» y su marca derecha (3 colisiones).
  //
  // Se estima el ancho con el paso de la monoespaciada —0,6 · cuerpo, el mismo
  // criterio que PileCapSVG y el lienzo de viento y nieve— y se cede en dos
  // pasos: primero se quita la unidad, y si aún no cabe se reduce el cuerpo
  // hasta el 70 %. Por debajo no se encoge más: un rótulo ilegible no es mejor
  // que uno pisado.
  const anchoEstimado = (t: string, cuerpoPx: number) => t.length * cuerpoPx * 0.6;
  const sinUnidad = (t: string) => {
    const corte = t.lastIndexOf(' ');
    return corte > 0 ? t.slice(0, corte) : t;
  };

  // ─── PLANTA (arriba) ─────────────────────────────────────────────────────
  const pw = pedestalW * escala;
  const ph = pedestalH * escala;
  const pCx = width / 2;
  const pCy = pad + ph / 2;

  const plateW = inp.plate_a * escala;
  const plateH = inp.plate_b * escala;

  // ─── ALZADO (abajo) ──────────────────────────────────────────────────────
  const alzadoTop = pad + ph + panelGap;
  const panelH = alzadoTop - panelGap / 2;   // y del separador punteado
  const plateYrect = alzadoTop + colH * escala + alzadoTopGap;
  const aPlateW = inp.plate_a * escala;
  const aPlateT = Math.max(3, inp.plate_t * escala);
  const aCx = width / 2;
  const aPlateX = aCx - aPlateW / 2;

  const hefVisPx = inp.bar_hef * escala;
  const pedestalAlzadoW = pedestalW * escala;
  const pedestalAlzadoX = aCx - pedestalAlzadoW / 2;
  const pedestalAlzadoY = plateYrect + aPlateT;
  const pedestalAlzadoH = hefVisPx + pedestalBottomPx;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}
    >
      <title id={titleId}>Placa de anclaje — planta y alzado</title>
      <desc id={descId}>
        {`${inp.sectionType} ${inp.sectionSize}, placa ${inp.plate_a}×${inp.plate_b}×${inp.plate_t} mm, `}
        {`${disposicion} barras Ø${inp.bar_diam} ${inp.bar_grade} (${DISPOSICION_LABEL[disposicion]}). `}
        {inp.rib_count >= 2
          ? `${inp.rib_count} rigidizadores de ${inp.rib_h}×${inp.rib_t} mm pegados a las caras del pilar, de borde a borde y achaflanados a 45°. `
          : 'Sin rigidizadores. '}
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
          data-role="macizo-planta"
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
          data-role="placa-planta"
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
          <pattern id={`hatch-compression-${uid}`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
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
          const lblY = pCy + cy_mm * scalePlanta;
          // El bloque comprimido suele ser una cuña estrecha contra el borde de
          // la placa, así que un rótulo centrado en su centroide se salía por
          // ese borde y se metía en la cota «b». Cede la unidad, luego cuerpo, y
          // en última instancia se recoloca para quedar dentro de la placa.
          const fjdLargo = `fjd=${formatQuantity(result.solver.fjd_MPa ?? 0, 'stress', system)}`;
          const huecoFjd = plateW * 0.9;
          const fjdTexto = anchoEstimado(fjdLargo, 9) <= huecoFjd ? fjdLargo : sinUnidad(fjdLargo);
          const anchoFjd = anchoEstimado(fjdTexto, 9);
          const fjdCuerpo = anchoFjd <= huecoFjd ? 9 : Math.max(9 * 0.7, (huecoFjd * 9) / anchoFjd);
          const semiFjd = anchoEstimado(fjdTexto, fjdCuerpo) / 2;
          const lblX = Math.min(
            Math.max(pCx + cx_mm * scalePlanta, pCx - plateW / 2 + semiFjd + 2),
            pCx + plateW / 2 - semiFjd - 2,
          );
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
                <polygon points={pts} fill={`url(#hatch-compression-${uid})`} stroke="none" />
              )}
              {result.solver.fjd_MPa !== undefined && (
                <text
                  x={lblX}
                  y={lblY}
                  fill={C.compression_stroke}
                  fontSize={fjdCuerpo}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  opacity={0.95}
                  style={{ ...MONO, paintOrder: 'stroke', stroke: mode === 'pdf' ? '#ffffff' : 'var(--color-bg-primary)', strokeWidth: 2 }}
                >
                  {fjdTexto}
                </text>
              )}
            </>
          );
        })()}
        {/* El solver axial también publica su bloque (rectángulo de profundidad
            y_c desde el borde comprimido) desde 2026-09-23, así que ya no hay
            que inventar un rectángulo al 35 % cuando falta el polígono: si no
            hay bloque es que no hay compresión (tracción pura). */}

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
          const lbxCrudo = pCx + (d * cos + labelMm * sin) * scalePlanta;
          const lbyCrudo = pCy + (d * sin - labelMm * cos) * scalePlanta;
          // La banda [plateTop − 16, plateTop] la ocupan la línea de cota «a»,
          // sus dos marcas y su texto. Si el rótulo del eje neutro cae ahí, se
          // sube por encima de todo eso en vez de encabalgarse; y en cualquier
          // caso se mantiene dentro del macizo para no salirse del panel.
          // φ normalizado a [-90°, +90°] para legibilidad ingenieril.
          const enTexto = `EN (φ=${(() => {
            let g = (phi * 180) / Math.PI;
            while (g > 90) g -= 180;
            while (g < -90) g += 180;
            return g.toFixed(0);
          })()}°)`;
          const semiEn = anchoEstimado(enTexto, 9) / 2;
          const plateTop = pCy - plateH / 2;
          // El texto va con dominantBaseline="middle", así que su caja va de
          // lby − semialto a lby + semialto: hay que comparar la CAJA con la
          // banda, no la línea base (con la línea base sola, las disposiciones
          // de 6 y 8 barras seguían rozándola).
          const semiAltoEn = 6;
          const enBandaCotaA =
            lbyCrudo + semiAltoEn > plateTop - 16 && lbyCrudo - semiAltoEn < plateTop;
          const lby = enBandaCotaA ? plateTop - 16 - semiAltoEn - 4 : lbyCrudo;
          const lbx = Math.min(
            Math.max(lbxCrudo, pCx - pw / 2 + semiEn),
            pCx + pw / 2 - semiEn,
          );
          return (
            <g>
              {/* Clip the NA line to the plate rect — the parametric segment is
                  extended by a full plate-diagonal each way, so for an off-center
                  NA (biaxial) most of it lies outside the plate and would overflow
                  the panel as a long diagonal. */}
              <defs>
                <clipPath id={`na-clip-${uid}`}>
                  <rect
                    x={pCx - plateW / 2}
                    y={pCy - plateH / 2}
                    width={plateW}
                    height={plateH}
                  />
                </clipPath>
              </defs>
              <line
                x1={pCx + x0 * scalePlanta}
                y1={pCy + y0 * scalePlanta}
                x2={pCx + x1 * scalePlanta}
                y2={pCy + y1 * scalePlanta}
                stroke={C.neutral_axis}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                opacity={0.85}
                clipPath={`url(#na-clip-${uid})`}
              />
              <text
                x={lbx}
                y={lby}
                fill={C.neutral_axis}
                fontSize={9}
                textAnchor="middle"
                dominantBaseline="middle"
                style={MONO}
              >
                {enTexto}
              </text>
            </g>
          );
        })()}

        {/* Rigidizadores (planta) — los que devuelve `rigidizadores()`, que son
            los que usa el motor: chapas de espesor rib_t pegadas a las caras
            del perfil y continuas de borde a borde de la placa. Van DEBAJO del
            perfil y de las barras; con la geometría real ninguna barra puede
            caer sobre una cartela sin que el motor lo marque como no
            construible. rib_h (altura) sólo se ve en el alzado. */}
        {rigs.map((r) => (
          <rect
            key={`rib-planta-${r.eje}${r.lado}`}
            data-role="rigidizador-planta"
            data-eje={r.eje}
            x={pCx + r.rect.x1 * scalePlanta}
            y={pCy + r.rect.y1 * scalePlanta}
            width={(r.rect.x2 - r.rect.x1) * scalePlanta}
            height={(r.rect.y2 - r.rect.y1) * scalePlanta}
            fill={C.rib}
            stroke={C.rib_hatch}
            strokeWidth={1}
          />
        ))}

        {/* Huella del perfil, centrada en la placa, con la geometría que
            calcula el motor. I/H: su contorno real con los acuerdos alma-ala
            (lib/sections/outline, el mismo que dibujan vigas y pilares); se
            genera con el canto h vertical y aquí h corre a lo largo del eje
            fuerte (x), así que se gira 90°: alas verticales en x = ±h/2 y alma
            horizontal. 2UPN: las dos U enfrentadas, con las almas en y = ±b/2
            y las puntas de las alas soldadas en y = 0 (el trazo común de los
            dos polígonos es el cordón). Sin catálogo (perfil desconocido) se
            pinta la caja estimada a trazos. */}
        {hu.catalogo && hu.tipo === '2UPN' && (() => {
          const X = (mm: number) => n3(pCx + mm * scalePlanta);
          const Y = (mm: number) => n3(pCy + mm * scalePlanta);
          const h2 = hu.h / 2, b2 = hu.bf / 2;
          // Una U: el alma en y = lado·b/2 y las alas hacia y = 0.
          const u = (lado: 1 | -1): string => {
            const ya = lado * b2, yi = lado * (b2 - hu.tw);
            const pts: Array<[number, number]> = [
              [-h2, ya], [h2, ya], [h2, 0], [h2 - hu.tf, 0],
              [h2 - hu.tf, yi], [-h2 + hu.tf, yi], [-h2 + hu.tf, 0], [-h2, 0],
            ];
            return `M ${pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' L ')} Z`;
          };
          return ([1, -1] as const).map((lado) => (
            <path
              key={`upn-${lado}`}
              d={u(lado)}
              fill={C.profile}
              stroke={C.profile_stroke}
              strokeWidth={1}
              data-role="perfil-planta"
              data-tipo="2UPN"
            />
          ));
        })()}
        {hu.catalogo && hu.tipo === 'I' && (() => {
          const outline = sectionOutline({ kind: 'I', h: hu.h, b: hu.bf, tf: hu.tf, tw: hu.tw, r: hu.r });
          if (!outline) return null;
          const d = outlinePathD(outline, (mm) => mm * scalePlanta, (mm) => mm * scalePlanta, (mm) => mm * scalePlanta);
          return (
            <path
              d={d}
              transform={`translate(${pCx} ${pCy}) rotate(90)`}
              fill={C.profile}
              stroke={C.profile_stroke}
              strokeWidth={1}
              data-role="perfil-planta"
            />
          );
        })()}
        {!hu.catalogo && (
          <rect
            data-role="perfil-planta"
            x={pCx - (hu.h / 2) * scalePlanta}
            y={pCy - (hu.bf / 2) * scalePlanta}
            width={hu.h * scalePlanta}
            height={hu.bf * scalePlanta}
            fill={C.profile}
            stroke={C.profile_stroke}
            strokeWidth={1}
            strokeDasharray="3 2"
          />
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
              data-role="barra-planta"
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
            grupo se levanta al cambiar el signo.

            design review 2026-09-21: estaba a 8 px, con opacidad 0.6 y pegado
            al separador, en la esquina derecha del lienzo. Es el dato que no se
            puede equivocar —invertir el signo invierte qué barras trabajan— y
            era el texto menos visible del dibujo. Sube junto al rótulo de la
            vista, al mismo cuerpo y la misma opacidad que «Planta». */}
        <g fill={C.text} opacity={0.7}>
          <line x1={72} y1={12} x2={86} y2={12} stroke={C.text} strokeWidth={1} />
          <path d={`M ${86} ${12} l -4 -2.5 l 0 5 z`} fill={C.text} />
          <text x={92} y={16} fontSize={10}>
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
        <text x={pCx} y={pCy - plateH / 2 - 11} fill={C.dim} fontSize={9} textAnchor="middle" style={MONO}>
          a = {inp.plate_a}
        </text>
        {/* Cota b (paralela al eje y) */}
        <g stroke={C.dim} strokeWidth={0.5}>
          <line x1={pCx + plateW / 2} y1={pCy - plateH / 2} x2={pCx + plateW / 2 + 10} y2={pCy - plateH / 2} />
          <line x1={pCx + plateW / 2} y1={pCy + plateH / 2} x2={pCx + plateW / 2 + 10} y2={pCy + plateH / 2} />
          <line x1={pCx + plateW / 2 + 7} y1={pCy - plateH / 2} x2={pCx + plateW / 2 + 7} y2={pCy + plateH / 2} />
        </g>
        <text x={pCx + plateW / 2 + 11} y={pCy} fill={C.dim} fontSize={9} textAnchor="start" dominantBaseline="middle" style={MONO}>
          b = {inp.plate_b}
        </text>

        {/* Cotas cX y cY (2026-09-25): el usuario no sabía de qué barra se
            medía cX. Arrancan en el eje de la fila exterior de barras y miden
            lo que usa el CÁLCULO (cX1 hacia +x, cY1 hacia +y), no lo que se
            dibuja: si el macizo está mal descrito (c ≠ e + m), la cota no llega
            a la cara pintada o se pasa, y el aviso del motor lo explica.
            cX va en la franja entre la placa y la cara +y del macizo; cY, en
            la franja de la izquierda, de canto como manda el plano. */}
        {(() => {
          const xb = inp.plate_a / 2 - inp.bar_edge_x;   // fila exterior +x
          const yb = inp.plate_b / 2 - inp.bar_edge_y;   // fila exterior +y
          const { cX1: cx, cY1: cy } = resolveEdges(inp);
          const X = (mm: number) => pCx + mm * escala;
          const Y = (mm: number) => pCy + mm * escala;
          // Línea de cota en mitad de la franja, y nunca pegada a la placa.
          const yCotaX = pCy + plateH / 2 + Math.max((inp.plate_margin_y * escala) / 2, 8);
          const xCotaY = pCx - plateW / 2 - Math.max((inp.plate_margin_x * escala) / 2, 8);
          const cuerpo = (texto: string, hueco: number) =>
            anchoEstimado(texto, 9) <= hueco ? 9 : Math.max(9 * 0.7, (hueco * 9) / anchoEstimado(texto, 9));
          const textoX = `cX = ${cx}`;
          const textoY = `cY = ${cy}`;
          const cuerpoX = cuerpo(textoX, cx * escala - 4);
          const cuerpoY = cuerpo(textoY, cy * escala - 4);
          return (
            <>
              <g data-role="cota-cX" stroke={C.dim} strokeWidth={0.5}>
                <line x1={X(xb)} y1={Y(yb)} x2={X(xb)} y2={yCotaX + 3} strokeDasharray="1.5 1.5" />
                <line x1={X(xb + cx)} y1={yCotaX - 3} x2={X(xb + cx)} y2={yCotaX + 3} />
                <line x1={X(xb)} y1={yCotaX} x2={X(xb + cx)} y2={yCotaX} />
              </g>
              <text
                data-role="cota-cX-texto"
                x={X(xb + cx / 2)}
                y={yCotaX - 3}
                fill={C.dim}
                fontSize={cuerpoX}
                textAnchor="middle"
                style={MONO}
              >
                {textoX}
              </text>
              <g data-role="cota-cY" stroke={C.dim} strokeWidth={0.5}>
                <line x1={X(-xb)} y1={Y(yb)} x2={xCotaY - 3} y2={Y(yb)} strokeDasharray="1.5 1.5" />
                <line x1={xCotaY - 3} y1={Y(yb + cy)} x2={xCotaY + 3} y2={Y(yb + cy)} />
                <line x1={xCotaY} y1={Y(yb)} x2={xCotaY} y2={Y(yb + cy)} />
              </g>
              <text
                data-role="cota-cY-texto"
                x={xCotaY - 3}
                y={Y(yb + cy / 2)}
                fill={C.dim}
                fontSize={cuerpoY}
                textAnchor="middle"
                transform={`rotate(-90 ${xCotaY - 3} ${Y(yb + cy / 2)})`}
                style={MONO}
              >
                {textoY}
              </text>
            </>
          );
        })()}
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
        <pattern id={`hatch-concrete-${uid}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.pedestal_stroke} strokeWidth="0.5" />
        </pattern>
        <rect x={pedestalAlzadoX} y={pedestalAlzadoY} width={pedestalAlzadoW} height={pedestalAlzadoH} fill={`url(#hatch-concrete-${uid})`} />

        {/* Pilar (alzado; D10 — la pista visual de 5 segundos). Se mira a lo
            largo de y. I/H: las dos alas de canto en x = ±h/2 y el alma entre
            ellas. 2UPN: se ve de frente el alma de la U más cercana, una chapa
            maciza de ancho h. Sin catálogo no hay pilar que pintar. */}
        {hu.catalogo && (() => {
          const colW = hu.h * scaleAlzado;   // h corre a lo largo de plate_a
          const colTf = hu.tf * scaleAlzado;
          const colTw = hu.tw * scaleAlzado;
          const colX = aCx - colW / 2;
          const colY = plateYrect - colH * scaleAlzado;
          const colHpx = colH * scaleAlzado;
          const chapa = (key: string, x: number, w: number) => (
            <rect key={key} data-role="perfil-alzado" x={x} y={colY} width={w} height={colHpx} fill={C.profile} stroke={C.profile_stroke} strokeWidth={1} />
          );
          return (
            <g>
              {hu.tipo === '2UPN'
                ? chapa('alma', colX, colW)
                : [chapa('ala-1', colX, colTf), chapa('ala-2', colX + colW - colTf, colTf), chapa('alma', aCx - colTw / 2, colTw)]}
              {/* Designación del perfil */}
              <text x={aCx} y={colY - 4} fill={C.text} fontSize={9} textAnchor="middle" opacity={0.7} style={MONO}>
                {inp.sectionType} {inp.sectionSize}
              </text>
            </g>
          );
        })()}

        {/* Rigidizadores (alzado). Se mira a lo largo de y, así que se ve de
            frente la cartela del par X más cercana (la de y = −bf/2 − t): UNA
            chapa continua de borde a borde de la placa, de altura rib_h sobre
            el pilar y ACHAFLANADA A 45° hacia cada borde, como en la lámina de
            arranque de pilar del estudio. El chaflán arranca en la cara del
            ala y muere a hRes del pie en el borde de la placa; si el vuelo es
            más corto que la caída, muere donde el 45° lo lleve. Las cartelas
            del par Y (rib_count = 4) se ven de canto: dos tiras de espesor
            rib_t pegadas a las caras de las alas, detrás de la del frente. */}
        {inp.rib_count >= 2 && (() => {
          const X = (mm: number) => aCx + mm * scaleAlzado;
          const Z = (mm: number) => plateYrect - mm * scaleAlzado;
          const a2 = inp.plate_a / 2;
          const h2 = hu.h / 2;
          const ribH = Math.max(0, inp.rib_h);
          const hRes = Math.max(20, 0.3 * ribH);
          const caida = Math.max(0, ribH - hRes);
          const vuelo = Math.max(0, a2 - h2);
          const xInicio = vuelo >= caida ? a2 - caida : h2;
          const zFin = vuelo >= caida ? hRes : ribH - vuelo;
          const puntos = [
            [-a2, 0], [-a2, zFin], [-xInicio, ribH], [xInicio, ribH], [a2, zFin], [a2, 0],
          ] as const;
          const t = Math.max(0, inp.rib_t);
          return (
            <g>
              {inp.rib_count >= 4 && [1, -1].map((lado) => (
                <rect
                  key={`rib-canto-${lado}`}
                  data-role="rigidizador-alzado-canto"
                  x={X(lado > 0 ? h2 : -h2 - t)}
                  y={Z(ribH)}
                  width={Math.max(1, t * scaleAlzado)}
                  height={ribH * scaleAlzado}
                  fill={C.rib}
                  stroke={C.rib_hatch}
                  strokeWidth={1}
                />
              ))}
              <polygon
                data-role="rigidizador-alzado"
                points={puntos.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}
                fill={C.rib}
                stroke={C.rib_hatch}
                strokeWidth={1}
                strokeLinejoin="round"
              />
            </g>
          );
        })()}

        {/* Placa */}
        <rect
          data-role="placa-alzado"
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
                    style={MONO}
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
              <text x={dimX + 4} y={(yTop + yBot) / 2} fill={C.dim} fontSize={9} textAnchor="start" dominantBaseline="middle" style={MONO}>
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
              <text x={dimX - 4} y={(yTop + yBot) / 2} fill={C.dim} fontSize={9} textAnchor="end" dominantBaseline="middle" style={MONO}>
                t = {inp.plate_t}
              </text>
            </g>
          );
        })()}
      </g>

      {/* Leyenda — el dibujo codifica por color y forma (traccionada rellena,
          comprimida hueca, bloque comprimido en accent a trazos) y hasta ahora
          no lo explicaba en ninguna parte. Mismo sitio y mismo cuerpo que la de
          PileCapSVG; IsolatedFootingSVG añade la suya «a11y para colorblind»,
          que es el otro motivo: el relleno distingue sin depender del color. */}
      {(() => {
        const ly = height - 6;
        const r = 4;
        const x0 = 12;
        const sangria = 2 * r + 5;   // hueco entre la muestra y su texto
        const separacion = 16;       // aire entre entradas
        // Mismo criterio de ceder por pasos que los rótulos: el tercer texto es
        // el largo, así que primero se acorta y luego se reduce el cuerpo. Con
        // un paso fijo, en el lienzo de móvil (334 px) la tercera entrada se
        // salía por la derecha.
        const cuerpoBase = mode === 'pdf' ? 6 : 9;
        const disponible = width - 2 * x0;
        const componer = (tercero: string, cuerpo: number) => {
          const textos = ['barra traccionada', 'comprimida', tercero];
          const total = textos.reduce(
            (acc, t) => acc + sangria + anchoEstimado(t, cuerpo) + separacion,
            -separacion,
          );
          return { textos, cuerpo, total };
        };
        let l = componer('bloque comprimido de hormigón', cuerpoBase);
        if (l.total > disponible) l = componer('bloque comprimido', cuerpoBase);
        if (l.total > disponible) {
          const encogido = Math.max(cuerpoBase * 0.7, (cuerpoBase * disponible) / l.total);
          l = componer(l.textos[2], encogido);
        }
        // Offsets acumulados sin mutar nada: el compilador de React rechaza
        // reasignar una variable dentro del map (react-hooks/immutability).
        const pos = l.textos.map((_, i) =>
          x0 + l.textos
            .slice(0, i)
            .reduce((acc, t) => acc + sangria + anchoEstimado(t, l.cuerpo) + separacion, 0),
        );
        return (
          <g fill={C.legend} fontSize={l.cuerpo}>
            <circle cx={pos[0] + r} cy={ly - 3} r={r} fill={C.bolt_t} stroke={C.bolt_stroke} strokeWidth={1} />
            <text x={pos[0] + sangria} y={ly}>{l.textos[0]}</text>
            <circle cx={pos[1] + r} cy={ly - 3} r={r} fill={C.bolt_c} stroke={C.bolt_stroke} strokeWidth={1} />
            <text x={pos[1] + sangria} y={ly}>{l.textos[1]}</text>
            <rect
              x={pos[2]} y={ly - 7} width={2 * r} height={2 * r}
              fill={C.compression} stroke={C.compression_stroke} strokeWidth={1} strokeDasharray="2 2"
            />
            <text x={pos[2] + sangria} y={ly}>{l.textos[2]}</text>
          </g>
        );
      })()}
    </svg>
  );
}
