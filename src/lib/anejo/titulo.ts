/**
 * Repintar el título dentro de un PDF ya guardado.
 *
 * Renombrar un capítulo desde el anejo tiene que cambiar el nombre en los tres
 * sitios donde se lee —la lista, el índice del documento y la primera página
 * del propio PDF—, o el anejo diría una cosa y el papel otra.
 *
 * Se puede porque el título ocupa SIEMPRE lo mismo: los dos caminos de cabecera
 * (`drawElementTitle` y `drawHeader`, en `lib/pdf/utils`) lo escriben en
 * negrita 14 con la línea base en `(m, m)` mm, y `truncateToWidth` lo corta con
 * puntos suspensivos en vez de partirlo en dos líneas. El hueco mide igual diga
 * «V-3» o diga una frase, así que tapar ese renglón y escribir otro no mueve
 * nada de lo de debajo.
 *
 * Cómo, y por qué así:
 *
 *  - **Se dibuja con jsPDF y se estampa con pdf-lib.** pdf-lib es quien sabe
 *    meter mano en un PDF hecho, pero sin `@pdf-lib/fontkit` —que no está
 *    instalado— sólo escribe en las 14 fuentes estándar, y el título saldría en
 *    otra letra que el resto de la página. jsPDF sí tiene Arimo, que es
 *    justamente la que lo escribió la primera vez. Así que la banda y el nombre
 *    nuevo se dibujan en una página suelta con jsPDF y esa página se pega
 *    encima de la primera con `drawPage`. Letra idéntica y cero dependencias
 *    nuevas.
 *  - **La geometría la lleva el PDF dentro** (`/Keywords`, ver `MARCA_TITULO`).
 *    El margen no es el mismo en todos los módulos, y una tabla espejo en el
 *    anejo se desincronizaría el día que alguien mueva un margen.
 *  - **A la derecha se reserva sitio.** En los módulos que llevan «Motor v… ·
 *    Inputs …» ese bloque va en la MISMA línea del título, pegado al margen
 *    derecho: taparlo se llevaría por delante la trazabilidad del cálculo.
 *  - **El título viejo se BORRA del contenido, no se tapa.** Tapar deja el
 *    nombre anterior en la capa de texto: invisible, pero ahí para quien
 *    seleccione, busque o le pase un lector. Un anejo que se firma no puede
 *    llevar dentro un nombre que ya no es, así que se localiza el bloque
 *    `BT…ET` que lo escribió —se le conoce por sus coordenadas, que son
 *    justamente las que declara la marca— y se quita. Si no se encuentra, NO se
 *    repinta: antes que un documento que dice una cosa y guarda otra, se dice
 *    que hay que rehacerlo desde el módulo.
 *
 * Es el hermano de `repintarPies` (`concatenar.ts`), que hace lo mismo con los
 * pies de todas las páginas cuando se monta el anejo.
 */

import { decodePDFRawStream, PDFArray, PDFName, PDFRawStream, PDFRef, type PDFDocument, type PDFPage } from 'pdf-lib';
import { MARCA_TITULO, PAGE_W } from '../pdf/utils';

/** Ancho que se le reserva al bloque «Motor v… · Inputs …», en mm. */
const RESERVA_MOTOR = 46;
/** Cuerpo y estilo del título, los de `drawElementTitle`. */
const CUERPO = 14;
/** Gris 20 sobre 255, el del título. */
const GRIS = 20;
/** Lo que la banda blanca sube sobre la línea base y baja por debajo, en mm. */
const SOBRE_LA_BASE = 5.4;
const BAJO_LA_BASE = 1.6;

export type FalloRepintado = 'sin-marca' | 'no-cabe' | 'sin-rastro';

export type ResultadoRepintado = { ok: true; bytes: Uint8Array } | { ok: false; motivo: FalloRepintado };

export interface GeometriaTitulo {
  /** Margen del módulo en mm: la línea base del título está en `(m, m)`. */
  m: number;
  /** Si la línea del título lleva el bloque «Motor v… · Inputs …» a la derecha. */
  conMotor: boolean;
}

/** La geometría que el PDF declara en `/Keywords`, o `null` si no la lleva. */
export function geometriaDe(keywords: string | undefined): GeometriaTitulo | null {
  if (!keywords) return null;
  const m = new RegExp(`${MARCA_TITULO}=(\\d+(?:\\.\\d+)?)(,motor)?`).exec(keywords);
  if (!m) return null;
  const margen = Number(m[1]);
  if (!Number.isFinite(margen) || margen <= 0) return null;
  return { m: margen, conMotor: m[2] !== undefined };
}

/**
 * El PDF con otro título en la primera página y en sus metadatos.
 *
 * Devuelve `no-cabe` cuando el título ANTERIOR era tan largo que se metía por
 * debajo del bloque de la derecha: entonces la banda no podría taparlo entero y
 * quedaría un trozo del nombre viejo asomando. Antes que entregar eso, no se
 * repinta y quien llama ofrece rehacer el PDF desde el módulo.
 */
export async function repintarTitulo(bytes: Uint8Array, titulo: string, anterior: string): Promise<ResultadoRepintado> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const geo = geometriaDe(doc.getKeywords());
  if (geo === null) return { ok: false, motivo: 'sin-marca' };

  const pagina = doc.getPage(0);
  const { width, height } = pagina.getSize();
  const { crearPdf } = await import('../pdf/fuente');
  const capa = await crearPdf({ orientation: width > height ? 'landscape' : 'portrait', unit: 'pt', format: [width, height] });

  const porMm = width / PAGE_W;
  const disponible = PAGE_W - 2 * geo.m - (geo.conMotor ? RESERVA_MOTOR : 0);
  capa.setFont('helvetica', 'bold');
  capa.setFontSize(CUERPO);
  // El de antes tiene que caber en la banda, o no se le puede tapar del todo.
  if (capa.getTextWidth(anterior) > disponible * porMm) return { ok: false, motivo: 'no-cabe' };

  capa.setFillColor(255, 255, 255);
  capa.rect((geo.m - 1) * porMm, (geo.m - SOBRE_LA_BASE) * porMm, (disponible + 1) * porMm, (SOBRE_LA_BASE + BAJO_LA_BASE) * porMm, 'F');
  capa.setTextColor(GRIS, GRIS, GRIS);
  capa.text(acortar(capa, titulo, disponible * porMm), geo.m * porMm, geo.m * porMm);

  // Fuera el viejo, ANTES de escribir el nuevo. La `y` va del revés que en
  // jsPDF: el contenido del PDF cuenta desde abajo.
  if (!borrarElTitulo(doc, pagina, geo.m * porMm, height - geo.m * porMm)) return { ok: false, motivo: 'sin-rastro' };

  const [estampa] = await doc.embedPdf(capa.output('arraybuffer'), [0]);
  pagina.drawPage(estampa, { x: 0, y: 0 });
  doc.setTitle(titulo);
  return { ok: true, bytes: await doc.save() };
}

/**
 * Quita del contenido de la página el bloque que escribió el título. `false` si
 * no lo encuentra, y entonces no se repinta nada.
 *
 * El contenido de una página puede ser un flujo o una lista de flujos, y venir
 * comprimido; `decodePDFRawStream` los deja legibles en los dos casos. Se
 * reescribe sólo el flujo donde estaba, sin comprimir —como lo dejó jsPDF—.
 */
function borrarElTitulo(doc: PDFDocument, pagina: PDFPage, x: number, y: number): boolean {
  for (const ref of flujosDe(doc, pagina)) {
    const flujo = doc.context.lookup(ref);
    if (!(flujo instanceof PDFRawStream)) continue;
    const limpio = sinElTitulo(new TextDecoder('latin1').decode(decodePDFRawStream(flujo).decode()), x, y);
    if (limpio === null) continue;
    // Se sustituye el objeto en su MISMA referencia: si la página tenía varios
    // flujos, los demás siguen donde estaban y en su orden.
    doc.context.assign(ref, doc.context.stream(limpio));
    return true;
  }
  return false;
}

/** Las referencias de los flujos de contenido de la página, sea uno o una lista. */
function flujosDe(doc: PDFDocument, pagina: PDFPage): PDFRef[] {
  const entrada = pagina.node.get(PDFName.of('Contents'));
  if (entrada instanceof PDFArray) return entrada.asArray().filter((r): r is PDFRef => r instanceof PDFRef);
  if (!(entrada instanceof PDFRef)) return [];
  const valor = doc.context.lookup(entrada);
  if (valor instanceof PDFArray) return valor.asArray().filter((r): r is PDFRef => r instanceof PDFRef);
  return [entrada];
}


/** Margen de tolerancia al comparar coordenadas del contenido, en puntos. */
const TOLERANCIA = 0.6;
/** `x y Td` seguido, dentro del mismo `BT…ET`, de un `Tj`. */
const RE_TD = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Td/;
const RE_CUERPO = /\/\w+\s+(\d+(?:\.\d+)?)\s+Tf/;

/**
 * El contenido de la página sin el bloque de texto que escribió el título, o
 * `null` si no se ha encontrado.
 *
 * Se le conoce por dónde está, no por lo que dice: con la fuente incrustada en
 * subconjunto, el texto del PDF no son letras sino números de glifo, así que
 * buscar «Viga V-3» ahí dentro no encontraría nada. Lo que sí es inconfundible
 * son sus coordenadas —la línea base en `(m, m)`, que es justo lo que declara
 * la marca— y su cuerpo de 14.
 */
function sinElTitulo(contenido: string, x: number, y: number): string | null {
  let salida = '';
  let resto = contenido;
  let quitado = false;
  for (;;) {
    const desde = resto.indexOf('BT');
    if (desde < 0) break;
    const hasta = resto.indexOf('ET', desde);
    if (hasta < 0) break;
    const fin = hasta + 2;
    const cuerpo = resto.slice(desde, fin);
    const td = RE_TD.exec(cuerpo);
    const tf = RE_CUERPO.exec(cuerpo);
    const enElSitio =
      td !== null &&
      Math.abs(Number(td[1]) - x) < TOLERANCIA &&
      Math.abs(Number(td[2]) - y) < TOLERANCIA &&
      tf !== null &&
      Math.abs(Number(tf[1]) - CUERPO) < 0.01;
    if (enElSitio && !quitado) {
      quitado = true;
      salida += resto.slice(0, desde);
    } else {
      salida += resto.slice(0, fin);
    }
    resto = resto.slice(fin);
  }
  return quitado ? salida + resto : null;
}

/** Como `truncateToWidth` de `lib/pdf/utils`, que es quien cortó el título original. */
function acortar(doc: { getTextWidth: (t: string) => number }, texto: string, maxima: number): string {
  if (doc.getTextWidth(texto) <= maxima) return texto;
  let t = texto;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxima) t = t.slice(0, -1);
  return `${t.replace(/\s+$/, '')}...`;
}
