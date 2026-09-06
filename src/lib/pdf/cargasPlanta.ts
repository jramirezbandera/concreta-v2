/**
 * El PDF de la memoria de cargas por planta.
 *
 * Gemelo de `lib/pdf/materiales.ts`, con la misma diferencia frente a los otros
 * veintiún exportadores de PDF de la app: **no devuelve `PdfResult` para el
 * modal de previsualización, sino el `ResultadoExport` que descarga**. En un
 * módulo de cálculo el PDF es la primera vez que ves el documento; aquí la
 * tabla de la pantalla ya enseña lo mismo que el papel, así que el modal sólo
 * metería un clic de más entre el usuario y su fichero.
 *
 * Es la segunda salida de la MEMORIA, junto al Word: uno para pegar en la
 * memoria del proyecto —editable, con los estilos de la plantilla ajena— y
 * otro para enviar, archivar o imprimir. El cuadro del plano tiene los suyos,
 * Excel y DXF.
 */

import type { Block } from '../materiales/cuadros';
import { CARGAS_PLANTA_FALLBACK_PDF, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { dibujarBloques } from './bloques';
import { crearPdf } from './fuente';
import { drawFootersAllPages, drawHeader } from './utils';

/** El margen del resto de documentos del capítulo. */
const M = 18;

export async function exportarCargasPlantaPdf(
  blocks: Block[],
  titulo?: string,
): Promise<ResultadoExport> {
  const doc = await crearPdf();
  const elementTitle = (titulo ?? '').trim();

  const { contentY } = drawHeader(
    doc,
    {
      title: 'Concreta — Cargas por planta (DB SE-AE)',
      elementTitle,
    },
    M,
  );

  dibujarBloques(doc, blocks, { M, y: contentY });

  drawFootersAllPages(doc, { proyecto: elementTitle || undefined }, M);

  return {
    blob: doc.output('blob'),
    filename: titledFilename(titulo ?? '', CARGAS_PLANTA_FALLBACK_PDF, 'pdf'),
  };
}
