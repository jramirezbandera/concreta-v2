/**
 * Las exigencias de resistencia al fuego que publica el módulo de incendio,
 * leídas como consumidor.
 *
 * El cuadro de materiales las imprimía porque se tecleaban en él. Desde el
 * 13-09-2026 se teclean en `/acciones/incendio` y aquí sólo se leen: la nota del
 * cuadro no cambia ni una coma, pero el dato ya no es de este módulo.
 *
 * Se lee del sobre en cada render y no se copia —es una frase que se imprime,
 * no un número que entre en una cuenta— igual que `cargas-planta/sismoPub.ts`.
 *
 * DOS COSAS QUE NO SE COPIAN DE `sismoPub.ts`:
 *
 * 1. NO hay filtro de provincia. La R de la tabla 3.1 depende del uso del
 *    sector y de la altura de evacuación, no de dónde esté el edificio. El
 *    guardia del «dato fantasma» tiene sentido con la zona eólica o la
 *    peligrosidad sísmica; aquí sólo produciría falsos positivos, y por eso el
 *    módulo de incendio publica con `ine: null`.
 * 2. El repliegue al LEGADO. Hasta que el usuario abra el módulo nuevo —o si
 *    abre un `.concreta` guardado antes de que existiera, que `desplegar()`
 *    despliega borrando las claves que el fichero no trae— no hay sobre de
 *    incendio, y la nota tiene que seguir saliendo. Se cae entonces a lo que
 *    este módulo guardó en su día. Desaparece en la fase de limpieza, cuando el
 *    legado se retire.
 */

import { exigenciasResueltas, type ExigenciaFuego } from '../../lib/incendio/exigencias';
import { leerPublicacion } from '../../lib/pub';
import type { FilaExigencia, PubIncendio } from '../incendio/state';

/**
 * A mano, y sólo el tipo importado: así el chunk del cuadro de materiales no
 * se lleva el estado del módulo de incendio por dos constantes. Simétrico de
 * `features/incendio/materialesPub.ts`, y con el mismo test de guardia.
 */
export const MODULO_INCENDIO = 'incendio';
export const PUB_VERSION_INCENDIO = 1;

/**
 * Lo publicado por el módulo de incendio, o `null` si no hay sobre utilizable.
 *
 * El filtro `configurado !== true` deja fuera un módulo que se abrió y no se
 * usó: sin él, una obra podría imprimir en un documento firmado una exigencia
 * que nadie decidió.
 */
export function exigenciasPublicadas(): ExigenciaFuego[] | null {
  const sobre = leerPublicacion<PubIncendio>(MODULO_INCENDIO, PUB_VERSION_INCENDIO);
  if (!sobre || sobre.configurado !== true || !sobre.datos) return null;
  return sobre.datos.exigencias;
}

/**
 * Lo que imprime el cuadro: el sobre si lo hay, y si no el legado que este
 * módulo guardó cuando las exigencias eran suyas.
 */
export function exigenciasDelCuadro(legado: readonly FilaExigencia[] | undefined): ExigenciaFuego[] {
  return exigenciasPublicadas() ?? exigenciasResueltas(legado ?? []);
}
