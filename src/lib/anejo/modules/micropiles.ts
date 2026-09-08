/**
 * Adaptador del anejo para Micropilotes (`concreta-micropiles`).
 * El suelo (`concreta-micropiles-soil`) es dato y entra en la huella.
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const micropilesAnejo = definirAdaptador({
  modulo: 'concreta-micropiles',
  seccion: 'piezas',
  capitulo: 'Micropilotes',
});
