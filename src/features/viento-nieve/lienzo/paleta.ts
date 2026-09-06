/**
 * Lo que este módulo añade a la paleta común de los lienzos
 * (`components/canvas/paleta.ts`): la escala de opacidad del mapa de
 * presiones.
 *
 * La presión (hacia dentro) va en naranja —token propio, `--color-chart-
 * presion`— y la succión (hacia fuera) en el acento, con la intensidad en la
 * transparencia. Los colores de estado quedan para el estado: nunca para el
 * mapa de presiones (DESIGN.md).
 *
 * Re-exporta `COLOR`, `mezcla`, `dec` y las fuentes para que los cuatro
 * dibujos del módulo sigan pidiéndole todo a un solo sitio.
 */

import { COLOR, mezcla } from '../../../components/canvas/paleta';

export { COLOR, mezcla, dec, FUENTE_MONO, FUENTE_SANS } from '../../../components/canvas/paleta';

const ALFA_MIN = 12;
const ALFA_MAX = 50;

/** Relleno de una zona en presión: más opaco cuanto más empuja, con `maximo` como tope de la escala. */
export function rellenoPresion(valor: number, maximo: number): string {
  const t = maximo > 0 ? Math.min(1, Math.abs(valor) / maximo) : 0;
  return mezcla(COLOR.presion, ALFA_MIN + (ALFA_MAX - ALFA_MIN) * t);
}

/** Relleno de una zona en succión: misma escala, en el acento. */
export function rellenoSuccion(valor: number, maximo: number): string {
  const t = maximo > 0 ? Math.min(1, Math.abs(valor) / maximo) : 0;
  return mezcla(COLOR.succion, ALFA_MIN + (ALFA_MAX - ALFA_MIN) * t);
}

/**
 * Relleno de una zona con sus dos posibilidades: manda el signo que domina en
 * valor absoluto (a 40º casi todo empuja; a 5º casi todo levanta).
 */
export function rellenoZona(succion: number | null, presion: number | null, maximo: number): string {
  const s = succion ?? 0;
  const p = presion ?? 0;
  return p >= Math.abs(s) ? rellenoPresion(p, maximo) : rellenoSuccion(s, maximo);
}
