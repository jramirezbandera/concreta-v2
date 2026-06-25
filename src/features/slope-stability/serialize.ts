// Estabilidad de taludes — serialización del estado para enlaces compartibles.
//
// Codifica un SlopeInputs como cadena base64 URL-safe comprimida con lz-string.
// A diferencia del resto de módulos (estado plano vía useModuleState con
// serialización a URL), SlopeInputs ANIDA estratos (strata[]) y cargas (loads[])
// → no cabe en la serialización plana de useModuleState (eng-review §9.3 T3).
// Reusa el camino ya probado de FEM (features/fem-analysis/serialize.ts).
//
// Por qué comprimir: el JSON anidado (geometría + estratos + cargas + contexto)
// produciría una query muy larga; lz-string comprime 3-5× datos estructurales
// repetitivos, manteniendo la URL bajo el límite seguro de ~8KB.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { slopeDefaults, type SlopeInputs } from '../../data/defaults';

/**
 * Codifica un SlopeInputs como cadena URL-safe comprimida. La salida puede
 * embeberse directamente en un query param (no requiere encoding adicional).
 *
 * Round-trip: decodeShareString(encodeShareString(x)) deep-equals x.
 */
export function encodeShareString(inputs: SlopeInputs): string {
  return compressToEncodedURIComponent(JSON.stringify(inputs));
}

/**
 * Decodifica una cadena de enlace compartible de vuelta a un SlopeInputs.
 * Devuelve null cuando la entrada no es válida (corrupta, vacía o no producida
 * por encodeShareString).
 *
 * Valida defensivamente y hace un MERGE sobre slopeDefaults para tolerar
 * enlaces de versiones previas: campos faltantes (p.ej. `context` en enlaces
 * pre-Phase-2) caen al default en lugar de quedar undefined.
 */
export function decodeShareString(encoded: string): SlopeInputs | null {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (!isValidSlopeInputs(parsed)) return null;
    // Merge sobre defaults → tolera campos nuevos en enlaces antiguos.
    return { ...slopeDefaults, ...(parsed as Partial<SlopeInputs>) };
  } catch {
    return null;
  }
}

/**
 * Comprobación ligera de forma en runtime. No verifica corrección estructural
 * profunda (validateSlope lo hace aguas abajo); solo descarta los casos
 * obviamente corruptos ("objeto vacío" o "forma equivocada"). `strata` es el
 * invariante mínimo: SlopeInputs siempre tiene al menos un estrato.
 */
function isValidSlopeInputs(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  if (typeof m.height !== 'number') return false;
  if (typeof m.angle !== 'number') return false;
  if (!Array.isArray(m.strata)) return false;
  if (!Array.isArray(m.loads)) return false;
  return true;
}

/**
 * Construye la URL completa de /geotec/taludes con el modelo codificado en el
 * query param `?model=`. Útil para el afordance "Copiar enlace" (cableado por
 * T4.1 en el Topbar).
 *
 * `baseUrl` por defecto = `window.location.origin + window.location.pathname`
 * (sin query/hash previos), de modo que la URL apunta al módulo de taludes
 * independientemente de dónde se invoque el botón.
 */
export function buildShareUrl(inputs: SlopeInputs, baseUrl?: string): string {
  const encoded = encodeShareString(inputs);
  const url = baseUrl ?? defaultBaseUrl();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}model=${encoded}`;
}

function defaultBaseUrl(): string {
  if (typeof window === 'undefined') return '/geotec/taludes';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}
