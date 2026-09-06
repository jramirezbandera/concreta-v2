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
  pdfStr,
  setGray,
  type TableCol,
} from './utils';

/** Igual que en el planificador de Word: ver la cabecera. */
const MAX_COLUMNAS = 8;

/** Cuerpo de cada cosa, en puntos. */
const CUERPO = { h1: 12, h2: 10, h3: 9, parrafo: 8.5, celda: 7.5, nota: 7 };

/** Aire ANTES de cada bloque, en mm. Un encabezado se pega a lo que titula. */
const AIRE = { h1: 6, h2: 5, h3: 4, parrafo: 3.5, tabla: 2, notas: 2.5 };

const PAD = 1.5;

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
  doc.setFontSize(CUERPO.celda);
  for (const [i, trozo] of trocear(doc, cabecera, filas, util).entries()) {
    // El rótulo se repite en cada trozo con « (cont.)», que es lo que hace
    // legible una tabla partida: sin él, el segundo trozo es una tabla huérfana.
    // El «(cont.)» es lo que hace legible una tabla partida: sin él, el segundo
    // trozo parece otra tabla distinta que empieza por la misma columna.
    const texto = rotulo ? (i === 0 ? rotulo : `${rotulo} (cont.)`) : i > 0 ? '(cont.)' : undefined;
    y += AIRE.tabla;
    if (texto) y = caption(doc, texto, o.M, y, util, o.M);

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
    y = drawTable(doc, {
      x: o.M,
      y,
      cols,
      rows: trozo.rows,
      M: o.M,
      headerRepeat: conBanda,
      headerH: conBanda ? 5 : 0,
      headerFontSize: CUERPO.celda,
      cellFontSize: CUERPO.celda,
      pad: PAD,
    });
  }
  return y;
}

/**
 * Dibuja los bloques y devuelve la `y` bajo el último. El llamante se encarga
 * de la cabecera del documento, de los pies y de cerrar el fichero.
 */
export function dibujarBloques(doc: jsPDF, blocks: Block[], o: OpcionesBloques): number {
  const util = PAGE_W - 2 * o.M;
  let y = o.y;

  for (const b of blocks) {
    switch (b.kind) {
      case 'heading': {
        const cuerpo = b.level === 1 ? CUERPO.h1 : b.level === 2 ? CUERPO.h2 : CUERPO.h3;
        const aire = b.level === 1 ? AIRE.h1 : b.level === 2 ? AIRE.h2 : AIRE.h3;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(cuerpo);
        setGray(doc, 25);
        // El encabezado va con su primera línea o se va a la página siguiente:
        // un título solo al pie de página no titula nada.
        y = ensureSpace(doc, y + aire, 14, o.M);
        y = parrafo(doc, b.text, o.M, y, util, o.M);
        break;
      }
      case 'paragraph': {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(CUERPO.parrafo);
        setGray(doc, 60);
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
