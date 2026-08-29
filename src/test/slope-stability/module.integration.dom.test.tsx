// Smoke de INTEGRACIÓN del módulo completo de estabilidad de taludes (T4.3).
//
// Monta `SlopeStabilityModule` (features/slope-stability/index.tsx, ya con el
// conmutador de vistas + enlace de T4.1) en jsdom con el SOLVER MOCKEADO
// (vi.mock de useSlopeSolver) → Pyodide/worker NUNCA arrancan. El mock es un hook
// React real con estado: empieza sin resultado y, al pulsar "Calcular",
// transiciona a `ready` con un SlopeResult fijo (varios checks + dovelas con
// física + searchCircles). Así probamos el cableado del módulo sin duplicar lo
// que ya cubren adapter.test.ts (adaptador) / serialize.test.ts (lz-string) /
// results.dom.test.tsx (render del panel).
//
// Cubre (plan FASE 4 T4.3):
//   1. el módulo renderiza sin throw y muestra la geometría EN VIVO (vista 1)
//      antes de calcular;
//   2. conmutador de vistas "Sección"/"Diagramas" → al pasar a "Diagramas" se
//      monta SlopeSearchSVG (malla de centros) en el lienzo de pantalla;
//   3. botón "Calcular" → con el solver devolviendo un SlopeResult aparecen los
//      checks y, en "Diagramas", la malla refleja searchCircles;
//   4. enlace: el Topbar invoca onCopyLink → se escribe una URL `?model=` en el
//      portapapeles (navigator.clipboard.writeText mockeado);
//   5. routing/registro: la entrada `concreta-slope-stability` existe en
//      moduleRegistry con route '/geotec/taludes' y group 'Geotecnia'.
//
// NOTA: el módulo monta SIEMPRE clones PDF (mode='pdf', left:-9999px) de AMBAS
// vistas para el export (T4.2). Por eso los SVG de la vista 2 existen en el DOM
// aun sin pulsar "Diagramas"; para probar el conmutador de PANTALLA acotamos las
// queries al lienzo central (no a los clones ocultos) y nos apoyamos en el
// aria-pressed de los botones del switcher (exclusivo del conmutador de vistas).

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, cleanup, act } from "@testing-library/react";
import { UnitSystemProvider } from "../../lib/units/UnitSystemProvider";
import { ThemeProvider } from "../../lib/theme/ThemeProvider";
import type { SlopeResult } from "../../lib/calculations/geotech/types";
import type { CheckRow } from "../../lib/calculations/types";

// ── SlopeResult mock: tabla de checks completa (uno neutro) + dovelas con física
//    + searchCircles para la malla de la vista 2. ───────────────────────────────
const mockChecks: CheckRow[] = [
  { id: "fos-static",  description: "FoS estático — talud de excavación", valueStr: "1.54", limitStr: "≥ 1.50", utilization: 0.97, status: "warn", article: "CTE DB-SE-C art. 7.2.2.1" },
  { id: "fos-ec7-da3", description: "Verificación EC7 — Enfoque DA3",      valueStr: "1.20", limitStr: "≥ 1.00", utilization: 0.83, status: "warn", article: "UNE-EN 1997-1 · DA3" },
  { id: "fos-rom",     description: "FoS estático — carreteras / ROM",     valueStr: "1.54", limitStr: "≥ 1.50", utilization: 0.97, status: "warn", article: "Guía Cimentaciones Carretera / ROM 0.5-05" },
  { id: "fos-seismic", description: "Análisis sísmico pseudo-estático · requiere Phase 3", value: "", limit: "", utilization: 0, status: "neutral", article: "NCSE-02 (Phase 3)", neutral: true, tag: "DIFERIDO" },
];

const MOCK_RESULT: SlopeResult = {
  valid: true,
  fos: 1.54,
  run: {
    fos: 1.54,
    circle: { cx: 5, cy: 8, r: 7 },
    entry: { x: 0, y: 5 },
    exit: { x: 6, y: 0 },
    slices: [
      { x: 1.0, xL: 0.5, xR: 1.5, yTop: 5.0, yBase: 2.0, alpha: 0.5236, weight: 42.5, u: 12.3 },
      { x: 2.0, xL: 1.5, xR: 2.5, yTop: 4.5, yBase: 1.0, alpha: 0.2618, weight: 60.1, u: 0 },
    ],
    failureProfile: [
      { x: 0, y: 5 }, { x: 2, y: 2 }, { x: 4, y: 1 }, { x: 6, y: 0 },
    ],
    groundProfile: [
      { x: 0, y: 5 }, { x: 3, y: 5 }, { x: 8, y: 0 }, { x: 12, y: 0 },
    ],
    limits: { left: 0, right: 12 },
    slicesN: 25,
    method: "bishop",
    searchCircles: [
      { cx: 5, cy: 8, r: 7, fos: 1.54 },
      { cx: 6, cy: 9, r: 8, fos: 2.1 },
      { cx: 4, cy: 7, r: 6, fos: 1.2 },
    ],
    rigidBlock: null,
    keptCircles: null,
    totalCircles: null,
  },
  checks: mockChecks,
  engine: {
    pyslopeVersion: "0.9.0",
    pyodideVersion: "314.0.0",
    patchHash: "abc123",
    inputsHash: "deadbeef",
    mesh: { iterations: 1000, slices: 25 },
  },
};

// ── Mock del solver: hook React con estado real por FASE. `calculate()` pasa a
//    'ready'/MOCK_RESULT; un test puede forzar 'loading' vía `solverControl.setPhase`
//    (expuesto por vi.hoisted) para ejercitar el overlay del lienzo. No toca
//    getPySlope/worker: Pyodide jamás arranca en jsdom. `engineReady:true` (motor
//    fingido caliente) → sin chip "Preparando motor" en el smoke. ───────────────
const solverControl = vi.hoisted(() => ({ setPhase: null as null | ((p: string) => void) }));
vi.mock("../../features/slope-stability/useSlopeSolver", () => ({
  useSlopeSolver: () => {
    const [phase, setPhase] = React.useState("idle");
    solverControl.setPhase = setPhase;
    return {
      engineState: phase,
      result: phase === "ready" ? MOCK_RESULT : null,
      error: null,
      isStale: false,
      engineReady: true,
      calculate: () => setPhase("ready"),
      cancel: () => setPhase("idle"),
      ensureResult: async () => MOCK_RESULT,
    };
  },
}));

import { SlopeStabilityModule } from "../../features/slope-stability";
import { moduleRegistry } from "../../data/moduleRegistry";

function renderModule() {
  return render(
    <ThemeProvider>
      <UnitSystemProvider>
        <SlopeStabilityModule />
      </UnitSystemProvider>
    </ThemeProvider>,
  );
}

// Aria-labels de cada vista SVG (su <svg role="img" aria-label=…>).
const VIEW1_LABEL = /Estabilidad de talud — sección/i;
const VIEW2_LABEL = /malla de centros|mapa de FoS/i;

/** Botones del conmutador de vistas (los únicos con aria-pressed). El de
 *  pantalla "Diagramas" comparte texto con el MobileTabBar, así que lo
 *  desambiguamos por aria-pressed. */
function viewSwitchButton(label: RegExp): HTMLElement {
  const candidates = screen
    .getAllByRole("button", { name: label })
    .filter((b) => b.hasAttribute("aria-pressed"));
  expect(candidates.length).toBe(1);
  return candidates[0];
}

/** Las dos vistas SVG de pantalla viven en el lienzo central .canvas-dot-grid;
 *  las clones PDF cuelgan de un wrapper aria-hidden a left:-9999px. Devuelve el
 *  contenedor del lienzo de pantalla para acotar las queries y no matchear los
 *  clones ocultos. */
function screenCanvas(container: HTMLElement): HTMLElement {
  const el = container.querySelector(".canvas-dot-grid");
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
  // URL limpia: el módulo lee ?model= al montar; evita arrastrar estado entre tests.
  window.history.replaceState({}, "", "/geotec/taludes");
});

afterEach(() => cleanup());

describe("SlopeStabilityModule — smoke de integración (T4.3, solver mockeado)", () => {
  it("1 · renderiza sin throw y muestra la geometría EN VIVO antes de calcular", () => {
    const { container } = renderModule();
    // Botón Calcular presente; aún sin resultado → hint de pre-cálculo.
    expect(screen.getByRole("button", { name: /^Calcular$/i })).toBeInTheDocument();
    expect(screen.getByText(/Pulsa/i)).toBeInTheDocument();
    // La vista 1 (sección) se monta en el lienzo de pantalla con geometría viva
    // (no requiere Calcular). En el lienzo NO debe estar aún la malla (vista 2).
    const canvas = within(screenCanvas(container));
    expect(canvas.getByLabelText(VIEW1_LABEL)).toBeInTheDocument();
    expect(canvas.queryByLabelText(VIEW2_LABEL)).not.toBeInTheDocument();
  });

  it("2 · conmutador Sección/Diagramas monta SlopeSearchSVG (malla) en pantalla", () => {
    const { container } = renderModule();
    const seccion = viewSwitchButton(/^Sección$/i);
    const diagramas = viewSwitchButton(/^Malla FoS$/i);

    // Por defecto: vista 1 activa.
    expect(seccion).toHaveAttribute("aria-pressed", "true");
    expect(diagramas).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(diagramas);

    expect(diagramas).toHaveAttribute("aria-pressed", "true");
    expect(seccion).toHaveAttribute("aria-pressed", "false");
    // El lienzo de pantalla muestra ahora la malla (vista 2), no la sección.
    const canvas = within(screenCanvas(container));
    expect(canvas.getByLabelText(VIEW2_LABEL)).toBeInTheDocument();
    expect(canvas.queryByLabelText(VIEW1_LABEL)).not.toBeInTheDocument();
  });

  it("3 · Calcular → aparecen los checks (y la malla refleja searchCircles)", () => {
    const { container } = renderModule();
    // Antes de calcular: sin tabla de checks.
    expect(screen.queryByText(/Verificación EC7/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Calcular$/i }));

    // Tras calcular: el panel de resultados pinta los checks agrupados.
    expect(screen.getByText("CTE DB-SE-C")).toBeInTheDocument();
    expect(screen.getByText("Eurocódigo 7")).toBeInTheDocument();
    expect(screen.getByText(/Verificación EC7 — Enfoque DA3/i)).toBeInTheDocument();
    // Fila sísmica neutra distinguible.
    expect(screen.getByText("DIFERIDO")).toBeInTheDocument();
    // FoS destacado presente.
    expect(screen.getAllByText("1.54").length).toBeGreaterThan(0);

    // En "Malla FoS", la malla de pantalla rotula el nº de círculos de la corrida.
    fireEvent.click(viewSwitchButton(/^Malla FoS$/i));
    const canvas = within(screenCanvas(container));
    const mesh = canvas.getByLabelText(VIEW2_LABEL);
    expect(within(mesh).getByText(/3 círculos/i)).toBeInTheDocument();
  });

  it("3b · el selector de método ofrece Fellenius (ordinario) habilitado y seleccionable", () => {
    const { container } = renderModule();
    const select = container.querySelector("#select-slope-method") as HTMLSelectElement;
    expect(select).not.toBeNull();
    // La opción Fellenius existe y ya NO está deshabilitada.
    const fellenius = within(select).getByRole("option", {
      name: /Fellenius \(ordinario\)/i,
    }) as HTMLOptionElement;
    expect(fellenius.disabled).toBe(false);
    // Seleccionarla actualiza el valor del control.
    fireEvent.change(select, { target: { value: "fellenius" } });
    expect(select.value).toBe("fellenius");
  });

  it("3c · estado 'loading' pinta el overlay de carga sobre el lienzo central", () => {
    const { container } = renderModule();
    // Fuerza el motor a 'loading' (cold-start) vía el control del mock.
    act(() => solverControl.setPhase?.("loading"));
    const canvas = within(screenCanvas(container));
    // El overlay (aria-hidden) del lienzo muestra el texto del helper centralizado.
    expect(canvas.getByText("Cargando motor de cálculo…")).toBeInTheDocument();
  });

  it("4 · Copiar enlace escribe una URL con ?model= en el portapapeles", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderModule();
    // "Copiar enlace" vive ahora dentro del menú "Ajustes" de la topbar.
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copiar enlace/i }));

    // Espera al microtask de la promesa de writeText.
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
    const url = writeText.mock.calls[0][0] as string;
    expect(url).toMatch(/[?&]model=/);
    // El payload va comprimido lz-string (no es una URL vacía).
    expect(url.split("model=")[1]?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("SlopeStabilityModule — registro/routing (T4.3)", () => {
  it("5 · concreta-slope-stability está en moduleRegistry con route '/geotec/taludes' y group 'Geotecnia'", () => {
    const entry = moduleRegistry.find((m) => m.key === "concreta-slope-stability");
    expect(entry).toBeDefined();
    expect(entry!.route).toBe("/geotec/taludes");
    expect(entry!.group).toBe("Geotecnia");
    expect(entry!.label).toBe("Taludes");
    // `shipped` lo flipará T5.2 → no lo asumimos true; solo que la clave es booleana.
    expect(typeof entry!.shipped).toBe("boolean");
  });
});
