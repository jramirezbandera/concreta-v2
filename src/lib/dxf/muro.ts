/**
 * Los planos tipo de muro de contención del estudio, con los números de ESTE
 * cálculo.
 *
 * Tercer plano que se rellena, después de los cuatro de encepados y el de
 * micropilote, y por la misma razón y con la misma regla, que el usuario
 * repitió al traer los ficheros: «los dibujos son genéricos, lo que
 * cambiaríamos son los datos de la tabla». El esquema no está a escala de los
 * datos —un muro de 6 m sale dibujado igual que uno de 2, con la tabla
 * diciendo 600 y 200— y la plantilla se copia tal cual salvo las celdas que se
 * sustituyen. La maquinaria —leer el DXF como pares código/valor, encontrar la
 * tabla por su cabecera, medir el texto con la fuente del plano y reescribir
 * sólo lo que toca— vive en `plantilla.ts`; aquí está lo que es de este plano.
 *
 * **Tres planos y no uno**, porque la zapata puede volar a los dos lados o a
 * uno solo, y el armado cambia con ella:
 *
 *   · tipo 1 «con talón»  — zapata con talón y puntera. Columnas H A B C E D.
 *   · tipo 2 «sin talón»  — la zapata sólo vuela por delante. Sin columna D.
 *   · tipo 3 «sin pie»    — la zapata sólo vuela por detrás. Sin columna C.
 *
 * El tipo 2 no tiene casillas As5 ni As7: sin talón no hay tierras encima de
 * la zapata, la flexión no cambia de signo y la cara superior no lleva
 * armadura principal. Es lo que dice el propio plano —el estudio no las
 * dibujó— y es lo que fija qué lado es cuál: el vuelo que lleva armadura
 * superior es el talón (trasdós) y el que no, la puntera (intradós).
 *
 * **Qué mide cada cota** (medido en los DXF del estudio, no supuesto):
 *   H canto de la zapata · A altura libre del fuste sobre la zapata ·
 *   B ancho TOTAL de la zapata · C puntera · D talón · E espesor del fuste.
 *
 * B es el ancho total y no «fuste + puntera»: la primera versión del plano lo
 * acotaba desde la cara de trasdós del fuste y el usuario lo corrigió el
 * 2026-09-22, de modo que hoy D + E + C = B.
 *
 * **Qué armadura va en cada casilla** (lo dicen los rótulos del dibujo y lo
 * ratificó el usuario el 2026-09-22):
 *   As1 vertical de trasdós del fuste · As2 vertical de intradós · As3
 *   horizontal del fuste, POR CARA · As4 principal inferior de la zapata
 *   (la de la puntera) · As5 principal superior (la del talón) · As6
 *   transversal inferior, de reparto · As7 transversal superior.
 *
 * Todas van por diámetro y separación, que es como las pide el módulo y como
 * se arma un muro: por metro de muro, no por número de barras. Las dos cifras
 * de la plantilla que dicen «8Ø20» y «4Ø16» son un resto de la tabla de
 * encepados de la que el estudio copió ésta; al rellenarlas salen como las
 * demás.
 *
 * **Lo que no cabe en una celda se parte en dos líneas dentro de ella**, igual
 * que en los encepados: «Ø16c/15» mide 5,9 alturas de letra con la fuente del
 * plano y la casilla 5,2. Las casillas de armadura ya vienen partidas de
 * fábrica —el estudio escribió «Ø16» encima y «c/15» debajo, a 0,75 alturas
 * del centro— y ésas se rellenan línea a línea; las de cota y las de As1 y As2
 * vienen de una sola línea y se parten clonando la entidad, como allí.
 *
 * **Y una nota al pie**, en la capa y el estilo de la tabla: los materiales y
 * el recubrimiento, que no tienen casilla, y la armadura que el plano tipo
 * elegido no sabe dibujar (la superior de la zapata en un muro sin talón, si
 * el cálculo la dispone). Callarlo dejaría un plano pidiendo menos acero del
 * comprobado. Va en un renglón, y en dos si ni encogida al cuerpo mínimo
 * legible cabría en uno: bajo la tabla de estos planos no hay marco, al revés
 * que en los encepados, donde la nota no se parte nunca porque no cabría.
 */

import type { RetainingWallInputs } from '../../data/defaults';
import { dec } from '../units/format';
import { muroFallbackDxf, titledFilename } from '../export/filename';
import type { ResultadoExport } from '../export/descargar';
import { ARMADURAS, NOMBRE_TIPO, campo, tipoDeMuro, type TipoMuro } from './muroPlano';
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
  type Celda,
  type Texto,
} from './plantilla';

// `ErrorPlantilla` se reexporta porque es el error que mira quien llama.
export { ErrorPlantilla, anchoTexto } from './plantilla';
// Y el tipo de plano, para quien ya tiene este módulo cargado y no quiere
// saber que la elección vive en el fichero de al lado.
export { NOMBRE_TIPO, TIPOS_MURO, armadurasSinDefinir, tipoDeMuro, type TipoMuro } from './muroPlano';

/** Ruta pública de la plantilla, relativa a la base. */
export function rutaPlantilla(tipo: TipoMuro): string {
  return `plantillas/muro-${tipo}.dxf`;
}

// ── Lo que dice cada casilla ────────────────────────────────────────────────

/** Centímetros, que es como cota la tabla: entero si lo es, y si no «32,5». */
function cm(valor: number): string {
  return dec(valor, Math.abs(valor - Math.round(valor)) < 0.05 ? 0 : 1);
}

/** Una cota del módulo, que la guarda en metros. */
function cota(m: number): string {
  return cm(m * 100);
}

/** «%%C12c/20»: el %%C es el código de Ø que ya usan las celdas de la plantilla.
 *  El módulo guarda el diámetro y la separación en milímetros. */
function aSeparacion(diam: number, sep: number): string {
  if (diam <= 0 || sep <= 0) return '-';
  return `%%C${dec(diam, 0)}c/${cm(sep / 10)}`;
}

/** El valor de cada cabecera de la tabla. Lo que el plano no tenga, no se usa. */
export function valoresDeTabla(inp: RetainingWallInputs): Record<string, string> {
  const valores: Record<string, string> = {
    H: cota(inp.hf as number),
    A: cota(inp.H as number),
    B: cota((inp.bTalon as number) + (inp.tFuste as number) + (inp.bPunta as number)),
    C: cota(inp.bPunta as number),
    D: cota(inp.bTalon as number),
    E: cota(inp.tFuste as number),
  };
  for (const a of ARMADURAS) {
    valores[a.etiqueta] = aSeparacion(campo(inp, a.diam), campo(inp, a.sep));
  }
  return valores;
}

/**
 * La nota del pie, por piezas: título, materiales y la armadura que no tiene
 * casilla. Por piezas y no ya unida porque si no cabe en el ancho de la tabla
 * hay que partirla, y sólo se puede partir por donde ella misma se separa.
 */
function notaAlPie(inp: RetainingWallInputs, tipo: TipoMuro): string[] {
  const partes = [
    `HA-${dec(inp.fck as number, 0)}`,
    `B${dec(inp.fyk as number, 0)}S`,
    `rec. ${cm((inp.cover as number) / 10)} cm`, // el módulo guarda el recubrimiento en mm
  ];
  for (const a of ARMADURAS) {
    if (a.tipos.includes(tipo)) continue;
    const v = aSeparacion(campo(inp, a.diam), campo(inp, a.sep));
    if (v !== '-') partes.push(`arm. ${a.nombre} ${v}`);
  }
  const titulo = inp.title.trim();
  if (titulo) partes.unshift(titulo);
  return partes;
}

/** Las piezas en dos renglones lo más parejos posible, por su separador. */
function enDosRenglones(partes: string[]): [string, string] {
  let corte = 1;
  let mejor = Infinity;
  for (let i = 1; i < partes.length; i++) {
    const desnivel = Math.abs(
      anchoTexto(partes.slice(0, i).join(' · '), 1) - anchoTexto(partes.slice(i).join(' · '), 1),
    );
    if (desnivel < mejor) {
      mejor = desnivel;
      corte = i;
    }
  }
  return [partes.slice(0, corte).join(' · '), partes.slice(corte).join(' · ')];
}

// ── Relleno ─────────────────────────────────────────────────────────────────

/** Una casilla de la tabla con sus una o dos líneas de texto, de arriba abajo. */
interface Casilla {
  etiqueta: string;
  ancho: number;
  lineas: Texto[];
}

/**
 * Las celdas sueltas que devuelve `celdasDeTabla`, agrupadas por casilla.
 *
 * Aquélla devuelve una por TEXT de la fila de datos, que es lo que necesitan
 * los encepados —allí toda casilla es de una línea—. Aquí las de armadura
 * vienen ya partidas en dos TEXT de la plantilla, y las dos caen en la misma
 * cabecera: sin agrupar, la segunda vuelta del bucle escribiría el valor
 * entero encima de la línea de abajo.
 */
function porCasilla(celdas: Celda[]): Casilla[] {
  const mapa = new Map<string, Casilla>();
  for (const c of celdas) {
    const casilla = mapa.get(c.etiqueta);
    if (casilla) casilla.lineas.push(c.texto);
    else mapa.set(c.etiqueta, { etiqueta: c.etiqueta, ancho: c.ancho, lineas: [c.texto] });
  }
  for (const c of mapa.values()) c.lineas.sort((a, b) => b.y - a.y);
  return [...mapa.values()];
}

/**
 * La plantilla del estudio con los números de este cálculo.
 *
 * Devuelve el fichero entero. El plano tipo se elige con `tipoDeMuro(inp)`, el
 * mismo que usa quien trae la plantilla, para que el dibujo y la nota al pie
 * no puedan hablar de muros distintos. Lanza `ErrorPlantilla` si el .dxf no es
 * el esperado: antes un error claro que un plano con las cotas de otra obra.
 */
export function rellenarMuro(plantilla: string, inp: RetainingWallInputs): string {
  const tipo = tipoDeMuro(inp);
  const lineas = plantilla.split(/\r\n|\n|\r/);
  const pares = leerPares(lineas);
  if (!pares.length) throw new ErrorPlantilla('La plantilla no es un DXF de pares código/valor');
  const entidades = seccion(pares, 'ENTITIES');
  if (!entidades) throw new ErrorPlantilla('La plantilla no tiene sección ENTITIES');
  const [desde, hasta] = entidades;

  // El ancla es «As1»: la primera cabecera de armadura, que está en los tres
  // planos y no se confunde con nada del dibujo. (El rótulo del pie, «MURO DE
  // CONTENCION TIPO n», tiene otra altura de letra y queda fuera de la tabla.)
  const textos = leerTextos(pares, desde, hasta);
  const ancla = textos.find((t) => t.texto === 'As1' && t.altura > 0);
  if (!ancla) throw new ErrorPlantilla('No se encuentra la tabla de la plantilla');

  const h = ancla.altura;
  const { celdas, yFila } = celdasDeTabla(pares, desde, hasta, textos, ancla);
  if (!celdas.length) throw new ErrorPlantilla('La tabla de la plantilla no tiene fila de datos');
  // Y que la tabla sea la de un muro. «As1» sola no basta: las de encepado
  // también la tienen, y un plano de encepado con las cotas de un muro escritas
  // en sus casillas se descubriría en obra. Las cuatro columnas que están en
  // los tres tipos y en ningún otro plano del estudio son H, A, B y E.
  const cabeceras = new Set(celdas.map((c) => c.etiqueta));
  const falta = ['H', 'A', 'B', 'E'].filter((c) => !cabeceras.has(c));
  if (falta.length) {
    throw new ErrorPlantilla(
      `La tabla de la plantilla no es la de un muro: le faltan las columnas ${falta.join(', ')}`,
    );
  }

  // Manejadores para lo que se añade: las segundas líneas de celda y la nota.
  const iSemilla = pares.findIndex((p, i) => p.codigo === 5 && pares[i - 1]?.valor === '$HANDSEED');
  const semilla = iSemilla >= 0 ? pares[iSemilla] : null;
  let manejador = primerManejadorLibre(pares, semilla?.valor ?? '0');
  const siguiente = () => (manejador++).toString(16).toUpperCase();
  const nuevas: string[] = [];

  // 1. Las cifras de la tabla, casilla a casilla.
  const valores = valoresDeTabla(inp);
  const medio = 0.75 * h;
  const moverY = (t: Texto, dy: number) => {
    for (const g of t.grupos) {
      if (g.codigo === 20 || g.codigo === 21) lineas[g.linea] = (num(g.valor) + dy).toFixed(6);
    }
  };
  for (const casilla of porCasilla(celdas)) {
    const v = valores[casilla.etiqueta];
    if (v === undefined) continue;
    const dos = anchoTexto(v, h) > 0.88 * casilla.ancho ? partir(v) : null;
    const [arriba, abajo] = casilla.lineas;
    if (!abajo) {
      // Casilla de una línea en la plantilla: las cotas, y As1 y As2.
      if (!dos) {
        lineas[arriba.linea] = v;
        continue;
      }
      lineas[arriba.linea] = dos[0];
      moverY(arriba, medio);
      nuevas.push(...clonTexto(arriba.grupos, siguiente(), dos[1], -medio));
      continue;
    }
    // Casilla que la plantilla ya trae partida en dos: las de armadura.
    if (dos) {
      lineas[arriba.linea] = dos[0];
      lineas[abajo.linea] = dos[1];
      continue;
    }
    // Un valor de una línea en una casilla de dos: sólo puede pasar con un «-»,
    // y sólo si alguien rellena sin definir el armado (la pantalla no deja
    // exportar así). Se centra en la casilla y la segunda línea se queda en
    // blanco: un TEXT vacío es válido y no dibuja nada, y borrar la entidad
    // obligaría a mover índices de línea que están en uso.
    lineas[arriba.linea] = v;
    moverY(arriba, -medio);
    lineas[abajo.linea] = '';
  }

  // 2. La nota al pie, en la capa y el estilo de la propia tabla, al cuerpo de
  //    los rótulos del plano si cabe en el hueco y en el ancho de la tabla.
  const zona = zonaDeNotas(pares, desde, hasta, h, yFila);
  if (zona) {
    const partes = notaAlPie(inp, tipo);
    const ancho = 0.95 * zona.ancho;
    // El cuerpo de los rótulos del plano (0,78 de la letra de la tabla) y el
    // mínimo por debajo del cual una nota deja de leerse impresa.
    const cuerpo = 0.78 * h;
    const minimo = 0.5 * h;
    const cabe = (renglones: string[]) =>
      Math.min(
        cuerpo,
        zona.hueco / (2.3 + 1.5 * (renglones.length - 1)),
        ...renglones.map((r) => ancho / anchoTexto(r, 1)),
      );
    // Un renglón si cabe encogiéndose lo justo; dos si ni al mínimo legible
    // cabría en uno. Dos y no más: bajo la tabla de estos planos no hay nada,
    // pero una nota de tres renglones ya es un bloque de notas, y eso es otra
    // cosa. (En los encepados no se parte nunca: allí el marco del plano pasa
    // a 0,6 unidades de la tabla y no hay sitio para el segundo renglón.)
    let renglones = [partes.join(' · ')];
    if (cabe(renglones) < minimo && partes.length > 1) renglones = enDosRenglones(partes);
    const altura = Math.max(minimo, cabe(renglones));
    renglones.forEach((texto, i) => {
      nuevas.push(
        ...entidadTexto(
          {
            x: zona.x,
            y: zona.y - (1.8 + 1.5 * i) * altura,
            altura,
            texto,
            capa: ancla.capa,
            estilo: ancla.estilo,
            dueno: ancla.dueno,
          },
          siguiente(),
        ),
      );
    });
  }

  // Todo lo nuevo va al final de las entidades, DESPUÉS de tocar las celdas:
  // el splice corre los índices de lo que hay detrás. El HANDSEED vive en la
  // cabecera, muy por delante, y no se mueve.
  if (semilla) lineas[semilla.linea] = manejador.toString(16).toUpperCase();
  if (nuevas.length) lineas.splice(pares[hasta].linea - 1, 0, ...nuevas);

  return lineas.join('\r\n');
}

/**
 * Punto de entrada del botón: trae la plantilla del tipo que toca y la
 * devuelve rellena.
 *
 * Las plantillas viven en `public/` y NO entran en el precache del service
 * worker (su `globPatterns` no incluye .dxf): son 870 KB que sólo necesita
 * quien exporta un muro, así que se bajan la primera vez que se pulsa y de ahí
 * en adelante las sirve la caché en tiempo de ejecución.
 */
export async function exportarMuroDxf(
  inp: RetainingWallInputs,
  titulo?: string,
): Promise<ResultadoExport> {
  // El título llega por parámetro y se impone al del estado: `setField` es un
  // setState y, en el instante de exportar, `inp.title` es todavía el de ANTES
  // de escribir en el modal.
  const datos = titulo === undefined ? inp : { ...inp, title: titulo };
  const tipo = tipoDeMuro(datos);
  const respuesta = await fetch(`${import.meta.env.BASE_URL}${rutaPlantilla(tipo)}`);
  if (!respuesta.ok) {
    throw new ErrorPlantilla(`No se pudo cargar el plano tipo de muro ${NOMBRE_TIPO[tipo]}`);
  }
  return {
    blob: new Blob([rellenarMuro(await respuesta.text(), datos)], { type: 'image/vnd.dxf' }),
    filename: titledFilename(titulo ?? '', muroFallbackDxf(tipo), 'dxf'),
  };
}
