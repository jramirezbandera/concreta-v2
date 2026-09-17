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


import {
  ErrorPlantilla,
  anchoTexto,
  celdasDeTabla,
  clonTexto,
  entidadTexto,
  leerPares,
  leerTextos,
  num,
  partir,
  primerManejadorLibre,
  seccion,
  zonaDeNotas,
} from './plantilla';

// La maquinaria de leer y reescribir el DXF vive en `plantilla.ts`, compartida
// con el plano tipo de micropilote. `ErrorPlantilla` se reexporta porque es el
// error que mira quien llama a este módulo.
export { ErrorPlantilla, anchoTexto } from './plantilla';


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
