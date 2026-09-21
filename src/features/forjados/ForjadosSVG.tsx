/**
 * Sección del forjado, para las dos variantes (reticular / losa maciza) y los
 * dos casos (vano M+ / apoyo M−).
 *
 * Tres cosas que este dibujo hacía mal y que conviene no volver a hacer:
 *
 *  1. Los rótulos del lado derecho («x = …», «h = …») se escribían en
 *     `ox + b/2 + 14`, que con `PAD_X` simétrico es exactamente `width − 26`,
 *     y a 10 px mono «h = 350» mide 42: se salían del `viewBox` y el SVG los
 *     recortaba sin avisar, así que la fibra neutra ponía «x = 2» en vez de
 *     «x = 29,2». Ahora el margen derecho se RESERVA con `anchoEstimado` sobre
 *     el texto más largo, y además esos rótulos se anclan por su borde DERECHO
 *     (`finRotulo`), tope `width − 4`: aunque la estimación se quede corta el
 *     texto crece hacia dentro y nunca hacia fuera.
 *  2. Nada decía qué lado está comprimido, y `x` cambia de origen entre casos
 *     (en vano se mide desde arriba, en apoyo desde abajo). Ahora el bloque
 *     comprimido va tintado y la cabecera nombra el caso y la rama.
 *  3. Los colores y la fuente eran literales. Van por token, en la forma
 *     `var(--token, respaldo-claro)`: los exportadores rasterizan el SVG
 *     serializándolo a un data-URL, y ahí el clon vive fuera del documento y
 *     ninguna `var()` resuelve — el respaldo es el valor claro del tema, que
 *     es el correcto sobre papel. Por eso ya no hay bifurcación de color por
 *     `mode`: pantalla y PDF pintan lo mismo.
 */

import { useId, type ReactNode } from 'react';
import { type ForjadosInputs, type ForjadosVariant } from '../../data/defaults';
import { type ForjadosResult } from '../../lib/calculations/rcSlabs';
import { dec } from '../../components/canvas/paleta';
import { Cabecera, CotaH, CotaV, Rotulo, anchoEstimado } from '../../components/canvas/primitivas';

interface Props {
  inp: ForjadosInputs;
  result: ForjadosResult;
  section: 'vano' | 'apoyo';
  width: number;
  /** Alto de la banda. Si se da, el dibujo escala para caber en los DOS ejes. */
  height?: number;
  mode?: 'screen' | 'pdf';
}

/* Tokens con respaldo claro — ver la cabecera del fichero. */
const C = {
  hormigon: 'var(--color-chart-section-fill, #f1f5f9)',
  contorno: 'var(--color-chart-section, #475569)',
  eje: 'var(--color-chart-axis, #0284c7)',
  comprimido: 'color-mix(in srgb, var(--color-chart-axis, #0284c7) 14%, transparent)',
  barra: 'var(--color-chart-label, #0f172a)',
  refuerzo: 'var(--color-chart-rebar, #0284c7)',
  barraLejana: 'var(--color-chart-rebar-dim, #94a3b8)',
  cota: 'var(--color-chart-dim, #64748b)',
  cotaTexto: 'var(--color-chart-dim-text, #475569)',
  atenuado: 'var(--color-text-disabled, #586880)',
} as const;

const RAMA_CORTA: Record<string, string> = {
  'rect-bEff': 'rectangular b_eff',
  't-real': 'T real',
  'rect-bw': 'rectangular b_w',
  rect: 'rectangular',
};

const PAD_L = 16;
const PAD_T = 46;   // cabecera + cota superior + su texto (dos renglones)
const PAD_B = 46;   // cota inferior + su texto + la leyenda

/** Margen derecho: lo que ocupe el rótulo más largo de ese lado, más el respiro. */
function margenDerecho(...textos: string[]): number {
  return Math.ceil(Math.max(...textos.map((t) => anchoEstimado(t, 10, true)))) + 14;
}

/** Punto y coma decimal como en la tabla: el dibujo escribía `toFixed(0)`. */
const mm = (v: number, d = 0) => dec(v, d);

export function ForjadosSVG({ inp, result, section, width, height }: Props) {
  const variant = inp.variant as ForjadosVariant;
  const uid = useId();
  const clipId = `forjados-sec-${uid}`;

  /* Con la entrada inválida el motor devuelve una sección degenerada (x = 0,
     b = 0) y el panel de resultados se sustituye por el error. El dibujo
     seguía pintando: rectángulos de altura cero, los rótulos amontonados y las
     barras fuera de la pieza, contradiciendo al panel de al lado. */
  if (!result.valid) {
    const altoVacio = height ?? 160;
    return (
      <div>
        <svg width={width} height={altoVacio} viewBox={`0 0 ${width} ${altoVacio}`} role="img" aria-label="Sin sección que dibujar: revisa los datos de entrada" style={{ display: 'block' }}>
          <Rotulo x={width / 2} y={altoVacio / 2} tam={11} color={C.atenuado} ancla="middle">
            Sin sección que dibujar
          </Rotulo>
        </svg>
      </div>
    );
  }

  const isVano = section === 'vano';
  const sec = isVano ? result.vano : result.apoyo;
  const caso = isVano ? 'Vano (M+)' : 'Apoyo (M−)';
  const rama = RAMA_CORTA[sec.branch] ?? sec.branch;

  const h = inp.h as number;
  const cover = inp.cover as number;
  // Tracción arriba en apoyo (M−); la geometría del T no se voltea.
  const tensionOnTop = !isVano;

  const txtX = `x = ${mm(sec.x, 1)}`;
  const txtH = `h = ${mm(h)}`;
  const PAD_R = margenDerecho(txtX, txtH);
  const innerW = Math.max(40, width - PAD_L - PAD_R);

  /* Ancho de referencia: b_eff en reticular, la franja de 1 m en maciza. */
  const bRef = variant === 'reticular' ? result.bEff || (inp.intereje as number) : 1000;

  /* Escala: cabe por ancho y, si nos dan alto, también por alto. Antes sólo
     miraba el ancho y el alto salía del contenido, así que la banda saltaba al
     cambiar `h` y empujaba la tabla de resultados. */
  const innerH = height ? Math.max(40, height - PAD_T - PAD_B) : Infinity;
  const scale = Math.min(innerW / bRef, innerH / h);

  const h_px = h * scale;
  const svgH = height ?? h_px + PAD_T + PAD_B;
  /* Centrado sobre la COMPOSICIÓN (pieza + rótulo de la derecha), no sobre el
     hueco interior: cuando manda el alto la pieza no gasta el margen derecho
     reservado, y centrar sobre `innerW` dejaba el dibujo escorado. */
  const anchoRotuloDcha = Math.max(anchoEstimado(txtX, 10, true), anchoEstimado(txtH, 10, true));
  const ox = (width - 22 - anchoRotuloDcha) / 2;
  const topY = PAD_T + Math.max(0, (svgH - PAD_T - PAD_B - h_px) / 2);
  const botY = topY + h_px;

  const x_px = sec.x * scale;
  // `x` se mide desde la cara COMPRIMIDA: arriba en vano, abajo en apoyo.
  const axisY = tensionOnTop ? botY - x_px : topY + x_px;
  // Franja comprimida: de la cara comprimida a la fibra neutra.
  const compY = tensionOnTop ? axisY : topY;
  const compH = Math.max(0, tensionOnTop ? botY - axisY : axisY - topY);

  const bRef_px = bRef * scale;
  const secL = ox - bRef_px / 2;
  const secR = ox + bRef_px / 2;

  /* Borde derecho de los rótulos de ese lado: pegados al dibujo, pero nunca
     más allá del lienzo. Cuando manda el alto, la pieza no llega al margen
     reservado y sin esto el texto se quedaba flotando a 180 px del dibujo. */
  const finRotulo = (texto: string, desde: number) =>
    Math.min(desde + 12 + anchoEstimado(texto, 10, true), width - 4);

  /* `x = …` va junto a la fibra neutra y `h = …` a media altura de la cota, y
     los dos se anclan al mismo borde derecho: cuando la fibra neutra cae cerca
     del centro (el apoyo del reticular, x = 170 de 350) se escribían uno encima
     del otro. Si se acercan, el de `h` se va al cuarto más lejano. */
  const medioY = (topY + botY) / 2;
  const yTextoH = Math.abs(medioY - axisY) < 13
    ? (axisY > medioY ? topY + h_px * 0.25 : topY + h_px * 0.75)
    : medioY + 3;

  /* ── Geometría y armado, por variante ─────────────────────────────────── */
  let cuerpo: ReactNode;
  let barras: ReactNode;
  let cotaInferior: ReactNode;
  let leyenda: string;

  if (variant === 'reticular') {
    const hFlange = inp.hFlange as number;
    const bWeb = inp.bWeb as number;
    const hF_px = hFlange * scale;
    const bW_px = bWeb * scale;

    cuerpo = (
      <>
        <rect x={secL} y={topY} width={bRef_px} height={hF_px} fill={C.hormigon} stroke={C.contorno} strokeWidth={1} />
        <rect x={ox - bW_px / 2} y={topY + hF_px} width={bW_px} height={h_px - hF_px} fill={C.hormigon} stroke={C.contorno} strokeWidth={1} />
      </>
    );

    const baseDiam = (isVano ? inp.base_inf_barDiam : inp.base_sup_barDiam) as number;
    const baseNum = (isVano ? inp.base_inf_nBars : inp.base_sup_nBars) as number;
    const refDiam = (isVano ? inp.refuerzo_vano_inf_barDiam : inp.refuerzo_apoyo_sup_barDiam) as number;
    const refNum = (isVano ? inp.refuerzo_vano_inf_nBars : inp.refuerzo_apoyo_sup_nBars) as number;
    const conDiam = (isVano ? inp.base_sup_barDiam : inp.base_inf_barDiam) as number;
    const conNum = (isVano ? inp.base_sup_nBars : inp.base_inf_nBars) as number;

    const barY_tension = tensionOnTop
      ? topY + cover * scale + (baseDiam * scale) / 2
      : botY - cover * scale - (baseDiam * scale) / 2;
    const barY_con = tensionOnTop
      ? botY - cover * scale - (conDiam * scale) / 2
      : topY + cover * scale + (conDiam * scale) / 2;

    const posiciones = (count: number): number[] => {
      if (count <= 0) return [];
      if (count === 1) return [ox];
      const clearance = Math.max(cover * scale, 4);
      const span = bW_px - 2 * clearance;
      return Array.from({ length: count }, (_, i) => ox - bW_px / 2 + clearance + (span / (count - 1)) * i);
    };

    // Montaje y refuerzo se arman en dos capas en el nervio (no caben en una);
    // la separación libre real sv = max(20, Ø) es la que fija el d calculado.
    const sv = Math.max(20, Math.max(baseDiam, refDiam));
    const gap = (baseDiam / 2 + sv + refDiam / 2) * scale;

    barras = (
      <>
        {posiciones(baseNum).map((bx, i) => (
          <circle key={`b${i}`} cx={bx} cy={barY_tension} r={Math.max((baseDiam * scale) / 2, 2)} fill={C.barra} />
        ))}
        {posiciones(refNum).map((bx, i) => (
          <circle
            key={`r${i}`}
            cx={bx}
            cy={tensionOnTop ? barY_tension + gap : barY_tension - gap}
            r={Math.max((refDiam * scale) / 2, 2)}
            fill={C.refuerzo}
          />
        ))}
        {posiciones(conNum).map((bx, i) => (
          <circle key={`c${i}`} cx={bx} cy={barY_con} r={Math.max((conDiam * scale) / 2, 2)} fill="none" stroke={C.barraLejana} strokeWidth={1.25} />
        ))}
      </>
    );

    cotaInferior = <CotaH x1={ox - bW_px / 2} x2={ox + bW_px / 2} y={botY + 16} texto={`b_w = ${mm(bWeb)}`} color={C.cota} colorTexto={C.cotaTexto} />;
    // Sin diámetros: a 10 px la línea se salía del lienzo de móvil (311 px), y
    // los Ø están a la izquierda, en la columna de entrada, a un palmo.
    leyenda = '● montaje  ● refuerzo  ○ cara comprimida';
  } else {
    cuerpo = <rect x={secL} y={topY} width={bRef_px} height={h_px} fill={C.hormigon} stroke={C.contorno} strokeWidth={1} />;

    const basePhi = (isVano ? inp.base_inf_phi_mac : inp.base_sup_phi_mac) as number;
    const baseS = (isVano ? inp.base_inf_s_mac : inp.base_sup_s_mac) as number;
    const refPhi = (isVano ? inp.refuerzo_vano_inf_phi_mac : inp.refuerzo_apoyo_sup_phi_mac) as number;
    const refS = (isVano ? inp.refuerzo_vano_inf_s_mac : inp.refuerzo_apoyo_sup_s_mac) as number;
    // La parrilla de la cara OPUESTA existe (el usuario la teclea) y antes no
    // se dibujaba: media entrada era invisible.
    const conPhi = (isVano ? inp.base_sup_phi_mac : inp.base_inf_phi_mac) as number;
    const conS = (isVano ? inp.base_sup_s_mac : inp.base_inf_s_mac) as number;
    const hasRef = refPhi > 0 && refS > 0;

    const barY_base = tensionOnTop
      ? topY + cover * scale + (basePhi * scale) / 2
      : botY - cover * scale - (basePhi * scale) / 2;
    const barY_ref = tensionOnTop
      ? barY_base + (basePhi * scale) / 2 + (refPhi * scale) / 2 + 1
      : barY_base - (basePhi * scale) / 2 - (refPhi * scale) / 2 - 1;
    const barY_con = tensionOnTop
      ? botY - cover * scale - (conPhi * scale) / 2
      : topY + cover * scale + (conPhi * scale) / 2;

    const clearance = Math.max(cover * scale, 4);
    const reparte = (count: number): number[] => {
      if (count <= 0) return [];
      if (count === 1) return [ox];
      const span = bRef_px - 2 * clearance;
      return Array.from({ length: count }, (_, i) => secL + clearance + (span / (count - 1)) * i);
    };
    const n = (s: number) => (s > 0 ? Math.max(1, Math.floor(bRef / s)) : 0);

    barras = (
      <>
        {reparte(n(baseS)).map((bx, i) => (
          <circle key={`b${i}`} cx={bx} cy={barY_base} r={Math.max((basePhi * scale) / 2, 2)} fill={C.barra} />
        ))}
        {hasRef && reparte(n(refS)).map((bx, i) => (
          <circle key={`r${i}`} cx={bx} cy={barY_ref} r={Math.max((refPhi * scale) / 2, 2)} fill={C.refuerzo} />
        ))}
        {conPhi > 0 && reparte(n(conS)).map((bx, i) => (
          <circle key={`c${i}`} cx={bx} cy={barY_con} r={Math.max((conPhi * scale) / 2, 2)} fill="none" stroke={C.barraLejana} strokeWidth={1.25} />
        ))}
      </>
    );

    cotaInferior = (
      <Rotulo x={ox} y={botY + 20} tam={10} color={C.atenuado} mono ancla="middle">
        {`base Ø${basePhi}/${baseS}${hasRef ? ` + ref Ø${refPhi}/${refS}` : ''}`}
      </Rotulo>
    );
    leyenda = `● tracción  ${hasRef ? '● refuerzo  ' : ''}○ cara comprimida`;
  }

  return (
    <div>
      <svg
        width={width}
        height={svgH}
        viewBox={`0 0 ${width} ${svgH}`}
        role="img"
        aria-label={`Sección del forjado ${variant === 'reticular' ? 'reticular' : 'de losa maciza'} en ${caso}: ${rama}, fibra neutra a ${mm(sec.x, 1)} mm de la cara comprimida`}
        style={{ display: 'block' }}
      >
        <title>{`${caso} — ${rama}`}</title>
        <defs>
          {/* La franja comprimida se recorta contra el contorno real de la
              pieza: en reticular el nervio es más estrecho que el ala. */}
          <clipPath id={clipId}>{cuerpo}</clipPath>
        </defs>

        <Cabecera x={PAD_L} y={12}>{`${caso} · ${rama}`}</Cabecera>

        {cuerpo}

        {/* Bloque comprimido: es lo que distingue vano de apoyo y lo que
            explica desde qué cara se mide `x`. */}
        {compH > 0 && (
          <rect x={secL} y={compY} width={bRef_px} height={compH} fill={C.comprimido} clipPath={`url(#${clipId})`} />
        )}

        {/* Fibra neutra. El rótulo se ancla a `end` contra el borde: crece hacia
            dentro, así que el viewBox no puede recortarlo. */}
        <line x1={secL - 8} y1={axisY} x2={secR + 8} y2={axisY} stroke={C.eje} strokeWidth={1} strokeDasharray="5 3" />
        <Rotulo x={finRotulo(txtX, secR + 8)} y={axisY - 4} tam={10} color={C.eje} mono ancla="end">{txtX}</Rotulo>

        {barras}

        <CotaH x1={secL} x2={secR} y={topY - 12} texto={`${variant === 'reticular' ? 'b_eff' : 'b'} = ${mm(bRef)}`} color={C.cota} colorTexto={C.cotaTexto} />
        <CotaV x={secR + 10} y1={topY} y2={botY} texto={txtH} color={C.cota} colorTexto={C.cotaTexto} anclaTexto={{ x: finRotulo(txtH, secR + 10), ancla: 'end' }} yTexto={yTextoH} />
        {cotaInferior}

        <Rotulo x={PAD_L} y={svgH - 8} tam={10} color={C.atenuado} ancla="start">{leyenda}</Rotulo>
      </svg>
    </div>
  );
}
