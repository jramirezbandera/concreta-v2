/**
 * Disparar la descarga de un fichero generado en el cliente.
 *
 * Vivía dentro de `usePdfPreview`, que es un hook de React y está atado al flujo
 * del PDF (previsualizar y luego descargar). El Word del cuadro de materiales no
 * se puede previsualizar en el navegador, así que descarga en el mismo gesto y
 * necesitaba justo esta pieza sin el hook alrededor. Al sacarla aquí, los dos
 * caminos comparten el MISMO código —y los mismos dos bugs ya pagados: el ancla
 * conectada al DOM y el revoke diferido—, en un fichero que no importa ni jsPDF
 * ni `docx`, así que tiparse contra él no arrastra ninguna librería.
 */

/** Lo que devuelve cualquier exportador: el fichero y cómo se debe llamar. */
export interface ResultadoExport {
  blob: Blob;
  filename: string;
}

/** Margen para que el navegador lea el blob antes de que lo revoquemos. */
export const REVOKE_DELAY_MS = 1000;

/**
 * Dispara la descarga del blob con el nombre elegido por el usuario.
 *
 * El ancla DEBE estar insertada en el documento antes del `click()`: Firefox
 * (y Safari) ignoran el atributo `download` — y a veces el click entero — en
 * anclas desconectadas del DOM, y el archivo acaba con el UUID del blob.
 */
export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Crea la URL, descarga y revoca DESPUÉS, por temporizador.
 *
 * Nunca revoques en el cleanup de un efecto que dependa del estado: eso ya
 * ocurrió una vez y abortaba la descarga en el mismo tick del click (ver el
 * comentario de `liveUrl` en `usePdfPreview`).
 */
export function descargarBlob({ blob, filename }: ResultadoExport): void {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
