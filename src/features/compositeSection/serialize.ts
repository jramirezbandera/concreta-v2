// Composite section — serialización del modelo para share-URL.
//
// El estado (CompositeSectionInputs) incluye el array anidado `plates`, así que
// NO cabe en useModuleState (que sólo serializa primitivos planos: haría
// String(array) → "[object Object]"). Usamos el mismo patrón `?model=<lz-string>`
// que masonry-walls / fem-analysis: JSON → lz-string compress → base64-URL.
//
// Nota: leemos/escribimos el param SIEMPRE vía URLSearchParams (set/get). Eso
// percent-encodea el `+` del alfabeto de lz-string como %2B, evitando el clásico
// "+→espacio" de los query strings. El round-trip set→get es simétrico.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { compositeSectionDefaults, type CompositeSectionInputs } from '../../data/defaults';

export const MODEL_URL_PARAM = 'model';

/**
 * Codifica un CompositeSectionInputs como cadena comprimida.
 * Round-trip: decodeShareString(encodeShareString(s)) deep-equals s.
 */
export function encodeShareString(state: CompositeSectionInputs): string {
  return compressToEncodedURIComponent(JSON.stringify(state));
}

/**
 * Decodifica la cadena de share-URL devolviendo el CompositeSectionInputs.
 * Devuelve null si está vacía, corrupta o no supera la validación de forma.
 * La validación profunda (perfil existe, etc.) la hace el motor en
 * calcCompositeSection.
 */
export function decodeShareString(encoded: string | null | undefined): CompositeSectionInputs | null {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;
    if (!isValidState(parsed)) return null;
    // Merge con defaults para tolerar payloads previos a campos nuevos.
    return { ...compositeSectionDefaults, ...parsed };
  } catch {
    return null;
  }
}

/**
 * Lee el modelo del URL actual (window.location). Útil al montar: si hay
 * `?model=...` el destinatario hereda el caso del emisor; si no, null.
 */
export function readModelFromUrl(): CompositeSectionInputs | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return decodeShareString(params.get(MODEL_URL_PARAM));
}

/**
 * Construye una URL completa con `?model=...` desde el estado en memoria.
 * `baseUrl` por defecto es origin+pathname para que el destinatario aterrice
 * en el mismo módulo. Cualquier query previa se descarta.
 */
export function buildShareUrl(state: CompositeSectionInputs, baseUrl?: string): string {
  const encoded = encodeShareString(state);
  if (!baseUrl && typeof window === 'undefined') {
    return `/acero/seccion-compuesta?${MODEL_URL_PARAM}=${encoded}`;
  }
  const base = baseUrl ?? `${window.location.origin}${window.location.pathname}`;
  const u = new URL(base);
  u.search = '';
  u.searchParams.set(MODEL_URL_PARAM, encoded);
  return u.toString();
}

/**
 * Comprobación de forma ligera de un CompositeSectionInputs deserializado.
 */
function isValidState(x: unknown): x is CompositeSectionInputs {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (typeof s.mode !== 'string') return false;
  if (s.profileType !== 'IPE' && s.profileType !== 'HEA' && s.profileType !== 'HEB') return false;
  if (typeof s.profileSize !== 'number' || !isFinite(s.profileSize)) return false;
  if (typeof s.grade !== 'string') return false;
  if (!Array.isArray(s.plates)) return false;
  for (const pl of s.plates) {
    if (!pl || typeof pl !== 'object') return false;
    const p = pl as Record<string, unknown>;
    if (typeof p.id !== 'string') return false;
    if (typeof p.b !== 'number' || !isFinite(p.b)) return false;
    if (typeof p.t !== 'number' || !isFinite(p.t)) return false;
    if (typeof p.posType !== 'string') return false;
    if (typeof p.customYBottom !== 'number' || !isFinite(p.customYBottom)) return false;
  }
  return true;
}
