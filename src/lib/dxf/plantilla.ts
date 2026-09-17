/**
 * La maquinaria de rellenar un plano tipo del estudio: leer el DXF como la
 * lista de pares código/valor que es, localizar su tabla por la cabecera,
 * medir el texto con la fuente del plano y reescribir las celdas sin tocar
 * nada más.
 *
 * Vivía dentro de `encepado.ts`, que fue el primer plano que se rellenó. El
 * segundo —el tipo de micropilote— usa la misma tabla, el mismo estilo de
 * texto y la misma fuente, así que esto es lo común y en cada fichero de plano
 * queda sólo lo suyo: qué dice cada casilla y qué textos del dibujo cambian.
 *
 * Nada aquí sabe de encepados ni de micropilotes, y no importa nada: son
 * cadenas y números.
 */

export class ErrorPlantilla extends Error {}

// ── Lectura del DXF: pares código/valor ─────────────────────────────────────

export interface Par {
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
export function leerPares(lineas: string[]): Par[] {
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
export function seccion(pares: Par[], nombre: string): [number, number] | null {
  for (let i = 0; i + 1 < pares.length; i++) {
    if (pares[i].codigo !== 0 || pares[i].valor !== 'SECTION') continue;
    if (pares[i + 1].codigo !== 2 || pares[i + 1].valor !== nombre) continue;
    for (let j = i + 2; j < pares.length; j++) {
      if (pares[j].codigo === 0 && pares[j].valor === 'ENDSEC') return [i + 2, j];
    }
  }
  return null;
}

export function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Recorre las entidades de un rango llamando a `ver` con el tipo y sus grupos
 * EN ORDEN. En orden y no en un mapa porque una polilínea repite el 10 y el 20
 * una vez por vértice, y el marco del plano es una de ellas.
 */
export function recorrerEntidades(
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
export function primero(grupos: Par[], codigo: number): Par | undefined {
  return grupos.find((g) => g.codigo === codigo);
}

/** Los vértices (10, 20) de la entidad, en el orden en que los escribió el CAD. */
export function vertices(grupos: Par[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < grupos.length; i++) {
    if (grupos[i].codigo !== 10) continue;
    const y = grupos[i + 1];
    if (y?.codigo === 20) pts.push({ x: num(grupos[i].valor), y: num(y.valor) });
  }
  return pts;
}

/** Un TEXT del dibujo, con lo justo para reconocer la tabla y sustituirlo. */
export interface Texto {
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

export function leerTextos(pares: Par[], desde: number, hasta: number): Texto[] {
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
export interface Celda {
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
export function bordesVerticales(pares: Par[], desde: number, hasta: number, yFila: number): number[] {
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

export function celdasDeTabla(
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
export function partir(v: string): [string, string] | null {
  const c = v.indexOf('c/');
  if (c > 0) return [v.slice(0, c), v.slice(c)];
  const barra = v.indexOf('/');
  if (barra > 0) return [v.slice(0, barra), v.slice(barra + 1)];
  return null;
}

/** Un tramo horizontal del dibujo, venga de una LINE o de una polilínea. */
export interface Tramo {
  y: number;
  x1: number;
  x2: number;
  esLinea: boolean;
}

export function tramosHorizontales(pares: Par[], desde: number, hasta: number): Tramo[] {
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
export interface ZonaNotas {
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
export function zonaDeNotas(
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
export const ANCHO_GOTHIC: Record<string, number> = {
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
// ── Escritura ───────────────────────────────────────────────────────────────

/** Un par código/valor, con el código alineado a la derecha como la plantilla. */
export function par(lineas: string[], codigo: number, valor: string | number): void {
  lineas.push(String(codigo).padStart(3, ' '), String(valor));
}

/** Un TEXT alineado a la izquierda, con la capa y el estilo de la tabla. */
export function entidadTexto(
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
export function clonTexto(grupos: Par[], manejador: string, texto: string, dy: number): string[] {
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
export function primerManejadorLibre(pares: Par[], semilla: string): number {
  let max = parseInt(semilla, 16);
  if (!Number.isFinite(max)) max = 0;
  for (const p of pares) {
    if (p.codigo !== 5 && p.codigo !== 105) continue;
    const v = parseInt(p.valor, 16);
    if (Number.isFinite(v) && v >= max) max = v + 1;
  }
  return max;
}

// ── Los textos con formato del dibujo (MTEXT y cotas) ───────────────────────
//
// La tabla son TEXT de una línea y se reescriben cambiando su grupo 1. Los
// rótulos largos del plano —el bloque de materiales, las notas geotécnicas— son
// MTEXT, y un MTEXT largo NO cabe en un grupo: el CAD lo parte en trozos de 250
// caracteres (código 3) y deja el último en el código 1. Para cambiarlo hay que
// leer los trozos, juntarlos, tocar el texto y volver a partirlo, que puede dar
// un número distinto de trozos: por eso esto devuelve el RANGO de líneas del
// fichero que ocupa cada uno, y no un índice suelto como los TEXT.
//
// Las cotas con texto forzado (una DIMENSION con su grupo 1, como la longitud
// del micropilote) entran por el mismo sitio: son un único trozo.

export interface Parrafo {
  tipo: string;
  /** El texto entero, con los trozos ya unidos. */
  texto: string;
  /** Primera línea del rango (la del CÓDIGO del primer trozo). */
  desde: number;
  /** Última línea del rango, incluida (la del VALOR del último trozo). */
  hasta: number;
  capa: string;
}

export function leerParrafos(
  pares: Par[],
  desde: number,
  hasta: number,
  lineas: string[],
): Parrafo[] {
  const parrafos: Parrafo[] = [];
  recorrerEntidades(pares, desde, hasta, (tipo, grupos) => {
    if (tipo !== 'MTEXT' && tipo !== 'DIMENSION') return;
    // En un MTEXT el 3 son los trozos de 250 del texto; en una COTA el 3 es el
    // nombre de su estilo de acotación, que no se toca: de la cota sólo
    // interesa el 1, el texto forzado que sustituye a la medida.
    const trozos = grupos.filter((g) => (tipo === 'MTEXT' && g.codigo === 3) || g.codigo === 1);
    if (!trozos.length) return;
    // Sólo se sabe reescribir lo que va seguido en el fichero: los trozos de un
    // MTEXT lo están siempre (3,3,…,1). Si algún CAD los separase, se deja
    // estar antes que reescribir encima de otro grupo.
    for (let i = 1; i < trozos.length; i++) {
      if (trozos[i].linea !== trozos[i - 1].linea + 2) return;
    }
    parrafos.push({
      tipo,
      // El texto se lee de las líneas TAL CUAL: `leerPares` recorta los
      // espacios de cada valor y un MTEXT partido en trozos los lleva a
      // propósito —el corte cae donde cae—, así que un trim se comería el
      // espacio entre «de los» y «micropilotes».
      texto: trozos.map((t) => lineas[t.linea]).join(''),
      desde: trozos[0].linea - 1,
      hasta: trozos[trozos.length - 1].linea,
      capa: grupos.find((g) => g.codigo === 8)?.valor ?? '0',
    });
  });
  return parrafos;
}

/**
 * El texto, partido como lo parte el CAD: trozos de 250 en el código 3 y el
 * último en el código 1. El corte nunca cae detrás de una barra suelta, que
 * partiría un código de formato («\P», «\H0.8x;») en dos grupos.
 */
export function lineasDeParrafo(texto: string): string[] {
  const trozos: string[] = [];
  let resto = texto;
  while (resto.length > 250) {
    let corte = 250;
    let barras = 0;
    while (corte - 1 - barras >= 0 && resto[corte - 1 - barras] === '\\') barras++;
    if (barras % 2 === 1) corte--;
    trozos.push(resto.slice(0, corte));
    resto = resto.slice(corte);
  }
  const lineas: string[] = [];
  for (const t of trozos) par(lineas, 3, t);
  par(lineas, 1, resto);
  return lineas;
}

/**
 * Los cambios de línea pedidos, aplicados de atrás hacia delante.
 *
 * Reescribir un MTEXT puede cambiar el NÚMERO de líneas del fichero, y eso
 * mueve todo lo que venga detrás: si se aplicaran en orden, el segundo cambio
 * caería desplazado. De atrás hacia delante, cada uno encuentra su sitio donde
 * lo dejó la lectura.
 */
export interface Edicion {
  desde: number;
  /** Última línea sustituida, incluida. */
  hasta: number;
  lineas: string[];
}

export function aplicarEdiciones(lineas: string[], ediciones: Edicion[]): void {
  for (const e of [...ediciones].sort((a, b) => b.desde - a.desde)) {
    lineas.splice(e.desde, e.hasta - e.desde + 1, ...e.lineas);
  }
}
