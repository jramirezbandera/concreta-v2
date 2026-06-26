// Test del hook del solver async (useSlopeSolver). client.ts y slope.ts van
// mockeados (Pyodide no corre en jsdom). Cubre los caminos ASYNC que los tests
// DOM no ven (eng-review P2 + voz externa):
//   • precarga DIFERIDA al montar → engineReady
//   • Calcular antes del warm → engineState 'loading'
//   • retry tras un boot rechazado → se recupera (regresión P1)
//   • token de generación: un warm OBSOLETO que resuelve tras cancel() NO
//     marca engineReady (carrera señalada por la voz externa).
//
// `requestIdleCallback` se stubea con una cola manual: la precarga no dispara
// hasta que el test la "flushea", lo que da control determinista del orden.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getPySlope: vi.fn(),
  cancelAndRewarm: vi.fn(),
  isWarm: vi.fn(() => false),
  calcSlope: vi.fn(),
}));

vi.mock("../../lib/calculations/geotech/client", () => ({
  getPySlope: mocks.getPySlope,
  cancelAndRewarm: mocks.cancelAndRewarm,
  isWarm: mocks.isWarm,
}));
vi.mock("../../lib/calculations/geotech/slope", () => ({
  calcSlope: mocks.calcSlope,
}));

import { useSlopeSolver } from "../../features/slope-stability/useSlopeSolver";
import { slopeDefaults } from "../../data/defaults";

const api = {} as never;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let idleCbs: Array<() => void>;
const flushIdle = () => {
  const cbs = idleCbs;
  idleCbs = [];
  cbs.forEach((c) => c());
};

beforeEach(() => {
  idleCbs = [];
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
    idleCbs.push(cb);
    return idleCbs.length;
  });
  vi.stubGlobal("cancelIdleCallback", () => {});
  mocks.getPySlope.mockReset();
  mocks.cancelAndRewarm.mockReset();
  mocks.isWarm.mockReset();
  mocks.isWarm.mockReturnValue(false);
  mocks.calcSlope.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("useSlopeSolver — precarga + engineReady", () => {
  it("precarga DIFERIDA al montar: engineReady pasa a true tras el warm", async () => {
    mocks.getPySlope.mockResolvedValue(api);
    const { result } = renderHook(() => useSlopeSolver(slopeDefaults, true));

    expect(result.current.engineReady).toBe(false);
    expect(mocks.getPySlope).not.toHaveBeenCalled(); // diferido: aún no arranca

    await act(async () => {
      flushIdle();
    });
    await waitFor(() => expect(result.current.engineReady).toBe(true));
    expect(mocks.getPySlope).toHaveBeenCalledTimes(1);
  });

  it("si el motor ya está caliente (isWarm), arranca ready sin diferir", () => {
    mocks.isWarm.mockReturnValue(true);
    const { result } = renderHook(() => useSlopeSolver(slopeDefaults, true));
    expect(result.current.engineReady).toBe(true);
    expect(idleCbs.length).toBe(0); // no programó precarga diferida
  });

  it("Calcular antes del warm muestra 'loading' y luego 'ready'", async () => {
    const boot = deferred<typeof api>();
    mocks.getPySlope.mockReturnValue(boot.promise);
    mocks.calcSlope.mockResolvedValue({ fos: 1.5 } as never);

    const { result } = renderHook(() => useSlopeSolver(slopeDefaults, true));
    act(() => result.current.calculate());
    expect(result.current.engineState).toBe("loading");

    await act(async () => {
      boot.resolve(api);
    });
    await waitFor(() => expect(result.current.engineState).toBe("ready"));
  });

  it("retry tras un boot RECHAZADO se recupera (regresión P1)", async () => {
    mocks.getPySlope
      .mockRejectedValueOnce(new Error("boot fail"))
      .mockResolvedValue(api);
    mocks.calcSlope.mockResolvedValue({ fos: 1.5 } as never);

    const { result } = renderHook(() => useSlopeSolver(slopeDefaults, true));
    // No flusheamos la precarga → el 1er getPySlope lo dispara Calcular.
    await act(async () => result.current.calculate());
    await waitFor(() => expect(result.current.engineState).toBe("error"));

    // Reintentar = calculate de nuevo → getPySlope #2 resuelve → ready.
    await act(async () => result.current.calculate());
    await waitFor(() => expect(result.current.engineState).toBe("ready"));
  });

  it("token de generación: un warm OBSOLETO que resuelve tras cancel() NO marca engineReady", async () => {
    const d1 = deferred<typeof api>(); // worker viejo (preload)
    const d2 = deferred<typeof api>(); // worker nuevo (post-cancel)
    mocks.getPySlope.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);

    const { result } = renderHook(() => useSlopeSolver(slopeDefaults, true));
    await act(async () => {
      flushIdle(); // preload → getPySlope #1 (d1, pendiente)
    });
    expect(result.current.engineReady).toBe(false);

    // cancel ANTES de que resuelva el preload → ++generación + re-warm (getPySlope #2 = d2).
    act(() => result.current.cancel());
    expect(result.current.engineReady).toBe(false);

    // el preload OBSOLETO resuelve → NO debe marcar listo (gen no coincide).
    await act(async () => {
      d1.resolve(api);
    });
    expect(result.current.engineReady).toBe(false);

    // el warm ACTUAL (post-cancel) resuelve → ahora sí.
    await act(async () => {
      d2.resolve(api);
    });
    await waitFor(() => expect(result.current.engineReady).toBe(true));
  });
});
