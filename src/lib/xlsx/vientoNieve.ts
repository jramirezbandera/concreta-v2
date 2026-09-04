/**
 * Punto de entrada perezoso del .xlsx de «Viento y nieve»: la vista PLANO.
 *
 * Hermano de `materiales.ts`. Las pestañas las decide `seccionesPlanoXlsx`
 * (en `lib/acciones/cuadros.ts`, puro y testeable): el bloque de viento, la
 * fuerza por planta y el bloque de nieve, cada uno en la suya, porque una
 * columna de Excel tiene UN ancho y la columna de valores del bloque de
 * viento («IV (zona urbana, industrial o forestal)») dejaría la columna «z (m)»
 * de la tabla de fuerzas estirada.
 */

import type { Block } from '../materiales/cuadros';
import { VIENTO_NIEVE_FALLBACK_XLSX, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { planificarHoja } from './hoja';
import { escribirLibro } from './libro';
import type { SeccionXlsx } from './materiales';

export async function exportarVientoNieveXlsx(secciones: SeccionXlsx[], titulo?: string): Promise<ResultadoExport> {
  const hojas = secciones.filter((s) => s.blocks.length > 0).map((s) => planificarHoja(s.blocks, s.nombre));
  const blob = await escribirLibro(hojas, { titulo });
  return {
    blob,
    filename: titledFilename(titulo ?? '', VIENTO_NIEVE_FALLBACK_XLSX, 'xlsx'),
  };
}

export type { Block };
