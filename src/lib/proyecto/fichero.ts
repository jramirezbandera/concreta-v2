/**
 * El `.concreta.json` en disco. JSON plano con sangría: tiene que abrirse con
 * un editor de texto dentro de seis años. Comprimir (ZIP con `jszip`, que ya
 * es dependencia) podrá venir después sin romper nada, gracias a la cabecera.
 *
 * Y con los PDF del anejo dentro, al final del todo (ver `lib/anejo/viaje`):
 * el índice de piezas viajaba desde el principio y los bytes no, así que la
 * obra reimportada traía el anejo entero y en rojo. Aquí es donde se meten y
 * donde se sacan; el proyecto que vive en el navegador sigue sin ellos.
 */

import { pdfsDelFichero, pdfsParaViajar, recuperarPdfs, type ResumenViaje } from '../anejo/viaje';
import { descargarBlob } from '../export/descargar';
import { ErrorDeProyecto, validar, type ProyectoFile } from './index';

export const EXTENSION_PROYECTO = '.concreta.json';

/**
 * El texto del fichero. Los PDF van en `pdfs`, y van los ÚLTIMOS: lo que se
 * lee de un vistazo —cabecera, obra, claves— se queda arriba, y el base64
 * detrás. Sin PDF, el fichero es exactamente el de antes.
 */
export function textoDeExportacion(p: ProyectoFile, pdfs: Record<string, string> = {}): string {
  return JSON.stringify(Object.keys(pdfs).length > 0 ? { ...p, pdfs } : p, null, 2);
}

/** «Reposición de nave industrial» → `reposicion-de-nave-industrial.concreta.json`. */
export function nombreDeFichero(p: ProyectoFile): string {
  const base = p.nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'proyecto'}${EXTENSION_PROYECTO}`;
}

/**
 * Dispara la descarga en el navegador, por el mismo camino que los PDF y los
 * Word, y devuelve cuántos PDF del anejo se ha llevado (el menú lo dice en su
 * aviso: un fichero de 4 MB donde antes había 40 KB se explica solo si se
 * cuenta por qué).
 */
export async function descargarProyecto(p: ProyectoFile): Promise<ResumenViaje> {
  const { pdfs, ...resumen } = await pdfsParaViajar(p.claves);
  descargarBlob({
    blob: new Blob([textoDeExportacion(p, pdfs)], { type: 'application/json' }),
    filename: nombreDeFichero(p),
  });
  return resumen;
}

function textoDe(fichero: File): Promise<string> {
  if (typeof fichero.text === 'function') return fichero.text();
  // Navegadores (y jsdom) sin Blob.text(): el camino clásico.
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result ?? ''));
    lector.onerror = () => reject(lector.error ?? new Error('No se ha podido leer el fichero'));
    lector.readAsText(fichero);
  });
}

/**
 * Lee un `File` del `<input type="file">`. Lanza `ErrorDeProyecto` si no es un
 * proyecto. Los PDF que traiga entran en IndexedDB por el camino (ver
 * `recuperarPdfs`: por qué aquí y no después de abrir la obra).
 *
 * Se parsea UNA vez y se valida con `validar`, en vez de llamar a `importar`,
 * porque el bloque `pdfs` no es parte del proyecto —`validar` lo descarta, y
 * así debe ser— y hay que leerlo del JSON crudo antes de que se pierda.
 */
export async function leerFicheroDeProyecto(fichero: File): Promise<ProyectoFile> {
  const texto = await textoDe(fichero);
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new ErrorDeProyecto('El fichero no es JSON válido.');
  }
  const proyecto = validar(bruto);
  await recuperarPdfs(pdfsDelFichero(bruto));
  return proyecto;
}
