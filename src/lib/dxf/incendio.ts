/**
 * Punto de entrada perezoso del .dxf del cuadro de resistencia al fuego.
 *
 * Hermano de `lib/dxf/cargasPlanta.ts`: el mismo planificador y el mismo
 * escritor, y sólo cambia el nombre por defecto del fichero. Lo que se dibuja
 * es el cuadro del plano entero, protecciones incluidas: en un plano, un
 * revestimiento que no está rotulado no se ejecuta.
 */

import type { Block } from '../memoria/model';
import { INCENDIO_FALLBACK_DXF, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { planificarDibujo, type OpcionesDxf } from './cuadro';
import { dxfBlob } from './escribir';

export async function exportarIncendioDxf(
  blocks: Block[],
  titulo?: string,
  opciones: OpcionesDxf = {},
): Promise<ResultadoExport> {
  return {
    blob: dxfBlob(planificarDibujo(blocks, opciones)),
    filename: titledFilename(titulo ?? '', INCENDIO_FALLBACK_DXF, 'dxf'),
  };
}
