// Test del adaptador calcSlope con el WORKER MOCKEADO (Pyodide no corre en jsdom).
// Verifica que: (a) se re-corre POR CHECK con los parámetros minorados correctos
// y se CACHEAN las corridas por terna γ (sin repetir motor), (b) la tabla de
// checks varía con context/situación/su (Phase 2: tabla completa), (c) la fila
// sísmica es NEUTRA sin re-correr el motor, (d) el FoS base/run es el de la
// corrida característica, (e) la meta de trazabilidad se rellena. El cálculo real
// de PySlope lo cubren los golden tests en node.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Captura las opciones e inputs de cada corrida para aseverar minoración + cache.
const runOpts: Array<Record<string, number>> = [];
const runInputs: Array<Record<string, unknown>> = [];

vi.mock("../../lib/calculations/geotech/client", () => ({
  getPySlope: vi.fn(async () => ({
    analyze: vi.fn(async (inputsJson: string, optsJson: string) => {
      const opts = JSON.parse(optsJson) as Record<string, number>;
      const inputs = JSON.parse(inputsJson) as Record<string, unknown>;
      runOpts.push(opts);
      runInputs.push(inputs);
      // FoS menor cuando el terreno está minorado (gammaC > 1) — emula la física.
      const minored = (opts.gammaC ?? 1) > 1;
      const fos = minored ? 1.4 : 2.0;
      return JSON.stringify({
        fos,
        circle: { cx: 13.8, cy: 17.3, r: 7.8 },
        entry: { x: 7.4, y: 13 },
        exit: { x: 16.5, y: 10 },
        slices: [],
        failureProfile: [],
        groundProfile: [],
        limits: { left: 0, right: 5 },
        slicesN: 25,
        method: "bishop",
        searchCircles: [],
      });
    }),
  })),
  cancelAndRewarm: vi.fn(),
  terminatePySlope: vi.fn(),
}));

import { calcSlope } from "../../lib/calculations/geotech/slope";
import { slopeDefaults } from "../../data/defaults";
import type { SlopeInputs } from "../../data/defaults";
import manifest from "../../lib/calculations/geotech/vendor/pyslope.manifest.json";

const manifestVersion = manifest.version;

// Estrato cohesivo con su>0 (para activar el check sin drenaje #7).
const withUndrained = (over: Partial<SlopeInputs> = {}): SlopeInputs => ({
  ...slopeDefaults,
  strata: [{ ...slopeDefaults.strata[0], su: 50 }],
  ...over,
});

describe("calcSlope — adaptador Phase 2 (worker mockeado)", () => {
  beforeEach(() => {
    runOpts.length = 0;
    runInputs.length = 0;
  });

  it("re-corre por check con los parámetros minorados (base + DA3)", async () => {
    await calcSlope(slopeDefaults);
    // base (1,1,1) + DA3 (1,25/1,25/1,3). #4 ROM reusa el FoS base (cache: NO re-corre).
    expect(runOpts).toHaveLength(2);
    expect(runOpts[0]).toMatchObject({ gammaC: 1, gammaPhi: 1, loadFactor: 1 });
    expect(runOpts[1]).toMatchObject({ gammaC: 1.25, gammaPhi: 1.25, loadFactor: 1.3 });
  });

  it("excavación + persistente + sin su: #1 CTE 7.2.2.1, #3 DA3, #4 ROM, #6 sísmico neutro", async () => {
    const res = await calcSlope(slopeDefaults);
    expect(res.valid).toBe(true);
    expect(res.fos).toBe(2.0); // FoS característico (corrida base) — contrato del SVG
    expect(res.run.fos).toBe(2.0);

    const ids = res.checks.map((c) => c.id);
    expect(ids).toEqual(["fos-static", "fos-ec7-da3", "fos-rom", "fos-seismic"]);

    const [cte, ec7, rom, seismic] = res.checks;
    // #1 CTE 7.2.2.1 persistente: límite 1,5 ; FoS 2,0 → η = 0,75 → ok
    expect(cte.article).toContain("7.2.2.1");
    expect(cte.utilization).toBeCloseTo(1.5 / 2.0, 5);
    expect(cte.status).toBe("ok");
    // #3 EC7-DA3: límite 1,0 ; FoS_d 1,4 → η = 0,714 → ok
    expect(ec7.article).toContain("DA3");
    expect(ec7.utilization).toBeCloseTo(1.0 / 1.4, 5);
    expect(ec7.status).toBe("ok");
    // #4 ROM permanente: límite 1,5 ; FoS 2,0 → η = 0,75 → ok
    expect(rom.article).toContain("ROM");
    expect(rom.utilization).toBeCloseTo(1.5 / 2.0, 5);
    // #6 sísmico = fila NEUTRA, sin utilización ni corrida
    expect(seismic.status).toBe("neutral");
    expect(seismic.neutral).toBe(true);
    expect(seismic.article).toContain("Phase 3");
  });

  it("estabilidad global de cimentación: #2 Tabla 2.1 (γ_M=1,8) sustituye a #1; re-corre con γ_M", async () => {
    const res = await calcSlope({ ...slopeDefaults, context: "global-foundation" });
    const ids = res.checks.map((c) => c.id);
    expect(ids).toEqual(["fos-cte-tabla21", "fos-ec7-da3", "fos-rom", "fos-seismic"]);
    expect(ids).not.toContain("fos-static");

    // 3 corridas: base (1,1,1) + DA3 + Tabla 2.1 (1,8/1,8/1).
    expect(runOpts).toHaveLength(3);
    expect(runOpts).toContainEqual(expect.objectContaining({ gammaC: 1.8, gammaPhi: 1.8, loadFactor: 1 }));

    const t21 = res.checks[0];
    expect(t21.article).toContain("Tabla 2.1");
    // FoS_d (minorado) 1,4 vs umbral 1,0 → η = 0,714
    expect(t21.utilization).toBeCloseTo(1.0 / 1.4, 5);
  });

  it("extraordinaria: γ_M=1,2 en Tabla 2.1 y límites accidentales en #1/#4", async () => {
    const exc = await calcSlope({ ...slopeDefaults, situation: "extraordinary" });
    // #1 CTE 7.2.2.1 extraord.: límite 1,1 ; FoS 2,0 → η = 0,55
    expect(exc.checks[0].utilization).toBeCloseTo(1.1 / 2.0, 5);
    // #4 ROM accidental: límite 1,1
    expect(exc.checks.find((c) => c.id === "fos-rom")!.utilization).toBeCloseTo(1.1 / 2.0, 5);

    runOpts.length = 0;
    const glob = await calcSlope({ ...slopeDefaults, context: "global-foundation", situation: "extraordinary" });
    expect(runOpts).toContainEqual(expect.objectContaining({ gammaC: 1.2, gammaPhi: 1.2, loadFactor: 1 }));
    expect(glob.checks[0].article).toContain("Tabla 2.1");
  });

  it("ROM #4 varía con la situación transitoria (límite 1,3)", async () => {
    const res = await calcSlope({ ...slopeDefaults, situation: "transient" });
    const rom = res.checks.find((c) => c.id === "fos-rom")!;
    // FoS 2,0 vs límite 1,3 → η = 0,65
    expect(rom.utilization).toBeCloseTo(1.3 / 2.0, 5);
  });

  it("sin drenaje (#7) solo aparece si algún estrato tiene su>0; re-corre con φ=0, c=su", async () => {
    // Sin su>0 → no aparece.
    const dry = await calcSlope(slopeDefaults);
    expect(dry.checks.map((c) => c.id)).not.toContain("fos-undrained");

    // Con su>0 → aparece y re-corre con inputs transformados (φ=0, c=su), opts neutras.
    runOpts.length = 0;
    runInputs.length = 0;
    const res = await calcSlope(withUndrained());
    const ids = res.checks.map((c) => c.id);
    expect(ids).toEqual(["fos-static", "fos-ec7-da3", "fos-rom", "fos-undrained", "fos-seismic"]);

    // base (1,1,1) + DA3 + undrained (1,1,1 con inputs distintos) = 3 corridas.
    expect(runOpts).toHaveLength(3);
    // La 3ª corrida es la sin-drenaje: opts neutras + estrato transformado.
    const undrainedInputs = runInputs[2] as { strata: Array<{ phi: number; c: number; su: number }> };
    expect(undrainedInputs.strata[0].phi).toBe(0);
    expect(undrainedInputs.strata[0].c).toBe(50); // c = su
    expect(runOpts[2]).toMatchObject({ gammaC: 1, gammaPhi: 1, loadFactor: 1 });

    const und = res.checks.find((c) => c.id === "fos-undrained")!;
    expect(und.article).toContain("4.2.3.1");
  });

  it("cachea corridas de igual terna γ: ROM (#4) NO añade una corrida extra", async () => {
    await calcSlope(slopeDefaults);
    // #1 y #4 leen ambos el FoS base; solo hay 1 corrida característica (cache).
    const neutralRuns = runOpts.filter(
      (o) => o.gammaC === 1 && o.gammaPhi === 1 && o.loadFactor === 1,
    );
    expect(neutralRuns).toHaveLength(1);
  });

  it("propaga el método seleccionado (fellenius) al motor en todas las corridas", async () => {
    await calcSlope({ ...slopeDefaults, method: "fellenius" });
    // El adaptador serializa los inputs tal cual → `method` viaja a cada corrida
    // (base + DA3), de modo que todas las comprobaciones usan el método elegido.
    expect(runInputs.length).toBeGreaterThan(0);
    for (const inp of runInputs) {
      expect(inp.method).toBe("fellenius");
    }
  });

  it("rellena la meta de trazabilidad (versión motor + hashes)", async () => {
    const res = await calcSlope(slopeDefaults);
    expect(res.engine.pyslopeVersion).toBe(manifestVersion);
    expect(res.engine.patchHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.engine.inputsHash).toMatch(/^[0-9a-f]+$/);
    expect(res.engine.mesh.slices).toBeGreaterThanOrEqual(10);
  });
});
