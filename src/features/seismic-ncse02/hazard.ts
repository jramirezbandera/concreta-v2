// Acceso a la tabla del Anejo 1 de la NCSE-02 (aceleración sísmica básica `ab`
// y coeficiente de contribución `K` por municipio).
//
// ─────────────────────────────────────────────────────────────────────────────
// ESTE ES EL ÚNICO FICHERO QUE IMPORTA EL DATASET, Y LO HACE CON `import()`
// ─────────────────────────────────────────────────────────────────────────────
// Lo que decide en qué chunk acaba el dataset es el GRAFO DE IMPORTS, no la
// carpeta en la que vive. Un import estático desde aquí lo arrastraría al chunk
// de entrada aunque el fichero siga estando bajo `features/`.
//
// La regla que hay que sostener: ningún módulo alcanzable desde el arranque
// importa el dataset, ni estática ni transitivamente. `lib/codes/seismic/` son
// funciones puras y no lo tocan; el único importador es la carga perezosa de
// abajo, detrás del buscador de municipios.
//
// El tamaño ya no es el argumento: la tabla pesa 106 KB porque el Anejo 1 son
// 2.610 municipios, no los ~8.100 que se supusieron al planificar (el Anejo 1
// solo lista los de `ab >= 0,04 g`). Se mantiene la disciplina por higiene del
// arranque, no por peso.

/**
 * De dónde salen `ab` y `K` cuando NO salen directamente de la capa del IGN.
 *
 * Las tres son minoría —26 filas de 2.635—, y aun así el tipo existe porque la
 * diferencia es normativa, no de trazabilidad: en `anejo1-texto` el valor es
 * literalmente el del Anejo 1, mientras que en `segregado` es una HERENCIA que
 * la Norma no escribe con ese nombre de municipio, porque en 2002 no existía.
 * Quien firma la memoria tiene derecho a saber cuál de las dos está usando, así
 * que esto viaja hasta la pantalla y hasta el PDF.
 */
export type Procedencia =
  | {
      /** El Anejo 1 lo lista, pero la capa del IGN no le pone aceleración. */
      tipo: 'anejo1-texto';
      /** La entrada literal del BOE, para poder contrastarla. */
      boe: string;
    }
  | {
      /** Municipio creado después de 2002: hereda de su municipio de origen. */
      tipo: 'segregado';
      padre: { ine: string; nombre: string };
      anio: number;
      fusion?: boolean;
    }
  | {
      /** La capa del IGN contradice al texto legal y manda el texto. */
      tipo: 'correccion';
      motivo: string;
    };

/** Forma del fichero generado por `scripts/harvest-ign-hazard.mjs`. */
interface HazardColumnar {
  /** Código INE de 5 dígitos, ordenado ascendente. */
  ine: string[];
  /** Nombre oficial tal cual lo publica el IGN. */
  nombre: string[];
  /** Variantes de búsqueda precalculadas, plegadas y separadas por `|`. */
  clave: string[];
  /** Índice en `abValores`. */
  ab: number[];
  /** Índice en `kValores`. */
  k: number[];
  abValores: number[];
  kValores: number[];
  /**
   * Mapa DISPERSO por código INE: sólo las filas que no son cosecha directa de
   * la capa. Las 2.609 restantes no llevan entrada.
   */
  procedencia: Record<string, Procedencia>;
}

export interface Municipio {
  /** Código INE de 5 dígitos. */
  ine: string;
  /** Nombre oficial. Puede ser bilingüe (`Alicante/Alacant`). */
  nombre: string;
  /** Aceleración sísmica básica, adimensional (múltiplo de g). */
  ab: number;
  /** Coeficiente de contribución K, adimensional. */
  k: number;
  /** `null` cuando `ab` y `K` salen tal cual de la capa del IGN. */
  procedencia: Procedencia | null;
}

/**
 * Cómo se le cuenta al usuario de dónde sale la peligrosidad de un municipio.
 * Frase corta, apta para el panel y para el pie del PDF.
 */
export function textoProcedencia(p: Procedencia | null): string {
  if (!p) return 'Anejo 1 de la NCSE-02';
  switch (p.tipo) {
    case 'anejo1-texto':
      return 'Anejo 1 de la NCSE-02 · leído del texto del BOE';
    case 'correccion':
      return 'Anejo 1 de la NCSE-02 · corregido contra el texto del BOE';
    case 'segregado':
      return (
        `Heredado de ${p.padre.nombre} · el municipio se creó en ${p.anio} y el Anejo 1, ` +
        'de 2002, no lo nombra'
      );
  }
}

/**
 * Lo que se le dice al usuario cuando el buscador no encuentra nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE MENSAJE NO PUEDE AFIRMAR LA EXENCIÓN. Son TRES causas, no una.
 * ─────────────────────────────────────────────────────────────────────────────
 * La versión anterior decía "si el nombre es correcto, significa ab < 0,04 g y
 * la Norma no es de aplicación obligatoria". Eso es una conclusión normativa
 * —la más grave que emite el módulo— deducida de un fallo de búsqueda, y el
 * dataset no la sostiene. Un "no encontrado" tiene tres causas distintas:
 *
 *   1. El municipio está de verdad por debajo de 0,04 g. Exento (art. 1.2.3).
 *   2. Hay una errata, o el nombre oficial se escribe de otra forma.
 *   3. El municipio NO EXISTÍA EN 2002 y por eso el Anejo 1 no lo nombra.
 *      Los segregados posteriores se suplementan heredando de su municipio de
 *      origen (ver `scripts/ncse02-suplemento.mjs`), pero esa tabla se mantiene
 *      a mano y puede quedarse corta: una alta reciente cae aquí.
 *
 * Presentar (1) como la lectura por defecto convierte (2) y (3) en exenciones
 * silenciosas. Por eso el mensaje enumera las tres y ofrece la salida —entrada
 * manual de ab y K— en vez de dejar al usuario sin ninguna.
 */
export const MENSAJE_NO_ENCONTRADO =
  'No figura en el Anejo 1 de la NCSE-02. Puede ser que el municipio esté por ' +
  'debajo de 0,04 g y quede exento (art. 1.2.3), que el nombre lleve una ' +
  'errata, o que el municipio se creara después de 2002 y la Norma lo liste ' +
  'bajo el municipio del que se segregó. Compruébalo antes de darlo por ' +
  'exento: si procede, introduce ab y K a mano.';

let promesa: Promise<HazardColumnar> | null = null;

/**
 * Carga la tabla. Memoizada: la segunda llamada devuelve la misma promesa, así
 * que teclear en el buscador no dispara una descarga por pulsación.
 */
export function cargarHazard(): Promise<HazardColumnar> {
  promesa ??= import('./ncse02.hazard.json').then((m) => m.default as HazardColumnar);
  return promesa;
}

/**
 * Pliega lo que teclea el usuario para poder compararlo con las claves.
 *
 * Se pliega LA CONSULTA, no el dataset: las claves vienen ya plegadas del
 * harvester, que es donde se resuelven los acentos (26,9 % de los nombres), el
 * artículo invertido (8,5 %) y los nombres bilingües (1,4 %). Aquí solo hay que
 * dejar la consulta en la misma forma.
 */
export function plegarConsulta(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function filaA(d: HazardColumnar, i: number): Municipio {
  const ine = d.ine[i];
  return {
    ine,
    nombre: d.nombre[i],
    ab: d.abValores[d.ab[i]],
    k: d.kValores[d.k[i]],
    procedencia: d.procedencia[ine] ?? null,
  };
}

/**
 * Busca municipios por nombre. Devuelve como mucho `limite` resultados.
 *
 * Prefiere los que empiezan por la consulta y deja después los que la contienen,
 * porque quien teclea "cor" busca antes Córdoba que Alcorcón.
 */
export async function buscarMunicipios(consulta: string, limite = 20): Promise<Municipio[]> {
  const q = plegarConsulta(consulta);
  if (!q) return [];
  const d = await cargarHazard();
  const empiezan: number[] = [];
  const contienen: number[] = [];
  for (let i = 0; i < d.ine.length; i++) {
    const claves = d.clave[i].split('|');
    if (claves.some((c) => c.startsWith(q))) empiezan.push(i);
    else if (claves.some((c) => c.includes(q))) contienen.push(i);
    if (empiezan.length >= limite) break;
  }
  return [...empiezan, ...contienen].slice(0, limite).map((i) => filaA(d, i));
}

/**
 * Busca por código INE exacto. Devuelve `null` si no está en el Anejo 1, que
 * NO es lo mismo que "no existe": ver `MENSAJE_NO_ENCONTRADO`.
 */
export async function municipioPorIne(ine: string): Promise<Municipio | null> {
  const d = await cargarHazard();
  // El dataset va ordenado por código INE, así que búsqueda binaria.
  let lo = 0;
  let hi = d.ine.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = d.ine[mid].localeCompare(ine);
    if (c === 0) return filaA(d, mid);
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}
