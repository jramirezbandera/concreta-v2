/**
 * El `.concreta.json` en disco. JSON plano con sangría: tiene que abrirse con
 * un editor de texto dentro de seis años. Comprimir (ZIP con `jszip`, que ya
 * es dependencia) podrá venir después sin romper nada, gracias a la cabecera.
 *
 * Y sin los PDF del anejo dentro: lo que viaja son los DATOS de cada pieza, y
 * con ellos la máquina que abre la obra rehace el papel sola (ver
 * `lib/anejo/reconstruccion`). Un fichero de aquellos días que sí los traía se
 * sigue leyendo, y entonces no hay nada que rehacer (`lib/anejo/viaje`).
 */

import { pdfsDelFichero, recuperarPdfs } from '../anejo/viaje';
import { descargarBlob } from '../export/descargar';
import { ErrorDeProyecto, validar, type ProyectoFile } from './index';

export const EXTENSION_PROYECTO = '.concreta.json';

/** El texto del fichero: la obra, sus claves y nada más. */
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

/**
 * Lee un `File` del `<input type="file">`. Lanza `ErrorDeProyecto` si no es un
 * proyecto. Si es de los que traían los PDF dentro, entran en IndexedDB por el
 * camino (ver `recuperarPdfs`: por qué aquí y no después de abrir la obra), y
 * así esa obra no tiene nada que reconstruir.
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
