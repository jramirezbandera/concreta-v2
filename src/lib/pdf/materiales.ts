/**
 * El PDF del cuadro de materiales.
 *
 * Espejo de `lib/docx/materiales.ts`, con una diferencia de fondo respecto a
 * los otros veinte exportadores de PDF de la app: **no devuelve `PdfResult`
 * para el modal de previsualización, sino el `ResultadoExport` que descarga
 * directamente**. En un módulo de cálculo el PDF es la primera vez que ves el
 * documento; aquí las pestañas Plano y Memoria YA lo enseñan en pantalla, así
 * que abrir un modal para volver a enseñarlo sería enseñar dos veces lo mismo
 * y meter un clic de más entre el usuario y su fichero.
 *
 * El PDF es la salida de la vista de MEMORIA, junto al Word: uno para pegar en
 * la memoria del proyecto —editable, con los estilos de Word— y otro para
 * enviar, archivar o imprimir. La vista de plano tiene los suyos, Excel y DXF.
 */

import type { Block } from '../materiales/cuadros';
import { MATERIALES_FALLBACK_PDF, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { dibujarBloques } from './bloques';
import { crearPdf } from './fuente';
import { drawFootersAllPages, drawHeader } from './utils';

/** El margen del resto de documentos del capítulo. */
const M = 18;

export async function exportarMaterialesPdf(
  blocks: Block[],
  titulo?: string,
): Promise<ResultadoExport> {
  const doc = await crearPdf();
  const elementTitle = (titulo ?? '').trim();

  const { contentY } = drawHeader(
    doc,
    {
      title: 'Concreta — Cuadro de materiales (Código Estructural / DB SE-M)',
      elementTitle,
    },
    M,
  );

  dibujarBloques(doc, blocks, { M, y: contentY });

  drawFootersAllPages(doc, { proyecto: elementTitle || undefined }, M);

  return {
    blob: doc.output('blob'),
    filename: titledFilename(titulo ?? '', MATERIALES_FALLBACK_PDF, 'pdf'),
  };
}
