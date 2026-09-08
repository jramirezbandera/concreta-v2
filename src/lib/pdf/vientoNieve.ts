/**
 * El PDF de la memoria de «Viento y nieve».
 *
 * Tercero de la familia de `materiales.ts` y `cargasPlanta.ts`: la vista de
 * MEMORIA compuesta como `Block[]` (`lib/acciones/cuadros.ts`) y dibujada por
 * el renderer de bloques, sin previsualización. Devuelve el `ResultadoExport`
 * que descarga directamente, como sus dos hermanos.
 *
 * Hasta el anejo el módulo sólo salía a Word y a Excel. Es uno de los cinco
 * capítulos de la MEMORIA JUSTIFICATIVA del anejo de cálculo, y el anejo se
 * compone de PDF: sin este fichero no había capítulo (design doc, F4).
 */

import type { Block } from '../materiales/cuadros';
import { VIENTO_NIEVE_FALLBACK_PDF, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { dibujarBloques } from './bloques';
import { crearPdf } from './fuente';
import { drawFootersAllPages, drawHeader } from './utils';

/** El margen del resto de documentos del capítulo. */
const M = 18;

export async function exportarVientoNievePdf(
  blocks: Block[],
  titulo?: string,
): Promise<ResultadoExport> {
  const doc = await crearPdf();
  const elementTitle = (titulo ?? '').trim();

  const { contentY } = drawHeader(
    doc,
    {
      title: 'Concreta — Viento y nieve (DB SE-AE)',
      elementTitle,
    },
    M,
  );

  dibujarBloques(doc, blocks, { M, y: contentY });

  drawFootersAllPages(doc, { proyecto: elementTitle || undefined }, M);

  return {
    blob: doc.output('blob'),
    filename: titledFilename(titulo ?? '', VIENTO_NIEVE_FALLBACK_PDF, 'pdf'),
  };
}
