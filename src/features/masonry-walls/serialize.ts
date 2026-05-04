// Masonry walls — serialización del modelo para share-URL
//
// Codifica un MasonryWallState como cadena URL-safe comprimida con lz-string.
// Permite que el técnico copie un enlace y otro técnico abra el mismo caso
// pegando el enlace en su navegador.
//
// Por qué comprimir: el state nested (plantas → huecos + puntuales) en un
// edificio típico de rehabilitación se serializa a 2-4 KB de JSON, que sin
// comprimir produce URLs ~3-6 KB. Muchos entornos corporativos cortan URLs
// >4-8 KB. lz-string en variante base64-URL comprime 3-5x para datos
// repetitivos como los de cálculo estructural, dejando el URL bajo el
// límite seguro.
//
// Patrón idéntico al de fem-analysis/serialize.ts.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { MasonryWallState } from '../../lib/calculations/masonryWalls';

/**
 * Codifica un MasonryWallState como cadena URL-safe comprimida. La salida
 * puede pegarse directamente en un query param sin codificación adicional.
 *
 * Round-trip: decodeShareString(encodeShareString(s)) deep-equals s.
 */
export function encodeShareString(state: MasonryWallState): string {
  const json = JSON.stringify(state);
  return compressToEncodedURIComponent(json);
}

/**
 * Decodifica una cadena de share-URL devolviendo el MasonryWallState. Devuelve
 * null cuando la entrada está corrupta, vacía o no es un state válido producido
 * por encodeShareString. La validación es ligera: estructura básica + presencia
 * de campos obligatorios. La validación profunda (γM > 0, fk > 0, etc.) la
 * hace el motor en `calcularEdificio` vía la validation gate.
 */
export function decodeShareString(encoded: string): MasonryWallState | null {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;
    if (!isValidState(parsed)) return null;
    return parsed as MasonryWallState;
  } catch {
    return null;
  }
}

/**
 * Construye una URL completa con `?model=...` con el state codificado.
 * `baseUrl` por defecto es `window.location.origin + window.location.pathname`,
 * para que el destinatario aterrice en el mismo módulo.
 */
export function buildShareUrl(state: MasonryWallState, baseUrl?: string): string {
  const encoded = encodeShareString(state);
  const url = baseUrl ?? defaultBaseUrl();
  // Si la URL trae ya `?model=...` o cualquier otro param, lo desechamos para
  // que el enlace generado no se concatene con queries previas.
  const cleanUrl = url.includes('?') ? url.slice(0, url.indexOf('?')) : url;
  return `${cleanUrl}?model=${encoded}`;
}

function defaultBaseUrl(): string {
  if (typeof window === 'undefined') return '/rehab/muros-fabrica';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

/**
 * Comprobación de forma ligera. Verifica que las claves obligatorias del
 * MasonryWallState estén presentes y tengan los tipos primarios correctos.
 * No valida valores numéricos (eso lo hace la validation gate del motor).
 */
function isValidState(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (s.fabricaModo !== 'tabla' && s.fabricaModo !== 'custom') return false;
  if (typeof s.pieza !== 'string') return false;
  if (typeof s.fb !== 'number' || typeof s.fm !== 'number') return false;
  if (typeof s.fk_custom !== 'number' || typeof s.gamma_custom !== 'number') return false;
  if (typeof s.gamma_M !== 'number') return false;
  if (typeof s.gamma_G !== 'number' || typeof s.gamma_Q !== 'number') return false;
  if (typeof s.L !== 'number' || typeof s.t !== 'number') return false;
  if (!Array.isArray(s.plantas) || s.plantas.length === 0) return false;
  // Cada planta debe tener al menos id + nombre + H + arrays huecos/puntuales.
  for (const pl of s.plantas) {
    if (!pl || typeof pl !== 'object') return false;
    const p = pl as Record<string, unknown>;
    if (typeof p.id !== 'string' || typeof p.nombre !== 'string') return false;
    if (typeof p.H !== 'number') return false;
    if (!Array.isArray(p.huecos) || !Array.isArray(p.puntuales)) return false;
  }
  return true;
}
