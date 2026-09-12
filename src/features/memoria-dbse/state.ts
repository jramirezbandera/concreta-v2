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
import { diferenciasDePerfil, duplicarFicha, estadoPorDefecto, normalizar, normalizarEstudio, perfilEstudioPorDefecto, perfilGuardado, type MemoriaState, type PerfilEstudio } from '../../lib/memoria/estado';
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
    const perfil = leerPerfilEstudio() ?? undefined;
    if (guardado === null || leerClave(SCHEMA_VERSION_KEY) !== SCHEMA_VERSION) {
      return estadoPorDefecto(obra, perfil);
    }
    return normalizar(guardado, obra, perfil);
  } catch {
    return estadoPorDefecto(obra, leerPerfilEstudio() ?? undefined);
  }
}

/**
 * Deja la ficha VIVA preparada para partir de ella en otra obra: lo que cambia
 * de solar a solar queda en ámbar. La usa «Duplicar esta obra» del menú, que
 * guarda antes la obra original, así que esto no pisa nada.
 *
 * Devuelve `false` si el almacenamiento no admitió la escritura.
 */
export function prepararDuplicado(): boolean {
  try {
    const bruto = leerClave(STORAGE_KEY);
    if (bruto === null) return true; // no hay ficha que duplicar; el resto sigue
    const estado = normalizar(JSON.parse(bruto), leerObra(), leerPerfilEstudio() ?? undefined);
    return escribirClave(STORAGE_KEY, JSON.stringify(duplicarFicha(estado)));
  } catch {
    return false;
  }
}

/**
 * Adopta como perfil del despacho el que traía esta obra. Para cuando el
 * fichero llega de quien tiene el perfil bueno y el de aquí es el colegial.
 */
export function adoptarPerfilDeLaObra(): boolean {
  try {
    const bruto = leerClave(STORAGE_KEY);
    if (bruto === null) return false;
    const suyo = perfilGuardado(JSON.parse(bruto));
    return suyo === null ? false : guardarPerfilEstudio(suyo);
  } catch {
    return false;
  }
}

/**
 * Esta obra se guardó con OTRO perfil de despacho: en qué se diferencia del de
 * esta máquina. Vacío cuando son el mismo, o cuando la obra no traía ninguno.
 *
 * Pasa al abrir el `.concreta` de un compañero —el perfil es preferencia y no
 * viaja— y también entre obras propias hechas antes de afinarlo. Lo que se
 * imprime es SIEMPRE el de esta máquina; esto sólo lo dice.
 */
export function perfilDeLaObraDifiere(): string[] {
  try {
    const bruto = leerClave(STORAGE_KEY);
    if (bruto === null) return [];
    const suyo = perfilGuardado(JSON.parse(bruto));
    if (suyo === null) return [];
    return diferenciasDePerfil(suyo, leerPerfilEstudio() ?? perfilEstudioPorDefecto());
  } catch {
    return [];
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
  duplicarFicha,
  teclear,
  aceptar,
} from '../../lib/memoria/estado';
export { evaluar, type Evaluacion, type FichaDatos } from '../../lib/memoria/ensamblar';
