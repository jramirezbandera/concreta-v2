/**
 * Adaptador del anejo para Zapatas aisladas (`concreta-footings`).
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const isolatedFootingAnejo = definirAdaptador({
  modulo: 'concreta-footings',
  seccion: 'piezas',
  capitulo: 'Zapatas aisladas',
});
