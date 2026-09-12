/**
 * Publicaciones entre módulos.
 *
 * Decisión del diseño de Memorias (2026-09-03): un módulo NUNCA lee el
 * localStorage interno de otro. Lo que quiere compartir lo escribe en una
 * clave `concreta-pub-<modulo>` dentro de un sobre versionado; quien lo
 * consume —la ficha DB SE, el cuadro de acciones del plano— lee el sobre y
 * decide si le vale por su versión, su fecha y su obra:
 *
 *  - `v` es la versión del ESQUEMA de `datos`. Un consumidor que pide la
 *    versión 1 y encuentra la 2 recibe `null`, no un objeto a medias.
 *  - `ts` es la fecha de publicación. Si es más nueva que la confirmación del
 *    consumidor, lo heredado pasa a ámbar («revisar»).
 *  - `configurado` dice si el módulo tenía algo que decir, o si lo que hay es
 *    su caso de arranque. Sin él, abrir un módulo una vez bastaba para que sus
 *    valores de partida entraran en un documento firmado.
 *  - `obra` es el EMPLAZAMIENTO en el que se calculó lo publicado, y se
 *    compara por PROVINCIA: es la escala a la que cambian la zona eólica, la
 *    nieve y la peligrosidad sísmica. Si no coincide con la del consumidor, lo
 *    publicado es un dato fantasma —la zona de Granada en una memoria de
 *    Málaga—. No distingue DOS OBRAS del mismo sitio, y no pretende hacerlo:
 *    de eso se encarga el contenedor de proyectos, que al abrir otra obra
 *    reemplaza estas claves en vez de fundirlas (ver `lib/proyecto`).
 *
 * Nace con «Viento y nieve» (D-VN4, 2026-09-04), el primer módulo que publica.
 */

import { PREFIJO_PUB } from '../../data/proyectoKeys';
import { borrarClave, escribirClave, leerClave } from '../storage/seguro';

export interface ObraPublicada {
  municipio: string | null;
  /** Nombre de la provincia. */
  provincia: string | null;
  /** Código INE: dos dígitos de la provincia, o cinco del municipio si se conoce. */
  ine: string | null;
}

export interface Publicacion<T> {
  v: number;
  /** ISO 8601. */
  ts: string;
  modulo: string;
  obra: ObraPublicada;
  /**
   * El módulo tenía algo QUE DECIR de ESTA obra: ni los valores de arranque ni
   * el caso de ejemplo. Lo decide cada módulo, que es el único que sabe cómo
   * es su estado inicial; el consumidor sólo lee el booleano.
   *
   * OPCIONAL y aditivo a propósito: un sobre escrito antes de 2026-09-12 no lo
   * lleva, y por eso NO sube la `v` de nadie. Subirla habría dejado a Cargas
   * por planta sin viento, sin nieve y sin sismo en su cuadro del plano, sin
   * decir nada. Ausente o distinto de `true` = sin configurar.
   */
  configurado?: boolean;
  datos: T;
}

export { PREFIJO_PUB };

export function clavePublicacion(modulo: string): string {
  return `${PREFIJO_PUB}${modulo}`;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function esSobre(p: unknown): p is Publicacion<unknown> {
  return (
    esObjeto(p) &&
    typeof p.v === 'number' &&
    typeof p.ts === 'string' &&
    typeof p.modulo === 'string' &&
    esObjeto(p.obra) &&
    'datos' in p
  );
}

/**
 * Escribe la publicación de un módulo. Devuelve el sobre escrito, o `null` si
 * el almacenamiento no está disponible (modo privado, cuota llena): publicar
 * es un efecto secundario del cálculo y no puede tumbar el módulo.
 */
export function publicar<T>(
  modulo: string,
  v: number,
  datos: T,
  obra: Partial<ObraPublicada> = {},
  configurado?: boolean,
): Publicacion<T> | null {
  const sobre: Publicacion<T> = {
    v,
    ts: new Date().toISOString(),
    modulo,
    obra: {
      municipio: obra.municipio ?? null,
      provincia: obra.provincia ?? null,
      ine: obra.ine ?? null,
    },
    // `undefined` no se serializa: el sobre de quien no lo pase sigue siendo
    // byte a byte el de antes.
    configurado,
    datos,
  };
  if (!escribirClave(clavePublicacion(modulo), JSON.stringify(sobre))) return null;
  marcarCambio();
  return sobre;
}

/**
 * Lee la publicación de un módulo. `null` si no hay, si no es un sobre, si es
 * de otro módulo o —cuando se pide `v`— si el esquema no es el esperado.
 */
export function leerPublicacion<T>(modulo: string, v?: number): Publicacion<T> | null {
  try {
    const bruto = leerClave(clavePublicacion(modulo));
    if (!bruto) return null;
    const p: unknown = JSON.parse(bruto);
    if (!esSobre(p) || p.modulo !== modulo) return null;
    if (v !== undefined && p.v !== v) return null;
    return p as Publicacion<T>;
  } catch {
    return null;
  }
}

export function retirarPublicacion(modulo: string): void {
  borrarClave(clavePublicacion(modulo));
  marcarCambio();
}

// ── El store ────────────────────────────────────────────────────────────────
//
// Un consumidor que enseña lo publicado tiene que enterarse de que ha cambiado
// sin recargar: se publica desde OTRA ruta de la app —el usuario va al módulo
// de sismo, calcula y vuelve—, y el evento `storage` no se dispara en la
// pestaña que escribe. Mismo patrón que `lib/anejo`, y por las mismas razones.

const oyentes = new Set<() => void>();

export function suscribirPubs(fn: () => void): () => void {
  oyentes.add(fn);
  // `key: null` es el `clear()` del cambio de obra.
  const otraPestana = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(PREFIJO_PUB)) fn();
  };
  window.addEventListener('storage', otraPestana);
  return () => {
    oyentes.delete(fn);
    window.removeEventListener('storage', otraPestana);
  };
}

/**
 * Una marca que cambia cuando cambia CUALQUIER sobre. No es el contenido: cada
 * consumidor lee los suyos con `leerPublicacion`, que ya sabe qué versiones
 * quiere. Lo que `useSyncExternalStore` necesita es un valor estable que se
 * mueva cuando haya que repintar, y eso es esto.
 */
export function versionDePubs(): number {
  return version;
}

let version = 0;

function marcarCambio(): void {
  version += 1;
  for (const fn of oyentes) fn();
}
