// REGRESIÓN — protección del modelo guardado del usuario en Taludes.
// Run: bun test src/test/slope-stability/useSlopeState.dom.test.tsx
//
// El módulo hidrata con prioridad URL (?model=) > localStorage > defaults, y
// persiste el estado 300 ms después de cada cambio. Ese efecto corría TAMBIÉN en
// el primer render, así que un enlace `?model=` pisaba para siempre el modelo
// guardado del usuario, sin aviso ni forma de deshacerlo.
//
// Mientras `?model=` era algo que sólo aparecía al compartir un enlace a
// propósito, el riesgo era teórico. Con un botón "VER TALUDES" en cada módulo de
// muro pasa a ser rutina: un usuario con un talud a medio construir lo perdía
// con un clic desde otro módulo.
//
// Regla: un modelo llegado por URL es un BORRADOR — no se persiste hasta que el
// usuario edita algo.

import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSlopeState } from "../../features/slope-stability/useSlopeState";
import { encodeShareString } from "../../features/slope-stability/serialize";
import { slopeDefaults, type SlopeInputs } from "../../data/defaults";
import { getModuleSchemaVersion } from "../../data/moduleRegistry";

const LS_KEY = "concreta-slope-stability";
const VERSION_KEY = `${LS_KEY}-v`;

/** Modelo "trabajado" del usuario, distinto de los defaults. */
const SAVED: SlopeInputs = {
  ...slopeDefaults,
  height: 12,
  angle: 41,
  strata: [
    { id: 1, type: "cohesive", thickness: 30, gamma: 19, c: 14, phi: 26, Nspt: 0, su: 0, rflim: 0 },
  ],
};

/** Modelo prefabricado que llegaría de un módulo de muro. */
const PREFAB: SlopeInputs = {
  ...slopeDefaults,
  height: 4,
  angle: 71.2,
  context: "global-foundation",
  rigidBlock: { padHeel: 0, padToe: 0.15, depth: 5 },
};

function seedStorage(model: SlopeInputs) {
  window.localStorage.setItem(LS_KEY, JSON.stringify(model));
  window.localStorage.setItem(VERSION_KEY, getModuleSchemaVersion("slope-stability"));
}

const readStorage = (): SlopeInputs | null => {
  const raw = window.localStorage.getItem(LS_KEY);
  return raw ? (JSON.parse(raw) as SlopeInputs) : null;
};

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/geotec/taludes");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSlopeState — hidratación desde ?model=", () => {
  it("carga el modelo del enlace por encima de lo guardado", () => {
    seedStorage(SAVED);
    window.history.replaceState({}, "", `/geotec/taludes?model=${encodeShareString(PREFAB)}`);

    const { result } = renderHook(() => useSlopeState());

    expect(result.current.state.height).toBe(4);
    expect(result.current.hydratedFromUrl).toBe(true);
  });

  it("REGRESIÓN: no pisa el modelo guardado si el usuario no edita nada", () => {
    seedStorage(SAVED);
    window.history.replaceState({}, "", `/geotec/taludes?model=${encodeShareString(PREFAB)}`);

    renderHook(() => useSlopeState());
    // Muy por encima del debounce de 300 ms de la persistencia.
    act(() => { vi.advanceTimersByTime(2000); });

    const stored = readStorage();
    expect(stored).not.toBeNull();
    expect(stored!.height).toBe(12);   // sigue siendo el del usuario
    expect(stored!.angle).toBe(41);
  });

  it("en cuanto el usuario edita, SÍ persiste el modelo en curso", () => {
    seedStorage(SAVED);
    window.history.replaceState({}, "", `/geotec/taludes?model=${encodeShareString(PREFAB)}`);

    const { result } = renderHook(() => useSlopeState());
    act(() => { result.current.setState({ ...PREFAB, angle: 55 }); });
    act(() => { vi.advanceTimersByTime(2000); });

    const stored = readStorage();
    expect(stored!.angle).toBe(55);
    expect(stored!.height).toBe(4);
  });

  it("limpia ?model= de la URL tras consumirlo", () => {
    window.history.replaceState({}, "", `/geotec/taludes?model=${encodeShareString(PREFAB)}`);
    renderHook(() => useSlopeState());
    expect(new URLSearchParams(window.location.search).has("model")).toBe(false);
  });
});

describe("useSlopeState — hidratación normal (sin enlace)", () => {
  it("persiste con normalidad cuando el estado viene de localStorage", () => {
    seedStorage(SAVED);

    const { result } = renderHook(() => useSlopeState());
    expect(result.current.hydratedFromUrl).toBe(false);

    act(() => { result.current.setState({ ...SAVED, angle: 33 }); });
    act(() => { vi.advanceTimersByTime(2000); });

    expect(readStorage()!.angle).toBe(33);
  });

  it("un enlace corrupto cae a lo guardado y no lo destruye", () => {
    seedStorage(SAVED);
    window.history.replaceState({}, "", "/geotec/taludes?model=basura-no-decodificable");

    const { result } = renderHook(() => useSlopeState());
    act(() => { vi.advanceTimersByTime(2000); });

    expect(result.current.state.height).toBe(12);
    expect(readStorage()!.height).toBe(12);
  });
});
