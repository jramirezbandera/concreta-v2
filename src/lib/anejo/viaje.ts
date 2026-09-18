/**
 * Los PDF del anejo, dentro del `.concreta`.
 *
 * Hasta ahora los bytes no viajaban: el índice de piezas es una clave de
 * proyecto y sí iba en el fichero, pero los PDF viven en IndexedDB y se
 * quedaban en la máquina. Al reimportar la obra —otro ordenador, una copia de
 * seguridad, el mismo navegador con los datos del sitio borrados— el anejo
 * aparecía entero pero con todas sus filas en rojo: «falta el PDF guardado».
 * Y rehacerlo a mano duplicaba capítulos.
 *
 * Así que viajan. Dos cuidados que explican la forma de esto:
 *
 *  - **Sólo en el fichero, nunca en el almacén.** El `ProyectoFile` que se
 *    guarda en `localStorage` sigue sin bytes: meterlos ahí se comería la
 *    cuota del navegador con el primer anejo. El bloque `pdfs` se añade al
 *    serializar a disco y se saca al leer de disco, y en medio nadie lo ve.
 *  - **El último del JSON.** El `.concreta` tiene que poder abrirse con un
 *    editor de texto dentro de seis años, y eso lo da el principio del
 *    fichero: cabecera, obra y claves arriba, y el pegote de base64 al final,
 *    donde no estorba.
 *
 * Un fichero viejo no trae `pdfs` y se lee igual; un fichero con `pdfs` lo
 * ignora una versión vieja de la app, que es lo que hacía antes. No hace falta
 * subir la versión del contenedor.
 */

import { blobIdsDeIndice, CLAVE_ANEJO } from './index';
import { base64De, blobDeBase64, bytesDe } from './bytes';
import { guardarBlob, hayAlmacenDeBlobs, idsDeBlobs, leerBlob } from './blobs';

/** `blobId` → PDF en base64. Es lo que se añade al fichero y lo que se lee de él. */
export type PdfsDelViaje = Record<string, string>;

export interface ResumenViaje {
  /** Cuántos PDF van (o han llegado). */
  cuantos: number;
  /** Lo que ocupan, para poder decirlo. */
  bytes: number;
  /** Cuántos se quedaron fuera por no caber (los que faltaban ya no cuentan: no los tenía nadie). */
  fuera: number;
}

/**
 * Lo máximo que el fichero se lleva en PDF, ya codificado.
 *
 * Hace falta un tope porque los PDF de Concreta son grandes: los dibujos se
 * rasterizan a 3× (ver `embedSvgAsImage`), así que un cálculo de dos páginas
 * con sus figuras ronda los 4 MB en base64. Una obra de treinta piezas daría
 * un fichero de más de cien megas que hay que construir como UNA cadena en
 * memoria, y al importarlo, parsearla entera.
 *
 * Con el tope va lo que quepa, en el orden del anejo, y los que se queden
 * fuera se rehacen en un clic desde la pantalla del anejo. Mejor la mitad del
 * anejo que nada, y mejor decirlo que un fichero que no se puede abrir.
 */
export const TOPE_PDFS = 40 * 1024 * 1024;

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Los PDF que referencia el índice de este proyecto, leídos de IndexedDB y
 * codificados. Los que no estén —el anejo de una obra traída de otra máquina,
 * que tampoco los tenía— sencillamente no van: se exporta lo que hay.
 *
 * No lanza. Exportar la obra tiene que funcionar aunque el almacén de PDF esté
 * caído: entonces va el fichero de siempre, sin bloque `pdfs`.
 */
export interface Equipaje extends ResumenViaje {
  pdfs: PdfsDelViaje;
}

export async function pdfsParaViajar(claves: Record<string, string>): Promise<Equipaje> {
  const ids = blobIdsDeIndice(claves[CLAVE_ANEJO] ?? null);
  const equipaje: Equipaje = { pdfs: {}, cuantos: 0, bytes: 0, fuera: 0 };
  if (ids.length === 0 || !hayAlmacenDeBlobs()) return equipaje;
  try {
    const guardados = new Set(await idsDeBlobs());
    for (const id of ids) {
      if (!guardados.has(id) || id in equipaje.pdfs) continue;
      const blob = await leerBlob(id);
      if (!blob) continue;
      const b64 = base64De(await bytesDe(blob));
      // El que no quepa se queda, y se sigue con los demás: los siguientes
      // pueden ser más pequeños, y cada uno que entre es uno que no hay que
      // reconstruir al llegar.
      if (equipaje.bytes + b64.length > TOPE_PDFS) {
        equipaje.fuera++;
        continue;
      }
      equipaje.pdfs[id] = b64;
      equipaje.cuantos++;
      equipaje.bytes += b64.length;
    }
  } catch (e) {
    console.error('No se han podido leer los PDF del anejo para exportarlos:', e);
  }
  return equipaje;
}

/** El bloque `pdfs` de un fichero ya parseado, o `null` si no lo trae. */
export function pdfsDelFichero(bruto: unknown): PdfsDelViaje | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const crudo = (bruto as Record<string, unknown>).pdfs;
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) return null;
  const pdfs: PdfsDelViaje = {};
  for (const [id, valor] of Object.entries(crudo)) if (esTexto(valor)) pdfs[id] = valor;
  return Object.keys(pdfs).length > 0 ? pdfs : null;
}

/**
 * Mete en IndexedDB los PDF que traía el fichero y cuenta cuántos entraron.
 *
 * Se escriben al LEER el fichero, antes de que el usuario confirme que quiere
 * abrir esa obra. Si al final no la abre, sus PDF se quedan sin que ningún
 * índice los referencie y los recoge la purga del siguiente arranque
 * (`purgarBlobsHuerfanos`), que es exactamente para lo que está. Al revés
 * —escribirlos después de desplegar— habría que arrastrarlos por toda la
 * pantalla de abrir obra, y un fallo a mitad dejaría la obra puesta y los PDF
 * en el limbo.
 *
 * No lanza: sin sitio o sin IndexedDB, la obra se abre igual y sus filas salen
 * en rojo con el botón de reconstruir, que es donde estábamos antes.
 */
export async function recuperarPdfs(pdfs: PdfsDelViaje | null): Promise<ResumenViaje> {
  const resumen: ResumenViaje = { cuantos: 0, bytes: 0, fuera: 0 };
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

