// Micropilotes — serialización del soil array para share-URL
//
// useModuleState ya guarda los inputs escalares en la URL como ?key=value, pero
// el soil[] vive en su propio localStorage y NO entraba en el enlace. Resultado:
// "Copiar enlace" producía URLs que reproducían los inputs pero NO los estratos,
// dejando al destinatario calculando contra su soil local (defaults o uno
// previo). Cálculo silenciosamente distinto.
//
// Patrón idéntico a masonry-walls/serialize.ts y fem-analysis/serialize.ts:
// JSON → lz-string compress → base64-URL. El destinatario lo decodifica al
// montar el módulo y lo aplica como soil inicial.
//
// El param `soil=` es EFÍMERO: lo leemos al montar, pero useModuleState lo
// barre al primer setSearchParams (replace: true). Eso está bien: una vez
// aplicado, persiste en el localStorage del destinatario.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { SoilLayer } from '../../data/defaults';
import type { SoilType } from '../../data/micropileLookups';

export const SOIL_URL_PARAM = 'soil';

/**
 * Codifica el array de estratos como cadena URL-safe comprimida. La salida
 * puede pegarse directamente en un query param sin codificación adicional.
 *
 * Round-trip: decodeSoil(encodeSoil(s)) deep-equals s.
 */
export function encodeSoil(soil: SoilLayer[]): string {
  return compressToEncodedURIComponent(JSON.stringify(soil));
}

/**
 * Decodifica la cadena de share-URL devolviendo el SoilLayer[]. Devuelve null
 * cuando la entrada está vacía, corrupta o no es un array válido. La validación
 * es por shape (campos numéricos finitos + tipo correcto) — el motor seguirá
 * validando rangos físicos en `calcMicropiles`.
 */
export function decodeSoil(encoded: string | null | undefined): SoilLayer[] | null {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every(isValidSoilLayer)) return null;
    return parsed as SoilLayer[];
  } catch {
    return null;
  }
}

/**
 * Lee el array de estratos del URL actual (window.location). Útil al montar
 * el módulo: si hay `?soil=...` el destinatario hereda los estratos del
 * emisor; si no, fallback al loader local de localStorage.
 */
export function readSoilFromUrl(): SoilLayer[] | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return decodeSoil(params.get(SOIL_URL_PARAM));
}

/**
 * Construye una URL completa con los inputs actuales (ya en window.location)
 * + el soil comprimido. El destinatario verá EXACTAMENTE el mismo cálculo.
 */
export function buildShareUrl(soil: SoilLayer[]): string {
  if (typeof window === 'undefined') return '/ciment/micropilotes';
  const { origin, pathname, search } = window.location;
  const params = new URLSearchParams(search);
  params.set(SOIL_URL_PARAM, encodeSoil(soil));
  return `${origin}${pathname}?${params.toString()}`;
}

/** Validación de shape de un SoilLayer — espejo de soilStorage.isValidSoilLayer. */
function isValidSoilLayer(o: unknown): o is SoilLayer {
  if (typeof o !== 'object' || o === null) return false;
  const l = o as Record<string, unknown>;
  const types: SoilType[] = ['granular', 'cohesive'];
  return typeof l.id === 'number'
    && typeof l.type === 'string' && types.includes(l.type as SoilType)
    && typeof l.thickness === 'number' && isFinite(l.thickness)
    && typeof l.gamma     === 'number' && isFinite(l.gamma)
    && typeof l.c         === 'number' && isFinite(l.c)
    && typeof l.phi       === 'number' && isFinite(l.phi)
    && typeof l.Nspt      === 'number' && isFinite(l.Nspt)
    && typeof l.su        === 'number' && isFinite(l.su)
    && typeof l.rflim     === 'number' && isFinite(l.rflim);
}
