// Test del singleton del worker (client.ts). Comlink y Worker van mockeados
// (jsdom no arranca module-workers). Verifica el RETRY RESILIENTE (eng-review P1):
// un boot que RECHAZA no debe quedar cacheado — el siguiente getPySlope() arranca
// un worker fresco y reintenta de verdad (si no, un blip transitorio envenena
// todas las corridas hasta recargar la página).

import { describe, it, expect, vi, beforeEach } from "vitest";

const readyMock = vi.fn<() => Promise<void>>();
const analyzeMock = vi.fn<() => Promise<string>>();

vi.mock("comlink", () => ({
  // wrap() devuelve la "api" remota (ready + analyze).
  wrap: () => ({ ready: readyMock, analyze: analyzeMock }),
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
    analyzeMock.mockReset();
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

  // Regresión A4 (auditoría 2026-07-01): worker.terminate() NO rechaza las
  // llamadas Comlink pendientes — quedaban colgadas para siempre y un await
  // aguas arriba (ensureResult del export PDF) se congelaba hasta recargar.
  it("terminatePySlope RECHAZA las corridas analyze en vuelo (no quedan colgadas)", async () => {
    readyMock.mockResolvedValue(undefined);
    analyzeMock.mockReturnValue(new Promise<string>(() => {})); // worker que nunca contesta
    const api = await getPySlope();
    const inflight = api.analyze("{}", "{}");
    terminatePySlope();
    await expect(inflight).rejects.toThrow("Cálculo cancelado");
  });

  it("terminatePySlope RECHAZA también un boot en vuelo (ready colgado)", async () => {
    readyMock.mockReturnValue(new Promise<void>(() => {})); // descarga eterna
    const boot = getPySlope();
    terminatePySlope();
    await expect(boot).rejects.toThrow("Cálculo cancelado");
    // Y no envenena el singleton: el siguiente getPySlope reintenta de verdad.
    readyMock.mockResolvedValue(undefined);
    await expect(getPySlope()).resolves.toBeDefined();
    expect(isWarm()).toBe(true);
  });

  it("las corridas del worker NUEVO no se ven afectadas por un terminate viejo", async () => {
    readyMock.mockResolvedValue(undefined);
    analyzeMock.mockReturnValue(new Promise<string>(() => {}));
    const api1 = await getPySlope();
    const stale = api1.analyze("{}", "{}");
    terminatePySlope(); // mata worker #1 → rechaza `stale`
    await expect(stale).rejects.toThrow("Cálculo cancelado");

    // Worker #2: su corrida sobrevive a un settle tardío del set viejo y
    // resuelve con normalidad.
    analyzeMock.mockResolvedValue('{"fos":1.5}');
    const api2 = await getPySlope();
    await expect(api2.analyze("{}", "{}")).resolves.toBe('{"fos":1.5}');
  });
});
