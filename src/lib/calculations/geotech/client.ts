// Singleton del worker de PySlope, cacheado entre navegaciones (NO se termina al
// desmontar la ruta — re-arrancar Pyodide cuesta segundos). La cancelación real
// es terminate-and-recreate: matar el worker a media corrida + re-warm en
// segundo plano (eng-review §9.2 #1; un requestId no basta porque Pyodide es
// síncrono y no se puede interrumpir desde fuera).

import * as Comlink from "comlink";
import type { SlopeWorkerApi } from "./pyslope.worker";

let worker: Worker | null = null;
let apiPromise: Promise<Comlink.Remote<SlopeWorkerApi>> | null = null;
let warmReady = false; // true cuando un boot ha resuelto y el worker sigue vivo.

function spawn(): Promise<Comlink.Remote<SlopeWorkerApi>> {
  worker = new Worker(new URL("./pyslope.worker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<SlopeWorkerApi>(worker);
  // Si el boot RECHAZA (blip de red en los ~16 MB, fallo al spawnear), NO dejar
  // la promesa rechazada cacheada: limpiar worker/apiPromise para que el
  // siguiente getPySlope() (precarga, Calcular o Reintentar) arranque un worker
  // fresco y reintente de verdad. Sin esto, un fallo transitorio envenena todas
  // las corridas hasta recargar la página (eng-review P1).
  const p = api.ready().then(() => {
    if (apiPromise === p) warmReady = true;
    return api;
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
export function getPySlope(): Promise<Comlink.Remote<SlopeWorkerApi>> {
  return apiPromise ?? spawn();
}

/** ¿Hay un worker ya arrancado y listo? Permite a la UI no mostrar "preparando
 *  motor" al re-montar el módulo con el singleton ya caliente. */
export function isWarm(): boolean {
  return warmReady;
}

/** Mata el worker (aborta cualquier corrida en curso). */
export function terminatePySlope(): void {
  warmReady = false;
  worker?.terminate();
  worker = null;
  apiPromise = null;
}

/** Cancelación: termina el worker y re-calienta uno nuevo en segundo plano para
 *  que el siguiente "Calcular" no pague el cold-start completo. */
export function cancelAndRewarm(): void {
  terminatePySlope();
  void getPySlope();
}
