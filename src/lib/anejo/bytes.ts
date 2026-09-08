/**
 * Un `Blob` a `ArrayBuffer`, con el camino viejo por si `Blob.arrayBuffer()`
 * no existe (jsdom hasta hace poco, Safari antiguo). Lo usan el almacén de
 * blobs, que guarda bytes y no blobs, y la concatenación, que se los da a
 * `pdf-lib`.
 */
/**
 * El `Blob` que hay detrás de una URL `blob:`. Los veinte exportadores con
 * previsualización devuelven `blobUrl` (lo que necesita el iframe), no el
 * blob; para guardar la pieza hay que recuperarlo, y `fetch` sabe leer una
 * URL `blob:` del mismo documento.
 */
export async function blobDeUrl(url: string): Promise<Blob> {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`No se pudo leer el PDF (${respuesta.status})`);
  return respuesta.blob();
}

export function bytesDe(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result as ArrayBuffer);
    lector.onerror = () => rechazar(lector.error ?? new Error('No se pudo leer el fichero'));
    lector.readAsArrayBuffer(blob);
  });
}
