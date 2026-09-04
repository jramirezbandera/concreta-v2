/**
 * Punto de entrada perezoso del .docx de «Viento y nieve»: la vista MEMORIA.
 *
 * Hermano de `materiales.ts`, con el mismo trato: el módulo lo carga con
 * `await import()` desde el manejador del botón, así la librería `docx` sigue
 * en su chunk (`docx-vendor`) y no la paga quien nunca exporta a Word. El
 * nombre por defecto vive en `lib/export/filename.ts` por el mismo motivo.
 */

import { Packer } from 'docx';
import type { Block } from '../materiales/cuadros';
import { VIENTO_NIEVE_FALLBACK_DOCX, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { documentoDeBloques } from './render';

export async function exportarVientoNieveDocx(blocks: Block[], titulo?: string): Promise<ResultadoExport> {
  const doc = documentoDeBloques(blocks, { titulo: titulo ?? '' });
  const blob = await Packer.toBlob(doc);
  return {
    blob,
    filename: titledFilename(titulo ?? '', VIENTO_NIEVE_FALLBACK_DOCX, 'docx'),
  };
}
