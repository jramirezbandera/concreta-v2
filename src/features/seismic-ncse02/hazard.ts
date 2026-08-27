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
}

/**
 * Lo que se le dice al usuario cuando el buscador no encuentra nada.
 *
 * El dataset lleva SOLO las filas del Anejo 1, así que un "no encontrado" no
 * distingue un municipio exento de una errata. El mensaje tiene que cubrir los
 * dos casos de forma explícita: si sugiriese únicamente la errata, el usuario
 * seguiría buscando algo que no existe; si afirmase únicamente la exención,
 * una falta de ortografía se leería como "la Norma no me obliga".
 */
export const MENSAJE_NO_ENCONTRADO =
  'No figura en el Anejo 1 de la NCSE-02. Si el nombre es correcto, significa ' +
  'ab < 0,04 g y la Norma no es de aplicación obligatoria (art. 1.2.3). ' +
  'Si no, revisa la ortografía.';

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
  return { ine: d.ine[i], nombre: d.nombre[i], ab: d.abValores[d.ab[i]], k: d.kValores[d.k[i]] };
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
