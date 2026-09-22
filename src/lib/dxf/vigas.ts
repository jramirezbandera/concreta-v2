/**
 * El cuadro de vigas del estudio, con las vigas de ESTA obra.
 *
 * ---------------------------------------------------------------------------
 * QUE ENTREGA
 * ---------------------------------------------------------------------------
 * Un DXF con el plano de vigas del estudio: a la izquierda su criterio de
 * armados —los zunchos de igual canto, los de distintos cantos, el voladizo, el
 * vano único, el esquema de estribos y las notas—, y a la derecha un cuadro con
 * una sección por cada viga guardada en el anejo de la obra, acotada, armada y
 * rotulada con el nombre que el usuario le puso.
 *
 * ---------------------------------------------------------------------------
 * POR QUE MEDIO PLANO SE RELLENA Y MEDIO SE DIBUJA
 * ---------------------------------------------------------------------------
 * Los cuatro planos tipo de encepado y el de micropilote se rellenan enteros:
 * el dibujo es siempre el mismo y sólo cambian las cifras de una tabla, así que
 * `encepado.ts` copia el fichero del estudio y reescribe celdas. Aquí no se
 * puede. La mitad izquierda sí es fija —y por eso viaja tal cual en
 * `public/plantillas/vigas.dxf`, que produce `scripts/recortar-vigas.mjs`—,
 * pero la derecha es una lista de tantas secciones como vigas tenga la obra:
 * cuarenta y tres en el fichero que dio el usuario, tres en la obra siguiente.
 * Eso no es rellenar, es dibujar, y es lo que hace este fichero.
 *
 * ---------------------------------------------------------------------------
 * LAS MEDIDAS SALEN DEL PLANO DEL ESTUDIO, NO DE LA CABEZA
 * ---------------------------------------------------------------------------
 * Todas las constantes de aquí están medidas sobre «EJEMPLO VIGAS.dxf». Las
 * tres que mandan:
 *
 *  - **La escala.** Una viga de 35 cm se dibuja 1,75 unidades: 0,05 unidades
 *    por centímetro. Con el dibujo en metros eso es la sección a cinco veces su
 *    tamaño, que es lo que hay que hacer para que un cuadro a 1:20 salga bien
 *    en un plano a 1:100. Las secciones SI van a escala entre ellas: una viga
 *    de 80 de canto se dibuja el doble de alta que una de 40, como en su plano.
 *  - **El diámetro no se dibuja.** Las barras son círculos de radio 0,03
 *    SIEMPRE, sea la barra del 10 o del 25. Es un símbolo, no una medida, y es
 *    lo que hace el estudio: el diámetro lo dice el rótulo. Lo que sí va a
 *    escala es la POSICION del centro de la barra, que es recubrimiento más
 *    cerco más medio diámetro, igual que la que usa el motor para el canto útil.
 *  - **Las cotas se dibujan, no se acotan.** Líneas, la marca oblicua del
 *    propio fichero (el bloque `_Oblique`, a escala 0,14) y la cifra en
 *    centímetros redondeada al centímetro, que es lo que da el estilo «cotas
 *    escala 1.20» del estudio con su DIMLFAC de 20. Salen idénticas y abren en
 *    cualquier visor; a cambio no son acotaciones asociativas.
 *
 * ---------------------------------------------------------------------------
 * COMO SE RESUME UNA VIGA DE PORTICO EN UNA SECCION
 * ---------------------------------------------------------------------------
 * El módulo calcula dos secciones cuando trabaja en modo pórtico: el VANO, con
 * el momento positivo, y el APOYO, con el negativo. El cuadro lleva una sola
 * sección por viga, que es lo que significa un cuadro de vigas en un plano, y
 * se compone así (lo dictó el usuario, 2026-09-22):
 *
 *   armadura superior   la del APOYO (tracción con M−)
 *   armadura inferior   la del VANO  (tracción con M+)
 *   cercos zona A       los del APOYO, que es donde se concentran
 *   cercos zona B       los del VANO
 *
 * Las zonas A y B son las del esquema de estribos que el propio plano lleva al
 * pie del criterio: A en los extremos, B en el centro. En modo simple la pieza
 * es UNA sección y no hay dos zonas: entonces la línea de cercos va sola y sin
 * mencionar zona ninguna.
 *
 * El cerco que se DIBUJA es el más denso de las dos zonas —más ramas, y a
 * igualdad de ramas el diámetro mayor—: el dibujo es uno solo y quedarse con el
 * de la zona menos armada pediría en el plano menos acero del comprobado.
 */

import {
  anchoTexto,
  ErrorPlantilla,
  leerPares,
  primerManejadorLibre,
  primero,
  recorrerEntidades,
  seccion,
} from './plantilla';
import { ANCLAJE, BULGE_90, BULGE_180, lineasDeEntidad, textoMtext, type Entidad } from './entidades';
import { cuadroVigasFallbackDxf, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { dec } from '../units/format';

export { ErrorPlantilla } from './plantilla';

/** Ruta pública de la plantilla, relativa a la base de la aplicación. */
export const RUTA_PLANTILLA_VIGAS = 'plantillas/vigas.dxf';

// ── Lo que se dibuja de cada viga ───────────────────────────────────────────

export interface BarrasCuadro {
  /** Número de barras de la cara. 0 = esa cara no lleva armadura tabulada. */
  n: number;
  /** Diámetro en mm. */
  phi: number;
}

export interface CercoCuadro {
  /** 'A' (apoyo) o 'B' (vano); `null` cuando el cálculo da una sola zona. */
  zona: 'A' | 'B' | null;
  /** Diámetro en mm. */
  phi: number;
  /** Separación en mm. */
  s: number;
  /** Cercos de dos ramas por sección: 1 = «eØ8c/20», 2 = «2eØ8c/20». */
  cercos: number;
}

export interface VigaDeCuadro {
  /** Lo que se rotula encima en rojo: el nombre que el usuario le puso. */
  rotulo: string;
  /** Ancho de la sección, en mm. */
  b: number;
  /** Canto total, en mm. */
  h: number;
  /** Recubrimiento a la cara del cerco, en mm. */
  rec: number;
  sup: BarrasCuadro;
  inf: BarrasCuadro;
  /** Una línea (modo simple) o dos (pórtico: apoyo y vano). */
  cercos: CercoCuadro[];
  /** Para la nota al pie. */
  fck: number;
  fyk: number;
}

// ── Las medidas del plano del estudio ───────────────────────────────────────

/** Unidades de dibujo por milímetro: 0,05 por cm, o la sección a cinco veces. */
const U = 0.005;

/** Radio del círculo de una barra. Símbolo fijo, no el diámetro. */
const R_BARRA = 0.03;
/** Redondeo de las esquinas del cerco. */
const R_CERCO = 0.1;
/** Radio del gancho de una rama, alrededor de la barra que abraza. */
const R_RAMA = 0.0778;
/**
 * Cuánto de la pata derecha de una rama se dibuja por cada extremo. El resto es
 * el hueco por el que se ve que la rama se cierra solapando, que es como lo
 * dibuja el estudio: 0,17 de pata por cada lado sobre 0,77 de alto.
 */
const PATA_RAMA = 0.22;

/** Alturas de letra. */
const H_TITULO = 0.3;
const H_ROTULO = 0.25;
const H_TEXTO = 0.2;
/** La nota al pie, al cuerpo de los rótulos menores del plano. */
const H_NOTA = 0.156;
/** Paso entre líneas de un MTEXT: el 1,667 de AutoCAD sobre la altura. */
const PASO = 1.6667;

/** Cotas: separación de la línea de cota a la cara, hueco del texto y marca. */
const COTA_ANCHO = 0.45;
const COTA_CANTO = 0.364;
const HUECO_COTA = 0.155;
const SALE_LINEA = 0.07;
const ENTRA_LINEA = 0.07;
const MARCA = 0.14;

/** Lo que la línea de referencia sobresale por la derecha de la sección. */
const SALIENTE = 1.2;
/** El rótulo de armadura, por encima de su línea de referencia. */
const SOBRE_REFERENCIA = 0.069;
/** Separación mínima entre las dos líneas de referencia de una sección. */
const SEPARACION_REFERENCIAS = 0.36;

/** Calle entre una sección y la siguiente, y ancho al que se salta de fila. */
const CALLE = 0.99;
const ANCHO_FILA = 37;

/** Del rótulo de la viga a su sección, y de la sección a la línea de cercos. */
const TRAS_ROTULO = 0.3;
const BAJO_SECCION = 1.03;
const ENTRE_FILAS = 0.91;

/** Esquina superior izquierda del marco del cuadro, como en el plano del estudio. */
const X_MARCO = 34.3;
const Y_MARCO = 24.515;
/** Aire entre el marco y lo que encierra. */
const AIRE = 0.7;

const COLOR_ROJO = 1;
const COLOR_AMARILLO = 2;
const COLOR_CIAN = 4;
const COLOR_GRIS = 8;

const CAPA_GEOMETRIA = 'CV-GEOMETRÍA';
const CAPA_ARMADO = 'CV-ARMADO';
const CAPA_COTAS = 'CV-COTAS';
const CAPA_NUMERACION = 'CV-NUMERACIÓN';
const CAPA_TEXTO = 'CV-TEXTO';
const CAPA_LINEAS = 'CV-LÍNEAS';

/** Los dos estilos del plano: el del cuadro y el de las cifras de cota. */
const ESTILO_CUADRO = 'Estructura';
const ESTILO_COTA = 'Formato';

/** La marca oblicua de los extremos de cota, que ya viene definida en el plano. */
const BLOQUE_MARCA = '_Oblique';

// ── Lo que dice cada rótulo ─────────────────────────────────────────────────

/** Milímetros a centímetros, como los escribe el plano: «20», «17,5». */
function cm(mm: number): string {
  const v = mm / 10;
  return dec(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1);
}

/** «3%%C12». El %%C es la Ø que ya usan todas las celdas del plano. */
export function textoBarras(a: BarrasCuadro): string {
  return `${a.n}%%C${a.phi}`;
}

/** «eØ8c/20 (zona A)», «2eØ8c/15», según haya una zona o dos y una rama o varias. */
export function textoCerco(c: CercoCuadro): string {
  const cuantos = c.cercos > 1 ? String(c.cercos) : '';
  const zona = c.zona ? ` (zona ${c.zona})` : '';
  return `${cuantos}e%%C${c.phi}c/${cm(c.s)}${zona}`;
}

/** La cifra de una cota: centímetros enteros, como el estilo del estudio. */
function textoCota(mm: number): string {
  return String(Math.round(mm / 10));
}

/**
 * El cerco que se dibuja: el más denso de las zonas.
 *
 * Primero por número de ramas y luego por diámetro. Dibujar el de la zona menos
 * armada enseñaría en el plano menos acero del que se ha comprobado.
 */
function cercoDibujado(v: VigaDeCuadro): CercoCuadro | null {
  let elegido: CercoCuadro | null = null;
  for (const c of v.cercos) {
    if (!elegido || c.cercos > elegido.cercos || (c.cercos === elegido.cercos && c.phi > elegido.phi)) {
      elegido = c;
    }
  }
  return elegido;
}

// ── La sección de una viga ──────────────────────────────────────────────────

interface Seccion {
  entidades: Entidad[];
  /**
   * Hasta dónde llega por la derecha, medido desde x0: el final de la línea de
   * referencia, que está FUERA del rectángulo de hormigón. Lo necesita el
   * planificador para saber dónde acaba el cuadro y colocar el marco.
   */
  derecha: number;
}

/** Una sección acotada y armada, con su borde superior izquierdo en (x0, y0). */
function dibujarSeccion(v: VigaDeCuadro, x0: number, y0: number): Seccion {
  const e: Entidad[] = [];
  const bU = v.b * U;
  const hU = v.h * U;
  const recU = v.rec * U;
  const cerco = cercoDibujado(v);
  const phiCerco = cerco?.phi ?? 0;

  // 1. El hormigón.
  e.push({
    tipo: 'polilinea',
    capa: CAPA_GEOMETRIA,
    cerrada: true,
    puntos: [
      { x: x0, y: y0 },
      { x: x0 + bU, y: y0 },
      { x: x0 + bU, y: y0 - hU },
      { x: x0, y: y0 - hU },
    ],
  });

  // 2. El cerco: un rectángulo de esquinas redondeadas a `recU` de cada cara.
  const xL = x0 + recU;
  const xR = x0 + bU - recU;
  const yT = y0 - recU;
  const yB = y0 - hU + recU;
  if (xR > xL && yT > yB) {
    const r = Math.min(R_CERCO, (xR - xL) / 2, (yT - yB) / 2);
    e.push({
      tipo: 'polilinea',
      capa: CAPA_ARMADO,
      cerrada: true,
      puntos: [
        { x: xL + r, y: yB },
        { x: xR - r, y: yB, bulge: BULGE_90 },
        { x: xR, y: yB + r },
        { x: xR, y: yT - r, bulge: BULGE_90 },
        { x: xR - r, y: yT },
        { x: xL + r, y: yT, bulge: BULGE_90 },
        { x: xL, y: yT - r },
        { x: xL, y: yB + r, bulge: BULGE_90 },
      ],
    });
  }

  // 3. Las barras. El centro va a recubrimiento + cerco + medio diámetro de la
  //    cara, que es la misma cuenta con la que el motor saca el canto útil.
  const posiciones = (a: BarrasCuadro, y: number): { x: number; y: number }[] => {
    if (a.n <= 0) return [];
    const dentro = (v.rec + phiCerco + a.phi / 2) * U;
    const xIni = x0 + dentro;
    const xFin = x0 + bU - dentro;
    if (a.n === 1) return [{ x: (xIni + xFin) / 2, y }];
    const paso = (xFin - xIni) / (a.n - 1);
    return Array.from({ length: a.n }, (_, i) => ({ x: xIni + i * paso, y }));
  };
  const ySup = y0 - (v.rec + phiCerco + v.sup.phi / 2) * U;
  const yInf = y0 - hU + (v.rec + phiCerco + v.inf.phi / 2) * U;
  const barrasSup = posiciones(v.sup, ySup);
  const barrasInf = posiciones(v.inf, yInf);
  for (const b of [...barrasSup, ...barrasInf]) {
    e.push({ tipo: 'circulo', capa: CAPA_ARMADO, x: b.x, y: b.y, r: R_BARRA });
  }

  // 4. Las ramas interiores, las que pide el cálculo y colocadas simétricas.
  const guia = barrasSup.length >= barrasInf.length ? barrasSup : barrasInf;
  if (ySup > yInf) {
    for (const [i, j] of ramasInteriores(guia.length, (cerco?.cercos ?? 1) - 1)) {
      e.push(rama(guia[i].x, guia[j].x, ySup, yInf));
    }
  }

  // 5. Las líneas de referencia y sus rótulos. Cuando las dos caras quedan
  //    demasiado juntas —una viga plana— los rótulos se pisarían: se separan
  //    y la línea sale de la barra con un quiebro, como se hace a mano.
  const anchoRotulo = Math.max(
    v.sup.n > 0 ? anchoTexto(textoBarras(v.sup), H_TEXTO) : 0,
    v.inf.n > 0 ? anchoTexto(textoBarras(v.inf), H_TEXTO) : 0,
  );
  const xFinal = x0 + bU + Math.max(SALIENTE, anchoRotulo + 0.1);
  const centro = (ySup + yInf) / 2;
  const juntas = ySup - yInf < SEPARACION_REFERENCIAS;
  const yRotuloSup = juntas ? centro + SEPARACION_REFERENCIAS / 2 : ySup;
  const yRotuloInf = juntas ? centro - SEPARACION_REFERENCIAS / 2 : yInf;

  const referencia = (barras: { x: number; y: number }[], a: BarrasCuadro, yLinea: number) => {
    if (a.n <= 0 || barras.length === 0) return;
    const desde = barras[barras.length - 1];
    const puntos =
      desde.y === yLinea
        ? [
            { x: desde.x, y: yLinea },
            { x: xFinal, y: yLinea },
          ]
        : [
            { x: desde.x, y: desde.y },
            { x: x0 + bU + SALIENTE * 0.25, y: yLinea },
            { x: xFinal, y: yLinea },
          ];
    e.push({ tipo: 'polilinea', capa: CAPA_LINEAS, puntos });
    e.push({
      tipo: 'texto',
      capa: CAPA_TEXTO,
      x: xFinal,
      y: yLinea + SOBRE_REFERENCIA,
      altura: H_TEXTO,
      texto: textoBarras(a),
      estilo: ESTILO_CUADRO,
      anclaje: ANCLAJE.abajoDerecha,
    });
  };
  referencia(barrasSup, v.sup, yRotuloSup);
  referencia(barrasInf, v.inf, yRotuloInf);

  // 6. Las dos cotas.
  e.push(...cotaHorizontal(x0, x0 + bU, y0 - hU - COTA_ANCHO, y0 - hU, v.b));
  e.push(...cotaVertical(x0 - COTA_CANTO, y0, y0 - hU, x0, v.h));

  return { entidades: e, derecha: xFinal - x0 };
}

/**
 * Qué barras ata cada rama interior, en pares [primera, última].
 *
 * El número de ramas lo manda el CALCULO —un cerco de dos ramas es sólo el
 * exterior y cada cerco de más añade una rama—, y lo que se decide aquí es
 * dónde van: **simétricas respecto del eje de la sección**, que es como se ata
 * una viga (lo dictó el usuario, 2026-09-22; el límite que gobierna el número
 * es el del Código Estructural, separación transversal de ramas no mayor de
 * 0,75·d ni de 600 mm, y ése ya lo comprueba el motor).
 *
 * Reparto: las `t` ramas se colocan en las posiciones k/(t+1) del tramo de
 * barras interiores. Cuando la posición cae justo sobre una barra, la rama la
 * abraza a ella sola; cuando cae entre dos —cuatro barras y una sola rama, que
 * es lo corriente en una viga de 45—, la rama abraza LAS DOS, que es lo que
 * deja la sección simétrica sin inventarse una rama de más.
 *
 * Con menos barras interiores que ramas no se puede repartir sin repetir, así
 * que se atan las que hay: el dibujo enseña entonces menos ramas que el rótulo.
 * Es un armado que no se da —dos barras y cuatro ramas—, pero antes eso que dos
 * ramas dibujadas una encima de otra.
 */
export function ramasInteriores(barras: number, ramas: number): [number, number][] {
  // Las barras que puede atar una rama son las que no están en esquina: de la
  // 1 a la penúltima, `m` en total.
  const m = barras - 2;
  const t = Math.min(Math.max(0, ramas), Math.max(0, m));
  if (t <= 0) return [];
  const pares: [number, number][] = [];
  for (let k = 1; k <= t; k++) {
    // Una rama va al medio; varias se reparten de la primera barra interior a
    // la última. Las dos fórmulas son simétricas respecto del eje.
    const pos = t === 1 ? (1 + m) / 2 : 1 + ((k - 1) * (m - 1)) / (t - 1);
    pares.push([Math.floor(pos + 1e-9), Math.ceil(pos - 1e-9)]);
  }
  return pares;
}

/**
 * Una rama: el lazo que ata la barra de arriba con la de abajo.
 *
 * Con `xIzq` igual a `xDer` es el lazo estrecho del plano del estudio —dos
 * semicírculos abrazando la barra y dos patas—; con dos barras distintas es el
 * mismo lazo ensanchado, con las esquinas redondeadas al mismo radio.
 *
 * La pata derecha va partida por la mitad a propósito: ese hueco es el gancho,
 * por donde se ve que la rama se cierra solapando. Está medido en el plano del
 * estudio (0,17 de pata a cada lado sobre 0,77 de alto).
 */
function rama(xIzq: number, xDer: number, ySup: number, yInf: number): Entidad {
  const R = R_RAMA;
  const pata = (ySup - yInf) * PATA_RAMA;
  const ancha = xDer - xIzq > 1e-9;
  const puntos = [
    { x: xDer + R, y: ySup - pata },
    { x: xDer + R, y: ySup, bulge: ancha ? BULGE_90 : BULGE_180 },
  ];
  if (ancha) {
    puntos.push({ x: xDer, y: ySup + R }, { x: xIzq, y: ySup + R, bulge: BULGE_90 });
  }
  puntos.push({ x: xIzq - R, y: ySup }, { x: xIzq - R, y: yInf, bulge: ancha ? BULGE_90 : BULGE_180 });
  if (ancha) {
    puntos.push({ x: xIzq, y: yInf - R }, { x: xDer, y: yInf - R, bulge: BULGE_90 });
  }
  puntos.push({ x: xDer + R, y: yInf }, { x: xDer + R, y: yInf + pata });
  return { tipo: 'polilinea', capa: CAPA_ARMADO, puntos };
}

/** La marca oblicua de un extremo de cota, girada con la línea. */
function marca(x: number, y: number, rotacion: number): Entidad {
  return {
    tipo: 'bloque',
    capa: CAPA_COTAS,
    color: COLOR_CIAN,
    nombre: BLOQUE_MARCA,
    x,
    y,
    escala: MARCA,
    rotacion,
  };
}

/**
 * Una cota horizontal bajo la sección: dos líneas de referencia que bajan de
 * las caras, la línea de cota con sus marcas y la cifra encima, centrada.
 */
function cotaHorizontal(x1: number, x2: number, y: number, yCara: number, mm: number): Entidad[] {
  return [
    { tipo: 'linea', capa: CAPA_COTAS, color: COLOR_GRIS, x1, y1: yCara - SALE_LINEA, x2: x1, y2: y - ENTRA_LINEA },
    { tipo: 'linea', capa: CAPA_COTAS, color: COLOR_GRIS, x1: x2, y1: yCara - SALE_LINEA, x2, y2: y - ENTRA_LINEA },
    { tipo: 'linea', capa: CAPA_COTAS, color: COLOR_CIAN, x1, y1: y, x2, y2: y },
    marca(x1, y, 0),
    marca(x2, y, 180),
    {
      tipo: 'texto',
      capa: CAPA_COTAS,
      color: COLOR_AMARILLO,
      x: (x1 + x2) / 2,
      y: y + HUECO_COTA,
      altura: H_TEXTO,
      texto: textoCota(mm),
      estilo: ESTILO_COTA,
      anclaje: ANCLAJE.centro,
    },
  ];
}

/** La misma cota, a la izquierda de la sección y con la cifra girada. */
function cotaVertical(x: number, y1: number, y2: number, xCara: number, mm: number): Entidad[] {
  return [
    { tipo: 'linea', capa: CAPA_COTAS, color: COLOR_GRIS, x1: xCara - SALE_LINEA, y1, x2: x - ENTRA_LINEA, y2: y1 },
    { tipo: 'linea', capa: CAPA_COTAS, color: COLOR_GRIS, x1: xCara - SALE_LINEA, y1: y2, x2: x - ENTRA_LINEA, y2 },
    { tipo: 'linea', capa: CAPA_COTAS, color: COLOR_CIAN, x1: x, y1, x2: x, y2 },
    marca(x, y1, 90),
    marca(x, y2, 270),
    {
      tipo: 'texto',
      capa: CAPA_COTAS,
      color: COLOR_AMARILLO,
      x: x - HUECO_COTA,
      y: (y1 + y2) / 2,
      altura: H_TEXTO,
      texto: textoCota(mm),
      estilo: ESTILO_COTA,
      anclaje: ANCLAJE.centro,
      vertical: true,
    },
  ];
}

// ── El cuadro entero ────────────────────────────────────────────────────────

export interface Cuadro {
  entidades: Entidad[];
  /** Filas y cuántas vigas entraron en cada una, para los tests. */
  filas: number[];
}

/** Cuánto ocupa la línea de cercos de una viga, para que la celda no la corte. */
function anchoCercos(v: VigaDeCuadro): number {
  return v.cercos.reduce((m, c) => Math.max(m, anchoTexto(textoCerco(c), H_TEXTO)), 0);
}

/**
 * El cuadro: las secciones en filas, el marco, el título y la nota al pie.
 *
 * Las secciones de una fila se alinean por ARRIBA y la línea de cercos de toda
 * la fila por abajo, a una misma altura: es lo que hace que un cuadro con vigas
 * de cantos distintos se lea como una tabla y no como una estantería.
 */
export function planificarCuadro(vigas: VigaDeCuadro[], nota: string[]): Cuadro {
  const entidades: Entidad[] = [];
  const filas: number[] = [];
  if (vigas.length === 0) return { entidades, filas };

  // 1. El reparto en filas. Una celda ocupa lo que ocupe su sección con la
  //    cota y la referencia, o su línea de cercos si es más ancha.
  const anchos = vigas.map((v) => {
    const cota = COTA_CANTO + HUECO_COTA + H_TEXTO;
    const rotulo = Math.max(
      v.sup.n > 0 ? anchoTexto(textoBarras(v.sup), H_TEXTO) : 0,
      v.inf.n > 0 ? anchoTexto(textoBarras(v.inf), H_TEXTO) : 0,
    );
    const seccion = cota + v.b * U + Math.max(SALIENTE, rotulo + 0.1);
    return Math.max(seccion, anchoCercos(v));
  });

  const reparto: VigaDeCuadro[][] = [];
  const anchoDe: number[][] = [];
  let actual: VigaDeCuadro[] = [];
  let anchoActual: number[] = [];
  let suma = 0;
  vigas.forEach((v, i) => {
    const w = anchos[i];
    if (actual.length > 0 && suma + CALLE + w > ANCHO_FILA) {
      reparto.push(actual);
      anchoDe.push(anchoActual);
      actual = [];
      anchoActual = [];
      suma = 0;
    }
    actual.push(v);
    anchoActual.push(w);
    suma += (actual.length > 1 ? CALLE : 0) + w;
  });
  reparto.push(actual);
  anchoDe.push(anchoActual);

  // 2. Las filas, de arriba abajo.
  const xContenido = X_MARCO + AIRE;
  let y = Y_MARCO - AIRE;
  let derechaMax = xContenido;

  reparto.forEach((fila, f) => {
    filas.push(fila.length);
    const yRotulo = y;
    const ySeccion = yRotulo - H_ROTULO - TRAS_ROTULO;
    // La línea de cercos de la fila cuelga de la sección más profunda.
    const altoMax = Math.max(...fila.map((v) => v.h * U));
    const yCercos = ySeccion - altoMax - BAJO_SECCION;

    let x = xContenido;
    fila.forEach((v, i) => {
      const w = anchoDe[f][i];
      // La sección arranca dejando sitio a la cifra del canto, que sobresale.
      const x0 = x + COTA_CANTO + HUECO_COTA + H_TEXTO;
      const s = dibujarSeccion(v, x0, ySeccion);
      entidades.push(...s.entidades);

      entidades.push({
        tipo: 'texto',
        capa: CAPA_NUMERACION,
        x: x0 + (v.b * U) / 2,
        y: yRotulo,
        altura: H_ROTULO,
        texto: textoMtext(v.rotulo),
        estilo: ESTILO_CUADRO,
        anclaje: ANCLAJE.arribaCentro,
      });

      entidades.push({
        tipo: 'texto',
        capa: CAPA_TEXTO,
        x,
        y: yCercos,
        altura: H_TEXTO,
        texto: v.cercos.map(textoCerco).join('\\P'),
        estilo: ESTILO_CUADRO,
        anclaje: ANCLAJE.arribaIzquierda,
      });

      derechaMax = Math.max(derechaMax, x0 + s.derecha);
      x += w + CALLE;
    });

    const lineasCercos = Math.max(1, ...fila.map((v) => v.cercos.length));
    const altoCercos = H_TEXTO + (lineasCercos - 1) * H_TEXTO * PASO;
    y = yCercos - altoCercos - ENTRE_FILAS;
  });

  // 3. La nota al pie, dentro del marco.
  let abajo = y + ENTRE_FILAS;
  if (nota.length > 0) {
    const yNota = abajo - 0.35;
    entidades.push({
      tipo: 'texto',
      capa: CAPA_TEXTO,
      x: xContenido,
      y: yNota,
      altura: H_NOTA,
      texto: nota.map((l) => textoMtext(l)).join('\\P'),
      estilo: ESTILO_CUADRO,
      anclaje: ANCLAJE.arribaIzquierda,
    });
    abajo = yNota - (H_NOTA + (nota.length - 1) * H_NOTA * PASO);
    derechaMax = Math.max(derechaMax, xContenido + Math.max(...nota.map((l) => anchoTexto(l, H_NOTA))));
  }

  // 4. El marco y el título.
  const xDerecho = derechaMax + AIRE;
  const yBajo = abajo - AIRE;
  entidades.push({
    tipo: 'polilinea',
    capa: CAPA_LINEAS,
    color: COLOR_ROJO,
    cerrada: true,
    puntos: [
      { x: X_MARCO, y: Y_MARCO },
      { x: xDerecho, y: Y_MARCO },
      { x: xDerecho, y: yBajo },
      { x: X_MARCO, y: yBajo },
    ],
  });
  entidades.push({
    tipo: 'texto',
    capa: CAPA_TEXTO,
    color: COLOR_ROJO,
    x: X_MARCO + 0.053,
    y: Y_MARCO + 0.424,
    altura: H_TITULO,
    texto: 'CUADRO DE VIGAS',
    estilo: ESTILO_CUADRO,
    anclaje: ANCLAJE.arribaIzquierda,
  });

  return { entidades, filas };
}

// ── La nota al pie ──────────────────────────────────────────────────────────

/**
 * Los materiales y el recubrimiento, que el cuadro no tabula.
 *
 * Una línea si todas las vigas los comparten. Si no, una por combinación
 * distinta, diciendo a qué vigas se refiere: callarlo dejaría un plano en el
 * que unas vigas son de HA-25 y otras de HA-30 sin que nada lo diga.
 */
export function notaDeMateriales(vigas: VigaDeCuadro[]): string[] {
  if (vigas.length === 0) return [];
  const grupos = new Map<string, string[]>();
  for (const v of vigas) {
    const clave = `HA-${v.fck} · B${v.fyk}S · rec. ${cm(v.rec)} cm`;
    const lista = grupos.get(clave);
    if (lista) lista.push(v.rotulo);
    else grupos.set(clave, [v.rotulo]);
  }
  if (grupos.size === 1) return [[...grupos.keys()][0]];
  return [...grupos].map(([clave, rotulos]) => `${rotulos.join(', ')}: ${clave}`);
}

// ── El fichero ──────────────────────────────────────────────────────────────

/**
 * La plantilla del estudio con el cuadro de esta obra dibujado dentro.
 *
 * Nada de la plantilla se toca: las entidades nuevas se insertan justo antes de
 * su ENDSEC, con manejadores libres y colgando del mismo dueño —el registro de
 * bloque del espacio modelo— que las que ya están.
 */
export function rellenarCuadroVigas(plantilla: string, vigas: VigaDeCuadro[]): string {
  if (vigas.length === 0) {
    throw new ErrorPlantilla('No hay ninguna viga guardada en el anejo de la obra');
  }
  const lineas = plantilla.split(/\r\n|\n|\r/);
  const pares = leerPares(lineas);
  if (!pares.length) throw new ErrorPlantilla('La plantilla no es un DXF de pares código/valor');
  const entidades = seccion(pares, 'ENTITIES');
  if (!entidades) throw new ErrorPlantilla('La plantilla no tiene sección ENTITIES');
  const [desde, hasta] = entidades;

  // El dueño de las entidades nuevas: el de las que ya hay. Inventarlo dejaría
  // el dibujo colgando de un bloque que no existe.
  let dueno = '';
  recorrerEntidades(pares, desde, hasta, (_tipo, grupos) => {
    if (!dueno) dueno = primero(grupos, 330)?.valor ?? '';
  });

  const iSemilla = pares.findIndex((p, i) => p.codigo === 5 && pares[i - 1]?.valor === '$HANDSEED');
  const semilla = iSemilla >= 0 ? pares[iSemilla] : null;
  let manejador = primerManejadorLibre(pares, semilla?.valor ?? '0');
  const siguiente = () => (manejador++).toString(16).toUpperCase();

  const cuadro = planificarCuadro(vigas, notaDeMateriales(vigas));
  const nuevas: string[] = [];
  for (const e of cuadro.entidades) nuevas.push(...lineasDeEntidad(e, siguiente(), dueno));

  if (semilla) lineas[semilla.linea] = manejador.toString(16).toUpperCase();
  lineas.splice(pares[hasta].linea - 1, 0, ...nuevas);
  return lineas.join('\r\n');
}

/**
 * Punto de entrada del botón: trae la plantilla y devuelve el plano entero.
 *
 * La plantilla vive en `public/` y NO entra en el precache del service worker
 * (su `globPatterns` no incluye .dxf): son ochocientos kilobytes que sólo
 * necesita quien exporta el cuadro, así que se bajan la primera vez que se
 * pulsa y de ahí en adelante los sirve la caché en tiempo de ejecución.
 */
export async function exportarCuadroVigasDxf(
  vigas: VigaDeCuadro[],
  titulo?: string,
): Promise<ResultadoExport> {
  const respuesta = await fetch(`${import.meta.env.BASE_URL}${RUTA_PLANTILLA_VIGAS}`);
  if (!respuesta.ok) throw new ErrorPlantilla('No se pudo cargar el plano de vigas del estudio');
  const relleno = rellenarCuadroVigas(await respuesta.text(), vigas);
  return {
    blob: new Blob([relleno], { type: 'image/vnd.dxf' }),
    filename: titledFilename(titulo ?? '', cuadroVigasFallbackDxf(), 'dxf'),
  };
}
