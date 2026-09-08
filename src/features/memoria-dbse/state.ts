/**
 * Persistencia del estado de la ficha DB SE. El modelo y sus operaciones
 * viven en `lib/memoria/estado.ts`; aquí sólo la clave, la versión de esquema
 * y leer/guardar, con el mismo patrón que Cargas por planta: estado anidado,
 * clave propia y `normalizar()` defensivo al leer.
 */

import { normalizar, estadoPorDefecto, type MemoriaState } from '../../lib/memoria/estado';
import { leerObra } from '../../lib/obra';
import { versionViva } from '../../data/proyectoKeys';
import { escribirClave, leerClave } from '../../lib/storage/seguro';

export const STORAGE_KEY = 'concreta-memoria-dbse-model';
export const SCHEMA_VERSION_KEY = 'concreta-memoria-dbse-model-version';
export const SCHEMA_VERSION = versionViva('concreta-memoria-dbse');

export function cargarEstado(): MemoriaState {
  const obra = leerObra();
  try {
    if (leerClave(SCHEMA_VERSION_KEY) !== SCHEMA_VERSION) return estadoPorDefecto(obra);
    const bruto = leerClave(STORAGE_KEY);
    if (!bruto) return estadoPorDefecto(obra);
    return normalizar(JSON.parse(bruto), obra);
  } catch {
    return estadoPorDefecto(obra);
  }
}

export function guardarEstado(state: MemoriaState): void {
  escribirClave(STORAGE_KEY, JSON.stringify(state));
  escribirClave(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
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
