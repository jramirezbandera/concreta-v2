/**
 * Adaptador del anejo para Cargas por planta (`concreta-cargas-planta`).
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const cargasPlantaAnejo = definirAdaptador({
  modulo: 'concreta-cargas-planta',
  seccion: 'memoria',
  capitulo: 'Cargas por planta',
});
