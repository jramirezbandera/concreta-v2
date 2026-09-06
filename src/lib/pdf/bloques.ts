/**
 * `Block[]` → PDF. El cuarto renderer del mismo modelo.
 *
 * Los módulos del capítulo Memorias componen su documento como una lista de
 * bloques (`lib/materiales/cuadros.ts`) y cada formato tiene su traductor:
 * React en pantalla, `lib/docx/plan.ts` para Word, `lib/xlsx/hoja.ts` para
 * Excel, `lib/dxf/cuadro.ts` para el CAD. Éste es el de papel.
 *
 * A diferencia de los otros tres, aquí NO hay que estimar anchuras: jsPDF sabe
 * medir con la fuente que va a dibujar (`getTextWidth`), así que las columnas
 * se reparten con la medida real y no con un promedio de caracteres. Es la
 * misma razón por la que el DXF necesitó una tabla de anchos y esto no.
 *
 * Lo que sí se hereda de los otros renderers es la regla de las tablas anchas:
 * lo que no cabe se trocea repitiendo la columna 0 como etiqueta, en vez de
 * estrujar las columnas hasta que «HA-30/B/20/XC2» ocupe tres líneas.
 * `lib/docx/plan.ts` hace lo mismo, sólo que contando columnas: un .docx se
 * adapta a los márgenes de la plantilla ajena y no sabe cuántos milímetros
 * tendrá: aquí la página mide 174 mm y se puede medir de verdad.
 */

import type jsPDF from 'jspdf';
import type { Block } from '../materiales/cuadros';
import {
  FOOTER_RESERVE,
  PAGE_H,
  PAGE_W,
  drawTable,
  ensureSpace,
  measureTable,
  pdfStr,
  setGray,
  type DrawTableOpts,
  type TableCol,
} from './utils';

/** Igual que en el planificador de Word: ver la cabecera. */
const MAX_COLUMNAS = 8;

/** Cuerpo de cada cosa, en puntos. */
const CUERPO = { h1: 12, h2: 10, h3: 9, parrafo: 8.5, celda: 7.5, nota: 7 };

/** Aire ANTES de cada bloque, en mm. Un encabezado se pega a lo que titula. */
const AIRE = { h1: 6, h2: 5, h3: 4, parrafo: 3.5, tabla: 2, notas: 2.5 };

const PAD = 1.5;

/**
 * Filas que no se quedan solas a un lado de un salto de página (`keepTogether`
 * de `drawTable`). Los cuadros de este renderer son cortos —tres, cuatro, seis
 * filas— y ninguno gana nada partido: una tabla de tres filas cortada en dos y
 * una no es una tabla que sigue, es un cuadro roto. Con esto sólo se parte la
 * que no cabe entera en una página, y aun ésa deja al menos dos filas a cada
 * lado del corte.
 */
const FILAS_JUNTAS = 2;

/** Una fila de tabla es un array de celdas; las columnas van por índice. */
type Fila = string[];

export interface OpcionesBloques {
  /** Margen de página, mm. */
  M: number;
  /** y donde empieza a dibujar. */
  y: number;
}

/** Alto disponible antes de invadir la banda del pie. */
const suelo = (M: number) => PAGE_H - M - FOOTER_RESERVE;

/** Lo que cabe en una página nueva: `ensureSpace` las arranca en M + 10. */
const altoPagina = (M: number) => suelo(M) - (M + 10);

/** Alto de un texto ya repartido en líneas, con el cuerpo que esté activo. */
function altoTexto(doc: jsPDF, texto: string, ancho: number): number {
  const lineas: string[] = doc.splitTextToSize(pdfStr(texto), ancho);
  return lineas.length * doc.getFontSize() * 0.3528 * 1.15;
}

/**
 * Pide sitio para `h`, y sólo salta de página si con eso lo consigue: reservar
 * más de lo que cabe en una página vacía dejaría la página en blanco y el
 * problema igual una línea más abajo.
 */
function reservar(doc: jsPDF, y: number, h: number, M: number): number {
  return h <= altoPagina(M) ? ensureSpace(doc, y, h, M) : y;
}

/**
 * Corta el texto en líneas que quepan en `ancho` y las escribe, paginando.
 * Devuelve la `y` bajo la última línea.
 */
function parrafo(doc: jsPDF, texto: string, x: number, y: number, ancho: number, M: number): number {
  const alto = doc.getFontSize() * 0.3528 * 1.15;
  const lineas: string[] = doc.splitTextToSize(pdfStr(texto), ancho);
  for (const l of lineas) {
    y = ensureSpace(doc, y, alto, M);
    doc.text(l, x, y);
    y += alto;
  }
  return y;
}

/**
 * Lo que pide cada columna, en mm: su celda más larga —rótulo incluido, medido
 * en negrita, que es como se dibuja— más el relleno. Ninguna puede pasar del
 * 45 % del ancho útil, para que una etiqueta larga no deje a las demás sin sitio.
 */
function pedido(doc: jsPDF, cabecera: string[], filas: Fila[], util: number): number[] {
  const n = Math.max(cabecera.length, ...filas.map((f) => f.length), 1);
  const out: number[] = [];
  for (let j = 0; j < n; j++) {
    doc.setFont('helvetica', 'bold');
    let w = cabecera[j] ? doc.getTextWidth(pdfStr(cabecera[j])) : 0;
    doc.setFont('helvetica', 'normal');
    for (const f of filas) w = Math.max(w, doc.getTextWidth(pdfStr(f[j] ?? '')));
    out.push(Math.min(w + 2 * PAD, util * 0.45));
  }
  return out;
}

/**
 * Anchos definitivos: lo pedido, repartido a prorrata hasta llenar el ancho
 * útil. Si lo pedido no cabe se encoge, y por eso TODAS las columnas se
 * dibujan con `wrap`: `drawTable` trunca con puntos suspensivos lo que no lo
 * lleve, y en un cuadro de materiales un dato truncado es un dato perdido.
 */
function anchos(doc: jsPDF, cabecera: string[], filas: Fila[], util: number): number[] {
  const nat = pedido(doc, cabecera, filas, util);
  const total = nat.reduce((a, b) => a + b, 0);
  const k = util / (total || 1);
  return nat.map((w) => w * k);
}

/**
 * Trocea una tabla que no cabe a lo ancho, repitiendo la columna 0 en cada
 * trozo para que las filas se sigan pudiendo leer. Devuelve un solo trozo
 * cuando la tabla ya cabe.
 *
 * Se trocea por ANCHO MEDIDO, no por número de columnas: una página A4 tiene
 * 174 mm y da igual que sean siete columnas si sus rótulos son
 * «Características de los medios de unión». El tope de columnas se queda de
 * todos modos, para que un trozo no acabe con doce columnas de 14 mm.
 */
function trocear(
  doc: jsPDF,
  cabecera: string[],
  filas: Fila[],
  util: number,
): { head: string[]; rows: Fila[] }[] {
  const nat = pedido(doc, cabecera, filas, util);
  const n = nat.length;
  if (nat.reduce((a, b) => a + b, 0) <= util && n <= MAX_COLUMNAS) {
    return [{ head: cabecera, rows: filas }];
  }

  const trozos: { head: string[]; rows: Fila[] }[] = [];
  let j = 1;
  while (j < n) {
    const idx = [0];
    let ancho = nat[0];
    // Al menos una columna de datos por trozo aunque no quepa: encogida y
    // envuelta se lee; repartida en trozos vacíos, no.
    do {
      idx.push(j);
      ancho += nat[j];
      j++;
    } while (j < n && idx.length < MAX_COLUMNAS && ancho + nat[j] <= util);
    trozos.push({
      head: idx.map((k) => cabecera[k] ?? ''),
      rows: filas.map((f) => idx.map((k) => f[k] ?? '')),
    });
  }
  return trozos;
}

/** El rótulo gris que va ENCIMA de la tabla, como en pantalla y en el Word. */
function caption(doc: jsPDF, texto: string, x: number, y: number, ancho: number, M: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(CUERPO.nota);
  setGray(doc, 110);
  return parrafo(doc, texto, x, y, ancho, M) + 0.5;
}

/** Un trozo de tabla con sus columnas ya repartidas, listo para medir o dibujar. */
interface Trozo {
  /** El rótulo gris de este trozo, con su « (cont.)» si lo lleva. */
  texto?: string;
  cols: TableCol<Fila>[];
  rows: Fila[];
}

/**
 * Reparte una tabla en trozos que quepan a lo ancho y les da sus columnas, sin
 * dibujar nada. Separado del dibujo porque un encabezado necesita saber cuánto
 * ocupa su tabla ANTES de escribirse: si no caben juntos, el que tiene que
 * bajar de página es el encabezado, no la tabla sola.
 */
function prepararTabla(
  doc: jsPDF,
  cabecera: string[],
  filas: Fila[],
  rotulo: string | undefined,
  util: number,
  conBanda: boolean,
): Trozo[] {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(CUERPO.celda);
  return trocear(doc, cabecera, filas, util).map((trozo, i) => {
    // El «(cont.)» es lo que hace legible una tabla partida: sin él, el segundo
    // trozo parece otra tabla distinta que empieza por la misma columna.
    const texto = rotulo ? (i === 0 ? rotulo : `${rotulo} (cont.)`) : i > 0 ? '(cont.)' : undefined;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(CUERPO.celda);
    const w = anchos(doc, trozo.head, trozo.rows, util);
    const cols: TableCol<Fila>[] = w.map((ancho, j) => ({
      key: String(j),
      label: pdfStr(trozo.head[j] ?? ''),
      w: ancho,
      wrap: true,
      render: (f: Fila) => pdfStr(f[j] ?? ''),
      // La columna de etiquetas en negrita: es la que dice qué se está leyendo.
      bold: () => j === 0 && !conBanda,
    }));
    return { texto, cols, rows: trozo.rows };
  });
}

/** Las opciones con las que este renderer dibuja —y mide— todas sus tablas. */
function opcionesTabla(t: Trozo, o: OpcionesBloques, y: number, conBanda: boolean): DrawTableOpts<Fila> {
  return {
    x: o.M,
    y,
    cols: t.cols,
    rows: t.rows,
    M: o.M,
    headerRepeat: conBanda,
    headerH: conBanda ? 5 : 0,
    headerFontSize: CUERPO.celda,
    cellFontSize: CUERPO.celda,
    pad: PAD,
    keepTogether: FILAS_JUNTAS,
  };
}

/** Lo que ocupa un trozo con su aire y su rótulo: lo que hay que reservar antes de escribir el rótulo. */
function altoTrozo(doc: jsPDF, t: Trozo | undefined, o: OpcionesBloques, conBanda: boolean): number {
  if (!t) return 0;
  const util = PAGE_W - 2 * o.M;
  let h = AIRE.tabla;
  if (t.texto) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(CUERPO.nota);
    h += altoTexto(doc, t.texto, util) + 0.5;
  }
  return h + measureTable(doc, opcionesTabla(t, o, 0, conBanda)).altoTotal;
}

function tabla(
  doc: jsPDF,
  cabecera: string[],
  filas: Fila[],
  rotulo: string | undefined,
  o: OpcionesBloques,
  y: number,
  conBanda: boolean,
): number {
  const util = PAGE_W - 2 * o.M;
  const trozos = prepararTabla(doc, cabecera, filas, rotulo, util, conBanda);
  for (const t of trozos) {
    y += AIRE.tabla;
    if (t.texto) {
      // El rótulo tampoco se separa de su tabla: es un encabezado más, sólo que
      // en gris. Se reserva para los dos, y `drawTable` ya no partirá lo que
      // quepa entero (`keepTogether`). Vale para todos los trozos: un «(cont.)»
      // solo al pie de página con su tabla en la siguiente es el mismo error.
      y = reservar(doc, y, altoTrozo(doc, t, o, conBanda) - AIRE.tabla, o.M);
      y = caption(doc, t.texto, o.M, y, util, o.M);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(CUERPO.celda);
    y = drawTable(doc, opcionesTabla(t, o, y, conBanda));
  }
  return y;
}

/** Un párrafo de hasta tres líneas: el que presenta una tabla, no el que la explica. */
const LINEAS_PARRAFO_CORTO = 3;

function esParrafoCorto(doc: jsPDF, texto: string, util: number): boolean {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(CUERPO.parrafo);
  return altoTexto(doc, texto, util) <= LINEAS_PARRAFO_CORTO * CUERPO.parrafo * 0.3528 * 1.15;
}

/**
 * Lo que ocupa la cadena de bloques que va desde `desde` hasta la primera
 * tabla, pasando sólo por encabezados y párrafos cortos: es lo que tiene que
 * viajar junto. Un encabezado tiene que poder mirar hacia delante —reservar
 * sólo su línea lo deja escrito al pie de la página con su tabla en la
 * siguiente—, y «3.1.5.5. Coeficientes…» seguido de una línea de introducción
 * y su tabla es la misma cosa con un párrafo en medio. Si en cuatro bloques no
 * aparece ninguna tabla no hay nada que juntar: 0.
 */
function altoArrastrado(doc: jsPDF, blocks: Block[], desde: number, o: OpcionesBloques): number {
  const util = PAGE_W - 2 * o.M;
  let acumulado = 0;
  for (let j = desde; j < Math.min(blocks.length, desde + 4); j++) {
    const b = blocks[j];
    if (b.kind === 'table') {
      return acumulado + altoTrozo(doc, prepararTabla(doc, b.head, b.rows, b.caption, util, true)[0], o, true);
    }
    if (b.kind === 'kvTable') {
      const filas = b.rows.map(([k, v]) => [k, v]);
      return acumulado + altoTrozo(doc, prepararTabla(doc, [], filas, b.caption, util, false)[0], o, false);
    }
    if (b.kind === 'heading') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(b.level === 1 ? CUERPO.h1 : b.level === 2 ? CUERPO.h2 : CUERPO.h3);
      acumulado += (b.level === 1 ? AIRE.h1 : b.level === 2 ? AIRE.h2 : AIRE.h3) + altoTexto(doc, b.text, util);
      continue;
    }
    if (b.kind === 'paragraph' && esParrafoCorto(doc, b.text, util)) {
      acumulado += AIRE.parrafo + altoTexto(doc, b.text, util);
      continue;
    }
    return 0;
  }
  return 0;
}

export function dibujarBloques(doc: jsPDF, blocks: Block[], o: OpcionesBloques): number {
  const util = PAGE_W - 2 * o.M;
  let y = o.y;

  for (const [i, b] of blocks.entries()) {
    switch (b.kind) {
      case 'heading': {
        const cuerpo = b.level === 1 ? CUERPO.h1 : b.level === 2 ? CUERPO.h2 : CUERPO.h3;
        const aire = b.level === 1 ? AIRE.h1 : b.level === 2 ? AIRE.h2 : AIRE.h3;
        // El encabezado va con lo que titula, no con su primera línea: un
        // título solo al pie de página no titula nada, y su tabla bajando a la
        // página siguiente lo deja exactamente así. Se mide antes de escribir
        // nada, y si el conjunto no cabe en una página se conserva la reserva
        // de siempre (una línea larga y poco más).
        const arrastre = altoArrastrado(doc, blocks, i + 1, o);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(cuerpo);
        setGray(doc, 25);
        y = reservar(doc, y + aire, altoTexto(doc, b.text, util) + arrastre, o.M);
        // Y por debajo de eso, la reserva de siempre: cuando lo que sigue no es
        // una tabla (o es uno de esos cuadros que no caben en una página ni
        // solos), el encabezado aún tiene que ir con su primera línea.
        y = ensureSpace(doc, y, 14, o.M);
        y = parrafo(doc, b.text, o.M, y, util, o.M);
        break;
      }
      case 'paragraph': {
        // Un párrafo corto que presenta una tabla («…se establecen conforme al
        // capítulo 4:») va con ella, como un encabezado: si los dos caben en
        // una página pero no en lo que queda de ésta, bajan juntos. Uno largo
        // se pagina línea a línea, que es lo suyo.
        const corto = esParrafoCorto(doc, b.text, util);
        const arrastre = corto ? altoArrastrado(doc, blocks, i + 1, o) : 0;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(CUERPO.parrafo);
        setGray(doc, 60);
        if (arrastre > 0) y = reservar(doc, y + AIRE.parrafo, altoTexto(doc, b.text, util) + arrastre, o.M) - AIRE.parrafo;
        y = parrafo(doc, b.text, o.M, y + AIRE.parrafo, util, o.M);
        break;
      }
      case 'kvTable': {
        // Sin banda de cabecera: un kvTable no tiene encabezados, tiene
        // etiquetas a la izquierda. Ponerle banda inventaría dos columnas
        // tituladas que no existen.
        y = tabla(doc, [], b.rows.map(([k, v]) => [k, v]), b.caption, o, y, false);
        break;
      }
      case 'table': {
        y = tabla(doc, b.head, b.rows, b.caption, o, y, true);
        break;
      }
      case 'notes': {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(CUERPO.nota);
        setGray(doc, 110);
        y += AIRE.notas;
        for (const item of b.items) {
          // Sin viñeta: `recopilarNotas` ya prefija cada ítem con «(*)», «(**)»
          // apareados con las celdas del cuadro, y una viñeta los duplicaría.
          y = parrafo(doc, item, o.M, y, util, o.M) + 0.6;
        }
        break;
      }
    }
    if (y > suelo(o.M)) y = ensureSpace(doc, y, 6, o.M);
  }

  return y;
}
