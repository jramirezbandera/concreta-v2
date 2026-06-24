// Test del adaptador calcSlope con el WORKER MOCKEADO (Pyodide no corre en jsdom).
// Verifica que: (a) se re-corre por check con los parámetros minorados correctos,
// (b) se arman 2 CheckRow con la utilización η = límite/FoS y el estado correcto,
// (c) la meta de trazabilidad (versión/hash) se rellena. El cálculo real de
// PySlope lo cubren los golden tests en node.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Captura las opciones de cada corrida para aseverar la minoración por-check.
const runOpts: Array<Record<string, number>> = [];

vi.mock("../../lib/calculations/geotech/client", () => ({
  getPySlope: vi.fn(async () => ({
    analyze: vi.fn(async (_inputsJson: string, optsJson: string) => {
      const opts = JSON.parse(optsJson) as Record<string, number>;
      runOpts.push(opts);
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
      });
    }),
  })),
  cancelAndRewarm: vi.fn(),
  terminatePySlope: vi.fn(),
}));

import { calcSlope } from "../../lib/calculations/geotech/slope";
import { slopeDefaults } from "../../data/defaults";

describe("calcSlope — adaptador (worker mockeado)", () => {
  beforeEach(() => {
    runOpts.length = 0;
  });

  it("re-corre por check: característica (sin minorar) + EC7-DA3 (M2+A2)", async () => {
    await calcSlope(slopeDefaults);
    expect(runOpts).toHaveLength(2);
    // 1ª corrida característica
    expect(runOpts[0].gammaC).toBe(1);
    expect(runOpts[0].gammaPhi).toBe(1);
    expect(runOpts[0].loadFactor).toBe(1);
    // 2ª corrida DA3: c'/1,25, tanφ'/1,25, cargas ×1,3
    expect(runOpts[1].gammaC).toBe(1.25);
    expect(runOpts[1].gammaPhi).toBe(1.25);
    expect(runOpts[1].loadFactor).toBe(1.3);
  });

  it("arma 2 checks core con η = límite/FoS y estado correcto", async () => {
    const res = await calcSlope(slopeDefaults);
    expect(res.valid).toBe(true);
    expect(res.fos).toBe(2.0); // FoS característico (corrida base)
    expect(res.checks).toHaveLength(2);

    const [cte, ec7] = res.checks;
    // CTE 7.2.2.1 persistente: límite 1,5 ; FoS 2,0 → η = 0,75 → ok
    expect(cte.article).toContain("7.2.2.1");
    expect(cte.utilization).toBeCloseTo(1.5 / 2.0, 5);
    expect(cte.status).toBe("ok");
    // EC7-DA3: límite 1,0 ; FoS_d 1,4 → η = 0,714 → ok
    expect(ec7.article).toContain("DA3");
    expect(ec7.utilization).toBeCloseTo(1.0 / 1.4, 5);
    expect(ec7.status).toBe("ok");
  });

  it("rellena la meta de trazabilidad (versión motor + hashes)", async () => {
    const res = await calcSlope(slopeDefaults);
    expect(res.engine.pyslopeVersion).toBe("1.4.0");
    expect(res.engine.patchHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.engine.inputsHash).toMatch(/^[0-9a-f]+$/);
    expect(res.engine.mesh.slices).toBeGreaterThanOrEqual(10);
  });

  it("el límite estático varía con la situación de proyecto", async () => {
    const extra = await calcSlope({ ...slopeDefaults, situation: "extraordinary" });
    // FoS 2,0 vs límite 1,1 → η = 0,55
    expect(extra.checks[0].utilization).toBeCloseTo(1.1 / 2.0, 5);
  });
});
