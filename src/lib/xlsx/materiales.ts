/**
 * Punto de entrada perezoso del .xlsx del cuadro de PLANO.
 *
 * Hermano de `src/lib/docx/materiales.ts`, con el mismo trato: el módulo lo
 * carga con `await import()` desde el manejador del botón, así jszip y este
 * código sólo los descarga quien exporta de verdad.
 *
 * Aquí no hay librería que pese —jszip ya viaja dentro de `docx-vendor`—, pero
 * el `import()` se mantiene por coherencia con el camino del Word y porque el
 * planificador y el escritor de OOXML sí son código que no pinta en el arranque.
 */

import type { Block } from '../materiales/cuadros';
import { MATERIALES_FALLBACK_XLSX, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { planificarHoja } from './hoja';
import { escribirLibro } from './libro';

/** Una pestaña del libro. Las vacías no se emiten. */
export interface SeccionXlsx {
  nombre: string;
  blocks: Block[];
}

export async function exportarMaterialesXlsx(
  secciones: SeccionXlsx[],
  titulo?: string,
): Promise<ResultadoExport> {
  // Las pestañas llevan nombre fijo, NO el título de la obra: Excel corta los
  // nombres de hoja a 31 caracteres, y «Vivienda unifamiliar en Bormujo», sin la
  // ese, parece un error del programa. La obra ya va en el nombre del fichero y
  // en las propiedades del documento.
  const hojas = secciones
    .filter((s) => s.blocks.length > 0)
    .map((s) => planificarHoja(s.blocks, s.nombre));
  const blob = await escribirLibro(hojas, { titulo });
  return {
    blob,
    filename: titledFilename(titulo ?? '', MATERIALES_FALLBACK_XLSX, 'xlsx'),
  };
}
