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

/** Mismo caso README sobre un Slope fresco (`sf`) corrido con el método ordinario
 *  (Fellenius). No reusa `s` para no mutar el estado que verifican los tests Bishop. */
const FELLENIUS_CASE_PY = `
sf = Slope(height=3, angle=30, length=None)
sf.set_materials(Material(unit_weight=20, friction_angle=45, cohesion=2, depth_to_bottom=2), Material(20, 30, 2, 5))
sf.set_udls(Udl(magnitude=100, offset=2, length=1), Udl(magnitude=20))
sf.set_lls(LineLoad(magnitude=10, offset=3))
sf.set_water_table(4)
sf.set_analysis_limits(sf.get_top_coordinates()[0] - 5, sf.get_bottom_coordinates()[0] + 5)
sf.update_analysis_options(slices=25, iterations=1000)
sf.analyse_slope(method='ordinary')
`;

/** FoS de referencia Bishop (Node == navegador == micropip). NO tocar sin bumpear
 *  vendor. El parche de dispatch de método dejó el camino de Bishop intacto. */
const GOLDEN_FOS = 1.5437888294282975;

/**
 * FoS de referencia Fellenius (método ordinario / sueco de dovelas) para el MISMO
 * caso README con `s.analyse_slope(method='ordinary')`. Más conservador que Bishop
 * (sin equilibrio iterativo) → siempre < GOLDEN_FOS. Capturado en la misma corrida
 * determinista 1000/25. NO tocar sin bumpear vendor.
 */
const GOLDEN_FOS_FELLENIUS = 1.2261248218518626;

/** Nº de dovelas fijado en el caso (s.update_analysis_options(slices=25,...)). */
const SLICES = 25;

/**
 * Hash del árbol vendorizado tras el fork de exposición por dovela (T1.1) + el
 * parche de dispatch de método (Bishop/Fellenius). Se regenera con
 * `node scripts/vendor-pyslope.mjs`. Si el vendor deriva, este valor cambia y el
 * golden falla (puerta de trazabilidad del PDF). El dispatch deja Bishop intacto:
 * el FoS de Bishop sigue siendo GOLDEN_FOS exacto.
 */
const GOLDEN_PATCH_HASH =
  "1213ecdac7bd58276e334ceeb980bb6ea393dc9a857930e2e9028a1374dd3a2b";

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
    py.runPython(FELLENIUS_CASE_PY);
  });

  it("reproduce el FoS de referencia con malla 1000/25", () => {
    const fos = py.runPython("float(s.get_min_FOS())") as number;
    expect(fos).toBeCloseTo(GOLDEN_FOS, 6);
  });

  it("reproduce el FoS de referencia Fellenius (método ordinario) y es < Bishop", () => {
    const fos = py.runPython("float(sf.get_min_FOS())") as number;
    expect(fos).toBeCloseTo(GOLDEN_FOS_FELLENIUS, 6);
    expect(fos).toBeLessThan(GOLDEN_FOS); // el ordinario es más conservador
  });

  it("física por dovela de Fellenius: contrato completo + u re-escalada a la base inclinada", () => {
    // method='ordinary' → U integrada sobre la base INCLINADA (slice_width/cosα),
    // que es la que entró en el FoS de Fellenius. method='bishop' → base horizontal.
    const ord = JSON.parse(
      py.runPython("import json; json.dumps(sf.get_critical_slice_data(method='ordinary'))") as string,
    ) as Record<string, number[]>;
    const bish = JSON.parse(
      py.runPython("json.dumps(sf.get_critical_slice_data(method='bishop'))") as string,
    ) as Record<string, number[]>;

    const keys = ["x", "width", "alpha", "weight", "u", "cohesion", "tan_phi"];
    for (const k of keys) {
      expect(Array.isArray(ord[k]), `${k} es array`).toBe(true);
      expect(ord[k].length, `${k}.length == nº dovelas`).toBe(SLICES);
      expect(ord[k].every((v) => Number.isFinite(v)), `${k} solo números finitos`).toBe(true);
    }

    // El caso README tiene NF (set_water_table(4)). Relación exacta por dovela:
    // u_ordinary[i] == u_bishop[i] / cos(α[i]). W y α son agnósticos del método.
    expect(ord.weight).toEqual(bish.weight);
    expect(ord.alpha).toEqual(bish.alpha);
    let strictlyGreater = 0;
    for (let i = 0; i < SLICES; i++) {
      expect(ord.u[i]).toBeCloseTo(bish.u[i] / Math.cos(ord.alpha[i]), 6);
      if (ord.u[i] > bish.u[i] + 1e-9) strictlyGreater++;
    }
    // Hay dovelas con agua e inclinación → al menos una diverge (si no, el fix
    // sería un no-op vacío y la regresión de Finding A no quedaría cubierta).
    expect(strictlyGreater).toBeGreaterThan(0);
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

  it("expone la física por dovela del círculo crítico (fork T1.1, sin sísmico)", () => {
    const data = py.runPython(
      "import json; json.dumps(s.get_critical_slice_data())",
    ) as string;
    const slices = JSON.parse(data) as Record<string, number[]>;
    const keys = ["x", "width", "alpha", "weight", "u", "cohesion", "tan_phi"];
    for (const k of keys) {
      expect(Array.isArray(slices[k]), `${k} es array`).toBe(true);
      expect(slices[k].length, `${k}.length == nº dovelas`).toBe(SLICES);
      expect(
        slices[k].every((v) => Number.isFinite(v)),
        `${k} solo números finitos`,
      ).toBe(true);
    }
    // sanity física básica: anchos positivos iguales, pesos positivos,
    // u >= 0, tan_phi > 0 (el caso del README tiene φ' > 0 en ambos estratos).
    expect(slices.width.every((b) => b > 0)).toBe(true);
    expect(slices.weight.every((w) => w > 0)).toBe(true);
    expect(slices.u.every((u) => u >= 0)).toBe(true);
    expect(slices.tan_phi.every((t) => t > 0)).toBe(true);
  });

  it("el manifest del vendor declara la versión y el hash del fork", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "src/lib/calculations/geotech/vendor/pyslope.manifest.json"), "utf8"),
    );
    expect(manifest.version).toBe("1.4.0");
    expect(manifest.patchHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.patchHash).toBe(GOLDEN_PATCH_HASH);
  });
});
