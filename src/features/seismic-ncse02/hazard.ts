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
  /**
   * Provincia, deducida de los dos primeros dígitos del código INE.
   *
   * No es adorno: hay municipios HOMÓNIMOS con peligrosidades muy distintas, y
   * sin la provincia el desplegable los presenta como dos filas idénticas. Los
   * dos «Torrent» —Girona 0,05 g y Valencia 0,07 g— se diferencian sólo en
   * esto, y elegir el que no era rebaja el cortante basal un 30 % sin que nada
   * lo delate.
   */
  provincia: string;
  /** Aceleración sísmica básica, adimensional (múltiplo de g). */
  ab: number;
  /** Coeficiente de contribución K, adimensional. */
  k: number;
  /** `null` cuando `ab` y `K` salen tal cual de la capa del IGN. */
  procedencia: Procedencia | null;
}

/**
 * Provincias por los dos primeros dígitos del código INE.
 *
 * La tabla va entera aunque el Anejo 1 sólo liste municipios de ab >= 0,04 g:
 * cuesta menos de un kilobyte y no hay que revisarla si algún día entra otra
 * provincia por un suplemento.
 */
const PROVINCIAS: Record<string, string> = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería',
  '05': 'Ávila', '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona',
  '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
  '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca',
  '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
  '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid',
  '29': 'Málaga', '30': 'Murcia', '31': 'Navarra', '32': 'Ourense',
  '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria',
  '40': 'Segovia', '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona',
  '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid',
  '48': 'Bizkaia', '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta',
  '52': 'Melilla',
};

/** Provincia de un código INE. Cadena vacía si el prefijo no está en la tabla. */
export function provinciaDe(ine: string): string {
  return PROVINCIAS[ine.slice(0, 2)] ?? '';
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
 *
 * La memoización SUELTA la promesa si falla. Antes se quedaba con el rechazo
 * cacheado, y una caída de red al teclear la primera letra dejaba el buscador
 * muerto hasta recargar la página: toda búsqueda posterior reutilizaba aquel
 * fallo. Con el service worker sirviendo el chunk esto es raro, pero «raro» y
 * «silencioso» juntos es justo la combinación que hay que evitar aquí, porque
 * el usuario no distingue un buscador roto de un municipio que no figura — y lo
 * segundo, en esta pantalla, se lee como una exención.
 */
export function cargarHazard(): Promise<HazardColumnar> {
  promesa ??= import('./ncse02.hazard.json')
    .then((m) => m.default as HazardColumnar)
    .catch((e: unknown) => {
      promesa = null;
      throw e;
    });
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
    provincia: provinciaDe(ine),
    ab: d.abValores[d.ab[i]],
    k: d.kValores[d.k[i]],
    procedencia: d.procedencia[ine] ?? null,
  };
}

/**
 * Busca municipios por nombre. Devuelve como mucho `limite` resultados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CUATRO NIVELES, Y EL DE ARRIBA ES EL NOMBRE COMPLETO
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes eran dos —empiezan por, contienen— y dentro de cada uno mandaba el
 * orden del dataset, que es el del código INE. Así, quien teclea "granada"
 * recibía primero «Granada (La)» (Barcelona, 08, ab 0,04 g) que Granada capital
 * (18, ab 0,23 g), sólo porque su provincia tiene un número menor. Un factor
 * SEIS en la aceleración, decidido por el orden alfabético de las provincias.
 *
 * No basta con exigir coincidencia exacta contra las CLAVES: el harvester
 * indexa también la forma sin artículo, así que «granada» es clave exacta de
 * las dos. Lo que las separa es el NOMBRE OFICIAL COMPLETO plegado, y por eso
 * ese es el primer nivel. Se pliega sólo el puñado de filas que ya han empatado
 * en clave exacta, no las 2.635.
 *
 * Tampoco se corta el barrido al llenar el primer nivel: con 2.635 filas el
 * recorrido completo no se nota, y pararse antes escondía coincidencias
 * exactas de código INE alto detrás de prefijos de código bajo.
 */
export async function buscarMunicipios(consulta: string, limite = 20): Promise<Municipio[]> {
  const q = plegarConsulta(consulta);
  if (!q) return [];
  const d = await cargarHazard();
  const exactas: number[] = [];
  const empiezan: number[] = [];
  const contienen: number[] = [];
  for (let i = 0; i < d.ine.length; i++) {
    const claves = d.clave[i].split('|');
    if (claves.some((c) => c === q)) exactas.push(i);
    else if (claves.some((c) => c.startsWith(q))) empiezan.push(i);
    else if (claves.some((c) => c.includes(q))) contienen.push(i);
  }
  const nombreExacto = exactas.filter((i) => plegarConsulta(d.nombre[i]) === q);
  const porClave = exactas.filter((i) => plegarConsulta(d.nombre[i]) !== q);
  return [...nombreExacto, ...porClave, ...empiezan, ...contienen]
    .slice(0, limite)
    .map((i) => filaA(d, i));
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
