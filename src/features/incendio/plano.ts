/**
 * El cuadro de resistencia al fuego del PLANO, sin React.
 *
 * Hermano de `features/materiales/plano.ts` y `features/cargas-planta/plano.ts`:
 * la exportación conjunta de la obra (`lib/plano/obra.ts`) tiene que ensamblar
 * este cuadro igual que lo ensambla el módulo, y la única forma de garantizar
 * que no divergen es que haya UNA función que lo haga.
 *
 * El cuadro del plano dice menos que el de la memoria a propósito: NO certifica
 * secciones, sólo enuncia la R exigida y los revestimientos (ver la nota de
 * `fuego-dos-vias-no-certificar-seccion`).
 */

import { cuadroIncendioPlano } from '../../lib/incendio/cuadros';
import { exigenciasResueltas } from '../../lib/incendio/exigencias';
import type { Block } from '../../lib/memoria/model';
import { materialesPublicados } from './materialesPub';
import type { MaterialesPresentes } from '../../lib/incendio/notas';
import { cargarEstado, estaConfigurado, evaluar, type Evaluacion, type IncendioState } from './state';

/** El cuadro del plano a partir del estado y la evaluación ya hechos. */
export function bloquesDePlano(state: IncendioState, ev: Evaluacion, presentes: MaterialesPresentes): Block[] {
  return cuadroIncendioPlano(presentes, ev.exigencias, {
    alturaEvacuacion: ev.alturaEvacuacion,
    alturaAMano: ev.alturaAMano,
    sectores: ev.sectores,
    sueltas: exigenciasResueltas(state.exigencias),
    elementos: ev.elementos,
  });
}

/**
 * El cuadro de plano de lo que hay GUARDADO, y la pestaña de su Excel (una
 * sola: las dos tablas tienen la misma forma y se capturan de una vez).
 * `null` cuando el módulo sigue con los valores de partida.
 */
export function cuadroDePlanoGuardado(): { blocks: Block[]; secciones: { nombre: string; blocks: Block[] }[] } | null {
  const state = cargarEstado();
  if (!estaConfigurado(state)) return null;
  const blocks = bloquesDePlano(state, evaluar(state), materialesPublicados());
  return { blocks, secciones: [{ nombre: 'Resistencia al fuego', blocks }] };
}
