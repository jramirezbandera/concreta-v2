import { type PileCapInputs } from '../../data/defaults';
import { type PileCapResult } from '../../lib/calculations/pileCap';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { dec, formatQuantity } from '../../lib/units/format';
import type { UnitSystem } from '../../lib/units/types';

interface PileCapSVGProps {
  inp:    PileCapInputs;
  result: PileCapResult;
  width:  number;
  mode?:  'screen' | 'pdf';
}

// Color tokens — screen vs pdf
function colors(isPdf: boolean) {
  return {
    // Screen via theme tokens (follows light/dark). PDF branch literal, untouched.
    bg:         isPdf ? '#ffffff' : 'transparent',
    capFill:    isPdf ? '#f1f5f9' : 'var(--color-bg-surface)',
    capStroke:  isPdf ? '#334155' : 'var(--color-chart-rebar-dim)',
    colFill:    isPdf ? '#cbd5e1' : 'var(--color-chart-section-fill)',
    colStroke:  isPdf ? '#475569' : 'var(--color-chart-rebar-faint)',
    pileFill:   isPdf ? '#ffffff' : 'var(--color-bg-primary)',
    // El micropilote más cargado se distingue por COLOR, no sólo por el grosor
    // del trazo: va en accent con el relleno teñido y los demás en gris. Antes
    // `pileStroke` era el mismo `accent` y la leyenda señalaba algo invisible.
    pileStroke: isPdf ? '#94a3b8' : 'var(--color-chart-pile)',   // acero de micropilote, legible en claro y oscuro
    pileCrit:   isPdf ? '#0284c7' : 'var(--color-accent)',
    pileCritFill: isPdf ? '#e0f2fe' : 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
    tieStroke:  isPdf ? '#22c55e' : 'var(--color-state-ok)',
    strutStroke:isPdf ? '#f59e0b' : 'var(--color-state-warn)',
    textMain:   isPdf ? '#0f172a' : 'var(--color-text-primary)',
    textSec:    isPdf ? '#475569' : 'var(--color-text-secondary)',
  };
}

/**
 * La caja del dibujo, en píxeles del lienzo. Las dos vistas comparten
 * márgenes Y ESCALA: dibujan el mismo encepado de L_x de ancho, así que una
 * cota que se baje de la planta a la sección tiene que caer en el mismo sitio,
 * como en un plano. Hasta 2026-09-21 cada una se escalaba contra una caja de
 * alto FIJO —`width·0.62` la planta y `width·0.55` menos un arranque de pilar
 * de 80 px la sección—, y el resultado era que:
 *
 *   • cualquier encepado más alto que ancho en planta (todos salvo el de dos)
 *     se escalaba por el ALTO y dejaba un tercio del lienzo en blanco a los
 *     lados. Con 6 micropilotes de 2200×2700 el encepado ocupaba 76 px de los
 *     320 del lienzo del PDF: en el papel, 20 mm de los 85 de su columna, y
 *     los rótulos de reacción se pisaban unos a otros.
 *   • la sección salía a un quinto de la escala de la planta (16 px de alto
 *     útil para un canto de 900 mm), que es justo lo que un plano no hace.
 *
 * Ahora manda el ANCHO útil y el alto del lienzo sale del dibujo. Los topes
 * están para que una planta muy alargada o un canto enorme no conviertan el
 * lienzo en una tira.
 */
const cuerpo = (isPdf: boolean) => (isPdf ? 7 : 10);
/** Margen izquierdo: la cota del recubrimiento que la sección escribe fuera
 *  («c=70», anclada por la derecha a 1,3 cuerpos del encepado). */
const margenIzq = (isPdf: boolean) => Math.round(cuerpo(isPdf) * 4.5);
/** Margen derecho: la cota z de la sección («z=699» a 1,4 cuerpos). La cota Ly
 *  de la planta ya no pide sitio aquí: va GIRADA contra el borde del encepado,
 *  como en un plano, que cuesta un cuerpo de ancho en vez de seis. */
const margenDer = (isPdf: boolean) => Math.round(cuerpo(isPdf) * 5.2);

function escalaComun(
  width: number, isPdf: boolean, L_x: number, L_y: number, h_enc: number,
): number {
  const usableW = width - margenIzq(isPdf) - margenDer(isPdf);
  return Math.min(
    usableW / L_x,            // manda el ancho
    (width * 1.25) / L_y,     // tope: planta muy alargada
    (width * 0.55) / h_enc,   // tope: canto enorme en la sección
  );
}

// ── Plan view ────────────────────────────────────────────────────────────────

function PlanView({
  inp, result, width, isPdf, system,
}: { inp: PileCapInputs; result: PileCapResult; width: number; isPdf: boolean; system: UnitSystem }) {
  const c = colors(isPdf);
  const { pilePos, ties, reactions, L_x, L_y, R_max, R_min, outline, e_borde } = result;
  // Sin momentos los seis micropilotes llevan la misma carga y TODOS eran «el
  // más cargado»: el dibujo salía entero en azul y la leyenda señalaba a los
  // seis, que es no señalar a ninguno. Se distingue sólo cuando hay reparto.
  const hayCritico = R_max - R_min > 0.5;   // kN
  const n     = inp.n as number;
  const s_pil = inp.s as number;
  const d_p   = inp.d_p as number;
  const b_col = inp.b_col as number;
  const h_col = inp.h_col as number;
  const plateOn = (inp.plate_on as boolean | undefined) ?? false;
  const plateSq = inp.plate_shape === 'cuad';
  const d_plate = (inp.d_plate as number | undefined) ?? 0;

  // Márgenes asimétricos y compartidos con la sección (ver `escalaComun`): a la
  // izquierda y a la derecha caben las cotas que la sección escribe FUERA del
  // encepado, y la planta los respeta para que las dos vistas dibujen el
  // encepado al mismo ancho y en la misma posición.
  const fPlan = cuerpo(isPdf);
  const margin = margenIzq(isPdf);
  const marginR = margenDer(isPdf);
  const legendH = Math.round(fPlan * 1.8);
  // Arriba, la cota Lx; abajo, el rótulo de reacción de la fila inferior, que
  // con poca distancia a borde asoma por debajo del contorno.
  const marginT = Math.round(fPlan * 1.8);
  const marginB = Math.round(fPlan * 2.4);
  const usableW = width - margin - marginR;
  const scale  = escalaComun(width, isPdf, L_x, L_y, inp.h_enc as number);
  const height = Math.round(L_y * scale + marginT + marginB + legendH);

  // Se centra la ENVOLVENTE del contorno, no el centroide del grupo: el
  // hexágono de n=3 no es simétrico respecto al centroide (sube 2h/3+e y
  // baja h/3+e) y centrarlo por el centroide lo sacaba del lienzo por arriba
  // y pisaba la cota superior. Coordenadas del motor: mm desde el centroide.
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  // Centro del hueco útil, que ya no es el centro del cuadro: el margen
  // derecho de la cota lo desplaza a la izquierda.
  const ox = margin + usableW / 2;
  const oy = marginT + (height - marginT - marginB - legendH) / 2;

  const px = (x: number) => ox + (x - cx) * scale;
  const py = (y: number) => oy - (y - cy) * scale;  // SVG y-axis flipped

  const capHalfX = (L_x / 2) * scale;
  const capHalfY = (L_y / 2) * scale;
  const colHalfX = (b_col / 2) * scale;
  const colHalfY = (h_col / 2) * scale;
  const r_pile   = (d_p / 2) * scale;

  // Clamp pile radius to a visible range
  const r_px = Math.min(Math.max(r_pile, 4), Math.max(20, capHalfY * 0.3));

  /*
   * RÓTULOS DE REACCIÓN SIN SOLAPARSE.
   *
   * Van centrados bajo cada micropilote, así que dos de la misma fila se pisan
   * en cuanto el texto es más ancho que la separación entre ejes dibujada —que
   * es lo que pasaba en el PDF: «R5=405 kN» y «R6=405 kN» encabalgados, y los
   * de la fila de abajo saliendo por los lados del encepado—.
   *
   * Se estima el ancho con el paso de la monoespaciada (0,6 · cuerpo, el mismo
   * criterio que los rótulos del lienzo de viento y nieve) y se cede en dos
   * pasos: primero se quita la unidad —que es la misma en los seis y ya está
   * en la columna de datos— y, si aún no cabe, se reduce el cuerpo hasta el
   * 70 %. Por debajo de eso no se encoge más: un número ilegíble no es mejor
   * que uno pisado.
   */
  const anchoEstimado = (t: string, cuerpoPx: number) => t.length * cuerpoPx * 0.6;
  const rotuloLargo = (i: number) =>
    `R${i + 1}=${formatQuantity(reactions[i], 'force', system, { precision: 0 })}`;
  const sinUnidad = (t: string) => {
    const corte = t.lastIndexOf(' ');
    return corte > 0 ? t.slice(0, corte) : t;
  };
  // Hueco disponible: la menor separación dibujada entre pilotes de una misma
  // fila (los de filas distintas no comparten línea de texto).
  let huecoRotulo = Infinity;
  for (let i = 0; i < pilePos.length; i++) {
    for (let j = i + 1; j < pilePos.length; j++) {
      if (Math.abs(pilePos[i].y - pilePos[j].y) > 1) continue;
      huecoRotulo = Math.min(huecoRotulo, Math.abs(pilePos[i].x - pilePos[j].x) * scale);
    }
  }
  const cabe = (textos: string[], cuerpoPx: number) =>
    Math.max(...textos.map((t) => anchoEstimado(t, cuerpoPx))) <= huecoRotulo * 0.92;
  const largos = pilePos.map((_, i) => rotuloLargo(i));
  const rotulos = cabe(largos, fPlan) ? largos : largos.map(sinUnidad);
  const anchoRotulo = Math.max(...rotulos.map((t) => anchoEstimado(t, fPlan)));
  const fRotulo = anchoRotulo <= huecoRotulo * 0.92
    ? fPlan
    : Math.max(fPlan * 0.7, (huecoRotulo * 0.92 * fPlan) / anchoRotulo);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Vista en planta del encepado"
    >
      {/* Cap outline: rectángulo (n=2/4) o triángulo achaflanado (n=3) — el
        * contorno real lo da el motor, aquí solo se proyecta */}
      <polygon
        points={outline.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
        fill={c.capFill} stroke={c.capStroke} strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Tie lines (bottom layer): las bandas que arma el motor (result.ties),
        * sin diagonales. */}
      {ties.map(([i, j]) => (
        <line
          key={`tie-${i}-${j}`}
          x1={px(pilePos[i].x)} y1={py(pilePos[i].y)}
          x2={px(pilePos[j].x)} y2={py(pilePos[j].y)}
          stroke={c.tieStroke} strokeWidth={1.2} strokeDasharray="4 3"
          opacity={0.6}
        />
      ))}

      {/* Column — en el centroide del grupo de pilotes */}
      <rect
        x={px(0) - colHalfX} y={py(0) - colHalfY}
        width={2 * colHalfX} height={2 * colHalfY}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1}
      />

      {/* Piles */}
      {pilePos.map((p, i) => {
        const isCrit = hayCritico && reactions[i] === R_max;
        // Placa de reparto en cabeza: contorno discontinuo a escala real
        const r_plate_px = (d_plate / 2) * scale;
        return (
          <g key={`pile-${i}`}>
            {plateOn && (plateSq ? (
              <rect
                x={px(p.x) - r_plate_px} y={py(p.y) - r_plate_px}
                width={2 * r_plate_px} height={2 * r_plate_px}
                fill="none" stroke={isCrit ? c.pileCrit : c.pileStroke} strokeWidth={1} strokeDasharray="3 2"
                opacity={0.8}
              />
            ) : (
              <circle
                cx={px(p.x)} cy={py(p.y)} r={r_plate_px}
                fill="none" stroke={isCrit ? c.pileCrit : c.pileStroke} strokeWidth={1} strokeDasharray="3 2"
                opacity={0.8}
              />
            ))}
            <circle
              cx={px(p.x)} cy={py(p.y)} r={r_px}
              fill={isCrit ? c.pileCritFill : c.pileFill}
              stroke={isCrit ? c.pileCrit : c.pileStroke}
              strokeWidth={isCrit ? 2.5 : 1.5}
            />
            {/* Reaction label */}
            <text
              x={px(p.x)}
              y={py(p.y) + r_px + fRotulo * 1.1}
              textAnchor="middle"
              fontSize={fRotulo}
              fill={isCrit ? c.pileCrit : c.textSec}
              fontWeight={isCrit ? 600 : undefined}
              fontFamily="monospace"
            >
              {rotulos[i]}
            </text>
          </g>
        );
      })}

      {/* Dimension labels — n=3: las cotas de obra son s y e (la envolvente
        * Lx × Ly no es una cota, se da como referencia) */}
      <text
        x={ox} y={oy - capHalfY - 5}
        textAnchor="middle" fontSize={isPdf ? 7 : 10}
        fill={c.textSec} fontFamily="monospace"
      >
        {n === 3
          ? `s=${s_pil.toFixed(0)} · e=${e_borde.toFixed(0)} mm`
          : `Lx=${L_x.toFixed(0)} mm`}
      </text>
      {n === 3 ? (
        // Envolvente del hexágono: abajo a la derecha (a la derecha del
        // contorno no cabe en el clon del PDF de 280 px)
        <text
          x={width - 6} y={height - 8}
          textAnchor="end" fontSize={isPdf ? 7 : 10}
          fill={c.textSec} fontFamily="monospace"
        >
          {`env. ${L_x.toFixed(0)}×${L_y.toFixed(0)} mm`}
        </text>
      ) : (
        <text
          x={ox + capHalfX + fPlan * 1.2} y={oy}
          textAnchor="middle" fontSize={fPlan}
          fill={c.textSec} fontFamily="monospace"
          dominantBaseline="middle"
          transform={`rotate(-90 ${ox + capHalfX + fPlan * 1.2} ${oy})`}
        >
          {`Ly=${L_y.toFixed(0)} mm`}
        </text>
      )}

      {/* Legend — sólo si hay a quién señalar */}
      {hayCritico ? (
        <>
          <circle cx={12} cy={height - 12} r={4} fill={c.pileCritFill} stroke={c.pileCrit} strokeWidth={2} />
          <text x={20} y={height - 8} fontSize={isPdf ? 6 : 9} fill={c.textSec} fontFamily="monospace">
            micropilote más cargado
          </text>
        </>
      ) : (
        <text x={8} y={height - 8} fontSize={isPdf ? 6 : 9} fill={c.textSec} fontFamily="monospace">
          {`reacción igual en los ${pilePos.length} micropilotes`}
        </text>
      )}
    </svg>
  );
}

// ── Section view ─────────────────────────────────────────────────────────────

function SectionView({
  inp, result, width, isPdf,
}: { inp: PileCapInputs; result: PileCapResult; width: number; isPdf: boolean }) {
  const c = colors(isPdf);
  const h_enc  = inp.h_enc as number;
  const b_col  = inp.b_col as number;
  const n      = inp.n as number;
  const d_p    = inp.d_p as number;
  const cover  = inp.cover as number;
  const plateOn = (inp.plate_on as boolean | undefined) ?? false;
  const d_plate = (inp.d_plate as number | undefined) ?? 0;
  const { L_x, z_eff, theta_deg } = result;

  // La MISMA escala que la planta (ver `escalaComun`): las dos vistas dibujan
  // el encepado al mismo ancho y en la misma posición, de modo que se puede
  // bajar una cota de una a otra, como en un plano. Antes cada una se
  // calculaba contra una caja de alto fijo y la sección salía a un quinto de
  // la escala de la planta: 16 px de alto útil para un canto de 900 mm.
  const f = cuerpo(isPdf);
  const margin = margenIzq(isPdf);
  const marginR = margenDer(isPdf);
  const scale = escalaComun(width, isPdf, L_x, result.L_y, h_enc);

  const capW  = L_x * scale;
  const capH  = h_enc * scale;
  // El arranque de pilar es SIMBÓLICO: proporcional al canto, no 80 px fijos
  // que con la escala real dejaban el encepado convertido en una raya debajo.
  const colStubH = Math.round(Math.max(f * 2.4, capH * 0.5));
  // Banda de abajo donde asoman los micropilotes, con su rótulo de fila.
  const pileZone = Math.round(Math.max(f * 3, (d_p / 2) * scale * 2 + f * 2));
  const marginT = Math.round(f * 1.2);
  const marginB = Math.round(f * 1.2);
  const legendH = Math.round(f * 1.8);
  const height = Math.round(marginT + colStubH + capH + pileZone + marginB + legendH);
  const colW  = b_col * scale;
  const r_pile = Math.min(Math.max((d_p / 2) * scale, 4), Math.max(18, capH * 0.35));
  const cov_px = cover * scale;

  // Section origin: cap top-left
  const ox = margin + (width - margin - marginR) / 2 - capW / 2;
  const oy = marginT + colStubH;

  // Sección por la fila de pilotes más ancha: dos pilotes a ±x_max (s/2 con
  // 2, 3 y 4 pilotes; s_x/2 con la retícula 2 × 3).
  const x_r = Math.max(...result.pilePos.map((p) => Math.abs(p.x)));
  const pile_x_left  = ox + (L_x / 2 - x_r) * scale;
  const pile_x_right = ox + (L_x / 2 + x_r) * scale;
  const pile_y       = oy + capH + r_pile;   // pile tops at cap bottom

  // Tie bar y position (from cap bottom)
  const tie_y = oy + capH - cov_px;

  // Strut lines: from column base (cap top center) to each pile top
  const col_cx = ox + capW / 2;
  const col_by = oy;  // cap top = col base

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Sección transversal del encepado"
    >
      {/* Column stub */}
      <rect
        x={col_cx - colW / 2} y={oy - colStubH}
        width={colW} height={colStubH}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1}
      />

      {/* Cap body */}
      <rect
        x={ox} y={oy}
        width={capW} height={capH}
        fill={c.capFill} stroke={c.capStroke} strokeWidth={1.5}
      />

      {/* Strut lines (left and right) */}
      <line
        x1={col_cx} y1={col_by}
        x2={pile_x_left} y2={pile_y - r_pile}
        stroke={c.strutStroke} strokeWidth={1.2} strokeDasharray="5 3"
      />
      <line
        x1={col_cx} y1={col_by}
        x2={pile_x_right} y2={pile_y - r_pile}
        stroke={c.strutStroke} strokeWidth={1.2} strokeDasharray="5 3"
      />

      {/* Strut angle annotation (right side) */}
      <text
        x={col_cx + (pile_x_right - col_cx) / 2 + 5}
        y={col_by + (pile_y - r_pile - col_by) / 2}
        fontSize={isPdf ? 6.5 : 9.5}
        fill={c.strutStroke}
        fontFamily="monospace"
        textAnchor="start"
      >
        {`θ=${dec(theta_deg, 1)}°`}
      </text>

      {/* Tie bar (horizontal line at cover depth) */}
      <line
        x1={pile_x_left} y1={tie_y}
        x2={pile_x_right} y2={tie_y}
        stroke={c.tieStroke} strokeWidth={2}
      />
      {/* Tie bar dots at piles */}
      <circle cx={pile_x_left}  cy={tie_y} r={3} fill={c.tieStroke} />
      <circle cx={pile_x_right} cy={tie_y} r={3} fill={c.tieStroke} />

      {/* Cover annotation */}
      <line
        x1={ox - f} y1={oy + capH} x2={ox - f} y2={tie_y}
        stroke={c.textSec} strokeWidth={0.8}
      />
      <text
        x={ox - f * 1.3} y={(oy + capH + tie_y) / 2}
        fontSize={isPdf ? 6 : 9} fill={c.textSec}
        fontFamily="monospace" textAnchor="end" dominantBaseline="middle"
      >
        {`c=${cover.toFixed(0)}`}
      </text>

      {/* z_eff annotation */}
      <line
        x1={ox + capW + f} y1={oy + capH - cov_px}
        x2={ox + capW + f} y2={oy}
        stroke={c.textSec} strokeWidth={0.8}
      />
      <text
        x={ox + capW + f * 1.4} y={oy + (capH - cov_px) / 2}
        fontSize={isPdf ? 6 : 9} fill={c.textSec}
        fontFamily="monospace" dominantBaseline="middle"
      >
        {`z=${z_eff.toFixed(0)}`}
      </text>

      {/* Piles (circles below cap) */}
      {[pile_x_left, pile_x_right].map((px, i) => (
        <g key={`sec-pile-${i}`}>
          {/* Placa de reparto en cabeza (a escala, embebida en la base del encepado) */}
          {plateOn && (
            <rect
              x={px - (d_plate / 2) * scale}
              y={oy + capH - 4}
              width={d_plate * scale}
              height={4}
              fill={c.pileStroke}
              opacity={0.85}
            />
          )}
          <circle cx={px} cy={pile_y} r={r_pile}
            fill={c.pileFill} stroke={c.pileStroke} strokeWidth={1.5} />
          {n > 2 && (
            <text x={px} y={pile_y + r_pile + 10}
              textAnchor="middle" fontSize={isPdf ? 6 : 9}
              fill={c.textSec} fontFamily="monospace">
              {n === 3 ? (i === 0 ? 'B' : 'C') : n === 6 ? (i === 0 ? '1,3,5' : '2,4,6') : (i === 0 ? '1,3' : '2,4')}
            </text>
          )}
        </g>
      ))}

      {/* Cap depth label — a media altura del canto, contra el borde izquierdo
        * del encepado; el recubrimiento se acota abajo del todo, así que no se
        * estorban aunque el margen sea estrecho. */}
      <text
        x={ox - f * 1.3} y={oy + capH / 2}
        textAnchor="end" fontSize={f}
        fill={c.textSec} fontFamily="monospace" dominantBaseline="middle"
      >
        {`h=${h_enc}`}
      </text>

      {/* Legend row */}
      <line x1={8}  y1={height - 8} x2={22} y2={height - 8} stroke={c.strutStroke} strokeWidth={1.5} strokeDasharray="4 2" />
      <text x={26} y={height - 5} fontSize={isPdf ? 6 : 9} fill={c.textSec} fontFamily="monospace">biela</text>
      <line x1={60} y1={height - 8} x2={74} y2={height - 8} stroke={c.tieStroke} strokeWidth={2} />
      <text x={78} y={height - 5} fontSize={isPdf ? 6 : 9} fill={c.textSec} fontFamily="monospace">tirante</text>
    </svg>
  );
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

export function PileCapSVG({ inp, result, width, mode = 'screen' }: PileCapSVGProps) {
  const isPdf = mode === 'pdf';
  const { system } = useUnitSystem();

  if (!result.valid) {
    return (
      <div
        className={mode === 'screen' ? 'flex items-center justify-center text-text-disabled text-sm' : undefined}
        style={{ width, height: 80 }}
      >
        {mode === 'screen' && <span>Sin datos — completar entradas</span>}
      </div>
    );
  }

  return (
    <div
      id={mode === 'pdf' ? 'pile-cap-svg-pdf' : undefined}
      className={mode === 'screen' ? 'flex flex-col items-center gap-2 py-4' : undefined}
      style={mode === 'pdf' ? { background: '#fff' } : undefined}
    >
      {/* Plan view */}
      <PlanView inp={inp} result={result} width={width} isPdf={isPdf} system={system} />

      {/* Divider label */}
      <div
        className={mode === 'screen' ? 'text-[10px] font-mono text-text-disabled uppercase tracking-wider' : undefined}
        style={mode === 'pdf' ? { textAlign: 'center', fontSize: 8, color: '#999', fontFamily: 'monospace', marginTop: 4 } : undefined}
      >
        Sección transversal
      </div>

      {/* Section view */}
      <SectionView inp={inp} result={result} width={width} isPdf={isPdf} />
    </div>
  );
}
