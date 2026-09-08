/**
 * Adaptador del anejo para Muros de contención (`concreta-retaining-wall`).
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const retainingWallAnejo = definirAdaptador({
  modulo: 'concreta-retaining-wall',
  seccion: 'piezas',
  capitulo: 'Muros de contención',
});
