/**
 * Adaptador del anejo para Muros de fábrica (`concreta-masonry-walls`).
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const masonryWallsAnejo = definirAdaptador({
  modulo: 'concreta-masonry-walls',
  seccion: 'piezas',
  capitulo: 'Muros de fábrica',
});
