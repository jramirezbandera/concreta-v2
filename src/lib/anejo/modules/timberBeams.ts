/**
 * Adaptador del anejo para Vigas de madera (`concreta-timber-beams`).
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const timberBeamsAnejo = definirAdaptador({
  modulo: 'concreta-timber-beams',
  seccion: 'piezas',
  capitulo: 'Vigas de madera',
});
