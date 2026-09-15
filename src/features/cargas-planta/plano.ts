/**
 * El cuadro de acciones del PLANO de «Cargas por planta», sin React.
 *
 * Hermano de `features/materiales/plano.ts`, y por la misma razón: la
 * exportación conjunta de la obra (`lib/plano/obra.ts`) junta los cuadros de
 * los cuatro módulos sin abrir ninguno, y necesita ensamblar éste igual que lo
 * ensambla el módulo. Aquí el ensamblado es de una línea —lo gordo vive en
 * `lib/acciones/cuadrosCargas.ts`, que ya es puro—; lo que se comparte de
 * verdad son las DOS publicaciones ajenas que el cuadro cita, el viento y el
 * sismo, cuya lectura estaba escrita dentro del módulo.
 */

import { cuadroAccionesPlanoCargas, cuadroPredimensionado, seccionesCargasXlsx, type ResumenVientoPlano } from '../../lib/acciones/cuadrosCargas';
import type { Block } from '../../lib/materiales/cuadros';
import { leerPublicacion } from '../../lib/pub';
import { MODULO_PUB as MODULO_VIENTO_NIEVE, PUB_VERSION as PUB_VERSION_VIENTO_NIEVE, type PubVientoNieve } from '../viento-nieve/state';
import { resumenSismoPublicado } from './sismoPub';
import { cargarEstado, estaConfigurado, evaluar } from './state';

/**
 * Lo que el cuadro del plano cita del viento: de dónde sopla y con qué
 * aspereza, no las presiones. Sale del sobre de Viento y nieve; sin sobre, el
 * cuadro lo dice en vez de callarlo.
 */
export function resumenVientoPublicado(): ResumenVientoPlano | null {
  const sobre = leerPublicacion<PubVientoNieve>(MODULO_VIENTO_NIEVE, PUB_VERSION_VIENTO_NIEVE);
  const v = sobre?.datos?.viento;
  if (!v) return null;
  return { zonaEolica: v.zonaEolica, vb: v.vb, aspereza: v.aspereza };
}

/**
 * El cuadro de plano de lo que hay GUARDADO, y las pestañas de su Excel.
 * `null` cuando el módulo sigue con los valores de partida o con el caso de
 * ejemplo: ni uno ni otro son las cargas de esta obra.
 */
export function cuadroDePlanoGuardado(): { blocks: Block[]; secciones: { nombre: string; blocks: Block[] }[] } | null {
  const state = cargarEstado();
  if (!estaConfigurado(state)) return null;
  const ev = evaluar(state);
  const blocks = cuadroAccionesPlanoCargas(
    ev.resultado,
    resumenVientoPublicado(),
    resumenSismoPublicado(state.emplazamiento.provincia),
  );
  return { blocks, secciones: seccionesCargasXlsx(blocks, cuadroPredimensionado(ev.resultado)) };
}
