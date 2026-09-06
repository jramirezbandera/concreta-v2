/**
 * Persistencia del estado de la ficha DB SE. El modelo y sus operaciones
 * viven en `lib/memoria/estado.ts`; aquí sólo la clave, la versión de esquema
 * y leer/guardar, con el mismo patrón que Cargas por planta: estado anidado,
 * clave propia y `normalizar()` defensivo al leer.
 */

import { normalizar, estadoPorDefecto, type MemoriaState } from '../../lib/memoria/estado';
import { leerObra } from '../../lib/obra';

export const STORAGE_KEY = 'concreta-memoria-dbse-model';
export const SCHEMA_VERSION_KEY = 'concreta-memoria-dbse-model-version';
export const SCHEMA_VERSION = '1';

export function cargarEstado(): MemoriaState {
  const obra = leerObra();
  try {
    if (localStorage.getItem(SCHEMA_VERSION_KEY) !== SCHEMA_VERSION) return estadoPorDefecto(obra);
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return estadoPorDefecto(obra);
    return normalizar(JSON.parse(bruto), obra);
  } catch {
    return estadoPorDefecto(obra);
  }
}

export function guardarEstado(state: MemoriaState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  } catch {
    // Almacenamiento lleno o modo privado: se ignora, el módulo sigue en memoria.
  }
}

export type { MemoriaState } from '../../lib/memoria/estado';
export {
  asegurarForjados,
  confirmar,
  leerCampo,
  nuevaObra,
  teclear,
  tomarPublicacion,
} from '../../lib/memoria/estado';
export { evaluar, type Evaluacion, type FichaDatos } from '../../lib/memoria/ensamblar';
