/// <reference lib="webworker" />
// Web Worker del módulo de taludes (PRIMER worker del repo). Arranca Pyodide
// self-hosted desde /pyodide/, monta PySlope vendorizado con runtime SOLO-numpy
// (stubs) y expone vía Comlink un cálculo que devuelve la GEOMETRÍA REAL de la
// corrida como JSON (sin fugas de PyProxy). La cancelación NO vive aquí: el hilo
// principal hace worker.terminate()+recrea (client.ts), porque Pyodide es
// síncrono y no se puede interrumpir a media corrida (eng-review §9.2 #1).

import * as Comlink from "comlink";
import type { PyodideInterface } from "pyodide";
import { STUBS_PY, PYSLOPE_FS_ROOT } from "./vendor/stubs";
import { PYSLOPE_SOURCES } from "./vendor/pyslopeFiles";
import { ANALYZE_PY } from "./pyslopeAnalyze";

const PYODIDE_BASE = "/pyodide/";

interface PyLoad {
  loadPyodide: (opts: { indexURL: string }) => Promise<PyodideInterface>;
}

let pyodide: PyodideInterface | null = null;

async function boot(): Promise<PyodideInterface> {
  // Gotcha Vite (§11.5): import('/pyodide/pyodide.mjs') literal de public/ da 500.
  // Construir la URL como expresión NO literal para que vite:import-analysis la
  // deje pasar como fetch real.
  const mjsUrl = new URL(PYODIDE_BASE + "pyodide.mjs", self.location.origin).href;
  const mod = (await import(/* @vite-ignore */ mjsUrl)) as PyLoad;
  const py = await mod.loadPyodide({ indexURL: PYODIDE_BASE });
  // numpy se resuelve a /pyodide/numpy-*.whl vía el lock en indexURL (offline).
  await py.loadPackage("numpy");
  py.runPython(STUBS_PY);
  py.FS.mkdirTree(`${PYSLOPE_FS_ROOT}/pyslope`);
  for (const [name, src] of Object.entries(PYSLOPE_SOURCES)) {
    py.FS.writeFile(`${PYSLOPE_FS_ROOT}/pyslope/${name}`, src);
  }
  py.runPython(`import sys; sys.path.insert(0, ${JSON.stringify(PYSLOPE_FS_ROOT)})`);
  py.runPython(ANALYZE_PY);
  return py;
}

const api = {
  /** Arranca Pyodide + PySlope (idempotente). El primer análisis lo dispara. */
  async ready(): Promise<void> {
    if (!pyodide) pyodide = await boot();
  },
  /** Corre UNA análisis y devuelve SlopeRun como JSON string. */
  async analyze(inputsJson: string, optsJson: string): Promise<string> {
    if (!pyodide) pyodide = await boot();
    const fn = pyodide.globals.get("_analyze");
    try {
      return fn(inputsJson, optsJson) as string;
    } finally {
      (fn as { destroy?: () => void })?.destroy?.();
    }
  },
};

export type SlopeWorkerApi = typeof api;

Comlink.expose(api);
