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

// ── base64, para los PDF que viajan dentro del .concreta ─────────────────────
//
// En trozos: `String.fromCharCode(...bytes)` con un PDF de 300 KB pasa 300.000
// argumentos de golpe y revienta la pila del intérprete. 8 KB por vuelta es de
// sobra rápido y no se acerca a ningún límite.

const TROZO = 8192;

export function base64De(bytes: ArrayBuffer): string {
  const vista = new Uint8Array(bytes);
  let texto = '';
  for (let i = 0; i < vista.length; i += TROZO) {
    texto += String.fromCharCode(...vista.subarray(i, i + TROZO));
  }
  return btoa(texto);
}

/** El `Blob` de un base64, o `null` si el texto no lo es. Lo que entra viene de un fichero ajeno. */
export function blobDeBase64(b64: string, tipo = 'application/pdf'): Blob | null {
  let binario: string;
  try {
    binario = atob(b64);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}
