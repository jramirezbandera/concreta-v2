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

import { moduleRegistry } from '../../data/moduleRegistry';
import { versionViva } from '../../data/proyectoKeys';
import { cargar, listar, nuevoId, pestanaDesfasada } from '../proyecto';
import { borrarClave, escribirClave, estadoAlmacen, leerClave, volcarPendientes } from '../storage/seguro';
import { clavesDeDato, datosConTitulo, datosDeModulo, huellaDeModulo } from './adaptador';
import {
  borrarBlob,
  guardarBlob,
  hayAlmacenDeBlobs,
  idsDeBlobs,
  leerBlob,
  purgarBlobs,
  type MotivoFalloBlobs,
  ErrorDeBlobs,
} from './blobs';
import { blobDePdf, contarPaginas } from './concatenar';
import { numerosDeCapitulo } from './maqueta';
import { adaptadorDe, buscarAdaptador } from './modules';
import { fijarVinculo, leerVinculo, soltarVinculo } from './vinculo';
import type { AdaptadorAnejo, AnejoFile, Pieza } from './types';

export type { AdaptadorAnejo, AnejoFile, Pieza, SeccionAnejo } from './types';
export { ADAPTADORES_ANEJO, adaptadorDe, buscarAdaptador } from './modules';
export { clavesDeDato, datosDeModulo, huellaDeModulo } from './adaptador';
export { leerVinculo, soltarVinculo, type Vinculo } from './vinculo';
export type { FalloRepintado } from './titulo';
import type { FalloRepintado } from './titulo';

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
  const datos = registroDeTextos(x.datos);
  const tituloEnPdf = typeof x.tituloEnPdf === 'boolean' ? x.tituloEnPdf : false;
  return { id, modulo, clave, titulo, ts, esquema, blobId, paginas, huella, datos, tituloEnPdf, incluida };
}

/**
 * Los datos de una pieza a partir del valor crudo, o `null` si no son un
 * diccionario de textos. Basta con que UNA clave no sea texto para tirar el
 * conjunto: media restauración escribe un módulo a medias, y eso es peor que
 * no poder abrir la pieza y decirlo.
 *
 * Un diccionario vacío también es `null`: un módulo sin nada guardado no tiene
 * estado que restaurar, y así se comporta igual que una pieza antigua.
 */
function registroDeTextos(v: unknown): Record<string, string> | null {
  if (!esObjeto(v)) return null;
  const out: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(v)) {
    if (typeof valor !== 'string') return null;
    out[clave] = valor;
  }
  return Object.keys(out).length > 0 ? out : null;
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
/** El rótulo con el que la pieza entra en el índice: lo que se tecleó, o el capítulo. */
const rotuloDe = (adaptador: AdaptadorAnejo, titulo: string) => titulo.trim() || adaptador.capitulo;

/**
 * Todo lo que se vuelve a leer cada vez que entra un PDF nuevo: el estado del
 * módulo de ese instante, su huella, el momento y el propio PDF.
 *
 * Lo comparten guardar y actualizar a propósito. Son el mismo gesto —el PDF que
 * acabas de ver pasa al anejo— y la única diferencia es si estrena capítulo o
 * pisa el suyo; si cada uno construyera sus campos, tarde o temprano uno se
 * dejaría los datos o la huella y sólo se notaría al reabrir la pieza.
 */
function camposDeAhora(adaptador: AdaptadorAnejo, titulo: string, blobId: string, paginas: number) {
  return {
    modulo: adaptador.modulo,
    clave: adaptador.entrada.clave,
    titulo: rotuloDe(adaptador, titulo),
    ts: new Date().toISOString(),
    esquema: adaptador.entrada.versionViva,
    blobId,
    paginas,
    huella: huellaDeModulo(adaptador),
    datos: datosDeModulo(adaptador),
    // El exportador dibuja la banda del título si —y sólo si— se le pasó un
    // nombre no vacío (`drawElementTitle` / `drawHeader` en lib/pdf/utils). Con
    // el nombre vacío el índice pone el rótulo del capítulo, pero dentro del
    // PDF no hay banda, y por tanto no habrá nada que repintar al renombrar.
    tituloEnPdf: titulo.trim().length > 0,
  };
}

/**
 * «Guardar en el anejo»: el PDF que el usuario acaba de ver entra en el anejo
 * de la obra, estrenando capítulo o pisando el que el módulo tenía abierto.
 *
 * Cuál de las dos cosas lo decide `destinoDeGuardado`, y se decide AQUÍ, no en
 * la pantalla: que guardar dos veces la misma viga no duplique el capítulo es
 * una regla del anejo, no del botón, y así la cumple todo el que pase por aquí.
 * El botón llama a la misma función sólo para poder rotularse con lo que va a
 * ocurrir.
 *
 * Lanza sólo por error de programación (módulo sin adaptador): lo que puede
 * fallar en producción —sitio, navegador— vuelve como `ok: false`.
 */
export async function guardarPieza(peticion: PeticionPieza): Promise<ResultadoPieza> {
  const destino = destinoDeGuardado(peticion.modulo, peticion.titulo);
  return destino.tipo === 'actualiza' ? actualizarPieza(destino.pieza.id, peticion) : anadirPieza(peticion);
}

/** Da de alta una pieza nueva, al final de su sección. */
async function anadirPieza(peticion: PeticionPieza): Promise<ResultadoPieza> {
  const adaptador = adaptadorDe(peticion.modulo);
  const paginas = peticion.paginas ?? (await contarPaginas(peticion.blob));
  const blobId = nuevoId();
  try {
    await guardarBlob(blobId, peticion.blob);
  } catch (e) {
    return { ok: false, donde: 'blob', motivo: e instanceof ErrorDeBlobs ? e.motivo : 'error' };
  }

  const pieza: Pieza = { id: nuevoId(), ...camposDeAhora(adaptador, peticion.titulo, blobId, paginas), incluida: true };

  const anejo = leerAnejo();
  anejo.piezas.push(pieza);
  if (!escribirAnejo(anejo)) {
    await borrarBlob(blobId).catch(() => undefined);
    return { ok: false, donde: 'indice', motivo: 'cuota' };
  }
  fijarVinculo({ modulo: adaptador.modulo, piezaId: pieza.id });
  return { ok: true, pieza, reemplazada: null };
}

/**
 * Vuelve a guardar una pieza que ya está en el anejo: el PDF nuevo y el estado
 * de ahora, en su MISMA posición, con su número de capítulo y su casilla de
 * incluir. Es lo que hace que corregir el canto de la V-3 no te deje dos V-3.
 *
 * Mismo orden de escritura que `guardarPieza`, por la misma razón: el PDF nuevo
 * primero, el índice después, y el PDF viejo al final —cuando ya nadie lo
 * referencia—. Si el índice no cabe, el PDF nuevo se borra y la pieza se queda
 * exactamente como estaba.
 *
 * Si la pieza ya no está (la quitaste del anejo en otra pestaña mientras
 * exportabas), no es un error: se guarda como nueva. Lo que el usuario pidió
 * fue meter este PDF en el anejo.
 */
export async function actualizarPieza(id: string, peticion: PeticionPieza): Promise<ResultadoPieza> {
  const adaptador = adaptadorDe(peticion.modulo);
  const anejo = leerAnejo();
  const indice = anejo.piezas.findIndex((p) => p.id === id);
  if (indice < 0) return anadirPieza(peticion);
  const anterior = anejo.piezas[indice];

  const paginas = peticion.paginas ?? (await contarPaginas(peticion.blob));
  const blobId = nuevoId();
  try {
    await guardarBlob(blobId, peticion.blob);
  } catch (e) {
    return { ok: false, donde: 'blob', motivo: e instanceof ErrorDeBlobs ? e.motivo : 'error' };
  }

  anejo.piezas[indice] = { ...anterior, ...camposDeAhora(adaptador, peticion.titulo, blobId, paginas) };
  if (!escribirAnejo(anejo)) {
    await borrarBlob(blobId).catch(() => undefined);
    return { ok: false, donde: 'indice', motivo: 'cuota' };
  }
  await borrarBlob(anterior.blobId).catch(() => undefined);
  fijarVinculo({ modulo: adaptador.modulo, piezaId: id });
  return { ok: true, pieza: anejo.piezas[indice], reemplazada: anterior };
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

/**
 * Las piezas guardadas antes de que la pieza llevara sus datos adoptan los del
 * módulo cuando la huella coincide.
 *
 * El razonamiento: la huella se apuntó al hacer el PDF. Si el estado que el
 * módulo tiene AHORA produce esa misma huella, es literalmente el mismo
 * cálculo, sólo que guardado en otro cajón. Recupera gratis lo último que se
 * guardó de cada módulo, que es casi siempre lo que uno quiere reabrir.
 *
 * Lo que NO hace, a propósito:
 *
 *  - tocar una pieza que ya tiene sus datos: los suyos mandan sobre el módulo
 *    siempre, aunque el módulo tenga otra cosa;
 *  - adoptar con el esquema cambiado, porque entonces lo que el módulo guarda
 *    hoy ya no es lo que produjo aquel PDF;
 *  - poner `tituloEnPdf`, que se queda en `false`: de un PDF de antes no se
 *    puede saber si lleva banda de título, y ofrecer renombrar sin ella
 *    dejaría el nombre del índice y el del PDF diciendo cosas distintas.
 *
 * Devuelve cuántas adoptaron; `0` también si el índice no se pudo escribir.
 */
export function adoptarDatosDeModulos(): number {
  const anejo = leerAnejo();
  let adoptadas = 0;
  for (const p of anejo.piezas) {
    if (p.datos !== null || p.huella === null) continue;
    const a = buscarAdaptador(p.modulo);
    if (!a || p.esquema !== a.entrada.versionViva) continue;
    if (huellaDeModulo(a) !== p.huella) continue;
    const datos = datosDeModulo(a);
    if (datos === null) continue;
    p.datos = datos;
    adoptadas++;
  }
  if (adoptadas === 0) return 0;
  return escribirAnejo(anejo) ? adoptadas : 0;
}

// ── El vínculo: qué pieza está editando cada módulo ──────────────────────────

/**
 * La pieza que este módulo tiene abierta, o `null` si no tiene ninguna o si la
 * que tenía ya no está en el anejo (la quitaste, o cambiaste de obra).
 */
export function piezaAbierta(modulo: string): Pieza | null {
  const v = leerVinculo();
  if (v === null || v.modulo !== modulo) return null;
  return piezaPorId(v.piezaId) ?? null;
}

export type DestinoGuardado =
  /** `desde` es la pieza que el módulo tenía abierta y de la que el nombre nuevo lo desengancha; `null` si no había ninguna. */
  | { tipo: 'nueva'; desde: Pieza | null }
  | { tipo: 'actualiza'; pieza: Pieza; numero: number | null };

/**
 * Qué va a pasar cuando se pulse «Guardar en el anejo»: estrenar capítulo o
 * pisar uno que ya está.
 *
 * De aquí salen las DOS cosas —el rótulo del botón y lo que el botón hace—,
 * que es la única manera de que no se contradigan. El usuario lee en el botón
 * lo que va a ocurrir medio segundo antes de pulsarlo, y no hay ninguna regla
 * que recordar.
 *
 * Las dos reglas que decide:
 *
 *  - Un capítulo de MEMORIA es uno por obra: siempre pisa el suyo, lo llames
 *    como lo llames. Es lo que el anejo ya hacía.
 *  - Un CÁLCULO DE PIEZA pisa el que tiene abierto sólo si conserva su nombre.
 *    El nombre es la identidad de la pieza: abres la V-3, cambias dos números,
 *    escribes «V-4» y lo que sale es una pieza nueva, con la V-3 intacta.
 */
export function destinoDeGuardado(modulo: string, titulo: string): DestinoGuardado {
  const adaptador = buscarAdaptador(modulo);
  if (!adaptador) return { tipo: 'nueva', desde: null };
  const lista = leerAnejo().piezas;
  const esMemoria = adaptador.seccion === 'memoria';
  const existente = esMemoria ? (lista.find((p) => p.modulo === modulo) ?? null) : piezaAbierta(modulo);
  if (existente === null) return { tipo: 'nueva', desde: null };
  if (!esMemoria && rotuloDe(adaptador, titulo) !== existente.titulo) return { tipo: 'nueva', desde: existente };
  return { tipo: 'actualiza', pieza: existente, numero: numerosDeCapitulo(lista).get(existente.id) ?? null };
}

// ── Abrir una pieza en su módulo ─────────────────────────────────────────────

export type FalloRestaurar = 'sin-pieza' | 'sin-datos' | 'esquema' | 'desconocido' | 'desfasada' | 'sitio';
export type ResultadoRestaurar = { ok: true; ruta: string } | { ok: false; motivo: FalloRestaurar };

/** La ruta del módulo (`moduleRegistry.route`), o `null` si no está en el registro. */
export function rutaDeModulo(modulo: string): string | null {
  return moduleRegistry.find((m) => m.key === modulo)?.route ?? null;
}

/**
 * Las claves de localStorage que una restauración de este módulo toca: las
 * suyas de dato y su clave de versión. NO se escribe lo que venga en `datos`
 * fuera de esta lista —un `.concreta` de una versión futura podría traer
 * claves que aquí no están clasificadas—, y sí se BORRAN las que el módulo
 * tenga ahora y la pieza no traiga: si no, el suelo de la micropilotes que
 * estabas calculando se quedaría pegado a la que abres.
 */
function clavesQueSeTocan(e: AdaptadorAnejo['entrada']): string[] {
  const claves = clavesDeDato(e);
  return e.claveVersion === null ? claves : [...claves, e.claveVersion];
}

/**
 * Por qué esta pieza no se puede abrir en su módulo, o `null` si se puede.
 *
 * Lo miran los dos: la fila del anejo, para saber si el título es pinchable, y
 * `restaurarPieza`, para no hacerlo. Así el botón y la operación no pueden
 * discrepar —que es la manera de acabar con un botón que promete algo y luego
 * suelta un aviso—.
 *
 * NO mira la huella: que el módulo tenga otra cosa ahora mismo no impide abrir
 * esta pieza; justamente para eso lleva sus datos.
 *
 * Los capítulos de MEMORIA salen de aquí como cualquier otro, pero la pantalla
 * no los restaura: los lleva a su módulo y ya (ver `AnejoModule`).
 */
export function motivoDeNoAbrir(pieza: Pieza): 'desconocido' | 'esquema' | 'sin-datos' | null {
  const adaptador = buscarAdaptador(pieza.modulo);
  if (!adaptador || rutaDeModulo(pieza.modulo) === null) return 'desconocido';
  if (pieza.esquema !== adaptador.entrada.versionViva) return 'esquema';
  if (pieza.datos === null) return 'sin-datos';
  return null;
}

/**
 * Deja el módulo de la pieza tal como estaba cuando se hizo su PDF y devuelve
 * la ruta a la que hay que navegar. No navega: de eso sabe la pantalla.
 *
 * Dos cuidados que no se ven:
 *
 *  - **Se vuelca la cola diferida antes de escribir nada.** `useModuleState`
 *    persiste con 300 ms de retardo, así que la última tecla del cálculo que
 *    abandonas aterrizaría DESPUÉS de la restauración y la pisaría.
 *  - **Si una escritura falla a mitad, se deshacen las anteriores.** Un módulo
 *    medio restaurado —la viga nueva con el suelo de la anterior— es peor que
 *    no haber abierto la pieza, porque no se nota.
 *
 * Con el esquema cambiado no restaura: lo que el módulo sabe leer hoy ya no es
 * lo que produjo aquel PDF, y hacerlo a medias sería inventarse un cálculo.
 */
export function restaurarPieza(id: string): ResultadoRestaurar {
  if (pestanaDesfasada()) return { ok: false, motivo: 'desfasada' };
  const pieza = piezaPorId(id);
  if (!pieza) return { ok: false, motivo: 'sin-pieza' };
  const motivo = motivoDeNoAbrir(pieza);
  if (motivo !== null) return { ok: false, motivo };
  const adaptador = adaptadorDe(pieza.modulo);
  const ruta = rutaDeModulo(pieza.modulo) ?? '';
  const datos = pieza.datos ?? {};

  volcarPendientes();

  const claves = clavesQueSeTocan(adaptador.entrada);
  const antes = claves.map((c) => [c, leerClave(c)] as const);
  for (const clave of claves) {
    const valor = datos[clave];
    if (valor === undefined ? borrarClave(clave) : escribirClave(clave, valor)) continue;
    for (const [c, v] of antes) {
      if (v === null) borrarClave(c);
      else escribirClave(c, v);
    }
    return { ok: false, motivo: 'sitio' };
  }
  fijarVinculo({ modulo: pieza.modulo, piezaId: pieza.id });
  return { ok: true, ruta };
}

/**
 * Si el módulo tiene ahora mismo un cálculo que no está guardado en ninguna
 * pieza del anejo. Es lo que decide si abrir otra pieza tiene que avisar.
 *
 * La regla no es «¿el módulo tiene algo?» sino «¿lo que tiene está a salvo?».
 * Acabas de guardar la V-3 y abres la V-1: su huella está en el anejo, no
 * molesta. Tienes la V-5 a medias: no está, avisa. Y con los valores por
 * defecto intactos (huella `null`) no hay nada que perder.
 */
export function hayTrabajoSinGuardar(modulo: string): boolean {
  const a = buscarAdaptador(modulo);
  if (!a) return false;
  const huella = huellaDeModulo(a);
  if (huella === null) return false;
  return !leerAnejo().piezas.some((p) => p.modulo === modulo && p.huella === huella);
}

/**
 * Deja el módulo en blanco y lo desengancha de la pieza que tuviera abierta:
 * «Nuevo cálculo».
 *
 * Borra sus claves en vez de escribir valores por defecto —que el anejo no
 * conoce—: es lo mismo que hace el `reset()` del propio módulo, y al volver a
 * montarse lee sus defaults. Por eso quien lo llama tiene que pedir el remonte
 * después (`pedirRemonte`): si no, el módulo sigue enseñando en memoria lo que
 * ya no está guardado.
 *
 * Lo que había NO se pierde si estaba guardado en una pieza: sigue en el anejo,
 * con su PDF y sus datos, a un clic del desplegable.
 */
export function nuevoCalculo(modulo: string): boolean {
  const a = buscarAdaptador(modulo);
  if (!a) return false;
  // La cola diferida del módulo aterrizaría DESPUÉS del borrado y lo desharía.
  volcarPendientes();
  for (const clave of clavesQueSeTocan(a.entrada)) borrarClave(clave);
  soltarVinculo();
  return true;
}

// ── Renombrar un capítulo ────────────────────────────────────────────────────

export type FalloRenombrar = 'sin-pieza' | 'vacio' | 'sin-banda' | 'sin-pdf' | 'desfasada' | 'sitio' | 'almacen' | FalloRepintado;
export type ResultadoRenombrar = { ok: true; pieza: Pieza } | { ok: false; motivo: FalloRenombrar };

/**
 * Le cambia el nombre a un capítulo, en los TRES sitios donde se lee: la lista
 * del anejo, el PDF guardado y los datos que la pieza se lleva dentro.
 *
 * Los tres, o ninguno. Cambiar sólo la lista dejaría el papel diciendo otra
 * cosa —que es lo que se venía a arreglar—, y cambiar lista y papel pero no los
 * datos haría que al reabrir la pieza el módulo devolviera el nombre viejo.
 *
 * Mismo orden de escritura que guardar: el PDF nuevo primero, el índice
 * después, el viejo al final. Si el índice no cabe, se borra el PDF nuevo y la
 * pieza se queda entera como estaba.
 *
 * Sólo se puede con las piezas cuyo PDF lleva banda de título (`tituloEnPdf`).
 * Las exportadas sin nombre, de antes de que el nombre fuera obligatorio, no
 * tienen dónde escribirlo sin bajar 5,5 mm toda la página: ésas se arreglan
 * abriéndolas en su módulo y volviendo a exportar.
 */
export async function renombrarPieza(id: string, titulo: string): Promise<ResultadoRenombrar> {
  if (pestanaDesfasada()) return { ok: false, motivo: 'desfasada' };
  const nuevo = titulo.trim();
  if (!nuevo) return { ok: false, motivo: 'vacio' };
  const anejo = leerAnejo();
  const indice = anejo.piezas.findIndex((p) => p.id === id);
  if (indice < 0) return { ok: false, motivo: 'sin-pieza' };
  const pieza = anejo.piezas[indice];
  if (!pieza.tituloEnPdf) return { ok: false, motivo: 'sin-banda' };
  if (nuevo === pieza.titulo) return { ok: true, pieza };

  const guardado = await leerBlob(pieza.blobId);
  if (guardado === null) return { ok: false, motivo: 'sin-pdf' };
  const { repintarTitulo } = await import('./titulo');
  const repintado = await repintarTitulo(new Uint8Array(await guardado.arrayBuffer()), nuevo, pieza.titulo);
  if (!repintado.ok) return { ok: false, motivo: repintado.motivo };

  const blobId = nuevoId();
  try {
    await guardarBlob(blobId, blobDePdf(repintado.bytes));
  } catch {
    // Sin sitio, sin IndexedDB o bloqueado por otra pestaña: la pieza sigue
    // intacta con su PDF de antes, que es lo que importa.
    return { ok: false, motivo: 'almacen' };
  }

  const adaptador = buscarAdaptador(pieza.modulo);
  anejo.piezas[indice] = {
    ...pieza,
    titulo: nuevo,
    blobId,
    datos: adaptador && pieza.datos ? datosConTitulo(adaptador.entrada, pieza.datos, nuevo) : pieza.datos,
  };
  if (!escribirAnejo(anejo)) {
    await borrarBlob(blobId).catch(() => undefined);
    return { ok: false, motivo: 'sitio' };
  }
  await borrarBlob(pieza.blobId).catch(() => undefined);
  return { ok: true, pieza: anejo.piezas[indice] };
}

export type EstadoPieza = 'al-dia' | 'version-anterior';

/**
 * Si el cálculo de esta pieza se hizo con una versión anterior de Concreta.
 *
 * Antes esto comparaba la huella de la pieza con lo que el módulo tuviera
 * guardado en ese momento, y por eso mentía: en cuanto empezabas la V-4, la V-3
 * se ponía en ámbar aunque su PDF estuviera perfecto. El aviso que debía
 * significar «esto hay que rehacerlo» acababa significando «el módulo tiene
 * otra cosa», y se aprendía a ignorarlo.
 *
 * Ya no hace falta: la pieza lleva sus datos y su PDF, entran juntos y salen
 * juntos, así que no puede contradecirse a sí misma. Lo único que sí puede
 * dejarla desfasada es que el módulo haya cambiado de esquema por debajo —o que
 * el módulo ya no exista en esta versión—, y eso es lo que dice.
 */
export function estadoDePieza(p: Pieza): EstadoPieza {
  const a = buscarAdaptador(p.modulo);
  if (!a) return 'version-anterior';
  return p.esquema === a.entrada.versionViva ? 'al-dia' : 'version-anterior';
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
