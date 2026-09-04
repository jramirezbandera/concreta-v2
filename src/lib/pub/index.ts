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
 *  - `obra` es la obra a la que pertenece lo publicado. Si el municipio no
 *    coincide con el del consumidor, es un dato fantasma a escala de módulo.
 *
 * Nace con «Viento y nieve» (D-VN4, 2026-09-04), el primer módulo que publica.
 */

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
  datos: T;
}

export const PREFIJO_PUB = 'concreta-pub-';

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
    datos,
  };
  try {
    localStorage.setItem(clavePublicacion(modulo), JSON.stringify(sobre));
    return sobre;
  } catch {
    return null;
  }
}

/**
 * Lee la publicación de un módulo. `null` si no hay, si no es un sobre, si es
 * de otro módulo o —cuando se pide `v`— si el esquema no es el esperado.
 */
export function leerPublicacion<T>(modulo: string, v?: number): Publicacion<T> | null {
  try {
    const bruto = localStorage.getItem(clavePublicacion(modulo));
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
  try {
    localStorage.removeItem(clavePublicacion(modulo));
  } catch {
    // Sin almacenamiento no hay nada que retirar.
  }
}
