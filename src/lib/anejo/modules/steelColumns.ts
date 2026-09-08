/**
 * Adaptador del anejo para Pilares de acero (`concreta-steel-columns`).
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const steelColumnsAnejo = definirAdaptador({
  modulo: 'concreta-steel-columns',
  seccion: 'piezas',
  capitulo: 'Pilares de acero',
});
