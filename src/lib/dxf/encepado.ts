/**
 * El detalle tipo de encepado del estudio, con los números de ESTE cálculo.
 *
 * El resto de DXF de la aplicación se dibujan desde cero (`cuadro.ts` planifica
 * líneas y textos y `escribir.ts` los vuelca a un R12). Aquí no: el estudio ya
 * tiene sus cuatro planos tipo —2, 3, 4 y 6 micropilotes—, dibujados a mano,
 * con sus capas, sus estilos de texto, sus cotas y su cajetín, y lo único que
 * cambia de una obra a otra son las cifras de la tabla del pie. Redibujarlos
 * habría entregado OTRO plano, parecido pero no el suyo; rellenarlos entrega el
 * suyo. Es lo que pidió el usuario con estas palabras: «los esquemas son
 * genéricos y siempre iguales y lo único que cambia es la tabla que indica el
 * armado y dimensiones, es decir sólo habría que coger un dxf base y cambiar
 * los números».
 *
 * De ahí las dos propiedades que gobiernan este fichero:
 *
 *  1. **El esquema no está a escala de los datos.** El dibujo es el tipo; las
 *     medidas reales las da la tabla. Un encepado de 3 m sale dibujado igual
 *     que uno de 1,5 m, con la tabla diciendo 300 y 150. Es como se entregan
 *     los cuadros tipo en un plano de cimentación, y es una decisión, no una
 *     limitación que se arregle luego escalando entidades.
 *  2. **La plantilla se copia tal cual salvo lo que se sustituye.** No se
 *     reescribe el fichero: se localizan las LÍNEAS del valor de cada celda y
 *     se cambia su contenido. Todo lo demás —HEADER, CLASSES, TABLES, BLOCKS,
 *     OBJECTS y cada entidad del dibujo— viaja intacto. Así el día que el
 *     estudio retoque el plano tipo basta con volver a dejar el .dxf en
 *     `public/plantillas/` y esto lo sigue rellenando.
 *
 * **Cómo se localiza la tabla.** Sin coordenadas escritas a mano, que se
 * romperían al primer retoque del plano: se busca el TEXT que dice
 * «MICROPILOTE» —la primera cabecera de la tabla en los cuatro tipos— y, a
 * partir de su altura de letra h, se toman por cabeceras los textos de su misma
 * fila (|Δy| < 0,2·h) y por valores los de la fila de datos (entre 3,8·h y 9·h
 * por debajo; en los cuatro planos está a 6,5·h). Cada valor se asigna a la
 * cabecera cuyo centro cae más cerca en x. Las tolerancias van en alturas de
 * letra, no en unidades de dibujo, para que sigan valiendo si el tipo se
 * reescala.
 *
 * **Qué significa cada sigla** (lo dictó el usuario, 2026-09-17):
 *   H canto total · A separación entre micros en x · B ídem en y · L1 longitud
 *   total · L2 ancho total · D del eje del micro al borde · As1 armadura
 *   inferior de los tirantes · As2 la superior · As3 la secundaria inferior
 *   fuera de los tirantes · As4 la de piel, en anillos alrededor del encepado ·
 *   As5 la secundaria superior. El tipo de 2 micropilotes tiene cuatro casillas
 *   y no cinco, y las dos últimas dicen otra cosa —lo dice su propio dibujo:
 *   As3 es el anillo horizontal tumbado y As4 el cerco vertical de pie—, así
 *   que se rellenan aparte (ver `valoresDeTabla`).
 *
 * **Tres decisiones que el usuario ratificó el 2026-09-17**, para no volver a
 * abrirlas: esa lectura del tipo de 2; que As3 y As5 salgan iguales, porque el
 * cálculo lleva UNA malla para las dos caras; y que con tirantes en dos
 * direcciones la casilla lleve el mayor de los dos, que queda del lado seguro.
 *
 * **Una nota al pie.** La tabla del estudio no tiene casilla para todo lo que
 * el cálculo dispone: faltan los materiales y, según el tipo, la malla genérica
 * de las caras (2 micropilotes) o los cercos que atan las bandas (3, 4 y 6, que
 * exige el art. 58.4.1.2.2.2 de la EHE-08). Callarlo dejaría un plano pidiendo
 * menos acero del comprobado, así que se añade una línea de texto bajo la
 * tabla, en su capa y su estilo y al cuerpo de los rótulos del plano (0,78 de
 * la letra de la tabla, que en los cuatro tipos es 0,2). Una y no dos porque
 * bajo la tabla del tipo de 3 sólo hay 0,6 unidades hasta el marco, y dos
 * líneas legibles no caben; lo que la nota ya no dice —qué es As1, As3…— lo
 * sabe el estudio, que es quien dibujó la tabla.
 *
 * **Lo que no cabe en una celda se parte en dos líneas dentro de ella.** Las
 * casillas de armadura miden 5,2 alturas de letra y «Ø12c/10» mide 5,9 con la
 * fuente del plano (ver `anchoTexto`): se escribe «Ø12» encima y «c/10»
 * debajo, centradas en la celda, a 1,5 alturas de paso. Lo mismo con «200/180»
 * cuando el tipo de 4 lleva cotas distintas. La línea de arriba reutiliza la
 * entidad de la plantilla y la de abajo es un clon con manejador nuevo.
 */

import type { PileCapInputs } from '../../data/defaults';
import type { PileCapResult } from '../calculations/pileCap';
import { encepadoFallbackDxf, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { dec } from '../units/format';

/** Los cuatro planos tipo del estudio, por número de micropilotes. */
export const TIPOS_ENCEPADO = [2, 3, 4, 6] as const;
export type TipoEncepado = (typeof TIPOS_ENCEPADO)[number];

/** Ruta pública de la plantilla de `n` micropilotes, relativa a la base. */
export function rutaPlantilla(n: number): string {
  return `plantillas/encepado-${n}.dxf`;
}

export class ErrorPlantilla extends Error {}

// ── Lectura del DXF: pares código/valor ─────────────────────────────────────

interface Par {
  codigo: number;
  valor: string;
  /** Índice, en el array de líneas, de la línea del VALOR. */
  linea: number;
}

/**
 * El fichero, como la lista de pares que es: un código de grupo en una línea y
 * su valor en la siguiente, siempre. Si la paridad no cuadra, no es un DXF que
 * sepamos leer y se devuelve vacío: el llamante lo traduce a error.
 */
function leerPares(lineas: string[]): Par[] {
  const pares: Par[] = [];
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    const crudo = lineas[i].trim();
    if (crudo === '') break; // cola del fichero
    const codigo = Number(crudo);
    if (!Number.isInteger(codigo)) return [];
    pares.push({ codigo, valor: lineas[i + 1].trim(), linea: i + 1 });
  }
  return pares;
}

/** Rango [inicio, fin] de los pares de una sección; `fin` es su ENDSEC. */
function seccion(pares: Par[], nombre: string): [number, number] | null {
  for (let i = 0; i + 1 < pares.length; i++) {
    if (pares[i].codigo !== 0 || pares[i].valor !== 'SECTION') continue;
    if (pares[i + 1].codigo !== 2 || pares[i + 1].valor !== nombre) continue;
    for (let j = i + 2; j < pares.length; j++) {
      if (pares[j].codigo === 0 && pares[j].valor === 'ENDSEC') return [i + 2, j];
    }
  }
  return null;
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Recorre las entidades de un rango llamando a `ver` con el tipo y sus grupos
 * EN ORDEN. En orden y no en un mapa porque una polilínea repite el 10 y el 20
 * una vez por vértice, y el marco del plano es una de ellas.
 */
function recorrerEntidades(
  pares: Par[],
  desde: number,
  hasta: number,
  ver: (tipo: string, grupos: Par[]) => void,
): void {
  let tipo = '';
  let grupos: Par[] = [];
  for (let i = desde; i < hasta; i++) {
    const p = pares[i];
    if (p.codigo === 0) {
      if (tipo) ver(tipo, grupos);
      tipo = p.valor;
      grupos = [];
    } else {
      grupos.push(p);
    }
  }
  if (tipo) ver(tipo, grupos);
}

/** El primer grupo con ese código: para todo lo que no se repite. */
function primero(grupos: Par[], codigo: number): Par | undefined {
  return grupos.find((g) => g.codigo === codigo);
}

/** Los vértices (10, 20) de la entidad, en el orden en que los escribió el CAD. */
function vertices(grupos: Par[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < grupos.length; i++) {
    if (grupos[i].codigo !== 10) continue;
    const y = grupos[i + 1];
    if (y?.codigo === 20) pts.push({ x: num(grupos[i].valor), y: num(y.valor) });
  }
  return pts;
}

/** Un TEXT del dibujo, con lo justo para reconocer la tabla y sustituirlo. */
interface Texto {
  texto: string;
  /** Línea del valor del grupo 1: la que se reescribe. */
  linea: number;
  capa: string;
  estilo: string;
  dueno: string;
  /** Centro real: el punto de alineación (11) cuando el texto va centrado. */
  cx: number;
  y: number;
  altura: number;
  /** Todos sus grupos, en orden: para clonar la entidad entera. */
  grupos: Par[];
}

function leerTextos(pares: Par[], desde: number, hasta: number): Texto[] {
  const textos: Texto[] = [];
  recorrerEntidades(pares, desde, hasta, (tipo, grupos) => {
    const texto = primero(grupos, 1);
    if (tipo !== 'TEXT' || !texto) return;
    const x11 = primero(grupos, 11);
    const alineado = num(primero(grupos, 72)?.valor) !== 0 && x11 !== undefined;
    textos.push({
      texto: texto.valor,
      linea: texto.linea,
      capa: primero(grupos, 8)?.valor ?? '0',
      estilo: primero(grupos, 7)?.valor ?? 'STANDARD',
      dueno: primero(grupos, 330)?.valor ?? '',
      cx: alineado ? num(x11.valor) : num(primero(grupos, 10)?.valor),
      y: num(primero(grupos, 20)?.valor),
      altura: num(primero(grupos, 40)?.valor),
      grupos,
    });
  });
  return textos;
}

/** La celda de la fila de datos que le toca a cada cabecera de la tabla. */
interface Celda {
  etiqueta: string;
  /** El TEXT de la plantilla que ocupa la celda. */
  texto: Texto;
  /** Ancho de la casilla, entre sus dos líneas verticales. */
  ancho: number;
}

/**
 * Las x de las líneas verticales de la tabla que cruzan la fila de datos, en
 * orden: entre dos consecutivas está cada casilla. Si el plano no las tuviera
 * como LINE, se vuelve al paso entre cabeceras, que es casi lo mismo.
 */
function bordesVerticales(pares: Par[], desde: number, hasta: number, yFila: number): number[] {
  const xs: number[] = [];
  recorrerEntidades(pares, desde, hasta, (tipo, grupos) => {
    if (tipo !== 'LINE') return;
    const x1 = num(primero(grupos, 10)?.valor), y1 = num(primero(grupos, 20)?.valor);
    const x2 = num(primero(grupos, 11)?.valor), y2 = num(primero(grupos, 21)?.valor);
    if (Math.abs(x1 - x2) > 1e-6) return;
    if (Math.min(y1, y2) > yFila || Math.max(y1, y2) < yFila) return;
    xs.push(x1);
  });
  return xs.sort((a, b) => a - b);
}

function celdasDeTabla(
  pares: Par[],
  desde: number,
  hasta: number,
  textos: Texto[],
  ancla: Texto,
): { celdas: Celda[]; yFila: number } {
  const h = ancla.altura;
  const mismaLetra = (t: Texto) => Math.abs(t.altura - h) < 0.01 * h;
  const cabeceras = textos
    .filter((t) => mismaLetra(t) && Math.abs(t.y - ancla.y) < 0.2 * h)
    .sort((a, b) => a.cx - b.cx);
  const valores = textos.filter(
    (t) => mismaLetra(t) && t.y < ancla.y - 3.8 * h && t.y > ancla.y - 9 * h,
  );
  const yFila = valores.length ? Math.min(...valores.map((v) => v.y)) : ancla.y;
  const bordes = bordesVerticales(pares, desde, hasta, yFila);
  const anchoDe = (cx: number): number => {
    const izq = bordes.filter((x) => x < cx).pop();
    const der = bordes.find((x) => x > cx);
    if (izq !== undefined && der !== undefined) return der - izq;
    // Sin líneas: el paso entre cabeceras vecinas.
    let paso = Infinity;
    for (let i = 1; i < cabeceras.length; i++) {
      paso = Math.min(paso, cabeceras[i].cx - cabeceras[i - 1].cx);
    }
    return Number.isFinite(paso) ? paso : 10 * h;
  };
  const celdas = valores.map((v) => {
    let mejor = cabeceras[0];
    for (const c of cabeceras) {
      if (Math.abs(c.cx - v.cx) < Math.abs(mejor.cx - v.cx)) mejor = c;
    }
    return { etiqueta: mejor.texto, texto: v, ancho: anchoDe(v.cx) };
  });
  return { celdas, yFila };
}

/**
 * Cómo partir en dos líneas un valor que no cabe en su casilla: «Ø12c/10» en
 * «Ø12» y «c/10»; «200/180» en «200» y «180». Lo que no tenga por dónde
 * partirse se escribe entero, y que se vea.
 */
function partir(v: string): [string, string] | null {
  const c = v.indexOf('c/');
  if (c > 0) return [v.slice(0, c), v.slice(c)];
  const barra = v.indexOf('/');
  if (barra > 0) return [v.slice(0, barra), v.slice(barra + 1)];
  return null;
}

/** Un tramo horizontal del dibujo, venga de una LINE o de una polilínea. */
interface Tramo {
  y: number;
  x1: number;
  x2: number;
  esLinea: boolean;
}

function tramosHorizontales(pares: Par[], desde: number, hasta: number): Tramo[] {
  const tramos: Tramo[] = [];
  const mete = (a: { x: number; y: number }, b: { x: number; y: number }, esLinea: boolean) => {
    if (Math.abs(a.y - b.y) > 1e-6) return;
    tramos.push({ y: (a.y + b.y) / 2, x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x), esLinea });
  };
  recorrerEntidades(pares, desde, hasta, (tipo, grupos) => {
    if (tipo === 'LINE') {
      const x1 = primero(grupos, 10), y1 = primero(grupos, 20);
      const x2 = primero(grupos, 11), y2 = primero(grupos, 21);
      if (!x1 || !y1 || !x2 || !y2) return;
      mete({ x: num(x1.valor), y: num(y1.valor) }, { x: num(x2.valor), y: num(y2.valor) }, true);
    } else if (tipo === 'LWPOLYLINE') {
      const pts = vertices(grupos);
      for (let i = 0; i + 1 < pts.length; i++) mete(pts[i], pts[i + 1], false);
      const cerrada = num(primero(grupos, 70)?.valor) & 1;
      if (cerrada && pts.length > 2) mete(pts[pts.length - 1], pts[0], false);
    }
  });
  return tramos;
}

/** Dónde va la nota al pie: la esquina inferior izquierda de la tabla y el sitio que hay. */
interface ZonaNotas {
  x: number;
  /** Borde inferior de la tabla. */
  y: number;
  /** Hasta el primer trazo horizontal que hay debajo (el marco), en unidades. */
  hueco: number;
  /** Ancho de la tabla. */
  ancho: number;
}

/**
 * El hueco libre bajo la tabla.
 *
 * El borde inferior de la tabla es el PRIMER tramo horizontal largo que hay
 * por debajo de la fila de datos: el más alto de los que quedan bajo esa
 * fila, sea línea o polilínea. (Antes se tomaba la línea más baja del dibujo,
 * que acertaba sólo porque el marco del estudio es una polilínea; con un
 * marco de líneas las notas habrían salido debajo del marco.) El suelo es el
 * primer tramo horizontal que aparece por debajo del borde cruzando su misma
 * franja de x —en los cuatro planos, el marco—. Sin medirlo, en el tipo de 3
 * micropilotes —el de tabla más baja, a 0,6 del marco— la nota salía escrita
 * sobre él.
 */
function zonaDeNotas(
  pares: Par[],
  desde: number,
  hasta: number,
  h: number,
  yFila: number,
): ZonaNotas | null {
  const tramos = tramosHorizontales(pares, desde, hasta);
  let pie: Tramo | null = null;
  for (const t of tramos) {
    if (t.y >= yFila - 0.5 * h || t.x2 - t.x1 < 20 * h) continue;
    if (!pie || t.y > pie.y) pie = t;
  }
  if (!pie) return null;
  let suelo = -Infinity;
  for (const t of tramos) {
    if (t.y >= pie.y - 0.01 * h) continue;
    if (t.x2 < pie.x1 - 0.5 * h || t.x1 > pie.x2 + 0.5 * h) continue;
    if (t.y > suelo) suelo = t.y;
  }
  return { x: pie.x1, y: pie.y, hueco: pie.y - suelo, ancho: pie.x2 - pie.x1 };
}

// ── La fuente del plano ─────────────────────────────────────────────────────

/**
 * Avance de cada glifo, en alturas de letra, con la fuente del plano tipo.
 *
 * El estilo `Estructura` de los cuatro planos usa GOTHIC.TTF (Century Gothic),
 * y AutoCAD toma la altura de un TEXT TrueType como altura de MAYÚSCULA, que en
 * esa fuente es 0,706 em. La tabla son los avances medidos en la fuente y
 * pasados a esa unidad, calibrados contra una captura del plano abierto en
 * AutoCAD: «ENCEPADO 3 MICROPILOTES» mide 19,4 h en los dos. Es una fuente
 * ancha —un dígito ocupa 0,79 h, la Ø 1,23 h—, y con Arial a ojo se iba un 40 %
 * por debajo: así salió la primera versión con «Ø12c/10» pisando las líneas
 * de la tabla.
 */
const ANCHO_GOTHIC: Record<string, number> = {
  '0': 0.785, '1': 0.785, '2': 0.785, '3': 0.785, '4': 0.785, '5': 0.785, '6': 0.785,
  '7': 0.785, '8': 0.785, '9': 0.785, 'Ø': 1.23,
  A: 1.048, B: 0.813, C: 1.152, D: 1.054, E: 0.759, F: 0.687, G: 1.235, H: 0.968,
  I: 0.32, J: 0.683, K: 0.837, L: 0.654, M: 1.302, N: 1.048, O: 1.231, P: 0.838,
  Q: 1.234, R: 0.86, S: 0.705, T: 0.603, U: 0.927, V: 0.995, W: 1.36, X: 0.862,
  Y: 0.838, Z: 0.68, Ñ: 1.048,
  a: 0.968, b: 0.966, c: 0.916, d: 0.97, e: 0.921, f: 0.445, g: 0.953, h: 0.864,
  i: 0.284, j: 0.288, k: 0.711, l: 0.284, m: 1.329, n: 0.864, o: 0.927, p: 0.966,
  q: 0.966, r: 0.426, s: 0.55, t: 0.48, u: 0.861, v: 0.785, w: 1.177, x: 0.68,
  y: 0.759, z: 0.602, ñ: 0.864, á: 0.968, é: 0.921, í: 0.284, ó: 0.927, ú: 0.861,
  ' ': 0.392, '·': 0.472, '/': 0.619, '.': 0.392, ',': 0.392, ':': 0.392, ';': 0.392,
  '-': 0.47, '(': 0.523, ')': 0.523, '=': 0.858, '%': 1.098,
};

/** Anchura del texto TAL COMO lo dibuja el CAD, para una altura de letra `h`. */
export function anchoTexto(texto: string, h: number): number {
  let w = 0;
  for (const ch of texto.replace(/%%[cC]/g, 'Ø')) w += ANCHO_GOTHIC[ch] ?? 1.0;
  return w * h;
}

// ── Lo que dice cada casilla ────────────────────────────────────────────────

/** Milímetros a centímetros, que es como cota la tabla: «95», «32,5». */
function cm(mm: number): string {
  const v = mm / 10;
  return dec(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1);
}

/** «4%%C16»: el %%C es el código de Ø que ya usan las celdas de la plantilla. */
function barras(n: number, phi: number): string {
  return `${n}%%C${phi}`;
}

/** Una cota, o «a/b» cuando el plano tiene una casilla y el cálculo dos valores
 *  (si no cabe en la celda, el relleno la parte en dos líneas por la barra). */
function unaODos(a: number, b: number): string {
  return Math.abs(a - b) < 5 ? cm(a) : `${cm(a)}/${cm(b)}`;
}

/** «%%C12c/20»: la armadura que se define por separación, no por número. */
function aSeparacion(phi: number, s: number): string {
  return `%%C${phi}c/${cm(s)}`;
}

/**
 * El valor de cada cabecera de la tabla.
 *
 * Las armaduras de los tirantes van por número de barras EN LA BANDA, que es lo
 * que calcula el motor y lo que pone el estudio en sus tablas. Las de reparto
 * —malla, anillos de piel y cercos— van por diámetro y separación: la casilla
 * es una sola y el número de barras depende del sentido, de modo que un número
 * suelto sería falso en uno de los dos; la separación vale para los dos y es lo
 * que se ha comprobado.
 *
 * Con más de un tirante por sentido se escribe el MAYOR de los dos: la tabla
 * tiene una casilla por familia, el dibujo es simétrico y pasarse de acero en
 * el sentido menos cargado queda del lado seguro. El desglose por sentido está
 * en el PDF del cálculo.
 */
function valoresDeTabla(inp: PileCapInputs, res: PileCapResult): Record<string, string> {
  const n = inp.n;
  const nBarras = Math.max(res.n_bars_x, res.n_bars_y ?? 0);
  const malla = aSeparacion(inp.phi_g, inp.s_g);
  const anillos = aSeparacion(inp.phi_ch, inp.s_ch);
  const cercos = aSeparacion(inp.phi_cv, inp.s_cv);
  // n=3: B es la altura del triángulo equilátero, de la base al pilote de arriba.
  const B = n === 3 ? (inp.s * Math.sqrt(3)) / 2 : inp.s;
  // D es la distancia del eje del pilote al borde EN EL SENTIDO de la cota:
  // con 2 pilotes, a lo largo de ellos (L2 es el ancho entero, no lleva D). El
  // motor da `e_borde` = la MENOR de las dos direcciones, que con cotas
  // manuales puede ser la otra; por eso se calcula aquí desde L y la caja de
  // ejes. Con 3 pilotes e es única por construcción del hexágono. Con 4 ó 6,
  // si no coinciden (modo manual) se escriben las dos antes que mentir con
  // una; lo mismo con el lado L del tipo de 4.
  const cajaX = n === 6 ? inp.s_x : inp.s;
  const cajaY = n === 6 ? 2 * inp.s : inp.s;
  const D_x = (res.L_x - cajaX) / 2;
  const D_y = (res.L_y - cajaY) / 2;
  const D = n === 3 ? cm(res.e_borde) : n === 2 ? cm(D_x) : unaODos(D_x, D_y);
  const lado = unaODos(res.L_x, res.L_y);

  return {
    MICROPILOTE: String(inp.d_p),
    H: cm(inp.h_enc),
    A: cm(n === 6 ? inp.s_x : inp.s),
    B: cm(B),
    L: lado,
    L1: cm(res.L_x),
    L2: cm(res.L_y),
    D,
    As1: barras(nBarras, inp.phi_tie),
    As2: inp.n_top > 0 ? barras(inp.n_top, inp.phi_top) : '-',
    // El tipo de 2 micropilotes numera distinto: no tiene casilla de malla y
    // sus dos últimas son el anillo horizontal y el cerco vertical.
    As3: n === 2 ? anillos : malla,
    As4: n === 2 ? cercos : anillos,
    As5: malla,
  };
}

/** La nota del pie: título, materiales, axil y la armadura que no tiene casilla. */
function notaAlPie(inp: PileCapInputs): string {
  const partes = [
    `HA-${inp.fck}`,
    `B${inp.fyk}S`,
    `rec. ${cm(inp.cover)} cm`,
    `NEd = ${dec(inp.N_Ed, 0)} kN`,
    inp.n === 2
      ? `malla ${aSeparacion(inp.phi_g, inp.s_g)} en las dos caras`
      : `cercos de banda ${aSeparacion(inp.phi_cv, inp.s_cv)} de ${inp.n_cv} ramas`,
  ];
  const titulo = inp.title.trim();
  if (titulo) partes.unshift(titulo);
  return partes.join(' · ');
}

// ── Escritura ───────────────────────────────────────────────────────────────

/** Un par código/valor, con el código alineado a la derecha como la plantilla. */
function par(lineas: string[], codigo: number, valor: string | number): void {
  lineas.push(String(codigo).padStart(3, ' '), String(valor));
}

/** Un TEXT alineado a la izquierda, con la capa y el estilo de la tabla. */
function entidadTexto(
  t: { x: number; y: number; altura: number; texto: string; capa: string; estilo: string; dueno: string },
  manejador: string,
): string[] {
  const l: string[] = [];
  par(l, 0, 'TEXT');
  par(l, 5, manejador);
  if (t.dueno) par(l, 330, t.dueno);
  par(l, 100, 'AcDbEntity');
  par(l, 8, t.capa);
  par(l, 100, 'AcDbText');
  par(l, 10, t.x.toFixed(6));
  par(l, 20, t.y.toFixed(6));
  par(l, 30, '0.0');
  par(l, 40, t.altura.toFixed(6));
  par(l, 1, t.texto);
  par(l, 7, t.estilo);
  par(l, 100, 'AcDbText');
  return l;
}

/**
 * La segunda línea de una celda: la misma entidad de la plantilla, con otro
 * manejador, otro texto y la y desplazada. Se copian todos sus grupos menos los
 * que no deben duplicarse: reactores y diccionario propio (los bloques 102 y
 * el 360) y los datos extendidos (≥ 1000).
 */
function clonTexto(grupos: Par[], manejador: string, texto: string, dy: number): string[] {
  const l: string[] = [];
  par(l, 0, 'TEXT');
  let dentro102 = false;
  for (const g of grupos) {
    if (g.codigo === 102) {
      dentro102 = g.valor.startsWith('{');
      continue;
    }
    if (dentro102 || g.codigo === 360 || g.codigo >= 1000) continue;
    let v = g.valor;
    if (g.codigo === 5) v = manejador;
    else if (g.codigo === 1) v = texto;
    else if (g.codigo === 20 || g.codigo === 21) v = (num(g.valor) + dy).toFixed(6);
    par(l, g.codigo, v);
  }
  return l;
}

/**
 * El primer manejador libre del fichero.
 *
 * $HANDSEED dice cuál es, pero en los planos del estudio coincide con el mayor
 * manejador en uso, así que se toma el mayor de los dos criterios: repetir un
 * manejador deja el DXF inválido y eso no se descubre hasta abrirlo en el CAD.
 */
function primerManejadorLibre(pares: Par[], semilla: string): number {
  let max = parseInt(semilla, 16);
  if (!Number.isFinite(max)) max = 0;
  for (const p of pares) {
    if (p.codigo !== 5 && p.codigo !== 105) continue;
    const v = parseInt(p.valor, 16);
    if (Number.isFinite(v) && v >= max) max = v + 1;
  }
  return max;
}

/**
 * La plantilla del estudio con los números de este cálculo.
 *
 * Devuelve el fichero entero. Lanza `ErrorPlantilla` si el .dxf no es el
 * esperado (no es un DXF de pares, no tiene sección de entidades o no aparece
 * la tabla): antes un error claro que un plano con las cotas de otra obra.
 */
export function rellenarEncepado(
  plantilla: string,
  inp: PileCapInputs,
  res: PileCapResult,
): string {
  const lineas = plantilla.split(/\r\n|\n|\r/);
  const pares = leerPares(lineas);
  if (!pares.length) throw new ErrorPlantilla('La plantilla no es un DXF de pares código/valor');
  const entidades = seccion(pares, 'ENTITIES');
  if (!entidades) throw new ErrorPlantilla('La plantilla no tiene sección ENTITIES');
  const [desde, hasta] = entidades;

  const textos = leerTextos(pares, desde, hasta);
  const ancla = textos.find((t) => t.texto === 'MICROPILOTE' && t.altura > 0);
  if (!ancla) throw new ErrorPlantilla('No se encuentra la tabla de la plantilla');

  const h = ancla.altura;
  const { celdas, yFila } = celdasDeTabla(pares, desde, hasta, textos, ancla);
  if (!celdas.length) throw new ErrorPlantilla('La tabla de la plantilla no tiene fila de datos');

  // Manejadores para lo que se añade: las segundas líneas de celda y la nota.
  const iSemilla = pares.findIndex((p, i) => p.codigo === 5 && pares[i - 1]?.valor === '$HANDSEED');
  const semilla = iSemilla >= 0 ? pares[iSemilla] : null;
  let manejador = primerManejadorLibre(pares, semilla?.valor ?? '0');
  const siguiente = () => (manejador++).toString(16).toUpperCase();
  const nuevas: string[] = [];

  // 1. Las cifras de la tabla, celda a celda. Lo que cabe en su casilla con la
  //    fuente del plano se escribe en su línea; lo que no, en dos líneas a 1,5
  //    alturas de paso, centradas en la celda como estaba la original.
  const valores = valoresDeTabla(inp, res);
  const medio = 0.75 * h;
  for (const c of celdas) {
    const v = valores[c.etiqueta];
    if (v === undefined) continue;
    const dos = anchoTexto(v, h) > 0.88 * c.ancho ? partir(v) : null;
    if (!dos) {
      lineas[c.texto.linea] = v;
      continue;
    }
    lineas[c.texto.linea] = dos[0];
    for (const g of c.texto.grupos) {
      if (g.codigo === 20 || g.codigo === 21) lineas[g.linea] = (num(g.valor) + medio).toFixed(6);
    }
    nuevas.push(...clonTexto(c.texto.grupos, siguiente(), dos[1], -medio));
  }

  // 2. La nota al pie, en la capa y el estilo de la propia tabla, al cuerpo de
  //    los rótulos del plano si cabe en el hueco y en el ancho de la tabla.
  const zona = zonaDeNotas(pares, desde, hasta, h, yFila);
  if (zona) {
    const texto = notaAlPie(inp);
    const altura = Math.max(
      0.5 * h,
      Math.min(0.78 * h, zona.hueco / 2.3, (0.95 * zona.ancho) / anchoTexto(texto, 1)),
    );
    nuevas.push(
      ...entidadTexto(
        {
          x: zona.x,
          y: zona.y - 1.8 * altura,
          altura,
          texto,
          capa: ancla.capa,
          estilo: ancla.estilo,
          dueno: ancla.dueno,
        },
        siguiente(),
      ),
    );
  }

  // Todo lo nuevo va al final de las entidades, DESPUÉS de tocar las celdas:
  // el splice corre los índices de lo que hay detrás. El HANDSEED vive en la
  // cabecera, muy por delante, y no se mueve.
  if (semilla) lineas[semilla.linea] = manejador.toString(16).toUpperCase();
  if (nuevas.length) lineas.splice(pares[hasta].linea - 1, 0, ...nuevas);

  return lineas.join('\r\n');
}

/**
 * Punto de entrada del botón: trae la plantilla y la devuelve rellena.
 *
 * Las plantillas viven en `public/` y NO entran en el precache del service
 * worker (su `globPatterns` no incluye .dxf): son 860 KB que sólo necesita
 * quien exporta un encepado, así que se bajan la primera vez que se pulsa y de
 * ahí en adelante las sirve la caché en tiempo de ejecución.
 */
export async function exportarEncepadoDxf(
  inp: PileCapInputs,
  res: PileCapResult,
  titulo?: string,
): Promise<ResultadoExport> {
  const respuesta = await fetch(`${import.meta.env.BASE_URL}${rutaPlantilla(inp.n)}`);
  if (!respuesta.ok) {
    throw new ErrorPlantilla(`No se pudo cargar el plano tipo de ${inp.n} micropilotes`);
  }
  // El título llega por parámetro y se impone al del estado: `setField` es un
  // setState y, en el instante de exportar, `inp.title` es todavía el de
  // ANTES de escribir en el modal. El nombre del fichero ya lo hacía así; la
  // nota al pie salía con el título viejo.
  const relleno = rellenarEncepado(
    await respuesta.text(),
    titulo === undefined ? inp : { ...inp, title: titulo },
    res,
  );
  return {
    blob: new Blob([relleno], { type: 'image/vnd.dxf' }),
    filename: titledFilename(titulo ?? '', encepadoFallbackDxf(inp.n), 'dxf'),
  };
}
