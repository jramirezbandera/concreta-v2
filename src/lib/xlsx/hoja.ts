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
 *  - **Lo que no cabe, envuelve.** Un dato que se pasa del tope de ancho no
 *    puede estirar la columna, y sin ajuste de texto Excel lo corta sin avisar.
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
  /** Ajuste de texto: la celda no cabe en su columna y envuelve en vez de cortarse. */
  envolver?: boolean;
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
 * Celdas de etiqueta y de dato que NO caben en su columna. Envuelven, y su fila
 * recibe alto escrito, porque lo que sobresale de una celda con vecina se corta
 * sin avisar, y una celda centrada se corta por los DOS lados. Se vio en el
 * bloque de viento del plano: «banda de fachada más rozamiento (11 %) según X,
 * hastial en cubierta según X, faldones en cubierta según Y», cien caracteres
 * en una columna de 34, salía como «(11 %) según X, hastial en cubierta…».
 *
 * Aquí contar caracteres no vale: el autoajuste de Excel, medido por COM en
 * Arial 10, mete 1,25 caracteres por unidad de ancho en «IV (zona urbana,
 * industrial o forestal)» (muchas letras estrechas), 1,11 en «banda de fachada
 * más faldones en cubierta» y 0,88 en mayúsculas. Con un factor único, o
 * envuelve lo que cabe o corta lo que no. Así que se mide el texto con las
 * anchuras del propio Arial, que es la fuente de la hoja.
 *
 * La tabla es la del tipo de letra, en milésimas de em; la escala y la holgura
 * están AJUSTADAS contra 98 textos medidos con el autoajuste del propio Excel
 * (el test los lleva). Así medido, el modelo no se queda corto en ninguno de
 * los 98 —quedarse corto es justo lo que corta la celda— y sobra entre un 2 y
 * un 6 % en los textos largos, que es el lado bueno del error.
 */
const ARIAL: readonly (readonly [number, string])[] = [
  [191, "'"],
  [222, 'ijl'],
  [260, '|'],
  // El segundo es el espacio DURO, que mide lo mismo que el normal.
  [278, ' \u00a0!,./:;I[]\\ftÌÍÎÏìíîï'],
  [333, 'r()-`¡²³'],
  [334, '{}'],
  [355, '"'],
  [365, 'º'],
  [370, 'ª'],
  [389, '*'],
  [400, '°'],
  [469, '^'],
  [500, 'Jcksvxyzç'],
  [549, '≤≥'],
  [553, 'θ'],
  [556, '0123456789#$?_Labdeghnopqu«»±µμ–áàäâãéèëêñóòöôúùüû'],
  [584, '+<=>~×÷−'],
  [611, 'FTZß¿ø'],
  [667, '&ABEKSVXYÀÁÂÃÄÅÈÉÊËÝ'],
  [722, 'CDHNRUwÑÙÚÛÜ'],
  [737, '©'],
  [778, 'GOQÒÓÔÕÖØ'],
  [833, 'Mm'],
  [889, '%'],
  [944, 'W'],
  [987, '→'],
  [1000, '—…'],
  [1015, '@'],
];

const MILESIMAS = new Map<string, number>();
for (const [u, glifos] of ARIAL) for (const g of glifos) MILESIMAS.set(g, u);

/** Lo que vale un carácter que no está en la tabla: una letra corriente. */
const MILESIMAS_MINUSCULA = 556;
const MILESIMAS_MAYUSCULA = 722;
/**
 * Píxeles por milésima de em. Lo teórico para Arial 10 a 96 ppp es 0,01333;
 * el 3 % de más sale de AJUSTAR contra las 98 medidas del propio Excel (ver el
 * test): con 0,01333 el modelo se queda corto y una celda se corta.
 */
const PX_POR_MILESIMA = 0.01372;
/** Holgura interna de la celda, en píxeles, también ajustada. */
const PX_PADDING = 2;
/** Una unidad de ancho de columna de Excel son 7 píxeles con esta fuente. */
const PX_POR_UNIDAD = 7;
/** Margen antes de dar una celda por llena: la holgura con la que Excel pinta. */
const MARGEN_CABE = 0.5;
/** Arial 10 pide 12,75 pt por línea en Excel. */
const ALTO_LINEA_DATO = 13;
const HOLGURA_DATO = 2;

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

function pxTexto(texto: string): number {
  let milesimas = 0;
  for (const c of texto) {
    milesimas +=
      MILESIMAS.get(c) ??
      (c !== c.toLowerCase() && c === c.toUpperCase() ? MILESIMAS_MAYUSCULA : MILESIMAS_MINUSCULA);
  }
  return milesimas * PX_POR_MILESIMA;
}

/** Ancho que el autoajuste de Excel daría a un texto de Arial 10, en unidades de columna. */
export function anchoTexto(texto: string): number {
  return (pxTexto(texto) + PX_PADDING) / PX_POR_UNIDAD;
}

/** Si un texto de etiqueta o de dato cabe en una línea de una columna de `ancho`. */
export function cabeEnColumna(texto: string, ancho: number): boolean {
  return anchoTexto(texto) + MARGEN_CABE <= ancho;
}

/**
 * Líneas que ocupa un texto envuelto en una columna de `ancho`: el mismo salto
 * por palabras que hace Excel. Una palabra más larga que la línea se parte,
 * como allí. La holgura ya está en la medida del texto, que sobra un 3 %;
 * encoger además la línea daba un renglón en blanco de más.
 */
export function lineasEnvueltas(texto: string, ancho: number): number {
  const capacidad = Math.max(PX_POR_UNIDAD, ancho * PX_POR_UNIDAD - PX_PADDING);
  const pxEspacio = pxTexto(' ');
  let lineas = 1;
  let linea = 0;
  for (const palabra of texto.split(' ')) {
    const px = pxTexto(palabra);
    if (linea === 0) linea = px;
    else if (linea + pxEspacio + px <= capacidad) linea += pxEspacio + px;
    else {
      lineas++;
      linea = px;
    }
    while (linea > capacidad) {
      lineas++;
      linea -= capacidad;
    }
  }
  return lineas;
}

/** Alto de una celda de datos que envuelve en una columna de `ancho`, en puntos. */
export function altoDato(texto: string, ancho: number): number {
  return lineasEnvueltas(texto, ancho) * ALTO_LINEA_DATO + HOLGURA_DATO;
}

/**
 * Fila de etiqueta y datos. La celda que no cabe en su columna envuelve, y la
 * fila toma el alto de la que más líneas necesite; las demás, alto automático.
 */
function filaDatos(textos: string[], estilos: EstiloCelda[], anchos: number[]): FilaHoja {
  let alto: number | undefined;
  const celdas = textos.map((texto, j): CeldaHoja => {
    const ancho = anchos[j] ?? ANCHO_MIN;
    if (cabeEnColumna(texto, ancho)) return { texto, estilo: estilos[j] };
    alto = Math.max(alto ?? 0, altoDato(texto, ancho));
    return { texto, estilo: estilos[j], envolver: true };
  });
  return alto === undefined ? { celdas } : { celdas, alto };
}

function filaFusionada(texto: string, estilo: EstiloCelda, columnas: number, alto?: number): FilaHoja {
  return { celdas: [{ texto, estilo }], fusion: Math.max(1, columnas), alto };
}

/**
 * Alto que necesita un texto envuelto en una banda de `anchoTotal` de ancho: las
 * notas y los párrafos, que van fusionados a todo el cuadro.
 *
 * Hay que escribirlo porque una celda FUSIONADA con ajuste de texto es el único
 * sitio de Excel donde el alto automático no funciona, y si se queda corto la
 * nota sale cortada en la captura — y son las notas las que justifican la tabla.
 *
 * Se calculaba contando caracteres a 11 pt por línea, y el error crecía con cada
 * renglón porque Excel gasta 12,75: a las tres líneas ya cortaba. Abriendo el
 * cuadro de materiales por COM, siete notas pedían más alto del escrito, una de
 * ellas 38,25 pt contra 26. Va por el mismo modelo medido que los datos.
 */
export function altoEnvuelto(texto: string, anchoTotal: number): number {
  return altoDato(texto, anchoTotal);
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
        for (const [k, v] of b.rows) filas.push(filaDatos([k, v], ['etiqueta', 'dato'], anchos));
        break;
      }
      case 'table': {
        if (b.caption) filas.push(filaFusionada(b.caption, 'caption', columnas, ALTO.caption));
        filas.push(
          fila(b.head, b.head.map((): EstiloCelda => 'cabecera'), altoCabecera(b.head, anchos)),
        );
        for (const r of b.rows) {
          filas.push(filaDatos(r, r.map((_, i): EstiloCelda => (i === 0 ? 'etiqueta' : 'dato')), anchos));
        }
        break;
      }
    }
  }

  return { nombre: nombreDeHojaValido(nombre), filas, anchos };
}
