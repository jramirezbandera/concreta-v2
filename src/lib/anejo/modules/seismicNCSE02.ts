/**
 * Adaptador del anejo para Acción sísmica (NCSE-02) (`concreta-seismic`).
 * El título vive en el satélite `concreta-seismic-title` (useDocTitle).
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const seismicNCSE02Anejo = definirAdaptador({
  modulo: 'concreta-seismic',
  seccion: 'memoria',
  capitulo: 'Acción sísmica (NCSE-02)',
});
