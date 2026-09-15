/**
 * Punto de entrada perezoso del .dxf CONJUNTO: los cuadros de plano de todos
 * los módulos rellenados de la obra, en un solo fichero.
 *
 * Quinto hermano de `materiales.ts` y compañía, y el único que no es de un
 * módulo: se pide desde el panel de la obra. El escritor es el mismo; lo que
 * cambia es el planificador, que aquí reparte los cuadros en columnas
 * (`conjunto.ts`) en vez de apilarlos.
 */

import { CUADROS_PLANO_FALLBACK_DXF, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { planificarConjunto, type CuadroConjunto } from './conjunto';
import type { OpcionesDxf } from './cuadro';
import { dxfBlob } from './escribir';

export async function exportarCuadrosObraDxf(
  cuadros: CuadroConjunto[],
  titulo?: string,
  opciones: OpcionesDxf = {},
): Promise<ResultadoExport> {
  return {
    blob: dxfBlob(planificarConjunto(cuadros, opciones)),
    filename: titledFilename(titulo ?? '', CUADROS_PLANO_FALLBACK_DXF, 'dxf'),
  };
}
