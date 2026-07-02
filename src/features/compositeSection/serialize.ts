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

// Enums permitidos en el payload. `posType` fuera del enum caía en un switch
// sin default en calcCompositeSection → resultado entero NaN con valid:true
// (auditoría #109, mismo threat model que el bcType corrupto del review fix #1).
const VALID_MODES = ['reinforced', 'custom'];
const VALID_POS_TYPES = ['top', 'bottom', 'left', 'right', 'custom'];
const VALID_ANCHORS = ['web', 'flange'];

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v);
}

/** Campo opcional: ausente (lo completa el merge con defaults) o número finito. */
function optNum(v: unknown): boolean {
  return v === undefined || isFiniteNum(v);
}

/**
 * Comprobación de forma ligera de un CompositeSectionInputs deserializado.
 */
function isValidState(x: unknown): x is CompositeSectionInputs {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (typeof s.mode !== 'string' || !VALID_MODES.includes(s.mode)) return false;
  if (s.profileType !== 'IPE' && s.profileType !== 'HEA' && s.profileType !== 'HEB') return false;
  if (!isFiniteNum(s.profileSize)) return false;
  if (typeof s.grade !== 'string') return false;
  // Bloque de pandeo — opcional (payloads previos al bloque de compresión no lo
  // traen). Si viene, debe ser numérico: un `Ned: "x"` manipulado producía NaN
  // silencioso en las filas de check. bcType basura sí se tolera: el motor cae
  // a 'pp' (getBetaForBCType, review fix #1).
  if (!optNum(s.Ly) || !optNum(s.Lz) || !optNum(s.beta_y) || !optNum(s.beta_z) || !optNum(s.Ned)) return false;
  if (s.bcType !== undefined && typeof s.bcType !== 'string') return false;
  if (!Array.isArray(s.plates)) return false;
  for (const pl of s.plates) {
    if (!pl || typeof pl !== 'object') return false;
    const p = pl as Record<string, unknown>;
    if (typeof p.id !== 'string') return false;
    if (!isFiniteNum(p.b)) return false;
    if (!isFiniteNum(p.t)) return false;
    if (typeof p.posType !== 'string' || !VALID_POS_TYPES.includes(p.posType)) return false;
    if (!isFiniteNum(p.customYBottom)) return false;
    if (p.lateralAnchor !== undefined && !VALID_ANCHORS.includes(p.lateralAnchor as string)) return false;
    if (!optNum(p.lateralOffset)) return false;
  }
  return true;
}
