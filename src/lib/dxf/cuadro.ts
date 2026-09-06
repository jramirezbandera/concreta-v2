/**
 * Del `Block[]` a la geometría del cuadro. El tercer planificador del capítulo.
 *
 * Aquí el destino vuelve a mandar: esto se inserta en un plano de AutoCAD, así
 * que no hay «celdas» ni «estilos», hay LÍNEAS y TEXTOS en coordenadas. Todo se
 * deriva de una sola magnitud, la altura del texto: los anchos de columna, el
 * alto de fila, los márgenes y la separación entre cuadros. Cambiar esa altura
 * escala el cuadro entero sin descuadrarlo.
 *
 * Las unidades son las del dibujo del usuario: **metros**. Con una altura de
 * texto de 0,0025 el cuadro sale a tamaño de papel (2,5 mm de rótulo), que es
 * lo que se escala luego por el factor de la escala del plano.
 *
 * Dos diferencias con los planificadores de Word y Excel, y las dos vienen de
 * que un TEXT de DXF R12 es una sola línea sin caja:
 *
 *  - **Las cabeceras se envuelven a mano**, repartiendo el texto en varias
 *    entidades TEXT. Es lo que ya hace el cuadro del plano: «Resistencia / de
 *    cálculo» en dos líneas sobre celdas que dicen «20,0 N/mm²». Sin envolver,
 *    una cabecera como la de durabilidad de la madera dejaría una columna de
 *    diez centímetros.
 *  - **No hay ajuste automático de nada.** Si un texto no cabe, se sale. Por eso
 *    los anchos se calculan con holgura y el factor de ancho de carácter va
 *    generoso: es preferible un cuadro algo aireado a uno con textos pisándose.
 */

import type { Block } from '../materiales/cuadros';
import { anchoDeTexto as anchoBruto } from './anchos';
import { dxfStr } from './texto';

/**
 * Anchura de un texto TAL Y COMO acabará en el fichero. Se mide el texto ya
 * mapeado a cp1252, no el original: «≤» ocupa un carácter en pantalla y dos
 * («<=») en el DXF, y medir el de antes dejaba la nota saliendose del cuadro.
 */
const anchoDeTexto = (texto: string, altura: number) => anchoBruto(dxfStr(texto), altura);

// ── Modelo del dibujo ───────────────────────────────────────────────────────

/** Las tres capas, con los colores del cuadro que el estudio ya entrega. */
export type Capa = 'CUADRO-TITULO' | 'CUADRO-TEXTO' | 'CUADRO-LINEAS';

export const COLOR_DE_CAPA: Record<Capa, number> = {
  'CUADRO-TITULO': 1, // rojo: rótulos de sección y cabeceras de columna
  'CUADRO-TEXTO': 7, // blanco/negro según fondo: los datos
  'CUADRO-LINEAS': 8, // gris: la rejilla
};

export type Entidad =
  | { tipo: 'linea'; capa: Capa; x1: number; y1: number; x2: number; y2: number }
  | {
      tipo: 'texto';
      capa: Capa;
      /** Punto de inserción: la línea base. Con `centrado`, su punto medio. */
      x: number;
      y: number;
      altura: number;
      texto: string;
      centrado: boolean;
    };

export interface Dibujo {
  entidades: Entidad[];
  /** Caja del conjunto, para $EXTMIN/$EXTMAX. El cuadro crece hacia abajo. */
  ancho: number;
  alto: number;
}

// ── Proporciones, todas relativas a la altura del texto ─────────────────────

/**
 * Aire que se le suma al ancho medido de la columna, en alturas de texto. Los
 * anchos ya no se estiman: se miden carácter a carácter con `anchoDeTexto`.
 * Estimarlos con un factor sacó el cuadro con los textos pisándose en AutoCAD.
 */
const AIRE = 0.25;
/**
 * Alto de fila e interlineado, en alturas de texto. El interlineado va por
 * encima de lo que parece porque la altura de un TEXT de CAD es la de una
 * MAYÚSCULA: el cuerpo real de la fuente es 1,4 veces mayor, y con 1,35 las
 * líneas de una nota se tocaban entre sí. 1,65 deja el mismo aire que un
 * párrafo normal (1,2 veces el cuerpo).
 */
const ALTO_FILA = 2.2;
const INTERLINEA = 1.65;
/** Margen izquierdo dentro de la celda. */
const MARGEN = 0.6;
/** Aire entre un cuadro y el siguiente, y entre el rótulo y su tabla. */
const SEPARACION = 2.2;
const TRAS_ROTULO = 1.0;
/**
 * Líneas a las que se envuelve una cabecera. Dos, como en el cuadro que el
 * estudio entrega («Mín. contenido / de cemento»); tres sólo para las de la
 * tabla de durabilidad de la madera, que citan dos normas y a dos líneas
 * dejarían una columna de cuatro centímetros.
 */
const LARGA = 36;
const lineasDeCabecera = (texto: string) => (texto.length > LARGA ? 3 : 2);

/**
 * Reparte un texto en líneas que quepan en `ancho`, midiéndolas de verdad y
 * cortando por espacios. Una palabra que no quepa se deja entera y sobresale:
 * partirla es peor, porque en un cuadro las palabras largas son designaciones
 * normativas («HL(HM)-20/B/30/X0») que no se pueden trocear.
 */
export function envolver(texto: string, ancho: number, altura: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [''];
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const tentativa = actual ? `${actual} ${p}` : p;
    if (anchoDeTexto(tentativa, altura) <= ancho || actual === '') actual = tentativa;
    else {
      lineas.push(actual);
      actual = p;
    }
  }
  lineas.push(actual);
  return lineas;
}

// ── Composición ─────────────────────────────────────────────────────────────

interface Tabla {
  head: string[];
  rows: string[][];
  caption?: string;
}

/**
 * Ancho útil de cada columna, medido. Los datos mandan enteros —no se pueden
 * envolver sin cambiar lo que dicen—; de la cabecera sólo la parte que le toca
 * tras repartirse en líneas, más la palabra más larga, que no se puede partir.
 */
function anchosUtiles(t: Tabla, h: number): number[] {
  const n = Math.max(t.head.length, ...t.rows.map((r) => r.length), 1);
  const anchos: number[] = [];
  for (let j = 0; j < n; j++) {
    const datos = t.rows.reduce((m, r) => Math.max(m, anchoDeTexto(r[j] ?? '', h)), 0);
    const cab = t.head[j] ?? '';
    const repartida = cab ? anchoDeTexto(cab, h) / lineasDeCabecera(cab) : 0;
    const palabra = cab
      .split(/\s+/)
      .reduce((m, p) => Math.max(m, anchoDeTexto(p, h)), 0);
    anchos.push(Math.max(2 * h, datos, repartida, palabra));
  }
  return anchos;
}

export interface OpcionesDxf {
  /** Altura del texto en unidades de dibujo. En metros, 0,0025 = 2,5 mm. */
  altura?: number;
}

export function planificarDibujo(blocks: Block[], opciones: OpcionesDxf = {}): Dibujo {
  const h = opciones.altura ?? 0.0025;
  const entidades: Entidad[] = [];
  let y = 0;
  let anchoMax = 0;

  const texto = (capa: Capa, x: number, yBase: number, t: string, centrado = false) => {
    if (t.trim() !== '') entidades.push({ tipo: 'texto', capa, x, y: yBase, altura: h, texto: t, centrado });
  };
  const linea = (x1: number, y1: number, x2: number, y2: number) =>
    entidades.push({ tipo: 'linea', capa: 'CUADRO-LINEAS', x1, y1, x2, y2 });

  /** Línea base de un texto centrado verticalmente en una banda de alto `alto`. */
  const base = (yArriba: number, alto: number) => yArriba - alto / 2 - h * 0.45;

  /** ¿El bloque anterior fue el rótulo de este cuadro? Entonces no se separa. */
  let traeRotulo = false;
  const separar = () => {
    if (!traeRotulo) y -= SEPARACION * h;
    traeRotulo = false;
  };

  const dibujarTabla = (t: Tabla) => {
    const utiles = anchosUtiles(t, h);
    const anchos = utiles.map((u) => u + (2 * MARGEN + AIRE) * h);
    const bordes = [0];
    for (const a of anchos) bordes.push(bordes[bordes.length - 1] + a);
    const ancho = bordes[bordes.length - 1];
    anchoMax = Math.max(anchoMax, ancho);

    if (t.caption) {
      texto('CUADRO-TITULO', 0, y - h, t.caption);
      y -= h * (1 + TRAS_ROTULO * 0.5);
    }

    // Cabecera: cada columna envuelta a lo suyo; el alto lo manda la que más
    // líneas necesite, que es como se rotula una cabecera en un plano.
    //
    // Un kvTable no tiene cabecera —tiene etiquetas a la izquierda—, y hasta
    // que alguien miró un cuadro con uno, la banda se dibujaba igualmente: un
    // recuadro vacío colgando encima de la primera fila.
    const conCabecera = t.head.some((c) => c.trim() !== '');
    const lineasCab = t.head.map((c, j) => (c ? envolver(c, utiles[j], h) : ['']));
    const nLineas = lineasCab.reduce((m, l) => Math.max(m, l.length), 1);
    const altoCab = conCabecera ? Math.max(ALTO_FILA, nLineas * INTERLINEA + 0.65) * h : 0;
    const yCab = y;
    if (conCabecera) {
      lineasCab.forEach((ls, j) => {
        const centro = (bordes[j] + bordes[j + 1]) / 2;
        // El bloque de líneas se centra en la banda, no se cuelga de arriba.
        const arranque = yCab - (altoCab - (ls.length - 1) * INTERLINEA * h) / 2 - h * 0.36;
        ls.forEach((l, k) => texto('CUADRO-TITULO', centro, arranque - k * INTERLINEA * h, l, true));
      });
    }
    y -= altoCab;

    // Sin banda, `yCab` y la línea de arriba de la primera fila son la misma:
    // ponerla dos veces dibujaría la misma línea dos veces en el plano.
    const yFilas: number[] = conCabecera ? [yCab, y] : [y];
    for (const fila of t.rows) {
      const alto = ALTO_FILA * h;
      fila.forEach((celda, j) => {
        // La primera columna es la etiqueta y va pegada a la izquierda; el
        // resto son valores y se centran, como en el cuadro del plano.
        if (j === 0) texto('CUADRO-TEXTO', bordes[0] + MARGEN * h, base(y, alto), celda);
        else texto('CUADRO-TEXTO', (bordes[j] + bordes[j + 1]) / 2, base(y, alto), celda, true);
      });
      y -= alto;
      yFilas.push(y);
    }

    for (const yl of yFilas) linea(0, yl, ancho, yl);
    for (const x of bordes) linea(x, yCab, x, y);
  };

  for (const b of blocks) {
    switch (b.kind) {
      case 'heading':
        separar();
        texto('CUADRO-TITULO', 0, y - h, b.text);
        y -= h * (1 + TRAS_ROTULO);
        // El rótulo y su tabla son una sola cosa: si se separan otra vez, el
        // cuadro sale con el título flotando lejos de lo que titula.
        traeRotulo = true;
        break;
      case 'paragraph':
      case 'notes': {
        const items = b.kind === 'notes' ? b.items : [b.text];
        traeRotulo = false;
        y -= (SEPARACION / 2) * h;
        // Las notas se envuelven al ancho del cuadro más ancho que ya se ha
        // dibujado: así el bloque de texto no sobresale del conjunto.
        // Al ancho del cuadro más ancho que ya se ha dibujado, para que el
        // bloque de texto no sobresalga del conjunto. El suelo sólo actúa
        // cuando la nota llega antes que cualquier tabla.
        const util = anchoMax > 0 ? anchoMax : 40 * h;
        for (const item of items) {
          for (const l of envolver(item, util, h)) {
            texto('CUADRO-TEXTO', 0, y - h, l);
            y -= INTERLINEA * h;
          }
          y -= (INTERLINEA / 3) * h;
        }
        break;
      }
      case 'kvTable':
        separar();
        dibujarTabla({ head: [], rows: b.rows.map(([k, v]) => [k, v]), caption: b.caption });
        break;
      case 'table':
        separar();
        dibujarTabla({ head: b.head, rows: b.rows, caption: b.caption });
        break;
    }
  }

  return { entidades, ancho: anchoMax, alto: -y };
}
