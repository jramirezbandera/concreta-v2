/**
 * Concatenar PDFs con `pdf-lib`, y repintar los pies con la numeración del
 * documento entero.
 *
 * jsPDF no sabe pegar documentos: dibuja. Encadenar los exportadores sobre un
 * mismo `doc` obligaba a partir 24 exportadores con firmas distintas, y aun
 * así el tercero repintaría encima de los pies de los dos primeros (16 de ellos
 * pintan su pie con su propio bucle). `pdf-lib` abre cada PDF como lo que es y
 * copia sus páginas; los exportadores no se tocan. Es JS puro, sin wasm, y va
 * en su propio chunk perezoso (`pdf-lib-vendor` en vite.config.ts): sólo lo
 * descarga quien genera un anejo o guarda una pieza sin decir sus páginas.
 *
 * Los pies: cada pieza trae el suyo («Concreta · pag. 2/4»), grabado por su
 * exportador. Un PDF no se borra, se tapa: `repintarPies` pinta una banda
 * blanca sobre los 14 mm de abajo —todos los exportadores dejan el pie entre
 * los 7 y los 10 mm y reservan 10 mm bajo el contenido (`FOOTER_RESERVE`)— y
 * escribe encima el pie del anejo con la página global. Es la «una sola pasada
 * final de pies» del design doc (F6).
 */

import { bytesDe } from './bytes';

export interface ParteAConcatenar {
  /** Lo que devuelve el error si esta parte no se puede leer: el id de la pieza. */
  id: string;
  blob: Blob;
}

export interface ParteConcatenada {
  id: string;
  /** Primera página de la parte en el documento resultante, contando desde 1. */
  desde: number;
  paginas: number;
}

export interface Concatenado {
  bytes: Uint8Array;
  paginas: number;
  partes: ParteConcatenada[];
}

export interface OpcionesConcatenar {
  /** Título del documento (metadatos del PDF). */
  titulo?: string;
  /** Se llama al terminar de copiar cada parte: la pantalla marca la fila conforme entra. */
  onParte?: (id: string, indice: number) => void;
}

/** Una parte que no se pudo leer: la pantalla pinta en rojo la fila con ese `parteId`. */
export class ErrorDeConcatenacion extends Error {
  readonly parteId: string;
  constructor(parteId: string, mensaje: string, causa?: unknown) {
    super(mensaje, causa === undefined ? undefined : { cause: causa });
    this.name = 'ErrorDeConcatenacion';
    this.parteId = parteId;
  }
}

/** El `import()` mantiene a pdf-lib en su chunk: nadie lo paga al abrir un módulo. */
function libreria() {
  return import('pdf-lib');
}

const CARGA = { ignoreEncryption: true, updateMetadata: false } as const;

/**
 * Los bytes de pdf-lib como `Blob` de PDF, sin copiarlos. El tipo de pdf-lib
 * es un `Uint8Array` genérico y TypeScript no lo admite como `BlobPart` por si
 * viniera de un `SharedArrayBuffer`; aquí viene siempre de un `ArrayBuffer`.
 */
export function blobDePdf(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Páginas de un PDF. Para rellenar `Pieza.paginas` cuando el exportador no las dice. */
export async function contarPaginas(blob: Blob): Promise<number> {
  const { PDFDocument } = await libreria();
  const doc = await PDFDocument.load(await bytesDe(blob), CARGA);
  return doc.getPageCount();
}

/**
 * Copia las páginas de cada parte, en orden, a un documento nuevo. Devuelve
 * dónde empieza cada una: es lo que necesita el índice del anejo para apuntar
 * a la página real, y lo que T8 verifica después de insertar portada e índice.
 *
 * Sin partes sale un PDF de una página en blanco: pdf-lib no escribe
 * documentos sin páginas (`paginas` lo dice). La pantalla no llama con cero
 * piezas: el botón está deshabilitado con su porqué.
 */
export async function concatenarPdfs(
  partes: readonly ParteAConcatenar[],
  opciones: OpcionesConcatenar = {},
): Promise<Concatenado> {
  const { PDFDocument } = await libreria();
  // Sin `updateMetadata`, que si no `save()` vuelve a firmar el documento como pdf-lib.
  const salida = await PDFDocument.create({ updateMetadata: false });
  const ahora = new Date();
  salida.setProducer('Concreta');
  salida.setCreator('Concreta');
  salida.setCreationDate(ahora);
  salida.setModificationDate(ahora);
  if (opciones.titulo) salida.setTitle(opciones.titulo);

  const resumen: ParteConcatenada[] = [];
  for (const [indice, parte] of partes.entries()) {
    let origen;
    try {
      origen = await PDFDocument.load(await bytesDe(parte.blob), CARGA);
    } catch (e) {
      throw new ErrorDeConcatenacion(parte.id, 'No se pudo leer el PDF guardado de esta pieza.', e);
    }
    const desde = salida.getPageCount() + 1;
    const paginas = await salida.copyPages(origen, origen.getPageIndices());
    for (const p of paginas) salida.addPage(p);
    resumen.push({ id: parte.id, desde, paginas: paginas.length });
    opciones.onParte?.(parte.id, indice);
  }

  return { bytes: await salida.save(), paginas: salida.getPageCount(), partes: resumen };
}

export interface OpcionesPies {
  /** Texto de la izquierda: «Concreta · Nave en Ávila». */
  izquierda: string;
  /** Texto de la derecha para la página `pagina` de `total`: «Anejo de cálculo · pág. 3/41». */
  derecha: (pagina: number, total: number) => string;
  /** Primera página que se repinta, contando desde 1. La portada no lleva pie. */
  desde?: number;
}

const PT_POR_MM = 72 / 25.4;
/** Alto de la banda que tapa los pies de las piezas. Ver la cabecera. */
export const BANDA_PIE_MM = 14;
/** Línea base del pie del anejo, como la de `drawFootersAllPages`. */
const Y_PIE_MM = 8;
/** Margen horizontal del pie: el de los documentos del capítulo Memorias. */
const MARGEN_MM = 18;
const CUERPO_PIE = 7.5;

/**
 * Lo que la Helvetica estándar de pdf-lib sabe escribir (WinAnsi). El pie es
 * texto nuestro —nombre de la obra y numeración—, así que basta con no romper:
 * lo que no cabe sale como «?», que se ve, en vez de una excepción que se lleva
 * el documento entero.
 */
const EXTRAS_WINANSI: ReadonlySet<string> = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function aWinAnsi(s: string): string {
  let out = '';
  for (const c of s) {
    const cp = c.codePointAt(0) ?? 0;
    out += cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) || EXTRAS_WINANSI.has(c) ? c : '?';
  }
  return out;
}

/** Tapa el pie de cada página desde `desde` y escribe el del anejo. Devuelve los bytes nuevos. */
export async function repintarPies(bytes: Uint8Array, o: OpcionesPies): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await libreria();
  const doc = await PDFDocument.load(bytes, CARGA);
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const blanco = rgb(1, 1, 1);
  const gris = rgb(140 / 255, 140 / 255, 140 / 255);
  const total = doc.getPageCount();
  const izquierda = aWinAnsi(o.izquierda);
  for (let i = Math.max(1, o.desde ?? 1); i <= total; i++) {
    const pagina = doc.getPage(i - 1);
    const { width } = pagina.getSize();
    pagina.drawRectangle({ x: 0, y: 0, width, height: BANDA_PIE_MM * PT_POR_MM, color: blanco, borderWidth: 0 });
    pagina.drawText(izquierda, { x: MARGEN_MM * PT_POR_MM, y: Y_PIE_MM * PT_POR_MM, size: CUERPO_PIE, font: fuente, color: gris });
    const derecha = aWinAnsi(o.derecha(i, total));
    const ancho = fuente.widthOfTextAtSize(derecha, CUERPO_PIE);
    pagina.drawText(derecha, { x: width - MARGEN_MM * PT_POR_MM - ancho, y: Y_PIE_MM * PT_POR_MM, size: CUERPO_PIE, font: fuente, color: gris });
  }
  return doc.save();
}
