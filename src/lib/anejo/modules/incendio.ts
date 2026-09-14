/**
 * Adaptador del anejo para Incendio (`concreta-incendio`).
 * Ver `../types.ts` y `../adaptador.ts`.
 *
 * `seccion: 'memoria'` y no `'piezas'`: es un capítulo por obra que se
 * reemplaza al volver a guardar, no una pieza por elemento. Y hay una razón
 * más fuerte —ver el comentario de `../types.ts`—: los sobres
 * `concreta-pub-*` quedan deliberadamente fuera de los `datos` de una pieza, y
 * eso se sostiene porque los módulos que publican son exactamente los de
 * `memoria`, que no se restauran. Si incendio fuera `'piezas'`, restaurar una
 * pieza reescribiría `concreta-incendio-model` sin reescribir
 * `concreta-pub-incendio`, y el cuadro de materiales imprimiría una R que
 * contradice al estado restaurado.
 */

import { definirAdaptador } from '../adaptador';

export const incendioAnejo = definirAdaptador({
  modulo: 'concreta-incendio',
  seccion: 'memoria',
  capitulo: 'Resistencia al fuego',
});
