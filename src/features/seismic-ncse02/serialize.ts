// Sismo NCSE-02 — serialización del modelo para share-URL.
//
// Mismo patrón que `masonry-walls/serialize.ts` y `fem-analysis/serialize.ts`:
// lz-string en variante base64-URL, para que el enlace quepa donde los entornos
// corporativos cortan (4-8 KB). Un edificio de diez plantas con su desglose de
// cargas y sus planos resistentes se va a 3-5 KB de JSON sin comprimir.
//
// Lo que NO viaja en el enlace: el municipio se manda por su código INE, no con
// `ab` y `K` copiados, para que quien lo abra lea los valores del dataset que
// tenga instalado. Si el IGN republicase la capa, un enlace antiguo daría los
// valores nuevos, que es lo que debe pasar: el enlace identifica un edificio en
// un sitio, no una foto de la peligrosidad de aquel día.
//
// Salvedad deliberada: `ab` y `K` viajan igualmente, porque hay casos de entrada
// manual sin municipio, y porque abrir un enlace no puede quedar bloqueado
// esperando a que cargue el dataset. Al abrirlo, si hay `municipioIne`, la UI
// los refresca contra la tabla.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { normalizeSeismicState, type SeismicState } from './state';

/**
 * Codifica un `SeismicState` como cadena URL-safe comprimida. La salida puede
 * pegarse en un query param sin codificación adicional.
 */
export function encodeShareString(state: SeismicState): string {
  return compressToEncodedURIComponent(JSON.stringify(state));
}

/**
 * Decodifica una cadena de share-URL. Devuelve `null` cuando está vacía,
 * corrupta o no es un estado de este módulo.
 *
 * La validación es de forma, no de valores: que `H` sea positiva o que las
 * declaraciones estén contestadas lo deciden las puertas del motor, no esto.
 * Aquí sólo se separa "esto no es un caso de sismo" de "esto es un caso de
 * sismo con datos que habrá que revisar".
 */
export function decodeShareString(encoded: string): SeismicState | null {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;
    if (!tieneFormaDeCaso(parsed)) return null;
    return normalizeSeismicState(parsed);
  } catch {
    return null;
  }
}

/** Construye la URL completa con `?model=...`. */
export function buildShareUrl(state: SeismicState, baseUrl?: string): string {
  const url = baseUrl ?? urlBase();
  const limpia = url.includes('?') ? url.slice(0, url.indexOf('?')) : url;
  return `${limpia}?model=${encodeShareString(state)}`;
}

function urlBase(): string {
  if (typeof window === 'undefined') return '/ciment/sismo';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

/**
 * Comprobación de forma mínima. Pide lo que ningún otro módulo de Concreta
 * tiene junto —emplazamiento sísmico, plantas y las dos direcciones—, para que
 * pegar el enlace de otro módulo no cargue un caso a medias.
 */
function tieneFormaDeCaso(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (typeof s.ab !== 'number' || typeof s.K !== 'number') return false;
  if (typeof s.sistema !== 'string' || typeof s.importancia !== 'string') return false;
  if (!Array.isArray(s.plantas) || s.plantas.length === 0) return false;
  for (const d of [s.x, s.y]) {
    if (!d || typeof d !== 'object') return false;
    const dir = d as Record<string, unknown>;
    if (typeof dir.L !== 'number') return false;
    if (!Array.isArray(dir.elementos)) return false;
  }
  return true;
}
