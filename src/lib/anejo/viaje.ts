/**
 * Los PDF del anejo y el `.concreta`: hoy sólo a la vuelta.
 *
 * Durante unos días viajaron dentro del fichero (bloque `pdfs`, base64, con un
 * tope de 40 MB). Resolvía lo que había que resolver —reimportar una obra
 * dejaba el anejo entero en rojo— pero al precio equivocado: un JSON que se
 * abre con un editor de texto no debería pesar megas, y el fichero se
 * construía y se parseaba como UNA cadena en memoria.
 *
 * Lo que viaja de verdad son los DATOS, que ya iban: cada pieza lleva dentro
 * las claves de su módulo. Con eso el PDF se puede rehacer en la máquina que
 * abre la obra, y eso es lo que hace ahora la app, sola, nada más abrirla (ver
 * `lib/anejo/reconstruccion`). El fichero vuelve a pesar lo que pesa el texto.
 *
 * Queda AQUÍ el camino de vuelta, y sólo ese: un `.concreta` exportado entre
 * el 18 y el 23 de septiembre de 2026 sí trae sus PDF, y leerlos es gratis
 * —entran en IndexedDB y no hay nada que reconstruir—. Un fichero sin `pdfs`
 * se lee igual que siempre.
 */

import { blobDeBase64 } from './bytes';
import { guardarBlob, hayAlmacenDeBlobs } from './blobs';

/** `blobId` → PDF en base64, tal como lo traen los ficheros de aquellos días. */
export type PdfsDelViaje = Record<string, string>;

export interface ResumenViaje {
  /** Cuántos PDF han llegado. */
  cuantos: number;
  /** Lo que ocupan, para poder decirlo. */
  bytes: number;
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** El bloque `pdfs` de un fichero ya parseado, o `null` si no lo trae (lo normal). */
export function pdfsDelFichero(bruto: unknown): PdfsDelViaje | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const crudo = (bruto as Record<string, unknown>).pdfs;
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) return null;
  const pdfs: PdfsDelViaje = {};
  for (const [id, valor] of Object.entries(crudo)) if (esTexto(valor)) pdfs[id] = valor;
  return Object.keys(pdfs).length > 0 ? pdfs : null;
}

/**
 * Mete en IndexedDB los PDF que traía un fichero antiguo y cuenta cuántos
 * entraron.
 *
 * Se escriben al LEER el fichero, antes de que el usuario confirme que quiere
 * abrir esa obra. Si al final no la abre, sus PDF se quedan sin que ningún
 * índice los referencie y los recoge la purga del siguiente arranque
 * (`purgarBlobsHuerfanos`), que es exactamente para lo que está. Al revés
 * —escribirlos después de desplegar— habría que arrastrarlos por toda la
 * pantalla de abrir obra, y un fallo a mitad dejaría la obra puesta y los PDF
 * en el limbo.
 *
 * No lanza: sin sitio o sin IndexedDB, la obra se abre igual y sus capítulos
 * se rehacen como los de cualquier otro fichero.
 */
export async function recuperarPdfs(pdfs: PdfsDelViaje | null): Promise<ResumenViaje> {
  const resumen: ResumenViaje = { cuantos: 0, bytes: 0 };
  if (!pdfs || !hayAlmacenDeBlobs()) return resumen;
  for (const [id, b64] of Object.entries(pdfs)) {
    const blob = blobDeBase64(b64);
    if (!blob) continue;
    try {
      await guardarBlob(id, blob);
      resumen.cuantos++;
      resumen.bytes += blob.size;
    } catch (e) {
      console.error(`No se ha podido guardar el PDF ${id} del fichero:`, e);
    }
  }
  return resumen;
}
