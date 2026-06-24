// Golden test del MOTOR (proyecto node). Valida el mapeo SlopeInputs → PySlope de
// ANALYZE_PY contra slopeDefaults: forma del contrato, geometría de dovelas
// (yBase ≤ yTop, nº correcto) y que la re-corrida EC7-DA3 (terreno minorado +
// cargas mayoradas) da un FoS MENOR que el característico. Complementa
// pyslope.golden.test.ts (que fija el FoS del README).

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { STUBS_PY, PYSLOPE_MODULES, PYSLOPE_FS_ROOT } from "./vendor/stubs";
import { ANALYZE_PY } from "./pyslopeAnalyze";
import { slopeDefaults } from "../../../data/defaults";

const VENDOR_PKG = join(process.cwd(), "src/lib/calculations/geotech/vendor/pyslope");
const PUBLIC_PYODIDE = join(process.cwd(), "public/pyodide");

interface Run {
  fos: number;
  circle: { cx: number; cy: number; r: number };
  entry: { x: number; y: number };
  exit: { x: number; y: number };
  slices: { x: number; xL: number; xR: number; yTop: number; yBase: number }[];
  failureProfile: { x: number; y: number }[];
  groundProfile: { x: number; y: number }[];
  slicesN: number;
}

describe("ANALYZE_PY — mapeo SlopeInputs → PySlope", () => {
  let py: PyodideInterface;
  const analyze = (opts: Record<string, number>): Run => {
    const fn = py.globals.get("_analyze") as (a: string, b: string) => string;
    const json = fn(JSON.stringify(slopeDefaults), JSON.stringify({ slices: 25, iterations: 1000, ...opts }));
    return JSON.parse(json) as Run;
  };

  beforeAll(async () => {
    py = await loadPyodide();
    const numpyWheel = readdirSync(PUBLIC_PYODIDE).find((f) => f.startsWith("numpy") && f.endsWith(".whl"));
    if (!numpyWheel) throw new Error("numpy wheel ausente — corre `bun run pyodide:assets`");
    await py.loadPackage(join(PUBLIC_PYODIDE, numpyWheel).replaceAll("\\", "/"));
    py.runPython(STUBS_PY);
    py.FS.mkdirTree(`${PYSLOPE_FS_ROOT}/pyslope`);
    for (const f of PYSLOPE_MODULES) {
      py.FS.writeFile(`${PYSLOPE_FS_ROOT}/pyslope/${f}`, readFileSync(join(VENDOR_PKG, f), "utf8"));
    }
    py.runPython(`import sys; sys.path.insert(0, ${JSON.stringify(PYSLOPE_FS_ROOT)})`);
    py.runPython(ANALYZE_PY);
  });

  it("produce un FoS característico físicamente razonable para los defaults", () => {
    const r = analyze({ gammaC: 1, gammaPhi: 1, loadFactor: 1 });
    expect(Number.isFinite(r.fos)).toBe(true);
    expect(r.fos).toBeGreaterThan(0.5);
    expect(r.fos).toBeLessThan(10);
    expect(r.circle.r).toBeGreaterThan(0);
  });

  it("emite el contrato geométrico completo con dovelas coherentes", () => {
    const r = analyze({ gammaC: 1, gammaPhi: 1, loadFactor: 1 });
    expect(r.slices).toHaveLength(25);
    expect(r.slicesN).toBe(25);
    expect(r.groundProfile).toHaveLength(4);
    expect(r.failureProfile.length).toBeGreaterThan(10);
    // La base de cada dovela queda por debajo (o igual) del terreno.
    for (const s of r.slices) {
      expect(s.yBase).toBeLessThanOrEqual(s.yTop + 1e-6);
      expect(s.xR).toBeGreaterThan(s.xL);
    }
  });

  it("la verificación EC7-DA3 minora el FoS respecto al característico", () => {
    const base = analyze({ gammaC: 1, gammaPhi: 1, loadFactor: 1 });
    const da3 = analyze({ gammaC: 1.25, gammaPhi: 1.25, loadFactor: 1.3 });
    expect(da3.fos).toBeLessThan(base.fos);
    expect(da3.fos).toBeGreaterThan(0);
  });
});
