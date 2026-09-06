/**
 * Los cuatro sobres que la ficha consume, leídos de golpe.
 *
 * Es el ÚNICO fichero del módulo que toca el localStorage de otros: lee las
 * publicaciones (`lib/pub`), nunca el estado interno de nadie.
 *
 * Las claves y versiones van escritas aquí a mano, no importadas de los
 * `state.ts` de cada módulo, porque importar el de sismo arrastra al chunk de
 * la ficha los 116 KB de `ncse02.hazard.json` que aquel fichero carga. Un test
 * (`test/memoria/sobres.test.ts`) las compara con los `MODULO_PUB` y
 * `PUB_VERSION` de origen, así que no pueden separarse sin que se note.
 */

import type { Sobres } from '../../lib/memoria/ensamblar';
import type { ModuloPub } from '../../lib/memoria/estado';
import { leerPublicacion } from '../../lib/pub';
import type { PubCargasPlanta } from '../cargas-planta/state';
import type { PubMateriales } from '../materiales/state';
import type { PubSismo } from '../seismic-ncse02/state';
import type { PubVientoNieve } from '../viento-nieve/state';

/** Clave del sobre y versión del esquema que esta ficha sabe leer. */
export const MODULOS: Record<ModuloPub, { modulo: string; version: number; etiqueta: string; ruta: string }> = {
  materiales: { modulo: 'materiales', version: 1, etiqueta: 'Cuadro de materiales', ruta: '/memorias/materiales' },
  vientoNieve: { modulo: 'viento-nieve', version: 1, etiqueta: 'Viento y nieve', ruta: '/acciones/viento-nieve' },
  cargasPlanta: { modulo: 'cargas-planta', version: 1, etiqueta: 'Cargas por planta', ruta: '/acciones/cargas-planta' },
  sismo: { modulo: 'sismo', version: 1, etiqueta: 'Acción sísmica', ruta: '/analisis/sismo' },
};

export type { Sobres };
export { SIN_SOBRES } from '../../lib/memoria/ensamblar';

export function leerSobres(): Sobres {
  return {
    materiales: leerPublicacion<PubMateriales>(MODULOS.materiales.modulo, MODULOS.materiales.version),
    vientoNieve: leerPublicacion<PubVientoNieve>(MODULOS.vientoNieve.modulo, MODULOS.vientoNieve.version),
    cargasPlanta: leerPublicacion<PubCargasPlanta>(MODULOS.cargasPlanta.modulo, MODULOS.cargasPlanta.version),
    sismo: leerPublicacion<PubSismo>(MODULOS.sismo.modulo, MODULOS.sismo.version),
  };
}
