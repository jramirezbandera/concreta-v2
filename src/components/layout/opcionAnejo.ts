/**
 * La entrada «Guardar en el anejo» del desplegable «Exportar», para los cuatro
 * módulos de memoria que no pasan por el modal de previsualización (cuadro de
 * materiales, viento y nieve, cargas por planta y ficha DB SE). Los veinte
 * módulos con previsualización tienen el botón dentro del propio modal.
 *
 * Es un destino más del menú: el mismo PDF de la memoria, sólo que en vez de
 * bajar al disco entra como capítulo del anejo de la obra. Con la constante
 * compartida, los cuatro dicen lo mismo con las mismas palabras.
 */

import type { GrupoExportar } from './ExportarMenu';

export const ID_ANEJO = 'anejo' as const;
export type IdAnejo = typeof ID_ANEJO;

export const GRUPO_ANEJO: GrupoExportar<IdAnejo> = {
  titulo: 'Anejo de cálculo',
  opciones: [
    {
      id: ID_ANEJO,
      etiqueta: 'Guardar en el anejo',
      detalle: 'el PDF de la memoria, como capítulo del anejo de esta obra',
    },
  ],
};

/** Lo que cambia en `FORMATOS` de cada módulo: el fichero es el PDF de siempre. */
export const FORMATO_ANEJO = { etiqueta: 'Guardar en el anejo', extension: 'pdf', enError: 'PDF del anejo' } as const;

/** Las props del `TitlePromptModal` cuando el destino es el anejo y no el disco. */
export function propsTituloAnejo(capitulo: string) {
  return {
    titulo: 'Guardar en el anejo',
    confirmar: 'Guardar en el anejo',
    lineaDestino: `Entra en el anejo de esta obra como capítulo «${capitulo}». El título va en el índice del anejo.`,
  };
}
