/**
 * La plantilla del cuadro de vigas: el plano del estudio SIN las vigas del
 * ejemplo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE EXISTE ESTE FICHERO
 * ---------------------------------------------------------------------------
 * Los cuatro planos tipo de encepado y el de micropilote se rellenan tal cual:
 * el dibujo es el mismo siempre y solo cambian las cifras de una tabla, asi que
 * la plantilla que se publica es el .dxf del estudio byte a byte. El cuadro de
 * vigas no funciona asi. Su mitad izquierda -el criterio de armados, el esquema
 * de estribos y las notas- es fija, y su mitad derecha es una lista de tantas
 * secciones como vigas tenga la obra: cuarenta y tres en el fichero que dio el
 * usuario, tres en la obra siguiente. Esa mitad hay que dibujarla, no rellenarla.
 *
 * De ahi este recorte. La plantilla que se publica lleva SOLO la mitad que no
 * cambia; la de la derecha la compone `src/lib/dxf/vigas.ts` con las vigas
 * guardadas en el anejo. El dia que el estudio retoque el criterio de armados
 * basta con volver a dejar su .dxf y ejecutar esto:
 *
 *     node scripts/recortar-vigas.mjs ["<ruta del dxf del estudio>"]
 *
 * ---------------------------------------------------------------------------
 * POR DONDE SE CORTA, Y POR QUE NO SE PUEDE CORTAR POR CAPA
 * ---------------------------------------------------------------------------
 * La tentacion es borrar las capas `CV-*` (Cuadro de Vigas) y quedarse con las
 * `DET-*` (el detalle). No vale: el esquema de estribos del pie del detalle
 * -el de ZONA A / ZONA B- esta dibujado en `CV-GEOMETRIA`, `CV-LINEAS`,
 * `CV-TEXTO` y `CV-COTAS`, las mismas cuatro capas que el cuadro. Borrando por
 * capa se llevaria por delante el esquema al que remiten las notas.
 *
 * Asi que se corta por POSICION. En el fichero del estudio el detalle ocupa
 * x en [0, 31,9] y el cuadro empieza en x = 34,3 (su marco). Entre los dos hay
 * dos unidades y media de calle en las que no hay nada, y la frontera se pone
 * en el medio.
 *
 * Cuatro capas son del cuadro entero y se van completas, sin mirar la x:
 * `CV-ARMADO` (barras y cercos), `CV-NUMERACION` (los V-01), `CP-ARMADO` (los
 * rotulos 3%%C12, que son bloques dinamicos insertados con su base a miles de
 * unidades del dibujo, de modo que su punto de insercion NO dice donde se ven)
 * y `EST-BORDE ESTRUCTURAS` (los puntos de referencia de la esquina de cada
 * seccion).
 *
 * De las cuatro mixtas se va lo que este entero a la derecha de la frontera.
 * "Entero": basta un vertice a la izquierda para quedarse. Es a proposito, y
 * cubre el sombreado del esquema de estribos, cuya seccion HATCH escribe un
 * (10,20) de elevacion en el 0,0 que no es un punto del dibujo.
 *
 * ---------------------------------------------------------------------------
 * LO QUE NO SE TOCA
 * ---------------------------------------------------------------------------
 * Todo lo demas viaja intacto: HEADER, CLASSES, TABLES -con sus capas, sus
 * estilos de texto y sus estilos de cota-, BLOCKS, OBJECTS y ACDSDATA. Las
 * definiciones de bloque del ejemplo se quedan dentro aunque ya no las use
 * nadie: purgarlas obligaria a tocar tambien la tabla BLOCK_RECORD y los
 * grafos de evaluacion de los bloques dinamicos que hay en OBJECTS, y el
 * premio son unos cientos de kilobytes de un fichero que se descarga una vez.
 *
 * Las capas siguen definidas aunque se queden sin entidades, que es justo lo
 * que hace falta: `vigas.ts` dibuja en ellas.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ORIGEN_POR_DEFECTO = resolve(
  raiz,
  '..',
  'ejemplos encepado',
  'ENCEPADOS DXF',
  'EJEMPLO VIGAS.dxf',
);
const DESTINO = resolve(raiz, 'public', 'plantillas', 'vigas.dxf');

/** La calle entre el detalle (acaba en 31,9) y el cuadro (empieza en 34,3). */
const FRONTERA = 33;

/** Capas que son del cuadro del ejemplo enteras. */
const CAPAS_DEL_CUADRO = new Set([
  'CV-ARMADO',
  'CV-NUMERACIÓN',
  'CP-ARMADO',
  'EST-BORDE ESTRUCTURAS',
]);

/** Capas compartidas por el detalle y el cuadro: se decide por la x. */
const CAPAS_MIXTAS = new Set(['CV-GEOMETRÍA', 'CV-LÍNEAS', 'CV-COTAS', 'CV-TEXTO']);

// ── Lectura: el fichero como la lista de pares codigo/valor que es ──────────

/** @typedef {{ codigo: number, valor: string }} Par */

/** @returns {Par[]} */
function leerPares(lineas) {
  const pares = [];
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    const crudo = lineas[i].trim();
    if (crudo === '') break;
    const codigo = Number(crudo);
    if (!Number.isInteger(codigo)) {
      throw new Error(`Linea ${i + 1}: "${lineas[i]}" no es un codigo de grupo`);
    }
    pares.push({ codigo, valor: lineas[i + 1] });
  }
  return pares;
}

/** Rango [primerPar, indiceDelEndsec] de una seccion. */
function seccion(pares, nombre) {
  for (let i = 0; i + 1 < pares.length; i++) {
    if (pares[i].codigo !== 0 || pares[i].valor.trim() !== 'SECTION') continue;
    if (pares[i + 1].codigo !== 2 || pares[i + 1].valor.trim() !== nombre) continue;
    for (let j = i + 2; j < pares.length; j++) {
      if (pares[j].codigo === 0 && pares[j].valor.trim() === 'ENDSEC') return [i + 2, j];
    }
  }
  throw new Error(`El fichero no tiene seccion ${nombre}`);
}

/**
 * Las entidades de un rango, cada una con sus pares.
 *
 * Una POLYLINE arrastra sus VERTEX y su SEQEND, y un INSERT con atributos sus
 * ATTRIB y su SEQEND: son una sola cosa y se borran juntas o no se borra
 * ninguna. Un VERTEX huerfano deja el fichero ilegible.
 */
function entidades(pares, desde, hasta) {
  const lista = [];
  let actual = null;
  let cola = false; // dentro de un POLYLINE/INSERT que aun espera su SEQEND
  for (let i = desde; i < hasta; i++) {
    const p = pares[i];
    if (p.codigo !== 0) continue;
    const tipo = p.valor.trim();
    if (cola) {
      if (tipo === 'VERTEX' || tipo === 'ATTRIB') continue;
      if (tipo === 'SEQEND') {
        cola = false;
        continue;
      }
      cola = false; // por si algun fichero se deja el SEQEND
    }
    if (actual) actual.fin = i;
    actual = { tipo, ini: i, fin: hasta };
    lista.push(actual);
    if (tipo === 'POLYLINE' || tipo === 'INSERT') cola = true;
  }
  return lista;
}

/** El primer valor de un codigo dentro de la entidad. */
function primero(pares, e, codigo) {
  for (let i = e.ini; i < e.fin; i++) if (pares[i].codigo === codigo) return pares[i].valor.trim();
  return undefined;
}

/**
 * El manejador del DUENO de la entidad (grupo 330).
 *
 * No vale coger el primer 330 y ya: un objeto con reactores escribe los suyos
 * dentro de un grupo `102 {ACAD_REACTORS … 102 }`, TAMBIEN como 330, y en un
 * ACDB_BLOCKREPRESENTATION_DATA ese bloque va por delante del dueno de verdad.
 * Se salta lo que este entre llaves.
 */
function dueno(pares, e) {
  let dentro = false;
  for (let i = e.ini; i < e.fin; i++) {
    const p = pares[i];
    if (p.codigo === 102) {
      dentro = p.valor.trim().startsWith('{');
      continue;
    }
    if (!dentro && p.codigo === 330) return p.valor.trim();
  }
  return undefined;
}

/**
 * Las x de los puntos de la entidad.
 *
 * Y "de los puntos", no "de los grupos 10": un MTEXT escribe detras del
 * `101 Embedded Object` un grupo 10 que vale 1.0 y no es un punto, sino la
 * componente x del vector de direccion del texto. Contandolo, los setenta y un
 * rotulos del cuadro del ejemplo -todos ellos MTEXT- parecian tener un punto en
 * x = 1 y se salvaban del recorte. De ahi que la lectura vaya por tipo: en las
 * entidades que se colocan por un punto se mira SOLO el primero, y en las que
 * son geometria, todos.
 */
const UN_SOLO_PUNTO = new Set([
  'MTEXT',
  'TEXT',
  'ATTRIB',
  'ATTDEF',
  'INSERT',
  'POINT',
  'CIRCLE',
  'ARC',
  'ELLIPSE',
]);

function equis(pares, e) {
  const xs = [];
  const uno = UN_SOLO_PUNTO.has(e.tipo);
  for (let i = e.ini; i + 1 < e.fin; i++) {
    const c = pares[i].codigo;
    const siguiente = pares[i + 1].codigo;
    if ((c === 10 && siguiente === 20) || (!uno && c === 11 && siguiente === 21)) {
      const x = Number(pares[i].valor);
      if (Number.isFinite(x)) xs.push(x);
      if (uno) break;
    }
  }
  return xs;
}

// ── El recorte ──────────────────────────────────────────────────────────────

/**
 * Los objetos de la seccion OBJECTS que se quedan sin dueno al borrar el
 * cuadro, y que hay que borrar con el.
 *
 * Los rotulos «3%%C12» del ejemplo son bloques dinamicos, y cada INSERT de un
 * bloque dinamico cuelga de un DICCIONARIO de extension propio que a su vez
 * cuelga un ACDB_BLOCKREPRESENTATION_DATA con el estado de visibilidad.
 * Borrando los setenta INSERT se quedaban ciento cuarenta objetos apuntando a
 * un dueno que ya no existe: el fichero abre igual y el CAD los purga, pero el
 * plano del estudio no tiene ni uno y la plantilla que sale de aqui tampoco
 * deberia. `ezdxf` los cuenta, y por eso se sabe que son exactamente esos.
 *
 * El barrido es por propiedad y en cascada: se borra lo que cuelga de algo
 * borrado, y luego lo que cuelga de eso, hasta que no queda nada. Un
 * diccionario de extension no lo referencia nadie mas que su propia entidad,
 * asi que no deja punteros colgando en ningun otro sitio.
 */
function barrerObjetos(pares, fuera, huerfanos) {
  const [desde, hasta] = seccion(pares, 'OBJECTS');
  const objetos = entidades(pares, desde, hasta);
  let barridos = 0;
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    let nuevos = 0;
    for (const o of objetos) {
      if (o.borrado) continue;
      const padre = dueno(pares, o);
      if (padre === undefined || !huerfanos.has(padre)) continue;
      o.borrado = true;
      barridos++;
      nuevos++;
      for (let i = o.ini; i < o.fin; i++) fuera.add(i);
      const manejador = primero(pares, o, 5);
      if (manejador) huerfanos.add(manejador);
    }
    if (nuevos === 0) break;
  }
  return barridos;
}

function esDelCuadro(pares, e) {
  const capa = primero(pares, e, 8);
  if (capa === undefined) return false;
  if (CAPAS_DEL_CUADRO.has(capa)) return true;
  if (!CAPAS_MIXTAS.has(capa)) return false;
  const xs = equis(pares, e);
  return xs.length > 0 && xs.every((x) => x > FRONTERA);
}

function main() {
  const origen = process.argv[2] ? resolve(process.argv[2]) : ORIGEN_POR_DEFECTO;
  const crudo = readFileSync(origen, 'utf8');
  const lineas = crudo.split(/\r\n|\n|\r/);
  const pares = leerPares(lineas);
  const [desde, hasta] = seccion(pares, 'ENTITIES');

  const lista = entidades(pares, desde, hasta);
  const fuera = new Set();
  const cuenta = new Map();
  const huerfanos = new Set();
  let quitadas = 0;
  for (const e of lista) {
    if (!esDelCuadro(pares, e)) continue;
    quitadas++;
    const capa = primero(pares, e, 8) ?? '?';
    cuenta.set(capa, (cuenta.get(capa) ?? 0) + 1);
    for (let i = e.ini; i < e.fin; i++) fuera.add(i);
    const manejador = primero(pares, e, 5);
    if (manejador) huerfanos.add(manejador);
  }
  const objetos = barrerObjetos(pares, fuera, huerfanos);

  // Reescribir desde los pares perderia el formato del codigo (el DXF de
  // AutoCAD los alinea a la derecha en tres columnas) y, sobre todo, obligaria
  // a confiar en que el parseo es perfecto. Se copian las LINEAS del original,
  // saltando las de las entidades que se van.
  const texto = reconstruir(lineas, pares, fuera);

  mkdirSync(dirname(DESTINO), { recursive: true });
  writeFileSync(DESTINO, texto, 'utf8');

  // ── Lo que se ha hecho, para poder mirarlo ────────────────────────────────
  const parRest = leerPares(texto.split('\r\n'));
  const restantes = entidades(parRest, ...seccion(parRest, 'ENTITIES'));
  const porCapa = new Map();
  let maxX = -Infinity;
  let minX = Infinity;
  for (const e of restantes) {
    const capa = primero(parRest, e, 8) ?? '?';
    porCapa.set(capa, (porCapa.get(capa) ?? 0) + 1);
    // Los HATCH quedan fuera de la medida: sus grupos 10 mezclan el punto de
    // elevacion, los del contorno y la base de la trama, que en el sombreado
    // del detalle esta a dos mil unidades del dibujo.
    if (e.tipo === 'HATCH') continue;
    for (const x of equis(parRest, e)) {
      if (x > maxX) maxX = x;
      if (x < minX) minX = x;
    }
  }

  console.log(`Origen : ${origen}`);
  console.log(`Destino: ${DESTINO}`);
  console.log(`\nQuitadas ${quitadas} entidades del cuadro del ejemplo (y ${objetos} objetos suyos):`);
  for (const [capa, n] of [...cuenta].sort()) console.log(`   ${capa.padEnd(24)} ${n}`);
  console.log(`\nQuedan ${restantes.length} entidades:`);
  for (const [capa, n] of [...porCapa].sort()) console.log(`   ${capa.padEnd(24)} ${n}`);
  console.log(`\nExtension en x: [${minX.toFixed(2)}, ${maxX.toFixed(2)}]  (frontera ${FRONTERA})`);
  console.log(`Tamano: ${(crudo.length / 1024).toFixed(0)} kB -> ${(texto.length / 1024).toFixed(0)} kB`);

  if (maxX > FRONTERA) {
    console.error(`\nAVISO: queda geometria a la derecha de la frontera (x = ${maxX.toFixed(2)}).`);
    process.exitCode = 1;
  }
}

/**
 * El fichero sin las lineas de las entidades que se van, copiando el resto
 * tal cual. `pares[i]` ocupa las lineas 2i y 2i+1 del original mientras no se
 * haya saltado ninguna, que es el caso: se lee de corrido desde el principio.
 */
function reconstruir(lineas, pares, fuera) {
  const salida = [];
  for (let i = 0; i < pares.length; i++) {
    if (fuera.has(i)) continue;
    salida.push(lineas[2 * i], lineas[2 * i + 1]);
  }
  // La cola del fichero tras el ultimo par (el EOF y lo que venga detras).
  for (let i = 2 * pares.length; i < lineas.length; i++) salida.push(lineas[i]);
  return salida.join('\r\n');
}

main();
