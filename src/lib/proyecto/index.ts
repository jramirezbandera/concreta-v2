/**
 * El contenedor de proyectos (obras).
 *
 * Un proyecto es el conjunto de claves de proyecto de `localStorage` (ver
 * `src/data/proyectoKeys.ts`) más el contexto de obra, envasado en un
 * `ProyectoFile`. El proyecto archivado en el navegador y el fichero
 * `.concreta.json` exportado son el MISMO objeto; cuatro verbos sobre un formato:
 *
 *   Guardar  = serializar() las claves vivas y guardar() en su clave del archivo
 *   Abrir    = cargar() del archivo y desplegar() a las claves vivas
 *   Exportar = escribir ese objeto a fichero (`fichero.ts`)
 *   Importar = importar() el texto, guardar() y desplegar()
 *
 * Decisiones que no son adorno:
 *
 * - Cadenas CRUDAS, no objetos parseados. El contenedor nunca conoce el esquema
 *   de ningún módulo; `esquemas` guarda con qué versión se escribió cada clave
 *   para que abrir() avise ANTES de desplegar qué módulos saldrán en blanco.
 * - desplegar() es REEMPLAZO, no fusión: borra las claves de proyecto que el
 *   fichero no trae. Si no, abrir la obra B dejaría vivos los sobres de la A.
 * - desplegar() FILTRA lo que entra contra la tabla de claves. Un `.concreta`
 *   manipulado no puede escribir `concreta-ai-settings` (la clave BYOK) ni nada
 *   que no sea de proyecto. Los ficheros circulan por correo: no son confiables.
 * - Una clave por obra (`concreta-proyecto-<id>`) y un índice ligero
 *   (`concreta-proyectos`): guardar escribe UNA clave, y los recientes se
 *   pintan leyendo KB, no megas. `repararIndice()` reconstruye el índice desde
 *   las claves si divergen.
 * - La obra vive SÓLO en la raíz del fichero: `concreta-obra` no entra en
 *   `claves`, y `nombre` es siempre `obra.denominacion`.
 * - Cambio de obra ATÓMICO con centinela (ver cambiarDeProyecto()). Sin él, un
 *   fallo de cuota a mitad deja un proyecto quimera (vigas de B, zapatas de A)
 *   indistinguible de uno legítimo, y eso se firma.
 */

import {
  CLAVE_DESPLEGANDO,
  CLAVE_INDICE_PROYECTOS,
  CLAVE_OBRA,
  CLAVE_PROYECTO_ACTIVO,
  CLAVES_PROYECTO,
  PREFIJO_PROYECTO,
  clasificarClave,
  entradaPorClave,
} from '../../data/proyectoKeys';
import { guardarObra, leerObra, normalizarObra, obraVacia, reemplazarObra, type Obra } from '../obra';
import {
  borrarClave,
  clavesAlmacenadas,
  conEscrituraLibre,
  escribirClave,
  fijarFiltroDeEscritura,
  leerClave,
  volcarPendientes,
} from '../storage/seguro';

export const FORMATO_PROYECTO = 'concreta-proyecto';
export const VERSION_CONTENEDOR = 1;

export interface ProyectoFile {
  formato: typeof FORMATO_PROYECTO;
  /** Versión del CONTENEDOR, no de los módulos. */
  v: typeof VERSION_CONTENEDOR;
  /** Identidad del proyecto: recientes, proyecto activo, clave del archivo. */
  id: string;
  /** Versión de la app que lo escribió (diagnóstico). */
  app: string;
  /** ISO 8601 de la serialización. */
  ts: string;
  /** Lo que se ve en el desplegable. SIEMPRE `obra.denominacion`; aquí sólo se cachea. */
  nombre: string;
  obra: Obra;
  /** clave de localStorage → valor CRUDO. */
  claves: Record<string, string>;
  /** clave de estado de un módulo → versión de esquema con la que se escribió. */
  esquemas: Record<string, string>;
}

export interface EntradaIndice {
  id: string;
  nombre: string;
  ts: string;
}

/** Un módulo del fichero se guardó con un esquema distinto del vivo: se abrirá en blanco. */
export interface Desajuste {
  modulo: string;
  clave: string;
  guardada: string;
  viva: string;
}

export interface ResultadoDespliegue {
  ok: boolean;
  escritas: number;
  /** Claves del fichero que NO son de proyecto: se ignoran y se cuentan. */
  descartadas: string[];
  /** Claves de proyecto vivas que el fichero no traía: borradas (reemplazo, no fusión). */
  borradas: number;
  /** Clave en la que falló la escritura, si falló. */
  falloEn?: string;
}

export type PasoCambio = 'guardar-actual' | 'archivar-destino' | 'desplegar' | 'hecho';

export interface ResultadoCambio {
  ok: boolean;
  paso: PasoCambio;
  despliegue?: ResultadoDespliegue;
  desajustes: Desajuste[];
  /** Tras un fallo al desplegar: ¿se volvió a desplegar la obra anterior? */
  recuperado?: boolean;
}

export class ErrorDeProyecto extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeProyecto';
  }
}

function versionApp(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

const RE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function nuevoId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nombreDe(obra: Obra): string {
  return obra.denominacion.trim() || 'Sin nombre';
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Serializar y desplegar
// ---------------------------------------------------------------------------

/** Las claves de proyecto que hay vivas ahora mismo en el almacén. */
function clavesVivas(): string[] {
  return clavesAlmacenadas().filter((k) => clasificarClave(k) === 'proyecto');
}

/** ¿Hay algo guardado que pertenezca a un proyecto? (Para pedir nombre antes de perderlo.) */
export function hayTrabajoVivo(): boolean {
  return clavesVivas().length > 0;
}

/**
 * Un proyecto vacío con esa obra. Desplegarlo deja la app en blanco.
 *
 * Admite sólo la denominación —es como nació, y como lo llaman «Guardar» y
 * «Exportar», que piden un campo— o la obra entera, que es lo que manda el
 * diálogo de obra nueva desde 2026-09-12: si la provincia se escribe al crear
 * la obra, los módulos de acciones ya arrancan con su emplazamiento.
 */
export function proyectoNuevo(inicial: string | Partial<Obra> = ''): ProyectoFile {
  const obra = typeof inicial === 'string' ? { ...obraVacia(), denominacion: inicial } : { ...obraVacia(), ...inicial };
  return {
    formato: FORMATO_PROYECTO,
    v: VERSION_CONTENEDOR,
    id: nuevoId(),
    app: versionApp(),
    ts: new Date().toISOString(),
    nombre: nombreDe(obra),
    obra,
    claves: {},
    esquemas: {},
  };
}

/**
 * Envasa el estado vivo. Vuelca antes la cola diferida: lo tecleado en los
 * últimos 300 ms también es proyecto.
 */
export function serializar(id: string = proyectoActivo() ?? nuevoId()): ProyectoFile {
  volcarPendientes();
  const claves: Record<string, string> = {};
  for (const k of clavesVivas()) {
    const v = leerClave(k);
    if (v !== null) claves[k] = v;
  }
  const esquemas: Record<string, string> = {};
  for (const e of CLAVES_PROYECTO) {
    if (!(e.clave in claves)) continue;
    const guardada = e.claveVersion !== null ? claves[e.claveVersion] : undefined;
    esquemas[e.clave] = guardada ?? e.versionViva;
  }
  const obra = leerObra() ?? obraVacia();
  return {
    formato: FORMATO_PROYECTO,
    v: VERSION_CONTENEDOR,
    id,
    app: versionApp(),
    ts: new Date().toISOString(),
    nombre: nombreDe(obra),
    obra,
    claves,
    esquemas,
  };
}

/** Qué módulos del fichero se abrirían en blanco por haberse guardado con otro esquema. */
export function desajustesDeEsquema(p: ProyectoFile): Desajuste[] {
  const out: Desajuste[] = [];
  for (const [clave, guardada] of Object.entries(p.esquemas)) {
    const e = entradaPorClave(clave);
    if (!e) continue;
    if (guardada !== e.versionViva) out.push({ modulo: e.modulo, clave, guardada, viva: e.versionViva });
  }
  return out;
}

/**
 * Escribe el fichero sobre el almacén vivo. REEMPLAZO: lo que el fichero no
 * trae, se borra; pero sólo después de que TODO lo que trae se haya escrito.
 * Si una escritura falla, se para ahí y no se borra nada: la obra anterior
 * sigue entera bajo lo escrito a medias, y el centinela (si lo hay) lo delata.
 */
export function desplegar(p: ProyectoFile): ResultadoDespliegue {
  // Lo que esté pendiente es de la obra anterior: al almacén ANTES de pisarlo,
  // nunca después. FUERA de `conEscrituraLibre` a propósito: si esta pestaña se
  // ha quedado desfasada, lo pendiente pertenece a una obra que ya no es la
  // activa, y el guardia lo descarta, que es justo lo que debe pasar.
  volcarPendientes();
  // El contenedor SÍ escribe claves de obra: es quien las cambia. El guardia de
  // la pestaña desfasada no puede aplicársele —abrir otra obra desde una
  // pestaña desfasada no escribiría nada y dejaría la anterior a medio borrar.
  return conEscrituraLibre(() => {
    const descartadas: string[] = [];
    const entrantes: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(p.claves)) {
      if (clasificarClave(k) === 'proyecto' && typeof v === 'string') entrantes.push([k, v]);
      else descartadas.push(k);
    }
    const vivasAntes = clavesVivas();
    let escritas = 0;
    for (const [k, v] of entrantes) {
      if (!escribirClave(k, v)) return { ok: false, escritas, descartadas, borradas: 0, falloEn: k };
      escritas++;
    }
    // La obra es una escritura más, y va ANTES del borrado como las demás: si
    // no cabe, se para aquí con la obra anterior entera debajo. Dar `ok: true`
    // sin haberla escrito dejaba las claves de B con la obra de A en la
    // cabecera de todos sus documentos.
    // (No cuenta en `escritas`: eso son las claves del bloque `claves`, y la
    // obra viaja en la raíz del fichero.)
    if (!reemplazarObra(p.obra)) return { ok: false, escritas, descartadas, borradas: 0, falloEn: CLAVE_OBRA };

    const traidas = new Set(entrantes.map(([k]) => k));
    let borradas = 0;
    for (const k of vivasAntes) {
      if (traidas.has(k)) continue;
      borrarClave(k);
      borradas++;
    }
    return { ok: true, escritas, descartadas, borradas };
  });
}

// ---------------------------------------------------------------------------
// El archivo local: una clave por obra + índice ligero
// ---------------------------------------------------------------------------

const claveDe = (id: string) => `${PREFIJO_PROYECTO}${id}`;

function leerIndice(): EntradaIndice[] {
  const raw = leerClave(CLAVE_INDICE_PROYECTOS);
  if (!raw) return [];
  try {
    const p: unknown = JSON.parse(raw);
    if (!esObjeto(p) || !Array.isArray(p.proyectos)) return [];
    return p.proyectos.filter(
      (e): e is EntradaIndice =>
        esObjeto(e) && typeof e.id === 'string' && typeof e.nombre === 'string' && typeof e.ts === 'string',
    );
  } catch {
    return [];
  }
}

function escribirIndice(lista: EntradaIndice[]): boolean {
  return escribirClave(CLAVE_INDICE_PROYECTOS, JSON.stringify({ v: 1, proyectos: lista }));
}

/** Recientes, el más nuevo primero. Lee sólo el índice. */
export function listar(): EntradaIndice[] {
  return [...leerIndice()].sort((a, b) => b.ts.localeCompare(a.ts));
}

/** Escribe el proyecto en SU clave y lo pone el primero del índice. */
export function guardar(p: ProyectoFile): boolean {
  if (!escribirClave(claveDe(p.id), JSON.stringify(p))) return false;
  const resto = leerIndice().filter((e) => e.id !== p.id);
  const ok = escribirIndice([{ id: p.id, nombre: p.nombre, ts: p.ts }, ...resto]);
  avisarProyectos();
  return ok;
}

/** Guarda la obra abierta (la activa) con el estado vivo. `null` si no hay activa o no cupo. */
export function guardarActual(): ProyectoFile | null {
  const id = proyectoActivo();
  if (id === null) return null;
  const p = serializar(id);
  return guardar(p) ? p : null;
}

/**
 * El trabajo vivo pasa a ser una obra nueva con esa denominación, y queda como
 * activa. Es la creación perezosa: la app no pide obra hasta que hace falta
 * guardar, exportar o meter algo en el anejo.
 */
export function guardarComoNueva(denominacion: string): ProyectoFile | null {
  guardarObra({ denominacion });
  const p = serializar(nuevoId());
  if (!guardar(p)) return null;
  fijarProyectoActivo(p.id);
  return p;
}

/** Claves del fichero que NO son de proyecto: `desplegar()` las ignorará. Para decirlo antes de abrir. */
export function clavesDescartables(p: ProyectoFile): string[] {
  return Object.keys(p.claves).filter((k) => clasificarClave(k) !== 'proyecto');
}

export function cargar(id: string): ProyectoFile | null {
  const raw = leerClave(claveDe(id));
  if (!raw) return null;
  try {
    return validar(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function borrar(id: string): boolean {
  borrarClave(claveDe(id));
  if (proyectoActivo() === id) fijarProyectoActivo(null);
  const ok = escribirIndice(leerIndice().filter((e) => e.id !== id));
  avisarProyectos();
  return ok;
}

/**
 * Reconstruye el índice desde las claves `concreta-proyecto-<id>` si divergen
 * (una escritura del índice que falló, un fichero corrupto…). `true` si hubo
 * que reescribirlo.
 */
export function repararIndice(): boolean {
  const reales: EntradaIndice[] = [];
  for (const k of clavesAlmacenadas()) {
    if (!k.startsWith(PREFIJO_PROYECTO) || k === CLAVE_PROYECTO_ACTIVO) continue;
    const raw = leerClave(k);
    if (!raw) continue;
    try {
      const p = validar(JSON.parse(raw));
      reales.push({ id: p.id, nombre: p.nombre, ts: p.ts });
    } catch {
      // Un archivo corrupto no entra en el índice; la clave se deja para no destruir nada.
    }
  }
  const actual = leerIndice();
  const igual =
    actual.length === reales.length &&
    actual.every((e) => reales.some((r) => r.id === e.id && r.nombre === e.nombre && r.ts === e.ts));
  if (igual) return false;
  escribirIndice(reales);
  return true;
}

// ---------------------------------------------------------------------------
// Fichero: validar e importar
// ---------------------------------------------------------------------------

/** Valida un objeto ya parseado. Lanza `ErrorDeProyecto` con un mensaje para el usuario. */
export function validar(bruto: unknown): ProyectoFile {
  if (!esObjeto(bruto)) throw new ErrorDeProyecto('El fichero no contiene un proyecto de Concreta.');
  if (bruto.formato !== FORMATO_PROYECTO) throw new ErrorDeProyecto('El fichero no es un proyecto de Concreta (falta la cabecera).');
  if (bruto.v !== VERSION_CONTENEDOR) {
    throw new ErrorDeProyecto(`El fichero es de una versión del formato (${String(bruto.v)}) que esta app no sabe leer.`);
  }
  if (typeof bruto.id !== 'string' || !RE_ID.test(bruto.id) || bruto.id === 'activo') {
    throw new ErrorDeProyecto('El identificador del proyecto no es válido.');
  }
  if (!esObjeto(bruto.claves)) throw new ErrorDeProyecto('El fichero no trae el bloque de claves.');
  const claves: Record<string, string> = {};
  for (const [k, v] of Object.entries(bruto.claves)) if (typeof v === 'string') claves[k] = v;
  const esquemas: Record<string, string> = {};
  if (esObjeto(bruto.esquemas)) {
    for (const [k, v] of Object.entries(bruto.esquemas)) if (typeof v === 'string') esquemas[k] = v;
  }
  const obra = normalizarObra(bruto.obra);
  return {
    formato: FORMATO_PROYECTO,
    v: VERSION_CONTENEDOR,
    id: bruto.id,
    app: typeof bruto.app === 'string' ? bruto.app : '',
    ts: typeof bruto.ts === 'string' ? bruto.ts : new Date().toISOString(),
    nombre: nombreDe(obra),
    obra,
    claves,
    esquemas,
  };
}

/** Texto de un `.concreta.json` → `ProyectoFile` validado. Lanza `ErrorDeProyecto`. */
export function importar(texto: string): ProyectoFile {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new ErrorDeProyecto('El fichero no es JSON válido.');
  }
  return validar(bruto);
}

// ---------------------------------------------------------------------------
// Proyecto activo (esta máquina) y esta pestaña
// ---------------------------------------------------------------------------

/**
 * El id con el que ESTA pestaña cargó (o el último que fijó ella misma). Si el
 * activo de la máquina cambia desde otra pestaña, ésta está desfasada: muestra
 * la obra anterior y no debe guardar. Se inicializa al cargar el módulo, no en
 * un inicializador de React: el compilador de React ya rompió ese patrón aquí.
 */
let idDeEstaPestana: string | null = leerClave(CLAVE_PROYECTO_ACTIVO);
const oyentesActivo = new Set<() => void>();

export function proyectoActivo(): string | null {
  return leerClave(CLAVE_PROYECTO_ACTIVO);
}

export function idAbiertoEnEstaPestana(): string | null {
  return idDeEstaPestana;
}

function avisarProyectos(): void {
  for (const fn of oyentesActivo) fn();
}

export function fijarProyectoActivo(id: string | null): void {
  // Primero anotar el id de esta pestaña y luego escribir: la escritura puede
  // disparar oyentes (en jsdom, `storage` salta en la misma ventana) y una
  // instantánea tomada entre medias diría que esta pestaña está desfasada.
  idDeEstaPestana = id;
  if (id === null) borrarClave(CLAVE_PROYECTO_ACTIVO);
  else escribirClave(CLAVE_PROYECTO_ACTIVO, id);
  avisarProyectos();
}

/** ¿Otra pestaña ha cambiado la obra activa desde que ésta cargó? */
export function pestanaDesfasada(): boolean {
  return proyectoActivo() !== idDeEstaPestana;
}

/** Las claves que pertenecen a la obra abierta: el estado de los módulos, sus satélites, los sobres y la obra. */
function esDeLaObra(clave: string): boolean {
  return clave === CLAVE_OBRA || clasificarClave(clave) === 'proyecto';
}

/**
 * Cierra la escritura de las claves de obra mientras esta pestaña esté
 * desfasada. Lo llama `main.tsx` al arrancar.
 *
 * Sin esto, la banda de aviso era una recomendación que la propia app
 * incumplía: con Vigas montado y otra pestaña abriendo otra obra, el siguiente
 * teclazo escribía la viga de la obra vieja en la clave, que ya es de la nueva,
 * y el «Guardar» de la otra pestaña la archivaba dentro. Las preferencias (tema,
 * unidades) y la infraestructura del contenedor siguen escribiéndose: no son de
 * la obra, y el contenedor es justamente quien arregla la situación.
 */
export function vigilarPestanaDesfasada(): void {
  fijarFiltroDeEscritura((clave) => !esDeLaObra(clave) || !pestanaDesfasada());
}

export interface EstadoActivo {
  readonly activo: string | null;
  readonly desfasada: boolean;
}

let instantanea: EstadoActivo = { activo: idDeEstaPestana, desfasada: false };

/** Instantánea estable (misma referencia mientras no cambie nada) para `useSyncExternalStore`. */
export function instantaneaActivo(): EstadoActivo {
  const activo = proyectoActivo();
  const desfasada = activo !== idDeEstaPestana;
  if (activo !== instantanea.activo || desfasada !== instantanea.desfasada) instantanea = { activo, desfasada };
  return instantanea;
}

let instantaneaLista: { crudo: string | null; lista: EntradaIndice[] } = { crudo: null, lista: [] };

/** Los recientes como instantánea estable: sólo cambia de referencia si cambia el índice guardado. */
export function instantaneaRecientes(): EntradaIndice[] {
  const crudo = leerClave(CLAVE_INDICE_PROYECTOS);
  if (crudo !== instantaneaLista.crudo) instantaneaLista = { crudo, lista: listar() };
  return instantaneaLista.lista;
}

/**
 * Avisa cuando cambia el activo o el archivo: desde esta pestaña (guardar,
 * borrar, fijar), desde otra (`storage`) o al volver a ella (`focus`).
 */
export function suscribirProyectoActivo(fn: () => void): () => void {
  oyentesActivo.add(fn);
  const alCambiar = (e: StorageEvent) => {
    if (e.key === null || e.key === CLAVE_PROYECTO_ACTIVO || e.key === CLAVE_INDICE_PROYECTOS) fn();
  };
  window.addEventListener('storage', alCambiar);
  window.addEventListener('focus', fn);
  return () => {
    oyentesActivo.delete(fn);
    window.removeEventListener('storage', alCambiar);
    window.removeEventListener('focus', fn);
  };
}

// ---------------------------------------------------------------------------
// Cambio de obra atómico, y su centinela
// ---------------------------------------------------------------------------

export interface Centinela {
  /** Obra que estaba abierta (null si no había proyecto). */
  de: string | null;
  /** Obra que se estaba desplegando. */
  a: string;
  ts: string;
}

export function despliegueInterrumpido(): Centinela | null {
  const raw = leerClave(CLAVE_DESPLEGANDO);
  if (!raw) return null;
  try {
    const c: unknown = JSON.parse(raw);
    if (!esObjeto(c) || typeof c.a !== 'string') return null;
    return { de: typeof c.de === 'string' ? c.de : null, a: c.a, ts: typeof c.ts === 'string' ? c.ts : '' };
  } catch {
    return null;
  }
}

function redesplegarArchivado(id: string): boolean {
  const p = cargar(id);
  return p !== null && desplegar(p).ok;
}

/**
 * Cambia la obra abierta por `destino`, en este orden y no en otro:
 *
 *  1. Volcar y guardar la obra actual en su clave. Así la A nunca se pierde.
 *  2. Archivar el destino (si venía de fichero, ya es un reciente) y escribir
 *     el centinela `concreta-desplegando`.
 *  3. Escribir las claves del destino, ya filtradas.
 *  4. Sólo si (3) fue bien, borrar las claves de proyecto que el destino no trae.
 *  5. Fijar el activo y borrar el centinela.
 *
 * Quien llama RECARGA la página después: en una PWA con todo el estado en
 * localStorage, la recarga es el remount correcto y completo. Si (3) falla, se
 * intenta volver a desplegar la obra anterior desde su archivo; si tampoco,
 * el centinela se queda y `repararAlArrancar()` lo intentará en la próxima carga.
 */
export function cambiarDeProyecto(destino: ProyectoFile, opciones: { guardarActual?: boolean } = {}): ResultadoCambio {
  const { guardarActual = true } = opciones;
  const desajustes = desajustesDeEsquema(destino);
  const idActual = proyectoActivo();

  if (guardarActual && idActual !== null && idActual !== destino.id) {
    if (!guardar(serializar(idActual))) return { ok: false, paso: 'guardar-actual', desajustes };
  }
  if (!guardar(destino)) return { ok: false, paso: 'archivar-destino', desajustes };

  const centinela: Centinela = { de: idActual, a: destino.id, ts: new Date().toISOString() };
  escribirClave(CLAVE_DESPLEGANDO, JSON.stringify(centinela));

  const despliegue = desplegar(destino);
  if (!despliegue.ok) {
    const recuperado = idActual !== null && idActual !== destino.id && redesplegarArchivado(idActual);
    if (recuperado) borrarClave(CLAVE_DESPLEGANDO);
    return { ok: false, paso: 'desplegar', despliegue, desajustes, recuperado };
  }

  fijarProyectoActivo(destino.id);
  borrarClave(CLAVE_DESPLEGANDO);
  return { ok: true, paso: 'hecho', despliegue, desajustes };
}

export interface InformeArranque {
  indiceReparado: boolean;
  recuperacion: null | { centinela: Centinela; resultado: 'destino' | 'origen' | 'fallido' };
}

let ultimoInforme: InformeArranque | null = null;

/**
 * Al arrancar la app, antes de renderizar: repara el índice si diverge y, si
 * hay un centinela, vuelve a desplegar la obra que se estaba abriendo (o, si
 * su archivo no está, la anterior). Un despliegue a medias no puede quedarse
 * como si fuera legítimo.
 */
export function repararAlArrancar(): InformeArranque {
  const indiceReparado = repararIndice();
  const centinela = despliegueInterrumpido();
  if (centinela === null) {
    ultimoInforme = { indiceReparado, recuperacion: null };
    return ultimoInforme;
  }
  let resultado: 'destino' | 'origen' | 'fallido' = 'fallido';
  if (redesplegarArchivado(centinela.a)) {
    resultado = 'destino';
    fijarProyectoActivo(centinela.a);
  } else if (centinela.de !== null && redesplegarArchivado(centinela.de)) {
    resultado = 'origen';
    fijarProyectoActivo(centinela.de);
  }
  if (resultado !== 'fallido') borrarClave(CLAVE_DESPLEGANDO);
  ultimoInforme = { indiceReparado, recuperacion: { centinela, resultado } };
  return ultimoInforme;
}

/** Lo que hizo `repararAlArrancar()` en esta carga, para que la interfaz lo cuente. */
export function informeDeArranque(): InformeArranque | null {
  return ultimoInforme;
}

/** Sólo para tests: olvida el id de esta pestaña, los oyentes, el informe y el guardia. */
export function _reiniciarProyectoParaTests(): void {
  idDeEstaPestana = leerClave(CLAVE_PROYECTO_ACTIVO);
  instantanea = { activo: idDeEstaPestana, desfasada: false };
  oyentesActivo.clear();
  ultimoInforme = null;
  fijarFiltroDeEscritura(null);
}
