/**
 * Persistencia del estado de la ficha DB SE. El modelo y sus operaciones
 * viven en `lib/memoria/estado.ts`; aquí sólo la clave, la versión de esquema
 * y leer/guardar, con el mismo patrón que Cargas por planta: estado anidado,
 * clave propia y `normalizar()` defensivo al leer.
 *
 * Y desde 2026-09-12, el PERFIL DEL DESPACHO. Vivía dentro del estado, donde
 * una subida de versión de esquema se lo llevaba por delante: el descarte
 * repone la plantilla colegial, y el perfil es lo único de la ficha que el
 * usuario afina una vez y quiere para todas sus obras. Ahora se refleja en
 * `concreta-estudio` (`CLAVES_PREFERENCIA`, no viaja en el `.concreta`), y su
 * pantalla propia llegará en Ajustes.
 */

import { CLAVE_ESTUDIO, versionViva } from '../../data/proyectoKeys';
import { estadoPorDefecto, normalizar, normalizarEstudio, type MemoriaState, type PerfilEstudio } from '../../lib/memoria/estado';
import { leerObra } from '../../lib/obra';
import { escribirClave, leerClave } from '../../lib/storage/seguro';

export const STORAGE_KEY = 'concreta-memoria-dbse-model';
export const SCHEMA_VERSION_KEY = 'concreta-memoria-dbse-model-version';
export const SCHEMA_VERSION = versionViva('concreta-memoria-dbse');

/** El perfil del despacho de esta máquina, o `null` si nunca se guardó ninguno. */
export function leerPerfilEstudio(): PerfilEstudio | null {
  try {
    const bruto = leerClave(CLAVE_ESTUDIO);
    return bruto === null ? null : normalizarEstudio(JSON.parse(bruto));
  } catch {
    return null;
  }
}

/** `false` si el almacenamiento no admitió la escritura (modo privado, cuota llena). */
export function guardarPerfilEstudio(perfil: PerfilEstudio): boolean {
  return escribirClave(CLAVE_ESTUDIO, JSON.stringify(perfil));
}

/**
 * Promociona a la clave global el perfil que viniera dentro del estado
 * guardado. Corre ANTES de mirar la versión de esquema: el descarte por
 * versión repone la plantilla colegial y se llevaría por delante un perfil que
 * el usuario pudo tardar una tarde en afinar.
 *
 * Sólo actúa la primera vez. En cuanto `concreta-estudio` existe manda esa
 * clave, y `guardarEstado` la mantiene al día.
 */
function rescatarPerfilEstudio(guardado: unknown): void {
  if (leerClave(CLAVE_ESTUDIO) !== null) return;
  if (typeof guardado !== 'object' || guardado === null) return;
  const estudio = (guardado as { estudio?: unknown }).estudio;
  if (typeof estudio !== 'object' || estudio === null) return;
  guardarPerfilEstudio(normalizarEstudio(estudio));
}

export function cargarEstado(): MemoriaState {
  const obra = leerObra();
  try {
    const bruto = leerClave(STORAGE_KEY);
    const guardado: unknown = bruto === null ? null : JSON.parse(bruto);
    if (guardado !== null) rescatarPerfilEstudio(guardado);
    if (guardado === null || leerClave(SCHEMA_VERSION_KEY) !== SCHEMA_VERSION) {
      return estadoPorDefecto(obra, leerPerfilEstudio() ?? undefined);
    }
    return normalizar(guardado, obra);
  } catch {
    return estadoPorDefecto(obra, leerPerfilEstudio() ?? undefined);
  }
}

export function guardarEstado(state: MemoriaState): void {
  escribirClave(STORAGE_KEY, JSON.stringify(state));
  escribirClave(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  // El perfil se refleja SIEMPRE en su clave global. Sin esto, editarlo en la
  // ficha dejaría la clave vieja, y el primer descarte por versión restauraría
  // el perfil de antes de las últimas ediciones creyendo que lo rescataba.
  guardarPerfilEstudio(state.estudio);
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
