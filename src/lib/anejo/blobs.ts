/**
 * El almacén de PDFs del anejo: IndexedDB, una base propia y un solo almacén.
 *
 * Por qué no `localStorage`: un PDF de cuatro páginas con figuras rasterizadas
 * pesa lo que diez proyectos enteros, y el presupuesto de ~5 MB (contado en
 * UTF-16) se comparte con todo lo demás. Y por qué aquí SÍ vale IndexedDB
 * cuando el estado de los módulos no se movió a él: este almacén no tiene
 * acoplamiento de hidratación con nadie —ningún módulo lee de aquí al montar—,
 * así que su asincronía no le cuesta un estado de carga a nadie. Es un almacén
 * nuevo y aislado, no una migración (design doc, F4).
 *
 * Los bytes se guardan como `ArrayBuffer`, no como `Blob`: el Blob dentro de
 * IndexedDB ha fallado en Safari durante años y el ArrayBuffer lo clona todo el
 * mundo. Se reconstruye el Blob al leer.
 *
 * Todo error sale como `ErrorDeBlobs` con un motivo cerrado, para que quien
 * llame pueda decir «no hay sitio» o «este navegador no guarda PDF» en vez de
 * enseñar un DOMException.
 *
 * Aquí NO se decide qué blob está vivo: eso lo sabe el índice de piezas
 * (`index.ts`), que llama a `purgarBlobs` con los ids referenciados.
 */

import { bytesDe } from './bytes';

export type MotivoFalloBlobs = 'sin-indexeddb' | 'cuota' | 'bloqueado' | 'error';

export class ErrorDeBlobs extends Error {
  readonly motivo: MotivoFalloBlobs;
  constructor(motivo: MotivoFalloBlobs, mensaje: string, causa?: unknown) {
    super(mensaje, causa === undefined ? undefined : { cause: causa });
    this.name = 'ErrorDeBlobs';
    this.motivo = motivo;
  }
}

export const NOMBRE_BD = 'concreta-anejo';
const VERSION_BD = 1;
const ALMACEN = 'pdf';

interface RegistroBlob {
  id: string;
  tipo: string;
  bytes: ArrayBuffer;
  tamano: number;
  ts: string;
}

export interface ResumenBlob {
  id: string;
  tamano: number;
  ts: string;
}

/** ¿Este navegador tiene IndexedDB? (No garantiza que deje escribir: el modo privado de algunos lo tiene y falla al abrir.) */
export function hayAlmacenDeBlobs(): boolean {
  return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
}

function fabrica(): IDBFactory {
  const f = globalThis.indexedDB;
  if (!f) throw new ErrorDeBlobs('sin-indexeddb', 'Este navegador no permite guardar los PDF del anejo.');
  return f;
}

function nombreDe(e: unknown): string {
  return typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
}

function traducir(e: unknown, contexto: string): ErrorDeBlobs {
  if (e instanceof ErrorDeBlobs) return e;
  const nombre = nombreDe(e);
  if (nombre === 'QuotaExceededError') return new ErrorDeBlobs('cuota', `No hay sitio para guardar el PDF (${contexto}).`, e);
  if (nombre === 'InvalidStateError' || nombre === 'SecurityError') {
    return new ErrorDeBlobs('sin-indexeddb', `Este navegador no permite guardar los PDF del anejo (${contexto}).`, e);
  }
  return new ErrorDeBlobs('error', `Fallo en el almacén de PDF (${contexto}).`, e);
}

let conexion: Promise<IDBDatabase> | null = null;

function soltar(p: Promise<IDBDatabase>): void {
  if (conexion === p) conexion = null;
}

/** Abre (o reutiliza) la conexión. Se suelta sola si falla o si otra pestaña la cierra. */
function abrir(): Promise<IDBDatabase> {
  if (conexion) return conexion;
  const p = new Promise<IDBDatabase>((resolver, rechazar) => {
    let peticion: IDBOpenDBRequest;
    try {
      peticion = fabrica().open(NOMBRE_BD, VERSION_BD);
    } catch (e) {
      rechazar(traducir(e, 'abrir'));
      return;
    }
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains(ALMACEN)) bd.createObjectStore(ALMACEN, { keyPath: 'id' });
    };
    peticion.onsuccess = () => {
      const bd = peticion.result;
      // Otra pestaña que suba la versión, o el usuario borrando los datos del
      // sitio: se suelta la conexión y la siguiente llamada vuelve a abrir.
      bd.onversionchange = () => {
        bd.close();
        soltar(p);
      };
      bd.onclose = () => soltar(p);
      resolver(bd);
    };
    peticion.onerror = () => rechazar(traducir(peticion.error, 'abrir'));
    peticion.onblocked = () =>
      rechazar(new ErrorDeBlobs('bloqueado', 'Otra pestaña tiene abierto el almacén de PDF con una versión anterior.'));
  });
  conexion = p;
  p.catch(() => soltar(p));
  return p;
}

/**
 * Una transacción sobre el almacén. `cuerpo` lanza sus peticiones y devuelve
 * cómo leer el resultado cuando la transacción se haya COMPLETADO: en
 * IndexedDB el `onsuccess` de un `put` llega antes de que los bytes estén
 * comprometidos, y la cuota llena aborta la transacción después.
 */
function enTransaccion<T>(
  modo: IDBTransactionMode,
  contexto: string,
  cuerpo: (almacen: IDBObjectStore) => () => T,
): Promise<T> {
  return abrir().then(
    (bd) =>
      new Promise<T>((resolver, rechazar) => {
        let tx: IDBTransaction;
        try {
          tx = bd.transaction(ALMACEN, modo);
        } catch (e) {
          // Conexión cerrada por debajo: soltarla para reabrir la próxima vez.
          conexion = null;
          rechazar(traducir(e, contexto));
          return;
        }
        let leer: () => T;
        try {
          leer = cuerpo(tx.objectStore(ALMACEN));
        } catch (e) {
          rechazar(traducir(e, contexto));
          return;
        }
        tx.oncomplete = () => resolver(leer());
        tx.onerror = () => rechazar(traducir(tx.error, contexto));
        tx.onabort = () => rechazar(traducir(tx.error, contexto));
      }),
  );
}

export async function guardarBlob(id: string, blob: Blob): Promise<void> {
  const bytes = await bytesDe(blob);
  const registro: RegistroBlob = {
    id,
    tipo: blob.type || 'application/pdf',
    bytes,
    tamano: bytes.byteLength,
    ts: new Date().toISOString(),
  };
  await enTransaccion('readwrite', 'guardar', (a) => {
    a.put(registro);
    return () => undefined;
  });
}

const esArrayBuffer = (v: unknown): v is ArrayBuffer => Object.prototype.toString.call(v) === '[object ArrayBuffer]';

export async function leerBlob(id: string): Promise<Blob | null> {
  const r = await enTransaccion<RegistroBlob | undefined>('readonly', 'leer', (a) => {
    const peticion = a.get(id) as IDBRequest<RegistroBlob | undefined>;
    return () => peticion.result;
  });
  if (!r || !esArrayBuffer(r.bytes)) return null;
  return new Blob([r.bytes], { type: r.tipo || 'application/pdf' });
}

export function borrarBlob(id: string): Promise<void> {
  return enTransaccion('readwrite', 'borrar', (a) => {
    a.delete(id);
    return () => undefined;
  });
}

/** Ids de todos los PDF guardados, sin cargar sus bytes. */
export function idsDeBlobs(): Promise<string[]> {
  return enTransaccion('readonly', 'listar', (a) => {
    const peticion = a.getAllKeys();
    return () => peticion.result.map(String);
  });
}

/** Id, tamaño y fecha de cada PDF guardado (recorre los registros: es para la pantalla del anejo, no para el arranque). */
export function listarBlobs(): Promise<ResumenBlob[]> {
  return enTransaccion('readonly', 'listar', (a) => {
    const out: ResumenBlob[] = [];
    const peticion = a.openCursor();
    peticion.onsuccess = () => {
      const c = peticion.result;
      if (!c) return;
      const r = c.value as Partial<RegistroBlob>;
      out.push({ id: String(r.id ?? c.key), tamano: typeof r.tamano === 'number' ? r.tamano : 0, ts: typeof r.ts === 'string' ? r.ts : '' });
      c.continue();
    };
    return () => out;
  });
}

/** Bytes que ocupan todos los PDF guardados. */
export async function ocupacionBlobs(): Promise<number> {
  return (await listarBlobs()).reduce((s, b) => s + b.tamano, 0);
}

/**
 * Borra los PDF cuyo id no esté en `vivos` y devuelve los borrados. Quien sabe
 * qué está vivo es el índice de piezas (de la obra abierta Y de las archivadas):
 * ver `purgarBlobsHuerfanos` en `index.ts`.
 */
export async function purgarBlobs(vivos: ReadonlySet<string>): Promise<string[]> {
  const huerfanos = (await idsDeBlobs()).filter((id) => !vivos.has(id));
  if (huerfanos.length === 0) return [];
  await enTransaccion('readwrite', 'purgar', (a) => {
    for (const id of huerfanos) a.delete(id);
    return () => undefined;
  });
  return huerfanos;
}

/** Cierra la conexión para que el siguiente test abra sobre otra `IDBFactory`. */
export function _reiniciarBlobsParaTests(): void {
  const p = conexion;
  conexion = null;
  p?.then((bd) => bd.close()).catch(() => undefined);
}
