// Golden test (proyecto Vitest **node** — Pyodide no arranca en jsdom).
//
// Reproduce el caso del README de PySlope con malla DETERMINISTA 1000/25 y asevera
// FoS = 1.5437888… (idéntico al spike Node y al pase navegador, §11.4). Es la
// puerta de no-regresión del motor: si el vendor, la versión de Pyodide o el
// bootstrap numpy-only derivan, el FoS cambia y este test falla (eng-review
// §9.2 #3, §9.7 "vendor bump → golden test").
//
// Corre 100% local/offline: numpy desde public/pyodide (wheel copiado), pyslope
// vendorizado escrito al FS de Pyodide, stubs en sys.modules (cero micropip, cero
// red). Con 2500/50 PySlope da 1.573; fijamos 1000/25 para que sea determinista.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { STUBS_PY, PYSLOPE_MODULES, PYSLOPE_FS_ROOT } from "./vendor/stubs";

const VENDOR_PKG = join(process.cwd(), "src/lib/calculations/geotech/vendor/pyslope");
const PUBLIC_PYODIDE = join(process.cwd(), "public/pyodide");

/** Caso del README de PySlope. La malla se fija aparte para el determinismo. */
const README_CASE_PY = `
from pyslope import Slope, Material, Udl, LineLoad
s = Slope(height=3, angle=30, length=None)
m1 = Material(unit_weight=20, friction_angle=45, cohesion=2, depth_to_bottom=2)
m2 = Material(20, 30, 2, 5)
s.set_materials(m1, m2)
s.set_udls(Udl(magnitude=100, offset=2, length=1), Udl(magnitude=20))
s.set_lls(LineLoad(magnitude=10, offset=3))
s.set_water_table(4)
s.set_analysis_limits(s.get_top_coordinates()[0] - 5, s.get_bottom_coordinates()[0] + 5)
s.update_analysis_options(slices=25, iterations=1000)
s.analyse_slope()
`;

/** FoS de referencia (Node == navegador == micropip). NO tocar sin bumpear vendor. */
const GOLDEN_FOS = 1.5437888294282975;

describe("PySlope golden — runtime numpy-only", () => {
  let py: PyodideInterface;

  beforeAll(async () => {
    py = await loadPyodide();
    const numpyWheel = readdirSync(PUBLIC_PYODIDE).find(
      (f) => f.startsWith("numpy") && f.endsWith(".whl"),
    );
    if (!numpyWheel) {
      throw new Error("numpy wheel ausente en public/pyodide — corre `bun run pyodide:assets`");
    }
    // Cargar numpy 100% local desde el wheel copiado en public/pyodide (el mismo
    // que sirve el navegador offline). Pyodide-node lo lee del FS por path; usar
    // barras forward evita el warning de canonicalización del nombre del wheel.
    const numpyPath = join(PUBLIC_PYODIDE, numpyWheel).replaceAll("\\", "/");
    await py.loadPackage(numpyPath);
    py.runPython("import numpy");

    // Stubs ANTES de cualquier import de pyslope, y vendor en el FS.
    py.runPython(STUBS_PY);
    py.FS.mkdirTree(`${PYSLOPE_FS_ROOT}/pyslope`);
    for (const f of PYSLOPE_MODULES) {
      py.FS.writeFile(`${PYSLOPE_FS_ROOT}/pyslope/${f}`, readFileSync(join(VENDOR_PKG, f), "utf8"));
    }
    py.runPython(`import sys; sys.path.insert(0, ${JSON.stringify(PYSLOPE_FS_ROOT)})`);
    py.runPython(README_CASE_PY);
  });

  it("reproduce el FoS de referencia con malla 1000/25", () => {
    const fos = py.runPython("float(s.get_min_FOS())") as number;
    expect(fos).toBeCloseTo(GOLDEN_FOS, 6);
  });

  it("expone geometría limpia del círculo crítico", () => {
    const circle = (py.runPython("list(s.get_min_FOS_circle())") as { toJs(): number[] }).toJs();
    const [cx, cy, r] = circle;
    expect(Number.isFinite(cx)).toBe(true);
    expect(Number.isFinite(cy)).toBe(true);
    expect(r).toBeGreaterThan(0);
  });

  it("expone los puntos de corte (entrada/salida) sobre el terreno", () => {
    const n = py.runPython("len([p for p in s.get_min_FOS_end_points()])") as number;
    expect(n).toBe(2);
  });

  it("el manifest del vendor declara la versión y el hash fijados", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "src/lib/calculations/geotech/vendor/pyslope.manifest.json"), "utf8"),
    );
    expect(manifest.version).toBe("1.4.0");
    expect(manifest.patchHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
