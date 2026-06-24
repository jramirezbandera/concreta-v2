// Vendoriza PySlope (MIT, © 2022 Jesse Bonanno) dentro del repo para ejecutarlo
// en Pyodide con runtime SOLO-numpy (eng-review §9.2 #3/#4, §1.5, §11.5).
//
// Qué hace (idempotente, dev-only — se ejecuta al fijar/bumpear versión):
//   1. Descarga el wheel de PySlope pinneado desde PyPI.
//   2. Extrae SOLO los 4 módulos del cálculo (no plotting/docs/tests).
//   3. Parchea __init__.py para soltar `_version` (versioneer usa git/subprocess,
//      inviable en Pyodide) → versión hardcodeada.
//   4. Escribe NOTICE (atribución MIT) + un manifest con versión + hash del árbol
//      vendorizado (la trazabilidad del PDF y el golden test usan este hash; si el
//      vendor deriva, el golden falla).
//
// Requiere Python en PATH SOLO para descomprimir el wheel (python -m zipfile).
// No afecta al build ni al runtime de la app — los .py extraídos se versionan.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PINNED_VERSION = "1.4.0";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = join(ROOT, "src", "lib", "calculations", "geotech", "vendor");
const PKG_DIR = join(VENDOR_DIR, "pyslope");

// Solo el cálculo: motor + validación + utilidades + paquete. NO cli/_version/
// docs/examples/tests/graphs (plotting y demo no se ejecutan).
const KEEP = ["pyslope.py", "data_validation.py", "utilities.py"];

// __init__ pristino arrastra `_version` (versioneer). Lo reemplazamos por uno
// mínimo que solo re-exporta la API pública y hardcodea la versión.
const PATCHED_INIT = `# Vendored from PySlope ${PINNED_VERSION} (MIT, (c) 2022 Jesse Bonanno).
# PATCH: _version (versioneer/git) eliminado — no aplica en Pyodide. Ver NOTICE.
from pyslope.pyslope import Material, Udl, LineLoad, Slope

__version__ = "${PINNED_VERSION}"
__all__ = ["Material", "Udl", "LineLoad", "Slope"]
`;

async function pypiWheelUrl(version) {
  const res = await fetch(`https://pypi.org/pypi/pyslope/${version}/json`);
  if (!res.ok) throw new Error(`PyPI ${version} → ${res.status}`);
  const data = await res.json();
  const wheel = data.urls.find((u) => u.packagetype === "bdist_wheel");
  if (!wheel) throw new Error(`no wheel for pyslope ${version}`);
  return wheel.url;
}

async function sha256OfDir(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".py")).sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f);
    h.update(await readFile(join(dir, f)));
  }
  return h.digest("hex");
}

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "vendor-pyslope-"));
  try {
    const url = await pypiWheelUrl(PINNED_VERSION);
    console.log(`pyslope ${PINNED_VERSION} ← ${url}`);
    const whl = join(tmp, "pyslope.whl");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch wheel → ${res.status}`);
    await writeFile(whl, Buffer.from(await res.arrayBuffer()));

    const ext = join(tmp, "ext");
    execFileSync("python", ["-m", "zipfile", "-e", whl, ext], { stdio: "inherit" });

    await rm(PKG_DIR, { recursive: true, force: true });
    await mkdir(PKG_DIR, { recursive: true });

    const license = await readFile(join(ext, `pyslope-${PINNED_VERSION}.dist-info`, "licenses", "LICENSE.txt"), "utf8");

    for (const f of KEEP) {
      const src = await readFile(join(ext, "pyslope", f));
      await writeFile(join(PKG_DIR, f), src);
      console.log(`  vendored pyslope/${f}`);
    }
    await writeFile(join(PKG_DIR, "__init__.py"), PATCHED_INIT);
    console.log("  patched  pyslope/__init__.py (dropped _version)");
    await writeFile(join(PKG_DIR, "LICENSE.txt"), license);

    const patchHash = await sha256OfDir(PKG_DIR);
    const manifest = {
      package: "pyslope",
      version: PINNED_VERSION,
      license: "MIT",
      copyright: "Copyright (c) 2022, Jesse Bonanno",
      source: url,
      kept: [...KEEP, "__init__.py"],
      patch: "Replaced __init__.py to drop the versioneer `_version` import (git/subprocess unavailable in Pyodide); version hardcoded.",
      runtime: "numpy-only via sys.modules stubs for tqdm/colour/plotly (see stubs.py) — pyslope sources are otherwise unmodified.",
      patchHash,
      generatedBy: "scripts/vendor-pyslope.mjs",
    };
    await writeFile(join(VENDOR_DIR, "pyslope.manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    const notice = `Concreta — third-party notices
================================

PySlope
-------
This product vendors source files from PySlope (${PINNED_VERSION}), a 2D slope
stability library, executed in-browser via Pyodide.

  Homepage:  https://github.com/JesseBonanno/PySlope
  License:   MIT
  ${manifest.copyright}

Vendored files (src/lib/calculations/geotech/vendor/pyslope/):
  pyslope.py, data_validation.py, utilities.py  — unmodified
  __init__.py                                   — patched (see pyslope.manifest.json)

Vendor tree SHA-256: ${patchHash}

The plotting paths (plotly/tqdm/colour) are never executed: Concreta consumes
only the numeric results and renders its own SVG. Those imports are satisfied by
lightweight stubs at runtime (numpy-only). The full MIT license text is preserved
in vendor/pyslope/LICENSE.txt.
`;
    await writeFile(join(ROOT, "NOTICE"), notice);
    console.log(`  wrote    NOTICE + pyslope.manifest.json`);
    console.log(`vendor tree sha256: ${patchHash}`);
    console.log("done.");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("vendor-pyslope failed:", err.message);
  process.exit(1);
});
