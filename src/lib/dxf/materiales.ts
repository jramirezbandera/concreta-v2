/**
 * Punto de entrada perezoso del .dxf del cuadro de PLANO.
 *
 * Tercer hermano de `lib/docx/materiales.ts` y `lib/xlsx/materiales.ts`, con el
 * mismo trato: el modulo lo carga con `await import()` desde el manejador del
 * boton. Aqui no hay librería que pese —el DXF se escribe a mano y no depende
 * ni de jszip—, pero el `import()` se mantiene por coherencia y porque el
 * planificador tampoco pinta nada en el arranque.
 */

import type { Block } from '../materiales/cuadros';
import { MATERIALES_FALLBACK_DXF, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { planificarDibujo, type OpcionesDxf } from './cuadro';
import { dxfBlob } from './escribir';

export async function exportarMaterialesDxf(
  blocks: Block[],
  titulo?: string,
  opciones: OpcionesDxf = {},
): Promise<ResultadoExport> {
  return {
    blob: dxfBlob(planificarDibujo(blocks, opciones)),
    filename: titledFilename(titulo ?? '', MATERIALES_FALLBACK_DXF, 'dxf'),
  };
}
