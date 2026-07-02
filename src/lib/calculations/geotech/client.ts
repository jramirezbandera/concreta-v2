// Singleton del worker de PySlope, cacheado entre navegaciones (NO se termina al
// desmontar la ruta — re-arrancar Pyodide cuesta segundos). La cancelación real
// es terminate-and-recreate: matar el worker a media corrida + re-warm en
// segundo plano (eng-review §9.2 #1; un requestId no basta porque Pyodide es
// síncrono y no se puede interrumpir desde fuera).

import * as Comlink from "comlink";
import type { SlopeWorkerApi } from "./pyslope.worker";

/** Superficie del worker que consume el adaptador (slope.ts). Estructuralmente
 *  igual que Comlink.Remote<SlopeWorkerApi>, pero es un wrapper local: registra
 *  cada `analyze` en vuelo para poder RECHAZARLA en terminatePySlope() —
 *  worker.terminate() mata el puerto sin avisar a Comlink y sus promesas
 *  pendientes quedarían colgadas para siempre (p.ej. el await del export PDF). */
export interface SlopeApi {
  ready(): Promise<void>;
  analyze(inputsJson: string, optsJson: string): Promise<string>;
}

let worker: Worker | null = null;
let apiPromise: Promise<SlopeApi> | null = null;
let warmReady = false; // true cuando un boot ha resuelto y el worker sigue vivo.
// Rechazadores de las corridas en vuelo del worker ACTUAL. terminatePySlope()
// hace swap del set antes de rechazar, así las corridas lanzadas contra el
// worker nuevo (post-rewarm) no se ven afectadas por un terminate viejo.
let pendingRejects = new Set<(e: Error) => void>();

function spawn(): Promise<SlopeApi> {
  worker = new Worker(new URL("./pyslope.worker.ts", import.meta.url), { type: "module" });
  const remote = Comlink.wrap<SlopeWorkerApi>(worker);
  const api: SlopeApi = {
    ready: () => remote.ready(),
    analyze: (inputsJson, optsJson) =>
      new Promise<string>((resolve, reject) => {
        pendingRejects.add(reject);
        remote.analyze(inputsJson, optsJson).then(
          (v) => {
            pendingRejects.delete(reject);
            resolve(v);
          },
          (e) => {
            pendingRejects.delete(reject);
            reject(e as Error);
          },
        );
      }),
  };
  // Si el boot RECHAZA (blip de red en los ~16 MB, fallo al spawnear), NO dejar
  // la promesa rechazada cacheada: limpiar worker/apiPromise para que el
  // siguiente getPySlope() (precarga, Calcular o Reintentar) arranque un worker
  // fresco y reintente de verdad. Sin esto, un fallo transitorio envenena todas
  // las corridas hasta recargar la página (eng-review P1).
  // El boot también se registra en pendingRejects: ready() es otra llamada
  // Comlink y un terminate a media descarga la dejaría colgada igual que a un
  // analyze (p.ej. Cancelar durante el cold-start con un export PDF esperando).
  const p = new Promise<SlopeApi>((resolve, reject) => {
    pendingRejects.add(reject);
    remote.ready().then(
      () => {
        pendingRejects.delete(reject);
        if (apiPromise === p) warmReady = true;
        resolve(api);
      },
      (e) => {
        pendingRejects.delete(reject);
        reject(e as Error);
      },
    );
  });
  apiPromise = p;
  p.catch(() => {
    if (apiPromise === p) {
      warmReady = false;
      worker?.terminate();
      worker = null;
      apiPromise = null;
    }
  });
  return p;
}

/** Devuelve SIEMPRE la misma instancia (arrancándola si hace falta). */
export function getPySlope(): Promise<SlopeApi> {
  return apiPromise ?? spawn();
}

/** ¿Hay un worker ya arrancado y listo? Permite a la UI no mostrar "preparando
 *  motor" al re-montar el módulo con el singleton ya caliente. */
export function isWarm(): boolean {
  return warmReady;
}

/** Mata el worker (aborta cualquier corrida en curso) y RECHAZA las promesas de
 *  las corridas en vuelo — sin esto quedarían pendientes para siempre y un await
 *  aguas arriba (p.ej. ensureResult del export PDF) se colgaría hasta recargar. */
export function terminatePySlope(): void {
  warmReady = false;
  worker?.terminate();
  worker = null;
  apiPromise = null;
  const rejects = pendingRejects;
  pendingRejects = new Set();
  for (const reject of rejects) reject(new Error("Cálculo cancelado"));
}

/** Cancelación: termina el worker y re-calienta uno nuevo en segundo plano para
 *  que el siguiente "Calcular" no pague el cold-start completo. */
export function cancelAndRewarm(): void {
  terminatePySlope();
  void getPySlope();
}
