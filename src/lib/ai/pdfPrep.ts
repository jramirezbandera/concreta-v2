/**
 * Leer un PDF en el navegador con pdf.js: el texto de cada página y, si el
 * informe está escaneado, algunas páginas como imágenes JPEG. Sin React y sin
 * red: el PDF no sale del navegador; lo que viaja al proveedor de IA es el
 * texto (o las imágenes) que decide quien llama.
 *
 * pdf.js se carga con dynamic import para que quede en el chunk
 * `pdfjs-vendor` (ver vite.config.ts), fuera del arranque y del precache. El
 * worker va como asset propio (`?url`): sin él pdf.js parsea en el hilo
 * principal y la pestaña se congela con un informe de 200 páginas.
 *
 * `textoDeItems` y `extraerTextos` valen también en Node (el test en vivo
 * contra informes reales carga la build `legacy` de pdf.js y las reutiliza).
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { AiImageAttachment } from './types';

/** Por encima de esto no se intenta ni abrir: un geotécnico normal son 5-25 MB. */
export const MAX_PDF_BYTES = 80 * 1024 * 1024;
/** Lado mayor de las páginas que se mandan como imagen; el texto de un informe se lee bien a 1600 px. */
export const MAX_LADO_PX = 1600;

export interface PaginaTexto {
  /** Número de página, desde 1. */
  n: number;
  texto: string;
}

export interface PdfAbierto {
  nombre: string;
  bytes: number;
  paginas: number;
  textos: PaginaTexto[];
  /** Las páginas pedidas (desde 1) como JPEG base64, para el informe escaneado. */
  imagenes: (numeros: number[]) => Promise<AiImageAttachment[]>;
  /** Libera el documento. */
  cerrar: () => void;
}

/** Sí cuando el fichero es un PDF: por tipo o, si el navegador no lo sabe, por extensión. */
export const esPdf = (file: { type: string; name: string }): boolean => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** Los trozos de texto de una página de pdf.js, en una cadena: espacio entre trozos y salto donde pdf.js lo marca. */
export function textoDeItems(items: readonly { str?: string; hasEOL?: boolean }[]): string {
  let out = '';
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    out += it.str;
    out += it.hasEOL ? '\n' : ' ';
  }
  return out;
}

/** El texto de cada página del documento, en orden. */
export async function extraerTextos(doc: PDFDocumentProxy): Promise<PaginaTexto[]> {
  const out: PaginaTexto[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const contenido = await page.getTextContent();
    out.push({ n, texto: textoDeItems(contenido.items as readonly { str?: string; hasEOL?: boolean }[]) });
    page.cleanup();
  }
  return out;
}

interface Abierto {
  doc: PDFDocumentProxy;
  /** Lo que libera el documento y su worker: en pdf.js 6 se destruye la tarea de carga, no el documento. */
  cerrar: () => void;
}

async function abrir(file: File): Promise<Abierto> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const tarea = pdfjs.getDocument({ data });
  const doc = await tarea.promise;
  return {
    doc,
    cerrar: () => {
      void tarea.destroy();
    },
  };
}

/**
 * Abre el PDF y saca el texto de todas sus páginas. Lanza con un mensaje
 * legible si no es un PDF, si pesa demasiado o si pdf.js no puede con él
 * (cifrado, corrupto).
 */
export async function leerPdf(file: File): Promise<PdfAbierto> {
  if (!esPdf(file)) throw new Error('El fichero no es un PDF.');
  if (file.size > MAX_PDF_BYTES) throw new Error(`El PDF pesa ${(file.size / 1024 / 1024).toFixed(0)} MB; el máximo son ${MAX_PDF_BYTES / 1024 / 1024} MB.`);
  let abierto: Abierto;
  try {
    abierto = await abrir(file);
  } catch (err) {
    const detalle = err instanceof Error && err.name === 'PasswordException' ? 'está protegido con contraseña' : 'no se ha podido abrir (¿está dañado?)';
    throw new Error(`El PDF ${detalle}.`);
  }
  const { doc, cerrar } = abierto;
  const textos = await extraerTextos(doc);
  return {
    nombre: file.name,
    bytes: file.size,
    paginas: doc.numPages,
    textos,
    imagenes: (numeros) => renderizar(doc, numeros),
    cerrar,
  };
}

/** Las páginas pedidas como JPEG (calidad 0,8, lado mayor `MAX_LADO_PX`), en el orden pedido. */
async function renderizar(doc: PDFDocumentProxy, numeros: number[]): Promise<AiImageAttachment[]> {
  const out: AiImageAttachment[] = [];
  for (const n of numeros) {
    if (n < 1 || n > doc.numPages) continue;
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_LADO_PX / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    out.push({ data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' });
    page.cleanup();
  }
  return out;
}
