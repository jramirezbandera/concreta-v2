/**
 * Punto de entrada perezoso del .docx de «Incendio».
 *
 * Hermano de `vientoNieve.ts`, con el mismo trato: el módulo lo carga con
 * `await import()` desde el manejador del botón, así la librería `docx` sigue
 * en su chunk (`docx-vendor`) y no la paga quien nunca exporta a Word.
 */

import { Packer } from 'docx';
import type { Block } from '../memoria/model';
import { INCENDIO_FALLBACK_DOCX, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { documentoDeBloques } from './render';

export async function exportarIncendioDocx(blocks: Block[], titulo?: string): Promise<ResultadoExport> {
  const doc = documentoDeBloques(blocks, { titulo: titulo ?? '' });
  const blob = await Packer.toBlob(doc);
  return {
    blob,
    filename: titledFilename(titulo ?? '', INCENDIO_FALLBACK_DOCX, 'docx'),
  };
}
