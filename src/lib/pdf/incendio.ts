/**
 * El PDF de «Incendio»: la memoria maquetada, y el mismo documento que entra
 * como capítulo del anejo de cálculo.
 *
 * Calcado del de viento y nieve. El documento NUNCA se construye con
 * `new jsPDF`: `crearPdf()` es el único sitio donde se crea uno, porque es el
 * que registra la Arimo y deja de escribir cuadraditos en cuanto el texto lleva
 * una «º» o una «Ø» —y esta memoria va llena de ellas—.
 */

import type { Block } from '../memoria/model';
import { INCENDIO_FALLBACK_PDF, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { dibujarBloques } from './bloques';
import { crearPdf } from './fuente';
import { drawFootersAllPages, drawHeader } from './utils';

/** El margen del resto de documentos del capítulo. */
const M = 18;

export async function exportarIncendioPdf(
  blocks: Block[],
  titulo?: string,
): Promise<ResultadoExport> {
  const doc = await crearPdf();
  const elementTitle = (titulo ?? '').trim();

  const { contentY } = drawHeader(
    doc,
    {
      title: 'Concreta — Resistencia al fuego (DB SI 6)',
      elementTitle,
    },
    M,
  );

  dibujarBloques(doc, blocks, { M, y: contentY });

  drawFootersAllPages(doc, { proyecto: elementTitle || undefined }, M);

  return {
    blob: doc.output('blob'),
    filename: titledFilename(titulo ?? '', INCENDIO_FALLBACK_PDF, 'pdf'),
  };
}
