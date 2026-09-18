/**
 * La entrada «Guardar en el anejo» del desplegable «Exportar», que es la misma
 * en los veintiséis módulos.
 *
 * Es un destino más del menú: el mismo PDF que baja al disco, sólo que en vez
 * de bajar entra como capítulo del anejo de la obra. Con las constantes
 * compartidas, todos dicen lo mismo con las mismas palabras.
 *
 * Antes esto era sólo de los cinco módulos de memoria, y los de pieza metían
 * en el anejo desde un botón DENTRO de la previsualización: exportar el PDF,
 * verlo y luego guardarlo. Guardar en el anejo es un destino, no el epílogo de
 * una descarga, así que ahora está donde están los demás destinos —en el
 * desplegable— y el botón de la previsualización se queda para quien ya tiene
 * el PDF delante y decide allí.
 */

import type { GrupoExportar, OpcionExportar } from './ExportarMenu';
import { destinoDeGuardado, type AdaptadorAnejo, type DestinoGuardado } from '../../lib/anejo';

export const ID_ANEJO = 'anejo' as const;
export type IdAnejo = typeof ID_ANEJO;

/** Lo que entrega la opción, según lo que produzca el módulo. */
export const DETALLE_ANEJO_MEMORIA = 'el PDF de la memoria, como capítulo del anejo de esta obra';
export const DETALLE_ANEJO_CALCULO = 'el PDF del cálculo, como capítulo del anejo de esta obra';

/** La opción suelta, para componerla dentro del grupo que haga falta. */
export const opcionAnejo = (detalle: string = DETALLE_ANEJO_MEMORIA): OpcionExportar<IdAnejo> => ({
  id: ID_ANEJO,
  etiqueta: 'Guardar en el anejo',
  detalle,
});

/** El grupo con cabecera, para los menús que ya agrupan por documento. */
export const GRUPO_ANEJO: GrupoExportar<IdAnejo> = {
  titulo: 'Anejo de cálculo',
  opciones: [opcionAnejo()],
};

/** El mismo, en los módulos cuyo PDF es el cálculo de una pieza y no una memoria de obra. */
export const GRUPO_ANEJO_CALCULO: GrupoExportar<IdAnejo> = {
  titulo: 'Anejo de cálculo',
  opciones: [opcionAnejo(DETALLE_ANEJO_CALCULO)],
};

/** Lo que cambia en `FORMATOS` de cada módulo: el fichero es el PDF de siempre. */
export const FORMATO_ANEJO = { etiqueta: 'Guardar en el anejo', extension: 'pdf', enError: 'PDF del anejo' } as const;

/**
 * Las props del `TitlePromptModal` cuando el destino es el anejo y no el disco.
 *
 * La línea de destino se calcula con el nombre que se está TECLEANDO, no con
 * el que hubiera guardado: es ahí donde se decide si esto actualiza el
 * capítulo que el módulo tiene abierto o estrena uno, y el nombre es
 * justamente lo que lo decide (`destinoDeGuardado`). Antes esto se leía en el
 * botón de la previsualización, ya con el nombre confirmado; ahora que se
 * guarda sin pasar por allí, se dice en el único sitio donde el usuario
 * todavía puede cambiar de idea.
 */
export function propsTituloAnejo(adaptador: AdaptadorAnejo) {
  return {
    titulo: 'Guardar en el anejo',
    confirmar: 'Guardar en el anejo',
    lineaDestino: (titulo: string) =>
      textoDeDestino(destinoDeGuardado(adaptador.modulo, titulo), titulo.trim() || adaptador.capitulo),
  };
}

/** Qué va a pasar al guardar, en una frase. `rotulo` es el nombre que tendrá el capítulo. */
export function textoDeDestino(destino: DestinoGuardado, rotulo: string): string {
  if (destino.tipo === 'actualiza') {
    return destino.numero === null
      ? 'Actualiza su capítulo del anejo: sustituye el PDF y los datos, en su mismo sitio.'
      : `Actualiza el capítulo ${destino.numero} del anejo: sustituye el PDF y los datos, en su mismo sitio.`;
  }
  if (destino.desde) {
    return `Entra como capítulo nuevo: le has cambiado el nombre, así que «${destino.desde.titulo}» se queda en el anejo como estaba.`;
  }
  return `Entra en el anejo de esta obra como capítulo «${rotulo}». El título va en el índice del anejo.`;
}
