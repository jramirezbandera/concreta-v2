// Persistencia del array de estratos en localStorage. El campo soil del
// módulo Micropilotes no encaja en useModuleState (que está pensado para
// objetos escalares serializables, no arrays), así que vive en su propia
// clave con su propio loader/saver.
//
// Extraído de index.tsx para ser testable. La validación de shape se
// añade aquí: antes loadSoil() aceptaba CUALQUIER array y un layer sin
// campos numéricos pasaba directo al motor, que entonces calculaba con
// NaN. Ahora si la forma no cuadra, fallback a defaults.

import { micropilesSoilDefaults, type SoilLayer } from '../../data/defaults';

export const SOIL_STORAGE_KEY = 'concreta-micropiles-soil';

/** Comprueba que el objeto tiene la forma de un SoilLayer. */
function isValidSoilLayer(o: unknown): o is SoilLayer {
  if (typeof o !== 'object' || o === null) return false;
  const l = o as Record<string, unknown>;
  return typeof l.id === 'number'
    && (l.type === 'granular' || l.type === 'cohesive')
    && typeof l.thickness === 'number' && isFinite(l.thickness)
    && typeof l.gamma     === 'number' && isFinite(l.gamma)
    && typeof l.c         === 'number' && isFinite(l.c)
    && typeof l.phi       === 'number' && isFinite(l.phi)
    && typeof l.Nspt      === 'number' && isFinite(l.Nspt)
    && typeof l.su        === 'number' && isFinite(l.su)
    && typeof l.rflim     === 'number' && isFinite(l.rflim);
}

function freshDefaults(): SoilLayer[] {
  return micropilesSoilDefaults.map((l) => ({ ...l }));
}

/**
 * Lee el array de estratos de localStorage. Devuelve los defaults FTUX si:
 *   · la clave no existe;
 *   · el JSON no parsea;
 *   · el contenido no es un array;
 *   · el array está vacío;
 *   · cualquier elemento del array no es un SoilLayer válido.
 *
 * En entorno sin window (SSR/Node sin jsdom) también devuelve defaults.
 */
export function loadSoil(): SoilLayer[] {
  if (typeof localStorage === 'undefined') return freshDefaults();
  try {
    const raw = localStorage.getItem(SOIL_STORAGE_KEY);
    if (!raw) return freshDefaults();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return freshDefaults();
    if (!parsed.every(isValidSoilLayer)) return freshDefaults();
    return parsed;
  } catch {
    return freshDefaults();
  }
}

/** Persiste el array. Silencioso en caso de quota / SSR. */
export function saveSoil(soil: SoilLayer[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SOIL_STORAGE_KEY, JSON.stringify(soil));
  } catch { /* ignore */ }
}
