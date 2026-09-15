/**
 * El cuadro de acciones del PLANO de «Viento y nieve», sin React.
 *
 * El cuarto hermano de los `plano.ts` de los módulos con cuadro de plano, y el
 * que llegó con la exportación conjunta de la obra (`lib/plano/obra.ts`): éste
 * era el único de los cuatro que no sacaba DXF —sólo Excel—, y un CAD no puede
 * quedarse fuera del fichero que junta todos los cuadros por un formato que
 * falta. Al añadirlo, el módulo lo estrena también en su propio «Exportar».
 */

import { cuadroAccionesPlano, seccionesPlanoXlsx, type EmplazamientoCuadro } from '../../lib/acciones/cuadros';
import type { Block } from '../../lib/materiales/cuadros';
import { cargarEstado, estaConfigurado, evaluar, type Evaluacion, type VientoNieveState } from './state';

/**
 * La cabecera del cuadro: dónde está la obra y en qué zonas cae. Se saca del
 * estado y de la evaluación, sin decidir nada por su cuenta.
 */
export function emplazamientoDeCuadro(state: VientoNieveState, ev: Evaluacion): EmplazamientoCuadro {
  return {
    provincia: ev.zonas.provincia?.nombre ?? '—',
    municipio: state.emplazamiento.municipio,
    altitud: state.emplazamiento.altitud,
    zonaEolica: ev.zonas.zonaEolica,
    zonaInvernal: ev.zonas.zonaInvernal,
    zonaEolicaProvincia: ev.zonas.provincia?.zonaEolica ?? null,
    zonaInvernalProvincia: ev.zonas.provincia?.zonaInvernal ?? null,
  };
}

/**
 * El cuadro de plano de lo que hay GUARDADO, y las pestañas de su Excel.
 * `null` cuando el módulo sigue con los valores de partida o con el caso de
 * ejemplo: ni uno ni otro son el viento de esta obra.
 */
export function cuadroDePlanoGuardado(): { blocks: Block[]; secciones: { nombre: string; blocks: Block[] }[] } | null {
  const state = cargarEstado();
  if (!estaConfigurado(state)) return null;
  const ev = evaluar(state);
  const blocks = cuadroAccionesPlano(ev.viento, ev.nieve, emplazamientoDeCuadro(state, ev));
  return { blocks, secciones: seccionesPlanoXlsx(blocks) };
}
