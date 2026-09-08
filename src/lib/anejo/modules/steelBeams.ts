/**
 * Adaptador del anejo para Vigas de acero (`concreta-steel-beams`).
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const steelBeamsAnejo = definirAdaptador({
  modulo: 'concreta-steel-beams',
  seccion: 'piezas',
  capitulo: 'Vigas de acero',
});
