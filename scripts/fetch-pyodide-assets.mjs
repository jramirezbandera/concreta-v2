// Pobla public/pyodide/ con el runtime Pyodide self-hosted que carga el Web
// Worker del módulo de taludes (geotech/pyslope.worker.ts), para que la PWA
// funcione OFFLINE sin pegar a ningún CDN en runtime (eng-review §2.1 / §11.4).
//
// El paquete npm `pyodide` trae el core (wasm + stdlib + lock) pero NO los wheels
// de paquetes (numpy se baja del CDN por defecto). Aquí copiamos el core desde
// node_modules y descargamos SOLO el wheel de numpy (sin deps transitivas) del
// CDN de Pyodide pinneado a la versión instalada. Idempotente: salta si ya está
// (usa --force para re-bajar). Se ejecuta en predev/prebuild.

import { createRequire } from "node:module";
import { mkdir, copyFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYODIDE_DIR = dirname(require.resolve("pyodide/package.json"));
const OUT_DIR = join(ROOT, "public", "pyodide");
const FORCE = process.argv.includes("--force");

const pkg = require("pyodide/package.json");
const lock = require("pyodide/pyodide-lock.json");
const CDN = `https://cdn.jsdelivr.net/pyodide/v${pkg.version}/full`;

// Core mínimo: motor + stdlib + lock (el lock describe los paquetes disponibles).
const CORE_FILES = [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

// Paquetes que el worker carga localmente. numpy NO tiene deps (numpy-only).
const PACKAGES = ["numpy"];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyCore() {
  for (const f of CORE_FILES) {
    const dest = join(OUT_DIR, f);
    if (!FORCE && (await exists(dest))) continue;
    await copyFile(join(PYODIDE_DIR, f), dest);
    console.log(`  copied  ${f}`);
  }
}

async function downloadPackages() {
  for (const name of PACKAGES) {
    const entry = lock.packages[name];
    if (!entry) throw new Error(`paquete '${name}' no está en pyodide-lock.json`);
    const file = entry.file_name;
    const dest = join(OUT_DIR, file);
    if (!FORCE && (await exists(dest))) continue;
    const url = `${CDN}/${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    console.log(`  fetched ${file} (${(buf.length / 1048576).toFixed(1)} MB)`);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`pyodide ${pkg.version} → public/pyodide/`);
  await copyCore();
  await downloadPackages();
  console.log("done.");
}

main().catch((err) => {
  console.error("fetch-pyodide-assets failed:", err.message);
  process.exit(1);
});
