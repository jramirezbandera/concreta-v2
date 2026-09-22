/**
 * Qué plano tipo de muro le toca a este cálculo, y qué armadura le pide.
 *
 * Vive aparte de `muro.ts` —que es quien rellena el DXF— porque la pantalla
 * necesita estas dos respuestas ANTES de que nadie pulse «DXF»: el nombre del
 * fichero que enseña el modal del título lleva el tipo, y el botón tiene que
 * saber si puede exportar sin traerse el rellenador ni la plantilla. Lo caro
 * —leer el DXF, medir el texto, reescribir celdas— se queda al otro lado del
 * `import()`.
 *
 * Los tres tipos y lo que significa cada sigla están documentados en `muro.ts`.
 */

import type { RetainingWallInputs } from '../../data/defaults';

/** Los tres planos tipo del estudio. */
export const TIPOS_MURO = [1, 2, 3] as const;
export type TipoMuro = (typeof TIPOS_MURO)[number];

/** Cómo se llama cada tipo en los mensajes de la aplicación. */
export const NOMBRE_TIPO: Record<TipoMuro, string> = {
  1: 'con talón y puntera',
  2: 'sin talón',
  3: 'sin puntera',
};

/**
 * Qué plano tipo representa este muro.
 *
 * El umbral es medio centímetro porque la tabla cota en centímetros enteros:
 * un vuelo que se escribiría «0» es un vuelo que no existe. Sin ninguno de los
 * dos —una zapata del ancho del fuste— sale el tipo 2, que es el que menos
 * dibuja de más; la tabla dirá C = 0 y el plano es genérico, como el resto.
 */
export function tipoDeMuro(inp: RetainingWallInputs): TipoMuro {
  const SIN_VUELO = 0.005; // m
  if ((inp.bTalon as number) < SIN_VUELO) return 2;
  if ((inp.bPunta as number) < SIN_VUELO) return 3;
  return 1;
}

/**
 * Las siete familias de armadura del plano: qué casilla ocupan, de qué campos
 * del módulo salen y en qué planos tipo existen.
 *
 * Una sola tabla para las tres cosas que hay que saber de ellas —qué escribir
 * en la casilla, qué falta por definir y qué no cabe en el plano elegido— para
 * que no puedan decir cosas distintas.
 *
 * El tipo 2 no tiene As5 ni As7: sin talón no hay tierras sobre la zapata, la
 * flexión no cambia de signo y la cara superior no lleva armadura principal.
 */
export const ARMADURAS: {
  etiqueta: string;
  nombre: string;
  diam: keyof RetainingWallInputs;
  sep: keyof RetainingWallInputs;
  tipos: readonly TipoMuro[];
}[] = [
  { etiqueta: 'As1', nombre: 'vertical de trasdós del fuste',     diam: 'diam_fv_int', sep: 'sep_fv_int', tipos: [1, 2, 3] },
  { etiqueta: 'As2', nombre: 'vertical de intradós del fuste',    diam: 'diam_fv_ext', sep: 'sep_fv_ext', tipos: [1, 2, 3] },
  { etiqueta: 'As3', nombre: 'horizontal del fuste',              diam: 'diam_fh',     sep: 'sep_fh',     tipos: [1, 2, 3] },
  { etiqueta: 'As4', nombre: 'inferior de la zapata',             diam: 'diam_zi',     sep: 'sep_zi',     tipos: [1, 2, 3] },
  { etiqueta: 'As5', nombre: 'superior de la zapata',             diam: 'diam_zs',     sep: 'sep_zs',     tipos: [1, 3] },
  { etiqueta: 'As6', nombre: 'transversal inferior de la zapata', diam: 'diam_zt_inf', sep: 'sep_zt_inf', tipos: [1, 2, 3] },
  { etiqueta: 'As7', nombre: 'transversal superior de la zapata', diam: 'diam_zt_sup', sep: 'sep_zt_sup', tipos: [1, 3] },
];

/** Un campo numérico del módulo, como número. */
export const campo = (inp: RetainingWallInputs, k: keyof RetainingWallInputs): number =>
  Number(inp[k]) || 0;

/**
 * Las familias que el plano elegido pide y el cálculo no tiene definidas.
 *
 * El módulo de muros se usa también en modo dimensionado —ø = 0 y sólo se
 * calcula As,req—, y en ese modo un plano con las casillas a «-» no dice qué
 * poner en obra: no es un plano, es una plantilla vacía con el membrete del
 * estudio. Quien llama lo usa para no dejar exportar y decir qué falta.
 */
export function armadurasSinDefinir(inp: RetainingWallInputs, tipo: TipoMuro): string[] {
  return ARMADURAS.filter(
    (a) => a.tipos.includes(tipo) && (campo(inp, a.diam) <= 0 || campo(inp, a.sep) <= 0),
  ).map((a) => a.nombre);
}
