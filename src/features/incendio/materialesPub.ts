/**
 * De qué está hecha la obra, leído del sobre del cuadro de materiales.
 *
 * El módulo de incendio lo necesita para una sola cosa: citar los anejos del DB
 * SI que le tocan a cada material («comprobados con las tablas del anejo C y D
 * del DB SI»). No es un sumando de ninguna cuenta, es un rótulo, así que se lee
 * del sobre cada vez y no se copia ni se congela —mismo criterio que el sismo
 * en el cuadro del plano de cargas por planta—.
 *
 * Sin sobre no pasa nada: `anejosFuego()` tiene su rama para eso y la frase
 * sale diciendo «de los anejos C a F», que es cierto y no compromete nada.
 *
 * Las claves van a mano y el tipo entra como TIPO, para no arrastrar al chunk
 * de este módulo el motor entero de `lib/materiales` —derive, tablasCE,
 * tablasMadera, anclajes— por dos booleanos. Es la doctrina de
 * `features/memoria-dbse/sobres.ts`, y como allí, hay un test que asevera que
 * estos literales siguen coincidiendo con los del módulo que publica.
 */

import { presentesDeSobre, type MaterialesPresentes } from '../../lib/incendio/notas';
import { leerPublicacion } from '../../lib/pub';
import type { PubMateriales } from '../materiales/state';

export const MODULO_MATERIALES = 'materiales';
export const PUB_VERSION_MATERIALES = 3;

/**
 * Los materiales de la obra, o `{}` si no hay nada publicado.
 *
 * El filtro `configurado !== true` no es celo: el cuadro de materiales arranca
 * con HA-25 + B500SD puestos, y sin él bastaría con haberlo abierto una vez
 * para que este documento afirmase que la obra tiene hormigón.
 */
export function materialesPublicados(): MaterialesPresentes {
  const sobre = leerPublicacion<PubMateriales>(MODULO_MATERIALES, PUB_VERSION_MATERIALES);
  if (!sobre || sobre.configurado !== true) return {};
  return presentesDeSobre(sobre.datos ?? null);
}
