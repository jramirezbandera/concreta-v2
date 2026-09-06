// Dibujos del módulo de sismo: espectro, planta y alzado con fuerzas y cortantes.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA GRÁFICA DEL ESPECTRO DIBUJA LAS DOS CURVAS, Y ESO ES EL PUNTO
// ─────────────────────────────────────────────────────────────────────────────
// Hay DOS expresiones distintas y confundirlas es la trampa de este módulo:
//
//   art. 2.3   espectro ELÁSTICO      alpha = 1 + 1,5·T/T_A   por debajo de T_A
//   art. 3.7.3 alpha de las FUERZAS   alpha = 2,5             por debajo de T_B
//
// Sólo difieren por debajo de T_A; a partir de ahí son algebraicamente la misma
// (2,5·T_B/T = K·C/T). Un edificio achaparrado de fábrica cae justo en esa zona
// y la diferencia llega al 24 %, siempre del lado de la inseguridad si se usa la
// elástica para las fuerzas.
//
// Por eso se pintan las dos y se rotulan las zonas SOBRE la curva. Se descartó
// un diagrama aparte de "dónde cae tu período": duplicaba esta misma gráfica.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA PLANTA ES EL ÚNICO SITIO DONDE SE VE LO QUE SE HA INTRODUCIDO
// ─────────────────────────────────────────────────────────────────────────────
// El módulo pide L, B y una lista de planos resistentes con su coordenada
// firmada, y hasta ahora esa geometría no se dibujaba en ninguna parte: el
// usuario tecleaba coordenadas a ciegas y sólo se enteraba de un signo cambiado
// —o de un plano fuera de la planta— por un γ_a raro tres bloques más abajo.
// `PlantaSVG` la devuelve: rectángulo a escala única, los planos de las dos
// direcciones sobre sus ejes, y el centro de masas frente al de rigidez, que es
// exactamente lo que decide el requisito (6) del art. 3.5.1.
//
// ─────────────────────────────────────────────────────────────────────────────
// LOS COLORES SALEN DEL TEMA EN PANTALLA Y SON LITERALES EN EL PDF
// ─────────────────────────────────────────────────────────────────────────────
// Antes había un único juego de literales, y eran los del tema OSCURO: el eje
// valía `#2c2c34`, que es `--color-border-main` de "Ónice". En claro colaba por
// negro de milagro, y en oscuro el eje era casi invisible sobre `#0c0c0e`.
//
// En pantalla se usan los tokens (`var(--color-*)`), que es lo que hace el resto
// de dibujos del repo. En el PDF NO se puede: `embedSvgAsImage` serializa el SVG
// a un data-URL y lo rasteriza FUERA del documento, donde ninguna custom
// property resuelve. Por eso los clones del exportador piden `modo="pdf"` y
// reciben la paleta de papel, literal.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA ROTULACIÓN ESCALA CON EL ANCHO
// ─────────────────────────────────────────────────────────────────────────────
// Las figuras se dibujan entre 220 px (móvil estrecho) y 680 px (el clon del
// PDF, que luego se reduce a 112 mm de papel). Un cuerpo fijo de 8 px era
// diminuto en las dos puntas: ilegible en el papel y desaprovechado en pantalla
// ancha. `escala()` ata el cuerpo al ancho, con tope arriba y abajo.
//
// ─────────────────────────────────────────────────────────────────────────────
// EL NÚMERO DEL PLANO VA EN UNA BURBUJA, FUERA DE LA PLANTA
// ─────────────────────────────────────────────────────────────────────────────
// Antes cada plano llevaba un solo rótulo, «1 · 592 kN», y se leía como
// «1592 kN»: el separador de este módulo, que en una cabecera funciona, entre
// un entero y una fuerza es un punto de millar. Son dos datos distintos —la
// IDENTIDAD del plano (su fila en la tabla, su columna j en el reparto) y el
// VALOR que se lleva— y van en sitios distintos: el número en una burbuja al
// extremo del trazo, como los ejes de cualquier plano de replanteo, y la
// fuerza sola, dentro. Las burbujas van por la derecha (planos de X) y por
// arriba (planos de Y), que son los dos lados sin acotación.

import { useId } from 'react';

import type { SeismicEvaluation, SeismicState } from './state';
import type { ElementoResistente } from '../../lib/codes/seismic/types';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { dec, fuerza, pct, unidadFuerza } from './formato';
import { elasticSpectrum, staticForceAlpha } from '../../lib/codes/seismic/ncse02';

export type ModoDibujo = 'screen' | 'pdf';

interface Paleta {
  /** Ejes, contornos y acotación. */
  eje: string;
  /** Retícula de fondo: se ve, pero no compite con las curvas. */
  rejilla: string;
  /** Rotulación secundaria: ticks, unidades, referencias de artículo. */
  texto: string;
  /** Rotulación que hay que leer sí o sí: valores y nombres de figura. */
  rotulo: string;
  acento: string;
  /** Relleno del diagrama de cortantes y de la planta. */
  acentoSuave: string;
  /** La curva elástica del art. 2.3, deliberadamente en segundo plano. */
  elastico: string;
  /** Ámbar: la alpha de las fuerzas, y las F_k negativas del SRSS. */
  aviso: string;
  fallo: string;
  /** Contorno del edificio y de la planta. */
  masa: string;
  /** Relleno de papel: también hace de halo bajo los rótulos interiores. */
  papel: string;
}

const PANTALLA: Paleta = {
  eje: 'var(--color-chart-dim)',
  rejilla: 'var(--color-border-sub)',
  texto: 'var(--color-chart-dim-text)',
  rotulo: 'var(--color-chart-label)',
  acento: 'var(--color-accent)',
  acentoSuave: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
  elastico: 'var(--color-chart-stirrup)',
  // Ámbar por el token de aviso: no es que la curva de fuerzas «avise» de nada,
  // es que el ámbar del tema vive ahí y en las F_k negativas el sentido sí es
  // literal. Un token propio para un solo trazo sería peor.
  aviso: 'var(--color-state-warn)',
  fallo: 'var(--color-state-fail)',
  masa: 'var(--color-chart-section)',
  papel: 'var(--color-chart-section-fill)',
};

const PAPEL: Paleta = {
  eje: '#64748b',
  rejilla: '#e2e8f0',
  texto: '#475569',
  rotulo: '#0f172a',
  acento: '#0284c7',
  acentoSuave: 'rgba(2,132,199,0.14)',
  elastico: '#64748b',
  aviso: '#b45309',
  fallo: '#dc2626',
  masa: '#475569',
  papel: '#f1f5f9',
};

const paletaDe = (m: ModoDibujo): Paleta => (m === 'pdf' ? PAPEL : PANTALLA);

/**
 * Cuerpo de letra relativo al ancho de la figura, acotado por los dos extremos.
 *
 * Sin tope inferior, la figura de 220 px se quedaría con rótulos de 5 px; sin
 * tope superior, el clon de 680 px del PDF saldría con titulares.
 */
function escala(width: number): number {
  return Math.min(1.15, Math.max(0.82, width / 440));
}

const MONO = 'monospace';

/** Centro de rigidez de una lista de planos, o `null` si no hay rigidez. */
function centroide(elementos: ElementoResistente[]): number | null {
  const suma = elementos.reduce((a, e) => a + e.k, 0);
  if (!(suma > 0)) return null;
  return elementos.reduce((a, e) => a + e.k * e.x, 0) / suma;
}

// ── Espectro ─────────────────────────────────────────────────────────────────

/**
 * @param eje Dirección cuyos modos y T_F se marcan sobre la curva.
 *
 * La curva es del EMPLAZAMIENTO y no depende de la dirección, pero los puntos
 * que se marcan encima sí: en los sistemas cuyo T_F depende de la dimensión en
 * planta —fábrica, pantallas, acero triangulado— X e Y caen en sitios distintos
 * de la gráfica. Antes se pintaba siempre X, sin decirlo y sin reaccionar al
 * selector de eje, así que los modos de Y no se veían nunca.
 */
export function EspectroSVG({
  evaluacion,
  width = 360,
  eje = 'x',
  modo = 'screen',
}: {
  evaluacion: SeismicEvaluation;
  width?: number;
  eje?: 'x' | 'y';
  modo?: ModoDibujo;
}) {
  const C = paletaDe(modo);
  const f = 10.5 * escala(width);

  const { TA, TB } = evaluacion.emplazamiento;
  const h = Math.round(width * 0.62);
  const m = {
    t: Math.round(f * 2.0),
    r: Math.round(f * 1.4),
    b: Math.round(f * 3.6),
    l: Math.round(f * 3.0),
  };
  const w = width - m.l - m.r;
  const hh = h - m.t - m.b;
  if (!(TA > 0) || !(TB > 0) || w <= 0 || hh <= 0) return null;

  const TF = evaluacion.resultado?.[eje].TF;
  const modos = evaluacion.resultado?.[eje].modos ?? [];

  // El eje llega hasta donde caigan los modos. Con el ancho fijo de antes
  // —max(2, 3·T_B)— un edificio alto de acero (n = 19 → T_F = 2,09 s) tenía el
  // modo 1 fuera de la gráfica: el punto que más importa, el único que el
  // usuario busca ahí, dibujado en ninguna parte.
  const TModoMax = modos.reduce((a, mo) => Math.max(a, mo.T), 0);
  const TMax = Math.max(2, TB * 3, TModoMax * 1.15);
  const aMax = 3;
  const px = (T: number) => m.l + (T / TMax) * w;
  const py = (a: number) => m.t + hh - (a / aMax) * hh;

  const puntos = 240;
  const camino = (fn: (T: number) => number) => {
    let d = '';
    for (let i = 0; i <= puntos; i++) {
      const T = (i / puntos) * TMax;
      const a = fn(T);
      d += `${i === 0 ? 'M' : 'L'}${px(T).toFixed(2)},${py(a).toFixed(2)}`;
    }
    return d;
  };

  // Ticks del eje T en valores redondos, sin pisar a T_A ni a T_B: comparten
  // fila con ellos, y dos números sobre el mismo punto no los lee nadie.
  const pasoT = [0.1, 0.2, 0.25, 0.5, 1, 2, 5].find((p) => TMax / p <= 6) ?? 5;
  const ticksT: number[] = [];
  for (let t = pasoT; t <= TMax + 1e-9; t += pasoT) {
    const holgura = f * 2.6;
    if (Math.abs(px(t) - px(TA)) < holgura) continue;
    if (Math.abs(px(t) - px(TB)) < holgura) continue;
    if (px(t) > m.l + w - f * 3.2) continue; // reservado para «T [s]»
    ticksT.push(Number(t.toFixed(4)));
  }

  // El rótulo de la rama decreciente se coloca donde NO haya un modo debajo.
  // Con una posición fija —siempre 1,9·T_B— caía justo encima del modo 1 en el
  // caso por defecto: dos textos y un punto amontonados en el sitio de la
  // gráfica que más se mira.
  const lejosDeModos = (T: number) =>
    modos.length ? Math.min(...modos.map((mo) => Math.abs(px(T) - px(mo.T)))) : Infinity;
  const semiRotulo = f * 4.2;
  const Tzona = [TB * 1.6, TB * 2.2, TB * 2.9]
    .filter((T) => T < TMax * 0.97)
    .reduce((mejor, T) => (lejosDeModos(T) > lejosDeModos(mejor) ? T : mejor), TB * 1.6);
  const xZona = Math.min(m.l + w - semiRotulo, Math.max(m.l + semiRotulo, px(Tzona)));
  const aZona = staticForceAlpha(((xZona - m.l) / w) * TMax, TB);

  const EJE_ROTULO = eje.toUpperCase();
  const yFila1 = m.t + hh + f * 1.35;
  const yFila2 = m.t + hh + f * 2.6;
  const decimalesT = pasoT < 0.2 ? 2 : 1;

  return (
    <svg
      width={width}
      height={h}
      viewBox={`0 0 ${width} ${h}`}
      role="img"
      aria-label={`Espectro de respuesta, dirección ${EJE_ROTULO}`}
    >
      <title>
        {'Espectro de respuesta: la curva elástica del art. 2.3 y la alpha de las fuerzas del '
          + `art. 3.7.3, que sólo difieren por debajo de T_A. Los modos marcados son los de la `
          + `dirección ${EJE_ROTULO}.`}
      </title>

      {/* retícula primero: ninguna curva puede quedar por debajo de ella */}
      {[1, 2, 3].map((a) => (
        <line
          key={`g${a}`}
          x1={m.l}
          y1={py(a)}
          x2={m.l + w}
          y2={py(a)}
          stroke={C.rejilla}
          strokeWidth={1}
        />
      ))}

      {/* ejes */}
      <line x1={m.l} y1={m.t} x2={m.l} y2={m.t + hh} stroke={C.eje} strokeWidth={1.25} />
      <line x1={m.l} y1={m.t + hh} x2={m.l + w} y2={m.t + hh} stroke={C.eje} strokeWidth={1.25} />
      {/*
        El eje vertical no tenía nombre: cuatro números sueltos del 0 al 3 y a
        adivinar que eran alphas.
      */}
      <text
        x={m.l}
        y={m.t - f * 0.5}
        fontSize={f}
        fill={C.rotulo}
        textAnchor="middle"
        fontFamily={MONO}
      >
        α
      </text>
      {[0, 1, 2, 3].map((a) => (
        <g key={a}>
          <line x1={m.l - 4} y1={py(a)} x2={m.l} y2={py(a)} stroke={C.eje} />
          <text
            x={m.l - 6}
            y={py(a) + f * 0.35}
            fontSize={f * 0.92}
            fill={C.texto}
            textAnchor="end"
            fontFamily={MONO}
          >
            {a}
          </text>
        </g>
      ))}
      {ticksT.map((t) => (
        <g key={`t${t}`}>
          <line x1={px(t)} y1={m.t + hh} x2={px(t)} y2={m.t + hh + 4} stroke={C.eje} />
          <text
            x={px(t)}
            y={yFila1}
            fontSize={f * 0.92}
            fill={C.texto}
            textAnchor="middle"
            fontFamily={MONO}
          >
            {dec(t, decimalesT)}
          </text>
        </g>
      ))}
      <text
        x={m.l + w}
        y={yFila1}
        fontSize={f * 0.92}
        fill={C.texto}
        textAnchor="end"
        fontFamily={MONO}
      >
        T [s]
      </text>

      {/* T_A y T_B */}
      {[
        { T: TA, t: 'T_A' },
        { T: TB, t: 'T_B' },
      ].map((v) => (
        <g key={v.t}>
          <line
            x1={px(v.T)}
            y1={m.t}
            x2={px(v.T)}
            y2={m.t + hh}
            stroke={C.eje}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text
            x={px(v.T)}
            y={yFila1}
            fontSize={f * 0.95}
            fill={C.rotulo}
            textAnchor="middle"
            fontFamily={MONO}
          >
            {v.t}
          </text>
          <text
            x={px(v.T)}
            y={yFila2}
            fontSize={f * 0.9}
            fill={C.texto}
            textAnchor="middle"
            fontFamily={MONO}
          >
            {dec(v.T, 2)}
          </text>
        </g>
      ))}

      {/* curvas */}
      <path
        d={camino((T) => elasticSpectrum(T, TA, TB))}
        fill="none"
        stroke={C.elastico}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <path
        d={camino((T) => staticForceAlpha(T, TB))}
        fill="none"
        stroke={C.aviso}
        strokeWidth={2.25}
      />

      {/* rótulos de zona SOBRE la curva, que es donde se leen */}
      <text
        x={Math.max(m.l + f * 0.4, px(TA) + f * 0.4)}
        y={py(2.5) - f * 1.5}
        fontSize={f}
        fill={C.aviso}
        textAnchor="start"
        fontFamily={MONO}
      >
        α = 2,5 · art. 3.7.3
      </text>
      <text
        x={xZona}
        y={py(aZona) - f * 1.1}
        fontSize={f}
        fill={C.aviso}
        textAnchor="middle"
        fontFamily={MONO}
      >
        α = 2,5·T_B/T
      </text>
      <text
        x={px(TA * 0.45) + f * 0.8}
        y={py(elasticSpectrum(TA * 0.45, TA, TB)) - f * 0.5}
        fontSize={f * 0.9}
        fill={C.elastico}
        textAnchor="start"
        fontFamily={MONO}
      >
        elástico · art. 2.3
      </text>

      {/*
        T_F marcado con su vertical, y no sólo escrito en una esquina: es el dato
        que el usuario viene a buscar a esta gráfica, y sin la línea hay que
        estimarlo a ojo desde el eje.
      */}
      {TF !== undefined && TF > 0 && TF <= TMax ? (
        <line
          x1={px(TF)}
          y1={py(staticForceAlpha(TF, TB))}
          x2={px(TF)}
          y2={m.t + hh}
          stroke={C.acento}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ) : null}

      {/* dónde caen los modos */}
      {modos.map((mo) => (
        <g key={mo.i}>
          <title>{`Modo ${mo.i} · T = ${dec(mo.T, 3)} s · alpha = ${dec(mo.alpha, 3)}`}</title>
          <circle
            cx={px(mo.T)}
            cy={py(mo.alpha)}
            r={Math.max(2.6, f * 0.32)}
            fill={C.acento}
            stroke={C.papel}
            strokeWidth={1}
          />
          {/*
            Debajo del punto, no encima: arriba es donde viven los rótulos de
            zona —van SOBRE la curva— y ahí el índice del modo se les montaba.
            Bajo la curva no hay nada.
          */}
          <text
            x={px(mo.T) + f * 0.5}
            y={py(mo.alpha) + f * 1.1}
            fontSize={f * 0.88}
            fill={C.acento}
            textAnchor="start"
            fontFamily={MONO}
          >
            {mo.i}
          </text>
        </g>
      ))}
      {/*
        El eje va EN el rótulo. Sin él, un edificio de fábrica con L distinta en
        cada dirección enseñaba un T_F sin decir de cuál de las dos, y la otra no
        aparecía en ninguna parte.

        Y el rótulo va al PIE de su propia vertical, no suelto en una esquina: la
        franja baja de la gráfica está vacía —las dos curvas viven por encima de
        alpha = 1— y así el número y la línea que lo marca se leen juntos. En la
        mitad derecha se ancla por la derecha para no salirse del lienzo.
      */}
      {TF !== undefined && TF > 0
        ? (() => {
            const xTF = px(Math.min(TF, TMax));
            const derecha = xTF > m.l + w * 0.6;
            return (
              <text
                x={xTF + (derecha ? -f * 0.4 : f * 0.4)}
                y={m.t + hh - f * 0.55}
                fontSize={f}
                fill={C.acento}
                textAnchor={derecha ? 'end' : 'start'}
                fontFamily={MONO}
              >
                T_F · {EJE_ROTULO} = {dec(TF, 2)} s
              </text>
            );
          })()
        : null}
    </svg>
  );
}

// ── Planta con los planos resistentes ────────────────────────────────────────

/**
 * Devuelve al usuario la geometría que ha tecleado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ SE DIBUJA DÓNDE, Y POR QUÉ ESE CRUCE NO ES UN DESPISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La coordenada `x` de un plano se mide PERPENDICULARMENTE al sismo que resiste
 * (es la convención de γ_a del art. 3.7.5: sin ella no habría brazo de torsión).
 * Por tanto:
 *
 *   plano que resiste el sismo en X  →  se dibuja HORIZONTAL, a la cota Y = x
 *   plano que resiste el sismo en Y  →  se dibuja VERTICAL,   a la cota X = x
 *
 * Y por eso el centro de rigidez sale cruzado: su Y lo fijan los planos de X y
 * su X los planos de Y. Es el mismo cruce que `excentricidadDe` hace en
 * `state.ts` para el requisito (6) del art. 3.5.1, y verlo dibujado es la forma
 * más rápida de entender por qué la excentricidad de X se compara con L_Y.
 *
 * Escala ÚNICA en las dos direcciones: una planta con dos escalas miente sobre
 * la forma del edificio, que es justo lo que se viene a comprobar aquí.
 */
export function PlantaSVG({
  state,
  evaluacion,
  eje = 'x',
  width = 360,
  modo = 'screen',
}: {
  state: SeismicState;
  evaluacion: SeismicEvaluation;
  /**
   * `'ambas'` dibuja las dos familias de planos con el mismo peso y sólo con
   * su burbuja. Es lo que pide el PDF: allí la figura documenta la GEOMETRÍA
   * introducida —una vez, antes de las dos secciones de dirección— y las
   * fuerzas por plano ya van en la tabla de reparto de cada una.
   */
  eje?: 'x' | 'y' | 'ambas';
  width?: number;
  modo?: ModoDibujo;
}) {
  // Mismo motivo que en `AlzadoSVG`: la figura sale tres veces en el documento
  // —pantalla y los dos clones del exportador— y `url(#id)` resuelve siempre al
  // primero.
  const uid = useId().replace(/:/g, '');
  const acot = `planta-acot-${uid}`;
  // Antes del primer `return null`: es un hook, y saltárselo en un render rompe
  // el orden. Los clones del PDF viven bajo el mismo provider: el papel enseña
  // las fuerzas en el sistema que el usuario estaba viendo.
  const { system } = useUnitSystem();

  const C = paletaDe(modo);
  const f = 10.5 * escala(width);

  const Lx = state.x.L;
  const Ly = state.y.L;
  // Un plano cuya coordenada se sale de la planta es un dato mal metido —signo
  // cambiado, o L de la otra dirección— y no hay ningún número del resultado
  // que lo delate: γ_a sale grande y punto.
  const fueraX = state.x.elementos.filter((e) => Math.abs(e.x) > Ly / 2 + 1e-6).length;
  const fueraY = state.y.elementos.filter((e) => Math.abs(e.x) > Lx / 2 + 1e-6).length;
  const fuera = fueraX + fueraY;

  // Arriba y a la derecha tiene que caber la burbuja del número (centro a
  // BURBUJA cuerpos del borde, radio medio cuerpo) sin pisar la cabecera. La
  // del plano imposible va una burbuja más afuera, para no pisar la del plano
  // de fachada al que se pega; y su aviso del pie va en una línea propia, que
  // en móvil no cabía junto a la leyenda.
  const m = {
    t: Math.round(f * (3.1 + (fueraY > 0 ? 1.15 : 0))),
    r: Math.round(f * (1.9 + (fueraX > 0 ? 1.15 : 0))),
    b: Math.round(f * (4.4 + (fuera > 0 ? 1.2 : 0))),
    l: Math.round(f * 3.4),
  };
  const wDisp = width - m.l - m.r;
  if (!(Lx > 0) || !(Ly > 0) || wDisp <= f * 4) return null;

  // La planta no puede crecer sin límite hacia abajo: una nave de 40 × 6 m
  // dejaría una figura tan alta como ancha por culpa de la acotación.
  const s = Math.min(wDisp / Lx, (wDisp * 0.8) / Ly);
  const pw = Lx * s;
  const ph = Ly * s;
  const h = Math.round(m.t + ph + m.b);
  /** Línea base de la leyenda del pie; el aviso, si lo hay, va debajo. */
  const pie = h - f * 0.55 - (fuera > 0 ? f * 1.2 : 0);
  const cx = m.l + wDisp / 2;
  const cy = m.t + ph / 2;
  /** Mundo → pantalla. `+Y` va hacia ARRIBA, como en cualquier planta. */
  const PX = (X: number) => cx + X * s;
  const PY = (Y: number) => cy - Y * s;
  const izq = PX(-Lx / 2);
  const der = PX(Lx / 2);
  const arr = PY(Ly / 2);
  const aba = PY(-Ly / 2);

  const ambas = eje === 'ambas';
  const E = ambas ? 'X e Y' : eje.toUpperCase();
  const d = ambas ? undefined : evaluacion.resultado?.[eje];

  // Lo que se lleva cada plano en la base, con torsión: γ_a·k_j/Σk aplicado a
  // cada F_k y sumado en altura, que es Σ F_k = V_base repartido.
  const carga = new Map<string, number>();
  if (d) {
    for (const p of d.reparto) {
      for (const el of p.elementos) carga.set(el.id, (carga.get(el.id) ?? 0) + el.f);
    }
  }

  const kMax = (els: ElementoResistente[]) => Math.max(...els.map((e) => e.k), 0);
  const grosor = (k: number, kmax: number, activo: boolean) =>
    (activo ? 1.6 : 1.1) + (kmax > 0 ? (k / kmax) * (activo ? 2.6 : 1.2) : 0);

  const kMaxX = kMax(state.x.elementos);
  const kMaxY = kMax(state.y.elementos);


  // El centro de rigidez sale CRUZADO: su cota Y la fijan los planos de X y su
  // cota X los de Y. Ver la cabecera de esta función.
  const crY = centroide(state.x.elementos);
  const crX = centroide(state.y.elementos);
  const cr = crX !== null && crY !== null ? { x: crX, y: crY } : null;
  // Por debajo de un cuerpo de letra los dos símbolos se tapan y el rótulo de la
  // excentricidad no cabe: ahí se dice que coinciden, que es lo que pasa.
  const separados = cr !== null && Math.hypot(PX(cr.x) - PX(0), PY(cr.y) - PY(0)) > f * 1.2;
  const eTotal = cr ? Math.hypot(cr.x, cr.y) : 0;

  /**
   * Lo que va DENTRO de la planta, pegado al plano: la fuerza que se lleva o,
   * si el plano es imposible, su coordenada —el número que hay que corregir es
   * ése, no la fuerza—. El número del plano no va aquí: va en su burbuja.
   */
  const rotuloPlano = (el: ElementoResistente, activo: boolean, malo: boolean): string | null => {
    if (!activo) return null;
    if (malo) return `x = ${dec(el.x, 2)} m`;
    const v = carga.get(el.id);
    return v === undefined ? null : `${fuerza(v, system)} ${unidadFuerza(system)}`;
  };

  /** Del borde de la planta al centro de la burbuja, en cuerpos. */
  const BURBUJA = 0.95;
  /**
   * La burbuja con el número del plano, a la derecha (`'h'`, planos de X) o
   * arriba (`'v'`, planos de Y). El trazo del plano entra hasta la burbuja,
   * como en un plano de replanteo: así se ve de qué línea es cada número
   * aunque dos planos vayan muy juntos.
   */
  const burbuja = (bx: number, by: number, n: number, color: string, lado: 'h' | 'v') => {
    const r = f * 0.5;
    return (
      <g>
        {lado === 'h' ? (
          <line x1={der} y1={by} x2={bx - r} y2={by} stroke={color} strokeWidth={1} />
        ) : (
          <line x1={bx} y1={arr} x2={bx} y2={by + r} stroke={color} strokeWidth={1} />
        )}
        <circle cx={bx} cy={by} r={r} fill={C.papel} stroke={color} strokeWidth={1.3} />
        <text
          x={bx}
          y={by + f * 0.28}
          fontSize={f * 0.78}
          fill={color}
          textAnchor="middle"
          fontFamily={MONO}
        >
          {n}
        </text>
      </g>
    );
  };

  /**
   * Un plano fuera de la planta se dibuja PEGADO al borde por el que se sale, y
   * a trazos. Con su cota real se iba del lienzo y no se veía: quedaba un
   * «2 planos fuera de la planta» al pie sin nada rojo a lo que mirar.
   */
  const pegado = (v: number, dentro: boolean, min: number, max: number) =>
    dentro ? v : v > (min + max) / 2 ? max : min;

  // La suma de lo repartido SUPERA el cortante basal, y a la vista de la figura
  // eso parece un error de cuadre: γ_a amplifica, no redistribuye (art. 3.7.5).
  // Los dos números juntos, arriba, evitan la sospecha.
  const sumaF = [...carga.values()].reduce((a, v) => a + v, 0);
  const cabecera =
    d && sumaF > 0
      ? `Σ f = ${fuerza(sumaF, system)} ${unidadFuerza(system)} · V_base = ${fuerza(d.cortanteBasal, system)} ${unidadFuerza(system)}`
      : `planta ${dec(Lx, 2)} × ${dec(Ly, 2)} m`;

  return (
    <svg
      width={width}
      height={h}
      viewBox={`0 0 ${width} ${h}`}
      role="img"
      aria-label={`Planta con los planos resistentes, dirección ${E}`}
    >
      <title>
        {'Planta del edificio a escala, con los planos resistentes de las dos direcciones, el '
          + 'centro de masas y el centro de rigidez.'
          + (ambas ? '' : ` Se resaltan los que resisten el sismo en ${E}.`)}
      </title>

      <defs>
        <marker id={acot} markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
          <path d="M0,3.5 L7,1 L7,6 Z" fill={C.eje} />
        </marker>
      </defs>

      {/* cabecera: qué es y hacia dónde va el sismo que se está mirando */}
      <text x={m.l} y={f * 1.15} fontSize={f * 0.92} fill={C.texto} fontFamily={MONO}>
        <title>
          {'La suma de las fuerzas por plano supera al cortante basal porque el coeficiente de '
            + 'torsión gamma_a del art. 3.7.5 AMPLIFICA la parte de cada plano; no reparte el '
            + 'mismo total entre ellos.'}
        </title>
        {cabecera}
      </text>
      {ambas ? null : (
        <text
          x={width - m.r}
          y={f * 1.15}
          fontSize={f * 0.92}
          fill={C.acento}
          textAnchor="end"
          fontFamily={MONO}
        >
          sismo {eje === 'x' ? '→' : '↑'} {E}
        </text>
      )}

      {/* forjado */}
      <rect
        x={izq}
        y={arr}
        width={pw}
        height={ph}
        fill={C.papel}
        stroke={C.masa}
        strokeWidth={1.5}
      />

      {/* ejes por el centro de masas */}
      <line x1={izq} y1={PY(0)} x2={der} y2={PY(0)} stroke={C.eje} strokeWidth={1} strokeDasharray="5 4" />
      <line x1={PX(0)} y1={arr} x2={PX(0)} y2={aba} stroke={C.eje} strokeWidth={1} strokeDasharray="5 4" />

      {/* planos que resisten el sismo en Y: verticales, numerados por ARRIBA */}
      {state.y.elementos.map((el, i) => {
        const activo = eje !== 'x';
        const malo = Math.abs(el.x) > Lx / 2 + 1e-6;
        const x = pegado(PX(el.x), !malo, izq - f * 0.55, der + f * 0.55);
        const color = malo ? C.fallo : activo ? C.acento : C.elastico;
        const rotulo = rotuloPlano(el, activo, malo);
        return (
          <g key={`y${el.id}`}>
            <title>{`Plano ${i + 1} de Y · x = ${dec(el.x, 2)} m · k = ${dec(el.k, 2)}`}</title>
            <line
              x1={x}
              y1={arr}
              x2={x}
              y2={aba}
              stroke={color}
              strokeWidth={grosor(el.k, kMaxY, activo)}
              strokeLinecap={malo ? 'butt' : 'round'}
              strokeDasharray={malo ? '5 3' : undefined}
            />
            {activo ? burbuja(x, arr - f * (BURBUJA + (malo ? 1.15 : 0)), i + 1, color, 'v') : null}
            {/*
              La fuerza se pasa al otro lado del plano cuando éste roza el borde
              derecho: un plano de fachada tiene x = L/2 exacto y el rótulo se
              salía de la figura.
            */}
            {rotulo !== null
              ? (() => {
                  // El rótulo del plano imposible se mete DENTRO de la planta: su
                  // trazo ya está fuera, y ahí no hay sitio.
                  const xr = malo
                    ? x < cx
                      ? izq + f * 0.5
                      : der - f * 0.5
                    : x + f * 1.5 > der
                      ? x - f * 0.45
                      : x + f * 0.45;
                  const yr = arr + f;
                  return (
                    <text
                      x={xr}
                      y={yr}
                      fontSize={f * 0.85}
                      fill={malo ? C.fallo : C.rotulo}
                      textAnchor="end"
                      fontFamily={MONO}
                      transform={`rotate(-90 ${xr.toFixed(2)} ${yr.toFixed(2)})`}
                      paintOrder="stroke"
                      stroke={C.papel}
                      strokeWidth={3}
                      strokeLinejoin="round"
                    >
                      {rotulo}
                    </text>
                  );
                })()
              : null}
          </g>
        );
      })}

      {/* planos que resisten el sismo en X: horizontales, numerados por la DERECHA */}
      {state.x.elementos.map((el, i) => {
        const activo = eje !== 'y';
        const malo = Math.abs(el.x) > Ly / 2 + 1e-6;
        const y = pegado(PY(el.x), !malo, arr - f * 0.55, aba + f * 0.55);
        const color = malo ? C.fallo : activo ? C.acento : C.elastico;
        const rotulo = rotuloPlano(el, activo, malo);
        return (
          <g key={`x${el.id}`}>
            <title>{`Plano ${i + 1} de X · x = ${dec(el.x, 2)} m · k = ${dec(el.k, 2)}`}</title>
            <line
              x1={izq}
              y1={y}
              x2={der}
              y2={y}
              stroke={color}
              strokeWidth={grosor(el.k, kMaxX, activo)}
              strokeLinecap={malo ? 'butt' : 'round'}
              strokeDasharray={malo ? '5 3' : undefined}
            />
            {activo ? burbuja(der + f * (BURBUJA + (malo ? 1.15 : 0)), y, i + 1, color, 'h') : null}
            {/* Mismo motivo, por arriba: el plano de fachada tiene y = arr. */}
            {rotulo !== null ? (
              <text
                x={der - f * 0.4}
                y={
                  malo
                    ? y < cy
                      ? arr + f * 1.15
                      : aba - f * 0.5
                    : y - f * 0.5 < arr + f * 0.4
                      ? y + f * 1.1
                      : y - f * 0.5
                }
                fontSize={f * 0.85}
                fill={malo ? C.fallo : C.rotulo}
                textAnchor="end"
                fontFamily={MONO}
                paintOrder="stroke"
                stroke={C.papel}
                strokeWidth={3}
                strokeLinejoin="round"
              >
                {rotulo}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* centro de masas: en el origen, que es la convención de entrada */}
      <g>
        <circle cx={PX(0)} cy={PY(0)} r={f * 0.42} fill="none" stroke={C.masa} strokeWidth={1.4} />
        <line x1={PX(0) - f * 0.6} y1={PY(0)} x2={PX(0) + f * 0.6} y2={PY(0)} stroke={C.masa} strokeWidth={1.4} />
        <line x1={PX(0)} y1={PY(0) - f * 0.6} x2={PX(0)} y2={PY(0) + f * 0.6} stroke={C.masa} strokeWidth={1.4} />
        {/*
          Con CR sobre CM el rombo ámbar tapaba la cruz y quedaban dos rótulos
          pisándose para decir lo mismo. Un símbolo, un rótulo, y el «≡» dice
          que coinciden — que es justo el caso bueno.
        */}
        <text
          x={PX(0) - f * 0.8}
          y={PY(0) + f * 1.5}
          fontSize={f * 0.85}
          fill={C.masa}
          textAnchor="end"
          fontFamily={MONO}
          paintOrder="stroke"
          stroke={C.papel}
          strokeWidth={3}
          strokeLinejoin="round"
        >
          {cr && !separados ? 'CM ≡ CR' : 'CM'}
        </text>
      </g>

      {/* centro de rigidez y, si se separa, la excentricidad que lo separa */}
      {cr !== null && separados ? (
        <g>
          <line x1={PX(0)} y1={PY(0)} x2={PX(cr.x)} y2={PY(cr.y)} stroke={C.aviso} strokeWidth={1.6} />
          <path
            d={`M${PX(cr.x)},${PY(cr.y) - f * 0.5} L${PX(cr.x) + f * 0.5},${PY(cr.y)} L${PX(cr.x)},${PY(cr.y) + f * 0.5} L${PX(cr.x) - f * 0.5},${PY(cr.y)} Z`}
            fill={C.aviso}
          />
          <text
            x={PX(cr.x) + f * 0.75}
            y={PY(cr.y) - f * 0.55}
            fontSize={f * 0.85}
            fill={C.aviso}
            fontFamily={MONO}
            paintOrder="stroke"
            stroke={C.papel}
            strokeWidth={3}
            strokeLinejoin="round"
          >
            CR · e = {dec(eTotal, 2)} m
          </text>
        </g>
      ) : null}

      {/* acotación: L_X abajo, L_Y a la izquierda */}
      <g stroke={C.eje} strokeWidth={1}>
        <line x1={izq} y1={aba + f * 0.8} x2={izq} y2={aba + f * 1.9} />
        <line x1={der} y1={aba + f * 0.8} x2={der} y2={aba + f * 1.9} />
        <line
          x1={izq}
          y1={aba + f * 1.45}
          x2={der}
          y2={aba + f * 1.45}
          markerStart={`url(#${acot})`}
          markerEnd={`url(#${acot})`}
        />
        <line x1={izq - f * 1.9} y1={arr} x2={izq - f * 0.8} y2={arr} />
        <line x1={izq - f * 1.9} y1={aba} x2={izq - f * 0.8} y2={aba} />
        <line
          x1={izq - f * 1.45}
          y1={arr}
          x2={izq - f * 1.45}
          y2={aba}
          markerStart={`url(#${acot})`}
          markerEnd={`url(#${acot})`}
        />
      </g>
      <text
        x={(izq + der) / 2}
        y={aba + f * 2.9}
        fontSize={f * 0.92}
        fill={C.texto}
        textAnchor="middle"
        fontFamily={MONO}
        paintOrder="stroke"
        stroke={C.papel}
        strokeWidth={3}
        strokeLinejoin="round"
      >
        L_X = {dec(Lx, 2)} m
      </text>
      <text
        x={izq - f * 1.9}
        y={(arr + aba) / 2}
        fontSize={f * 0.92}
        fill={C.texto}
        textAnchor="middle"
        fontFamily={MONO}
        transform={`rotate(-90 ${(izq - f * 1.9).toFixed(2)} ${((arr + aba) / 2).toFixed(2)})`}
      >
        L_Y = {dec(Ly, 2)} m
      </text>

      {/* pie: qué es cada trazo, y el aviso de coordenada imposible */}
      <g>
        <line
          x1={m.l}
          y1={pie - f * 0.35}
          x2={m.l + f * 1.7}
          y2={pie - f * 0.35}
          stroke={C.acento}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
        <text x={m.l + f * 2.3} y={pie} fontSize={f * 0.85} fill={C.texto} fontFamily={MONO}>
          {ambas ? 'planos resistentes' : `planos de ${E}`}
        </text>
        {ambas ? null : (
          <>
            <line
              x1={m.l + f * 8.2}
              y1={pie - f * 0.35}
              x2={m.l + f * 9.9}
              y2={pie - f * 0.35}
              stroke={C.elastico}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <text
              x={m.l + f * 10.5}
              y={pie}
              fontSize={f * 0.85}
              fill={C.texto}
              fontFamily={MONO}
            >
              planos de {eje === 'x' ? 'Y' : 'X'}
            </text>
          </>
        )}
      </g>
      {fuera > 0 ? (
        <text x={m.l} y={h - f * 0.55} fontSize={f * 0.85} fill={C.fallo} fontFamily={MONO}>
          {fuera} plano{fuera === 1 ? '' : 's'} fuera de la planta
        </text>
      ) : null}
    </svg>
  );
}

// ── Alzado con fuerzas y cortantes ───────────────────────────────────────────

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS FLECHAS LLEVAN SU VALOR, Y EL ESCALÓN TAMBIÉN
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes las flechas sólo decían su longitud relativa y del cortante se rotulaba
 * únicamente el máximo, así que la figura no se podía leer sin la tabla al lado.
 * Ahora cada F_k y cada V_k llevan su número: F_k en columna a la izquierda
 * —alineada, que es como se comparan— y V_k junto al escalón que le toca.
 *
 * Con muchas plantas los rótulos no caben, y ahí se rotulan sólo la primera y la
 * última en vez de superponerlos: una figura con los números encimados es peor
 * que una sin números.
 */
export function AlzadoSVG({
  evaluacion,
  eje = 'x',
  width = 360,
  modo = 'screen',
}: {
  evaluacion: SeismicEvaluation;
  eje?: 'x' | 'y';
  width?: number;
  modo?: ModoDibujo;
}) {
  // Identificadores propios para los marcadores de punta de flecha. El `id`
  // fijo de antes salía TRES veces en el mismo documento —la figura de pantalla
  // y los dos clones que el exportador busca por id—, y `url(#punta)` resuelve
  // siempre al primero: ids duplicados en el DOM, que además es HTML inválido.
  const uid = useId().replace(/:/g, '');
  const puntaPos = `punta-pos-${uid}`;
  const puntaNeg = `punta-neg-${uid}`;
  const rayado = `suelo-${uid}`;
  // Antes del primer `return null`, que es un hook. Ver PlantaSVG.
  const { system } = useUnitSystem();

  const C = paletaDe(modo);
  const f = 10.5 * escala(width);

  const r = evaluacion.resultado;
  if (!r || !r.plantas.length) return null;
  const d = r[eje];
  const E = eje.toUpperCase();

  const h = Math.round(width * 0.92);
  const m = {
    t: Math.round(f * 2.6),
    r: Math.round(f * 0.8),
    b: Math.round(f * 3.0),
    l: Math.round(f * 0.8),
  };
  const W = width - m.l - m.r;
  const hh = h - m.t - m.b;
  if (W <= 0 || hh <= 0) return null;

  // Reparto en columnas. Las fracciones suman 1: cada rótulo tiene su sitio
  // reservado y ninguno se dibuja encima de un trazo.
  const colF = W * 0.15; // valores de F_k, alineados a la derecha
  const gapF = W * 0.02;
  const colFlecha = W * 0.17;
  const colEdif = W * 0.14;
  const gapMedio = W * 0.05;
  const colV = W * 0.32; // polígono de cortantes
  const xFtxt = m.l + colF;
  const xEdif = xFtxt + gapF + colFlecha;
  const xEdifR = xEdif + colEdif;
  const xV = xEdifR + gapMedio;

  const H = Math.max(...r.plantas.map((p) => p.h), 1);
  const py = (altura: number) => m.t + hh - (altura / H) * hh;
  const suelo = m.t + hh;

  const Fmax = Math.max(...d.Fk.map(Math.abs), 1);
  const Vmax = Math.max(...d.Vk.map(Math.abs), 1);

  // Con veinte plantas los rótulos se pisarían. Antes que encimarlos se rotulan
  // sólo los extremos: la cubierta y la planta baja, que son los dos que se
  // miran.
  const paso = hh / Math.max(1, r.plantas.length);
  const cabe = paso >= f * 1.15;
  const rotula = (k: number) => cabe || k === 0 || k === r.plantas.length - 1;

  return (
    <svg
      width={width}
      height={h}
      viewBox={`0 0 ${width} ${h}`}
      role="img"
      aria-label={`Fuerzas y cortantes en dirección ${E}`}
    >
      <title>
        {'Alzado con las fuerzas equivalentes por planta y el diagrama de cortantes en la '
          + `dirección ${E}.`}
      </title>

      <defs>
        {/*
          `markerUnits="userSpaceOnUse"`: por defecto la punta escala con el
          grosor del trazo, y con 2,2 px de flecha salía de 15 px — más larga
          que el fuste de la F_k más pequeña, que quedaba en pura punta. Así
          todas las puntas miden lo mismo, se pinte la fuerza que se pinte.
        */}
        <marker
          id={puntaPos}
          markerUnits="userSpaceOnUse"
          markerWidth="10"
          markerHeight="9"
          refX="9"
          refY="4.5"
          orient="auto"
        >
          <path d="M0,0 L10,4.5 L0,9 Z" fill={C.acento} />
        </marker>
        <marker
          id={puntaNeg}
          markerUnits="userSpaceOnUse"
          markerWidth="10"
          markerHeight="9"
          refX="9"
          refY="4.5"
          orient="auto"
        >
          <path d="M0,0 L10,4.5 L0,9 Z" fill={C.aviso} />
        </marker>
        <pattern id={rayado} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.eje} strokeWidth="1" />
        </pattern>
      </defs>

      {/* encabezados: cada bloque dice qué es y en qué unidad */}
      <text x={m.l} y={f * 1.15} fontSize={f * 0.95} fill={C.rotulo} fontFamily={MONO}>
        F_k · {E} [{unidadFuerza(system)}]
      </text>
      <text x={xV} y={f * 1.15} fontSize={f * 0.95} fill={C.rotulo} fontFamily={MONO}>
        V_k · {E} [{unidadFuerza(system)}]
      </text>

      {/* edificio */}
      <rect
        x={xEdif}
        y={py(H)}
        width={colEdif}
        height={suelo - py(H)}
        fill={C.papel}
        stroke={C.masa}
        strokeWidth={1.4}
      />
      <line x1={xEdif - colFlecha - gapF} y1={suelo} x2={xEdifR + f * 0.6} y2={suelo} stroke={C.eje} strokeWidth={1.4} />
      <rect x={xEdif} y={suelo} width={colEdif} height={f * 0.55} fill={`url(#${rayado})`} />

      {r.plantas.map((p, k) => {
        const y = py(p.h);
        const F = d.Fk[k];
        const negativa = F < 0;
        // Mínimo de un cuerpo de letra: por debajo la flecha era punta y nada más.
        const largo = F === 0 ? 0 : Math.max(f * 1.2, (Math.abs(F) / Fmax) * colFlecha);
        return (
          <g key={k}>
            {/* forjado */}
            <line x1={xEdif} y1={y} x2={xEdifR} y2={y} stroke={C.masa} strokeWidth={1.2} />
            {/*
              Una F_k negativa se dibuja hacia el otro lado en vez de recortarse:
              el SRSS destruye el signo y el perfil combinado no tiene por qué
              ser monótono. Esconderlo dejaría al usuario sin ver un caso
              legítimo. Positiva o negativa, la flecha se ancla en el borde del
              edificio: sólo cambia hacia dónde apunta la punta.
            */}
            {largo > 0 ? (
              <line
                x1={negativa ? xEdif : xEdif - largo}
                y1={y}
                x2={negativa ? xEdif - largo : xEdif}
                y2={y}
                stroke={negativa ? C.aviso : C.acento}
                strokeWidth={2.2}
                // Cada color con su punta: la flecha ámbar de una F_k negativa
                // acababa en una punta azul, que sugiere lo contrario de lo que
                // el color del trazo está diciendo.
                markerEnd={`url(#${negativa ? puntaNeg : puntaPos})`}
              />
            ) : null}
            {rotula(k) ? (
              <text
                x={xFtxt}
                y={y + f * 0.35}
                fontSize={f * 0.88}
                fill={negativa ? C.aviso : C.rotulo}
                textAnchor="end"
                fontFamily={MONO}
              >
                {fuerza(F, system)}
              </text>
            ) : null}
            {cabe ? (
              <text
                x={(xEdif + xEdifR) / 2}
                y={y + f * 1.05}
                fontSize={f * 0.78}
                fill={C.texto}
                textAnchor="middle"
                fontFamily={MONO}
              >
                {k + 1}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* diagrama de cortantes */}
      <line x1={xV} y1={m.t} x2={xV} y2={suelo} stroke={C.eje} strokeWidth={1.25} />
      <line x1={xV} y1={suelo} x2={xV + colV + f * 0.6} y2={suelo} stroke={C.eje} strokeWidth={1.25} />
      <path
        d={(() => {
          // Escalonado: el cortante es constante dentro de cada planta.
          let s = `M${xV},${suelo}`;
          for (let k = 0; k < d.Vk.length; k++) {
            const x = xV + (Math.abs(d.Vk[k]) / Vmax) * colV;
            const yInf = k === 0 ? suelo : py(r.plantas[k - 1].h);
            const ySup = py(r.plantas[k].h);
            s += `L${x.toFixed(2)},${yInf.toFixed(2)}L${x.toFixed(2)},${ySup.toFixed(2)}`;
          }
          s += `L${xV},${py(r.plantas[r.plantas.length - 1].h).toFixed(2)}Z`;
          return s;
        })()}
        fill={C.acentoSuave}
        stroke={C.acento}
        strokeWidth={1.5}
      />
      {d.Vk.map((V, k) => {
        if (!rotula(k)) return null;
        const x = xV + (Math.abs(V) / Vmax) * colV;
        const yInf = k === 0 ? suelo : py(r.plantas[k - 1].h);
        const ySup = py(r.plantas[k].h);
        return (
          <text
            key={k}
            x={x + f * 0.35}
            y={(yInf + ySup) / 2 + f * 0.32}
            fontSize={f * 0.88}
            fill={C.rotulo}
            fontFamily={MONO}
          >
            {fuerza(V, system)}
          </text>
        );
      })}

      {/* pie: los dos números que se buscan de un vistazo */}
      <text x={m.l} y={h - f * 0.6} fontSize={f * 0.88} fill={C.texto} fontFamily={MONO}>
        H = {dec(H, 2)} m · {r.plantas.length} plantas
      </text>
      {/*
        La fracción del peso sísmico, y no otra vez el cortante basal: el número
        ya está rotulado en el escalón de abajo, y ÉSTE es con el que un
        proyectista reconoce de un vistazo si el orden de magnitud es el suyo.
      */}
      <text
        x={m.l + W}
        y={h - f * 0.6}
        fontSize={f * 0.88}
        fill={C.texto}
        textAnchor="end"
        fontFamily={MONO}
      >
        V_base / Σ P_k = {pct(d.cortanteBasal / Math.max(1e-9, r.pesoSismico))}
      </text>
    </svg>
  );
}
