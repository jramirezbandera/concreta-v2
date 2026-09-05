/**
 * Entrada perezosa del módulo «Cargas por planta»: la tabla de cargas de la
 * memoria a .docx. La feature la importa con `import()` para que `docx` siga
 * en su chunk.
 */

import { Packer } from 'docx';
import type { Block } from '../materiales/cuadros';
import { CARGAS_PLANTA_FALLBACK_DOCX, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { documentoDeBloques } from './render';

export async function exportarCargasPlantaDocx(blocks: Block[], titulo?: string): Promise<ResultadoExport> {
  const doc = documentoDeBloques(blocks, { titulo: titulo ?? '' });
  const blob = await Packer.toBlob(doc);
  return { blob, filename: titledFilename(titulo ?? '', CARGAS_PLANTA_FALLBACK_DOCX, 'docx') };
}
