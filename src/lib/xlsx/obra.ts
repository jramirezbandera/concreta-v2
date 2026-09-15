/**
 * Punto de entrada perezoso del .xlsx CONJUNTO: los cuadros de plano de todos
 * los módulos rellenados de la obra, en un solo libro.
 *
 * Aquí no hay planificador nuevo que escribir: un libro de Excel ya era
 * multihoja —una columna tiene UN ancho, y por eso cada módulo reparte su
 * cuadro en pestañas—, así que el libro de la obra es el de cada módulo puesto
 * detrás del anterior. Las pestañas conservan el nombre que les da su módulo;
 * lo único que se añade aquí es desempatarlas si dos módulos coincidieran, y
 * recortarlas a los 31 caracteres que admite Excel.
 */

import { CUADROS_PLANO_FALLBACK_XLSX, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import type { Block } from '../memoria/model';
import { planificarHoja } from './hoja';
import { escribirLibro } from './libro';

export interface CuadroLibro {
  etiqueta: string;
  secciones: { nombre: string; blocks: Block[] }[];
}

/** Lo que Excel admite en el nombre de una pestaña. */
const MAX_NOMBRE = 31;

/**
 * Nombres de pestaña únicos y del largo que admite Excel. Un nombre repetido
 * no da error al escribir el .zip: da un libro que Excel se niega a abrir, y
 * ese fallo aparecería el día que dos módulos llamaran igual a una pestaña.
 */
function nombresUnicos(nombres: string[]): string[] {
  const vistos = new Set<string>();
  return nombres.map((bruto) => {
    const base = bruto.slice(0, MAX_NOMBRE);
    if (!vistos.has(base)) {
      vistos.add(base);
      return base;
    }
    for (let i = 2; ; i++) {
      const sufijo = ` (${i})`;
      const n = `${base.slice(0, MAX_NOMBRE - sufijo.length)}${sufijo}`;
      if (!vistos.has(n)) {
        vistos.add(n);
        return n;
      }
    }
  });
}

export async function exportarCuadrosObraXlsx(
  cuadros: CuadroLibro[],
  titulo?: string,
): Promise<ResultadoExport> {
  const secciones = cuadros.flatMap((c) => c.secciones).filter((s) => s.blocks.length > 0);
  const nombres = nombresUnicos(secciones.map((s) => s.nombre));
  const blob = await escribirLibro(
    secciones.map((s, i) => planificarHoja(s.blocks, nombres[i])),
    { titulo },
  );
  return { blob, filename: titledFilename(titulo ?? '', CUADROS_PLANO_FALLBACK_XLSX, 'xlsx') };
}
