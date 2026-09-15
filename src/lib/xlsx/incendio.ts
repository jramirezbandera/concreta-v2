/**
 * Entrada perezosa del .xlsx de «Incendio»: el cuadro de resistencia al fuego
 * del plano, para capturarlo y pegarlo.
 *
 * Una sola pestaña, a diferencia de la de cargas por planta. Allí las pestañas
 * existen porque los rótulos largos de las acciones horizontales estirarían la
 * columna de valores de las plantas si compartieran hoja; aquí las dos tablas
 * —exigencias y protecciones— tienen la misma forma (un ámbito, una R) y el
 * cuadro se captura de una vez, que es justo lo que se quiere.
 */

import type { Block } from '../memoria/model';
import { INCENDIO_FALLBACK_XLSX, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { planificarHoja } from './hoja';
import { escribirLibro } from './libro';

export async function exportarIncendioXlsx(blocks: Block[], titulo?: string): Promise<ResultadoExport> {
  const blob = await escribirLibro([planificarHoja(blocks, 'Resistencia al fuego')], { titulo });
  return { blob, filename: titledFilename(titulo ?? '', INCENDIO_FALLBACK_XLSX, 'xlsx') };
}
