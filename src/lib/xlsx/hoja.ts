/**
 * Del `Block[]` a la hoja de cálculo. La hermana de `docx/plan.ts`.
 *
 * Aquí el destino manda sobre todo lo demás: este Excel no se abre para
 * calcular, se abre para CAPTURARLO y pegar la imagen en el plano. La hoja es
 * el entregable, no un contenedor de datos. De ahí tres cosas que en un export
 * normal serían caprichos y aquí son requisitos:
 *
 *  - **La rejilla de Excel se apaga.** Una captura con la cuadrícula gris de
 *    fondo delata que eso salió de una hoja de cálculo; el cuadro tiene que
 *    parecer un cuadro.
 *  - **Los anchos se calculan del contenido**, porque nadie va a ajustar
 *    columnas a mano antes de capturar. Las cabeceras se dejan envolver a dos
 *    líneas en vez de estirar la columna: en el cuadro real «Valor nominal
 *    recubrimientos» va en dos líneas sobre celdas que dicen «30 mm».
 *  - **Las bandas de sección se fusionan** a todo el ancho de la tabla, que es
 *    como se rotula un cuadro en un plano.
 *
 * A diferencia del .docx no hace falta trocear tablas anchas: una hoja no tiene
 * ancho de página, y la captura se recorta donde el cuadro termina.
 */

import type { Block } from '../materiales/cuadros';

export type EstiloCelda =
  | 'titulo' // banda de sección: HORMIGÓN (CÓDIGO ESTRUCTURAL)
  | 'caption' // rótulo de una tabla: HA-30/B500SD
  | 'cabecera' // fila de encabezados de columna
  | 'etiqueta' // primera columna de una fila de datos
  | 'dato' // el resto de la fila
  | 'nota' // (*) las llamadas al pie del cuadro
  | 'parrafo'; // texto suelto

export interface CeldaHoja {
  texto: string;
  estilo: EstiloCelda;
}

export interface FilaHoja {
  celdas: CeldaHoja[];
  /** Columnas que ocupa la PRIMERA celda. 1 (u omitido) = sin fusión. */
  fusion?: number;
  /** Alto de fila en puntos. Sin él, el alto por defecto de la hoja. */
  alto?: number;
}

export interface Hoja {
  nombre: string;
  filas: FilaHoja[];
  /** Ancho de cada columna en «caracteres» de Excel. */
  anchos: number[];
}

// ── Medidas ─────────────────────────────────────────────────────────────────

/** Alto mínimo en puntos. Por encima manda lo que el texto necesite al envolver. */
const ALTO = { titulo: 20, cabecera: 30, caption: 16 };

/**
 * Cuentas de envoltura por tipo de celda: caracteres que caben por unidad de
 * ancho de columna, alto de línea y holgura, todo en puntos.
 *
 * Los factores van CORTOS a propósito respecto a lo medido, por el mismo
 * criterio que las notas: sobrar medio renglón no se ve, cortar una línea sí.
 * Y aquí cortar duele el doble, porque lo que se pierde es el rótulo del cuadro:
 * en la hoja de anclajes, que sólo tiene siete columnas estrechas, «LONGITUDES DE
 * ANCLAJE EN PROLONGACIÓN RECTA (CÓD-E)» no cabe en una línea.
 */
const ENVOLTURA = {
  titulo: { porUnidad: 0.8, linea: 15, holgura: 5 },
  cabecera: { porUnidad: 1.0, linea: 12, holgura: 6 },
};

/**
 * Alto de las notas envueltas, en puntos. Los números están MEDIDOS contra el
 * autoajuste del propio Excel, no estimados: se abrió el fichero por COM y se
 * comparó, nota a nota, el alto calculado aquí con el que Excel da a ese mismo
 * texto en una columna del mismo ancho.
 *
 *   longitud   líneas   Excel pide
 *      125        1         13 pt
 *      154        1         13 pt
 *      219        2         22 pt
 *      363        2         22 pt
 *
 * De ahí 11 pt por línea y 4 de holgura: una línea suelta necesita 13, no 11.
 * Hace falta calcularlo porque una celda FUSIONADA con ajuste de texto es el
 * único sitio de Excel donde el alto automático no funciona; hay que escribirlo.
 * Sin esto, la nota de las longitudes de anclaje sale cortada en la captura, que
 * es justo el dato normativo que justifica la tabla.
 *
 * El factor de caracteres por línea va CORTO a propósito (la medida real anda
 * por 1,30): sobrar un renglón en blanco no se ve, y perder una línea de texto
 * normativo sí. Ante la duda, de más.
 */
const ALTO_LINEA_NOTA = 11;
const HOLGURA_NOTA = 4;
const CHAR_POR_ANCHO_NOTA = 1.15;

/** Una cabecera larga envuelve en vez de estirar su columna hasta este tope. */
const CABECERA_ANTES_DE_ENVOLVER = 16;

const ANCHO_MIN = 8;
const ANCHO_MAX = 34;
/** Holgura para que el texto no muera pegado al borde de la celda. */
const HOLGURA = 2.5;

/** El nombre de hoja de Excel no admite : \ / ? * [ ] ni más de 31 caracteres. */
export function nombreDeHojaValido(nombre: string): string {
  const limpio = nombre.replace(/[:\\/?*[\]]/g, ' ').trim();
  return (limpio || 'Cuadro').slice(0, 31);
}

// ── Composición ─────────────────────────────────────────────────────────────

/**
 * Ancho de columna a partir del contenido. Los datos cuentan enteros; las
 * cabeceras sólo hasta el tope, porque envuelven. Sin ese tope, la columna de
 * «Durabilidad natural frente a hongos, duramen (UNE-EN 350-2)» dejaría el
 * cuadro más ancho que la pantalla y la captura ilegible.
 */
function anchoDeColumna(datos: string[], cabecera: string | undefined): number {
  const largoDatos = datos.reduce((m, t) => Math.max(m, t.length), 0);
  const largoCabecera = cabecera ? Math.min(cabecera.length, CABECERA_ANTES_DE_ENVOLVER) : 0;
  const ancho = Math.max(largoDatos, largoCabecera) + HOLGURA;
  return Math.round(Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, ancho)) * 10) / 10;
}

/** Las tablas de un `Block[]`, para medir columnas antes de escribir filas. */
function tablasDe(blocks: Block[]): { head: string[]; rows: string[][] }[] {
  const tablas: { head: string[]; rows: string[][] }[] = [];
  for (const b of blocks) {
    if (b.kind === 'table') tablas.push({ head: b.head, rows: b.rows });
    else if (b.kind === 'kvTable') tablas.push({ head: [], rows: b.rows.map(([k, v]) => [k, v]) });
  }
  return tablas;
}

/**
 * Alto de una banda fusionada que envuelve: el rótulo de sección.
 */
export function altoTitulo(texto: string, anchoTotal: number): number {
  const { porUnidad, linea, holgura } = ENVOLTURA.titulo;
  const lineas = Math.max(1, Math.ceil(texto.length / Math.max(12, anchoTotal * porUnidad)));
  return Math.max(ALTO.titulo, lineas * linea + holgura);
}

/**
 * Alto de una fila de cabecera: la manda la columna que más líneas necesite. Sin
 * esto, «Durabilidad natural frente a hongos, duramen (UNE-EN 350-2)» pierde su
 * tercera línea en el cuadro de madera.
 */
export function altoCabecera(head: string[], anchos: number[]): number {
  const { porUnidad, linea, holgura } = ENVOLTURA.cabecera;
  const lineas = head.reduce((max, texto, j) => {
    const porLinea = Math.max(4, (anchos[j] ?? 10) * porUnidad);
    return Math.max(max, Math.ceil(texto.length / porLinea));
  }, 1);
  return Math.max(ALTO.cabecera, lineas * linea + holgura);
}

function fila(textos: string[], estilos: EstiloCelda[], alto?: number): FilaHoja {
  return { celdas: textos.map((texto, i) => ({ texto, estilo: estilos[i] })), alto };
}

function filaFusionada(texto: string, estilo: EstiloCelda, columnas: number, alto?: number): FilaHoja {
  return { celdas: [{ texto, estilo }], fusion: Math.max(1, columnas), alto };
}

/** Alto que necesita un texto envuelto en una banda de `anchoTotal` caracteres. */
export function altoEnvuelto(texto: string, anchoTotal: number): number {
  const porLinea = Math.max(20, Math.floor(anchoTotal * CHAR_POR_ANCHO_NOTA));
  const lineas = Math.max(1, Math.ceil(texto.length / porLinea));
  return lineas * ALTO_LINEA_NOTA + HOLGURA_NOTA;
}

export function planificarHoja(blocks: Block[], nombre = 'Cuadro de materiales'): Hoja {
  const tablas = tablasDe(blocks);
  const columnas = tablas.reduce((m, t) => Math.max(m, t.head.length, ...t.rows.map((r) => r.length)), 1);

  // Anchos: cada columna mira TODAS las tablas de la hoja, porque comparten
  // columna física. Es el precio de apilarlas en una sola hoja, y es el que se
  // paga a cambio de capturar el cuadro entero de una vez.
  const anchos: number[] = [];
  for (let j = 0; j < columnas; j++) {
    const datos: string[] = [];
    let cabecera: string | undefined;
    for (const t of tablas) {
      for (const r of t.rows) if (r[j] !== undefined) datos.push(r[j]);
      if (t.head[j] !== undefined) {
        cabecera = cabecera && cabecera.length > t.head[j].length ? cabecera : t.head[j];
      }
    }
    anchos.push(anchoDeColumna(datos, cabecera));
  }

  const anchoTotal = anchos.reduce((a, b) => a + b, 0);
  const filas: FilaHoja[] = [];
  /** Fila en blanco de separación, nunca dos seguidas ni una al empezar. */
  const separar = () => {
    if (filas.length > 0 && filas[filas.length - 1].celdas.length > 0) filas.push({ celdas: [] });
  };

  for (const b of blocks) {
    switch (b.kind) {
      case 'heading':
        separar();
        filas.push(filaFusionada(b.text, 'titulo', columnas, altoTitulo(b.text, anchoTotal)));
        break;
      case 'paragraph':
        filas.push(filaFusionada(b.text, 'parrafo', columnas, altoEnvuelto(b.text, anchoTotal)));
        break;
      case 'notes':
        separar();
        for (const item of b.items) {
          filas.push(filaFusionada(item, 'nota', columnas, altoEnvuelto(item, anchoTotal)));
        }
        break;
      case 'kvTable': {
        if (b.caption) filas.push(filaFusionada(b.caption, 'caption', columnas, ALTO.caption));
        for (const [k, v] of b.rows) filas.push(fila([k, v], ['etiqueta', 'dato']));
        break;
      }
      case 'table': {
        if (b.caption) filas.push(filaFusionada(b.caption, 'caption', columnas, ALTO.caption));
        filas.push(
          fila(b.head, b.head.map((): EstiloCelda => 'cabecera'), altoCabecera(b.head, anchos)),
        );
        for (const r of b.rows) {
          filas.push(fila(r, r.map((_, i): EstiloCelda => (i === 0 ? 'etiqueta' : 'dato'))));
        }
        break;
      }
    }
  }

  return { nombre: nombreDeHojaValido(nombre), filas, anchos };
}
