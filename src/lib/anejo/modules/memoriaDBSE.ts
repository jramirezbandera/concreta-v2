/**
 * Adaptador del anejo para Cumplimiento del DB SE (`concreta-memoria-dbse`).
 * La ficha no tiene título de documento: el capítulo pone el rótulo, y se
 * declara aquí para que la lectura genérica no invente uno si algún día el
 * modelo guardara un campo `title` con otro significado.
 * Ver `../types.ts` y `../adaptador.ts`.
 */

import { definirAdaptador } from '../adaptador';

export const memoriaDBSEAnejo = definirAdaptador({
  modulo: 'concreta-memoria-dbse',
  seccion: 'memoria',
  capitulo: 'Cumplimiento del DB SE',
  tituloGuardado: () => null,
});
