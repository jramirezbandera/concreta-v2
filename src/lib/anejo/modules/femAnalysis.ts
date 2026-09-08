/**
 * Adaptador del anejo para Análisis FEM 1D (`concreta-fem-2d`).
 * FEM 1D. Sin clave de versión; el título va en `concreta-fem-title`.
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const femAnalysisAnejo = definirAdaptador({
  modulo: 'concreta-fem-2d',
  seccion: 'piezas',
  capitulo: 'Análisis FEM 1D',
});
