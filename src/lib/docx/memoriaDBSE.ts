/**
 * El Word de la ficha de cumplimiento del DB SE. Gemelo de `cargasPlanta.ts`,
 * con una diferencia: el documento NO lleva título como Heading1, porque el
 * H1 «3.1. Seguridad estructural» ya viene en los bloques y es el que pega en
 * la memoria del proyecto; el título del usuario va a los metadatos del
 * fichero.
 */

import { Packer } from 'docx';
import { MEMORIA_DBSE_FALLBACK_DOCX, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import type { Block } from '../memoria/model';
import { documentoDeBloques } from './render';

export async function exportarMemoriaDBSEDocx(blocks: Block[], titulo?: string): Promise<ResultadoExport> {
  const t = (titulo ?? '').trim();
  const doc = documentoDeBloques(blocks, {
    titulo: '',
    tituloDocumento: t || 'Cumplimiento del CTE DB SE',
    asunto: 'Justificación del cumplimiento del CTE DB SE (apartado 3.1 de la memoria)',
    descripcion: 'Ficha de cumplimiento del DB SE generada con Concreta (DB SE, SE-AE, SE-C, NCSE-02, Código Estructural, SE-A, SE-F, SE-M)',
    palabrasClave: 'CTE, DB SE, seguridad estructural, memoria, NCSE-02, Código Estructural',
  });
  const blob = await Packer.toBlob(doc);
  return { blob, filename: titledFilename(t, MEMORIA_DBSE_FALLBACK_DOCX, 'docx') };
}
