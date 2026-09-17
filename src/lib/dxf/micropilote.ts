/**
 * El detalle tipo de micropilote del estudio, con los números de ESTE cálculo.
 *
 * Segundo plano que se rellena, después de los cuatro de encepados, y por la
 * misma razón y con la misma regla: el esquema es genérico y siempre igual, y
 * lo único que cambia de una obra a otra son las cifras. La maquinaria —leer el
 * DXF como pares código/valor, encontrar la tabla por su cabecera, medir el
 * texto con la fuente del plano y reescribir sólo lo que toca— vive en
 * `plantilla.ts`; aquí está lo que es de este plano: qué dice cada casilla y
 * qué rótulos del dibujo llevan datos.
 *
 * **La tabla.** Ocho casillas: el Ø del micropilote, Ø1, Ø2, e1, Ø3, e2, h1 y
 * L. Qué significa cada una lo dice el propio dibujo, y el usuario lo ratificó
 * el 2026-09-17:
 *   Ø y Ø1 son la perforación · Ø2 el Ø exterior del tubo · e1 su espesor ·
 *   Ø3 la chapa de la cabeza · e2 el espesor de la chapa · h1 la altura de la
 *   cartela · L la longitud del micropilote.
 *
 * De esas ocho, siete salen del cálculo: la perforación y el tubo son datos de
 * entrada, la chapa sale de la Guía Fomento §3.8 (bc = 0,75·Dn, y el espesor de
 * chapa se toma igual al del tubo) y la longitud es la del fuste. **h1 no**: la
 * altura de la cartela es un detalle constructivo del estudio, no lo calcula el
 * módulo, y por eso su casilla se queda con el valor del plano tipo —igual que
 * el «Cartela e=10 mm», las 3Ø20 soldadas y los cordones de 15/50/8 del
 * despiece de cabezal—. Lo que el relleno no sepa, no lo toca.
 *
 * **Los rótulos con datos.** Tres, y los tres se reescriben:
 *   1. La cota de la derecha, «L: Longitud media estimada 9,00 m».
 *   2. El bloque MATERIALES del pie: el acero del tubo y el fck de la lechada
 *      (o el mortero). El tipo de inyección se queda como está: el módulo
 *      trabaja con presión de inyección y no distingue IU / IR / IRS.
 *   3. La estratigrafía del bloque «PARÁMETROS DE DISEÑO DEL PILOTAJE». Esto
 *      es lo que MÁS importa cambiar: la plantilla trae la de una obra concreta
 *      —rellenos, aluvial, plioceno, con sus NSPT— y si no se sustituye, ese
 *      texto viaja en todos los planos que exporte la aplicación. Se mantienen
 *      la prosa del estudio y las notas de ejecución, y se cambia sólo la lista
 *      de unidades por los estratos del módulo. Sin nombres de unidad, porque
 *      el módulo no los pide: «Estrato 1 - Granular (0,00 a 3,30 m)».
 *
 * **Sin letras griegas.** El estilo del plano es Century Gothic, que no trae
 * griego: una γ o una φ saldrían como un cuadrado en el CAD. Por eso los
 * estratos se describen con NSPT, su y rf,lím —que es lo que la propia frase
 * del bloque promete, «estratigrafía y resistencias unitarias del terreno»— y
 * no con los parámetros de cálculo, que están en el PDF.
 */

import type { MicropilesInputs, SoilLayer } from '../../data/defaults';
import type { MicropilesResult } from '../calculations/micropiles';
import type { ResultadoExport } from '../export/descargar';
import { micropiloteFallbackDxf, titledFilename } from '../export/filename';
import { dec } from '../units/format';
import {
  ErrorPlantilla,
  anchoTexto,
  aplicarEdiciones,
  celdasDeTabla,
  clonTexto,
  leerPares,
  leerParrafos,
  leerTextos,
  lineasDeParrafo,
  num,
  partir,
  primerManejadorLibre,
  seccion,
  type Edicion,
} from './plantilla';

export { ErrorPlantilla } from './plantilla';

/** Ruta pública de la plantilla, relativa a la base. */
export const RUTA_PLANTILLA = 'plantillas/micropilote.dxf';

// ── Lo que dice cada casilla ────────────────────────────────────────────────

/** Una cota en milímetros: entera si lo es, y si no con un decimal («88,9»). */
function mm(v: number): string {
  return dec(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1);
}

/** Espesor de pared del tubo, que el motor da como Ø exterior e interior. */
function espesorTubo(res: MicropilesResult): number {
  return (res.de - res.di) / 2;
}

/**
 * El valor de cada cabecera de la tabla. Las cabeceras son los propios textos
 * del plano, con el «%%C» del CAD para la Ø; lo que no esté aquí —h1— se queda
 * como lo dibujó el estudio.
 */
export function valoresDeTabla(inp: MicropilesInputs, res: MicropilesResult): Record<string, string> {
  return {
    MICROPILOTE: mm(inp.drillDiameter),
    '%%C1': mm(inp.drillDiameter),
    '%%C2': mm(res.de),
    e1: mm(espesorTubo(res)),
    '%%C3': mm(res.bc * 10),          // cm → mm, que es como cota la tabla
    e2: mm(res.t_chapa),
    L: dec(res.length, Math.abs(res.length - Math.round(res.length)) < 0.005 ? 0 : 2),
  };
}

// ── Los rótulos del dibujo que llevan datos ─────────────────────────────────

/** «L: Longitud media estimada 16,00 m» — la cota de la derecha del dibujo. */
function textoLongitud(res: MicropilesResult): string {
  return `L: Longitud media estimada ${dec(res.length, 2)} m`;
}

/**
 * El bloque MATERIALES: acero del tubo y lechada. El acero se escribe por su
 * límite elástico y no por designación comercial («S550»), porque lo que el
 * módulo pide es fy en N/mm² y un fy de 551 no es ninguna designación.
 */
function conMateriales(texto: string, inp: MicropilesInputs): string {
  const grout = inp.groutType === 'mortero' ? 'Mortero' : 'Lechada';
  return texto
    .replace(/Acero tubo estructural[^\\]*/, `Acero tubo estructural fy = ${dec(inp.steelGrade, 0)} MPa`)
    .replace(/(?:Lechada|Mortero) de inyecci[oó]n[^\\]*/, `${grout} de inyección fck > ${dec(inp.concreteGrade, 0)} MPa`);
}

/** Una línea por estrato: dónde empieza, dónde acaba y qué resistencia tiene. */
export function lineasDeEstratigrafia(inp: MicropilesInputs, soil: SoilLayer[]): string[] {
  const lineas: string[] = [];
  let z = 0;
  soil.forEach((e, i) => {
    const z0 = z;
    z += e.thickness;
    const datos: string[] = [];
    if (e.Nspt > 0) datos.push(`NSPT = ${dec(e.Nspt, 0)}`);
    if (e.type === 'cohesive' && e.su > 0) datos.push(`su = ${dec(e.su, 0)} kPa`);
    if (e.rflim > 0) datos.push(`rf,lim = ${dec(e.rflim, 2)} MPa`);
    const tipo = e.type === 'granular' ? 'Granular' : 'Cohesivo';
    lineas.push(
      `Estrato ${i + 1} - ${tipo} (${dec(z0, 2)} a ${dec(z, 2)} m): ` +
      (datos.length ? datos.join('; ') : 'no se considera su resistencia'),
    );
  });
  lineas.push(`Nivel freático: ${dec(inp.waterTableDepth, 2)} m bajo rasante`);
  lineas.push(
    `Micropilote: cabeza a ${dec(inp.topDepth, 2)} m y punta a ${dec(inp.toeDepth, 2)} m bajo rasante`,
  );
  return lineas;
}

/**
 * La estratigrafía del bloque de notas, cambiada por la del módulo.
 *
 * Se corta entre dos anclas del propio texto: la frase del estudio geotécnico,
 * que acaba en «…micropilotes:», y el rótulo «NOTAS EJECUCIÓN DE MICROPILOTES».
 * Entre ellas va la lista, y el resto —prosa, formatos y notas— viaja intacto.
 * El corte cae en el «\P» anterior al rótulo para que los códigos de formato
 * que lo preceden sigan con él.
 *
 * No se emite ningún código de altura ni de fuente: en ese punto del bloque la
 * altura vigente es la del cuerpo y la fuente la del estilo, y dejándolas como
 * están el rótulo que sigue se lee exactamente igual que en la plantilla.
 */
function conEstratigrafia(texto: string, inp: MicropilesInputs, soil: SoilLayer[]): string {
  const ANCLA_INTRO = 'micropilotes:';
  const ANCLA_NOTAS = 'NOTAS EJECUCI';
  const iIntro = texto.indexOf(ANCLA_INTRO);
  const iNotas = texto.indexOf(ANCLA_NOTAS);
  if (iIntro < 0 || iNotas < 0 || iNotas < iIntro) {
    throw new ErrorPlantilla(
      'El bloque de parámetros de diseño de la plantilla no tiene la forma esperada',
    );
  }
  const corte = texto.lastIndexOf('\\P', iNotas);
  if (corte < iIntro) throw new ErrorPlantilla('No se encuentra dónde acaba la estratigrafía');
  const cabeza = texto.slice(0, iIntro + ANCLA_INTRO.length);
  const cola = texto.slice(corte);
  // El \\P de más deja una línea en blanco antes del rótulo de las notas,
  // como la tenía la plantilla.
  return `${cabeza}\\P\\pql;\\P${lineasDeEstratigrafia(inp, soil).join('\\P')}\\P${cola}`;
}

// ── Relleno ─────────────────────────────────────────────────────────────────

/**
 * La plantilla del estudio con los números de este cálculo.
 *
 * Devuelve el fichero entero. Lanza `ErrorPlantilla` si el .dxf no es el
 * esperado: antes un error claro que un plano con los datos de otra obra.
 */
export function rellenarMicropilote(
  plantilla: string,
  inp: MicropilesInputs,
  soil: SoilLayer[],
  res: MicropilesResult,
): string {
  const lineas = plantilla.split(/\r\n|\n|\r/);
  const pares = leerPares(lineas);
  if (!pares.length) throw new ErrorPlantilla('La plantilla no es un DXF de pares código/valor');
  const entidades = seccion(pares, 'ENTITIES');
  if (!entidades) throw new ErrorPlantilla('La plantilla no tiene sección ENTITIES');
  const [desde, hasta] = entidades;

  // Las cotas con texto forzado se escriben DOS VECES en el fichero: en la
  // propia COTA, dentro de ENTITIES, y en el MTEXT del bloque anónimo que el
  // CAD genera para dibujarla, dentro de BLOCKS. Si sólo se cambiara la
  // primera, AutoCAD seguiría enseñando la longitud de la plantilla hasta que
  // alguien regenerase el dibujo. Por eso los rótulos se buscan en las dos
  // secciones; la tabla, en cambio, vive entera en ENTITIES.
  const bloques = seccion(pares, 'BLOCKS');

  const textos = leerTextos(pares, desde, hasta);
  const ancla = textos.find((t) => t.texto === 'MICROPILOTE' && t.altura > 0);
  if (!ancla) throw new ErrorPlantilla('No se encuentra la tabla de la plantilla');

  const h = ancla.altura;
  const { celdas } = celdasDeTabla(pares, desde, hasta, textos, ancla);
  if (!celdas.length) throw new ErrorPlantilla('La tabla de la plantilla no tiene fila de datos');

  const iSemilla = pares.findIndex((p, i) => p.codigo === 5 && pares[i - 1]?.valor === '$HANDSEED');
  const semilla = iSemilla >= 0 ? pares[iSemilla] : null;
  let manejador = primerManejadorLibre(pares, semilla?.valor ?? '0');
  const siguiente = () => (manejador++).toString(16).toUpperCase();
  const nuevas: string[] = [];

  // 1. Las cifras de la tabla, celda a celda; lo que no cabe en su casilla con
  //    la fuente del plano se parte en dos líneas, como en los encepados.
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

  // 2. Los tres rótulos con datos. Cada uno puede cambiar de número de líneas
  //    —un MTEXT largo va en trozos de 250—, así que se juntan y se aplican al
  //    final, de atrás hacia delante.
  const ediciones: Edicion[] = [];
  let estratigrafiaHecha = false;
  const rotulos = [
    ...(bloques ? leerParrafos(pares, bloques[0], bloques[1], lineas) : []),
    ...leerParrafos(pares, desde, hasta, lineas),
  ];
  for (const p of rotulos) {
    let nuevo: string | null = null;
    if (p.texto.includes('Longitud media estimada')) {
      nuevo = textoLongitud(res);
    } else if (p.texto.includes('MATERIALES') && p.texto.includes('Acero tubo estructural')) {
      nuevo = conMateriales(p.texto, inp);
    } else if (p.texto.includes('ESTUDIO GEOTECNICO') || p.texto.includes('ESTUDIO GEOTÉCNICO')) {
      nuevo = conEstratigrafia(p.texto, inp, soil);
      estratigrafiaHecha = true;
    }
    if (nuevo !== null && nuevo !== p.texto) {
      ediciones.push({ desde: p.desde, hasta: p.hasta, lineas: lineasDeParrafo(nuevo) });
    }
  }
  if (!estratigrafiaHecha) {
    throw new ErrorPlantilla('La plantilla no trae el bloque de parámetros de diseño del pilotaje');
  }

  // Lo nuevo va al final de las entidades y las ediciones de rótulos van dentro
  // del fichero: primero se apunta todo y `aplicarEdiciones` lo aplica de atrás
  // hacia delante, que es la única forma de que ninguna mueva a la siguiente.
  if (semilla) lineas[semilla.linea] = manejador.toString(16).toUpperCase();
  if (nuevas.length) {
    ediciones.push({ desde: pares[hasta].linea - 1, hasta: pares[hasta].linea - 2, lineas: nuevas });
  }
  aplicarEdiciones(lineas, ediciones);

  return lineas.join('\r\n');
}

/**
 * Punto de entrada del botón: trae la plantilla y la devuelve rellena.
 *
 * La plantilla vive en `public/` y NO entra en el precache del service worker
 * (su `globPatterns` no incluye .dxf): son 200 KB que sólo necesita quien
 * exporta el detalle, así que se baja la primera vez que se pulsa y de ahí en
 * adelante la sirve la caché en tiempo de ejecución.
 */
export async function exportarMicropiloteDxf(
  inp: MicropilesInputs,
  soil: SoilLayer[],
  res: MicropilesResult,
  titulo?: string,
): Promise<ResultadoExport> {
  const respuesta = await fetch(`${import.meta.env.BASE_URL}${RUTA_PLANTILLA}`);
  if (!respuesta.ok) throw new ErrorPlantilla('No se pudo cargar el plano tipo de micropilote');
  const relleno = rellenarMicropilote(
    await respuesta.text(),
    titulo === undefined ? inp : { ...inp, title: titulo },
    soil,
    res,
  );
  return {
    blob: new Blob([relleno], { type: 'image/vnd.dxf' }),
    filename: titledFilename(titulo ?? '', micropiloteFallbackDxf(), 'dxf'),
  };
}
