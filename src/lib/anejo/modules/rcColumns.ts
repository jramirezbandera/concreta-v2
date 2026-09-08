/**
 * Adaptador del anejo para Pilares de hormigón (`concreta-rc-columns`).
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const rcColumnsAnejo = definirAdaptador({
  modulo: 'concreta-rc-columns',
  seccion: 'piezas',
  capitulo: 'Pilares de hormigón',
});
