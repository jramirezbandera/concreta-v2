/**
 * Punto de entrada perezoso del .dxf del cuadro de acciones del PLANO.
 *
 * Hermano de `lib/dxf/materiales.ts`: el mismo planificador y el mismo escritor,
 * y sólo cambia el nombre por defecto del fichero. Lo que se dibuja son los
 * bloques del plano enteros —acciones gravitatorias planta a planta, cargas
 * lineales y acciones horizontales—, sin el predimensionado: Gd/Qd/qd son
 * números de trabajo, van en su pestaña del Excel y no se rotulan en un plano.
 *
 * Aquí no hay librería que pese —el DXF se escribe a mano y no depende ni de
 * jszip—, pero el `import()` del módulo se mantiene por coherencia con las
 * otras tres salidas.
 */

import type { Block } from '../materiales/cuadros';
import { CARGAS_PLANTA_FALLBACK_DXF, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { planificarDibujo, type OpcionesDxf } from './cuadro';
import { dxfBlob } from './escribir';

export async function exportarCargasPlantaDxf(
  blocks: Block[],
  titulo?: string,
  opciones: OpcionesDxf = {},
): Promise<ResultadoExport> {
  return {
    blob: dxfBlob(planificarDibujo(blocks, opciones)),
    filename: titledFilename(titulo ?? '', CARGAS_PLANTA_FALLBACK_DXF, 'dxf'),
  };
}
