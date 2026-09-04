/**
 * Punto de entrada perezoso del .docx del cuadro de materiales.
 *
 * Espejo de la convención `src/lib/pdf/<módulo>.ts`: el módulo de React llama a
 * esto con `await import()` desde el manejador del botón, de modo que la
 * librería `docx` vive en su propio chunk (`docx-vendor`, ver `vite.config.ts`)
 * y no la paga quien nunca exporta a Word.
 *
 * Por eso el nombre de archivo por defecto NO se declara aquí sino en
 * `lib/export/filename.ts`: lo necesita el `TitlePromptModal` para pintar la
 * línea de previsualización, y una importación estática desde la UI arrastraría
 * media librería al chunk del módulo y mataría la carga perezosa.
 */

import { Packer } from 'docx';
import type { Block } from '../materiales/cuadros';
import { MATERIALES_FALLBACK_FILENAME, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { documentoDeBloques } from './render';

export async function exportarMaterialesDocx(
  blocks: Block[],
  titulo?: string,
): Promise<ResultadoExport> {
  const doc = documentoDeBloques(blocks, { titulo: titulo ?? '' });
  const blob = await Packer.toBlob(doc);
  return {
    blob,
    filename: titledFilename(titulo ?? '', MATERIALES_FALLBACK_FILENAME, 'docx'),
  };
}
