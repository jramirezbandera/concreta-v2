/**
 * El índice de piezas del anejo (`concreta-anejo`) y las operaciones sobre él.
 *
 * Dos almacenes, un dueño: el índice es una clave de proyecto normal —viaja en
 * el `.concreta`, se cambia con la obra— y los bytes de cada PDF viven en
 * IndexedDB (`blobs.ts`) bajo `Pieza.blobId`. Este fichero es el único que
 * escribe en los dos, y siempre en este orden:
 *
 *   guardar:  blob primero, índice después. Si el índice no cabe, se borra el
 *             blob. Así el índice nunca apunta a un PDF que no existe; un PDF
 *             sin índice es un huérfano, y los huérfanos se purgan.
 *   quitar:   índice primero, blob después. Si el blob no se pudo borrar,
 *             queda huérfano y lo recoge `purgarBlobsHuerfanos`.
 *
 * Lo que este fichero NO sabe: qué PDF produce cada módulo. Eso lo produce el
 * exportador de siempre, con el módulo en pantalla, y llega aquí ya hecho.
 */

import { versionViva } from '../../data/proyectoKeys';
import { cargar, listar, nuevoId } from '../proyecto';
import { escribirClave, estadoAlmacen, leerClave } from '../storage/seguro';
import { huellaDeModulo } from './adaptador';
import {
  borrarBlob,
  guardarBlob,
  hayAlmacenDeBlobs,
  idsDeBlobs,
  purgarBlobs,
  type MotivoFalloBlobs,
  ErrorDeBlobs,
} from './blobs';
import { contarPaginas } from './concatenar';
import { adaptadorDe, buscarAdaptador } from './modules';
import type { AnejoFile, Pieza } from './types';

export type { AdaptadorAnejo, AnejoFile, Pieza, SeccionAnejo } from './types';
export { ADAPTADORES_ANEJO, adaptadorDe, buscarAdaptador } from './modules';
export { huellaDeModulo } from './adaptador';

export const MODULO_ANEJO = 'concreta-anejo';
const CLAVE_ANEJO = 'concreta-anejo';
const CLAVE_ANEJO_VERSION = 'concreta-anejo-version';
/** La pantalla del anejo (F6). */
export const RUTA_ANEJO = '/proyecto/anejo';

const vacio = (): AnejoFile => ({ v: 1, piezas: [] });

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function normalizarPieza(x: unknown): Pieza | null {
  if (!esObjeto(x)) return null;
  const texto = (k: string) => (typeof x[k] === 'string' ? (x[k] as string) : null);
  const id = texto('id');
  const modulo = texto('modulo');
  const clave = texto('clave');
  const titulo = texto('titulo');
  const ts = texto('ts');
  const esquema = texto('esquema');
  const blobId = texto('blobId');
  if (!id || !modulo || !clave || titulo === null || !ts || !esquema || !blobId) return null;
  const paginas = typeof x.paginas === 'number' && Number.isFinite(x.paginas) && x.paginas >= 0 ? Math.floor(x.paginas) : 0;
  const huella = typeof x.huella === 'string' ? x.huella : null;
  const incluida = typeof x.incluida === 'boolean' ? x.incluida : true;
  return { id, modulo, clave, titulo, ts, esquema, blobId, paginas, huella, incluida };
}

/** Las piezas que hay dentro de un valor crudo de `concreta-anejo`; `[]` si no se entiende. */
function piezasDe(raw: string | null): Pieza[] {
  if (raw === null) return [];
  try {
    const p: unknown = JSON.parse(raw);
    if (!esObjeto(p) || p.v !== 1 || !Array.isArray(p.piezas)) return [];
    return p.piezas.map(normalizarPieza).filter((x): x is Pieza => x !== null);
  } catch {
    return [];
  }
}

/**
 * El índice tal como está guardado. Como cualquier módulo: si se guardó con
 * otra versión de esquema, se lee en blanco (y `desajustesDeEsquema` lo avisa
 * al abrir la obra).
 */
export function leerAnejo(): AnejoFile {
  const guardada = leerClave(CLAVE_ANEJO_VERSION);
  if (guardada !== null && guardada !== versionViva(MODULO_ANEJO)) return vacio();
  return { v: 1, piezas: piezasDe(leerClave(CLAVE_ANEJO)) };
}

export function escribirAnejo(a: AnejoFile): boolean {
  if (!escribirClave(CLAVE_ANEJO, JSON.stringify(a))) return false;
  escribirClave(CLAVE_ANEJO_VERSION, versionViva(MODULO_ANEJO));
  avisar();
  return true;
}

// ── Suscripción (para `useAnejo`) ────────────────────────────────────────────

const oyentes = new Set<() => void>();

function avisar(): void {
  for (const fn of oyentes) fn();
}

/**
 * Avisa al escribir el índice desde esta pestaña y al cambiar desde otra
 * (`storage`, incluido el `clear` del cambio de obra, que llega con `key: null`).
 */
export function suscribirAnejo(fn: () => void): () => void {
  oyentes.add(fn);
  const otraPestana = (e: StorageEvent) => {
    if (e.key === null || e.key === CLAVE_ANEJO || e.key === CLAVE_ANEJO_VERSION) fn();
  };
  window.addEventListener('storage', otraPestana);
  return () => {
    oyentes.delete(fn);
    window.removeEventListener('storage', otraPestana);
  };
}

let instantanea: { raw: string | null; version: string | null; valor: AnejoFile } | null = null;

/** `leerAnejo()` con identidad estable mientras el índice guardado no cambie (lo exige `useSyncExternalStore`). */
export function instantaneaAnejo(): AnejoFile {
  const raw = leerClave(CLAVE_ANEJO);
  const version = leerClave(CLAVE_ANEJO_VERSION);
  if (instantanea && instantanea.raw === raw && instantanea.version === version) return instantanea.valor;
  instantanea = { raw, version, valor: leerAnejo() };
  return instantanea.valor;
}

export function piezas(): Pieza[] {
  return leerAnejo().piezas;
}

export function piezaPorId(id: string): Pieza | undefined {
  return leerAnejo().piezas.find((p) => p.id === id);
}

/**
 * Reordena el índice según `orden` (ids). Las piezas que no se nombren se
 * quedan al final en su orden de antes; los ids desconocidos se ignoran.
 * `false` si el índice no se pudo escribir.
 */
export function reordenarPiezas(orden: readonly string[]): boolean {
  const anejo = leerAnejo();
  const pendientes = new Map(anejo.piezas.map((p) => [p.id, p]));
  const nuevas: Pieza[] = [];
  for (const id of orden) {
    const p = pendientes.get(id);
    if (!p) continue;
    nuevas.push(p);
    pendientes.delete(id);
  }
  for (const p of anejo.piezas) if (pendientes.has(p.id)) nuevas.push(p);
  return escribirAnejo({ v: 1, piezas: nuevas });
}

/** La casilla «incluir» de una pieza. `false` si la pieza no existe o el índice no se pudo escribir. */
export function fijarIncluida(id: string, incluida: boolean): boolean {
  const anejo = leerAnejo();
  const pieza = anejo.piezas.find((p) => p.id === id);
  if (!pieza) return false;
  if (pieza.incluida === incluida) return true;
  pieza.incluida = incluida;
  return escribirAnejo(anejo);
}

export interface PeticionPieza {
  /** `moduleRegistry.key` del módulo en pantalla. */
  modulo: string;
  /** El título del documento tal como lo tecleó el usuario (vacío ⇒ el rótulo del capítulo). */
  titulo: string;
  /** El PDF que acaba de producir el exportador: el mismo que se descarga. */
  blob: Blob;
  /** Páginas, si el exportador las sabe. Si no, se cuentan abriendo el PDF (carga pdf-lib). */
  paginas?: number;
}

export type ResultadoPieza =
  | { ok: true; pieza: Pieza; reemplazada: Pieza | null }
  | { ok: false; donde: 'blob'; motivo: MotivoFalloBlobs }
  | { ok: false; donde: 'indice'; motivo: 'cuota' };

/**
 * Guarda el PDF y da de alta la pieza. Un capítulo de memoria reemplaza al que
 * hubiera del mismo módulo, en su misma posición; un cálculo de pieza se añade
 * al final. Lanza sólo por error de programación (módulo sin adaptador): lo
 * que puede fallar en producción —sitio, navegador— vuelve como `ok: false`.
 */
export async function guardarPieza(peticion: PeticionPieza): Promise<ResultadoPieza> {
  const adaptador = adaptadorDe(peticion.modulo);
  const paginas = peticion.paginas ?? (await contarPaginas(peticion.blob));
  const blobId = nuevoId();
  try {
    await guardarBlob(blobId, peticion.blob);
  } catch (e) {
    return { ok: false, donde: 'blob', motivo: e instanceof ErrorDeBlobs ? e.motivo : 'error' };
  }

  const titulo = peticion.titulo.trim() || adaptador.capitulo;
  const pieza: Pieza = {
    id: nuevoId(),
    modulo: adaptador.modulo,
    clave: adaptador.entrada.clave,
    titulo,
    ts: new Date().toISOString(),
    esquema: adaptador.entrada.versionViva,
    blobId,
    paginas,
    huella: huellaDeModulo(adaptador),
    incluida: true,
  };

  const anejo = leerAnejo();
  let reemplazada: Pieza | null = null;
  const indice = adaptador.seccion === 'memoria' ? anejo.piezas.findIndex((p) => p.modulo === adaptador.modulo) : -1;
  if (indice >= 0) {
    reemplazada = anejo.piezas[indice];
    anejo.piezas[indice] = { ...pieza, incluida: reemplazada.incluida };
  } else {
    anejo.piezas.push(pieza);
  }

  if (!escribirAnejo(anejo)) {
    await borrarBlob(blobId).catch(() => undefined);
    return { ok: false, donde: 'indice', motivo: 'cuota' };
  }
  if (reemplazada) await borrarBlob(reemplazada.blobId).catch(() => undefined);
  return { ok: true, pieza: indice >= 0 ? anejo.piezas[indice] : pieza, reemplazada };
}

/** Quita la pieza del índice y borra su PDF. `false` si no existía o el índice no se pudo escribir. */
export async function quitarPieza(id: string): Promise<boolean> {
  const anejo = leerAnejo();
  const pieza = anejo.piezas.find((p) => p.id === id);
  if (!pieza) return false;
  anejo.piezas = anejo.piezas.filter((p) => p.id !== id);
  if (!escribirAnejo(anejo)) return false;
  await borrarBlob(pieza.blobId).catch(() => undefined);
  return true;
}

export type EstadoPieza = 'al-dia' | 'recalcular';

/**
 * «AL DÍA» si el PDF se hizo con el estado que el módulo tiene guardado ahora
 * y con su esquema vivo; «RECALCULAR» si cualquiera de las dos cosas cambió, o
 * si el módulo no se conoce (una pieza de otra versión de Concreta).
 */
export function estadoDePieza(p: Pieza): EstadoPieza {
  const a = buscarAdaptador(p.modulo);
  if (!a) return 'recalcular';
  if (p.esquema !== a.entrada.versionViva) return 'recalcular';
  return huellaDeModulo(a) === p.huella ? 'al-dia' : 'recalcular';
}

export interface Referencias {
  /** Los `blobId` a los que apunta algún índice. */
  ids: Set<string>;
  /**
   * `false` si algún índice no se ha podido leer. Entonces NO se puede purgar:
   * lo que no se ha podido leer puede estar referenciando cualquier cosa, y un
   * PDF borrado por error es trabajo perdido —hay que rehacerlo desde su
   * módulo, y si el cálculo cambió ya no sale igual.
   */
  completo: boolean;
}

/**
 * Los `blobId` vivos: el índice de la obra abierta y el de cada obra archivada
 * en esta máquina.
 *
 * El índice vivo se lee EN CRUDO, no con `leerAnejo()`: ése devuelve vacío
 * cuando la versión de esquema guardada no es la viva, y con eso la purga
 * borraría todos los PDF de la obra abierta el día que se suba la versión.
 * Para decidir un borrado hace falta lo que hay, no lo que se puede hidratar.
 */
export function blobIdsReferenciados(): Referencias {
  const ids = new Set(piezasDe(leerClave(CLAVE_ANEJO)).map((p) => p.blobId));
  let completo = estadoAlmacen().fallo !== 'no-disponible';
  for (const e of listar()) {
    const p = cargar(e.id);
    if (!p) {
      // Un archivo de obra que no se deja leer: sus PDF NO son huérfanos, son desconocidos.
      completo = false;
      continue;
    }
    const raw = p.claves[CLAVE_ANEJO];
    if (typeof raw === 'string') for (const pieza of piezasDe(raw)) ids.add(pieza.blobId);
  }
  return { ids, completo };
}

/**
 * Borra los PDF que ningún índice referencia y devuelve los ids borrados. Con
 * dudas —un archivo ilegible, el almacén no disponible— no borra nada.
 */
export async function purgarBlobsHuerfanos(): Promise<string[]> {
  const referencias = blobIdsReferenciados();
  if (!referencias.completo) return [];
  return purgarBlobs(referencias.ids);
}

/**
 * La purga como mantenimiento: no lanza, no avisa y no importa si no se puede
 * hacer hoy. La llaman el arranque de `AppShell` y el borrado de una obra, que
 * es cuando aparecen huérfanos de verdad. Devuelve cuántos PDF borró.
 */
export async function purgarEnSegundoPlano(): Promise<number> {
  try {
    if (!hayAlmacenDeBlobs()) return 0;
    return (await purgarBlobsHuerfanos()).length;
  } catch {
    // Sin IndexedDB, bloqueado por otra pestaña, sin cuota para la transacción:
    // los huérfanos siguen ahí y se recogerán la próxima vez.
    return 0;
  }
}

/** Ids de las piezas cuyo PDF no está en esta máquina (obra traída de otra, o datos del sitio borrados). */
export async function piezasSinPdf(anejo: AnejoFile = leerAnejo()): Promise<Set<string>> {
  const existentes = new Set(await idsDeBlobs());
  return new Set(anejo.piezas.filter((p) => !existentes.has(p.blobId)).map((p) => p.id));
}
