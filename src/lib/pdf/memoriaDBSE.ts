/**
 * El PDF de la ficha de cumplimiento del DB SE. Gemelo de `cargasPlanta.ts`:
 * descarga directa (`ResultadoExport`), sin el modal de previsualización de
 * los módulos de cálculo, porque aquí el formulario ya enseña lo que se va a
 * imprimir. Unas veintiséis páginas de tablas: `dibujarBloques` pagina con la
 * tabla entera a la vista (`keepTogether`), así que ningún cuadro corto sale
 * partido entre dos páginas.
 */

import { MEMORIA_DBSE_FALLBACK_PDF, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import type { Block } from '../memoria/model';
import { dibujarBloques } from './bloques';
import { crearPdf } from './fuente';
import { drawFootersAllPages, drawHeader } from './utils';

/** El margen del resto de documentos del capítulo. */
const M = 18;

export async function exportarMemoriaDBSEPdf(blocks: Block[], titulo?: string): Promise<ResultadoExport> {
  const doc = await crearPdf();
  const elementTitle = (titulo ?? '').trim();
  const { contentY } = drawHeader(doc, { title: 'Concreta — Cumplimiento del CTE DB SE (memoria 3.1)', elementTitle }, M);
  dibujarBloques(doc, blocks, { M, y: contentY });
  drawFootersAllPages(doc, { proyecto: elementTitle || undefined }, M);
  return { blob: doc.output('blob'), filename: titledFilename(elementTitle, MEMORIA_DBSE_FALLBACK_PDF, 'pdf') };
}
