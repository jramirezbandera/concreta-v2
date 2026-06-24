// Singleton del worker de PySlope, cacheado entre navegaciones (NO se termina al
// desmontar la ruta — re-arrancar Pyodide cuesta segundos). La cancelación real
// es terminate-and-recreate: matar el worker a media corrida + re-warm en
// segundo plano (eng-review §9.2 #1; un requestId no basta porque Pyodide es
// síncrono y no se puede interrumpir desde fuera).

import * as Comlink from "comlink";
import type { SlopeWorkerApi } from "./pyslope.worker";

let worker: Worker | null = null;
let apiPromise: Promise<Comlink.Remote<SlopeWorkerApi>> | null = null;

function spawn(): Promise<Comlink.Remote<SlopeWorkerApi>> {
  worker = new Worker(new URL("./pyslope.worker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<SlopeWorkerApi>(worker);
  apiPromise = api.ready().then(() => api);
  return apiPromise;
}

/** Devuelve SIEMPRE la misma instancia (arrancándola si hace falta). */
export function getPySlope(): Promise<Comlink.Remote<SlopeWorkerApi>> {
  return apiPromise ?? spawn();
}

/** Mata el worker (aborta cualquier corrida en curso). */
export function terminatePySlope(): void {
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
