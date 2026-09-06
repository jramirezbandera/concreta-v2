// Helper compartido: mira cómo está escrito el texto dentro de un PDF de jsPDF.
// Lo usan `unicodeEncoding.dom.test.ts` (18 módulos) y `slopeStability.test.ts`
// (que necesita su propio mock de Pyodide y por eso vive aparte).
//
// Ver la cabecera de unicodeEncoding.dom.test.ts para el porqué del invariante.

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
 * Sólo los streams de CONTENIDO, reconocidos por llevar un operador `Tf`.
 *
 * Desde que los PDF embeben la fuente (ver `lib/pdf/fuente.ts`) hay también
 * streams de FontFile2 con el TTF entero dentro, y un TTF está lleno de NUL:
 * escanearlos disparaba el detector de UTF-16 en los 18 módulos a la vez.
 */
function streamsDeContenido(pdf: string): string[] {
  const out: string[] = [];
  for (const m of pdf.matchAll(STREAM_RE)) if (m[1].includes(' Tf')) out.push(m[1]);
  return out;
}

/**
 * Cuántas rachas de texto van escritas con una fuente EMBEBIDA. jsPDF las emite
 * como identificadores de glifo en hexadecimal, `<0025004600...> Tj`, mientras
 * que con una fuente core escribe el literal `(texto) Tj`. Cero rachas en un
 * PDF con texto significa que alguien ha construido el documento sin pasar por
 * `crearPdf()` y ha vuelto a la Helvetica core.
 */
export function rachasEmbebidas(pdf: string): number {
  let n = 0;
  for (const c of streamsDeContenido(pdf)) n += [...c.matchAll(/<[0-9a-fA-F]+>\s*Tj/g)].length;
  return n;
}

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
 * El scan va acotado a los streams de contenido: los de las fuentes embebidas
 * son TTF crudos, llenos de NUL, y darían un falso positivo por documento.
 */
export function utf16Runs(pdf: string): string[] {
  const out: string[] = [];
  const runRe = new RegExp(`(?:${NUL}[\\s\\S]){3,}`, 'g');
  for (const contenido of streamsDeContenido(pdf)) {
    for (const run of contenido.matchAll(runRe)) {
      let s = '';
      for (let i = 1; i < run[0].length; i += 2) s += run[0][i];
      out.push(s.trim());
    }
  }
  return out;
}
