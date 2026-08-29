// Render test (jsdom) del panel de resultados de taludes (T3.3). No toca el
// worker: inyecta un `SlopeSolver` mock con un resultado ya listo (6 checks, uno
// neutro) + dovelas con física. Verifica:
//   • la tabla de checks se agrupa por bloque normativo (GroupHeader),
//   • la fila sísmica neutra se distingue (tag DIFERIDO, sin η%/barra),
//   • la "Tabla de dovelas" colapsa por defecto y expande mostrando W/α/u.

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { UnitSystemProvider } from "../../lib/units/UnitSystemProvider";
import { ThemeProvider } from "../../lib/theme/ThemeProvider";
import { SlopeResults } from "../../features/slope-stability/SlopeResults";
import type { SlopeSolver } from "../../features/slope-stability/useSlopeSolver";
import type { SlopeResult, SlopeSlice } from "../../lib/calculations/geotech/types";
import type { CheckRow } from "../../lib/calculations/types";

const checks: CheckRow[] = [
  { id: "fos-static",       description: "FoS estático — talud de excavación", valueStr: "1.54", limitStr: "≥ 1.50", utilization: 0.97, status: "warn", article: "CTE DB-SE-C art. 7.2.2.1" },
  { id: "fos-cte-tabla21",  description: "Estabilidad global de cimentación", valueStr: "1.10", limitStr: "≥ 1.00", utilization: 0.91, status: "warn", article: "CTE DB-SE-C Tabla 2.1" },
  { id: "fos-undrained",    description: "FoS sin drenaje — corto plazo",      valueStr: "1.80", limitStr: "≥ 1.50", utilization: 0.83, status: "warn", article: "CTE DB-SE-C 4.2.3.1" },
  { id: "fos-ec7-da3",      description: "Verificación EC7 — Enfoque DA3",      valueStr: "1.20", limitStr: "≥ 1.00", utilization: 0.83, status: "warn", article: "UNE-EN 1997-1 · DA3" },
  { id: "fos-rom",          description: "FoS estático — carreteras / ROM",     valueStr: "1.54", limitStr: "≥ 1.50", utilization: 0.97, status: "warn", article: "Guía Cimentaciones Carretera / ROM 0.5-05" },
  // Fila sísmica NEUTRA — sin utilización numérica.
  { id: "fos-seismic",      description: "Análisis sísmico pseudo-estático · requiere Phase 3", value: "", limit: "", utilization: 0, status: "neutral", article: "NCSE-02 (Phase 3)", neutral: true, tag: "DIFERIDO" },
];

const slices: SlopeSlice[] = [
  { x: 1.0, xL: 0.5, xR: 1.5, yTop: 5.0, yBase: 2.0, alpha: 0.5236, weight: 42.5, u: 12.3 },
  { x: 2.0, xL: 1.5, xR: 2.5, yTop: 4.5, yBase: 1.0, alpha: 0.2618, weight: 60.1, u: 0 },
  // Dovela sin física emitida por el worker → debe mostrar "—".
  { x: 3.0, xL: 2.5, xR: 3.5, yTop: 4.0, yBase: 0.5 },
];

const mockResult: SlopeResult = {
  valid: true,
  fos: 1.54,
  run: {
    fos: 1.54,
    circle: { cx: 5, cy: 8, r: 7 },
    entry: { x: 0, y: 5 },
    exit: { x: 6, y: 0 },
    slices,
    failureProfile: [],
    groundProfile: [],
    limits: { left: 0, right: 10 },
    slicesN: 3,
    method: "bishop",
    searchCircles: [],
    rigidBlock: null,
    keptCircles: null,
    totalCircles: null,
  },
  checks,
  engine: {
    pyslopeVersion: "0.9.0",
    pyodideVersion: "314.0.0",
    patchHash: "abc123",
    inputsHash: "deadbeef",
    mesh: { iterations: 1000, slices: 3 },
  },
};

const solver: SlopeSolver = {
  engineState: "ready",
  result: mockResult,
  error: null,
  isStale: false,
  engineReady: true,
  calculate: () => {},
  cancel: () => {},
  ensureResult: async () => mockResult,
};

function renderResults(solverOverride: SlopeSolver = solver) {
  return render(
    <ThemeProvider>
      <UnitSystemProvider>
        <SlopeResults solver={solverOverride} situation="persistent" />
      </UnitSystemProvider>
    </ThemeProvider>,
  );
}

describe("SlopeResults — tabla de checks agrupada + tabla de dovelas (T3.3)", () => {
  it("agrupa los checks por bloque normativo con GroupHeader", () => {
    renderResults();
    expect(screen.getByText("CTE DB-SE-C")).toBeInTheDocument();
    expect(screen.getByText("Eurocódigo 7")).toBeInTheDocument();
    expect(screen.getByText("ROM / Carreteras")).toBeInTheDocument();
    expect(screen.getByText("Sísmico")).toBeInTheDocument();
  });

  it("renderiza la fila sísmica neutra de forma distinguible (tag, sin η%)", () => {
    renderResults();
    // El tag neutro "DIFERIDO" se pinta (no un porcentaje ni CUMPLE/INCUMPLE).
    expect(screen.getByText("DIFERIDO")).toBeInTheDocument();
    expect(screen.getByText(/requiere Phase 3/i)).toBeInTheDocument();
  });

  it("mantiene el FoS destacado y la traza del motor", () => {
    renderResults();
    // "1.54" aparece en el FoS destacado y también en filas de check → varios.
    expect(screen.getAllByText("1.54").length).toBeGreaterThan(0);
    expect(screen.getByText(/PySlope 0\.9\.0/)).toBeInTheDocument();
  });

  it("muestra el método de la corrida en el disclaimer (Bishop por defecto)", () => {
    renderResults();
    expect(screen.getByText(/Bishop simplificado · circular/i)).toBeInTheDocument();
  });

  it("refleja Fellenius en el disclaimer cuando la corrida usó el método ordinario", () => {
    const felleniusSolver: SlopeSolver = {
      ...solver,
      result: { ...mockResult, run: { ...mockResult.run, method: "fellenius" } },
    };
    renderResults(felleniusSolver);
    expect(screen.getByText(/Fellenius \(ordinario\) · circular/i)).toBeInTheDocument();
  });

  it("muestra la tarjeta de carga prominente mientras el motor arranca (loading)", () => {
    const loadingSolver: SlopeSolver = {
      ...solver,
      engineState: "loading",
      result: null,
      engineReady: false,
    };
    renderResults(loadingSolver);
    // El título sale en el botón Y en la tarjeta del cuerpo.
    expect(screen.getAllByText("Cargando motor de cálculo…").length).toBeGreaterThanOrEqual(2);
    // El subtexto es exclusivo de la tarjeta → prueba la tarjeta prominente.
    expect(screen.getByText(/La primera vez tarda unos segundos/i)).toBeInTheDocument();
  });

  it("muestra la tarjeta de cálculo durante una corrida (computing)", () => {
    const computingSolver: SlopeSolver = {
      ...solver,
      engineState: "computing",
      result: null,
      engineReady: true,
    };
    renderResults(computingSolver);
    // Título en el botón Y en la tarjeta del cuerpo.
    expect(screen.getAllByText("Calculando factor de seguridad…").length).toBeGreaterThanOrEqual(2);
  });

  it("muestra el chip 'Preparando motor…' mientras precalienta en segundo plano", () => {
    const warmingSolver: SlopeSolver = {
      ...solver,
      engineState: "idle",
      result: null,
      engineReady: false,
    };
    renderResults(warmingSolver);
    expect(screen.getByText(/Preparando motor…/i)).toBeInTheDocument();
  });

  it("NO muestra el chip de precarga cuando el motor ya está listo", () => {
    const readyIdleSolver: SlopeSolver = {
      ...solver,
      engineState: "idle",
      result: null,
      engineReady: true,
    };
    renderResults(readyIdleSolver);
    expect(screen.queryByText(/Preparando motor…/i)).not.toBeInTheDocument();
  });

  it("la tabla de dovelas colapsa por defecto y expande con W/α/u", () => {
    renderResults();
    const toggle = screen.getByRole("button", { name: /Tabla de dovelas/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Colapsada: la cabecera de la tabla no está montada.
    expect(screen.queryByText("W (kN)")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Cabeceras de columna presentes.
    for (const h of ["nº", "x (m)", "b (m)", "W (kN)", "α (º)", "u (kPa)"]) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // 1 fila de cabecera + 3 dovelas.
    expect(rows).toHaveLength(4);

    // Dovela 1: nº=1 · x=1.00 · b=1.00 · W=42.5 · α=30.0º · u=12.3.
    // Columnas por posición (x y b ambos redondean a "1.00").
    const cells = within(rows[1]).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual(["1", "1.00", "1.00", "42.5", "30.0", "12.3"]);

    // Dovela 3: sin física → "—" en W/α/u.
    const thirdData = within(rows[3]);
    expect(thirdData.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});

describe("SlopeResults — unidades técnico + header contextual", () => {
  afterEach(() => window.localStorage.removeItem("unitSystem"));

  it("en técnico la tabla de dovelas convierte W (kN→Tn) y u (kPa→kg/cm²)", () => {
    window.localStorage.setItem("unitSystem", "tecnico");
    renderResults();
    fireEvent.click(screen.getByRole("button", { name: /Tabla de dovelas/i }));

    expect(screen.getByText("W (Tn)")).toBeInTheDocument();
    expect(screen.getByText("u (kg/cm²)")).toBeInTheDocument();
    expect(screen.queryByText("W (kN)")).not.toBeInTheDocument();

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // Dovela 1: W = 42.5 kN → 4.33 Tn · u = 12.3 kPa → 0.13 kg/cm². La geometría
    // (x, b en m) y α (º) no cambian de sistema.
    const cells = within(rows[1]).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual(["1", "1.00", "1.00", "4.33", "30.0", "0.13"]);
  });

  it("header en excavación: FoS característico vs límite del check fos-static", () => {
    // Solo el check de excavación (sin tabla21) — como emite slope.ts en ese contexto.
    const excavation: SlopeSolver = {
      ...solver,
      result: { ...mockResult, checks: checks.filter((c) => c.id !== "fos-cte-tabla21") },
    };
    renderResults(excavation);
    expect(screen.getByText("Factor de seguridad")).toBeInTheDocument();
    expect(screen.queryByText(/FoS de cálculo/)).not.toBeInTheDocument();
    // Límite del check gobernante (≥ 1.50) + situación en la fila destacada.
    expect(screen.getByText(/· persistente/)).toBeInTheDocument();
  });

  it("header en estabilidad global: FoS_d de Tabla 2.1 (γ_M) — no el límite de excavación", () => {
    // El mock incluye fos-cte-tabla21 → es el check CTE gobernante del header.
    renderResults();
    expect(screen.getByText("FoS de cálculo (γ_M)")).toBeInTheDocument();
    // El FoS grande es el de la corrida minorada (1.10), no el característico (1.54).
    // "1.10" también aparece en la fila del check → al menos 2 apariciones.
    expect(screen.getAllByText("1.10").length).toBeGreaterThanOrEqual(2);
  });
});
