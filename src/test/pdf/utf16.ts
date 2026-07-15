// Helper compartido: detecta texto emitido en UTF-16 dentro de un PDF de jsPDF.
// Lo usan `latin1Encoding.dom.test.ts` (17 módulos) y `slopeStability.test.ts`
// (que necesita su propio mock de Pyodide y por eso vive aparte).
//
// Ver la cabecera de latin1Encoding.dom.test.ts para el porqué del invariante.

/** Ejecuta un exportador y devuelve el PDF crudo como cadena latin-1. */
export async function pdfBytes(run: () => Promise<unknown>): Promise<string> {
  let captured: Blob | undefined;
  const orig = URL.createObjectURL;
  URL.createObjectURL = ((b: Blob) => { captured = b; return 'blob:mock'; }) as typeof URL.createObjectURL;
  try {
    await run();
  } finally {
    URL.createObjectURL = orig;
  }
  if (!captured) throw new Error('el exportador no creó ningún blob');
  // latin1: un byte -> un char. Sin `Buffer` (no está tipado en tsconfig.app).
  const bytes = new Uint8Array(await captured.arrayBuffer());
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

const STREAM_RE = /stream\r?\n([\s\S]*?)endstream/g;
const NUL = String.fromCharCode(0);

/**
 * Rachas de texto emitidas en UTF-16, ya decodificadas (para que el fallo del
 * test diga QUÉ cadena es). Vacío = todo el PDF va en Latin-1.
 *
 * No sirve casar el literal `(...) Tj` con una regex: al codificar en UTF-16,
 * los bytes bajos de `(` y `)` (0x28/0x29) aparecen crudos dentro del literal y
 * rompen el emparejamiento de paréntesis (falsos negativos). El NUL, en cambio,
 * es inequívoco: una cadena Latin-1 legítima nunca lo lleva, y en UTF-16 es el
 * byte alto de todo carácter ASCII.
 *
 * OJO: en jsdom no se incrusta ningún SVG/PNG, así que los únicos streams son
 * los de contenido. Si algún día se incrustan imágenes en los tests, hay que
 * acotar el scan al stream de página.
 */
export function utf16Runs(pdf: string): string[] {
  const out: string[] = [];
  const runRe = new RegExp(`(?:${NUL}[\\s\\S]){3,}`, 'g');
  for (const m of pdf.matchAll(STREAM_RE)) {
    for (const run of m[1].matchAll(runRe)) {
      let s = '';
      for (let i = 1; i < run[0].length; i += 2) s += run[0][i];
      out.push(s.trim());
    }
  }
  return out;
}
