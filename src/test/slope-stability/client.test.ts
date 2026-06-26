// Test del singleton del worker (client.ts). Comlink y Worker van mockeados
// (jsdom no arranca module-workers). Verifica el RETRY RESILIENTE (eng-review P1):
// un boot que RECHAZA no debe quedar cacheado — el siguiente getPySlope() arranca
// un worker fresco y reintenta de verdad (si no, un blip transitorio envenena
// todas las corridas hasta recargar la página).

import { describe, it, expect, vi, beforeEach } from "vitest";

const readyMock = vi.fn<() => Promise<void>>();

vi.mock("comlink", () => ({
  // wrap() devuelve la "api" remota; solo usamos ready().
  wrap: () => ({ ready: readyMock }),
}));

// jsdom no tiene module workers: stub mínimo (constructor + terminate).
class FakeWorker {
  terminate(): void {}
}
vi.stubGlobal("Worker", FakeWorker);

import { getPySlope, isWarm, terminatePySlope } from "../../lib/calculations/geotech/client";

describe("client getPySlope — boot resiliente", () => {
  beforeEach(() => {
    terminatePySlope(); // resetea worker/apiPromise/warmReady entre tests
    readyMock.mockReset();
  });

  it("un boot RECHAZADO no queda cacheado: el siguiente getPySlope reintenta y resuelve", async () => {
    readyMock
      .mockRejectedValueOnce(new Error("boot fail"))
      .mockResolvedValueOnce(undefined);

    await expect(getPySlope()).rejects.toThrow("boot fail");
    expect(isWarm()).toBe(false);

    // 2º intento: apiPromise se reseteó en el catch → spawnea fresco y resuelve.
    await expect(getPySlope()).resolves.toBeDefined();
    expect(isWarm()).toBe(true);
    expect(readyMock).toHaveBeenCalledTimes(2);
  });

  it("cachea el worker caliente: getPySlope repetido no re-arranca", async () => {
    readyMock.mockResolvedValue(undefined);
    const a = await getPySlope();
    const b = await getPySlope();
    expect(a).toBe(b);
    expect(readyMock).toHaveBeenCalledTimes(1);
    expect(isWarm()).toBe(true);
  });

  it("terminatePySlope deja isWarm() en false (cold)", async () => {
    readyMock.mockResolvedValue(undefined);
    await getPySlope();
    expect(isWarm()).toBe(true);
    terminatePySlope();
    expect(isWarm()).toBe(false);
  });
});
