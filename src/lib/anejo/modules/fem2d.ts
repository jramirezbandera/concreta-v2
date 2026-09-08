/**
 * Adaptador del anejo para Análisis FEM 2D (`concreta-fem2d`).
 * FEM 2D. Versión en `concreta-fem2d-v`; el título en `concreta-fem2d-title`.
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const fem2dAnejo = definirAdaptador({
  modulo: 'concreta-fem2d',
  seccion: 'piezas',
  capitulo: 'Análisis FEM 2D',
});
