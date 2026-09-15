/**
 * Punto de entrada perezoso del .dxf del cuadro de acciones del PLANO de
 * «Viento y nieve».
 *
 * Cuarto hermano de `materiales.ts`, `cargasPlanta.ts` e `incendio.ts`: el
 * mismo planificador y el mismo escritor, y sólo cambia el nombre por defecto
 * del fichero. Llegó el último —el módulo sólo sacaba Excel del cuadro de
 * plano— con la exportación conjunta de la obra, que junta los cuatro cuadros
 * en un DXF y no podía dejar fuera al viento por un formato que faltaba.
 *
 * Lo que se dibuja es el cuadro del plano entero, con la cabecera de zonas: en
 * un plano, la zona eólica y la invernal son parte de lo que se rotula, no un
 * dato de trabajo.
 */

import type { Block } from '../materiales/cuadros';
import { VIENTO_NIEVE_FALLBACK_DXF, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { planificarDibujo, type OpcionesDxf } from './cuadro';
import { dxfBlob } from './escribir';

export async function exportarVientoNieveDxf(
  blocks: Block[],
  titulo?: string,
  opciones: OpcionesDxf = {},
): Promise<ResultadoExport> {
  return {
    blob: dxfBlob(planificarDibujo(blocks, opciones)),
    filename: titledFilename(titulo ?? '', VIENTO_NIEVE_FALLBACK_DXF, 'dxf'),
  };
}
