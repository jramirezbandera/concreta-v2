/**
 * El `.concreta.json` en disco. JSON plano con sangría: tiene que abrirse con
 * un editor de texto dentro de seis años. Comprimir (ZIP con `jszip`, que ya
 * es dependencia) podrá venir después sin romper nada, gracias a la cabecera.
 */

import { descargarBlob } from '../export/descargar';
import { importar, type ProyectoFile } from './index';

export const EXTENSION_PROYECTO = '.concreta.json';

export function textoDeExportacion(p: ProyectoFile): string {
  return JSON.stringify(p, null, 2);
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

/** Dispara la descarga en el navegador, por el mismo camino que los PDF y los Word. */
export function descargarProyecto(p: ProyectoFile): void {
  descargarBlob({
    blob: new Blob([textoDeExportacion(p)], { type: 'application/json' }),
    filename: nombreDeFichero(p),
  });
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

/** Lee un `File` del `<input type="file">`. Lanza `ErrorDeProyecto` si no es un proyecto. */
export async function leerFicheroDeProyecto(fichero: File): Promise<ProyectoFile> {
  return importar(await textoDe(fichero));
}
