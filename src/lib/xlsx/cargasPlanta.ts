/**
 * Entrada perezosa del módulo «Cargas por planta»: el cuadro de acciones del
 * plano a .xlsx, una pestaña por sección (cargas por planta, cargas lineales,
 * predimensionado, acciones horizontales). Las pestañas llevan nombre fijo,
 * nunca el título del proyecto.
 */

import { CARGAS_PLANTA_FALLBACK_XLSX, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { planificarHoja } from './hoja';
import { escribirLibro } from './libro';
import type { SeccionXlsx } from './materiales';

export async function exportarCargasPlantaXlsx(secciones: SeccionXlsx[], titulo?: string): Promise<ResultadoExport> {
  const hojas = secciones.filter((s) => s.blocks.length > 0).map((s) => planificarHoja(s.blocks, s.nombre));
  const blob = await escribirLibro(hojas, { titulo });
  return { blob, filename: titledFilename(titulo ?? '', CARGAS_PLANTA_FALLBACK_XLSX, 'xlsx') };
}
