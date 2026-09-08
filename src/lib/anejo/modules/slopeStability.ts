/**
 * Adaptador del anejo para Estabilidad de taludes (`concreta-slope-stability`).
 * Taludes vuelve al alcance sin coste: su PDF se congela como cualquier otro.
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const slopeStabilityAnejo = definirAdaptador({
  modulo: 'concreta-slope-stability',
  seccion: 'piezas',
  capitulo: 'Estabilidad de taludes',
});
