/**
 * Adaptador del anejo para Sección compuesta (`concreta-composite-section`).
 * Sin clave de versión: el esquema de la pieza es la versión viva de la tabla.
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const compositeSectionAnejo = definirAdaptador({
  modulo: 'concreta-composite-section',
  seccion: 'piezas',
  capitulo: 'Sección compuesta',
});
