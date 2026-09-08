/**
 * Adaptador del anejo para Vigas de hormigón (`concreta-rc-beams`).
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const rcBeamsAnejo = definirAdaptador({
  modulo: 'concreta-rc-beams',
  seccion: 'piezas',
  capitulo: 'Vigas de hormigón',
});
