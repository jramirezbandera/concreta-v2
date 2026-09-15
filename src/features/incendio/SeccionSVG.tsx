/**
 * La sección del edificio: la cadena de cotas que justifica la R.
 *
 * Este dibujo tiene un trabajo concreto y sólo uno: enseñar de dónde sale la
 * ALTURA DE EVACUACIÓN, que es el número con el que se entra en la tabla 3.1 y
 * el que decide, él solo, si un edificio es R 60 o R 120. Se teclea planta a
 * planta en la tabla de al lado, y en una tabla de números no se ve lo que sí
 * se ve aquí: que falta una altura y la cadena está cortada, que la planta de
 * salida no es la que uno creía, o que la cota de arriba no es la de la
 * cubierta porque la cubierta no cuenta.
 *
 * Tres decisiones que vienen de lo que la norma mide y no de cómo queda:
 *
 *  - **El cero es el forjado de la planta de salida**, no el suelo del sótano
 *    ni la rasante del terreno. Es el convenio del Anejo A del DB SI y es el
 *    que usa `alturasDeEvacuacion`; el dibujo no elige otro.
 *  - **Las plantas de ocupación nula se dibujan, pero a trazos.** Están ahí
 *    —se ven en la sección del edificio— y sin embargo no son origen de
 *    evacuación: la cota de evacuación no llega hasta ellas. Borrarlas dejaría
 *    un dibujo que no se parece al edificio; pintarlas igual que las demás
 *    haría creer que la cota va mal.
 *  - **Las R van a su lado de la rasante.** La tabla 3.1 tiene columna aparte
 *    para el sótano, así que un edificio corriente tiene dos: la de las
 *    plantas sobre rasante y la del aparcamiento de abajo. Cada una se rotula
 *    junto a las plantas a las que se declaró, y no hay una sola cifra global.
 *
 * Con la cadena de alturas incompleta el dibujo NO se inventa la escala: pasa a
 * reparto uniforme y lo dice. Un dibujo a escala inventada es peor que ninguno.
 */

import { Marcadores } from '../../components/canvas/Marcadores';
import { COLOR, mezcla } from '../../components/canvas/paleta';
import { CotaV, Rotulo, Suelo } from '../../components/canvas/primitivas';
import { useMarcadores } from '../../components/canvas/useMarcadores';
import type { PlantaConCota } from '../../lib/incendio/altura';
import type { SectorResuelto } from '../../lib/incendio/sectores';

interface Props {
  /** De abajo arriba, tal como las devuelve `alturasDeEvacuacion`. */
  plantas: readonly PlantaConCota[];
  /** m. La que se declara: la tecleada a mano si la hay. */
  alturaEvacuacion: number | null;
  alturaAMano: boolean;
  /** m. La ascendente, desde el sótano ocupado más bajo. */
  ascendente: number | null;
  sectores: readonly SectorResuelto[];
  width?: number;
}

const m2 = (v: number) => v.toFixed(2).replace('.', ',');

const GRUESO = 5;
/** Lo que se deja entre forjados cuando no hay cotas con las que escalar. */
const PASO_UNIFORME = 34;
/**
 * Separación entre forjados, en píxeles. El mínimo manda sobre todo lo demás:
 * dos plantas más juntas que esto se comen sus propios rótulos, y un dibujo
 * ilegible no vale para lo único que tiene que hacer.
 */
const PASO_MINIMO = 30;
const PASO_MAXIMO = 64;
/** px/m de partida, cuando la altura de planta es la corriente. */
const ESCALA_NATURAL = 26;
/**
 * Alto al que se intenta no pasar. Una torre de quince plantas lo rebasa y
 * entonces el panel hace scroll: es preferible a apretar los rótulos.
 */
const ALTO_COMODO = 380;

/** El rótulo de la planta, recortado a lo que cabe en el margen. */
const corto = (nombre: string) => (nombre.length > 16 ? `${nombre.slice(0, 15)}…` : nombre);

/**
 * Dónde se rotula la R de una zona: colgando de su arranque, no en su centro.
 * El centro cae justo sobre un forjado en cuanto la zona tiene dos plantas, y
 * entonces la cifra se pisa con la línea.
 */
const rotuloDeZona = (yArriba: number, yAbajo: number) =>
  Math.min(yArriba + 18, (yArriba + yAbajo) / 2 + 4);

/** Las R distintas de un grupo de sectores, en orden y sin repetir. */
function erres(sectores: readonly SectorResuelto[], sotano: boolean): string {
  const vs = [
    ...new Set(
      sectores
        .filter((s) => s.sotano === sotano && s.minutos !== null && s.nombre !== '')
        .map((s) => s.minutos as number),
    ),
  ].sort((a, b) => a - b);
  return vs.length === 0 ? '' : vs.map((v) => `R ${v}`).join(' · ');
}

export function SeccionSVG({
  plantas,
  alturaEvacuacion,
  alturaAMano,
  ascendente,
  sectores,
  width = 320,
}: Props) {
  const m = useMarcadores();
  if (plantas.length === 0) return null;

  // ── Escala ────────────────────────────────────────────────────────────────
  // Con toda la cadena de cotas cerrada el dibujo va a escala, y dos plantas de
  // distinta altura se ven distintas. Basta con que falte una para que la
  // escala deje de significar nada: entonces, reparto uniforme y rótulo.
  const cotas = plantas.map((p) => p.cota);
  const valores = cotas.filter((c): c is number => c !== null);
  const min = valores.length > 0 ? Math.min(...valores) : 0;
  const max = valores.length > 0 ? Math.max(...valores) : 0;
  const recorrido = max - min;
  const aEscala = cotas.every((c) => c !== null) && plantas.length > 1 && recorrido > 0;

  const arriba = 36;
  /**
   * px/m. Se parte de una escala natural, se acota para que la separación entre
   * forjados caiga en su rango, se intenta que el edificio entero quepa cómodo
   * y, por encima de todo, se respeta la separación mínima.
   */
  const medio = Math.max(0.01, recorrido / Math.max(1, plantas.length - 1));
  const porPaso = Math.min(PASO_MAXIMO / medio, Math.max(PASO_MINIMO / medio, ESCALA_NATURAL));
  const escala = aEscala
    ? Math.max(PASO_MINIMO / medio, Math.min(porPaso, ALTO_COMODO / Math.max(0.01, recorrido)))
    : 0;

  /** y de cada planta: el array va de abajo arriba y los píxeles al revés. */
  const ys = plantas.map((p, i) =>
    aEscala
      ? arriba + (max - (p.cota as number)) * escala
      : arriba + (plantas.length - 1 - i) * PASO_UNIFORME,
  );

  const bx = 58;
  const bw = Math.max(74, width - bx - 92);
  /** La cota de evacuación va por dentro: fuera se pisaba con la de cada forjado. */
  const xCota = bx + 16;
  const yTop = Math.min(...ys);
  const yBot = Math.max(...ys);

  // El cero de cotas: el forjado de la planta de salida. Sin ella —todo bajo
  // rasante— no hay rasante que dibujar, y de eso ya avisa la tabla.
  const iSalida = plantas.findIndex((p) => p.esSalida);
  const ySalida = iSalida >= 0 ? ys[iSalida] : null;

  // La cota de evacuación descendente llega hasta el origen de evacuación más
  // alto, que no tiene por qué ser la última planta.
  const iAlto = plantas.reduce(
    (mejor, p, i) => (p.cuenta && !p.bajoRasante && (mejor < 0 || ys[i] < ys[mejor]) ? i : mejor),
    -1,
  );
  // Y la ascendente baja hasta el sótano ocupado más hondo.
  const iHondo = plantas.reduce(
    (mejor, p, i) => (p.cuenta && p.bajoRasante && (mejor < 0 || ys[i] > ys[mejor]) ? i : mejor),
    -1,
  );

  const rSobre = erres(sectores, false);
  const rBajo = erres(sectores, true);

  const alto = yBot + GRUESO + 56;

  return (
    <svg
      width={width}
      height={alto}
      viewBox={`0 0 ${width} ${alto}`}
      role="img"
      aria-label="Sección del edificio con las cotas de las plantas y la altura de evacuación"
      style={{ display: 'block' }}
    >
      <title>Sección: de dónde sale la altura de evacuación</title>
      <Marcadores id={m.id} />

      <Rotulo x={4} y={13} tam={10} mono color={COLOR.secundario} peso={500}>
        SECCIÓN · altura de evacuación
      </Rotulo>
      <Rotulo x={4} y={25} tam={8.5} mono color={COLOR.atenuado}>
        {aEscala ? 'a escala · cero en el forjado de salida' : 'sin escala: falta alguna altura'}
      </Rotulo>

      {/* Fachadas, de la planta más baja a la más alta */}
      {plantas.length > 1 && (
        <>
          <line x1={bx} y1={yTop} x2={bx} y2={yBot + GRUESO} stroke={COLOR.seccion} strokeWidth={1.5} />
          <line x1={bx + bw} y1={yTop} x2={bx + bw} y2={yBot + GRUESO} stroke={COLOR.seccion} strokeWidth={1.5} />
        </>
      )}

      {/* Un forjado por planta. A trazos las de ocupación nula: están en el
          edificio pero no son origen de evacuación, y la cota no llega a ellas. */}
      {plantas.map((p, i) => (
        <g key={p.nombre || i}>
          {p.cuenta ? (
            <rect x={bx} y={ys[i]} width={bw} height={GRUESO} fill={COLOR.seccion} />
          ) : (
            <rect
              x={bx}
              y={ys[i]}
              width={bw}
              height={GRUESO}
              fill={mezcla(COLOR.seccion, 18)}
              stroke={mezcla(COLOR.seccion, 55)}
              strokeWidth={0.75}
              strokeDasharray="3 2"
            />
          )}
          {/* El nombre va ENCIMA de su forjado, no a su lado: al lado, el de la
              planta de salida caía dentro del rayado de la rasante. */}
          <Rotulo x={bx + bw + 6} y={ys[i] - 1} tam={8} mono color={COLOR.atenuado}>
            {corto(p.nombre)}
          </Rotulo>
          {/* La cota de cada forjado, a la izquierda: es lo que se contrasta
              contra la sección de arquitectura. */}
          <Rotulo
            x={bx - 8}
            y={ys[i] + 3}
            tam={8.5}
            mono
            color={p.esSalida ? COLOR.accent : COLOR.atenuado}
            ancla="end"
          >
            {p.cota === null ? '—' : `${p.cota > 0 ? '+' : ''}${m2(p.cota)}`}
          </Rotulo>
          {!p.cuenta && (
            <Rotulo x={bx + bw + 6} y={ys[i] + 9} tam={7.5} mono color={COLOR.atenuado}>
              ocup. nula
            </Rotulo>
          )}
        </g>
      ))}

      {/* Rasante: a la cota del forjado de la planta de salida, que es el cero */}
      {ySalida !== null && (
        <>
          {/* El rayado se queda dentro del ancho del edificio: asomando por los
              lados se comía la cota de la izquierda y el nombre de la derecha. */}
          <Suelo x1={bx} x2={bx + bw} y={ySalida} patron={m.suelo} />
          <Rotulo x={bx + bw + 6} y={ySalida + 15} tam={7.5} mono color={COLOR.atenuado}>
            rasante
          </Rotulo>
        </>
      )}

      {/* La cota que manda: del origen de evacuación más alto al forjado de
          salida. Con la altura pisada a mano se marca con un asterisco, porque
          entonces el dibujo y el número declarado pueden no coincidir. */}
      {ySalida !== null && iAlto >= 0 && ys[iAlto] < ySalida && (
        <CotaV
          x={xCota}
          y1={ys[iAlto]}
          y2={ySalida}
          lado="derecha"
          texto={`${alturaEvacuacion === null ? '—' : m2(alturaEvacuacion)} m${alturaAMano ? '*' : ''}`}
          color={COLOR.accent}
        />
      )}

      {/* La ascendente, cuando hay sótano ocupado */}
      {ySalida !== null && iHondo >= 0 && ascendente !== null && ascendente > 0 && (
        <CotaV x={xCota} y1={ySalida} y2={ys[iHondo]} lado="derecha" texto={`${m2(ascendente)} asc.`} />
      )}

      {/* La R de cada lado de la rasante: la tabla 3.1 tiene columna aparte
          para el sótano, así que no hay UNA R del edificio. */}
      {rSobre !== '' && (
        <Rotulo
          x={bx + bw - 6}
          y={rotuloDeZona(yTop, ySalida ?? yBot)}
          tam={10}
          mono
          color={COLOR.accent}
          peso={600}
          ancla="end"
        >
          {rSobre}
        </Rotulo>
      )}
      {rBajo !== '' && ySalida !== null && ySalida < yBot && (
        <Rotulo x={bx + bw - 6} y={rotuloDeZona(ySalida, yBot)} tam={10} mono color={COLOR.accent} peso={600} ancla="end">
          {rBajo}
        </Rotulo>
      )}

      <g transform={`translate(4 ${alto - 30})`}>
        <Rotulo x={0} y={0} tam={8.5} mono color={COLOR.atenuado}>
          cotas sobre el forjado de salida
        </Rotulo>
        <Rotulo x={0} y={12} tam={8.5} mono color={COLOR.atenuado}>
          {alturaAMano ? '* altura adoptada a mano' : 'a trazos: de ocupación nula'}
        </Rotulo>
      </g>
    </svg>
  );
}
